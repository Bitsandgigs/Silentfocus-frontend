# Synthetic Activity test harness (#10 / #11 end-to-end)

**Status (2026-10-11, Batch 9):**
- Implemented and **run once on the emulator** (run `be715268`).
- Results are in `docs/CLIENT_ISSUES.md` (Batch 9): all scenarios PASS except lock-screen privacy,
  which wasn't run (no lock screen on the emulator).
- One fallback bug was found and fixed.
- Cleanup was verified: snapshots byte-identical and the outbox unchanged.
- The writes-disabled harness build stays installed. The normal debug build would flush the user-3
  outbox to production, which is not authorised.

## 1. What is where

| Part | File | Build |
|---|---|---|
| Receiver (ADB ops), janitor, notifications | `android/app/src/debug/java/com/SilenceFocus/diagnostics/ActivityTestHarness.kt` | debug only |
| Pure rules (rows, gating, cleanup match, expiry) | `…/diagnostics/ActivityTestHarnessModel.kt` | debug only |
| Receiver and janitor declarations | `android/app/src/debug/AndroidManifest.xml` | debug only |
| Upload / outbox exclusion | `automation/ActivityEvents.kt`, `automation/Outbox.kt`, `automation/EngineStore.kt`, `src/utils/comms.js`, `src/utils/serverSync.js`, `src/utils/outbox.js` | main (all builds) |
| Flag `SF_ACTIVITY_TEST_HARNESS` (default false; release hard-coded false) | `android/app/build.gradle` | – |

## 2. Upload exclusion (main code, independent of any flag)

A journal entry with `"synthetic": true` is excluded at every layer:

| Path | Native | JS |
|---|---|---|
| Normal sync (`POST /sync`) | `getSyncableEvents` returns the journal without synthetic rows | `getSyncableActivity` filters again; `toServerLog` returns null |
| Retry, backoff, read-back | `JournalEntry.pending` = false | `verifyAcknowledgements` sees only syncable rows |
| Logout outbox | `Outbox.Event.pending` = false; `OutboxStore.save` drops synthetic rows | – |
| Interrupted-logout recovery (`ensureSignedOut`) | same `pendingSnapshot` → `save` path | – |
| Outbox flush (same account, later sign-in) | `Outbox.decode` drops any stored synthetic JSON | `getOutbox` filters; `toServerLog` returns null |
| Retention | Synthetic rows have their own cap (20) and never count against the 200 real ones, so they can't evict a real entry | – |

**Real entries:** behaviour is unchanged. Tests prove that the real pending set, upload set and
retention result are identical with and without synthetic rows.

## 3. Gating

- **Debug source set only.** A release unit test and an APK inspection confirm that the release APK
  has no harness classes, no `sftest`/`sf_test_harness` strings and no receiver.
- **Seeding is refused** unless all of these hold:
  - `SF_ACTIVITY_TEST_HARNESS=true`;
  - `DEBUG_SERVER_WRITES_ACCOUNT_ID` is empty in that build;
  - no run is active;
  - appending 3 rows would not make retention drop any real entry (`WOULD_TRIM_REAL_ENTRIES`).
- **Trigger:** an explicit-component broadcast to a receiver protected by `android.permission.DUMP`.
  `adb shell` holds DUMP; normal apps can't be granted it except by `pm grant` over ADB.
  `cleanup` and `status` work in any debug build; `seed` doesn't.
- **Build-switch bug fixed (2026-10-11):** `-PSF_DEBUG_SERVER_WRITES_ACCOUNT_ID=` used to be ignored,
  because Groovy treats `""` as false, so the build took `3` from `local.properties`. Now the first
  source that defines the name wins, even with an empty value. Verified in the generated BuildConfig
  and in the APK dex:
  - harness APK: `""`, harness `true`;
  - normal debug: `"3"`, harness `false`.

## 4. What a run creates

