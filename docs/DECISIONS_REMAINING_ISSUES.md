# Silent Focus – decisions for the remaining client issues

Prepared 2026-10-10 for the owner. Planning only: nothing here is implemented, and nothing was
captured, run on a device or written to production while preparing it.

Common rules for every option below:
- Message text is never uploaded to the backend.
- No phone numbers or contact names leave the phone.
- Anything new is local-first and covered by unit tests before any device test.

---

## 1. WhatsApp call notification capture (#9)

**Purpose.** Learn how WhatsApp's call notifications look on a real phone, so that an incoming or
missed WhatsApp call can be recognised from structure alone. WhatsApp does not document these
notifications. Today the listener ignores them on purpose: the `call` category and ongoing
notifications are filtered out (`SilentFocusNotificationListener.kt`).

**Metadata that can be inspected without names, text or numbers**

| Field | Example use |
|---|---|
| `packageName` (`com.whatsapp`, `com.whatsapp.w4b`) | limit capture to WhatsApp |
| `category`, `channelId` | call vs missed-call vs message channel |
| `extras["android.template"]` (class name), `extras["android.callType"]` (integer: incoming / ongoing / screening) | Android 12+ `CallStyle` – the strongest structural signal |
| flags: ongoing, foreground service, insistent, group summary | ringing call vs ongoing call |
| `fullScreenIntent != null` (boolean only) | ringing incoming call |
| number of actions, each action's `semanticAction` (integer) | Answer / Decline present |
| `postTime`, removal time, removal reason code (`REASON_CLICK`, `REASON_APP_CANCEL`, …) | call ended, missed or opened |
| `EXTRA_IS_GROUP_CONVERSATION` (boolean), count of `EXTRA_PEOPLE_LIST` (count only) | exclude group calls |
| names of the extras keys present (not their values) | detect format changes between versions |
| salted SHA-256 of `sbn.key` and of the shortcut id / title (per-install salt, as used today) | correlate "same notification" and "same caller" without keeping who it is |

**Never read into the capture:** title, text, big text, sub-text, `Person` names or URIs
(`tel:` numbers), shortcut ids in clear (they can contain the WhatsApp phone id), avatars and large
icons, intent extras.

**Real-device test matrix (needs your approval and a phone with WhatsApp)**
- Call types:
  - voice and video;
  - saved and unsaved caller;
  - group call.
- Outcomes:
  - missed;
  - declined on this phone;
  - answered on this phone;
  - answered on a linked device (WhatsApp Web/Desktop);
  - caller hangs up early.
- Phone state:
  - screen on, locked, app in background, app swiped away;
  - with Silent Focus silencing, and without.
- Versions and settings:
  - WhatsApp and WhatsApp Business;
  - English and the client's phone language;
  - Samsung One UI and a Pixel;
  - WhatsApp call notifications switched off by the user (expected: nothing detectable).
- Negative cases: messages from the same contact, voice notes, status updates – none may look like
  a call.

**Keeping the capture local-only, opt-in and removable**
- Code lives only in the `debug` source set (`android/app/src/debug/…`), so release builds don't
  contain it. A unit test asserts the class is absent from the release variant.
- A runtime switch, default OFF, on a hidden debug screen. Nothing is recorded until it is turned on.
- The capture is written to an app-private ring buffer (newest 200 records). It is cleared when the
  switch is turned off and at logout, and it has no network code path.
- To read it: `adb shell run-as com.SilenceFocus cat …` or a share-sheet export that you trigger
  yourself. Never automatic.
- To remove it: delete the debug source-set folder and the switch (one commit). Production code
  doesn't depend on it.

**What is reliable and what is not**

| Likely detectable (to confirm on device) | Not reliably detectable |
|---|---|
| A ringing incoming call (CallStyle incoming / full-screen intent / Answer action) | Whether the call was answered, or on which device |
| A missed call (separate missed-call notification) | Call duration |
| Voice vs video (only if channels differ – unverified) | The caller's phone number (and we must not collect it) |
| Same caller again (hashed id) | Anything when the user disabled WhatsApp notifications |
| | Behaviour after a WhatsApp update that changes the format |

