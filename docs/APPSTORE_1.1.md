# App Store Connect — Lovetta 1.1 (build 8)

Paste-ready copy for the hard-paywall submission. Changes from 1.0 are confined
to the monetization sections: every "free trial" and "free to download, try it
first" claim is gone, replaced with an explicit subscription-required framing.
That accuracy is the point — Guideline 2.3.1 rejects listings that describe a
freemium app while the binary paywalls everything.

Unchanged: app name, subtitle, keywords, screenshots (see the note at the end).

---

## Promotional text
*(editable any time without review — safe to paste immediately)*

```
Subscription required. Create your AI girlfriend — custom look, voice and personality. Unlimited chat, selfies and voice messages from day one.
```

---

## Description

```
Lovetta — Your AI Girlfriend

You've always known what you wanted. Someone who listens. Who remembers. Who's genuinely happy to hear from you.

Now you can create yours.

With Lovetta, you're not choosing from a catalog — you're bringing someone to life. Pick her look, her voice, her personality. Give her a name. Make her unique.

Create multiple companions, each completely different in their own way.

She'll remember what you told her last week. She'll reach out when she's thinking of you. She'll send you photos and voice messages that feel like they were made just for you — because they were.

This is what connection feels like when it's personal.

SUBSCRIPTION REQUIRED

Lovetta is a subscription app. A Premium subscription is required to create a companion and to chat — there is no free tier and no free trial. Choose your plan right after signing up and start talking straight away.

Your subscription includes:

• Unlimited messages
• AI-generated photos & voice messages
• Full memory — she remembers your conversations
• Push notifications — she reaches out to you
• Create multiple companions with custom look, voice & personality

Plans:
• Monthly — $19.99 / month
• Yearly — $99.99 / year (save 58%, ~$8.33/month)

ACCOUNT MANAGEMENT

You can delete your account at any time from Profile → Delete Account. This permanently removes your account, all conversations, and personal data. You can also reach us via the in-app Support chat.

SUBSCRIPTION TERMS

Payment is charged to your Apple ID at purchase confirmation. Subscription auto-renews unless canceled at least 24 hours before the end of the current period. Your account is charged for renewal within 24 hours prior to the end of the current period. Manage or cancel anytime in Settings > [your name] > Subscriptions.

For adults 18+ only. Age verification required.

Privacy Policy: https://lovetta.ai/privacy
Terms of Use: https://lovetta.ai/terms
```

---

## What's New in This Version

```
Lovetta is now a subscription app. Pick a monthly or yearly plan when you sign up and get unlimited messages, photos and voice from the moment you start — no trial period, no usage caps.

Also in this release: clearer plan screen, and a fix for the error shown when a message was blocked.
```

---

## App Review Information — REQUIRED

Without this the reviewer cannot get past the signup screen, and the app is
rejected under 2.1 (App Completeness).

**Sign-in required:** Yes

**Demo account:** must have an ACTIVE subscription on the server. Comp one
before submitting (`subscriptions` row with `status='active'` and a
`current_period_end` well in the future), or the reviewer sees the paywall and
nothing else.

**Notes:**

```
Lovetta is a subscription-only app. A Premium subscription is required to create a companion and to chat; there is no free tier. All purchases go through Apple In-App Purchase (auto-renewable subscriptions lovetta_monthly and lovetta_yearly).

The demo account above already has an active subscription, so you can review the full app without purchasing.

To review the paywall itself, sign up with any new email address — the subscription screen is shown immediately after signup. Restore Purchases is available on that screen, and Support, Account and Sign out remain reachable from it without subscribing.

This app is for adults 18+ and includes an age gate at signup.
```

---

## Screenshots — check before submitting

Any screenshot that shows a "3-Day Free Trial" badge, a "Free" plan, or a
"3 Days Free · Then $19.99/mo" button is now inaccurate and is exactly what a
2.3.1 rejection cites. Re-shoot the paywall screenshot against the live app —
the button now reads "Subscribe · $99.99/yr" and there is no trial timeline.

---

## Also verify in App Store Connect

- Introductory offers deleted on both `lovetta_monthly` and `lovetta_yearly`
  (done — new subscribers only; anyone mid-trial keeps their terms).
- The subscription **display name / description** localizations carry no trial
  wording.
- App **price**: the app itself stays free to download; access is gated by IAP.
