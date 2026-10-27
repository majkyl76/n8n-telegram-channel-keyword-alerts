# Review 2: the hand edits made without the developer

Scope: the changes in `git diff 313f2fe HEAD` for `scripts/build.mjs`,
`scripts/e2e.mjs` and `tests/guidelines.test.mjs`. This is a skeptical pass for
real problems only (races, vacuous assertions, wrong fixture assumptions, AC
breakage). `scripts/e2e.mjs` is not edited here; findings are listed as changes
to make. The e2e was not run (no live n8n), so the e2e findings are reasoned,
not observed.

## build.mjs and guidelines.test.mjs: no problems found

- `dataPropertyName` `body` to `data` on the first HTML node is correct. A
  `text/html` response under the HTTP node's autodetect writes the body to
  `data` (verified independently in REVIEW-1). The matching guideline assertion
  is sound.
- `appendAttribution: false` is a valid Telegram `additionalFields` key and the
  guideline test pins it.
- `onError: continueRegularOutput` added to the first HTML node is correct and
  necessary. See F3: it was added to only one of the three parsing nodes.
- The "sandbox globals" guideline test (`new URL|Buffer|...`) is a fair static
  check and matches AC18. Not vacuous: it runs over the real `jsCode`.

## Findings in scripts/e2e.mjs (to change, not changed here)

### F1 (medium): phase results can be contaminated by an overlapping run
`runPhase` flips the module-global `phase`, clears `sent` and `hits.preview`,
records `T = Date.now()`, then `waitForRun` returns the first execution whose
`startedAt > T`. But `sent`/`hits` are process-global and keep collecting from
*every* execution, including one that the schedule started just before `T` and
that is still fetching when `phase` flips. The trigger fires every
`TICK_SECONDS` (6 s) and a run touches three channels at a 1 s batch interval
(plus retries on the dropped channel), so overlap is plausible. The strict
counts (`r.sent.length === 2`, `=== 11`) are the victims: a straggler's sends
land in the freshly cleared array and are attributed to the new phase. The
`await sleep(1500)` at the top of `runPhase` does not guarantee the previous
run has drained.

What I would change: deactivate the schedule and drive each phase with exactly
one explicit run (manual trigger or a single activate/deactivate cycle), or
correlate messages to the returned execution id instead of reading a shared
`sent` array, or wait for any in-flight execution to reach `stoppedAt` before
clearing the buffers.

### F2 (low): two assertions pass vacuously on an empty `sent`
`gap: alerts carry the possible-gap note` uses `r.sent.slice(0,10).every(...)`
and `newposts: ... posts are silent` uses `!all.includes('alpha/554')`. Both
are true when `r.sent` is empty. Because each `check()` is independent (its own
try/catch), a zero-message run caused by F1 would show these as PASS while the
sibling count check FAILs, which misreads the real state. What I would change:
assert `r.sent.length` first (`> 0`, or the exact expected count) inside those
checks, then run the `every`/`includes` test.

### F3 (medium, now fixed on this branch): the dropped-connection phase needs
`onError` on all three parsing nodes, not just the first
The `dropped-connection` phase asserts `r.exec.status === 'success'` and that
the healthy channel `alpha` is still read. That only holds if a transport-error
item (no `data`, hence no `posts`) can pass through the first HTML node, Split
Out and the second HTML node without throwing. At 313f2fe..HEAD the hand edit
set `onError: continueRegularOutput` on the first HTML node only; `Split out
each post` and `Extract fields from each post` had none, so the empty item
would abort the whole execution and starve `alpha` (exactly the risk REVIEW-1
raised). This branch now sets `onError` on all three (AC19), so the phase can
pass. Do not run the e2e against a build that lacks those two. Related: the
guidelines live-run test only pins `onError` on `Split page into post blocks`;
the new `tests/review-findings.test.mjs` AC19 case pins all three.

### F4 (low): the baseline page assumes the fixture splits into exactly 20 blocks
`baseline('alpha')` renumbers blocks to consecutive ids 533..552 by splitting
`fixtures/durov.html` on the literal string
`<div class="tgme_widget_message_wrap js-widget_message_wrap">`. The assertion
`inItems.length === 20` and `postId === 'alpha/533'` depend on that literal
class string appearing, in that order, for all 20 blocks. The real HTML nodes
select by CSS (`.tgme_widget_message_wrap`), which does not care about class
order or the second class. If the captured markup differs for any block the
string split silently yields a different count and the count assertion breaks,
for a reason unrelated to the workflow. This is a brittle coupling to exact
markup. What I would change: build the mock pages from the same Cheerio split
that `scripts/make-fixture-items.mjs` already uses, or assert on the CSS
selector rather than a literal string.

## Not problems (checked to pre-empt false positives)
- The cap/gap arithmetic is consistent: after `newposts` the state is at 557,
  the `cap` page serves 560..571, so the lowest id 560 exceeds 557+1 and the
  gap flag is set; 12 matches with a cap of 10 give the newest 10 (562..571)
  plus a `+2 more` summary. That matches the assertions.
- `boomer` returning HTTP 500 producing a notice (not an execution error) is in
  line with the `neverError`/`fullResponse`/`onError` design and AC10.
- Cleanup in the `finally` block deactivates and deletes both workflows and the
  credential, so a crash does not leave live state behind.
