# Geofence entry delay (Client Issue #5) – analysis and improvement proposal

**Status (2026-10-10):** proposal only. Geofence behaviour has not changed. No field test has been
run. Nothing in this document creates production sessions.

## Client observations (latest)

- Exit detection works.
- Entry (silencing) happens about **2 minutes after arriving** inside the office.
- Zone radius is 100 m. No schedule or manual override was involved.

## What the app does today (code)

- **Registration** (`GeofenceRegistrar.kt`):
  - Play Services geofences with **ENTER | EXIT** only: no DWELL, no loitering delay;
  - initial trigger ENTER | EXIT;
  - radius `max(zone radius, 100 m)`;
  - `NEVER_EXPIRE`;
  - `setNotificationResponsiveness` not set (default 0 = "as soon as possible").
- **Event path:** an event reaches `GeofenceEventReceiver`, which evaluates and applies DND in
  ~40 ms (measured on the emulator). **The app adds no measurable delay after the event.**
- **No location requests of its own in the background.** Detection is entirely Play Services'
  geofencer, which on the emulator runs at balanced power, ~5–7.5 min background interval
  (`dumpsys`).
- **No battery-optimisation check or guidance** in the app.

## Interpretation

A ~2-minute entry latency is within Google's documented typical geofence latency: the average alert
latency is under 2 minutes, rising to several minutes when the device has been still or location
isn't being used actively. Why entry lags while exit seems fine:

- **Indoor accuracy:** on arrival the phone is often already indoors, where Wi-Fi/cell fixes are
  50–100 m+. With a 100 m radius, Play Services needs a fix confidently inside the circle, and that
  can take one or two location cycles. On exit, the phone moves outdoors and away, fixes improve
  quickly, and the user notices a late exit less.
- **Background location budget:** Android 8+ limits background location updates to a few per hour
  per app. The geofencer batches its fixes, so between them nothing happens.
- **Samsung battery management** ("Optimized", sleeping apps, power saving) can delay Play Services
  wake-ups and the app's broadcast delivery.

The existing diagnostics can tell these apart on the client's phone; see Tier 0.

## Existing diagnostics (implemented, local only)

Per geofence event, the app stores:
- receipt time and transition;
- zone ids;
- the triggering fix's own time, its age on arrival, accuracy and provider;
- distance to the centre, rounded to 10 m;
- evaluation time;
- silence/DND result.

It also records registration status and permission flags, and Play Services errors. Storage: 100
records, no coordinates, never uploaded, cleared at logout.

