# Developer notes

Ambiguities, decisions, and what could not be verified offline. Read alongside
SPEC.md (the contract) and CLAUDE.md (the conventions).

## Decisions and ambiguities

- **Channel passed via `data-post`, not carried through the HTML nodes.** The HTML
  node's Extract operation returns a fresh item (`newItem = { json: {} }`, see
  `n8n-nodes-base` `Html/Html.node.js`), so any `channel` field set upstream is lost
  by the time posts reach the final Code node. Each post's `data-post="slug/123"`
  already carries the channel, so the Code node derives the channel from the post id
  and groups by it. The full channel list (including channels that returned nothing)
  comes from `$('Check settings and list channels').all()`.

- **AC10 "channel problem" is detected as zero parsed posts.** SPEC lists three
  triggers (non-200 status, request error, zero post blocks) that all produce the same
  single notice. All three converge to "no post blocks parsed for this channel", which
  the Code node sees as an empty group for that channel. The HTTP node is set to
  `onError: continueRegularOutput` with `neverError`/`fullResponse`, so a failed or
  non-200 request still flows through, yields no post blocks, and becomes one notice.
  One bad channel therefore never stops the others.

- **Baseline run output.** AC8 says a baseline run "sends no alerts, but the run output
  says so". The Code node emits a `kind: "baseline"` item with `send: false`. The If
  node only forwards items where `send` is true, so no Telegram message is sent, but
  the baseline note is visible in the execution data.

- **Telegram credential id omitted.** The node references
  `credentials.telegramApi = { name: "Telegram Bot account" }` with no `id`. n8n import
  accepts a credential referenced by name and asks the user to pick the matching
  credential. Omitting the id keeps the file free of instance-specific values (AC1) and
  of anything that looks like a secret (AC3).

- **Node ids are short readable strings** (for example `node-fetch`), not UUIDs, so the
  AC3 "no long random strings" check is honest and the connections stay readable. n8n
  accepts arbitrary unique node ids on import.

- **Node count.** The flow described in SPEC yields 11 functional nodes plus 2 triggers
  are part of those 11 (schedule, manual, set, check, http, html split, split out, html
  extract, find, if, telegram). That is just under the soft "12 to 16" target in SPEC.
  I kept to the described flow rather than padding with a node that does nothing.

- **Sticky colours.** Evidence recorded in `docs/sticky-colours.md`: 1 = yellow (main),
  3 = red (warning on the Telegram node), 7 = white/neutral (section stickies).

- **Fixture item set.** `fixtures/durov.items.json` and `fixtures/none.items.json` were
  produced by `scripts/make-fixture-items.mjs` using the same Cheerio that n8n bundles
  (`/workspace/n8n-local/node_modules/cheerio`), reproducing the two HTML nodes'
  selectors and n8n's inner-HTML return. durov gives 20 post items (ids 531-548, 551,
  552, so the page itself has a 549-550 gap); none gives 0. The captured HTML in
  `fixtures/durov.html` and `fixtures/none.html` was not edited.

- **No test hook in the shipped code (AC17).** `src/find-new-posts.js` ends with a plain
  `return main();` and carries no `$testExpose` or other test-only branch. The unit tests
  load `workflow.json`, pull each Code node's `jsCode`, and run it with the n8n globals
  stubbed (`tests/helpers.mjs`). Parsing, matching and message building are all observed
  through the Code node's normal input and output, so nothing test-only ships.

- **Link built from channel and id, not the page href (AC16).** `parsePost` derives the
  permalink as `https://t.me/<channel>/<id>` from the `data-post` slug and numeric id. The
  raw `href` the HTML node pulls from the page is ignored, so a hostile href cannot reach
  any message.

- **`maxTries` is n8n's total attempt count, not a retry count.** The HTTP node's
  `maxTries: 2` and the Telegram node's `maxTries: 3` therefore give 1 and 2 retries
  after the first try, not 2 and 3 as SPEC's wording ("retry on fail 2/3 times") might
  suggest. Confirmed by reading `n8n-core/dist/execution-engine/workflow-execute.js`:
  `getRetryParams()` clamps to a minimum of 2, and the attempt loop runs `tryIndex <
  maxTries` times in total. Left the node settings as shipped (final review, F4): they
  still retry, just by one fewer attempt than the wording implied. Raise `maxTries` to
  3 (HTTP) and 4 (Telegram) if more retries are wanted.

## Node versions used (all present in the installed n8n 2.44.7)

scheduleTrigger 1.2, manualTrigger 1, set 3.5, code 2, httpRequest 4.2, html 1.2,
splitOut 1.1, if 2.2, telegram 1.2, stickyNote 1. The AC1 test reads the installed
`n8n-nodes-base` and checks each typeVersion exists; it skips with a message if the
install is absent.

## Could not verify offline (for the PM's live e2e run)

- Whether n8n accepts the exact parameter shapes on import for every node
  (`onError: continueRegularOutput` on the HTTP node, the If v2.2 condition block, the
  Telegram `additionalFields.disable_web_page_preview`). These were taken from the
  installed node descriptions, not guessed, but only a live import proves them.
- Whether the real HTML nodes emit exactly the item shape reproduced in the fixtures.
  The unit tests assume that shape; `scripts/e2e.mjs` (AC14) proves the real nodes.
- That `$getWorkflowStaticData('global')` persists across scheduled runs as expected
  (documented n8n behaviour, not exercised here).
- Whether a forwarded post (a second, nested `.tgme_widget_message` for the original
  message inside one wrap) is parsed as one post or two. `fixtures/durov.html` has no
  forwarded post, so the "Extract fields from each post" node's selectors are untested
  against that shape (final review, known gap). Capturing one real forwarded post into
  `fixtures/` would close this.

## Exact `npm test` output

```
ℹ tests 85
ℹ pass 85
ℹ fail 0
ℹ skipped 0
ℹ duration_ms ~400
```

Run offline with `npm test` (Node's built-in test runner, no dependencies).
`npm run build` regenerates `workflow.json`; `npm run fixtures` regenerates the derived
fixtures; `npm run samples` regenerates `samples/` and the golden file;
`npm run lint:copy` checks the writing.
