import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runGolden, hasWorkflow, root } from './helpers.mjs';

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
