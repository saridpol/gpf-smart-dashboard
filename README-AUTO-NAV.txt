GPF Smart Dashboard — Auto NAV workflow

Upload the contents of this ZIP into the repository root, preserving the paths:
- .github/workflows/update-nav.yml
- scripts/fetch_gpf_nav.py
- nav-data.json

Then commit the files. In GitHub, open Actions > Update GPF NAV > Run workflow.
The scheduled check is weekdays at 20:30 Thailand time.

Important:
- The scraper depends on the official GPF page's HTML and must be validated from the Actions log.
- It stops without changing the data if it cannot confidently find all four NAV values.
- This updates public NAV only; it does not retrieve private member balances or contributions.
- The dashboard HTML and APK must separately be updated to read nav-data.json for the values to appear in the app.
