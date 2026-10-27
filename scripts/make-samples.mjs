// Produce sample outputs from the unit-test harness and the golden fixture, so
// readers can see what the workflow emits without running n8n. Offline only.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  root, findHelpers, fixture, runGolden, GOLDEN_CONFIG,
} from '../tests/helpers.mjs';

const h = findHelpers();

// 1. Parsed posts: the candidate objects the Code node builds from the HTML items.
const parsed = fixture('durov.items.json').map((i) => {
  const p = h.parsePost(i);
  return {
    channel: p.channel,
    postId: p.postId,
    url: p.url,
    isoDate: p.isoDate,
    views: p.views,
    text: p.text,
  };
});
writeFileSync(join(root, 'samples', 'parsed-posts.json'), JSON.stringify(parsed, null, 2) + '\n');

// 2. Golden alert output (also the golden-test fixture).
const golden = runGolden().map((i) => i.json);
writeFileSync(join(root, 'tests', 'golden', 'durov-alerts.json'), JSON.stringify(golden, null, 2) + '\n');

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
