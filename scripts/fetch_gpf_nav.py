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
        data = " ".join((data or "").split())
        if data:
            self.parts.append(data)


def parse_be_date(value):
    day, month, year = map(int, value.split("/"))
    if year < 2400:
        year += 543
    return date(year - 543, month, day)


def get_existing_data():
    try:
        return json.loads(OUTPUT.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def main():
    request = urllib.request.Request(
        URL,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; GPF-NAV-Tracker/1.0)",
            "Accept-Language": "th-TH,th;q=0.9,en;q=0.8",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        html = response.read().decode("utf-8", "replace")

    parser = TextParser()
    parser.feed(html)
    text = " | ".join(parser.parts)
    text = re.sub(r"\s+", " ", text)

    # GPF's table can place separators between the date label and its value.
    date_matches = list(
        re.finditer(r"วันที่ประกาศใช้\D{0,80}?(\d{2}/\d{2}/\d{4})", text)
    )
    if not date_matches:
        raise SystemExit(
            "Could not find a published NAV date in the official page. "
            "Existing nav-data.json was not changed."
        )

    patterns = {
        "shariah": r"แผนการลงทุนตามหลักชะรีอะฮ์\D{0,40}?([0-9]+\.[0-9]{4})",
        "agg35": r"แผนเชิงรุก\s*35\D{0,40}?([0-9]+\.[0-9]{4})",
        "agg65": r"แผนเชิงรุก\s*65\D{0,40}?([0-9]+\.[0-9]{4})",
        "foreign": r"แผนหุ้นต่างประเทศ\D{0,40}?([0-9]+\.[0-9]{4})",
    }

    candidates = []
    for index, match in enumerate(date_matches):
        try:
            nav_date = parse_be_date(match.group(1))
        except ValueError:
            continue

        # Restrict parsing to this date's section, not the rest of the page.
        section_end = (
            date_matches[index + 1].start()
            if index + 1 < len(date_matches)
            else min(len(text), match.end() + 6000)
        )
        section = text[match.end():section_end]

        nav = {}
        for key, pattern in patterns.items():
            value_match = re.search(pattern, section)
            if not value_match:
                break
            nav[key] = float(value_match.group(1))

        if len(nav) == 4 and all(v > 0 for v in nav.values()):
            candidates.append((nav_date, match.group(1), nav))

    if not candidates:
        raise SystemExit(
            "Found a date but could not validate all four NAV values "
            "in the same official-page section. Existing data was not changed."
        )

    # Choose the newest date only among sections with all four validated NAVs.
    nav_date, date_text, nav = max(candidates, key=lambda item: item[0])
    today = datetime.now().date()
    age_days = (today - nav_date).days
    if age_days < 0:
        raise SystemExit(
            f"Official NAV date {date_text} is in the future. "
            "Existing data was not changed."
        )
    if age_days > MAX_AGE_DAYS:
        raise SystemExit(
            f"Official page returned NAV dated {date_text} "
            f"({age_days} days old; limit {MAX_AGE_DAYS}). "
            "This may be stale cached content; existing data was not changed."
        )

    data = {
        "date": f"{nav_date.day}/{nav_date.month}/{nav_date.year + 543}",
        "nav_date_iso": nav_date.isoformat(),
        "nav": nav,
        "source": URL,
        "fetched_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "verified": True,
        "status": "official_page_parsed",
        "note": "NAV date is the publication date shown by the official GPF page.",
    }

    # Write only after date and all four NAV values pass validation.
    OUTPUT.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print("Validated official GPF NAV data:")
    print(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
