# WhatsApp call notification probe (Client Issue #9) – review

**Status (2026-10-10):** code prepared and privacy-hardened, capture NOT enabled. No real
notifications have been captured. Enabling needs the owner's separate approval.

## Where the code lives

| File | Variant | Role |
|---|---|---|
| `android/app/src/main/java/com/SilenceFocus/comms/NotificationProbes.kt` | all | Hook interface + holder. `installed` is null unless a debug probe build sets it; every call is then a no-op and can't throw into the listener. |
| `…/comms/SilentFocusNotificationListener.kt` | all | Calls `NotificationProbes.posted` / `removed`. |
| `…/automation/AutomationEngine.kt` | all | `NotificationProbes.clear` at logout (`reset`) and when an account claim changes the owner (`claimHistory` → MOVED/ADOPTED). |
| `…/SilentFocusModule.kt` (`clearRecentEvents`) | all | `NotificationProbes.clear` on "Clear phone activity". |
| `android/app/src/debug/java/com/SilenceFocus/diagnostics/WhatsAppCallProbeModel.kt` | debug only | Pure rules: fields, call-like classification, pseudonyms, retention, encoding. |
| `android/app/src/debug/java/com/SilenceFocus/diagnostics/WhatsAppCallProbe.kt` | debug only | Android adapter, app-private store, installer `ContentProvider`. |
| `android/app/src/debug/AndroidManifest.xml` | debug only | Declares the installer (`exported="false"`). |
| `android/app/build.gradle` | – | `BuildConfig.SF_WHATSAPP_CALL_PROBE`: debug = `SF_WHATSAPP_CALL_PROBE` from `local.properties` (default false); release = always false. |

## When it runs

1. **Release builds:** never. The probe classes aren't compiled into release
   (`ProbeAbsentInReleaseTest`, `ProbeLifecycleTest`).
2. **Debug builds without `SF_WHATSAPP_CALL_PROBE=true` (all builds so far):** the installer wipes
   any probe data, including data from the first, unhardened version. Nothing is recorded.
3. **Debug build with the flag (needs approval):**
   - at start: expired records are pruned and a new capture number is taken;
   - from then on, WhatsApp notifications are recorded as described below.

## Exactly what is inspected

The probe first checks `sbn.packageName`. Unless it is `com.whatsapp` or `com.whatsapp.w4b`, it
reads nothing else and returns.

| Read (in memory only) | Stored as |
|---|---|
| `sbn.key` | `notification` = per-capture ordinal `n1`, `n2`, … (pairs POSTED with REMOVED). No hash. |
| `notification.shortcutId`, else `EXTRA_TITLE` | `caller` = per-capture ordinal `c1`, `c2`, …, **only if the notification is call-like**; otherwise empty |
| `sbn.postTime` | as is |
| `notification.category` | as is if it is a plain token (e.g. `call`), else empty |
| `notification.channelId` | as is if it looks like an app channel name (`voip_notification_11`), else `redacted` |
| `extras["android.template"]` | class short name only (`Notification$CallStyle`) |
| `extras["android.callType"]` | integer |
| `notification.flags` | masked to ongoing / insistent / no-clear / auto-cancel / foreground-service / group-summary |
| `fullScreenIntent != null`, `contentIntent != null` | booleans |
| each action's `semanticAction` | list of integers (no titles) |
| `extras[EXTRA_IS_GROUP_CONVERSATION]` | boolean |
| `extras.keySet()` | names only, `android.*` keys only; never values |
| removal reason (on removal) | integer |
| Silent Focus active | boolean |
| – | `capture` number, `callLike` flag, record format `v2` |

**Call-like** is decided from structure only: category `call` or `missed_call`, a CallStyle
template, an `android.callType` extra, or a full-screen intent. Message notifications never get a
caller pseudonym.

Never read or stored:
- text, big text, sub-text;
- people / `Person` names or URIs;
- message lists;
- icons;
- intent contents;
- app-defined extras;
- any phone number or name;
- **any hash or salt.**

No network code and no UI. Logcat output is limited to an exception class name if the probe
fails (`SilentFocusProbe`).

## Caller identifiers – how they are derived and protected

