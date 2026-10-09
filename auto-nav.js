/* GPF Smart Dashboard NAV bridge.
 * Place this file beside index.html in app/src/main/assets/.
 * Reads nav-data.json from the repository; if the network is unavailable,
 * keeps the saved NAV and clearly labels it as fallback data.
 */
(function () {
  "use strict";

  var NAV_URL = "https://raw.githubusercontent.com/saridpol/gpf-smart-dashboard/main/nav-data.json";
  var KEYS = ["shariah", "agg35", "agg65", "foreign"];
  var MONTHS = {
    "ม.ค.": 1, "มกราคม": 1, "ก.พ.": 2, "กุมภาพันธ์": 2,
    "มี.ค.": 3, "มีนาคม": 3, "เม.ย.": 4, "เมษายน": 4,
    "พ.ค.": 5, "พฤษภาคม": 5, "มิ.ย.": 6, "มิถุนายน": 6,
    "ก.ค.": 7, "กรกฎาคม": 7, "ส.ค.": 8, "สิงหาคม": 8,
    "ก.ย.": 9, "กันยายน": 9, "ต.ค.": 10, "ตุลาคม": 10,
    "พ.ย.": 11, "พฤศจิกายน": 11, "ธ.ค.": 12, "ธันวาคม": 12
  };

  function parseDate(value) {
    if (!value) return null;
    var s = String(value).trim();
    var iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])).getTime();

    var numeric = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
    if (numeric) {
      var y = Number(numeric[3]);
      if (y >= 2400) y -= 543;
      return new Date(y, Number(numeric[2]) - 1, Number(numeric[1])).getTime();
    }

    var thai = s.match(/^(\d{1,2})\s+([ก-๙.]+)\s+(\d{4})$/);
    if (thai && MONTHS[thai[2]]) {
      var ty = Number(thai[3]);
      if (ty >= 2400) ty -= 543;
      return new Date(ty, MONTHS[thai[2]] - 1, Number(thai[1])).getTime();
    }
    return null;
  }

  function normalize(payload) {
    if (!payload || typeof payload !== "object") return null;
    var sourceNav = payload.nav && typeof payload.nav === "object" ? payload.nav : payload;
    var d = { date: payload.date || payload.nav_date_iso || "" };
    KEYS.forEach(function (key) {
      d[key] = Number(sourceNav[key]);
      if (!Number.isFinite(d[key]) || d[key] <= 0) d = null;
    });
    if (!d || !d.date) return null;
    d._verified = payload.verified === true;
    d._status = payload.status || (d._verified ? "official_page_parsed" : "fallback_latest_available");
    d._statusMessage = payload.status_message || "";
    d._source = payload.source || NAV_URL;
    return d;
  }

  function savedData() {
    try {
      var d = JSON.parse(localStorage.getItem("gpf-smart-nav") || "null");
      if (!d) return null;
      var n = normalize(d);
      return n;
    } catch (_) { return null; }
  }

  function visibleData(d, status, detail) {
    // Keep metadata out of the existing calculations and form values.
    var clean = { date: d.date };
    KEYS.forEach(function (k) { clean[k] = d[k]; });
    if (typeof window.render === "function") window.render(clean);

    var header = document.getElementById("updated");
    if (header) {
      header.textContent = "วันที่ NAV: " + d.date + " • " + status;
    }

    var banner = document.querySelector(".banner");
    var panel = document.getElementById("navAutoStatus");
    if (!panel && banner) {
      panel = document.createElement("div");
      panel.id = "navAutoStatus";
      panel.style.cssText = "margin:10px 0;padding:10px 12px;border:1px solid #3a4a63;border-radius:12px;background:#17243a;color:#dbe7f7;font-size:12px;line-height:1.6;overflow-wrap:anywhere";
      banner.insertAdjacentElement("afterend", panel);
    }
    if (panel) {
      panel.textContent = status + " — " + detail + " | แหล่งข้อมูล: nav-data.json";
      panel.style.borderColor = d._verified ? "#277b5b" : "#a8752b";
    }

    var manualSection = Array.prototype.find.call(document.querySelectorAll(".section"), function (section) {
      var h = section.querySelector("h2");
      return h && h.textContent.indexOf("อัปเดต NAV ด้วยตนเอง") >= 0;
    });
    if (manualSection) {
      var hint = manualSection.querySelector(".hint");
      if (hint) hint.textContent = d._verified
        ? "NAV อ่านจากไฟล์ข้อมูลที่ระบุว่าตรวจสอบแล้ว โปรดตรวจวันที่และแหล่งข้อมูลก่อนใช้อ้างอิง"
        : "ขณะนี้ใช้ NAV สำรองที่บันทึกไว้ ไม่ใช่ข้อมูลสดจากเว็บไซต์ กบข. หากเว็บไซต์ปิดปรับปรุง ค่า NAV จะไม่เปลี่ยนจนกว่าจะมีข้อมูลใหม่ที่ตรวจสอบได้";
    }
  }

  function showSaved(reason) {
    var local = savedData();
    if (local) {
      visibleData(local, "ใช้ข้อมูลที่บันทึกไว้", reason + " • ไม่ได้ยืนยันว่าเป็น NAV ล่าสุด");
    } else {
      var panel = document.createElement("div");
      panel.style.cssText = "margin:10px 0;padding:10px;border:1px solid #a8752b;border-radius:12px;background:#17243a;color:#ffe0a6;font-size:12px";
      panel.textContent = "ยังเชื่อมต่อแหล่ง NAV อัตโนมัติไม่ได้ และไม่พบข้อมูลที่บันทึกไว้ในอุปกรณ์";
      var banner = document.querySelector(".banner");
      if (banner) banner.insertAdjacentElement("afterend", panel);
    }
  }

  // Fetch latest published JSON. A successful fetch can still contain fallback
  // data, so the verified flag is shown honestly rather than assumed true.
  fetch(NAV_URL, { cache: "no-store" })
    .then(function (response) {
      if (!response.ok) throw new Error("ดาวน์โหลด nav-data.json ไม่สำเร็จ (HTTP " + response.status + ")");
      return response.json();
    })
    .then(function (payload) {
      var remote = normalize(payload);
      if (!remote) throw new Error("รูปแบบ nav-data.json ไม่ถูกต้อง");

      var local = savedData();
      var localTime = local ? parseDate(local.date) : null;
      var remoteTime = parseDate(remote.date);

      // Never replace a newer manually saved NAV with an older remote record.
      var chosen = (local && localTime && remoteTime && localTime > remoteTime) ? local : remote;
      var clean = { date: chosen.date };
      KEYS.forEach(function (k) { clean[k] = chosen[k]; });
      localStorage.setItem("gpf-smart-nav", JSON.stringify(clean));

      var status = chosen._verified ? "เชื่อมต่อข้อมูล NAV แล้ว" : "เชื่อมต่อได้ แต่ใช้ข้อมูลสำรอง";
      var detail = chosen._verified
        ? "ไฟล์ระบุว่าข้อมูลผ่านการตรวจสอบ โปรดตรวจวันที่ NAV"
        : (chosen._statusMessage || "เว็บไซต์ กบข. ยังไม่ยืนยันข้อมูลใหม่; คงค่า NAV สำรองเดิม");
      if (chosen === local) detail = "เก็บข้อมูลในอุปกรณ์ไว้ เพราะวันที่ใหม่กว่าข้อมูลจาก Repository";
      visibleData(chosen, status, detail);
    })
    .catch(function (error) {
      showSaved("ดึง nav-data.json ไม่สำเร็จ: " + (error && error.message ? error.message : "การเชื่อมต่อล้มเหลว"));
    });
})();