Classification must use structure first and text only as a last resort, because text is
language-dependent.

**Decision needed:** approve the device capture (scope, phone, who runs it). Also decide whether
WhatsApp calls are recorded only while Silent Focus is active, as messages are today, or always.

---

## 2. Call entry navigation (#11)

**Recommendation: single tap**, the same as message entries. With TalkBack, a double-tap is how a
user activates any item, so app-level double-tap would conflict with it.

| Entry | Single tap | Fallback 1 | Fallback 2 |
|---|---|---|---|
| Phone (cellular) | Phone app's call history (`ACTION_VIEW`, `CallLog.Calls.CONTENT_TYPE`) | Empty dialer (`ACTION_DIAL`) | Message: "Couldn't open the Phone app" |
| WhatsApp | The call notification's own intent if it is still posted (existing `NotificationSource.open`) | WhatsApp's launcher screen | Message: "WhatsApp isn't available" |

- **Exact call:** not possible. Android has no standard intent to open one call-log entry, and we
  keep only a redacted number, so the dialer can't be pre-filled. WhatsApp has no supported deep
  link to a call.
- **Permissions:** no new ones. Launching by package with an implicit launcher intent already works
  without `QUERY_ALL_PACKAGES`. The Android 14 background-start opt-in is already handled for
  notification intents.
- **Accessibility:** each row gets a hint, "Opens Phone" or "Opens WhatsApp".
- **Device check:** the call-history intent on Samsung (its own dialer) and on a Pixel.

---

## 3. Message previews (#10)

| | A. Ephemeral (notification-only) | B. Encrypted opt-in local storage | C. No preview (today) |
|---|---|---|---|
| What is shown | Text of the original notification, read when the Activity screen is open | Text saved when the message arrived | App, time, reply status; tap opens the app |
| Stored | Nothing | On the phone only, AES-GCM with an Android Keystore key, default OFF | Nothing |
| Uploaded | Never | Never | Never |
| Reliability | Only while the notification is still posted. Gone after it is dismissed, read on another device or replaced. Grouped chats show the latest lines only. | Survives dismissal. Loses entries if the key is reset (e.g. screen-lock change on some devices). | n/a |
| Privacy | Lowest added risk: no persistence of third-party message content | Highest: stores other people's messages. Needs a consent screen, retention limit (e.g. 7 days), clearing with Clear activity and logout. Backup is already off. | None |
| Permissions | None new (notification access already granted) | None new | None |
| Android 15+ | Notifications Android marks as sensitive (e.g. one-time codes) arrive redacted to listener apps – shown as hidden | Same redaction at capture time | n/a |
| Play / policy | Privacy-policy wording for on-device notification processing. Data that never leaves the phone isn't "collected" in Data safety terms, but the use must match the declared feature. | Privacy-policy update, review of the Data safety form, explicit in-app consent | No change |
| Effort | Small: lookup by the existing `notificationRef` | Medium–large: crypto, settings, retention, tests | – |

**Recommendation:** start with A. Consider B only if the client needs previews after the
notification is gone, and only with an explicit consent screen and a privacy-policy update. The
backend is never involved.

---

## 4. Repeated WhatsApp caller alert (#6)

**Matching without keeping personal data**
- Identify a caller by a salted SHA-256 hash, with the existing per-install salt, of WhatsApp's
  conversation identifier. Preference order: notification shortcut id, then `Person` key, then
  title as a last resort. Hash immediately; never store the raw value.
- Keep only `(hash, time)` records in a bounded window (the existing rule: threshold 2–10, window
  ≤ 60 min, cooldown ≤ 240 min, capped record count), pruned on every call and cleared at logout.
- Separate namespace from cellular callers (`wa:` prefix), so counts don't mix.
- Exclude group calls (group flag), and messages from the same person.

