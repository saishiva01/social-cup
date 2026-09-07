# Social Cup — Product Requirements (Phase 1)

> **Source of truth.** This is a cleaned-up transcription of `SOCIAL_CUP_Proposal_Final 6.pdf`
> (Proposal Document, v1.1), the authoritative product specification, kept at the repo root.
> Where the PDF's text extraction was ambiguous or garbled (mainly the timeline/hours tables and
> one paragraph in Module 4), this document uses the clearest available reading and flags the
> spot — see the note in Module 4 and [docs/decisions/open-questions.md](../decisions/open-questions.md).
> If anything here appears to conflict with the PDF, **the PDF wins**; flag the conflict rather
> than silently resolving it in code.

## 1. Project Overview

Social Cup is a coffee membership and discovery app for Dallas. Members pay a monthly
subscription and receive a set number of drink credits. They spend those credits on real drinks
at a curated network of partner cafes, by showing a code at the counter. Alongside the
membership, the app helps people find cafes near them and rate the individual drinks they try,
rather than the cafe as a whole.

Independent cafes have no simple way to attract repeat visitors without discounting through a
large marketplace. Social Cup connects the two sides: members get a predictable monthly benefit
and a private record of everything they drink; cafes get paying customers through the door, and a
monthly statement showing exactly what was redeemed and what they are owed.

The product is delivered as a mobile app (iPhone and Android), a web admin panel for the Social
Cup team, and a lightweight web page baristas use to validate a member's code at the counter.
Cafes need no app, no account, and no hardware beyond a phone or tablet they already own. The
membership is bought inside the app through Stripe (Apple Pay, Google Pay, or card). Every
redemption is validated by the server and recorded against that cafe's agreed rate, so what a
cafe is owed is never in dispute.

This document defines the first release: discovery, drink ratings, the paid membership,
redemption at the counter, and the admin tools the Social Cup team needs to run the network day
to day. Capabilities that only become useful once the member base and cafe network have grown
are Out of Scope (Phase 2).

## 2. Target Audience and Roles

**Member (Paying Subscriber)** — the paying user. Subscribes for $24.99/month and receives 30
drink credits. Redeems a drink at any partner cafe using a code on their phone. Rates individual
drinks and builds a personal drink diary. Browses, searches, and filters the full cafe network.

**Visitor (Registered, Not Subscribed)** — has created an account but not subscribed. Browses,
searches, filters, rates drinks, and keeps a drink diary, but cannot redeem a drink. Sees the
membership screen when tapping Redeem. Becomes a Member at any time by subscribing.

**Barista (Partner Cafe Staff)** — staff working the counter. Holds no account, installs no app.
Opens a private scan page in the browser on the cafe's own phone or tablet. Enters the cafe PIN
once per device, after which that device stays trusted. Scans the member's code, or types the
six-digit backup code. Sees a green screen when the code is valid, a red screen with the reason
when it is not.

**Platform Administrator (Social Cup Team)** — runs the platform from a web panel. Adds partner
cafes and sets each cafe's payout rate per credit. Prices every drink in credits and sees the
resulting margin immediately. Chooses which cafes members see first (featured flag). Reviews the
redemption log, exports statements, and records payments to cafes.

## 3. Project Scope

### In Scope (Phase 1)

- **Platform and Architecture** — React Native mobile app (iPhone + Android, single codebase);
  React web admin panel; lightweight web scan page for baristas (no app, no account); Node.js
  backend with PostgreSQL, hosted on AWS.
- **Onboarding and Authentication** — sign up/log in with email, Google, or Apple; profile setup
  (coffee preferences, home neighbourhood); free browsing and rating for registered users who
  have not yet subscribed.
- **Shop Discovery** — searchable list of every partner cafe, nearest first; filter by Dallas
  neighbourhood, search by name; curated strips for featured cafes and signature drinks.
- **Shop Detail Pages** — photos, hours, address, one-tap directions; full drink menu with
  credit price alongside retail price; star ratings per drink; a single Redeem button.
- **Drink Ratings and Drink Diary** — star ratings + optional short notes on individual drinks; a
  personal drink diary on the member profile; a cafe score calculated from the ratings of the
  drinks it serves.
