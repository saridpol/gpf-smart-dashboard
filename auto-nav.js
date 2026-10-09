/* GPF Smart Dashboard NAV bridge
 * Loads public nav-data.json, feeds the existing dashboard's gpf-smart-nav cache,
 * and keeps the actual member account balance untouched.
 */
(() => {
  "use strict";

  const URLS = [
    "https://raw.githubusercontent.com/saridpol/gpf-smart-dashboard/main/nav-data.json",
    "./nav-data.json"
  ];
  const KEYS = ["shariah", "agg35", "agg65", "foreign"];
  const LABELS = {
    shariah: "Shariah 100%",
    agg35: "Aggressive 35",
    agg65: "Aggressive 65",
    foreign: "Foreign Equity"
  };

  const $ = (id) => document.getElementById(id);

  function valid(data) {
    return !!(
      data &&
      data.nav &&
      KEYS.every(k => Number.isFinite(Number(data.nav[k])) && Number(data.nav[k]) > 0) &&
      (data.date || data.nav_date_iso)
    );
  }

  function normalize(data) {
    return {
      date: data.date || data.nav_date_iso,
      shariah: Number(data.nav.shariah),
      agg35: Number(data.nav.agg35),
      agg65: Number(data.nav.agg65),
      foreign: Number(data.nav.foreign),
      _navStatus: data.status || (data.verified === true ? "official_page_parsed" : "fallback_latest_available"),
      _navVerified: data.verified === true,
      _navMessage: data.status_message || data.note || "",
      _navFetchedAt: data.fetched_at || data.last_fetch_attempt || "",
      _navDateIso: data.nav_date_iso || ""
    };
  }

  function dateKey(data) {
    if (data._navDateIso && /^\d{4}-\d{2}-\d{2}$/.test(data._navDateIso)) return data._navDateIso;
    const m = String(data.date || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return "";
    let year = Number(m[3]);
    if (year >= 2400) year -= 543;
    return `${year}-${String(Number(m[2])).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`;
  }

  function readCurrent() {
    try {
      const current = JSON.parse(localStorage.getItem("gpf-smart-nav") || "null");
      if (current && KEYS.every(k => Number.isFinite(Number(current[k])) && Number(current[k]) > 0)) return current;
    } catch (_) {}
    return null;
  }

  function ensureStatusPanel() {
    let panel = $("official-nav-status");
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = "official-nav-status";
    panel.style.cssText = "margin:12px 0;padding:12px 14px;border-radius:12px;border:1px solid #2c3b54;background:#141f33;color:#f5f7fb;font-size:13px;line-height:1.6";
    panel.innerHTML =
      '<strong style="display:block;margin-bottom:4px">สถานะข้อมูล NAV</strong>' +
      '<div id="official-nav-status-text">กำลังตรวจสอบข้อมูล NAV…</div>' +
      '<button id="official-nav-refresh" type="button" style="width:auto;margin-top:8px;padding:8px 12px;border-radius:9px;background:#263650;color:#e6eef9;border:1px solid #3b4d68">ตรวจสอบ NAV อีกครั้ง</button>';

    const banner = document.querySelector(".banner");
    if (banner && banner.parentNode) banner.insertAdjacentElement("afterend", panel);
    else document.querySelector(".wrap")?.prepend(panel);

    $("official-nav-refresh").addEventListener("click", () => refresh(true));
    return panel;
  }

  function setStatus(message, fallback) {
    ensureStatusPanel();
    const node = $("official-nav-status-text");
    if (node) {
      node.textContent = message;
      node.style.color = fallback ? "#ffb454" : "#9df2c8";
    }
  }

  function displayData(data, sourceName) {
    const date = data.date || data.nav_date_iso || "ไม่ระบุวันที่";
    const verified = data._navVerified === true && data._navStatus === "official_page_parsed";
    const state = verified
      ? "อัปเดตจากข้อมูล NAV ที่อ่านได้จากหน้า กบข."
      : "ใช้ NAV ล่าสุดที่บันทึกไว้ — ยังยืนยันไม่ได้ว่าเป็นข้อมูลปัจจุบัน";
    const message = data._navMessage ? " · " + data._navMessage : "";
    setStatus(`${state} · วันที่ NAV ${date} · แหล่งข้อมูล: ${sourceName}${message}`, !verified);

    const updated = $("updated");
    if (updated) {
      updated.textContent = `NAV ตามข้อมูลที่บันทึก: ${date} · ${verified ? "ตรวจข้อมูลจากหน้า กบข. แล้ว" : "ข้อมูลสำรอง/ยังไม่ยืนยัน"}`;
    }
  }

  function usePayload(payload, sourceName) {
    const normalized = normalize(payload);
    const current = readCurrent();
    const currentKey = current ? dateKey(current) : "";
    const incomingKey = dateKey(normalized);

    // Never overwrite a newer dated local NAV with older remote data.
    const chosen = current && currentKey && incomingKey && currentKey > incomingKey
      ? current
      : normalized;

    localStorage.setItem("gpf-smart-nav", JSON.stringify(chosen));

    // The existing index.html defines render(d) in its first script.
    if (typeof render === "function") {
      render(chosen);
    } else {
      ["shariah", "agg35", "agg65", "foreign"].forEach(k => {
        if ($(k)) $(k).value = Number(chosen[k]).toFixed(4);
      });
    }
    displayData(chosen, sourceName);
  }

  async function refresh(manual) {
    ensureStatusPanel();
    setStatus(manual ? "กำลังตรวจสอบข้อมูลจากแหล่งเผยแพร่ NAV…" : "กำลังโหลด NAV ล่าสุด…", false);
    let errorText = "ไม่สามารถโหลดข้อมูลได้";

    for (const url of URLS) {
      try {
        const response = await fetch(url + (url.includes("?") ? "&" : "?") + "v=" + Date.now(), {
          cache: "no-store",
          headers: { "Accept": "application/json" }
        });
        if (!response.ok) throw new Error("HTTP " + response.status);
        const payload = await response.json();
        if (!valid(payload)) throw new Error("ข้อมูล NAV ไม่ครบ 4 แผนหรือไม่มีวันที่");
        usePayload(payload, url.startsWith("http") ? "GitHub" : "ไฟล์ในเว็บ");
        return;
      } catch (e) {
        errorText = e && e.message ? e.message : String(e);
      }
    }

    // Network unavailable: keep last known NAV in the existing dashboard cache.
    const current = readCurrent();
    if (current) {
      if (typeof render === "function") render(current);
      displayData(current, "ข้อมูลสำรองในเครื่อง");
      setStatus(`ดึงข้อมูลใหม่ไม่สำเร็จ (${errorText}) · คงข้อมูล NAV ที่บันทึกไว้วันที่ ${current.date || "ไม่ระบุ"} ห้ามถือว่าเป็น NAV ปัจจุบันจนกว่าจะตรวจสอบวันที่`, true);
    } else {
      setStatus(`ดึงข้อมูล NAV ไม่สำเร็จ (${errorText}) และไม่มีข้อมูลสำรองในเบราว์เซอร์ โปรดตรวจ nav-data.json`, true);
    }
  }

  window.GPFNav = { refresh: () => refresh(true) };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => refresh(false), { once: true });
  } else {
    refresh(false);
  }
})();
