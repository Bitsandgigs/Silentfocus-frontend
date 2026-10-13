# Silent Focus – Client Issue Tracker

Local tracker for client / mentor feedback. Each entry keeps the client's
original wording, a classification, findings and the current status.

Classification:
- **Confirmed defect** – the app does something wrong today (verified in code or on device).
- **Requirement change** – the client asks for different behaviour; current code works as designed.
- **Design proposal** – a UX change suggested by the client; needs approval before any work.

Status values: Open · Investigating · Awaiting decision · In progress · Fixed (unreleased) · Released

| # | Title | Classification | Priority | Status |
|---|---|---|---|---|
| 1 | App name shown as "SilenceFocus" | Confirmed defect | Medium | Implemented · Automated PASS · Built APK label PASS (launcher not screenshotted) |
| 2 | Add/Edit Schedule contrast in dark theme | Confirmed defect | Medium | Implemented · Automated PASS · Visual PASS (light + dark) |
| 3 | Silent Zone radius presets 10/50/100/150/200 m | Requirement change | Medium | Implemented 100/150/200 m + precision note; legacy radii kept; 10/50 m NOT offered – NEEDS CLIENT DECISION |
| 4 | Location Mode vs Custom Mode look duplicated | Design proposal | Medium | Labels/status texts implemented (rule unchanged) · Automated PASS · Visual PASS (light + dark) · client acceptance pending |
| 5 | Slow geofence detection at the office (100 m) | Reported functional issue (cause not yet verified) | High | Foreground arrival check + battery guidance implemented · Automated PASS · NEEDS SAMSUNG FIELD TEST (delay not claimed fixed) |
| 6 | Urgent repeat callers should work for WhatsApp calls | Requirement change (feasibility limited) | Medium | Repeat detection + ordinary notice implemented (no DND bypass) · Automated PASS · NEEDS REAL-PHONE VERIFICATION |
| 7 | Move Privacy & Data and Permissions to the Accounts tab | Design change (requested) | Medium | Implemented · Automated PASS · Visual PASS (light + dark) |
| 8 | Edit/Add Silent Zone dark-mode contrast (+ blank map) | Confirmed defect (+ invalid Maps key) | Medium | Controls Visual PASS · "Map not available" panel and load-failure notice Visual PASS (light + dark) · Maps rendering/place search BLOCKED – API key unavailable |
| 9 | WhatsApp calls missing from Activity Center | Requirement change | Medium | Incoming/missed WhatsApp + Business rows implemented (structure only, local only) · Automated PASS · NEEDS REAL-PHONE VERIFICATION; probe OFF |
| 10 | Message previews + open the originating app from Activity | Requirement change (partly regression of an earlier behaviour) | Medium | Runtime PASS on emulator (synthetic harness) except lock-screen privacy (automated only) |
| 11 | Double-tap a call entry to open Phone / WhatsApp | Requirement change | Low | Single tap: Runtime PASS on emulator (Phone, app-originated, fallbacks after launch fix) · real WhatsApp not verified |

---

## #1 – App name shown as "SilenceFocus"

**Client feedback (original):** "App name is Silent Focus. Not Silence Focus."

**Classification:** Confirmed defect.

**Findings (read-only audit, 2026-10-10):**
- Android `app_name` = `SilenceFocus` → launcher label, permission dialogs ("Allow SilenceFocus to access…"),
  the system DND message ("Do not disturb turned on by SilenceFocus"), notification-access listing and
  notification headers. File: `android/app/src/main/res/values/strings.xml` (used by
  `AndroidManifest.xml` lines 44, 57, 145). Confirmed in the built APK (`application-label:'SilenceFocus'`).
- iOS home-screen name `Silence_Focus`: `ios/Silence_Focus/Info.plist` `CFBundleDisplayName`.
- Already correct: in-app alert title (`Constants.commonConstant.appName`), status notification,
  DND rule name, splash image text, screen copy.
- Do NOT rename internal identifiers (applicationId / package `com.SilenceFocus`, RN component
  `Silence_Focus`, Gradle/package names) – changing the applicationId would break Play Store updates.
- Icon: current launcher icon is an orange "S"/microphone-with-slash on black (square + round). Not yet
  compared with the client's screenshot (screenshot not received).

**Proposed fix:** `app_name` → `Silent Focus`; iOS `CFBundleDisplayName` → `Silent Focus`.

**Implementation (2026-10-10, Batch 1, uncommitted):** done as proposed; application id / package
`com.SilenceFocus` unchanged (existing installs update normally; notification and DND access stay
granted). Verified: built APK `application-label:'Silent Focus'`, `package: com.SilenceFocus`;
test in `__tests__/batch1.test.js`.

---

## #2 – Add/Edit Schedule contrast in dark theme

**Client feedback (original):** "This contrast needs to be sorted aswell." (Add Schedule, dark theme:
weekday selectors, From/To labels, time values, selected/unselected/disabled states.)

**Classification:** Confirmed defect.

**Findings (computed WCAG contrast, dark background `#111111`):**
- Unselected weekday text: black on `#191919` → 1.19:1 (needs 4.5).
- Selected weekday text: white on copper `#B87333` → 3.79:1 (needs 4.5).
- From/To labels: theme default `#666666` → 3.29:1.
- Time placeholder `#706C6C` on unset pill → 3.39:1.
- Back icon black → 1.11:1.
- Shared bug: `CustomTextInputView` forces `Colors.black`/placeholder colour **after** the caller's
  `textStyle`, so the screen's white time text never applies.
- Edit Schedule (`EditScheduleTimeScreen.js`) is a near-copy with the same problems.

**Files:** `src/screens/ScheduleTimeScreen.js`, `src/screens/EditScheduleTimeScreen.js`,
`src/componentes/CustomTextInputView/CustomTextInputView.js`, `android/app/src/main/res/values/styles.xml`
(default text colour).

**Implementation (2026-10-10, Batch 1, uncommitted):** shared palette
`src/utils/theme/controlColors.js` (dark: unselected pill `#1E1E1E` + text `#E6E6E6` 13.4:1, labels
`#E6E6E6`, placeholder `#A9A9A9`, selected copper `#9A5F28` + white text 5.2:1, selected vs
unselected 3.2:1, white back icon, divider `#333333`; light: previous values unchanged).
`CustomTextInputView` now applies the caller's `textStyle` colour last. Also fixed: the To time
value always rendered black (its colour helper only checked the From value). Both schedule screens
updated. `#2A2A2A` (first proposal) was rejected – selected vs unselected only 2.76:1.
Tests: contrast assertions for every dark pair, light values unchanged, input colour order.
Light-mode limits left as is (by decision): white on `#B87333` 3.79:1, placeholder `#706C6C` 4.35:1.

**Original proposal:** fix the style order in `CustomTextInputView`; dark-aware colours (unselected pill
`#2A2A2A` + text `#E6E6E6`, labels `#E6E6E6`, placeholder `#A9A9A9`, white back icon); selected fill:
darker copper `#9A5F28` with white text (5.2:1) – or dark text on `#B87333` (5.5:1). Light theme
unchanged.

---

## #3 – Silent Zone radius presets

**Client requirement (original):** show exactly 10m, 50m, 100m, 150m, 200m; remove 300m and 500m.

**Classification:** Requirement change.

**Findings:**
- `src/utils/zoneForm.js`: `RADIUS_PRESETS = [100,150,200,300,500]`, `MIN_RADIUS = 100` → 10/50 m are
  rejected today.
- Backend (`min:1`), API mapping and native zone model accept 10/50 m.
- Native `GeofenceRegistrar.MIN_RADIUS_METERS = 100` registers `max(radius, 100)` → a 10/50 m zone
  behaves like 100 m while the map circle shows the smaller size.
- Existing 300/500 m zones keep working; Edit must show their current value (no migration).
- Test `__tests__/phase3.test.js` expects 50 m to be rejected.

**Decision (2026-10-10):** no radius changes yet. Must NOT display 10/50 m while enforcing 100 m.
Investigating option (c): 100 m geofence + secondary precise-location check (see analysis in the
2026-10-10 report). Android geofencing is unreliable below ~100 m.

**Decision (2026-10-10, owner):** HOLD – do not implement option (c) yet; prepare a technically
honest way to communicate the 10/50 m limits. Never silently widen the effective radius.

**Communication proposal (for the client):**
- Phones detect zone entry from Wi-Fi, mobile-network and GPS location that is typically accurate to
  20–50 m outdoors and 50–100 m+ indoors; Android's geofencing service is designed for zones of
  about 100 m or more.
- A 10 m zone is smaller than the phone's own location error: it would be missed or trigger at random.
  A 50 m zone works only partly (mainly outdoors) and would often trigger late.
- Honest options to offer:
  1. Standard presets 100 / 150 / 200 m (reliable), with 150–200 m recommended for buildings.
  2. 50 m as an explicitly labelled "Precise (experimental)" option, only if option (c) is approved
     and field-tested – the screen states that it needs precise location, uses more battery and may
     still trigger late indoors.
  3. 10 m: not offered (cannot be met by phone location).
- UI rule: the screen always shows the radius that is actually enforced. If an experimental small
  radius is ever offered, the map shows both the chosen circle and the detection circle, with text
  such as "Detected within about 100 m; confirmed within 50 m when a precise fix is available".

**Status:** On hold (communication proposal ready; client decision pending).

---

## #4 – Location Mode vs Custom Mode look duplicated

**Client feedback (Mentor, 8 Oct):** the two toggles appear to perform the same function; proposes
moving "Manage Silent Zones" under Location Mode and removing Custom Mode.

**Classification:** Design proposal – final decision pending client approval.

**Current behaviour (2026-10-10):**
- Custom Mode controls the user's own Silent Zones; Location Mode is reserved for public/predefined
  places, which are **not implemented** – so for most users Location Mode currently does nothing
  visible, which explains the perception of duplication.
- Accounts not yet "confirmed" (`focus_mode_settings.custom_mode_confirmed_at` NULL) use the
  compatibility rule zones = Location AND Custom; confirmed accounts use Custom alone
  (`src/utils/automationSync.js` `zonesEnabledFor`).
- Native engine has a single flag (`locationEnabled`) = "user zones enabled".

**Risks of removing Custom Mode outright:** accounts with Location ON + Custom OFF (e.g. the mentor's
earlier case) would start silencing at their zones again; older app versions keep Location-only
behaviour; `custom_mode_confirmed_at` would lose its purpose.

**Recommended safe approach (pending approval):** one visible "Silent Zones" control under Location
Mode (with "Manage Silent Zones"), mapped to the existing server fields (writes both modes together,
confirms the account); shown state = the current effective zone state; no server migration, no saved
zone changes; keep the server fields for compatibility.

**Decision (2026-10-10, owner):** HOLD – prepare a concrete proposal; do not remove Custom Mode or
change server settings.