- **Curated Discovery** — an administrator flag places chosen cafes at the top of the list;
  signature drinks selected per cafe; preference matching and distance ordering beneath the
  curated picks.
- **Membership and Credits** — one paid plan, $24.99/month, 30 drink credits; in-app checkout via
  Stripe (Apple Pay, Google Pay, card); a credit ledger that grants, deducts, and resets credits
  monthly; a payout rate per cafe, stored on every redemption at the moment it happens.
- **Redemption and Barista Validation** — single-use code on the member's phone, valid five
  minutes; a private, PIN-protected scan page per cafe; server-side validation returning
  green/red in about three seconds; a six-digit backup code.
- **Admin Panel** — cafe onboarding, payout rates, drink pricing with live margin; a full
  redemption log with filters, CSV export, and the ability to void an entry; a payout run
  recording what has been paid to each cafe and when; member management (account status, credits
  remaining).
- **Platform Setup and Deployment** — development, staging, and production AWS environments;
  error monitoring; scheduled jobs resetting member credits each cycle; transactional email on
  the Social Cup domain.
- **Quality Assurance and Launch** — concurrency and replay testing on the credit ledger; full
  regression across iPhone, Android, and both web surfaces; App Store / Google Play submission
  and production deployment.

### Out of Scope (Phase 2)

- A self-service portal for cafes to manage their own menus/pricing.
- Automated bank payouts to cafes.
- Push notifications.
- Reporting and analytics beyond the CSV export.
- Ranking that responds automatically to community activity.
- Credit top-up purchases within a billing month.
- Order ahead and collection.
- Subscription checkout inside the mobile app **[as an alternative if Apple rejects the current
  in-app Stripe checkout — see Module 7.6 note below; this is otherwise in scope for Phase 1]**.
- Offline scanning when a cafe loses its internet connection.
- Connections between members and named groups; an activity feed; saving cafes and seeing which
  connections saved the same cafe; meetup planning, midpoint suggestions, check-in.

## 4. Architecture Summary

- **Frontend** — Mobile: React Native, one shared codebase for iPhone/Android. Admin: React web
  app. Barista scan page: lightweight mobile web page, no app, no account. Membership checkout:
  Stripe's native payment sheet, presented inside the mobile app.
- **Backend** — Node.js + Express: REST API, business logic, credit ledger, code validation,
  Stripe webhooks.
- **Database and Storage** — PostgreSQL on AWS RDS for all records; AWS S3 + CloudFront for cafe
  and drink photos.
- **Authentication** — Email and password with secure tokens that refresh in the background;
  Google Sign-In; Apple Sign-In (required by Apple whenever Google Sign-In is offered).
- **Communication** — Transactional email for account verification and password reset; Stripe
  sends receipts, renewal notices, and payment failure emails; push notifications not included
  in this release.
- **Payments** — Stripe subscriptions sold through Stripe's payment sheet inside the mobile app
  (Apple Pay, Google Pay, card in one native sheet); a Stripe-hosted page (opened from the app)
  handles cancellation and card updates.
- **Supporting Services** — Google Places (admin panel address autofill only); Sentry for error
  and crash monitoring across all surfaces.

## 5. Modules

### Module 1: Platform Setup and Deployment

- Separate AWS environments for development, staging, and production.
- PostgreSQL database, S3 photo storage, CloudFront delivery.
- CI/CD pipeline. SSL/HTTPS enforced across every surface.
- Error/crash monitoring on the app, admin panel, and scan page.
- A scheduled job resets every member's credit balance at the start of each billing cycle.
- A second scheduled job clears redemption codes that were generated but never scanned.
- Transactional email service on the Social Cup domain, with SPF and DKIM configured.

### Module 2: Onboarding and Authentication

- Sign up/log in with email + password; Continue with Google; Continue with Apple on iPhone
  (required whenever Google is offered).
- Sessions use secure tokens that refresh in the background without re-prompting login.
- Email verification link on signup; "Forgot password" sends a reset link expiring after one
  hour.
