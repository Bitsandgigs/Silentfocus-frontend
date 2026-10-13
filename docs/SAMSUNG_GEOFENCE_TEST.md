> **Superseded for field use (2026-10-11):** use the consolidated checklist in
> `docs/SAMSUNG_DEVICE_TEST_PLAN.md`, which covers #5, #6, #9, #10 and #11 and has the current APK
> and checksum. This file keeps the detailed #5 background.

# Samsung geofence field test – Tier 0 checklist (Client Issue #5)

**Status (2026-10-11):** prepared, **not run.** Running it needs separate approval, a test phone
or explicit permission for a client phone, and a test account. Geofence behaviour is unchanged. This
test uses only diagnostics the app already has. No new permissions.

## Changes in the 2026-10-11 build (to measure in this test)

- **Foreground arrival check:** when Silent Focus is opened or resumed, it takes one fresh
  high-accuracy fix (throttled to one per 2 min, entry only, no new permission, no foreground
  service). If that fix is confidently inside a zone the geofence hasn't reported yet, the zone
  activates at once.
  - Shows up in the diagnostics as `EVENT ENTER_ARRIVAL_CHECK`.
  - It only helps when the phone is opened. A phone left in a pocket still depends on Play Services
    (`EVENT ENTER`).
- **Optional battery row:** Accounts → Permissions shows "Battery: Unrestricted (optional)" while
  zones exist and the app is battery-optimised. "Open" leads to the app's settings, where Battery is
  one tap away. The row also includes the Samsung Sleeping / Deep sleeping apps hint.