**Concrete proposal (pending client approval):**
- *Control Center:* one row "Silent Zones" (toggle) under the Location Mode heading, subtitle
  "Silence your phone at places you add", with "Manage Silent Zones ›" below it. The separate
  "Custom" row is no longer shown. Calendar Mode unchanged.
- *Shown state:* the effective zone state, computed by the existing `zonesEnabledFor` (server
  `locationMode`, `customMode`, `customModeConfirmed`). Examples: L ON + C ON → ON; L ON + C OFF
  (mentor's earlier case) → OFF; L OFF + C ON → OFF if unconfirmed, ON if confirmed – i.e. exactly
  what the phone does today, so nothing changes when the screen is first shown.
- *Toggling:* writes `locationMode = customMode = new value` and `customModeConfirmed = 1` in one
  request (existing endpoint); asks for location permission when turned ON (as Custom does now).
  After the first toggle both fields agree, so older app versions (Location-only) behave the same.
- *Existing data:* no server migration; saved zones untouched; `custom_mode_confirmed_at` keeps
  its meaning; accounts never toggled keep today's behaviour.
- *Future public places:* not tied to `location_mode` (which would now mirror Silent Zones). Add a
  separate toggle backed by a new server field (e.g. `public_places_mode`) only when the feature
  exists.
- *Tests to add:* every L/C/confirmed combination → shown state; toggle writes both + confirms;
  permission prompt on ON; offline toggle reverts; old-app compatibility.

**Status:** On hold – client approval pending. No changes made.

---

## #5 – Slow geofence detection at the office (100 m radius)

**Client feedback (Mentor, 8 Oct):** an office zone with a 100 m radius did not silence the phone until
they had entered the building and walked around.

**Classification:** Reported functional issue – High priority. Cause not yet verified on the client's
device.

**Verified (code / emulator):**
- Geofences use ENTER/EXIT only – no DWELL, no loitering delay (`GeofenceRegistrar.kt`).
- Initial trigger ENTER|EXIT: already inside at registration → immediate ENTER (emulator).
- Geofence event → automation evaluation → DND applied within ~40 ms (emulator log 13:06:41.292 →
  13:06:41.334). DND application is not the delay.
- Play Services geofencer runs with BALANCED_POWER_ACCURACY, ~5–7.5 min background interval
  (emulator `dumpsys`); the app makes no location requests of its own in the background.
- No battery-optimisation handling (no exemption check or guidance).
- Diagnostics record only when the event was processed – not the triggering location's time/accuracy –
  so detection delay cannot yet be separated from delivery delay.

**Hypotheses (need the Samsung device):** balanced-power location updates + indoor Wi-Fi/cell accuracy
(main suspect); Samsung battery restrictions (Sleeping apps / Adaptive battery / Power saving);
"Improve accuracy" (Wi-Fi/Bluetooth scanning) off; zone centre placed from an inaccurate fix;
100 m radius small relative to the building and approach path.

**Decision (2026-10-10, owner):** diagnostics APPROVED (local, no behaviour change); Samsung test
NOT YET authorised.

**Implemented locally (uncommitted, 2026-10-10):** `GeofenceDiagnostics` – per geofence event:
receipt time, transition, zone ids, triggering fix time / age at receipt / accuracy / provider,
distance to zone centre rounded to 10 m (no coordinates), evaluation time, silencing/DND result;
plus Play Services errors and registration status changes with permission flags. Bounded (100),
app-private, never uploaded, cleared at logout. Files: `automation/GeofenceDiagnostics.kt`,
`automation/GeofenceEventReceiver.kt`, `automation/GeofenceRegistrar.kt`, `AutomationEngine.kt`
(clear at logout), `SilentFocusModule.kt` (`getGeofenceDiagnostics` / `clearGeofenceDiagnostics`).
Tests: `GeofenceDiagnosticsTest.kt` (7). Emulator: registration diagnostic verified
(`REGISTRATION status=DISABLED perms=1111`); event diagnostics need a signed-in account with a zone.

**Remaining verification:**
1. Emulator, signed in (needs approval): zone ENTER/EXIT → EVENT records with fix age, accuracy,
   distance, evalMs, DND result.
2. Choose a standalone build option for the Samsung (see `docs/SAMSUNG_GEOFENCE_TEST.md`) – both
   require uninstalling the installed app.
3. Samsung field test (needs separate authorisation) following `docs/SAMSUNG_GEOFENCE_TEST.md`.

**Status:** Diagnostics implemented locally; Samsung test not yet authorised.

---

## #6 – Urgent repeat callers should also work for WhatsApp calls

**Client feedback (original):** "This should work for whatsapp calls too." (Emergency Contacts →
Urgent Callers → Allow urgent repeat callers)

**Classification:** Requirement change – feasibility limited.

**Current behaviour (code):**
- Rule (`comms/CallExceptions.kt` `UrgentRepeatCallerException`): while Silent Focus is silencing,
  the call that brings one caller to 3 calls within 15 min rings; that caller then gets a 15-min
  cooldown (4th/5th calls neither counted nor allowed); counting restarts afterwards. Threshold 2–10,
  window 1–60 min, cooldown 0–240 min.
- Source: **cellular calls only** – `SilentFocusCallScreeningService` (Telecom call-screening role),
  caller = `tel:` number, stored only as a salted hash. The notification listener explicitly ignores
  notifications in the `call` category, so WhatsApp calls are never counted.
- "Ring" = `AutomationEngine.startBreakthrough` pauses Silent Focus's whole DND rule while the call
  rings (up to a cap) and `BreakthroughRinger` plays the system ringtone. Pausing the rule
  unsilences everything else for that time – acceptable for a cellular call (short, Telecom-bound),
  not for an arbitrary app.

**Feasibility:**
- Detecting a WhatsApp incoming call: possible via its notification (`category=call`, ongoing,
  full-screen intent, "Incoming voice call" text) but this is **not a documented WhatsApp
  interface** – it can change with any WhatsApp update or language; must be verified on device.
  Missed calls, ongoing calls and group calls post different notifications; distinguishing them
  relies on the same undocumented text/flags.
- Matching the same caller: only the notification title (contact name or number, group name for
  group calls) – hashable like message senders; not reliable when names change or for unknown numbers.
- Making the 3rd WhatsApp call ring through DND: Android offers **no per-call way** for our app to let
  another app's notification through. Options: (a) pause our DND rule (unsilences every app –
  rejected); (b) play Silent Focus's own alarm-type sound/vibration while the WhatsApp call
  notification is showing – works within our DND policy (alarms allowed) without unsilencing others,
  but WhatsApp's own ringtone and full-screen call screen stay suppressed (the user must answer from
  the notification shade); (c) tell the user to add WhatsApp as an allowed app in the DND/Modes
  settings – lets all WhatsApp notifications through, not just urgent callers.
- Samsung/Android: notification access already required; no new permission for (b); battery impact
  small (event-driven); Play policy: notification access must stay tied to the declared feature
  (already the case for auto reply).

