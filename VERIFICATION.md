# Verification

Run on 2026-10-27 (Europe/Warsaw) with Node 24.22.1 and a local n8n 2.44.7.

| AC | What | Command | Result | Evidence |
|---|---|---|---|---|
| AC1, AC2, AC3, AC5 | Structure, sticky notes, no secrets, node names | `npm test` | pass | `tests/guidelines.test.mjs` |
| AC4 | Config validation | `npm test` | pass | `tests/check-settings.test.mjs` |
| AC6 | Parsing the real captured t.me page | `npm test` | pass | `tests/parsing.test.mjs`, `fixtures/durov.html` |
| AC7 | Keyword matching, Polish letters, whole words | `npm test` | pass | `tests/matching.test.mjs`, `tests/property.test.mjs` |
| AC8 | Deduplication and state | `npm test` | pass | `tests/dedupe.test.mjs` |
| AC9 | Gap note and alert cap | `npm test` | pass | `tests/gap-cap.test.mjs` |
| AC10 | Empty or failing channels | `npm test` | pass | `tests/channel-problems.test.mjs` |
| AC11 | Message format and escaping | `npm test` | pass | `tests/message-format.test.mjs` |
| AC12, AC13 | Honest limits, copy quality | `npm test`, `npm run lint:copy` | pass, clean | `tests/guidelines.test.mjs` |
| AC14 | Live run in local n8n | `N8N_URL=... N8N_API_KEY=... npm run e2e` | 12 of 12 checks pass, three runs in a row after review 2 | `samples/e2e-run.txt` |

Unit tests: 77 run, 77 pass, 0 fail (`npm test`, 27 Oct 2026, after review 3: duplicate post ids, boolean cap, emoji alt order).

## What the live run exercised

- Real n8n nodes: Schedule Trigger, Set, Code (task runner sandbox), HTTP Request, both HTML nodes, Split Out, If, Telegram, with workflow static data across scheduled runs.
- A mock preview server built from the real captured page (20 posts) and a mock Telegram Bot API, reached through the Telegram credential's base URL.
- Phases: baseline, new posts, no change, cap with a "+2 more" summary and gap note, no repeat. The channel list holds a working channel, one that returns no posts and one that returns HTTP 500.

## What was not exercised

- The real Telegram Bot API and a real bot token.
- Live t.me. The fixture is a real capture, but Telegram can change its markup.
- n8n Cloud. Only the self-hosted 2.44.7 package was used.

## Bugs the live run found

| Bug | Why unit tests missed it | Fix |
|---|---|---|
| The first HTML node read `body`, but HTTP Request 4.2 puts the page in `data`, so every run failed | Tests fed the Code nodes directly | Property set to `data`, test added |
| The first HTML node would stop the whole run on an error item from one channel | Same | `onError` set to continue, test added |
| The Telegram node added "This message was sent automatically with n8n" to every alert | The node was replaced by a mock in tests | `appendAttribution` set to false, test added |

The screenshot is `screenshots/canvas.png`, taken from an unmodified import of `workflow.json`.

## Review 2 e2e changes (27 Oct 2026)

Developer session B (docs/REVIEW-2.md, "Review of commit 7db78ec") found G1: messages were counted by a time window, so two overlapping runs could not be told apart; and G2: a missing length guard before `r.sent[1]`. The PM applied:

| Item | Change |
|---|---|
| G1 | the mock Bot API returns a unique `message_id`; a phase counts only messages whose id appears in its own execution's "Send alert to Telegram" output. Default tick raised from 6 s to 10 s; each phase logs its execution's duration |
| G2 | `assert.ok(r.sent.length >= 2)` before reading the second alert |

Runs after the change: 12/12, then 11/12, then 12/12. The 11/12 run failed "baseline: no keyword alerts, only the two channel-problem notices" with 0 messages: the first execution after activation started during the 1.5 s sleep at the start of each phase, so the phase awaited the second run, which correctly sent nothing. The sleep was removed (id matching makes it unnecessary). Three runs after that: 12/12, 12/12, 12/12 (`samples/e2e-run.txt` is the last).
