// Produce sample outputs from the unit-test harness and the golden fixture, so
// readers can see what the workflow emits without running n8n. Offline only.
// Everything is produced by driving the shipped Code node through its input and
// output (no test hook), the same way the unit tests do.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  root, fixture, runFindNew, channelConfig, runGolden, GOLDEN_CONFIG,
} from '../tests/helpers.mjs';

// 1. Parsed posts: run the example fixture with no cap and no baseline so every
//    keyword match surfaces as an alert carrying the parsed fields. (Media-only
//    posts have no text and no keyword match, so they do not appear here.)
const parsedOut = runFindNew({
  inputItems: fixture('examplechannel.items.json'),
  channelItems: [channelConfig('examplechannel', { keywords: GOLDEN_CONFIG.keywords, baselineOnFirstRun: false, maxAlertsPerRun: 100 })],
  staticData: {},
}).out.map((i) => i.json);
const parsed = parsedOut
  .filter((j) => j.kind === 'alert')
  .map((j) => ({
    channel: j.channel,
    postId: j.postId,
    url: j.url,
    isoDate: j.isoDate,
    views: j.views,
    matched: j.matchedKeywords,
    snippet: j.snippet,
  }));
writeFileSync(join(root, 'samples', 'parsed-posts.json'), JSON.stringify(parsed, null, 2) + '\n');

// 2. Golden alert output (also the golden-test fixture).
const golden = runGolden().map((i) => i.json);
writeFileSync(join(root, 'tests', 'golden', 'examplechannel-alerts.json'), JSON.stringify(golden, null, 2) + '\n');

// 3. A single alert message as Telegram would receive it (HTML parse mode).
const firstAlert = golden.find((i) => i.kind === 'alert');
writeFileSync(join(root, 'samples', 'alert-message.txt'), (firstAlert ? firstAlert.text : '(no alert produced)') + '\n');

// 4. The summary message, if the cap was hit.
const summary = golden.find((i) => i.kind === 'summary');
if (summary) {
  writeFileSync(join(root, 'samples', 'summary-message.txt'), summary.text + '\n');
}

console.log(
  `Wrote samples: ${parsed.length} parsed posts, ${golden.filter((g) => g.kind === 'alert').length} alerts` +
  `, config keywords=${GOLDEN_CONFIG.keywords.join('/')} cap=${GOLDEN_CONFIG.maxAlertsPerRun}`,
);
