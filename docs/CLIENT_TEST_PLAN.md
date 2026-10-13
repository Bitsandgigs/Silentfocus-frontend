# Silent Focus – test plan for the next build

## 1. What to test

| # | What changed | What we ask you to check |
|---|---|---|
| 5 | Silent Zones can switch on as soon as you open the app inside the zone. A new optional "Battery: Unrestricted" tip is in Accounts → Permissions. | Walk into your office zone, with and without opening the app. Note how long until silencing starts. Try the battery tip. |
| 9 | WhatsApp and WhatsApp Business calls appear in the Activity Center as "WhatsApp call" or "Missed WhatsApp call" while Silent Focus is on. | Ask someone to call you on WhatsApp while silenced. Check the Activity Center. |
| 6 | If the same person calls you on WhatsApp 3 times within 15 minutes, Silent Focus shows a "Repeated WhatsApp calls" notice. | Ask the same person to call 3 times. |
| 10 | Message previews in the Activity Center are only shown while the message notification is still there, and never on the lock screen. | Lock the phone and check that nothing private is visible. |
| 11 | Tapping a call row opens WhatsApp or your Phone app's call history. | Tap call rows, before and after clearing the notification. |
| 3 | Zone radius choices are 100, 150 and 200 m. | Confirm this wording is acceptable (see §2). |
| 4 | The Control Center explains Location Mode and Custom (My Silent Zones) more clearly. | Confirm the wording is acceptable (see §2). |

**Please note:**
- Silent Focus can't make WhatsApp ring while your phone is silenced. Android doesn't allow that.
  The repeated-call notice is shown quietly.
- Whether a WhatsApp call was answered, and how long it lasted, can't be detected.
- Phones can't reliably detect areas smaller than 100 m. A 150–200 m zone may switch on sooner
  inside buildings, but this isn't guaranteed.
- The map preview and place search need a Google Maps key we don't have yet. You can still set a
  zone with "Use My Current Location".

## 2. Decisions we need from you

1. **Radius:** we offer 100 / 150 / 200 m instead of the requested 10 / 50 m, because phones can't
   detect the small sizes reliably. Existing zones keep their saved size. OK?
2. **Mode wording:** Location Mode is described as "for public places … automatic public-place
   detection isn't available yet". Custom is labelled "Custom · My Silent Zones". OK?

## 3. Installing the test build (please read before installing)

The test build can be installed **over** your current Silent Focus only if all of these hold:
- your current app was installed in the same way: we need to know whether from **Google Play** or
  from an **APK file**;
- it was signed with the same key as the test build;
- its version number is not higher than the test build's.

If any of these don't match, Android refuses the install and **your current app and data stay
untouched**. Please don't uninstall Silent Focus to make it fit: that deletes its local activity
history and permissions.

To find out, without changing anything on your phone, tell us one of these:
- **From Google Play:** we read the signing key in Play Console. You don't need to do anything.
- **From an APK file:** send us that original APK file, or its name and where it came from.
- **Not sure:** open Settings → Apps → Silent Focus → App details, and tell us which store or
  installer it names.

**On Samsung phones:** sideloading may be blocked by "Auto Blocker" (Settings → Security and
privacy). It has to be switched off for the install, then back on.

## 4. What we need from you

| Item | Why |
|---|---|
| A **test account** (not your personal account) for the WhatsApp and zone tests | Keeps test data out of your real history |
| **Written consent** from you and the person calling you for the WhatsApp call tests | We check how WhatsApp's call notifications look. No names, numbers or message text are stored or sent. |
| **How your current app was installed** (§3) | Decides which build can update your app without reinstalling |
| A **Google Maps API key** for this app, or approval to create one in your Google Cloud project | Map preview and place search |
| Your **OK on the radius and mode wording** (§2) | Before we finalise these screens |
