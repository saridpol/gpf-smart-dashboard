# GPF Smart Dashboard — Android starter

This starter wraps the HTML dashboard in an Android WebView APK.

## Build from GitHub using an Android phone
1. Upload all files and folders in this package to the root of your repository. Keep the hidden `.github` folder and its workflow file.
2. Open the repository's Actions tab and choose `Build Android APK`.
3. Tap `Run workflow`, or push a commit to `main` to trigger the build.
4. When the run finishes successfully, open it and download the artifact `gpf-smart-dashboard-debug-apk`.
5. Extract the downloaded ZIP on your phone and install `app-debug.apk`. Android may ask you to allow installs from the app used to download/open it.

## Limitations
- This is a debug APK for personal testing, not a Play Store release.
- NAV values are starter values as of 6 Oct 2569 and do not auto-refresh yet.
- No private GPF credentials or member account information should be committed to GitHub.
- Verify all NAV values and calculations against official GPF data before relying on results.
