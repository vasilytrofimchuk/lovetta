# iOS Billing Sandbox Runbook

Real-device App Store sandbox validation for Lovetta iOS billing.

## Preconditions
- Use a physical iPhone signed into a sandbox Apple ID.
- Use a dedicated Lovetta production test account. Do not reuse a real user account.
- App Store Connect and RevenueCat products/offers must already exist for:
  - `lovetta_monthly`
  - `lovetta_yearly`
  - `lovetta_tip_999`
  - `lovetta_tip_1999`
  - `lovetta_tip_4999`
  - `lovetta_tip_9999`
- Local `.env` must contain `VITE_REVENUECAT_IOS_KEY` and `REVENUECAT_SECRET_KEY`.
- The app targets production by default in native mode. These tests hit production systems and data.

## Build And Install
1. Run `npm run build:ios`.
2. Open Xcode with `npm run open:ios`.
3. Select the physical iPhone as the destination.
4. Confirm the `App` scheme is selected.
5. Build and run the app on device.

## Optional XCUITest Setup
Set these test-scheme environment variables before running `AppUITests`:
- `UITEST_EMAIL`
- `UITEST_PASSWORD`
- `UITEST_COMPANION_NAME` (default: `Luna`)

The UI tests assume the account already exists. The tip-promo test also assumes the account is already in a visible promo state.

## Subscription Validation
1. Launch the app and sign in with the dedicated test account.
2. Open pricing from the free-trial banner or profile.
3. Verify the monthly card, yearly card, and `Restore Purchases` button are visible.
4. Buy the monthly product in the Apple sandbox sheet.
5. Wait for the app to dismiss the paywall only after backend sync completes.
6. Verify on the device:
   - Chat access is unlocked.
   - Profile shows an active subscription.
   - `Manage Subscription` opens the App Store subscriptions page.
7. Verify on the backend:
   - `subscriptions.payment_provider = 'revenuecat'`
   - `subscriptions.plan = 'monthly'`
   - `subscriptions.status = 'active'`
   - `billing_events` contains `rc:<event_id>`
8. Repeat for yearly.
9. Run `Restore Purchases` and verify it syncs without creating a duplicate row.

## Cancellation And Expiration
1. Cancel the sandbox subscription in App Store settings.
2. Wait for the RevenueCat cancellation webhook.
3. Verify `subscriptions.status = 'canceling'`.
4. After sandbox expiration, verify the expiration webhook changes the row to `canceled`.

## Tip Validation
1. Use a prepared production test account with at least one companion and an easy path to the tip promo.
2. Trigger the tip promo in chat and verify all 4 tip buttons render.
3. Buy each tip SKU once through the Apple sandbox sheet.
4. Verify after each successful tip:
   - The matching row exists in `tips`.
   - `tips.companion_id` matches the active companion when the purchase came from chat or companion sheet.
   - The assistant thank-you message is inserted into the chat.
   - The promo disappears after sync completes.
5. Open the companion sheet and verify the same 4 tip buttons are visible there too.

## Duplicate Webhook Check
1. Pick one RevenueCat event id from production logs.
2. Confirm only one `billing_events` row exists for `rc:<event_id>`.
3. Confirm the related subscription or tip was only applied once.

## Cleanup
1. Note the test user email and companion ids used during validation.
2. Cancel active sandbox subscriptions after validation.
3. Remove or archive tip/chat rows only if production cleanup is required for reporting hygiene.
4. Keep a log of which sandbox purchases were used so later runs do not reuse ambiguous production data.
