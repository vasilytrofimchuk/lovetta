# Lovetta iOS Sandbox Setup

This document covers the exact setup for testing Lovetta iOS subscriptions and tips with Apple's sandbox on a real iPhone.

## What is already configured in the repo

- Bundle ID: `ai.lovetta.app`
- Team ID: `PM5QM5PWN4`
- Native API base defaults to `https://lovetta.ai`
- Apple Sign In entitlement is enabled
- Push entitlement is enabled
- Xcode project capability metadata includes:
  - In-App Purchase
  - Sign in with Apple
  - Push Notifications
- No `.storekit` file is attached to the run scheme, so purchases use Apple's real sandbox instead of local StoreKit simulation

## What cannot be configured from this repo

These steps must be done in Apple Developer / App Store Connect:

1. Apple Developer -> Identifiers -> `ai.lovetta.app`
2. Confirm the App ID has these capabilities enabled:
   - In-App Purchase
   - Sign in with Apple
   - Push Notifications
3. App Store Connect -> My Apps -> Lovetta
4. Confirm the subscription and tip product IDs already exist and are attached to the app
5. App Store Connect -> Users and Access -> Sandbox
6. Create a sandbox tester with a brand new email address that has never been used as a real Apple ID

## Xcode setup

1. Run:

```bash
cd /Users/vasily/projects/lovetta
npm run build:ios
open /Users/vasily/projects/lovetta/web/ios/App/App.xcworkspace
```

2. In Xcode, select the `App` target.
3. Open `Signing & Capabilities`.
4. Verify:
   - Team = `PM5QM5PWN4`
   - Bundle Identifier = `ai.lovetta.app`
   - Automatically manage signing = enabled
   - `In-App Purchase` capability is present
   - `Sign in with Apple` capability is present
5. Open `Product -> Scheme -> Edit Scheme...`
6. Select `Run`.
7. Confirm there is no StoreKit configuration file attached.
   - The purchase flow must use Apple's sandbox, not a local `.storekit` file.
8. Select a physical iPhone as the run destination.

## iPhone setup

1. Enable `Developer Mode` on the iPhone.
2. Connect the iPhone to the Mac and trust the computer if prompted.
3. Install the app from Xcode once.
4. On the iPhone, open `Settings -> Developer`.
5. Open the sandbox account section and sign in with the sandbox tester.
6. If the device keeps trying to use the normal App Store account:
   - open `Settings -> Media & Purchases`
   - sign out
   - return to `Settings -> Developer`
   - sign in with the sandbox tester there

## First sandbox purchase test

Use a dedicated Lovetta production test account because native builds default to the production backend.

1. Launch Lovetta from Xcode on the iPhone.
2. Log in with a Lovetta test user.
3. Open the pricing screen.
4. Tap the monthly subscription.
5. Complete the Apple purchase sheet.
6. Wait 10-20 seconds. Sandbox is often slow.
7. Verify:
   - the paywall closes
   - premium access is active
   - profile/pricing shows the correct plan
   - the RevenueCat dashboard shows a sandbox transaction

Repeat the same flow for:

- yearly subscription
- restore purchases
- all 4 tip SKUs from the chat tip promo
- all 4 tip SKUs from the companion sheet

## Restore purchases test

1. Buy a subscription with the sandbox tester.
2. Sign out of Lovetta or reinstall the app.
3. Sign back in with the same Lovetta user.
4. Tap `Restore Purchases`.
5. Verify the active subscription returns after backend sync finishes.

## Tip test

1. Open a chat where the tip promo is visible.
2. Buy each tip SKU once from the promo.
3. Open the companion sheet.
4. Buy each tip SKU once from the companion sheet.
5. Verify after each successful purchase:
   - the purchase sheet completes
   - the thank-you message appears in chat
   - the tip promo refreshes or disappears
   - the RevenueCat event appears

## Resetting for repeated tests

If you need to test from a clean state:

1. App Store Connect -> Users and Access -> Sandbox
2. Select the tester
3. Use `Clear Purchase History`
4. Wait for Apple to finish clearing the tester history
5. If needed, also delete the matching sandbox customer in RevenueCat to remove old receipts from the customer timeline

## Optional sandbox controls

Apple's sandbox account settings also let you test:

- interrupted purchases
- faster or different renewal behavior
- billing retry scenarios

Use these only after the basic purchase/restore path is already working.

## Notes for Lovetta

- Native Lovetta calls the production API unless you explicitly rebuild with a different `VITE_API_URL`.
- TestFlight is not required for this sandbox path.
- Test cards are not used for StoreKit In-App Purchases.
- If you want a true real-money charge, use the live App Store build instead of sandbox.