**Matching limits**
- Renamed contacts change the title. This only matters for the title fallback.
- Two contacts with the same display name collide when the title fallback is used.
- Unsaved numbers appear as the number in the title. It's hashed, but the matching is less stable.

**DND and audio limits**
- The Silent Focus DND rule blocks all sounds except alarms and media (`DndController`:
  `disallowAllSounds().allowAlarms(true).allowMedia(true)`).
- WhatsApp's own ringtone and full-screen call screen therefore stay suppressed. Android has no API
  for one app to let a single notification of another app through.
- Pausing our rule, as we do for cellular urgent calls, would unsilence every app for that time.
  This is rejected for WhatsApp.
- Feasible option: Silent Focus plays its own alert on the alarm audio stream while the WhatsApp
  call notification is showing. It stops when the notification is removed or after a cap. The user
  answers from the notification.
- Audibility depends on the alarm volume, not the ringer mode. If the alarm volume is zero, the alert
  is silent. On Samsung, "Mute all sounds" and other DND schedules can still mute it; when several
  rules are active, the most restrictive one wins.
- **Permissions:** none new for audio. Sustained playback from the background may need a short
  foreground service on Android 14+, to be confirmed on device.
- **Alternative to offer the client:** add WhatsApp as an allowed app in the phone's DND/Modes
  settings. This lets every WhatsApp notification through, not only urgent callers.

**Reliability:** depends entirely on section 1 (detection). WhatsApp may post the call notification
late. Nothing works if WhatsApp notifications are off. Battery cost is negligible (event-driven).
**Not to be implemented until #9 is verified on a device.**

---

## 5. Geofence delay (#5)

**Already implemented locally (uncommitted)**
- `GeofenceDiagnostics`, recorded per geofence event:
  - receipt time and transition;
  - zone ids;
  - triggering fix time, age at receipt, accuracy and provider;
  - distance to the zone centre, rounded to 10 m;
  - evaluation time and DND result.
- Also recorded: Play Services errors, and registration status with permission flags.
- Storage: newest 100 records, app-private, no coordinates, never uploaded, cleared at logout.
  Readable through the `getGeofenceDiagnostics` bridge method or logcat tag `SilentFocusDiag`.

**Real-device procedure** (full version in `docs/SAMSUNG_GEOFENCE_TEST.md`; needs separate
authorisation)
1. Record the preconditions:
   - model, One UI and Play services versions;
   - the app's battery mode (Unrestricted / Optimized / Restricted) and the sleeping-apps lists;
   - precise location and "Allow all the time";
   - Wi-Fi/Bluetooth scanning;
   - zone centre and radius.
2. Install the approved build (section 6) and sign in with a **test account**. Check that
   `REGISTRATION status=REGISTERED` appears.
3. Mark a landmark on the approach path at the zone boundary.
4. Start about 400 m outside the zone, screen off, phone in pocket. Walk in and note the time at the
   landmark.
5. Compare landmark time → fix time → event receipt → evaluation → DND on. Repeat 3× per setting.
6. Repeat with battery mode Unrestricted, and with Wi-Fi scanning on/off, to separate detection
   delay from delivery delay.
7. Walk out the same way for EXIT.

**No new production sessions:**
- Planning needs none, and none were created.
- For the field test, build with `SF_DEBUG_SERVER_WRITES_ACCOUNT_ID` empty. Debug builds then upload
  no activity, sessions or logs, and push no auto-reply settings; sessions stay on the phone.
- That switch does not block saves a user makes in the app (zones, schedules, profile). Create the
  test zone beforehand and don't edit it during the test.
- The emulator ENTER/EXIT check also needs approval, because with uploads enabled it would create
  user-3 sessions.

---

## 6. Client APK

**Find the signing certificate of the existing install (safest first)**
1. Ask how it was installed:
   - From Google Play: open Play Console → the app → App integrity page (under Setup or Test and
     release, depending on the Console layout) → "App signing key certificate" (SHA-1). No contact
     with the phone.
   - From an APK file: run `apksigner verify --print-certs <that file>` (or
     `keytool -printcert -jarfile`) on the original file. No contact with the phone.
