import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runFindNew, channelConfig, fixture, hasWorkflow, root } from './helpers.mjs';

// Golden config: fixture in (durov.items.json), expected output JSON out.
export const GOLDEN_CONFIG = {
  keywords: ['AI', 'Telegram'],
  excludeKeywords: [],
  matchWholeWords: true,
  maxAlertsPerRun: 5,
  baselineOnFirstRun: false,
  chatId: '12345',
};

export function runGolden() {
  const inputItems = fixture('durov.items.json');
  const channelItems = [channelConfig('durov', GOLDEN_CONFIG)];
  return runFindNew({ inputItems, channelItems, staticData: {} }).out;
}

test('golden: durov fixture produces the expected alert output', () => {
  if (!hasWorkflow()) {
    console.log('SKIP: build workflow.json first');
    return;
  }
  const goldenPath = join(root, 'tests', 'golden', 'durov-alerts.json');
  assert.ok(existsSync(goldenPath), 'golden file must exist (run: npm run samples)');
  const expected = JSON.parse(readFileSync(goldenPath, 'utf8'));
  const actual = runGolden().map((i) => i.json);
  assert.deepEqual(actual, expected);
});
