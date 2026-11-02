# Unfinished — what is not done, and why

Nothing here is faked. Each item needs Sidak's phone, friends, judgment,
or a build environment this machine does not have.

## TODO-SIDAK 1. Android build link (APK or Expo link)

No Android SDK is installed on the build machine, so no APK was built
and none is claimed. The supported path: run
`EXPO_PUBLIC_API_URL=http://<LAN-IP>:4010 npx expo start` and open the
app in Expo Go on a real Android phone — the assignment explicitly
accepts "an Expo link that works on Android". A production APK (EAS
Build or a local Gradle build with an Android SDK) is the follow-up once
a machine with the SDK is available.

## TODO-SIDAK 2. Walkthrough video (max 5 minutes, real phone)

Required shots, in order: first launch → full history loaded → a
month's totals checked against the checkpoint → search → a transaction
opened → server killed mid-sync → aeroplane mode and app restart → back
online → tests passing. Must be recorded on a real phone. Cannot be
done without Sidak's phone.

## TODO-SIDAK 3. Task 0 — app, referrals, feedback one-pager

Download the Simplify Money app, complete the profile, refer 3 friends,
collect their brutally honest feedback, compile the one-pager with
screenshots, and follow Simplify Money on LinkedIn, Instagram, and
YouTube. Needs real friends and real feedback — nothing here is
invented.

## TODO-SIDAK 4. Task 1 — Track teardown (1–2 pages)

Use the real app's Track screen (scroll months, search, open a
transaction, pull to refresh, network off and on), screenshot it, name
at least two things it shows wrongly or confusingly, and three changes
with reasons. Needs the real app on Sidak's phone.

## TODO-SIDAK 5. Decision-log entries

`docs/decision-log.md` has 10 TODO-SIDAK prompts. The evidence is in
`docs/data-decisions.md`; the judgment wording must be Sidak's. Do not
submit with placeholders in place.

## TODO-SIDAK 6. First real run on a phone

The app is typechecked, unit-tested (24 tests), verified against the
checkpoint via the live mock server, and its Android bundle exports
cleanly — but it has not run on a physical phone yet. The first Expo Go
run must confirm: the list renders, pull-to-refresh works, airplane
mode shows cached data with the banner, and the server URL setting
points at the right computer.

## TODO-SIDAK 7. PR review sign-off

`docs/pr-review-412.md` is a complete draft (8 BLOCK, 2 LET THROUGH,
verdict: do not merge). Sidak should read it once and confirm he agrees
with the verdict before it goes out as his review.

## Deliberately not attempted (Task 4 stretch)

No stretch item was attempted: no measured performance pass on a
mid-range Android, no kill-mid-sync demo recording, no TalkBack-only
accessibility pass. The core (Tasks 0–3 minus the human parts) was
prioritized over breadth, per the assignment's own "depth beats
breadth". The sync engine is, however, built to survive kills,
expired tokens, and racing syncs — see `src/lib/store.ts`.