- `CapturePseudonyms` (an in-memory object per process run):
  - draws a random 256-bit key from `SecureRandom`;
  - computes `HMAC-SHA256(key, domain ‖ package ‖ value)`;
  - maps each digest to the next ordinal (`c1`, `c2`, … / `n1`, `n2`, …).
- The key, the digests and the map exist **only in memory**. They are never written, and are
  replaced when the probe is cleared. The raw value is used once to compute the HMAC and is not
  kept.
- **Stored:** only the ordinal and the `capture` number. A reader of the file learns only "same /
  different caller within this capture". There is nothing to brute-force, because no hash of a
  number or name is stored.
- **Trade-off:** pseudonyms restart with each process run (the `capture` number changes). The same
  caller in two captures can't be linked. That's by design.

## Retention and clearing

- Newest **200** records, nothing older than **24 h**. Pruned on every write **and at every app
  start** of a probe build.
- Older-format records (the first version, which stored hashes) are dropped on read and prune. The
  old salt key is deleted on clear.
- **Cleared by:**
  - logout;
  - an account claim that changes the owner (MOVED / ADOPTED);
  - "Clear phone activity";
  - any start of a build without the flag;
  - uninstall. App backup is off.
- Never uploaded.

## Reading it (developer, after approval)

`adb shell run-as com.SilenceFocus cat shared_prefs/silent_focus_wa_probe.xml`

The records are field-separated text; fields are as in the table above. USB debugging is needed.

## Disabling and removing

- **Disable:** build without `SF_WHATSAPP_CALL_PROBE=true` (the default). On the next app start the
  installer wipes the store.
- **Remove entirely (one change):**
  1. delete `android/app/src/debug/java/com/SilenceFocus/diagnostics/` and
     `android/app/src/testDebug/java/com/SilenceFocus/diagnostics/`;
  2. delete the `<provider>` from `android/app/src/debug/AndroidManifest.xml`;
  3. delete the two `SF_WHATSAPP_CALL_PROBE` lines in `android/app/build.gradle`.

  `NotificationProbes` can stay as an inert hook, or be removed together with its call sites.

## Tests

- `testDebug/…/WhatsAppCallProbeTest.kt` (15):
  - only WhatsApp is recorded;
  - the stored form has no names, numbers, raw ids, keys, hash-like values or app extras;
  - a caller pseudonym only for call-like notifications, with each structural signal tested;
  - same caller → same pseudonym within a capture; a new capture is unlinkable;
  - a title is used only as fallback;
  - POSTED/REMOVED pairing without the key;
  - no key or salt is ever written;
  - structural fields kept;
  - risky channels redacted;
  - retention (200 / 24 h);
  - prune at start without new writes;
  - v1 records and the old salt dropped;
  - capture counter and clear;
  - encode/decode;
  - off unless the flag is set.
- `test/…/ProbeLifecycleTest.kt` (3):
  - owner-change rule;
  - clear wired into logout, owner change and Clear activity;
  - release can't enable it (no probe in main sources or manifest).
- `testRelease/…/ProbeAbsentInReleaseTest.kt` (1): no probe classes in release, flag false.

## Safety review (2026-10-10) – outcome

The earlier review found four things to change before capture. All four are implemented:

| Finding | Resolution |
|---|---|
| Salted hashes + stored salt = reversible pseudonyms | Replaced by in-memory HMAC → per-capture ordinals; no salt or hash stored |
| Notification-key hash stored | Removed; in-memory ordinal instead |
| Identifiers for every WhatsApp notification | Caller pseudonym only for call-like notifications |
| Retention only on write; not cleared on owner change or Clear activity | Pruned at start (24 h); cleared on owner change and Clear activity |

Unchanged (OK):
- release exclusion;
- default off;
- listener lifecycle;
- failure isolation;
- `onNotificationRemoved` is API 26+ only (no REMOVED records on Android 7);
- debug builds are debuggable, so the capture phone must be a developer-held test phone.

**Capture procedure (when approved):**
- a developer-held test phone, a test WhatsApp account, and test callers only;
- read the store, then rebuild without the flag on the same day;
- classifier fixtures contain structural fields only.
