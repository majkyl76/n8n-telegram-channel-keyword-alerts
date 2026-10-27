# Add the Telegram public channel keyword alerts template

Adds the workflow, its Code node sources, tests, docs and a live end-to-end script. Local n8n 2.44.7 imports it unchanged and the e2e run passes 12 of 12 checks.

Status: not merged. A fresh reviewer session has now run and its findings are fixed.

## How it was verified

- `npm test`: 85 run, 85 pass, 0 fail.
- `npm run lint:copy`: clean.
- `npm run e2e` against local n8n 2.44.7: 12 of 12 pass (`samples/e2e-run.txt`), re-run by the PM after the final-review fixes. Telegram Bot API was a local mock.
- Full table in `VERIFICATION.md`. Canvas screenshot in `screenshots/canvas.png`.

## Findings so far

PM live-run findings (all fixed, each with a regression test):

1. HTML node read `body`; HTTP Request 4.2 returns `data`.
2. HTML node had no error handling, so one bad channel could stop the run.
3. Telegram node appended an n8n attribution line to every alert.

Fresh-session reviewer (`docs/REVIEW-FINAL.md`), verdict FAIL on one blocker:

1. A keyword or exclude keyword containing a hyphen (e.g. `work-from-home`) crashed the matching Code node with an invalid regex escape, failing the whole run. Fixed: hyphens are no longer backslash-escaped.
2. Minor: truncation could cut a snippet or clip in the middle of an emoji's surrogate pair, leaving a lone surrogate in the sent text. Fixed: the cut backs off one character when it lands inside a surrogate pair.
3. Minor: a hand-edited, non-numeric `lastSeen` in static data was treated as string concatenation rather than a number, which could hide a real gap. Fixed: `lastSeen` is coerced to a number on read.
4. Minor, documentation only: n8n's `maxTries` is a total-attempt count, not a retry count, so the shipped values give one fewer retry than the spec wording suggests. Recorded in `NOTES.md` and the README's Troubleshooting section; no node settings changed.

All four were reproduced before any fix, then addressed test-first (`0d7d509` adds the failing tests, `7a5a5f9` fixes them).

Also noted, out of scope for a fixture-based fix: no fixture exercises a forwarded post (a nested message inside one preview wrap); recorded as a known limitation in `NOTES.md`.

## Definition of done

- [x] Spec: SPEC.md has AC1 to AC14, each mapped to a test file (`VERIFICATION.md`).
- [x] Tests written first and seen failing: commit `d3b27f7` "Add failing acceptance tests" precedes the build commit; the final-review fixes follow the same pattern (`0d7d509` then `7a5a5f9`).
- [x] Full suite re-run by me: `npm test` gives pass 85, fail 0.
- [x] Fresh reviewer session run, findings in `docs/REVIEW-FINAL.md`.
- [x] Every reviewer finding fixed or, for the documentation-only item, recorded with a regression test where applicable.
- [x] Real end-to-end run on real input: the preview fixture is a real capture; Telegram API is mocked.
- [x] Each AC checked one by one (`VERIFICATION.md`).
- [x] Failure behaviour checked: empty channel, HTTP 500 channel, invalid channel name (`tests/channel-problems.test.mjs`, e2e).
- [x] No secrets: AC3 test scans for token patterns. Credential is referenced by name only.
- [x] README and listing lint: `npm run lint:copy` clean.
- [x] Limits listed in README, LISTING and the main sticky.
- [x] Submission to n8n is NOT done. It needs Michal's approval and a creator account.

Verdict: ready for merge review. Tests, lint and the live e2e run all pass; the fresh-session findings are fixed with regression tests, and the one documentation-only item (`maxTries`) is recorded in `NOTES.md` and the README.
