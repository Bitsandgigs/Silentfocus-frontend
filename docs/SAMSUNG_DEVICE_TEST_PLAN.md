# Samsung real-device test checklist (#5, #6, #9, #10, #11)

**Status (2026-10-11):** prepared, **not run**. It needs:
- the owner's approval;
- an approved Samsung test phone;
- a **test account**;
- written consent for WhatsApp notification testing.

Never uninstall, clear data or change accounts on the client's own phone without explicit approval.

## 0. Build and install

**APK:** `android/app/build/outputs/client-test/silentfocus-fieldtest-debug-nowrites.apk`
- SHA-256 `a035b9a25da64b2d3c747df4165881b9b4de382471690c8b9fee7c1934e63573`
- debug build with the JS embedded, debuggable;
- automatic server writes **off**;
- harness and probe flags off;
- Maps key empty (the map shows "Map not available").
- Signed with the React Native debug certificate, SHA-1
  `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`.
- `com.SilenceFocus`, versionCode 1.

**Before installing:**
- [ ] Check the checksum: `shasum -a 256 <apk>`.
- [ ] Install compatibility (see `docs/CLIENT_TEST_PLAN.md` §3): the phone must have no Silent
      Focus, or one signed with the same debug certificate and versionCode ≤ 1.
- [ ] Samsung: **Auto Blocker** (Settings → Security and privacy) may block sideloading. The phone
      owner turns it off temporarily, then on again after the test.

**Install:** `adb install -r <apk>`. On a signature mismatch it fails safely and nothing is removed.
**Never** use `adb uninstall` or `pm clear`.

**Server writes during the test:**
- automatic uploads (activity, sessions, logs, auto-reply push) are off;
- **saves you make in the app** (zones, schedules, profile, modes) still go to the server. Create the
  test zone beforehand and don't edit anything during the test;
- signing in creates a login token on the server: that is the only expected write.

**Read results afterwards (debuggable build, read-only):**

```sh
adb exec-out run-as com.SilenceFocus cat shared_prefs/silent_focus_diagnostics.xml   # geofence timing
adb logcat -v time -s SilentFocusDiag SilentFocusGeofence SilentFocusEngine SilentFocusDnd SilentFocusWaCall ZenModeHelper
```

Logs never contain coordinates, message text, names or numbers. Cellular numbers are redacted.

## 1. Preconditions (record once)

- [ ] Model, Android / One UI version, Google Play services version, WhatsApp and WhatsApp
      Business versions.
- [ ] Battery for Silent Focus (Settings → Apps → Silent Focus → Battery): Unrestricted /
      Optimized / Restricted.
- [ ] Sleeping / Deep sleeping apps lists; Power saving mode.
- [ ] Location: precise on, "Allow all the time"; Wi-Fi and Bluetooth scanning on or off.
- [ ] Silent Focus has Do Not Disturb access and Notification access.
- [ ] Note any other DND schedules or Modes on the phone.
- [ ] A screen lock (PIN / pattern) is set: needed for #10.
- [ ] WhatsApp call notifications are on (WhatsApp → Settings → Notifications → Calls).

## 2. #5 Geofence entry / exit timing

1. Open the app on Home once. Check the record `REGISTRATION status=REGISTERED perms=1111`.
2. **Registered centre and radius** (read-only):

   ```sh
   adb shell dumpsys activity service com.google.android.gms/com.google.android.location.internal.GoogleLocationManagerService | grep -A20 -i "Geofencing: listeners"
   ```

   Note the centre and radius for `com.SilenceFocus`. The radius should be `max(zone radius, 100 m)`.
   The centre must match the office entrance, not the street. Coordinates stay on paper only.
3. Mark a landmark at the registered boundary.
4. **Walk-in runs:**
   - start about 400 m outside, screen off, phone in a pocket, **app not opened**;
   - stopwatch at the landmark (T0);
   - note when DND comes on;
   - stay 5 min, then walk out the same way (exit).
5. Repeat 3× for each setting:
   - a) Battery Optimized (baseline);
   - b) Unrestricted;
   - c) Unrestricted with Wi-Fi/Bluetooth scanning on;
   - d) app opened right at the landmark, which tests the arrival check.
6. **Record per run:**
   - T0 and the fix time, so detection = fix − T0;
   - delivery latency (`fixAgeMs`);
   - accuracy (`acc`) and `provider`;
   - `distM/radius`;
   - `evalMs` and `applied`;
   - DND-on time from the `ZenModeHelper` log, so total = DND − T0;
   - the trigger: `EVENT ENTER` (Play Services) or `EVENT ENTER_ARRIVAL_CHECK` (app opened);
   - exit timing.
