# AI disclosure

## What was built with AI assistance

This app was built with AI assistance (an AI coding agent working from
the assignment page, the mock server source, and the fixtures). The AI
scaffolded the Expo project, wrote the sync engine, normalization,
money math, screens, tests, and these docs, and verified the numbers
against `fixtures/checkpoint.json` with `npm run verify`. All
verification results reported in the README are real outputs of those
commands, not estimates.

## What the human must still do

Task 0 (app install, 3 friend referrals, honest feedback one-pager),
Task 1 (teardown of the real app), the walkthrough video, the Android
build link, and the decision-log entries in `docs/decision-log.md` are
human work. They are marked TODO-SIDAK in `docs/unfinished.md` and were
not fabricated.

## One case where the AI's output was wrong

**The mistake.** The first version of the cache-key code used Node's
`Buffer` to base64-encode the server URL:

```ts
// WRONG — first version (would crash on a real phone)
const b64 = Buffer.from(url, 'utf8').toString('base64url');
```

**Why it was wrong.** React Native runs on Hermes, which has no Node
`Buffer` global. The code typechecked (Node types were present for the
test build) and would have passed every Node-based test — then crashed
on device the first time the app stored anything. The tests could not
catch it because they run on Node, where `Buffer` exists.

**The fix (what shipped).** A hand-rolled ASCII base64url encoder in
`src/lib/syncContext.tsx` — no Node APIs, no dependency:

```ts
// CORRECT — shipped version (pure JS, works on Hermes)
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
let out = '';
for (let i = 0; i < url.length; i += 3) {
  const b0 = url.charCodeAt(i);
  const b1 = i + 1 < url.length ? url.charCodeAt(i + 1) : 0;
  const b2 = i + 2 < url.length ? url.charCodeAt(i + 2) : 0;
  out += chars[b0 >> 2];
  out += chars[((b0 & 0x03) << 4) | (b1 >> 4)];
  if (i + 1 < url.length) out += chars[((b1 & 0x0f) << 2) | (b2 >> 6)];
  if (i + 2 < url.length) out += chars[b2 & 0x3f];
}
```

**The lesson applied.** After this, every module was re-checked for
Node-only APIs before shipping (the date code got an ICU fallback for
the same reason: devices with minimal ICU data). Typechecking is not
device verification — the app still needs its first real run on a phone
(see `docs/unfinished.md`).