**Proposed:** option (b) as an experiment behind a setting, clearly labelled ("Silent Focus will
sound an alert for a repeated WhatsApp caller; answer from the notification"), after device
verification of WhatsApp's call notification on the client's phone. Otherwise explain to the client
that selective WhatsApp ringing is not supported by Android.

**Device test plan:** cellular repeat calls (3 in 15 min → 3rd rings; 4th within cooldown silent);
WhatsApp voice call from saved/unsaved contact; WhatsApp video call; group call; missed vs answered;
messages from the same contact (must not count); two different callers interleaved; app closed /
phone locked; record notification category/flags (no content) via a debug log.

**Status:** On hold – technical decision.

---

## #7 – Move Privacy & Data and Permissions to the Accounts tab

**Client feedback (original):** "These 2 sections, need to be on the last tab." and "It makes more
sense to be integrated on the last page."

**Classification:** Design change (requested; no behaviour change).

**Current structure:**
- Control tab (`src/screens/SettingScreen.js`): "PRIVACY & DATA" (Clear activity history →
  `onClearActivity` = confirmation dialog + `clearLocalActivitySafely` with sync/read-back
  verification; Clear learned locations → `onClearLearned`, which clears immediately – a
  confirmation exists only when Smart Location Learning is turned off) and "PERMISSIONS"
  (`<PermissionHub />`: DND, Alarms & reminders, Notification access, Precise location, Location all
  the time, Device location, Calendar, Call screening, Contacts, Phone state). `PermissionHub` is
  self-contained: refreshes on screen focus and on app resume, opens the right Android settings.
- The Smart Location Learning section in Control also has a "Clear learned locations" button.
- Accounts tab (`src/screens/ProfileScreen.js`, ScrollView): profile fields, "Data & Legal"
  (Terms of Service, Privacy Policy, **"Active Permissions" – a static text row "Location,Calendar,
  Notification" that does not reflect real permission state**), Add or Change Password, Delete
  Account, Logout.

**Proposed placement (Accounts tab):** profile → **Permissions** (live `PermissionHub`, replacing the
static "Active Permissions" row) → **Privacy & Data** (Clear activity history, Clear learned
locations) → Data & Legal (Terms, Privacy Policy) → Account (password, Delete Account) → Logout.
Remove both sections from Control; keep the Smart Location Learning toggle in Control with a single
"Clear learned locations" (in Accounts) to avoid duplicates.

**Must stay the same:** Clear activity confirmation + `clearLocalActivitySafely` (sync, read-back,
retention, kept-items message); Clear learned locations confirmation; permission refresh on
focus/resume and Settings links; password, Delete Account and Logout flows unchanged. The Accounts
ScrollView already scrolls – check small screens (bottom padding above the tab bar).

**Implementation (2026-10-10, Batch 1, uncommitted):** Accounts tab order: … Calendar →
**Permissions** (live `PermissionHub`, replacing the static "Active Permissions" row) → **Privacy &
Data** (note, Clear activity history, Clear learned locations (N)) → **Legal** (Terms of Service,
Privacy Policy; was "Permissions & Privacy") → **Account** (Add or Change Password, Delete Account;
was "Data & Legal") → Logout. Control no longer shows either section or a "Clear learned
locations" button (learning toggle kept; its turn-off prompt still offers clearing). Actions shared
in `src/utils/privacyActions.js` (`confirmClearActivity` → `clearLocalActivitySafely`, unchanged
messages; `clearLearnedNow` – immediate, as before). Password, Delete Account and Logout code
unchanged. Tests in `__tests__/batch1.test.js`.

**Status:** Implemented · Automated PASS · Visual PASS (light + dark, emulator, user 3, 2026-10-10).

---

## #8 – Edit/Add Silent Zone dark-mode contrast (+ blank map)

**Client feedback (original):** "Please sort out the colour contrast for dark mode." (Silent Zones →
Edit Silent Zone)

**Classification:** Confirmed defect; the blank/beige map is tracked as a separate potential defect.

**Findings (`src/screens/MapScreen.js`, shared by Add and Edit Silent Zone):**
- Unselected radius chips: text `Colors.black` on `#5555551F` → on the dark background 1.19:1
  (needs 4.5). Category chips use the same styles.
- Selected chip: white on `#ff6600` ≈ 2.9:1 (visible, but below 4.5 for 13 px text).
- Search places (GooglePlacesAutocomplete) and the name input: light-mode input background
  (`Colors.textInputBg`) and library-default text/placeholder colours; name input placeholder `#999`.
- **Same root cause as #2:** screens hard-code light-theme colours (`Colors.black`, `#5555551F`)
  instead of dark-aware values.
- Blank/beige map: Google Maps shows a beige grid when tiles can't load – typically an invalid,
  missing or restricted API key (the key now comes from the gitignored `android/local.properties`
  `SF_MAPS_API_KEY`; a build made without it, or a key restricted to a different signing
  certificate, shows exactly this). Separate from contrast; verify the key in the client's build.

**Proposed:** shared dark-aware palette (with #2): unselected chip `#2A2A2A` + text `#E6E6E6`;
selected chip `#ff6600` with dark text `#111111` (≈ 6.9:1) or a darker orange with white text;
inputs `#1F1F1F` background, text `#F2F2F2`, placeholder `#A9A9A9`. Chip styling stays generic so
#3's presets drop in unchanged.

**Implementation (2026-10-10, Batch 1, uncommitted):** `MapScreen.js` (Add and Edit) uses the shared
palette: radius and category chips (unselected `#1E1E1E`/`#E6E6E6`, selected `#ff6600` with
`#111111` text 6.4:1), search box and name input (dark `#1E1E1E`, text `#F2F2F2`, placeholder
`#A9A9A9`), hint and zone-meta text `#BDBDBD`, white back icon; light mode unchanged; radius presets
untouched (still #3). Not in scope / unchanged: "Save Zone" button and category tags (white on
orange, about 2.9–3.6:1) – flagged for a later decision.

**Map (verified 2026-10-10):** Google rejects the configured key – `REQUEST_DENIED: "The provided API
key is invalid."` – with and without the app's package/certificate. This explains the blank beige map
and failing place search. Needs a valid key (Google Cloud) in `android/local.properties`
`SF_MAPS_API_KEY`; no code change.

**Remaining contrast (recorded 2026-10-10; implemented 2026-10-10 – see Batch 2 below):**
- "Save Zone" button: white on `#ff6600` = 2.94:1 (fails 4.5). Minimal fix: dark text `#111111` on the
  same orange = 6.43:1 (matches the selected chips). Alternative: `#C2410C` with white text = 5.18:1.
- Category tags (zone list): white on `#d46c0d` = 3.53:1. Minimal fix: `#A8550A` with white text = 5.29:1.
- Light mode only, noted: "Cancel" text `#D6721E` on white = 3.34:1.

**Status:** Implemented · Automated PASS · Visual PASS for controls (light + dark). Maps SDK rendering and place search: **BLOCKED – API key unavailable** (owner to provide; not re-tested meanwhile).

---

## #9 – WhatsApp calls missing from Activity Center

**Client feedback (Mentor, 10 Oct):** normal calls are displayed correctly, but WhatsApp calls are
missing.

**Classification:** Requirement change.

**Findings:** Activity call entries come only from Telecom call screening (cellular). WhatsApp call
notifications are ignored by the notification listener (`call` category filtered out). Detecting
incoming / missed WhatsApp calls is possible only from WhatsApp's notifications (undocumented, may
change, language-dependent); "answered" is not reliably observable (the ongoing-call notification
appears, but not who answered on which device). Duplicates: WhatsApp re-posts/updates call
notifications – needs a per-notification key + time window de-duplication.

**Proposed:** record WhatsApp incoming and missed call notifications as `WHATSAPP_CALL` entries
(caller name as shown, no number), de-duplicated by notification key; "answered" not promised.
Requires device verification. Separate from #6.

**Status:** On hold – technical decision.

---

## #10 – Message previews and opening the originating app

**Client feedback (Mentor, 10 Oct):** message previews are required, and tapping an Activity entry
should open the originating messaging app (incl. WhatsApp). This behaviour existed previously.

**Classification:** Requirement change; tap-to-open already works (regression guard), previews
removed by the privacy redesign.

**Findings:**
- Tap-to-open: implemented (2026-10-10) – opens the still-posted notification (conversation) or else
  the app's launcher entry; verified on the emulator with Google Messages.
- Previews: the earlier build showed the server log `content` (message text uploaded to the server)
  and read the SMS inbox; the current design deliberately never stores or uploads message text
  (`ActivityEvents.kt`), and SMS read access was removed (Play-restricted).
- Options: (a) show the preview only while the original notification is still posted (read live,
  never stored); (b) keep the notification text on the phone only (local, encrypted at rest,
  cleared with history/logout, never uploaded) with a user setting and privacy-policy disclosure;
  (c) restore server-side storage – not recommended.

**Status:** On hold – privacy decision.

---

## #11 – Double-tap a call entry to open Phone / WhatsApp

**Client feedback (Mentor, 10 Oct):** double-tapping call entries should open the Phone app or
WhatsApp, ideally at the relevant call/conversation.

**Classification:** Requirement change.

**Findings:** call entries are not tappable today. Cellular: opening the dialer / call log is a
standard Android intent (`ACTION_DIAL` or call log); opening "the relevant call" is not supported –
the dialer with the number pre-filled is possible only if a number is stored (today only a redacted
one is kept). WhatsApp: only via its call notification's own intent while still posted, else the
WhatsApp launcher – no supported deep link to a specific call. Double-tap: not an Android convention
and hard for accessibility (TalkBack uses double-tap to activate) – recommend single tap, consistent
with message entries.

**Status:** On hold – depends on #9 and a UX decision (single vs double tap).

---

## Batch 1 – verification status (2026-10-10)

| Step | #1 | #2 | #7 | #8 |
|---|---|---|---|---|
| Implemented (local, uncommitted) | ✅ | ✅ | ✅ | ✅ |
| Automated PASS (Jest 287/287, native 177/177, lint 0 errors) | ✅ | ✅ | ✅ | ✅ |
| Built APK check | ✅ label "Silent Focus", package `com.SilenceFocus` | – | – | – |
| Visual verification (emulator, light + dark) | APK label only | ✅ | ✅ | ✅ controls; map tiles blocked (key) |

**Remaining blockers**
1. ~~Visual verification~~ – done 2026-10-10 as user 3 (see below).
2. **Maps SDK rendering and place search: BLOCKED – API key unavailable** (2026-10-10). The configured
   key is invalid; the owner will provide a new one. Until then the key is not re-tested and no
   borrowed, unrestricted or hard-coded key is used. Steps below; verify tiles and place search once
   the key exists.
3. Client test APK: depends on the signing certificate of the client's current install (below).

### Visual verification results (2026-10-10, Pixel 8 emulator API 36, user 3)

Screens checked in light and dark: Add Schedule, Edit Schedule, Add Silent Zone, Edit Silent Zone,
Control tab, Accounts tab (plus the Clear activity dialog, Cancel only). Nothing was saved.

- **Add/Edit Schedule:** selected days copper with white text (dark `#9A5F28`), unselected pills
  readable; unset times show the placeholder grey, set times white on copper in dark (black in light).
  Light mode looks as before.
- **Add/Edit Silent Zone:** search box and name input dark with readable placeholder/value; radius
  and category chips readable; selected 150 m chip orange with dark text. Map blank (invalid key).
- **Control:** ends at Smart Location Learning; no Permissions, Privacy & Data or Clear learned
  locations. Scrolls fully in both modes.
- **Accounts:** Account & Profile → Calendar → Permissions (live status) → Privacy & Data → Legal →
  Account → Logout. Clear activity dialog shows Cancel/Clear; Cancel changed nothing.
- **Pre-existing, noted then:** light-mode Accounts row text `#999` on the light card ≈ 2.6:1;
  status-bar icons stay dark in dark mode; Save Zone and category tags (see #8). All fixed in
  Batch 2 below. Add Schedule Confirm is dimmed until a time is set (disabled state, by design).

## Batch 2 – logout activity leak + remaining contrast (2026-10-10)

Implemented locally (uncommitted). Approved by the owner on 2026-10-10.

### A. Logout Activity cross-account leak – Implemented · Automated PASS · Runtime verification pending

**Cause:** logout runs `AutomationEngine.reset()`. This clears the journal and its owner, then
evaluates with `TriggerReason.LOGOUT`. If the phone was silenced, that evaluation appended a
`SILENCE_ENDED` (reason `LOGOUT`) entry to the now ownerless journal. The next sign-in
(`claimHistory` → ADOPT) took it over, even for a different account.

**Fix (native, minimal):**
- `ActivityEvents.journalsActivity(reason)` is false only for `LOGOUT`. `journal()` then
  records nothing; it only keeps the rule-window bookkeeping in sync. Silencing still ends, and the
  session history is still closed by the same evaluation.
- `claimHistory` first drops journal entries whose reason is `LOGOUT` (left by older versions),
  so an existing leftover can't be adopted either. Only the engine writes `reason`, so call and
  message events are never touched. SILENCE_* types are not uploaded, so no pending server data
  and no outbox content changes.
- All logout paths reach the same native reset: user logout, offline logout, forced 401
  (`clearSession('logout')`), deleted account, keep-history fallback, and interrupted-logout
  recovery (`ensureSignedOut` → `finishSignOut`).

**Tests:** `android/app/src/test/.../LogoutJournalTest.kt` (11): LOGOUT journals nothing; all other
reasons still journal; Manual OFF / override expiry / schedule, zone and calendar exits still
record; normal, offline and 401 logout leave an empty, ownerless journal with pending data in the
user's outbox; a different account can't inherit (ADOPTED with empty journal); outbox-save failure
keeps user 3's history and blocks / then moves on another account's sign-in; interrupted-logout
recovery; legacy leftover dropped; same account keeps its own history.

**Not run on the emulator:** a real logout / account switch needs separate approval. The leftover
entry already on the emulator (user 3) is removed at the next sign-in by the claim cleanup.

### B. Remaining contrast – Implemented · Automated PASS · Visual PASS (light + dark)

| Item | Before | After |
|---|---|---|
| Save Zone and "+ Add Silent Zone" (same style) | white on `#ff6600` 2.94:1 | `#111111` on `#ff6600` 6.43:1 |
| Zone category tags | white on `#d46c0d` 3.53:1 | white on `#A8550A` 5.29:1 |
| Accounts light secondary text (rows, Inactive, note) | `#999` ≈ 2.6:1 on card | `#666666` ≈ 5:1 on card, 5.7:1 on white |
| Accounts light section titles | `#888` 3.54:1 | `#666666` (dark mode keeps `#888`, 5.3:1) |
| Zone form Cancel (light) | `#D6721E` 3.34:1 | `#A8550A` 5.29:1 (dark keeps `#D6721E`, 5.65:1) |
| Add/Edit Schedule Confirm (light and dark) | white on `#B87333` 3.79:1 | white on `#9A5F28` 5.2:1 |
| Status-bar icons | always dark | light icons in dark mode (App and bottom-sheet modal) |

`CustomButton` gained an optional `color` prop (default `Colors.themeColor`), so its other 9
uses are unchanged; the disabled look is unchanged. Tests: `__tests__/contrastFixes.test.js`.

Emulator check (user 3, nothing saved): Edit Schedule, Silent Zones list and Edit Silent Zone, and
Accounts in light and dark, with white status-bar icons in dark mode. The category tag couldn't be
shown (the only zone has no category, and setting one would mean saving a zone); it is covered by
the tests.

**Still below 4.5:1, not in scope (noted):** light selected radius/category chip (white on
`#ff6600`, 2.94:1); light selected day pill (white on `#B87333`, 3.79:1); `#D6721E` link and outline
text on light backgrounds ("Use My Current Location", "Modify Filters", "+ Sync a Calendar",
≈ 3.0–3.3:1); light zone-meta text `#888` on the zone card.

## Batch 3 – remaining light-mode accessibility (2026-10-10)

Implemented locally (uncommitted) · Automated PASS · Visual PASS (light + dark, emulator, user 3,
nothing saved). Owner-approved 2026-10-10.

| Item | Before (light) | After (light) | Dark mode |
|---|---|---|---|
| Selected radius / category chips | white on `#ff6600` 2.94:1 | `#111111` on `#ff6600` 6.43:1 | unchanged (already `#111111`) |
| Selected weekday pills + set time pills | white / black on `#B87333` 3.79 / 5.5:1 | white on `#9A5F28` 5.2:1 (same copper as dark) | unchanged |
| Orange link text | `#D6721E` 3.0–3.3:1 | `#9A4F08`: 6.0:1 white, 5.0:1 zone/schedule card, 5.3:1 Accounts card, 5.5:1 suggestion card | `#D6721E` kept, 4.8–5.7:1 |
| Zone list meta ("150 m radius · Tap to edit") + form hint | `#888` 2.95:1 on the card | `#5C5C5C` 5.56:1 | `#BDBDBD` unchanged |

- Links covered: Silent Zones "Use My Current Location"; Accounts "Modify Filters", "+ Sync a
  Calendar", "Disconnect Calendar", "+ Add Phone Number", calendar provider options; Home schedule
  card "Add Schedule ＋", "Edit", "Delete", "See all"; Control "Manage Silent Zones ›", "Zone replies,
  frequency & access ›", "Manage emergency contacts ›", Auto Reply "Edit" and the modal "Cancel";
  Learning suggestion "Not Now" / "No thanks"; Today summary "Session history ›"; Permissions "Fix"
  (outlined); Emergency contacts "Change call-screening app ›". Zone form Cancel uses the same colour.
- Shared helper `linkColor(isDark)` / `LINK_LIGHT` / `LINK_DARK` in `src/utils/theme/controlColors.js`.
- Chips and weekday pills now expose `accessibilityState.selected` (verified via uiautomator:
  `selected="true"` on Mon/Wed, 150 m, Custom).
- Selected vs unselected copper pill 4.3:1 (≥ 3:1 indicator). Selected orange chip vs unselected
  light chip is 2.4:1 by fill alone; the selected state is also carried by the text-colour change and
  the accessibility state – the orange (brand) was kept as approved.
- Large bold orange titles ("Control Center", Activity title) stay `#D6721E` (3.3:1 ≥ 3:1 large-text
  threshold). Not changed: white text on orange *buttons* (Permissions "Fix" required state, learning
  suggestion and emergency-contact buttons – 3.3:1) and the Activity "server" badge – not in this
  batch's scope; listed for a later decision.
- Test hygiene: `__tests__/App.test.tsx` no longer fetches the live `app-config` (stubbed); this was a
  read-only GET from earlier test code.
- Tests: `__tests__/a11yBatch3.test.js` (new), `__tests__/batch1.test.js` (light values updated to the
  approved ones).

---

## Implementation plan – remaining client issues (2026-10-10, for approval; not implemented)

Decision document: `docs/DECISIONS_REMAINING_ISSUES.md` (2026-10-10) – capture scope, navigation,
preview options, repeat-caller limits, geofence test, APK certificate path.

Button contrast (approved 2026-10-10) – **Implemented · Automated PASS · Visual PASS (light + dark)**:
the Permissions "Fix" (required), the learning-suggestion primary button and the Emergency Contacts
banner/"+ Add Contact" buttons now use `ACTION_BUTTON_BG` `#9A4F08` (white text 6.0:1; was 3.34:1).
Verified on the emulator ("+ Add Contact", light and dark); the "Fix" and suggestion buttons are not
shown in the current state and are covered by tests. Still white on `#D6721E`, not in the approved
scope: Auto Reply Save / small button / selected chip, Control modal Save, the selected Activity tab,
the Activity and Session history Retry buttons, and the error-screen button.

Owner decisions 2026-10-10:
- #9: diagnostic probe code prepared for review – see `docs/WHATSAPP_CALL_PROBE.md`. Capture NOT
  enabled.
- #11: single tap with fallbacks – approved, not implemented.
- #10: Option A (ephemeral previews) selected, not implemented.
- #6: on hold until #9 is device-verified.
- #5: existing diagnostics kept; no device tests.
- APK: no build or distribution until the certificate, installed versionCode and update path are
  established.

Order chosen so each step builds on the previous one. Each step: local implementation → unit tests →
emulator check (no production writes) → device verification where WhatsApp/Samsung behaviour matters.

### Step 0 – WhatsApp call notification capture (prerequisite for #9, #6, #11) – needs approval + a device with WhatsApp
- Debug-only logger in the notification listener for `com.whatsapp` / `com.whatsapp.w4b`: records
  structure only – category, channel id, ongoing / full-screen flags, action count, post/remove
  times, salted hash of the title – never text, numbers or names.
- Scenarios: voice and video call (saved / unsaved contact), group call, missed, declined, answered
  on this phone / another device, phone locked, app closed; English and the client's phone language.
- Output: fixtures for the classifier tests. Risk: WhatsApp's call notifications are not a documented
  interface and may change; the classifier uses structural signals first, text only as a fallback.

### Step 1 – #9 WhatsApp calls in the Activity Center
- Native: allow `category=call` notifications from WhatsApp only (everything else keeps the current
  filter); pure `WhatsAppCallClassifier` → INCOMING / MISSED / ONGOING / IGNORE.
- Journal: new types `WHATSAPP_CALL` (incoming) and `WHATSAPP_MISSED_CALL`, category CALL, fields:
  app, appPackage, notificationRef, caller label as WhatsApp shows it (**decision needed** – local
  display only vs. hashed), never a number. Merge re-posts of the same notification; an INCOMING
  followed by MISSED for the same notification becomes one entry. "Answered" not promised.
- Server: local only at first. Uploading needs new backend log types (separate approval + deploy).
- JS: Activity shows them under Calls with a WhatsApp label; retention, Clear activity and the logout
  outbox rules apply unchanged (non-uploaded types).
- Tests: classifier on captured fixtures, merge/dedupe, retention, clear, rendering.

### Step 2 – #11 Open the app from call entries
- Recommend **single tap** (double-tap conflicts with TalkBack, which uses double-tap to activate;
  message entries already use single tap). **UX decision needed.**
- Cellular entries: open the Phone app's call log (standard intent). Opening a specific call or
  pre-filling the number is not possible because only a redacted number is stored (by design).
- WhatsApp entries: open the still-posted notification's own intent (reusing the message tap path);
  otherwise launch WhatsApp. No supported deep link to a specific WhatsApp call.
- Tests: intent selection per entry type; fallback when the notification is gone or the app is
  missing.

### Step 3 – #10 Message previews – privacy decision needed first
- Recommended **(a) live preview**: while the original notification is still posted, the Activity
  screen asks native for its text by `notificationRef` and shows it; nothing is stored or uploaded.
  Previews disappear once the notification is dismissed or read. No privacy-policy change beyond the
  existing notification-access disclosure.
- Optional **(b) stored preview**: text kept on the phone only (encrypted, Android Keystore), behind a
  user setting (default off), cleared with Clear activity / logout, never uploaded; needs a
  privacy-policy update and Play data-safety review.
- Not recommended: (c) uploading message text to the server again.
- Tap-to-open the originating app already works (regression tests kept).

### Step 4 – #6 Urgent repeat callers for WhatsApp – after Step 1 is device-verified
- Count WhatsApp INCOMING calls per caller hash with the existing rule (threshold / window /
  cooldown), kept separate from cellular counts.
- On the threshold call, play Silent Focus's own alert (alarm audio, allowed by our DND policy) while
  the WhatsApp call notification is showing; stop when it is removed or after a cap. Our DND rule is
  **not** paused, so other apps stay silent. WhatsApp's own ringtone and full-screen screen stay
  suppressed; the user answers from the notification.
- New setting "Alert for repeated WhatsApp callers" (default off) with that explanation.
- Tests: counting/cooldown, alert start/stop, no DND pause, setting off = no effect.

### Step 5 – #5 Geofence diagnostics – implemented; verification needs approval
- Emulator ENTER/EXIT with the existing zone (`adb emu geo fix`): records fix age, accuracy, distance,
  evaluation time and DND result. Note: silencing creates a session that syncs to the server for
  user 3, so it needs explicit approval.
- Optional: a debug-only "Export diagnostics" (share sheet, no coordinates) for the field test.
- Samsung field test per `docs/SAMSUNG_GEOFENCE_TEST.md` – needs authorisation and a build the client's
  phone can install (see APK blockers).

### Not scheduled (waiting for client decisions)
- #3 radius presets – communication proposal ready.
- #4 single Silent Zones control – proposal ready.

### Decisions needed from the owner
1. Approve Step 0 (device + WhatsApp test calls).
2. WhatsApp caller label: show the name as WhatsApp displays it (local only) or a neutral label.
3. Single tap (recommended) vs double tap for call entries.
4. Previews: (a) live only (recommended) or also (b) stored on the phone.
5. #6 option (b) Silent Focus alert – yes/no after Step 1.
6. Geofence emulator verification (creates user-3 sessions on the server) and the Samsung test.

## Batch 5 – remaining orange controls, #11, #10, probe review (2026-10-10)

Implemented locally (uncommitted). Owner-approved 2026-10-10.

**Results**
- Jest: 368/368.
- Native: debug 203/203, release 194/194.
- Lint: 0 errors.
- Debug build: OK; `SF_WHATSAPP_CALL_PROBE=false`.
- Emulator: Pixel 8, API 36, user 3. No saves, no production writes.

### A. Remaining orange controls – Implemented · Automated PASS · Visual PASS where reachable

| Control | Change | Emulator |
|---|---|---|
| Auto Reply "Save replies", "Open settings", selected frequency chip | `#D6721E` → `ACTION_BUTTON_BG` `#9A4F08` (white 6.0:1); selected chip border matches | ✅ light + dark (chip `selected=true` announced; Save shown in its disabled state – unchanged 50 % opacity) |
| Control auto-reply dialog "Save" | same | ✅ dark (opened, then Cancel – nothing saved) |
| Activity selected tab | same; unselected tabs unchanged (no fill, `#555` / `#AAA` text, 7.5 / 8.1:1) | ✅ light + dark; `tablist` / `tab` roles with `selected` state verified (All → Calls) |
| Activity and Session history "Try again" | same | tests only (needs a load failure) |
| Error-screen button | `#9A4F08` literal (no imports on the crash path) | tests only (needs a crash) |

The Activity row icon background stays `#D6721E`: it holds a white icon (graphics rule 3:1 → 3.3:1).

### #11 Call rows – single tap – Implemented locally · Automated PASS · partly emulator-verified

- Cellular call rows (`INCOMING_CALL`, `URGENT_REPEAT_CALLER`, `EMERGENCY_BREAKTHROUGH`; native
  entries carry no package) open the Phone app's call history. The fallback is the dialer
  (message: "Call history isn't available. Opened the Phone app."), then the alert "No Phone app is
  available on this phone." A specific call is never claimed.
- Rows that carry an app package (future WhatsApp call entries, #9) use the existing path: the
  still-posted notification, else the app, else an alert.
- Accessibility hint: "Opens the Phone app's call history". Single tap only.
- Native: `comms/PhoneApp.kt` (`ACTION_VIEW` with call-log URI **and** type, then `ACTION_DIAL`; no
  permission). Bridge: `openPhoneApp`.
- **Emulator:** with the type alone, the intent resolved to Contacts' "non-phone" screen; with the
  URI alone, to Google Messages. URI + type together resolves to Google Phone and opened it on
  **Recents** (verified). That is why the code uses both.
- **Not verified:** tapping a real call row in the app. User 3's journal has no call entries, and
  creating one needs Silent Focus on (a session that syncs to production) – not done. The Samsung
  Phone app's handling of the intent is also still to confirm.
- Tests: `__tests__/previewsAndCalls.test.js`, `PreviewsAndPhoneTest.kt`. The existing
  `notifications.test.js` expectation was updated (call rows are now tappable).

### #10 Ephemeral message previews (Option A) – Implemented locally · Automated PASS · end-to-end display NOT verified

- **What is read:**
  - Message rows only, by their existing `notificationRef`.
  - The text is read from the still-posted notification at display time: the newest message from
    someone else (MessagingStyle), else the notification text.
  - Our own (auto) replies are never shown.
  - One line, at most 160 characters.
- **Never stored, logged, uploaded or put in diagnostics:**
  - The text exists only in Activity screen state.
  - It is dropped on blur and when the app goes to the background.
  - Rows never carry it.
  - Sync, outbox, API and error-reporting code never touch it (test-enforced).
  - The native lookup has no logging or storage calls (test-enforced).
- **Lifecycle:**
  - Previews refresh when notifications are posted or removed: an event with no payload, debounced
    400 ms.
  - They also refresh on focus and on app resume.
  - A dismissed, read or replaced notification → no preview.
  - After an app restart, previews are simply re-read from whatever is still posted.
- **Lock screen:** nothing is returned while the keyguard is locked.
- **Android sensitive-content redaction (15+):** the system redacts before any listener sees the
  content. There is no public API to detect it (`Ranking.hasSensitiveContent` is hidden in SDK 36),
  so at most Android's placeholder can appear – never the original.
- **Accessibility:** the preview is read with the row ("Message: …").
- **Permissions:** none added. The declared set is unchanged (test-enforced).
- **Emulator:**
  - verified a synthetic shell notification causes no crash and no journal or probe record;
  - verified the Activity screen and tabs render.
- **Not verified:** a preview actually shown on a row. That needs a `MESSAGE_RECEIVED` row, which
  is recorded only while Silent Focus is on. That creates a session plus an uploadable message log
  for user 3 (production write). User 3's journal is currently empty.
- **Options for the end-to-end check (decision needed):**
  - (a) approve synthetic user-3 test data being uploaded;
  - (b) approve a debug-only "discard unsynced local test data" tool, used with a writes-disabled
    build;
  - (c) verify later on a separate test account.

### Probe safety review (#9) – done; changes recommended before any capture

See `docs/WHATSAPP_CALL_PROBE.md` → "Safety review". Main points:
- The stored salted hashes are pseudonyms that whoever reads the file can reverse for phone
  numbers, because the salt is stored alongside them.
- Recommended before capture:
  - in-memory or Keystore HMAC with per-capture ordinals;
  - drop `keyRef`;
  - identifiers only for call-like notifications;
  - prune on start;
  - clear on owner change and on Clear activity.

Capture stays disabled.

### Still on hold
#9 classification and #6 (until real-device probe verification), #5 geofence testing. Maps:
**BLOCKED – API key unavailable.**

## Batch 6 – probe hardening, harness audit, geofence proposal (2026-10-10)

**Results**
- Jest: 368/368.
- Native: debug 211/211, release 197/197.
- Lint: 0 errors.
- Debug build OK; probe flag `false`.
- Emulator: probe store empty after install (old data wiped); still signed in as user 3.
- No production writes.

### A. WhatsApp probe privacy hardening – Implemented locally · Automated PASS · capture NOT enabled
- Persistent salted hashes are replaced by per-capture pseudonyms (`c1`, `n1`, …). They come from an
  in-memory HMAC key that is never persisted; the mapping lives in memory only.
- The notification-key hash is removed.
- Caller pseudonyms are recorded only for call-like notifications (call / missed-call category,
  CallStyle, call type, full-screen intent).
- Retention is 24 h / 200 records, pruned at every probe-build start. The old (v1) format and the
  old salt are dropped.
- Probe data is cleared on:
  - logout;
  - an account claim that changes the owner (MOVED / ADOPTED);
  - "Clear phone activity".
- Default off and release exclusion are unchanged (tests).
- Details: `docs/WHATSAPP_CALL_PROBE.md`.

### B. #10 / #11 end-to-end – harness audit done, design awaiting approval
- **Audit:**
  - all automatic writes go through `serverWritesAllowed()`: activity/session sync, the logout-outbox
    flush, the auto-reply push;
  - user-initiated screen saves don't (by design);
  - current debug builds upload for user 3 (`local.properties`).
  - Gap: pending synthetic items would upload from a later normal debug build. The design therefore
    makes synthetic rows non-uploadable in main code.
- **Design (not implemented):** see `docs/ACTIVITY_TEST_HARNESS.md`.
  - debug-only, flag-gated, DUMP-protected adb trigger;
  - synthetic, tagged rows, with notifications posted by Silent Focus itself;
  - uploads disabled in the test build and synthetic rows never uploadable;
  - no sessions;
  - cleanup by run id plus 2 h expiry;
  - snapshot comparison before and after.
- **Status:** #10 and #11 – **Automated PASS, end-to-end verification pending.**

### D. Geofence entry delay (#5) – proposal ready (no behaviour change)
`docs/GEOFENCE_ENTRY_DELAY.md`:
- a ~2 min entry delay is within Android's documented typical geofence latency; indoor accuracy
  with a 100 m radius is the likely limit;
- Tier 0: measure with the existing diagnostics, uploads off;
- Tier 1: battery-optimisation guidance (UI only) and a radius hint;
- Tier 2 (experimental, after Tier 0): an outer approach ring plus a ≤3-minute foreground
  high-accuracy arrival check. It needs the foreground-service-location permission and a Play
  declaration.
- No field test has been run.

### Unchanged
- Maps: **BLOCKED – API key unavailable.**
- #6: on hold until call detection is verified on a real device.

### Google Maps key – configuration steps (owner, Google Cloud Console)

1. console.cloud.google.com → select the project used for Silent Focus → make sure Billing is linked.
2. APIs & Services → Library → enable **Maps SDK for Android** and **Places API** (the in-app "Search
   places" box calls the Places Autocomplete web service). If only "Places API (New)" can be enabled
   for this project, note it – the search library may need a follow-up change.
3. APIs & Services → Credentials → Create credentials → **API key**. Edit it:
   - Name: e.g. "Silent Focus Android".
   - Application restrictions → **Android apps** → Add: package `com.SilenceFocus` + SHA-1
     `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` (debug/test builds). Also add the
     upload-key SHA-1 (`keytool -list -v -keystore <upload keystore> -alias <alias>`, run locally) and,
     if the app is on Google Play, the **App signing key** SHA-1 from Play Console → Setup → App
     integrity.
   - API restrictions → Restrict key → Maps SDK for Android (+ Places API, see note).
4. Note: Android-app restrictions only apply to requests that carry the app's identity. The Maps map
   view does; the JavaScript place-search requests currently do not. With an Android-restricted key,
   place search will be refused until the search requests send `X-Android-Package` /
   `X-Android-Cert` headers (small code change, not yet approved) – or use a second key restricted
   to Places API only with a usage quota.
5. Put the key in `android/local.properties` as `SF_MAPS_API_KEY=` (gitignored; never commit or paste
   it in chat), rebuild, and delete the old/invalid key in the console.

### Client test APK – delivery recommendation

Application id stays `com.SilenceFocus`. Whether an APK can update the client's install depends on
the certificate that signed it – identify it first (non-secret SHA-1):
- if installed from Google Play: Play Console → App integrity → App signing key certificate;
- if installed from an APK file: `apksigner verify --print-certs <file>.apk`;
- or, with approval and USB access: `adb shell dumpsys package com.SilenceFocus` (signatures).

| Client's current certificate | Deliver | Updates in place? |
|---|---|---|
| React Native debug key (SHA-1 5E:8F…F6:25) | Debug build with the JS bundle embedded | Yes |
| The owner's upload key (sideloaded release) | Release build signed locally with the same upload key | Yes |
| Google Play app signing key | Upload to a Play testing track (internal testing) | Yes, via Play |
| Unknown / different | – | No – would need uninstall (not approved) |

Debug builds only upload activity/sessions for the account in `SF_DEBUG_SERVER_WRITES_ACCOUNT_ID`;
set it to the client's test account if their testing needs server sync.

**Remaining APK blockers (2026-10-10):**
1. Signing certificate of the client's current install not yet identified – decides which build can
   update in place (table above). Uninstalling is not approved.
2. No release signing configured (no upload key in the project); a release build would be unsigned.
   Google Sign-In is registered only for the debug certificate – a release / Play build needs its
   SHA-1 added to the OAuth client.
3. All Batch 1–3 work, the logout fix and diagnostics are uncommitted; build from a committed,
   tagged state so the client build is traceable. `versionCode 1` / `versionName "1.0"` must be
   raised for any in-place update through Play.
4. Maps SDK rendering and place search BLOCKED – API key unavailable. Zones can still be created
   with "Use My Current Location"; map tiles, tapping the map and place search need a valid key.
5. Logout activity-leak fix: runtime verification pending (needs approval for a real logout /
   account switch).
6. Distribution to the client: not authorised yet.

---

## Batch 7 – test harness, geofence Tier 0/1 preparation (2026-10-11)

**Owner decisions (2026-10-11):**
- #10/#11 harness conditionally approved: implement and test locally; report the safety checks and
  the ADB plan before any injection.
- #5 Tier 0 checklist and Tier 1 design approved; no device test and no behaviour change.
- The WhatsApp probe stays disabled.
- Maps stays blocked; #6 stays on hold.

**Results**
- Jest: 379/379 (+11).
- Native: debug 234/234 (+23), release 209/209 (+12).
- ESLint: 0 errors.
- Builds OK: debug, release (unsigned) and the harness APK (scratchpad only, not installed).
- No emulator changes; still signed in as user 3.
- No production writes.

### A. #10/#11 synthetic test harness – Implemented locally · Automated PASS · injection NOT run
- **Main-code exclusion.** Synthetic rows are never pending, synced, verified, outboxed, recovered
  or flushed (native and JS). They also can't evict real journal entries (separate retention cap).
  Real upload, outbox and retention results are unchanged (tests).
- **Debug-only harness:** DUMP-protected ADB receiver; flag off by default. Seeding is refused
  unless:
  - the flag is on;
  - uploads are off in that build;
  - no run is active;
  - no real entry would be trimmed.
- **Run contents:** own-app notifications and 3 tagged rows. Cleanup by run id; 2 h janitor.
- **Release exclusion:** release APK has no harness classes, strings or receiver (unit test + dex and
  manifest inspection).
- **Fixed build bug:** `-PSF_DEBUG_SERVER_WRITES_ACCOUNT_ID=` was ignored (Groovy `""` is false), so
  "uploads off" builds still wrote for user 3. `buildSecret` now honours an explicit empty value.
  This also affected the planned Samsung field-test build.
- **Details and the exact ADB plan:** `docs/ACTIVITY_TEST_HARNESS.md` §5.
- **Status:** #10 and #11 stay **Automated PASS, runtime verification pending.**

### B. #5 geofence – Tier 0 checklist ready · Tier 1 designed · no behaviour change
- `docs/SAMSUNG_GEOFENCE_TEST.md` now covers:
  - the uploads-off build and its verification;
  - preconditions;
  - registration check, including the centre/radius actually registered (GMS dumpsys);
  - per-run fields: accuracy, fix/receipt timestamps, delivery latency (`fixAgeMs`), DND
    activation latency (`evalMs`, `applied`, zen log);
  - runs a–e, interpretation and clean-up.
- **Tier 1 design** (`docs/GEOFENCE_ENTRY_DELAY.md`):
  - an optional battery row in Permissions, opening app details with fallbacks;
  - no new permission and no exemption request;
  - a 150–200 m radius hint, explicitly a workaround with trade-offs, not a guaranteed fix.

### C. Unchanged
- WhatsApp probe: disabled; no capture.
- Maps: **BLOCKED – API key unavailable.**
- #6: on hold.

### Remaining blockers (2026-10-11)
1. **#10/#11 runtime verification:** owner go-ahead for the harness injection on the emulator
   (`ACTIVITY_TEST_HARNESS.md` §5).
2. **#5:** approval for a field test, a Samsung device and a test account. Tier 1 implementation
   needs a separate approval after Tier 0. Tier 2 is not approved.
3. **#9 / #6:** approval for a controlled WhatsApp capture on a real device with WhatsApp. #6
   depends on #9.
4. **#8 Maps rendering/search:** a valid API key (owner, Cloud Console steps above).
5. **Logout leak fix (Batch 2):** runtime verification needs approval for a real logout or account
   switch.
6. **Client APK:**
   - signing certificate of the client's install still unknown;
   - no release signing configured;
   - all work uncommitted;
   - distribution not authorised.
7. **Pending client decisions:** #3 radius presets, #4 mode design.


## Batch 8 – controlled harness run (2026-10-11) – STOPPED before seeding

**Preflight: all checks PASS.**
- Device: emulator Pixel_8 API 36, the only device attached.
- Harness APK:
  - writes `""`, harness `true`, probe `false` (dexdump);
  - same debug certificate as the installed app.
- Signed in as user 3.
- Snapshot: 38 journal entries (12 pending), 8 sessions (1 open, manual Silent Mode ON), sync state.
  No outbox.
- `adb install -r`: Success. Journal intact right after the install (38 entries).

**Stopped – unexpected session loss (no synthetic data was created):**
- 07:45:39: on launch, the server answered **HTTP 401** for user 3's stored token, on `settings`,
  `control/modes`, `users/3` and schedules. The app's session-expiry handling ran the normal sign-out
  (`evaluate(LOGOUT)`):
  - the manual session closed;
  - pending data went to `outbox:3`;
  - the local journal and session history were cleared.
- 07:47:13: `POST login` → 200 as user 3. This followed keyboard input not sent by the test, so it
  was concurrent manual use of the emulator. The app was then left on Add Schedule, not saved, and
  the test stopped interacting.
- **Data:**
  - preserved in `outbox:3`: all 12 pending events and all 8 sessions (the open one closed at
    07:45:39);
  - removed by the sign-out: 26 non-pending local journal rows (acknowledged or never-uploaded
    types; local display history only) and `sf.sync.state`;
  - no synthetic row exists anywhere (journal 0, outbox 0, no harness state).
- **Production writes:**
  - none by the test (writes disabled; no POST other than the manual login);
  - the outbox will flush to production for user 3 once a writes-enabled build runs.
- **Cause of the 401:** not yet known (token revoked or expired server-side). Note: during preflight
  the stored token was accidentally printed into the local assistant transcript (not sent anywhere
  else). Recommend revoking that token.
- **Scenario results:** #10/#11 – NOT RUN. Status unchanged: Automated PASS, runtime verification
  pending.

---

## Batch 9 – session expiry, #10/#11 runtime, #5/#9/#6/#3/#4/#8 (2026-10-11)

**Results**
- Jest: 413/413 in 30 suites (+34).
- Native: debug 264/264 (+30), release 239/239 (+30).
- ESLint: 0 errors.
- Builds: debug, release (unsigned) and harness all OK.
- Release APK inspection:
  - 0 harness / probe classes, strings or receivers;
  - no `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` or `FOREGROUND_SERVICE_LOCATION`;
  - JS bundle embedded.
- **No production writes by this work.** The only production requests were read-only GETs:
  - the app's own launches;
  - one GET with the old exposed token, which returned **401** (already rejected).
- Outbox `outbox:3` is unchanged: 12 events / 8 sessions, byte-identical before and after.

### Session expiry (401) – Implemented · Automated PASS
- **Confirmed 401s only.** A 401 on a request sent with the current token is first confirmed with
  one read-only `GET settings` using the same token.
- **What happens on each result:**

| Result | Effect |
|---|---|
| Confirmed rejected | Session **expiry** |
| Token still works | Endpoint-only failure, cached 60 s; the user stays signed in |
| Network error / 5xx | Nothing |
| Stale token | Ignored |
| Concurrent 401s for one token | One check and one expiry |
| 403 | Never ends the session |

- **Expiry (native `expireSession`):**
  - stops silencing and this account's rules;
  - **keeps** the journal, sessions (pending ones stay in the journal, so there are no outbox
    duplicates), emergency contacts, auto-reply settings, learned places and diagnostics;
  - records the account as owner.
- **JS:** history-owned preferences are kept and tagged with the owner. The native step runs before
  the credentials are removed.
- **Next sign-in:**
  - same account: everything is kept;
  - another account: the owner's pending data goes to the owner's outbox, then **all** owner data is
    cleared, now including comms, learned places and diagnostics. JS preferences are removed.
- **Unchanged:** explicit Logout and account deletion.
- **Tests:** `__tests__/sessionExpiry.test.js` (20), `SessionExpiryTest.kt` (7).

### #10 / #11 runtime – emulator, synthetic harness, uploads off
**Preflight:**
- emulator only;
- harness APK: writes `""`, harness on, probe off;
- auth check: all GETs returned 200;
- emulator 10 km from the only zone;
- no open session, DND off;
- raw-input monitor: **0 human input events for the whole run**.

| Scenario | Result |
|---|---|
| Live message preview from the posted notification | **PASS** |
| Preview removed live when the notification is cancelled | **PASS** |
| Preview re-appears after repost (a few seconds' latency) | **PASS** |
| Leave → re-enter Activity (cleared while away, re-read on return) | **PASS** |
| Background (HOME) → resume re-reads | **PASS** |
| Preview gone after the notification is gone (app update cancelled it) | **PASS** |
| Lock-screen privacy | **NOT RUN** – emulator has no lock screen; enabling one changes device security. Unit tests only |
| Message row → notification's own intent | **PASS** |
| App-originated call row → notification's own intent | **PASS** |
| Phone row → Phone app call history (`ACTION_VIEW` call log) | **PASS** |
| Fallback when the notification is gone → open the app + toast | **FAIL on the first build → fixed → PASS** |
| Preview text in storage (22 files) / logcat | **0 hits – PASS** |
| Uploads (POST) during the run | 0 – PASS |
| Cleanup (only this run) + snapshot comparison | **PASS** (removed 3; outbox / history / comms byte-identical; journal and storage keys identical) |

**Bug found and fixed:** the "notification gone → open the app" fallback used an implicit
`startActivity`. Android adds `CATEGORY_DEFAULT` to those, and launcher filters without it (e.g.
this app) don't match: `START_INTENT_NOT_RESOLVED`. It now tries the explicit
`getLaunchIntentForPackage` first. The WhatsApp packages are declared in `<queries>`.

**Not verified:** real WhatsApp notifications. Synthetic tests prove only Silent Focus's own code
paths.

### #5 – Implemented · NEEDS SAMSUNG FIELD TEST
- **Foreground arrival check** (`ArrivalCheck.kt`): on app open or resume, one high-accuracy fix,
  at most once per 2 min.
  - A zone is entered only if `distance + accuracy/2 ≤ max(radius, 100 m)`, the accuracy is
    ≤ 75 m and the fix is ≤ 2 min old.
  - Entry only. Recorded as `ENTER_ARRIVAL_CHECK`.
  - No new permission, no foreground service.
- **Optional battery row** in Permissions, shown only with zones and battery optimisation on. It
  opens the app's details screen, falling back to the battery list, then to a toast. It includes the
  Samsung sleeping-apps hint.
- Tests: `ArrivalCheckTest.kt` (6), `__tests__/batteryGuidance.test.js` (2).
- **Not claimed fixed:** a phone kept in a pocket still depends on Play Services' timing. The
  checklist is in `docs/SAMSUNG_GEOFENCE_TEST.md`.

### #9 / #6 – Implemented · NEEDS REAL-PHONE VERIFICATION
See `docs/WHATSAPP_CALLS.md`:
- incoming and missed rows for WhatsApp and WhatsApp Business, from structure only;
- de-duplicated, local only, hashed caller key;
- #6 repeat notice through the existing urgent-caller policy, with no DND bypass.

Tests: `WhatsAppCallsTest.kt` (19), `__tests__/whatsappCalls.test.js` (4).

### #3 – Implemented · NEEDS CLIENT DECISION
- Offered: 100 / 150 / 200 m, with a precision note ("not guaranteed").
- Legacy 300 / 500 m and any saved radius appear as an extra chip, kept as saved.
- Radii under 100 m are shown as "N m (monitored as 100 m)" and stay saveable unchanged; nobody can
  newly choose one.
- The map circle shows the monitored radius.
- **10 m and 50 m are not offered:** the client must accept this deviation.
- Tests: `__tests__/radiusOptions.test.js` (4).

### #4 – Implemented (texts only) · client acceptance pending
- Location Mode is described honestly: public-place detection isn't available yet.
- Custom is labelled "Custom · My Silent Zones", with a live status line. Legacy accounts are told
  they also need Location Mode on.
- `zonesEnabledFor` is unchanged; a test checks every combination.
- Tests: `__tests__/controlModeTexts.test.js` (4).

### #8 – Implemented (no key needed)
- With no Maps key: a "Map not available" panel replaces the blank map, and place search is hidden.
- With a key whose tiles never load: a notice appears after 10 s.
- Not visually verified: this emulator build has a (non-working) key set, and the timeout notice
  wasn't captured.

### Test APK artifacts (local only; not distributed) – SUPERSEDED by Batch 10 (rebuilt; new checksums)

| File (`android/app/build/outputs/client-test/`) | Variant | Signing | Writes | SHA-256 |
|---|---|---|---|---|
| `silentfocus-release-debugsigned.apk` | release (R8, bundled JS, no harness/probe) | **React Native debug key** (SHA-1 5E:8F:…:F6:25), v2+v3 – NOT a Play/upload signature | automatic sync for the signed-in account (production behaviour) | `b382da83d11c56db0d6a755a918276697c0b557e1aca1db03e0815257554090c` |
| `silentfocus-fieldtest-debug-nowrites.apk` | debug + embedded JS, debuggable | React Native debug key | **off** (`""`); harness/probe off | `1495f697ac89cc1dbdd8d2b8f434db860b4128ed43a92a4c960439998bc06b48` |

**Common to both:**
- package `com.SilenceFocus`, versionCode 1, versionName 1.0;
- they update an existing install **only** if it is debug-signed with the same key and its
  versionCode is ≤ 1;
- otherwise Android refuses the install, safely. **Never** uninstall the client's app to work
  around this.
- Google Sign-In works with the debug certificate only.
- The field-test APK still contains debug-only code (harness receiver flag off, probe off). Use it
  only for the Samsung test.
- The release-signed client build is blocked on the upload key.

---

## Batch 10 – final verification and delivery preparation (2026-10-11)

**Method:**
- emulator only; writes-off debug builds;
- no account changes, no saves, no mode toggles;
- raw-input monitor: **0 human input events**;
- the `outbox:3` file is byte-identical before and after (12 events / 8 sessions);
- 0 POST/PUT/DELETE requests.

### Visual checks

| Check | Result |
|---|---|
| #4 Control Center wording, light | **PASS**. Location Mode: "…public-place detection isn't available yet." Custom: "Custom · My Silent Zones" with the status "Your Silent Zones are on." |
| #4 dark | **PASS** |
| #4 legacy-account note ("…also need Location Mode on") | Not shown: user 3 is a confirmed account, and showing it would need a mode toggle (a server write). Automated tests only |
| #8 key set but tiles don't load | **PASS**: the notice appears after 10 s instead of a blank map |
| #8 no key (build with an empty `SF_MAPS_API_KEY`) | **PASS** (light + dark): the "Map not available" panel shows and place search is hidden |
| #8 hint text | **Fixed during the check**. It said "Search, tap the map…" even without a map; it now says "Use your current location to set the zone centre." |
| #3 radius chips 100 / 150 / 200 m, precision note, "150 m radius" in the list | **PASS** (light + dark) |

**Seen during the check:** the Activity screen kept showing synthetic rows that the harness had
already removed from the journal (stale render, no refresh event). Debug-only and cosmetic; it
cleared when the screen reloaded.

### Field-test APK audit (`silentfocus-fieldtest-debug-nowrites.apk`)

- **Production writes:**
  - every automatic write path (`/sync` logs and sessions, logout-outbox flush, auto-reply settings
    and template push) is gated by `serverWritesAllowed()`;
  - in this APK, `isDebugBuild` (from `BuildConfig.DEBUG`) is true and
    `DEBUG_SERVER_WRITES_ACCOUNT_ID` is `""`, so the guard is false (verified in the dex);
  - the `apiServices.js` write helpers (device, heartbeat, permissions, logs and others) are
    **unused**;
  - there is no native network code;
  - Crashlytics is off in debug;
  - the Profile phone auto-save fires only after a user edit (the saved value is recorded before the
    field is filled).
- **Writes that remain** (user actions only): login, zone / schedule / profile / mode saves,
  password change, logout, account deletion.
- **WhatsApp probe:** `SF_WHATSAPP_CALL_PROBE=false`. The classes exist (debug source set) but
  record nothing. Not in release.
- **Synthetic harness:** `SF_ACTIVITY_TEST_HARNESS=false`, so seeding is refused.
  - The receiver is reachable only through ADB: it is protected by `android.permission.DUMP` and
    needs an explicit component.
  - Its classes are present (debug source set), but nothing is exposed in the UI or to other apps.
  - Release contains 0 harness / probe classes and receivers.
  - Excluding them from a debug build would need a new build flavour (not done).
- **Identity:**
  - `com.SilenceFocus`, versionCode 1, versionName 1.0, minSdk 24, targetSdk 36;
  - ABIs: arm64-v8a, armeabi-v7a, x86, x86_64;
  - debuggable;
  - debug certificate SHA-1 `5e8f16062ea3cd2c4a0d547876baa6f38cabf625`.
- **Maps key:** empty in both test APKs. The old `local.properties` key is invalid, is in git
  history and was never provided for client use.
- **Logging of personal content:**
  - native logs carry only packages, states, counts and redacted numbers; no message text, titles,
    names or coordinates;
  - the JS bundle is non-dev, so `console.log/info/debug/warn` are no-ops (`index.js`) and the
    `[API]` trace is off;
  - the remaining `console.error` calls carry error names and messages only;
  - only Silent Focus's own notification listener is declared.

### Installation compatibility (client's existing app)

An APK updates the installed app in place only if:
1. **Package:** it has the same package (`com.SilenceFocus`). This holds.
2. **Signing:** its signing certificate equals the installed app's, or is a v3-rotated successor.
   Both test APKs use the **React Native debug certificate** (SHA-1 5E:8F:…:F6:25):

   | Client's install | Result |
   |---|---|
   | From Google Play | Signed with the Play app-signing key: **cannot** be updated by these APKs. Use a Play internal-testing release (needs the upload key and an AAB). |
   | Sideloaded release signed with the owner's upload key | Needs a release signed with that key (not available locally) |
   | Sideloaded debug APK | Compatible |

3. **Version:** its versionCode is ≥ the installed one. Ours is **1**. Android refuses a downgrade
   of a normally installed app.
4. **Device:** Android ≥ 7.0 (minSdk 24). All common ABIs are included.
5. **Samsung:** Auto Blocker / "Install unknown apps" must allow the installer. Play Protect may warn
   about a debug-signed APK.

**On a mismatch:** Android refuses (`INSTALL_FAILED_UPDATE_INCOMPATIBLE` / "App not installed")
and keeps the current app and its data.

**On a successful update:** data, the DND and notification-access grants and permissions are kept.

**Finding out without touching the phone:**
- Play Console → App integrity (app-signing certificate);
- or `apksigner verify --print-certs` on the original APK file;
- or the client reads the installer source in Settings → Apps → App details.

The read-only ADB commands (`pm list packages -i`, `dumpsys package | grep signatures/versionCode`)
need the client's explicit approval and presence.

### Final artifacts (`android/app/build/outputs/client-test/`; local only, not distributed)

| APK | Variant | Signing | Automatic writes | Size | SHA-256 |
|---|---|---|---|---|---|
| `silentfocus-fieldtest-debug-nowrites.apk` | debug + embedded JS, debuggable, harness / probe flags off, Maps key empty | RN debug key (v2) | **off** | 149,763,782 B | `a035b9a25da64b2d3c747df4165881b9b4de382471690c8b9fee7c1934e63573` |
| `silentfocus-release-debugsigned.apk` | release (R8, bundled JS, no harness / probe), Maps key empty | RN debug key (v2 + v3), **not** a Play / upload signature | **on** for the signed-in account (production behaviour) | 57,625,332 B | `09ba969033a4e4f266b87ec948cbfeaf0bc5601c7abb4749f0167a84906b0732` |

**Recommendation:** use the field-test APK for the Samsung test with a test account. Use the
release copy only after the signing question is answered, and only with an agreed test plan, since
it uploads activity for whoever signs in.

**Docs:**
- `docs/SAMSUNG_DEVICE_TEST_PLAN.md` (consolidated #5 / #6 / #9 / #10 / #11);
- `docs/CLIENT_TEST_PLAN.md` (client-facing).

**Emulator state:**
- a writes-off debug build is installed (no Maps key, harness off);
- user 3 is signed in;
- `outbox:3` is untouched, and its upload is not enabled;
- night mode is restored to light;
- Metro is running.


---

## Batch 11 – field-test APK delivery check (2026-10-11) – awaiting distribution approval

**Artifact:** `android/app/build/outputs/client-test/silentfocus-fieldtest-debug-nowrites.apk`
- SHA-256 `a035b9a25da64b2d3c747df4165881b9b4de382471690c8b9fee7c1934e63573`;
- 149,763,782 B;
- `com.SilenceFocus` 1.0 (1);
- RN debug certificate SHA-1 `5e8f16062ea3cd2c4a0d547876baa6f38cabf625`.

**Checks:**
- **Built from current source:** no source file is newer than the APK.
- **Batch 9 fixes present.** Native (dex): session expiry, WhatsApp call recorder and repeat-notice
  channel, arrival check, battery-settings bridge, synthetic outbox exclusion. Manifest: WhatsApp
  `<queries>`. Explicit launch-intent fix (disassembled `launchApp`).
- **JS (embedded bundle):** session-expiry message, 401 confirmation, WhatsApp missed / repeated
  labels, radius note and "monitored as", mode texts, battery row, "Map not available" and the
  load-failure notice, previews, Phone navigation, synthetic exclusion. Non-dev bundle.
- **Uploads off:** `DEBUG_SERVER_WRITES_ACCOUNT_ID=""`. On launch: `outbox:3` unchanged and
  `sf.sync.state` never written.
- **Probe and harness:** WhatsApp probe OFF, harness OFF (seeding refused; DUMP-protected).
- **Maps key empty.**
- **Runs without Metro:** Metro stopped and `adb reverse` removed. After the install the app ran from
  the embedded bundle: the Metro socket connect failed, JS loaded server schedules, settings and
  zones, Home rendered and no error screen appeared.
- **Not re-tested here:** a fresh-profile first run (onboarding after uninstall). The emulator's data
  had to be kept (user-3 outbox).

**Install guide:** `docs/FIELD_TEST_INSTALL.md` (uninstall, Auto Blocker, permissions to re-grant,
Maps limitation).

**Emulator now:** runs this APK, Metro stopped, user 3 signed in, outbox untouched.

---

## Round 3 – client Samsung feedback (2026-10-11)

| # | Issue | Status | Fix |
|---|---|---|---|
| R3-1 | WhatsApp caller name missing | FIXED (synthetic + emulator); Samsung/WhatsApp unverified | `comms/NotificationNames.kt`: CallStyle person → title; generic headings rejected → "Unknown caller"; bare numbers redacted. Stored as local-only `displayName` on WHATSAPP_CALL rows. |
| R3-2 | Message sender + 1-line preview | FIXED (same caveat) | Sender (MessagingStyle person / conversation / title, group kept separate as `groupName`). Preview still ephemeral, now per message (`messageAt` = timestamp only) with honest placeholders; one ellipsized line. |
| R3-3 | Remove Automation section | FIXED | Tabs All · Calls · Messages; automation rows hidden from the feed only (journal + Session History unchanged; automation errors stay in All). Status notification kept (live indicator). |
| R3-4 | Calendars missing | FIXED (local Calendar Provider) | Hard-coded `['Google Calendar']` replaced by a picker of every Calendar Provider calendar (Google, Samsung, Exchange/Outlook, local…); multi-select stored natively (`calendar_selection`, null = all visible = old behaviour), sync filters by id. No OAuth/backend change. App-private calendars (Outlook without "Sync calendars") are not readable by any app. |
| R3-5A | Google Maps | BLOCKED – no valid key | local.properties key unchanged since 2026-10-01 (known invalid); APK built with an empty key, fallback panel kept. |
| R3-5B | 10 m / 50 m | NOT SUPPORTED (by design) | Kept 100 m minimum; note clarified. Legacy radii unchanged. |

**Privacy of names:** local journal only (owner-tagged account history; cleared with rows, on account switch, on logout without pending data), stripped from logout outboxes (`EngineStore.outboxJson`), never in `toServerLog` payloads (explicit field mapping), never logged; repeated-caller notice has no name. No Contacts lookup.

**Client APK – new `fieldTest` build type:** `initWith release` (R8, embedded JS, not debuggable), debug-key signed, no `src/debug` (harness/probe classes absent – `testFieldTest` checks), Crashlytics off, `SF_AUTOMATIC_UPLOADS_DISABLED=true` → `serverWritesAllowed()` false. Build: `./gradlew :app:assembleFieldTest -PSF_MAPS_API_KEY=`. versionCode stays 1 (fresh install; no Play track).

Artifact: `android/app/build/outputs/client-test/SilentFocus-Round3.apk` (= `~/Desktop/SilentFocus-Round3.apk`), 57,704,546 B, SHA-256 `635bb0d65a5e1170a21116242ed131d385f1a84877f27ce85af0d66dfa6cbd3c`, cert SHA-1 `5e8f16062ea3cd2c4a0d547876baa6f38cabf625` (RN debug key, v2).

Tests: Jest 443/443 (31 suites); native debug 281, release 255, fieldTest 255 – 0 failures; ESLint 0 errors.
Emulator: Pixel_8 (user 3, harness debug build, writes off; outbox:3 byte-identical before/after) – Activity light/dark, preview lifecycle, Calendar picker light/dark + persistence (synthetic local calendars, removed afterwards), Silent Zones light/dark. Isolated fresh AVD `SF_Round3_Fresh`: fieldTest APK fresh install → onboarding → permissions, no Metro, 0 crashes.

---

## Urgent – Emergency Contacts / Urgent Callers for WhatsApp calls (2026-10-12)

**Root cause:** WhatsApp calls are app VoIP and never reach Telecom/CallScreeningService, so `CallDecider` (cellular emergency + urgent) never saw them. The WhatsApp recorder only counted repeats and posted an ordinary IMPORTANCE_DEFAULT notice that Silent Focus's own DND rule silenced. No emergency matching existed for WhatsApp.

**Implemented (local, no backend change):**
- `comms/WhatsAppEmergency.kt` (pure): matching strongest-first – NUMBER (tel: person URI, WhatsApp id `<digits>@s.whatsapp.net|c.us` in shortcut/tag/person key, numeric title) → CONTACT (person contacts URI resolved via `ContactNumbers`, only if READ_CONTACTS already granted) → NAME (opt-in `whatsAppNameMatch`, default off; unique name only; never when a known number contradicts). Limits: one alert per ringing notification (existing track/dedupe), per caller ≥45 s, ≤5 per 10 min.
- `comms/EmergencyCallAlert.kt`: channel `sf_whatsapp_emergency_calls` (IMPORTANCE_HIGH, `setBypassDnd(true)` – honoured because the app holds DND access; created only once access is granted), user's ringtone played once with NOTIFICATION usage + vibration (follows Ring/Vibrate/Silent), VISIBILITY_PRIVATE + public version without name/number, timeout 45 s, cancelled when WhatsApp's ringing notification is removed. Outcomes SENT / SENT_SILENCED / NOTIFICATIONS_OFF / CHANNEL_OFF recorded on the row (`alert`).
- `WhatsAppCallRecorder.handle`: emergency first (never counted toward urgent), else urgent repeat (existing rule/threshold/cooldown) → alert; `whatsAppAlertsEnabled` (default on) off → no alert (urgent falls back to the old silent notice).
- No DND pause, no change to DND rule/policy, ringer, WhatsApp or other apps; no new permissions.
- UI: Emergency Contacts › WHATSAPP CALLS (switch, opt-in name matching, blockers with fixes, Send test alert, channel settings). Activity rows show emergency / repeat + alert outcome.

**Verified:** Jest 456/456; native debug 299, release 273, fieldTest 273 (0 failures); ESLint 0 errors. Pixel_8 API 36 (Silent Focus DND active, ZEN_MODE_IMPORTANT_INTERRUPTIONS) via debug harness `wa-call` (synthetic WhatsApp-shaped input through the production `handle`): number → EMERGENCY SENT; alert NOT intercepted (vibrate key with ringer Vibrate; sound key + USAGE_NOTIFICATION player started, unmuted, with ringer Normal); name-only → no match (opt-in off) / NAME match (on); unknown → none; same caller ×3 → URGENT SENT, 4th → cooldown; alerts off → ALERTS_OFF; Silent Focus off → not handled. Logs: kind/outcome only. Outbox:3 unchanged.

**APK (not distributed):** `android/app/build/outputs/client-test/SilentFocus-Round3-WhatsAppEmergency.apk`, 57,727,890 B, SHA-256 `66694e1f7406b78b55dd68f3573a8af3d2f1fe00b9c1cd559f610bea421aabb5`, fieldTest, debug key (SHA-1 5e8f…f625). Round 3 APK unchanged.

**Samsung still required:** what WhatsApp/WhatsApp Business actually expose (shortcut id / Person uri / title) on the client's build; alert audibility under Silent Focus on One UI (incl. One UI 7/8 Modes), with the user's own DND, ringer Vibrate/Silent, lock screen with "hide content"; channel "Ignore Do not disturb" default state.

## Round 4 (2026-10-12) – WhatsApp important calls (#A real calls, #B simpler settings, #C test text)

**Status: Implemented and locally tested — Samsung verification pending.** Real Samsung failure not yet conclusively diagnosed; privacy-safe "Check WhatsApp Call Alerts" included for the next test.

Confirmed defects fixed (code + emulator evidence): non-CallStyle call notifications ignored the caller Person in `android.people.list` (number never matched – found with a WhatsApp-shaped fixture through the real listener); ringing calls not recognised when Android 14+ strips the full-screen intent (`FLAG_FSI_REQUESTED_BUT_DENIED`) or WhatsApp uses a heads-up/insistent shape; alert cancelled the moment WhatsApp removed/re-posted its notification (now 4 s grace, call episodes); a reused notification key merged separate calls / re-posts double-counted (episodes by ref + caller); generic titles ("Incoming voice call") grouped unknown callers; bidi marks / NBSP / device-suffix JIDs broke number matching; contact lookup key now matches the picked contact; caller names removed from the alert (lock screen showed them under default settings); channel rename reset "override DND" (caught on Pixel_8, fixed: full desired channel always re-registered); pre-existing crash on font/display-size change (`super.onCreate(null)` for react-native-screens).

New: `comms/WhatsAppCallCheck.kt` (5 min, user-started, yes/no facts + structural "Support details", auto-delete 30 min / Done / logout), `src/componentes/WhatsAppCallCheck.js`, redesigned "Important WhatsApp Calls" section, `EmergencyCallAlert.soundReadiness`. Debug-only harness ops `wa-silent|wa-ec-add|wa-reset|wa-check-*|wa-state`.

Tests: Jest 472/472 (33 suites); native debug 324, release 298, fieldTest 298 (0 failures); ESLint 0 errors. Emulator: SF_Round3_Fresh (API 36, signed out, harness debug build + local `com.whatsapp`/`com.whatsapp.w4b` notification fixtures, removed afterwards) and Pixel_8 (user 3, fieldTest UI only; outbox/history byte-identical before/after; harness debug build reinstalled).

APK: `android/app/build/outputs/client-test/SilentFocus-Round4-Final.apk` = `~/Desktop/SilentFocus-Round4-Final.apk`, 57,738,346 B, SHA-256 `5bfba40c228ed06368fc8c35e1728ff27b68b62fef6fce46041acb9254dda4c5`, fieldTest, debug key v2 (SHA-1 5e8f…f625). Guide: `~/Desktop/SilentFocus-Round4-Test-Guide.md`.
