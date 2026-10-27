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
| AC14 | Live run in local n8n | `N8N_URL=... N8N_API_KEY=... npm run e2e` | 11 of 11 checks pass | `samples/e2e-run.txt` |

Unit tests: 66 run, 66 pass, 0 fail.

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
