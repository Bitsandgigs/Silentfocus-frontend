# Pro / Premium subscriptions - release & client test guide

## What the client builds are
| File | Platform | Notes |
|---|---|---|
| `SilentFocus-Android-Subscriptions.apk` | Android phones/emulators | Release code, debug-signed, production API URL |
| `SilentFocus-iOS-Simulator-Build.zip` | **iOS Simulator only** (Mac + Xcode) | Unzip, then `xcrun simctl install booted Silence_Focus.app` |

An installable iPhone build (TestFlight / ad-hoc) needs an Apple Developer account + signing profile, which
are not available here. Create it from Xcode (Product > Archive) when ready.

Both builds talk to `https://silent.rpaywin.com/`. Until the backend below is deployed, the Plans screen
shows "Subscriptions are not available on this server yet." and everything else works as before.

## Backend deploy (needs approval - production is live)
Repo `silent_focus`, branch `feature/stripe-pro-premium-subscriptions`.
1. Back up the database.
2. Deploy the code, `php artisan migrate --force` (migration `2026_11_13_000001_create_subscription_tables`; additive only).
3. `.env`: `STRIPE_SECRET=sk_test_...`, `STRIPE_WEBHOOK_SECRET=whsec_...`, `APP_URL=https://silent.rpaywin.com`,
   and decide `SUBSCRIPTION_ENFORCEMENT` (see below).
4. Stripe dashboard (TEST mode): webhook -> `https://silent.rpaywin.com/stripe/webhook`, events
   `checkout.session.completed, customer.subscription.created|updated|deleted, invoice.paid, invoice.payment_failed`;
   enable the Customer Portal.
5. Edit real prices / free-tier limits in table `subscription_plans` (placeholders are seeded).

### Decide before deploying
* Users without a subscription fall to the `free` row: calendars 0, schedules 2, zones 1, automation rules 2,
  devices 1, history 7 days. Existing users above these numbers keep their data but cannot add more.
  Set `SUBSCRIPTION_ENFORCEMENT=false` to launch without limits first.
* "Automation rules" = auto-reply templates (the only user-created rules stored server-side).

## Client test script (Stripe TEST cards)
1. Accounts > Subscription > Plans & subscription: shows Free, usage bars, Pro $4.99 / Premium $9.99.
2. Choose Pro > pay with `4242 4242 4242 4242` > return to app: Pro / Active, renewal date, limits 1/10/3/10/2, 30 days.
3. Repeat with `4000 0000 0000 0002` (declined): "Payment failed - no charge was made".
4. Hit a limit (e.g. 10 active schedules on Pro): upgrade prompt appears.
5. Upgrade to Premium: plan changes, limits become unlimited.
6. Cancel: "Ends <date>" banner + Keep my plan; Stripe test clock / `stripe trigger` for renewal, failure, expiry.
7. Same status on both platforms and in `GET /subscription`.
Android: dark mode follows the phone. iOS: dark mode now follows the phone too.

## Known limits
* iOS has no native silent-mode engine (Android only): iOS covers login, permissions, subscriptions, schedules UI.
* Real Stripe test keys have not been exercised yet; all end-to-end runs used `tools/fake_stripe.py`.
* iOS builds need the Podfile post_install patches (included) and, for Release, `HERMES_CLI_PATH` pointing at
  `node_modules/react-native/sdks/hermesc/osx-bin/hermesc` if the Pods copy is killed by macOS.
