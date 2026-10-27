# Add the Telegram public channel keyword alerts template

Adds the workflow, its Code node sources, tests, docs and a live end-to-end script. Local n8n 2.44.7 imports it unchanged and the e2e run passes 11 of 11 checks.

Status: not merged. A fresh reviewer session still has to run (Claude Code is paused team-wide).

## How it was verified

- `npm test`: 66 run, 66 pass, 0 fail.
- `npm run lint:copy`: clean.
- `npm run e2e` against local n8n: 11 of 11 pass (`samples/e2e-run.txt`). Telegram Bot API was a local mock.
- Full table in `VERIFICATION.md`. Canvas screenshot in `screenshots/canvas.png`.

## Findings so far

Developer self-review (Claude Code build session): 64 tests passing, no open issues reported. It could not know the live node output shape.

PM live-run findings (all fixed, each with a regression test):

1. HTML node read `body`; HTTP Request 4.2 returns `data`.
2. HTML node had no error handling, so one bad channel could stop the run.
3. Telegram node appended an n8n attribution line to every alert.

Fresh-session reviewer: not run yet. Planned prompt is in `/workspace/team/cc-run-review.sh`.

PM skeptical review, open items for the fix round:

- `src/find-new-posts.js` ships a `$testExpose` test seam (guarded by `typeof`, harmless but untidy). Move it out of the shipped JSON.
- The post link is read from the page's `href`. Building it from the post id would be safer.
- Alerting is at most once: state is saved before the Telegram call, so a send that fails after three tries is lost. Documented as a limit.
- Depends on t.me preview markup (`.tgme_widget_message_wrap`). Not covered by any contract.

## Definition of done

- [x] Spec: SPEC.md has AC1 to AC14, each mapped to a test file (`VERIFICATION.md`).
- [x] Tests written first and seen failing: commit `d3b27f7` "Add failing acceptance tests" precedes the build commit.
- [x] Full suite re-run by me: `npm test` gives pass 66, fail 0.
- [ ] Fresh reviewer session run, findings table attached. Pending, Claude Code paused.
- [ ] Every reviewer finding fixed with a regression test. Pending.
- [x] Real end-to-end run on real input: the preview fixture is a real capture; Telegram API is mocked.
- [x] Each AC checked one by one (`VERIFICATION.md`).
- [x] Failure behaviour checked: empty channel, HTTP 500 channel, invalid channel name (`tests/channel-problems.test.mjs`, e2e).
- [x] No secrets: AC3 test scans for token patterns. Credential is referenced by name only.
- [x] README and listing lint: `npm run lint:copy` clean.
- [x] Limits listed in README, LISTING and the main sticky.
- [x] Submission to n8n is NOT done. It needs Michal's approval and a creator account.

Verdict: FIX FIRST. The workflow runs end to end, but the fresh-reviewer step is missing and the open items above are not done.