7. **Battery row:** with Optimized battery, Accounts → Permissions shows "Battery: Unrestricted
   (optional)". "Open" leads to the app's page, where Battery is one tap away.

**Pass / interpretation:**

| Observation | Meaning |
|---|---|
| `evalMs` < 1 s and `applied=true` | The app's own path is fine |
| Large `fixAgeMs` mainly in run a) | Battery or delivery delay; Unrestricted is the fix |
| Large detection with `acc` > 50 m | Indoor accuracy; a 150–200 m radius may help, not guaranteed |
| Run d) silences within seconds | The arrival check works |

- Target: DND on within about 1–2 min.
- **Not claimed fixed until measured.**

## 3. #9 WhatsApp / WhatsApp Business incoming and missed calls

Silent Focus must be active (Silent Mode ON, or inside the test zone). A second phone places the
calls, and both people consented.

| Case | Expected Activity row |
|---|---|
| WhatsApp voice call, not answered → missed | "WhatsApp call · Silenced", then "Missed WhatsApp call" |
| WhatsApp video call | same as voice |
| WhatsApp **Business** call | "WhatsApp Business call", recorded separately |
| Call from an unsaved number | same rows; no number shown anywhere |
| Group call | **no** row (excluded) |
| Call while Silent Focus is off | **no** row |
| Message, voice note or status from the same contact | **no** call row |
| Answered on this phone or another device | only "WhatsApp call"; answered is **not** claimed |
| WhatsApp call notifications switched off | nothing; expected limitation |

- [ ] Each ringing call produces one INCOMING row, not one per notification update.
- [ ] `adb logcat -s SilentFocusWaCall` shows only `com.whatsapp: INCOMING|MISSED`, never a name or
      number.
- If no row appears: WhatsApp's notification structure differs from the expected one
  (`docs/WHATSAPP_CALLS.md`). Capturing structure needs **separate consent** for the debug probe.
  Don't enable it otherwise.

## 4. #6 Three repeated WhatsApp calls

Default rule: threshold 3, window 15 min, cooldown 15 min (Emergency & urgent settings).

1. With Silent Focus active, the same contact calls 3 times within 15 min. Each call goes
   unanswered.
2. **Expected:**
   - calls 1–2: normal rows;
   - call 3: row "Repeated WhatsApp caller · 3 calls", plus **one** Silent Focus notification
     "Repeated WhatsApp calls".
3. WhatsApp's ringing **stays silenced**. The notice appears in the shade quietly, under the DND
   policy. This is the documented limit, **not** a ring-through like cellular urgent calls.
4. A 4th call within the cooldown: no second notice.
5. Two different contacts calling alternately: no repeat notice.
6. Record whether the 3 calls were recognised as the same caller. If not, the correlation is
   unreliable on this phone: report it, and don't work around it.

## 5. #10 Message preview lock-screen privacy

1. Silent Focus active. Receive a message (SMS or WhatsApp from the consenting tester). Leave the
   notification unread.
2. Unlocked: Activity shows the message row with its preview text.
3. Lock the phone (power button), then wake it **without** unlocking. Silent Focus's screen must
   not be visible on the lock screen; no preview from our app.
4. Unlock: the preview is re-read and shown again. Dismiss the notification and the preview
   disappears.
5. Check `adb logcat -d | grep -c "<the test message text>"` returns 0. The text is never logged.

## 6. #11 Call-row navigation and fallback

| Row | Tap while the notification is still posted | Tap after the notification is gone |
|---|---|---|
| WhatsApp call | Opens WhatsApp's own call notification action (WhatsApp) | Opens WhatsApp + toast "The notification is no longer available. Opened WhatsApp." |
| WhatsApp Business call | Same, in WhatsApp Business | Same |
| Phone call (cellular) | Opens the Phone app's call history (Samsung Phone) | – |
| Message row | Opens the conversation through its notification | Opens the app + toast |

- [ ] Return to Silent Focus with Back each time.
- [ ] TalkBack announces "Opens WhatsApp" or "Opens the Phone app's call history" on the rows.

## 7. Afterwards

- [ ] Restore the battery, location and Auto Blocker settings.
- [ ] Copy the results (sections 2–6) into `docs/CLIENT_ISSUES.md`.
- [ ] Leave the test build installed or reinstall the previous build, as agreed. Never uninstall
      without approval.
