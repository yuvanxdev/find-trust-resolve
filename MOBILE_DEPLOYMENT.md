# FindIt AI — Mobile Application Deployment (Track 2: Native Android)

## Overview
The FindIt AI application has been packaged and built as a native Android mobile application using **Capacitor 8** and the Android Gradle build system. The debug APK has been compiled and is ready for deployment onto physical Android devices or emulators.

---

## 1. Build Artifacts & Locations

- **Debug APK Location:**
  `findit-ai-debug.apk` (in the project root)
  *(Direct build output: `android\app\build\outputs\apk\debug\app-debug.apk`)*
- **File Size:** ~4.37 MB
- **Target OS:** Android 7.0 (API level 24) to Android 15/16 (API level 36)
- **Application ID:** `com.findit.ai`
- **Application Name:** `FindIt AI`

---

## 2. Mobile Architecture & Network Configuration

### Backend & Network Endpoint Configuration

The Android application connects to the backend API and static uploads via HTTP. The target server address is configured via `VITE_API_BASE_URL`:

- **Production (Docker VPS Deployment)**:
  Point directly to your server's public IP address on port `80` (handled by the Nginx reverse proxy):
  ```env
  VITE_API_BASE_URL=http://<YOUR_VPS_PUBLIC_IP>
  ```
  *(All requests to `/api/...` and `/uploads/...` route seamlessly through port 80 without exposing port 8000 or 5432).*

- **Local Wi-Fi Development (Same LAN)**:
  Point to your development machine's local IPv4 address on your Wi-Fi network:
  ```env
  VITE_API_BASE_URL=http://<YOUR_PC_LAN_IP>:8000
  ```
  *(To find your LAN IP in Windows PowerShell, run `Get-NetIPAddress -AddressFamily IPv4 | Where-Object IPAddress -like '192.168*'`).*

- **Cleartext Traffic Enabled:** Configured `android:usesCleartextTraffic="true"` in `AndroidManifest.xml` and `cleartext: true` in `capacitor.config.ts` so mobile devices can communicate with IP-based endpoints before an SSL certificate is added.
- **Offline / Initial Shell:** Added `public/index.html` with a loading indicator and auto-redirect fallback to keep the native WebView responsive.

### Permissions Configured in AndroidManifest.xml
- `android.permission.INTERNET` (Network communications)
- `android.permission.ACCESS_NETWORK_STATE` (Network status monitoring)
- `android.permission.CAMERA` (For Quick Scan, Item Reporting, and QR code reading)
- `android.permission.READ_MEDIA_IMAGES` (Android 13+ gallery selection)
- `android.permission.READ_EXTERNAL_STORAGE` (Legacy storage access for Android 12 and below)
- Hardware camera feature configured as optional (`required="false"`) so devices without specialized hardware can still run the app.

---

## 3. How to Install and Run on Your Mobile Phone

### Option A: Direct Installation via ADB (Fastest)
1. Enable **Developer Options** and **USB Debugging** on your Android phone.
2. Connect your phone to your computer with a USB cable.
3. Run the following command in PowerShell:
   ```powershell
   & $env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe install -r .\findit-ai-debug.apk
   ```

### Option B: File Transfer (No USB Debugging Required)
1. Send or copy `findit-ai-debug.apk` to your phone (via Google Drive, WhatsApp, Bluetooth, or USB file transfer).
2. On your phone, tap the file to install it. (Allow installation from Unknown Sources if prompted).
3. Ensure your phone has internet access (or is on the same Wi-Fi as your development PC if using local LAN mode).
4. Launch **FindIt AI**!

### Option C: Android Studio (Development & Emulation)
To open the project in Android Studio for interactive debugging or running on an Android Virtual Device (AVD):
```bash
npm run cap:open
```
Inside Android Studio:
1. Allow Gradle to finish syncing.
2. Click the green **Run (Play)** button with your emulator or device selected.

---

## 4. Rebuilding & Syncing Changes

If you make frontend or UI changes in the future, run:
```bash
npm run cap:sync
```
This builds the updated assets and synchronizes them into the Android project. To rebuild the APK from the command line:
```bash
cd android
.\gradlew.bat assembleDebug
```
