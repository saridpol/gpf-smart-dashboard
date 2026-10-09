/* GPF Smart Dashboard: Auto NAV + fallback status
   Add this script near the end of index.html, before </body>.
   This script keeps member balance local and only refreshes public NAV.
*/
(() => {
  "use strict";

  const NAV_URLS = [
    "https://raw.githubusercontent.com/saridpol/gpf-smart-dashboard/main/nav-data.json",
    "./nav-data.json"
  ];
  const NAV_KEYS = ["shariah", "agg35", "agg65", "foreign"];
  const NAV_LABELS = {
    shariah: "ชะรีอะฮ์ 100%",
    agg35: "เชิงรุก 35",
    agg65: "เชิงรุก 65",
    foreign: "หุ้นต่างประเทศ"
  };

  function validPayload(data) {
    if (!data || typeof data !== "object" || !data.nav || typeof data.nav !== "object") return false;
    if (!NAV_KEYS.every(k => Number.isFinite(Number(data.nav[k])) && Number(data.nav[k]) > 0)) return false;
    return Boolean(data.date || data.nav_date_iso);
  }

  function getNode(id) {
    return document.getElementById(id);
  }

  function ensureStatusPanel() {
    let panel = getNode("official-nav-status");
    if (panel) return panel;
    panel = document.createElement("section");
    panel.id = "official-nav-status";
    panel.style.cssText = "margin:12px 0;padding:12px 14px;border-radius:12px;border:1px solid #334155;background:#111827;color:#e5e7eb;font-size:14px;line-height:1.5";
    panel.innerHTML = '<div style="font-weight:700;margin-bottom:4px">สถานะ NAV จาก กบข.</div><div id="official-nav-status-text">กำลังตรวจสอบข้อมูล…</div><button id="official-nav-refresh" type="button" style="margin-top:8px;padding:7px 12px;border-radius:8px;border:1px solid #64748b;background:#1e293b;color:#fff">ตรวจสอบอีกครั้ง</button>';
    const anchor = document.querySelector("main") || document.querySelector(".container") || document.body;
    anchor.prepend(panel);
    const button = getNode("official-nav-refresh");
    button.addEventListener("click", () => refreshOfficialNav(true));
    return panel;
  }

  function setStatus(message, isError = false) {
    ensureStatusPanel();
    const node = getNode("official-nav-status-text");
    if (node) {
      node.textContent = message;
      node.style.color = isError ? "#fca5a5" : "#bbf7d0";
    }
  }

  function storedPayload() {
    try {
      const raw = localStorage.getItem("gpf_official_nav_cache");
      if (!raw) return null;
      const data = JSON.parse(raw);
      return validPayload(data) ? data : null;
    } catch (_) { return null; }
  }

  function currentDateKey(data) {
    if (data.nav_date_iso && /^\d{4}-\d{2}-\d{2}$/.test(data.nav_date_iso)) return data.nav_date_iso;
    const m = String(data.date || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return "";
    let y = Number(m[3]);
    if (y > 2400) y -= 543;
    return `${y}-${String(Number(m[2])).padStart(2,"0")}-${String(Number(m[1])).padStart(2,"0")}`;
  }

  function updateStatusFromPayload(data, sourceLabel) {
    const dateText = data.date || data.nav_date_iso || "ไม่ระบุวันที่";
    const status = data.status || (data.verified ? "official_page_parsed" : "fallback_latest_available");
    const isVerified = data.verified === true && status === "official_page_parsed";
    const extra = data.status_message || data.note || "";
    setStatus(
      `${isVerified ? "อัปเดตจากข้อมูล NAV ที่ตรวจสอบได้" : "ใช้ข้อมูลล่าสุดที่บันทึกไว้ (ยังไม่ยืนยันว่าเป็น NAV ปัจจุบัน)"} · วันที่ข้อมูล ${dateText}${extra ? " · " + extra : ""} · แหล่งข้อมูล: ${sourceLabel}`,
      !isVerified
    );
  }

  function updateExistingDashboard(data) {
    // Update only elements explicitly marked for NAV values, never member balance/principal.
    NAV_KEYS.forEach(key => {
      const value = Number(data.nav[key]).toFixed(4);
      document.querySelectorAll(`[data-gpf-nav="${key}"]`).forEach(node => {
        node.textContent = value;
      });
    });
    document.querySelectorAll("[data-gpf-nav-date]").forEach(node => {
      node.textContent = data.date || data.nav_date_iso || "ไม่ระบุวันที่";
    });
    document.dispatchEvent(new CustomEvent("gpf:nav-updated", { detail: data }));
  }

  async function refreshOfficialNav(manual = false) {
    ensureStatusPanel();
    setStatus(manual ? "กำลังตรวจสอบ NAV จาก กบข.…" : "กำลังโหลด NAV ล่าสุดที่เผยแพร่…");
    let lastError = "";
    for (const url of NAV_URLS) {
      try {
        const response = await fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), {
          cache: "no-store",
          headers: { "Accept": "application/json" }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!validPayload(data)) throw new Error("รูปแบบ NAV ไม่ครบหรือไม่ถูกต้อง");
        const remoteKey = currentDateKey(data);
        const old = storedPayload();
        const oldKey = old ? currentDateKey(old) : "";
        // Never replace a newer local cache with older remote data.
        const chosen = old && oldKey && remoteKey && oldKey > remoteKey ? old : data;
        if (chosen === data) localStorage.setItem("gpf_official_nav_cache", JSON.stringify(data));
        updateExistingDashboard(chosen);
        updateStatusFromPayload(chosen, url.startsWith("http") ? "GitHub" : "ไฟล์ในเว็บ");
        return;
      } catch (error) {
        lastError = error && error.message ? error.message : String(error);
      }
    }
    const old = storedPayload();
    if (old) {
      updateExistingDashboard(old);
      updateStatusFromPayload(old, "แคชในเครื่อง");
      setStatus(`ดึงข้อมูลใหม่ไม่สำเร็จ (${lastError}) · ใช้ NAV ที่บันทึกไว้วันที่ ${old.date || old.nav_date_iso}; โปรดตรวจสอบวันที่ก่อนตัดสินใจ`, true);
    } else {
      setStatus(`ยังดึง NAV ไม่สำเร็จ (${lastError}) และไม่มีข้อมูลสำรองในเครื่อง กรุณาตรวจสอบ nav-data.json`, true);
    }
  }

  window.GPFNav = { refresh: () => refreshOfficialNav(true) };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => refreshOfficialNav(false), { once: true });
  } else {
    refreshOfficialNav(false);
  }
})();
