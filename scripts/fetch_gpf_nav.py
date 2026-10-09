import json
import re
import urllib.request
from datetime import datetime, date
from html.parser import HTMLParser
from pathlib import Path

URL = (
    "https://www.gpf.or.th/thai2019/about/main.php"
    "?lang=th&menu=statistic&page=memberfund&pattern=n&size=n"
)
OUTPUT = Path("nav-data.json")
MAX_AGE_DAYS = 10


class TextParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        value = " ".join((data or "").split())
        if value:
            self.parts.append(value)


def parse_be_date(value):
    day, month, year = map(int, value.split("/"))
    if year < 2400:
        year += 543
    return date(year - 543, month, day)


def read_existing():
    try:
        data = json.loads(OUTPUT.read_text(encoding="utf-8"))
        nav = data.get("nav", {})
        required = ("shariah", "agg35", "agg65", "foreign")
        if not all(k in nav and isinstance(nav[k], (int, float)) and nav[k] > 0 for k in required):
            return None
        return data
    except (OSError, json.JSONDecodeError, AttributeError, TypeError):
        return None


def preserve_latest(reason):
    existing = read_existing()
    if existing is None:
        raise SystemExit(
            f"{reason} No valid existing nav-data.json fallback is available."
        )

    # Preserve date and NAV values exactly; only annotate the freshness/status.
    existing["verified"] = False
    existing["status"] = "fallback_latest_available"
    existing["status_message"] = (
        "ดึง NAV ล่าสุดจากเว็บไซต์ไม่สำเร็จ ใช้ข้อมูลล่าสุดที่บันทึกไว้ "
        "โปรดตรวจสอบวันที่ข้อมูลก่อนนำไปตัดสินใจ"
    )
    existing["last_fetch_attempt"] = datetime.now().astimezone().isoformat(timespec="seconds")
    existing["fetch_error"] = reason[:500]
    OUTPUT.write_text(
        json.dumps(existing, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print("WARNING: Using last available NAV; values and publication date were preserved.")
    print(json.dumps({
        "date": existing.get("date"),
        "nav_date_iso": existing.get("nav_date_iso"),
        "nav": existing.get("nav"),
        "status": existing["status"],
        "fetch_error": existing["fetch_error"],
    }, ensure_ascii=False, indent=2))


def main():
    try:
        request = urllib.request.Request(
            URL,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; GPF-NAV-Tracker/1.0)",
                "Accept-Language": "th-TH,th;q=0.9,en;q=0.8",
                "Cache-Control": "no-cache",
                "Pragma": "no-cache",
            },
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            html = response.read().decode("utf-8", "replace")

        parser = TextParser()
        parser.feed(html)
        text = re.sub(r"\s+", " ", " | ".join(parser.parts))

        date_matches = list(
            re.finditer(r"วันที่ประกาศใช้\D{0,100}?(\d{2}/\d{2}/\d{4})", text)
        )
        if not date_matches:
            preserve_latest("Could not locate an official NAV date on the page.")
            return

        patterns = {
            "shariah": r"แผนการลงทุนตามหลักชะรีอะฮ์\D{0,80}?([0-9]+\.[0-9]{4})",
            "agg35": r"แผนเชิงรุก\s*35\D{0,80}?([0-9]+\.[0-9]{4})",
            "agg65": r"แผนเชิงรุก\s*65\D{0,80}?([0-9]+\.[0-9]{4})",
            "foreign": r"แผนหุ้นต่างประเทศ\D{0,80}?([0-9]+\.[0-9]{4})",
        }

        candidates = []
        for i, date_match in enumerate(date_matches):
            try:
                nav_date = parse_be_date(date_match.group(1))
            except ValueError:
                continue

            # Parse only the section associated with this date occurrence.
            end = date_matches[i + 1].start() if i + 1 < len(date_matches) else min(
                len(text), date_match.end() + 6000
            )
            section = text[date_match.end():end]
            nav = {}
            for key, pattern in patterns.items():
                value_match = re.search(pattern, section)
                if not value_match:
                    break
                nav[key] = float(value_match.group(1))

            if len(nav) == 4 and all(v > 0 for v in nav.values()):
                candidates.append((nav_date, date_match.group(1), nav))

        if not candidates:
            preserve_latest("Could not validate all four NAV values beside a publication date.")
            return

        nav_date, date_text, nav = max(candidates, key=lambda item: item[0])
        age = (datetime.now().date() - nav_date).days
        if age < 0 or age > MAX_AGE_DAYS:
            preserve_latest(
                f"Official page data date {date_text} is not recent enough ({age} days old)."
            )
            return

        data = {
            "date": f"{nav_date.day}/{nav_date.month}/{nav_date.year + 543}",
            "nav_date_iso": nav_date.isoformat(),
            "nav": nav,
            "source": URL,
            "fetched_at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "verified": True,
            "status": "official_page_parsed",
            "status_message": "ดึงข้อมูล NAV จากหน้าเว็บไซต์ กบข. และตรวจสอบครบ 4 แผนแล้ว",
        }
        OUTPUT.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print("Validated official GPF NAV data:")
        print(json.dumps(data, ensure_ascii=False, indent=2))

    except Exception as exc:
        # Network, temporary maintenance, or unexpected HTML: keep latest known values.
        preserve_latest(f"{type(exc).__name__}: {exc}")


if __name__ == "__main__":
    main()