- Profile setup: display name (required at signup), profile photo (optional/skippable), coffee
  preferences (any of matcha, espresso, cold brew, latte), home neighbourhood (from a set list of
  Dallas areas).
- Location permission requested once, explained as used to sort cafes by distance; if declined,
  distance sorting turns off and the neighbourhood preference orders the list instead.
- Account states: **Visitor** (registered, not subscribed — full browse/search/rate access) and
  **Member** (subscribed — everything a Visitor can do plus credits and redemption). Payment
  gates the Redeem button and nothing else in the app.
- Account deletion available in-app (Apple requirement); deleting cancels any active
  subscription.

> **PRD's own flagged ambiguity ("Need Confirmation"):** _"This document assumes that registered
> users can browse, search, and rate without subscribing, and that payment is required only in
> order to redeem a drink. Please confirm before Module 7 is built."_
>
> **Resolved:** confirmed as assumed — see
> [ADR-0008](../adr/0008-visitor-member-account-states.md) and
> [open-questions.md #1](../decisions/open-questions.md#1-can-a-visitor-browse-search-and-rate-without-ever-subscribing).

### Module 3: Shop Discovery

The first screen a member sees — a sorted, searchable list of every partner cafe, ordered by
distance (background location read). No map in this release.

- Discover screen: curated strip (admin-featured cafes) at top; signature drinks strip below it;
  full cafe list underneath, nearest first; a toggle to turn distance sorting off.
- Cafe card: cover photo, name, neighbourhood, distance, vibe tags (e.g. "good for remote work"),
  lowest credit price on the menu ("drinks from 4 credits"), average star rating or a "New"
  badge.
- Neighbourhood filter (defaults to the member's saved neighbourhood); search by cafe name,
  filtering as the person types.
- Screen states: loading (skeleton list), empty search result (prompt to clear search), location
  denied (hides distance, orders by neighbourhood), offline (retry button).

### Module 4: Shop Detail Pages

The full page for a single cafe.

- Cafe information: photo gallery (up to 5 images); name, neighbourhood, full address; opening
  hours per day with an open/closed indicator; a signature badge on admin-flagged drinks.
- Full drink menu, credit price alongside retail price, star ratings per drink.
- Actions: Get Directions (Apple Maps on iPhone, Google Maps on Android); Rate a drink (opens
  drink picker, then rating sheet); Redeem here (primary button — behavior depends on account
  state).
- Redeem button behavior: **Visitor** → shown the membership screen. **Member with credits** →
  opens the drink picker. **Member with no credits** → disabled button + renewal date shown.
  **Member with failed payment** → disabled button + prompt to update card.

> **Extraction note:** the source PDF's text for this module (section 4.2, "Actions") had a
> column-merge artifact in extraction that interleaved a paragraph describing the Stripe in-app
> checkout flow. That paragraph's content is not lost — it duplicates what Module 7.2 states
> plainly — so it has been folded into Module 7.2 below rather than repeated here. See
> `SOCIAL_CUP_Proposal_Final 6.pdf` pages 6–7 directly if verifying this section.

### Module 5: Drink Ratings and Drink Diary

- A member rates a drink 1–5 stars, with an optional note up to 140 characters, or skips it. One
  rating per member per drink, editable at any time.
- Rating prompts: immediately after a successful redemption (the app already knows the cafe and
  drink); also available any time from the cafe page without redeeming. Visitors can rate drinks
  too, so the app has real content from week one.
- Drink diary: a profile screen listing every drink a member has rated, highest rated first, each
  entry showing drink, cafe, stars, note, and date.
- Each drink shows its own average and rating count on the cafe page. A cafe's star rating is the
  average of its drinks' ratings — there is no separate cafe review. A cafe with no rated drinks
  shows a "New" badge instead of a rating.

### Module 6: Curated Discovery

A new network has no ratings and no activity to rank, so the administrator decides what members
see first. Activity-driven ranking is Phase 2.

- Ranking order: featured cafes first (admin flag) → cafes matching the member's stated coffee
  preference → nearest cafes. The section is labelled "New on Social Cup."
- Signature drinks: the administrator flags one or more per cafe; shown as a curated strip on the
  Discover screen.
- The featured flag is toggled by hand and does not expire on its own. No scoring, weighting, or
  background ranking job exists in this release.

### Module 7: Membership and Credits

This module holds the money, so its rules are stated exactly.

- **The plan:** one paid plan, $24.99/month, including 30 drink credits. One credit is worth one
  dollar at any partner cafe. Credits reset every month and do not roll over.
- **Subscribing:** the member subscribes inside the app using Stripe's native payment sheet.
  Apple Pay, Google Pay, and card are offered in one native sheet, with no redirect to a browser.
  Once Stripe confirms the payment, the backend activates the membership, grants 30 credits, and
  updates the account status to Member immediately — the member can redeem a drink straight away.
- **Credit ledger:** credits are granted only when Stripe confirms a payment. Credits are
  deducted only when a barista scans a code, **never** when a code is shown. A scheduled job
  resets the balance to 30 on each successful renewal. No rollovers, no credit top-up purchases
  in this release.
- **Membership lifecycle:** Stripe sends the receipt, renewal notice, and any payment failure
  email. The member cancels or updates their card from inside the app, which opens a secure
  Stripe-hosted page. After cancelling, access and credits continue to the end of the paid
  period, then the account returns to Visitor. If a renewal payment fails, Stripe retries, the
  account shows as inactive, and redeeming is disabled.
- **Cafe payout rate:** each cafe has its own payout rate (dollars per credit), set by the
  administrator. The rate is copied onto every redemption record at the moment it happens —
  renegotiating a rate later never changes a past month's statement.
- **App Store compliance:** credits are redeemed for physical drinks at physical partner cafes,
  never anything digital. Apple guideline 3.1.5(a) permits a payment method other than in-app
  purchase for goods/services consumed outside the app. Softaims submits review notes citing that
  guideline (with comparable apps) alongside the first build. The product sells a membership that
  includes 30 drink credits — it never describes credits as coins, tokens, or a wallet balance.
  Credit top-up purchases are not offered, because they would present credits as a digital
  currency.
  > **Fallback noted directly in the PRD:** if Apple's review team rejects in-app checkout
  > despite the above, the alternative is a Stripe Checkout page on the Social Cup website,
  > opened from the app. _That alternative is explicitly "not included in this proposal"_ — it
  > would be a separate change request (the PRD estimates ~10–12 hours). See
  > [open-questions.md](../decisions/open-questions.md) and
  > [docs/architecture/payments.md](../architecture/payments.md).
  >
  > **Resolved:** Phase 1 builds only the Stripe PaymentSheet architecture described above; the
  > Apple IAP/StoreKit path is not built, and this Stripe-Checkout-web fallback is not built
  > proactively either — both remain deferred until an actual review rejection makes one
  > necessary. See [ADR-0010](../adr/0010-apple-review-fallback-deferred.md) and
  > [open-questions.md #3](../decisions/open-questions.md#3-apple-in-app-purchase-rejection-fallback).

### Module 8: Redemption and Barista Validation

Where the membership meets the counter. The barista makes no decisions and performs no
calculations — they point a camera and read a green or red screen. The server checks every rule
and deducts the credit. See [docs/architecture/redemption.md](../architecture/redemption.md) for
how this maps to the eventual implementation.

- **Member side:** opens the cafe page at the counter, taps Redeem here, picks a drink (sees its
  credit cost and resulting balance). On confirming, a code fills the screen with a five-minute
  countdown — the countdown starts at confirmation, not while queuing. A six-digit backup code is
  available if a camera can't read the QR code. The screen changes to "Redeemed" within about two
  seconds of a successful scan, then prompts the member to rate the drink just bought.
- **Barista side:** opens a private scan link in the cafe's own browser; enters the cafe PIN once
  (device then stays trusted); camera opens as soon as the page loads — no app, no account. A
  green screen shows the member's first name and photo, the drink, and credits deducted. A red
  screen shows exactly one reason: expired, already used, membership inactive, not enough
  credits, wrong cafe, or no connection. A "Today" tab lists that cafe's redemptions for the
  current day.
- **Validation rules:** credits are deducted only on a successful scan (a member who walks away
  loses nothing). Every code is single-use, valid five minutes, tied to one cafe and one drink. A
  member may hold only one live code at a time — generating a new one cancels the old one. **The
  deduction runs inside one locked database transaction, so a code can never be used twice.** The
  cafe's payout rate is written onto the redemption record at that moment. If the connection
  drops, the scan fails safely and no credits are deducted.
- **Scanner access/security:** each cafe has its own scan link and PIN. The link is not a secret
  — the PIN is the credential, and PIN attempts are rate limited. The administrator can reset a
  PIN to sign out every trusted device for that cafe at once. Staff must never accept the
  member's own screen as proof — if the cafe screen is not green, the redemption did not happen.

### Module 9: Admin Panel

- **Dashboard:** total members, active cafes, redemptions this month, credits redeemed, total
  owed to cafes, total margin for the period.
- **Settings:** the credit value in dollars (currently one credit = one dollar); plan price and
  credit allowance shown read-only (held in Stripe).

  > **Resolved:** this Settings field is fixed and displayed read-only in Phase 1, not
  > admin-editable — one credit is exactly $1 of drink value, with no overrides. See
  > [ADR-0009](../adr/0009-fixed-credit-value.md) and
  > [open-questions.md #2](../decisions/open-questions.md#2-is-the-1-per-credit-rate-a-fixed-platform-constant-or-an-admin-editable-setting).

- **Cafe management:** add a cafe (name, address, hours, coordinates, photos, vibe tags, perk
  line); set payout rate ($/credit); toggle featured flag; edit/remove a cafe; generate the
  cafe's scan link and set/reset its PIN.
- **Menu and pricing:** add/edit drinks per cafe (name, type, description, photo, signature
  flag); enter retail price and credit price; toggle a drink on/off without deleting it.
- **Live pricing calculator:** what the member pays in credits and its dollar value; savings
  against retail price; what Social Cup pays the cafe; the margin Social Cup keeps — all updated
  as prices are typed.
- **Members:** list every member with plan, status, join date, credits remaining; deactivate an
  account when needed.
- **Redemption log:** every redemption across every cafe, filterable by date range and cafe;
  columns for member, cafe, drink, credits, member value, cafe payout, margin, time; void a
  redemption (restores the member's credits, removes it from the cafe's payout), with every void
  recorded (who + reason).
- **Payouts:** choose a period, see each cafe's redemptions/credits/amount owed; export one
  cafe's redemptions to CSV as their monthly statement; record a payment (amount, date,
  reference) once the bank transfer is made; amount owed resets for the next period, full history
  retained.

### Module 10: Quality Assurance, UAT and Launch

Testing weighted toward the parts of the product that move money — the credit ledger receives
more attention than any screen.

- Test plan covering the mobile app, admin panel, and barista scan page.
- Concurrency testing on the credit ledger, including two devices scanning one code at the same
  moment.
- Expiry, replay, and retry testing across the full redemption flow.
- Full regression on iPhone and Android; cross-browser testing on the admin panel and scan page.
- Client UAT on real devices at a real cafe counter.
- App Store / Google Play submission with review notes prepared in advance.
- Production deployment with monitoring active.

## 6–8. Engagement, Timeline, and Team Composition

The PRD's remaining sections cover commercial terms not relevant to the engineering foundation:
two design-engagement options (Softaims-led design sprint vs. build against client-supplied
Figma), a ~7–8 week Phase 1 delivery timeline broken down by module, and team composition
(~4–4.5 FTE: PM/Tech Lead, Mobile Engineer, Backend Engineer, 0.5 FTE Frontend Engineer, 0.5 FTE
QA Engineer, 0.5 FTE UI/UX Designer for the design-sprint option). The source PDF's timeline and
hours tables suffered heavy column-merge artifacts during text extraction and have not been
transcribed here — refer to `SOCIAL_CUP_Proposal_Final 6.pdf` pages 12–15 directly if commercial
scheduling detail is needed. None of it changes Phase 1 scope, and none of it is used to drive
any decision in this codebase.
