# Decision log — TODO-SIDAK

> These entries are intentionally left for Sidak to write in his own
> words. The assignment says a decision log that reads generated is a
> fail — it is read for the author's judgment, not prose. The technical
> evidence behind each question is in `docs/data-decisions.md`; the
> answers below must be his. Do not submit with these placeholders in
> place.

## TODO-SIDAK 1. Expo (managed) instead of bare React Native

Question to answer: why did you pick Expo over bare, and what did it
cost you (what can't you do in Expo Go that a bare build could)?

## TODO-SIDAK 2. AsyncStorage instead of SQLite

Question to answer: 4,686 rows fit in AsyncStorage today — at what size
would you switch to SQLite, and what would break first?

## TODO-SIDAK 3. Full sync, then incremental via sync_token

Question to answer: why not just re-fetch everything on every refresh?
What breaks if the token expires, and what did you do about it?

## TODO-SIDAK 4. IST calendar months for grouping

Question to answer: why Asia/Kolkata months instead of UTC months, and
what went wrong the first time you tried UTC?

## TODO-SIDAK 5. Own-account transfers excluded from totals

Question to answer: why isn't a ₹25,000 self-transfer spending or
earning, and how did you detect it in both record shapes?

## TODO-SIDAK 6. REFUND credits counted as income

Question to answer: you followed the backend checkpoint here, but is
that the right product behavior? What would you change, and what would
have to change with it?

## TODO-SIDAK 7. PENDING rows included in totals

Question to answer: the fixtures can't prove this either way (no PENDING
rows survive the changes feed). Why did you include them, and what
would make you reverse the call?

## TODO-SIDAK 8. What you cut, and why

Question to answer: which stretch goal (performance measurement, sync
robustness demo, accessibility pass) did you leave out, and what did
you protect instead with the time you had?

## TODO-SIDAK 9. The one thing you would rebuild differently

Question to answer: after building the sync engine, what is the weakest
part of the design, and what would you change with one more day?

## TODO-SIDAK 10. Offline-first: what the user sees when the server dies

Question to answer: why show stale data with a banner instead of an
error screen, and when would stale data be worse than no data?
