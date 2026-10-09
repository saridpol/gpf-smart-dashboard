GPF Smart Dashboard — Auto NAV web script

Important: do not replace index.html with this file. This ZIP contains auto-nav.js only.
Add its contents at the end of index.html immediately before </body>, or include the file with:
<script src="auto-nav.js"></script>
before </body>, then upload auto-nav.js to repository root.

This script:
- Fetches nav-data.json from raw.githubusercontent.com and falls back to same-origin ./nav-data.json.
- Validates all 4 NAV values and a date before use.
- Keeps a local copy in localStorage if remote fetching fails.
- Does not overwrite locally cached newer NAV with an older dated file.
- Adds a visible status panel showing whether NAV is verified or fallback.
- Only updates explicitly tagged NAV elements:
  data-gpf-nav="shariah|agg35|agg65|foreign"
  data-gpf-nav-date
It deliberately does not guess your dashboard's existing element IDs and does not overwrite the member's real balance.

Android WebView note:
- INTERNET permission is required in AndroidManifest.xml.
- Depending on MainActivity WebView settings, loading remote URLs may be restricted. If it fails, use the GitHub Pages/site origin or enable appropriate WebView settings after inspecting MainActivity.