| Row id | Type | Points to | Expected tap result |
|---|---|---|---|
| `sftest-<run>-1` | `MESSAGE_RECEIVED`, app "SF TEST", `appPackage com.SilenceFocus` | the harness message notification (MessagingStyle, text `SF TEST <run> preview`) | opens **this channel's notification settings** (proves the notification's own intent was sent) |
| `sftest-<run>-2` | `INCOMING_CALL`, `appPackage com.SilenceFocus` | the harness call notification | opens **Silent Focus app notification settings**; after `cancel-call`, the app plus the toast "notification is no longer available" |
| `sftest-<run>-3` | `INCOMING_CALL`, no package, caller `+00******0000` | – | Phone app call history |

**Every row has:**
- `synthetic: true`;
- `reason: TEST_HARNESS`.

**No row has:**
- the notification text;
- a real number or contact;
- another app's package.

**Never involved:**
- sessions;
- the engine;
- SMS, WhatsApp, contacts;
- other apps' notifications. The listener ignores this app's own posts, so no real row is created.

**Cleanup removes:**
- rows with `synthetic == true` **and** id prefix `sftest-<run>-`;
- notifications with tag `sftest-<run>`.

**Janitor:** at debug-process start, it removes `synthetic` + `sftest-` rows older than 2 h.

## 5. End-to-end ADB plan (NOT run – awaiting go-ahead)

Emulator `emulator-5554`, signed in as user 3, Pixel 8 API 36.

**Variables:**

```sh
S=/private/tmp/claude-501/-Users-thismac-AndroidStudioProjects-SilentfocusApp/<session>/scratchpad
RCV=com.SilenceFocus/com.SilenceFocus.diagnostics.ActivityTestHarnessReceiver
```

### A. Safety checks before anything is installed (read-only)

1. Confirm the device, user and permissions:
   - `adb devices` shows only `emulator-5554`;
   - the app is signed in as user 3: Accounts tab, visual check;
   - notification permission granted, and listener `com.SilenceFocus/...SilentFocusNotificationListener`
     enabled. Both confirmed on 2026-10-11.
2. Confirm the harness APK's build values:
   - `DEBUG_SERVER_WRITES_ACCOUNT_ID = ""`, `SF_ACTIVITY_TEST_HARNESS = true`,
     `SF_WHATSAPP_CALL_PROBE = false`;
   - checked on 2026-10-11 by dexdump of `$S/apk/app-debug-harness.apk`.
3. **Snapshot** (read-only `run-as cat`, kept in the scratchpad):
   ```sh
   for f in silent_focus_engine silent_focus_history silent_focus_outbox silent_focus_comms; do
     adb exec-out run-as com.SilenceFocus cat shared_prefs/$f.xml > $S/pre/$f.xml 2>/dev/null; done
   adb exec-out run-as com.SilenceFocus cat databases/RKStorage > $S/pre/RKStorage
   ```
   Record:
   - journal ids (`events`);
   - session starts/ends (`silent_focus_history`);
   - outbox: none exists today;
   - sync state (`sf.sync.state` in RKStorage).
4. Check that no other activity is on the emulator: screenshot, and stop if the user is using it.

### B. Install and seed

5. Start Metro: `npx react-native start`, then `adb reverse tcp:8081 tcp:8081`.
6. Install the harness build with data kept:
   - `adb install -r $S/apk/app-debug-harness.apk`;
   - same debug signing, so no uninstall.
7. Launch with `adb shell am start -n com.SilenceFocus/.MainActivity`. Never use `monkey`. Wait
   20 s. Check:
   - the debug write notice is **absent**;
   - still user 3.
8. `adb shell am broadcast -n $RCV --es op status`. Expect `harness=true writesDisabled=true
   syntheticRows=0`.
9. `adb shell am broadcast -n $RCV --es op seed`. Expect `SEEDED run=<run> rows=3`. Note `<run>`.
   If the result is `REFUSED …`, stop and report.

### C. Verify #10 previews and #11 navigation (production Activity code)

10. Open Activity → Messages / All:
    - the "SF TEST" message row shows the preview `SF TEST <run> preview`;
    - the app-call row and the phone row are present.
