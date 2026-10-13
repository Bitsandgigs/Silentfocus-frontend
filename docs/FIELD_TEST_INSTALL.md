# Silent Focus – installing the test build

**File:** `silentfocus-fieldtest-debug-nowrites.apk` (about 150 MB, 149,763,782 bytes)
**SHA-256:** `a035b9a25da64b2d3c747df4165881b9b4de382471690c8b9fee7c1934e63573`
**App:** Silent Focus (`com.SilenceFocus`), version 1.0 (1). Android 7.0 or newer.

This is a **test build**:
- Activity, session and auto-reply data are **not uploaded** to the server while you use it. They
  stay on the phone.
- Changes you make yourself (zones, schedules, profile, modes) **are saved to the server**.
- Please sign in with the **test account**.

## 1. Before you start

- Uninstalling the old test app **deletes its local data on this phone**:
  - Activity history and Silent Focus session history;
  - emergency contacts;
  - learned places;
  - granted permissions.

  Zones, schedules and settings are stored on the server and come back when you sign in. Please
  confirm that the old local data can be discarded.
- Check the file: the SHA-256 above must match the file you received.

## 2. Install

1. Settings → Apps → **Silent Focus** → **Uninstall** (the old test build).
2. Samsung only: Settings → Security and privacy → **Auto Blocker** → turn it **off** for the
   install. Turn it back on afterwards.
3. Open the APK file (My Files / Downloads). Allow **Install unknown apps** for that app when
   asked.
4. If Google Play Protect warns about an unknown developer, choose **Install anyway**. The test
   build is signed with a development key.
5. Open **Silent Focus** and sign in with the test account.

## 3. Permissions to grant again

The app asks for most of these during setup. Afterwards, check them in **Accounts → Permissions**:
each missing item there has an Allow / Fix button.

| Permission | Needed for |
|---|---|
| **Do Not Disturb access** (required) | Silencing and restoring your phone |
| **Notification access** | Message and WhatsApp call activity, previews, auto reply |
| **Notifications** (allow) | Silent Focus status and the repeated-call notice |
| **Location: Precise + "Allow all the time"** | Silent Zones while the app is closed |
| Device location switched **on** | Silent Zones |
| **Alarms & reminders** | Schedules starting on the exact minute |
| **Calendar** (if you use Calendar Mode) | Silencing during calendar events |
| Call screening, Contacts, Phone (if you use emergency contacts or urgent callers) | Recognising emergency contacts and repeat callers |
| *Optional:* Battery → **Unrestricted** (Accounts → Permissions → "Battery: Unrestricted (optional)" → Open) | May make zone silencing start sooner; may use slightly more battery |

**Also check:**
- Samsung: make sure Silent Focus is **not** listed under Settings → Battery → Background usage
  limits → Sleeping / Deep sleeping apps.
- Re-add your **emergency contacts**: they are stored only on the phone.

## 4. Known limitation: Maps

**The map preview and place search are not available in this build.** A valid Google Maps API key
hasn't been provided yet.
- The zone screen shows "Map not available".
- To create or move a zone, stand at the place and tap **Use My Current Location**.
- Existing zones keep working normally.
- Map and search will be enabled in a later build once a key is provided.

## 5. If something goes wrong

- "App not installed": the old app is probably still installed. Uninstall it first (step 1).
- Silent Focus doesn't silence the phone: open Accounts → Permissions and grant anything marked
  Fix or Allow.
