import json
import re
import urllib.request
from datetime import datetime, date
from html.parser import HTMLParser
from pathlib import Path

URL = "https://www.gpf.or.th/thai2019/about/main.php?lang=th&menu=statistic&page=memberfund&pattern=n&size=n"
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


def to_date(value):
    day, month, year = map(int, value.split("/"))
    if year >= 2400:
        year -= 543
    return date(year, month, day)


def read_existing():
    try:
        data = json.loads(OUTPUT.read_text(encoding="utf-8"))
        nav = data.get("nav", {})
        keys = ("shariah", "agg35", "agg65", "foreign")
        if all(isinstance(nav.get(k), (int, float)) and nav[k] > 0 for k in keys):
            return data
    except (OSError, ValueError, AttributeError, TypeError):
        pass
    return None


def keep_fallback(reason):
    data = read_existing()
    if not data:
        raise SystemExit(f"Fetch failed and no valid fallback exists: {reason}")
    data["verified"] = False
    data["status"] = "fallback_latest_available"
    data["status_message"] = "ดึงข้อมูลจากหน้า กบข. ไม่สำเร็จ จึงใช้ NAV ที่บันทึกไว้เดิม"
    data["last_fetch_attempt"] = datetime.now().astimezone().isoformat(timespec="seconds")
    data["fetch_error"] = reason[:500]
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Fetch did not validate; preserved last available NAV.")
    print(json.dumps({"date": data.get("date"), "nav": data.get("nav"), "status": data["status"], "fetch_error": data["fetch_error"]}, ensure_ascii=False))


def main():
    try:
        request = urllib.request.Request(
            URL,
            headers={
                "User-Agent": "Mozilla/5.0",
                "Accept-Language": "th-TH,th;q=0.9,en;q=0.8",
                "Cache-Control": "no-cache",
                "Pragma": "no-cache",
            },
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            html = response.read().decode("utf-8", "replace")

        parser = TextParser()
        parser.feed(html)
        # Keep separators between HTML text nodes, but don't rely on a specific date label.
        text = re.sub(r"\s+", " ", " | ".join(parser.parts))

        # Find any date in the page, including dates whose label/markup has changed.
        date_strings = re.findall(r"(?<!\d)(\d{2}/\d{2}/(?:25\d{2}|20\d{2}))(?!\d)", text)
        valid_dates = []
        for raw in date_strings:
            try:
                valid_dates.append((to_date(raw), raw))
            except ValueError:
                continue
        if not valid_dates:
            keep_fallback("Could not find any valid date in the official page text.")
            return

        # Extract the four plan values by label, tolerating whitespace and separators.
        patterns = {
            "shariah": r"แผนการลงทุนตามหลักชะรีอะฮ์.{0,180}?(\d{1,3}\.\d{4})",
            "agg35": r"แผนเชิงรุก\s*35.{0,180}?(\d{1,3}\.\d{4})",
            "agg65": r"แผนเชิงรุก\s*65.{0,180}?(\d{1,3}\.\d{4})",
            "foreign": r"แผนหุ้นต่างประเทศ.{0,180}?(\d{1,3}\.\d{4})",
        }
        nav = {}
        for key, pattern in patterns.items():
            match = re.search(pattern, text)
            if not match:
                keep_fallback(f"Could not locate a valid {key} NAV beside its plan label.")
                return
            nav[key] = float(match.group(1))

        nav_date, raw_date = max(valid_dates, key=lambda item: item[0])
        age_days = (datetime.now().date() - nav_date).days
        if age_days < 0 or age_days > MAX_AGE_DAYS:
            keep_fallback(f"Newest page date {raw_date} is {age_days} days from today; not accepted as current.")
            return

        data = {
            "date": f"{nav_date.day}/{nav_date.month}/{nav_date.year + 543}",
            "nav_date_iso": nav_date.isoformat(),
            "nav": nav,
            "source": URL,
            "fetched_at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "verified": True,
            "status": "official_page_parsed",
            "status_message": "อ่านวันที่และ NAV ทั้ง 4 แผนจากหน้าเผยแพร่ กบข. ได้ครบแล้ว",
        }
        OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("Validated NAV payload:")
        print(json.dumps(data, ensure_ascii=False, indent=2))

    except Exception as exc:
        keep_fallback(f"{type(exc).__name__}: {exc}")


if __name__ == "__main__":
    main()