**What diagnostics can answer:**
- `fixTime − arrival` long → slow **detection** (Play Services hadn't produced an inside fix).
- `fixAgeMs` long → slow **delivery** (batching or battery restrictions).
- `accuracy` at ENTER, and `distance` vs radius → indoor accuracy is the limit.

## Proposal (tiers; each needs approval)

### Tier 0 – measure first (no behaviour change; needs field-test approval)

- Use `docs/SAMSUNG_GEOFENCE_TEST.md` with a test account and automatic uploads disabled
  (`SF_DEBUG_SERVER_WRITES_ACCOUNT_ID` empty), so no production sessions are created.
- Walk in 3× with the battery mode "Optimized" and 3× with "Unrestricted". Record the wall-clock
  arrival time.
- **Decision rule:**
  - delivery-limited → Tier 1 is likely enough;
  - detection-limited (late or inaccurate fixes) → Tier 2.

### Tier 1 – low risk, battery-neutral

1. **Battery guidance (UI only):**
   - in the Accounts → Permissions list, add a "Battery: Unrestricted recommended" row when
     `PowerManager.isIgnoringBatteryOptimizations` is false;
   - it opens the system battery-optimisation settings (`ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS`);
   - no new permission. The direct-exemption request permission is deliberately not used: it is
     Play-policy-restricted.
2. **Radius guidance:** for buildings, recommend 150–200 m in the zone form hint (consistent with
   the #3 communication proposal). There is no automatic change.
3. **Not proposed:** changing `setNotificationResponsiveness`. The default (0) is already the
   fastest setting.

### Tier 2 – targeted "arrival check" (behaviour change; experimental, behind a setting)

- **Outer approach geofence:** register a second geofence per zone at radius + 300 m, ENTER/EXIT
  only. This uses one more slot per zone. The app already uses Android's per-app maximum of 100
  (`MAX_GEOFENCES`), so with outer rings at most 50 zones can be monitored. The rings would be
  limited to the nearest zones.
- **On outer ENTER:**
  - start a **short foreground "arrival check"**. Android 12+ allows starting it from a geofence
    transition; the notification reads "Checking arrival at <zone>";
  - request high-accuracy fixes every ~10 s for **at most 3 minutes**, stopping early on inner
    ENTER or outer EXIT;
  - if a fix lies inside the zone with a sensible accuracy check (e.g. `distance + accuracy/2 ≤
    radius`), mark the zone entered at once. This is the same engine path as a geofence ENTER.
  - Exit stays Play Services' job.
- **Battery:**
  - GPS only near a zone, ≤ 3 min per approach, typically 1–2 approaches a day per zone;
  - no continuous tracking;
  - no change away from zones.
- **Costs:**
  - new permissions `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_LOCATION` (normal permissions, but
    Play requires a foreground-service-location declaration and video);
  - a visible notification during the check;
  - more code paths: de-duplication with Play's own ENTER, and zone edits while a check runs;
  - Samsung may still kill the service under "Restricted".
- **Tests needed:**
  - pure inside/accuracy decision;
  - burst limits and stop conditions;
  - no double ENTER;
  - outer-ring registration counts against the limit;
  - setting off = today's behaviour.

### Not recommended now

- **Continuous background location tracking:** battery cost and policy.
- **Wi-Fi SSID arrival detection:** needs nearby-Wi-Fi/location access for SSIDs, and is
  privacy-sensitive.
- **Lowering the 100 m minimum:** see #3.

## Recommendation

1. Approve Tier 0 (field measurement with uploads off) and Tier 1.1 (battery guidance, UI only).
2. Decide on Tier 2 only if Tier 0 shows detection-limited entry.
3. Meanwhile, tell the client that ~2 min is within Android's normal geofence latency, and that
   Unrestricted battery mode and a slightly larger radius for buildings usually help.

---

## Tier 1 guidance – design (2026-10-11, approved for design only; not implemented)

### 1. Battery optimisation guidance (optional, UI only)

**Where:** Accounts → Permissions (the existing `PermissionHub` list). It is a new **optional** row.
It never blocks Silent Focus, and it is not counted as "required".

**When shown:**
- the user has at least one Silent Zone with location mode on, **and**
- `PowerManager.isIgnoringBatteryOptimizations(packageName)` is false.

The row is hidden otherwise, and also when there are no zones. No reminder is shown elsewhere.

**Row text (proposal):**
- Title: "Battery: Unrestricted (optional)"
- Body: "Your phone may delay location alerts to save battery. Setting Silent Focus to
  *Unrestricted* can make zone silencing start sooner. It may use slightly more battery."
- Button: "Open battery settings"

**Action, in fallback order:**
1. `Settings.ACTION_APPLICATION_DETAILS_SETTINGS` for this package. On Samsung, Battery is one tap
   from there.
2. If that fails: `Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS`, the system list.
3. If that also fails: a toast saying "Open Settings → Apps → Silent Focus → Battery".

**Samsung extra (text only, under the row):** "Also check that Silent Focus isn't in *Sleeping
apps* or *Deep sleeping apps* (Settings → Battery → Background usage limits)." No deep link: these
screens have no public intent.

**Not done:**
- `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` and its direct exemption dialog. This is a new
  permission, and it is Play-policy restricted.
- Nagging, a badge, or a block.
- Any change to geofence registration.

**Refresh:** the row re-checks on screen focus (`AppState` active), as the other permission rows do.

**Tests (when implemented):**
- shown and hidden logic (zones × exempt);
- the fallback chain;
- no new manifest permission (a manifest test);
- accessibility label and contrast as in Batch 3.

### 2. Radius hint – a workaround, not a fix

**Proposed hint** in Add/Edit Silent Zone, under the radius control: "Inside buildings, location is
less precise. If silencing starts late, try 150–200 m."

**What to tell the client:**
- A larger radius makes the circle easier to "be inside" when indoor fixes are 50–100 m off. Entry
  then tends to trigger earlier, often already on the approach.
- It does **not** make Android check location more often. If the delay is caused by the location
  cycle or by battery limits (Tier 0 shows this as a large `fixAgeMs`), a bigger radius changes
  little.
- Trade-offs:
  - silencing may start before the person is inside (car park, street, a neighbouring building);
  - exit triggers later;
  - nearby zones are more likely to overlap.
- The app keeps the 100 m minimum (#3 decision pending). No radius is changed automatically.
- **Not guaranteed:** Google documents no latency bound for geofences. The ~2 min observed is within
  its stated typical behaviour.

### Order

1. Tier 0 field test (`docs/SAMSUNG_GEOFENCE_TEST.md`).
2. If delivery-limited: implement Tier 1.1 (battery row).
3. Tier 1.2 (hint) can ship any time with the #3 radius wording.
4. Tier 2 only on a separate decision, and only if detection-limited.