11. `--es op cancel-message`: the preview disappears without leaving the screen (removal event).
12. `--es op repost-message`. It uses the same tag and id, so the notification key and the row's ref
    are unchanged. Then check:
    - the preview returns (posted event);
    - leave the screen and come back: it is re-read;
    - HOME, then resume: it is re-read, with nothing stale.
13. Lock the screen (`adb shell input keyevent 26`), unlock, and check:
    - previews are hidden while locked;
    - they come back after unlock.
14. Tap the rows:
    - message row: before step 11 it opens the channel settings; after cancel it opens the app plus
      the toast. Run 14a before 11 if both are wanted.
    - app-call row: opens app notification settings. After `--es op cancel-call`, the app plus the
      toast.
    - phone row: opens Phone call history.
    - Return with system Back each time.
15. TalkBack hints: `uiautomator dump` shows "Opens …" hints on the three rows.

### D. Leak and no-upload checks

16. `grep -c "SF TEST <run> preview"` over:
    - `$S/post/*.xml`;
    - RKStorage;
    - `adb logcat -d`.

    Expected: 0 everywhere. The text exists only in the posted notification.
17. `grep` the journal for `sftest-<run>`: exactly 3 rows, all `"synthetic":true`.
18. No network writes:
    - logcat / RN request trace shows no `POST sync`;
    - `sf.sync.state` is unchanged versus the pre-run snapshot;
    - outbox file still absent.

### E. Cleanup and comparison

19. `--es op cleanup`. Expect `CLEANED run=<run> removed=3`. Then `--es op status` shows `run=-
    syntheticRows=0`, and the harness notifications are gone (`dumpsys notification | grep sftest`
    returns nothing).
20. Snapshot again into `$S/post/` and compare with `$S/pre/`:
    - journal ids: identical, except real entries the app recorded on its own during the window,
      e.g. a re-registration evaluation after `install -r`. These are listed separately with their
      types and timestamps; none may start with `sftest-`.
    - sessions: identical.
    - outbox: identical (absent).
    - sync state: identical.
21. Reinstall the normal debug build (`adb install -r app/build/outputs/apk/debug/app-debug.apk`),
    then:
    - relaunch; still user 3; the debug write notice is back;
    - `--es op status` shows `harness=false syntheticRows=0`;
    - a seed returns `REFUSED HARNESS_DISABLED`.
22. Stop Metro / `adb reverse --remove tcp:8081` if it wasn't running before (it wasn't on
    2026-10-11).

**Not done in this plan:**
- logout;
- account switch;
- Clear activity (in a build with writes disabled, Clear removes all local activity unverified);
- zone or schedule saves;
- SMS, calls, WhatsApp;
- probe enable;
- production writes.

**Expected impact on user 3:** while the harness build is installed, normal automatic sync is paused
(`WRITES_DISABLED`). Real pending items stay pending and upload after step 21. Nothing is lost.

## 6. Tests

| Suite | File | Cases |
|---|---|---|
| Native main (debug + release) | `android/app/src/test/.../automation/SyntheticExclusionTest.kt` | 11: never pending; syncable filter; logout snapshot identical; outbox save and forged-record drop; interrupted-logout recovery; retention isolation (200 cap, unchanged real result, own cap/age); clear by id |
| Native debug | `android/app/src/testDebug/.../diagnostics/ActivityTestHarnessTest.kt` | 12: default off; seed refusals (flag, writes, active run, would-trim); run-id format; rows tagged with no text/number/foreign package; cleanup only own run (prefix collisions, invalid ids); janitor expiry |
| Native release | `android/app/src/testRelease/.../diagnostics/HarnessAbsentInReleaseTest.kt` | 1: flag off, writes id empty, 6 harness classes absent |
| Jest | `__tests__/syntheticHarness.test.js` | 11: `toServerLog`; identical real upload set; sync posts only real rows (with and without the native filter); verification ignores synthetic; synthetic-only journal posts nothing; writes disabled sends nothing; `getOutbox` / `flushOutbox` exclusion; production Activity normaliser, preview request and routing for the three rows |
