# WhatsApp calls in the Activity Center (#9) and repeated WhatsApp callers (#6)

**Status (2026-10-11):** implemented locally. Automated tests PASS (synthetic notification
structures). **Not verified with real WhatsApp notifications:** the structural probe stays OFF, and
no real notification was captured.

## What is recorded

`comms/WhatsAppCalls.kt` (classifier) and `WhatsAppCallRecorder` (listener side), wired into
`SilentFocusNotificationListener`:

| State | Detected when (structure only, never text) |
|---|---|
| `INCOMING` | Either: a `CallStyle` notification with `android.callType` = 1 (incoming, Android 12+); or category `call` with a full-screen intent (older WhatsApp builds) |
| `MISSED` | Notification category `missed_call` |

**Scope:**
- Packages `com.whatsapp` ("WhatsApp") and `com.whatsapp.w4b` ("WhatsApp Business") are handled
  separately; their callers are never combined.
- Recorded only while Silent Focus is active, the same rule as messages.

**Ignored:**
- ongoing / screening CallStyle (an answered or outgoing call);
- group calls and group summaries;
- messages;
- all other apps.

**Never claimed:** answered, declined, duration, which device answered. The notifications don't
prove these.

**De-duplication:** each notification is recorded at most once per state (`STATE|notificationRef`),
while it is posted, for up to 10 minutes. Removal resets it. A ringing notification that turns into
a missed call gives one `INCOMING` and one `MISSED` row.

**Journal row:** `WHATSAPP_CALL` with:
- `callState`;
- app label and package;
- the salted `notificationRef` (to open it);
- optional `repeat` / `repeatCount`.

**Never stored:** caller name, number, title, text, or the notification key.

**Uploading:** local only. `WHATSAPP_CALL` is not an uploaded type, in JS or native.

**Ownership:** the dedupe and repeat state live in `CommsStore`. They are cleared at logout, at a
session-end clear, and when another account claims the phone.

**Activity UI:**
- labels: "WhatsApp call · Silenced", "Missed WhatsApp call",
  "Repeated WhatsApp caller · N calls";
- tapping opens WhatsApp's own notification if it is still posted, otherwise WhatsApp's launcher
  entry. WhatsApp packages are declared in `<queries>`, so the explicit launch works.

## #6 – repeated WhatsApp caller

**Rule:** the same configurable policy as urgent cellular callers. Threshold 2–10 (default 3),
window ≤ 60 min (default 15), cooldown ≤ 240 min (default 15). It applies to `INCOMING` calls,
with separate `wa:` state, so cellular and WhatsApp counts never mix.

**Caller identity:** a salted hash of the notification's shortcut id (conversation), else the
`Person` key / URI, else the title. Hashed immediately and never stored in clear. No identity means
no counting.

**On a repeat:**
- the Activity row is marked as a repeat;
- one ordinary Silent Focus notification, "Repeated WhatsApp calls", default importance, with no
  sound override, no full-screen intent and no DND bypass.

**DND limit:** WhatsApp's own ringing stays silenced. Android lets no app allow a single
notification of another app through DND. This is **not** the cellular "urgent caller rings through"
behaviour.

**Correlation reliability is unverified.** It depends on WhatsApp putting a stable shortcut id or
Person on call notifications.

## Must be verified on a real phone (needs separate consent; probe stays OFF until then)

1. The incoming WhatsApp voice and video call notification uses `CallStyle` with call type 1, or
   category `call` plus a full-screen intent. Check this on WhatsApp and WhatsApp Business, on
   Samsung One UI and on a Pixel.
2. A missed call posts a `missed_call`-category notification. If WhatsApp uses another category or
   channel, missed calls won't appear.
3. Repeated calls from the same person carry the same shortcut id or Person: this is the #6
   correlation. Also check that different people never share one.
4. Group calls are flagged as group conversations.
5. Nothing is recorded when WhatsApp call notifications are switched off. That is expected and
   cannot be worked around.
6. Tapping a row opens WhatsApp, both with the call notification still posted and after it is gone.