2. On the phone, without tools: Settings → Apps → Silent Focus → App details shows the installer
   source (Play Store vs Package installer). It doesn't show the certificate.
3. Last resort, with approval, USB debugging and the client present. These commands are read-only:
   - `adb shell pm list packages -i com.SilenceFocus` – shows the installer;
   - `adb shell dumpsys package com.SilenceFocus | grep -E "versionCode|signatures"` – shows the
     installed version and signature;
   - `adb shell pm path com.SilenceFocus` then `adb pull <path>` – then run `apksigner verify
     --print-certs` on the pulled copy.

   Never run `adb uninstall`, "Clear data" or `pm clear`.

**Standalone debug APK**
- **How:** embed the production JS bundle in a debug build:
  `npx react-native bundle --platform android --dev false --entry-file index.js
  --bundle-output android/app/src/main/assets/index.android.bundle --assets-dest
  android/app/src/main/res`, then `./gradlew :app:assembleDebug`.

  Without Metro, the app loads this embedded bundle. Don't commit the generated files.
- **Google Sign-In: works.** `google-services.json` registers the Android OAuth client for package
  `com.SilenceFocus` with the React Native debug certificate (SHA-1 5E:8F:16:06:…:F6:25), and debug
  builds are signed with that keystore.

  A release or Play build would need its own SHA-1 added to the OAuth client first.
- **Server writes:** automatic uploads (activity, sessions, logs, auto-reply push) happen only for
  the account id in `SF_DEBUG_SERVER_WRITES_ACCOUNT_ID`; empty disables them. Saves the user makes
  (zones, schedules, profile) still go to the server.
- **Caveats:**
  - About 147 MB (all ABIs, debug libraries); it can be reduced with per-ABI splits.
  - Slower than release.
  - The developer menu is reachable by shaking the phone.
  - It's debuggable, which helps the geofence test (`run-as`).

**Avoiding uninstalls and data loss**
- **Signature mismatch:** Android refuses to install an APK signed with a different certificate over
  the existing app (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`). It fails safely: nothing is removed. So
  first match the certificate:
  - debug key → standalone debug APK;
  - upload key → release signed with that key;
  - Play key → Play internal testing track.
- **Version:** the build's `versionCode` must be ≥ the installed one, otherwise Android refuses it.
  Ours is `1`; read the installed value first (step 3 above, or Play Console).
- **If no matching path exists:** use a second test phone. Uninstalling the client's app is not
  approved. Android can't hold two copies with the same package id, even in Samsung Secure Folder.
- **Data:**
  - Restored at sign-in: zones, schedules and settings, because they live on the server.
  - Lost if the app were ever uninstalled: the unsynced outbox, the local activity journal, learned
    locations, diagnostics, and the DND and notification-access grants. `allowBackup` is off, so
    nothing comes back from Google backup.

  Before any update, have the client open the app online once so pending items sync.

---

## Small pending accessibility item

White text on `#D6721E` buttons is 3.34:1, below 4.5:1 for normal text:
- the Permissions **"Fix"** button in its "required" state;
- the learning-suggestion button;
- the emergency-contact action buttons.

Minimal fix, consistent with Batch 3: background `#9A4F08` with white text (6.0:1). Not implemented;
needs approval.

---

## Decisions requested

1. Approve the WhatsApp notification capture (section 1): device, scope, who runs it. Also: record
   WhatsApp calls only while Silent Focus is active, or always.
2. Single tap for call entries (recommended), and the call-history target for Phone entries.
3. Message previews: A (recommended), B, or C.
4. #6: pursue the Silent Focus alarm-stream alert after #9 is verified, or advise the DND allow-list
   alternative.
5. #5: authorise the emulator check and/or the Samsung test, with automatic uploads disabled.
6. APK: how the client's app was installed (Play or APK file), so the certificate can be read without
   touching the phone.
7. Fix-button contrast: apply `#9A4F08` (yes/no).