- **Radius:**
  - offered: 100 / 150 / 200 m;
  - saved radii are kept as they are (legacy 300 / 500 m, and below 100 m shown as "monitored as
    100 m");
  - 150–200 m may activate earlier indoors, but this is **not guaranteed**.
- **The ~2-minute delay is not claimed fixed.** That needs this field test.

## Goal

Split "silenced ~2 min after arriving" into three measured parts:

| Part | Question | Measured by |
|---|---|---|
| Detection | When did Play Services produce a fix inside the circle? | `fixTime` vs the landmark time |
| Delivery | How long did that fix take to reach the app? | `fixAgeMs` |
| Application | How long until DND was actually on? | `evalMs`, `applied=`, the system zen log |

## 1. Build with uploads disabled

The field-test build must not create production sessions or logs. Use a debug build with the JS
bundle embedded and the automatic-write switch emptied **on the command line** (`local.properties`
is left unchanged):

```sh
npx react-native bundle --platform android --dev false --entry-file index.js \
  --bundle-output android/app/src/main/assets/index.android.bundle --assets-dest android/app/src/main/res
cd android
JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home \
  ./gradlew :app:assembleDebug -PSF_DEBUG_SERVER_WRITES_ACCOUNT_ID=
```

**Verify before installing.** Both checks must pass:

```sh
grep DEBUG_SERVER_WRITES_ACCOUNT_ID app/build/generated/source/buildConfig/debug/com/SilenceFocus/BuildConfig.java
# expected: DEBUG_SERVER_WRITES_ACCOUNT_ID = "";
```

- In the app, the debug write notice must **not** appear.
- Automatic sync, the logout outbox flush and the auto-reply push all return `WRITES_DISABLED`.

> Fixed 2026-10-11: before this date an empty `-P…=` value was ignored and the build silently took
> `3` from `local.properties`. Older instructions that relied on it were unsafe.

**What the switch does not block:** saves the tester makes in the app (zone, schedule, profile) still
go to the server. Create the test zone **beforehand** and do not edit it during the test. Don't
commit the generated bundle files; delete them after building.

### Prepared artifact

`android/app/build/outputs/client-test/silentfocus-fieldtest-debug-nowrites.apk`:
- debug build with an embedded JS bundle (runs without Metro);
- `DEBUG_SERVER_WRITES_ACCOUNT_ID=""` (automatic uploads off), harness off, probe off;
- debug-signed (SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`).

The current SHA-256 is in `docs/SAMSUNG_DEVICE_TEST_PLAN.md` (rebuilt 2026-10-11, Batch 10). Install only on an approved test phone. It
updates an existing install only if that install is signed with the same debug certificate.

## 2. Preconditions to record (once per phone)

- [ ] Model, Android / One UI version, Google Play services version (Settings → About phone).
- [ ] App battery mode: Settings → Apps → Silent Focus → Battery (Unrestricted / Optimized /
      Restricted).
- [ ] Settings → Battery → Background usage limits: "Put unused apps to sleep", Sleeping apps, Deep
      sleeping apps. Is Silent Focus listed?
- [ ] Power saving mode on or off.
- [ ] Location: precise on, Silent Focus "Allow all the time".
- [ ] Location services → Wi-Fi scanning and Bluetooth scanning on or off.
- [ ] Do Not Disturb access and notification access granted to Silent Focus.
- [ ] Other DND schedules or Modes on the phone (they can mask or override ours).
- [ ] Test account signed in (not the client's real account). Uploads disabled (section 1).
- [ ] Phone clock set to automatic time; stopwatch synced to it.

## 3. Registration check (before each session)

- [ ] Open the app once on Home (zones sync, geofences register).
- [ ] App record: `REGISTRATION status=REGISTERED count=<n> err= perms=1111`.
      perms = fine, coarse, background, location on; all four must be 1.
- [ ] **The registered centre and radius** (what Play Services actually monitors), read-only:
      ```sh
      adb shell dumpsys activity service com.google.android.gms/com.google.android.location.internal.GoogleLocationManagerService \
        | grep -A20 -i "Geofencing: listeners"
      ```
      Note the fence's latitude/longitude and radius for `com.SilenceFocus`.
- [ ] Compare with the zone in the app (Edit Silent Zone):
  - the centre must match the office entrance area, not the parking lot or the street;
  - the registered radius is `max(zone radius, 100 m)`;
  - a centre 50 m off with a 100 m radius means entry triggers only well inside the building.
- [ ] Write the centre and radius on paper for the report. Coordinates are **not** stored by the app
      and must not be sent to the backend.

## 4. Walk-in procedure

1. Mark a landmark on the approach path **at the registered boundary** (centre + radius, measured
   on a map from the dumpsys centre).
2. Start logging if the phone is connected (optional; otherwise read the store afterwards):
   ```sh
   adb logcat -v time -s SilentFocusDiag SilentFocusGeofence SilentFocusEngine SilentFocusDnd ZenModeHelper
   ```
3. Start about 400 m outside the zone. Screen off, phone in a pocket, app not in the foreground.
4. Walk in at a normal pace. Press the stopwatch at the landmark (**T0**).
5. Note when the phone vibrates / DND shows on (**T_user**), without taking the phone out.
6. Wait 5 min inside, then walk out past the landmark the same way (EXIT, **T0_exit**).
7. After the run, read the stored records (debug build, read-only):
   ```sh
   adb exec-out run-as com.SilenceFocus cat shared_prefs/silent_focus_diagnostics.xml
   ```

## 5. What to record per run

| Field | Source | Notes |
|---|---|---|
| T0 (landmark) | stopwatch | wall clock |
| Fix time | `fixTime` | when Play Services computed the inside fix |
| Event receipt | `at` | when the app got the ENTER broadcast |
| Delivery latency | `fixAgeMs` (= receipt − fix) | batching or battery delay |
| Location accuracy | `acc=` (m) and `provider=` | gps / fused / network |
| Distance at trigger | `distM=…/radius` (rounded to 10 m) | far inside the radius means a late or poor fix |
| Trigger source | `EVENT ENTER` (Play Services) vs `EVENT ENTER_ARRIVAL_CHECK` (app opened) | which path silenced the phone |
| Evaluation | `evalMs` | engine time after receipt (~40 ms on the emulator) |
| DND result | `silent=`, `applied=`, `blockedReason` | `applied=false` means DND access or another mode is the problem |
| DND activation time | `ZenModeHelper` logcat line, or `dumpsys notification` zen state | confirms the system really switched |
| T_user | tester | what the client perceives |

**Derived values:**
- Detection = fix time − T0.
- Delivery = `fixAgeMs`.
- Application = DND activation time − receipt.
- Total = DND activation time − T0.

## 6. Runs (3 each)

- a) Battery Optimized, screen off (the client's normal state – baseline)
- b) Battery Unrestricted, screen off
- c) Unrestricted + Wi-Fi/Bluetooth scanning on
- d) Screen on, app in the foreground (best case)
- e) Only if approved separately (it is a zone save): radius 150 m vs 100 m

## 7. Interpretation

- `evalMs` < 1 s and `applied=true` → the app's own path is fine; look at detection and delivery.
- Detection large (> 60 s), with `distM` well inside the radius and `acc` > 50 m → indoor accuracy
  or the location cycle is the limit. Tier 1 radius guidance helps somewhat; Tier 2 is the only real
  fix.
- Delivery large (`fixAgeMs` > 30 s), mostly in run a) and less in b) → Samsung battery
  management. Tier 1 battery guidance is the fix.
- No ENTER record at all, `REGISTRATION` not `REGISTERED`, or perms not `1111` → a setup problem,
  not latency.
- Target: DND on within about 1–2 min of T0.

## 8. Safety and clean-up

- Test account only. No changes to any other account. No manual server changes.
- No zone or schedule edits during the test.
- Afterwards:
  - restore the phone's battery and location settings to the values recorded in section 2;
  - remove the test build only if it was installed on a test phone. Never uninstall the client's
    app without approval.
- Diagnostics stay on the phone (newest 100 records). They are cleared at logout.
