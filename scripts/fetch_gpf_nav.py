import json, re, urllib.request
from datetime import datetime
from html.parser import HTMLParser

URL = "https://www.gpf.or.th/thai2019/about/main.php?lang=th&menu=statistic&page=memberfund&pattern=n&size=n"

class TextParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
    def handle_data(self, data):
        if data and data.strip():
            self.parts.append(data.strip())

req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req, timeout=30) as response:
    page = response.read().decode("utf-8", "replace")

parser = TextParser()
parser.feed(page)
text = " ".join(parser.parts)

# The official page may change its markup. Only update when all four values are found.
date_match = re.search(r"วันที่ประกาศใช้\s*(\d{2}/\d{2}/\d{4})", text)
if not date_match:
    raise SystemExit("Could not locate an official NAV date; no data was changed.")

start = date_match.end()
chunk = text[start:start + 5000]
patterns = {
    "shariah": r"แผนการลงทุนตามหลักชะรีอะฮ์\s*([0-9]+\.[0-9]+)",
    "agg35": r"แผนเชิงรุก\s*35\s*([0-9]+\.[0-9]+)",
    "agg65": r"แผนเชิงรุก\s*65\s*([0-9]+\.[0-9]+)",
    "foreign": r"แผนหุ้นต่างประเทศ\s*([0-9]+\.[0-9]+)",
}
nav = {}
for key, pattern in patterns.items():
    match = re.search(pattern, chunk)
    if not match:
        raise SystemExit(f"Could not reliably locate {key} NAV; no data was changed.")
    nav[key] = float(match.group(1))

day, month, year = date_match.group(1).split("/")
date_th = f"{int(day)}/{int(month)}/{int(year) + 543}"
data = {
    "date": date_th,
    "nav": nav,
    "source": URL,
    "fetched_at": datetime.now().astimezone().isoformat(timespec="seconds")
}
with open("nav-data.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print("Fetched official NAV data:", json.dumps(data, ensure_ascii=False))
