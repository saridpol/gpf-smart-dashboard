import json
import urllib.request
from datetime import datetime
from pathlib import Path

URL = "https://www.gpf.or.th/thai2019/about/main.php?lang=th&menu=statistic&page=memberfund&pattern=n&size=n"
OUTPUT = Path("nav-data.json")
KEYS = ("shariah", "agg35", "agg65", "foreign")


def read_existing():
    """Return the last saved NAV payload only if all four values are valid."""
    try:
        data = json.loads(OUTPUT.read_text(encoding="utf-8"))
        nav = data.get("nav", {})
        if (
            isinstance(data.get("date"), str)
            and all(
                isinstance(nav.get(key), (int, float))
                and not isinstance(nav.get(key), bool)
                and nav[key] > 0
                for key in KEYS
            )
        ):
            return data
    except (OSError, ValueError, AttributeError, TypeError):
        pass
    return None


def write_json(data):
    OUTPUT.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def keep_fallback(reason):
    data = read_existing()
    if data is None:
        raise SystemExit(
            "Fetch failed and no valid saved NAV is available. "
            f"Reason: {reason}"
        )

    # Preserve the saved NAV values and original NAV date exactly.
    # Only update fetch-status metadata.
    data["verified"] = False
    data["status"] = "fallback_latest_available"
    data["status_message"] = (
        "เว็บไซต์ กบข. ยังดึงข้อมูลไม่ได้ จึงใช้ NAV ที่บันทึกไว้เดิม "
        "วันที่ NAV ไม่ใช่วันที่ดึงข้อมูล"
    )
    data["last_fetch_attempt"] = datetime.now().astimezone().isoformat(
        timespec="seconds"
    )
    data["fetch_error"] = str(reason)[:500]
    write_json(data)

    print("NAV fetch failed; preserved existing NAV values and date.")
    print(
        json.dumps(
            {
                "date": data.get("date"),
                "nav": data.get("nav"),
                "verified": data.get("verified"),
                "status": data.get("status"),
                "fetch_error": data.get("fetch_error"),
            },
            ensure_ascii=False,
        )
    )


def main():
    # Until the official page can be reliably parsed and the NAV date tied
    # specifically to those four values, do not overwrite the saved NAV.
    # A successful HTTP response alone is not proof that the page contains
    # current NAV data; maintenance pages can also return HTTP 200.
    try:
        request = urllib.request.Request(
            URL,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; GPFNAVUpdater/1.0)",
                "Accept-Language": "th-TH,th;q=0.9,en;q=0.8",
                "Cache-Control": "no-cache",
                "Pragma": "no-cache",
            },
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read(200_000).decode("utf-8", "replace")

        lowered = body.lower()
        maintenance_markers = (
            "ปิดปรับปรุง",
            "อยู่ระหว่างปรับปรุง",
            "maintenance",
            "temporarily unavailable",
            "service unavailable",
        )
        if any(marker in lowered for marker in maintenance_markers):
            keep_fallback("Official GPF page appears to be under maintenance.")
            return

        # Do not claim success based on unverified regex matches. The current
        # page format has not been confirmed to reliably associate a NAV date
        # with all four plan values, so keep the last known data safely.
        keep_fallback(
            "Automatic parsing is paused until the official page format and "
            "NAV-date association can be verified. No NAV values were changed."
        )

    except Exception as exc:
        keep_fallback(f"{type(exc).__name__}: {exc}")


if __name__ == "__main__":
    main()
