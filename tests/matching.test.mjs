import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findHelpers, hasWorkflow } from './helpers.mjs';

function helpers() {
  if (!hasWorkflow()) {
    console.log('SKIP: build workflow.json first');
    return null;
  }
  return findHelpers();
}
const match = (h, text, kw, { exclude = [], whole = true } = {}) =>
  h.matchKeywords(text, kw, exclude, whole);

test('AC7: matching is case-insensitive', () => {
  const h = helpers();
  if (!h) return;
  assert.deepEqual(match(h, 'We love N8N here', ['n8n']), ['n8n']);
  assert.deepEqual(match(h, 'KUBERNETES rocks', ['kubernetes']), ['kubernetes']);
});

test('AC7: matching is Unicode-aware (Polish)', () => {
  const h = helpers();
  if (!h) return;
  assert.deepEqual(match(h, 'test ŻÓŁĆ test', ['żółć']), ['żółć']);
  assert.deepEqual(match(h, 'żółć', ['ŻÓŁĆ']), ['ŻÓŁĆ']);
});

test('AC7: whole-word matching with matchWholeWords true', () => {
  const h = helpers();
  if (!h) return;
  assert.deepEqual(match(h, 'AI tools are here', ['ai']), ['ai']);
  assert.deepEqual(match(h, 'look (AI) now', ['ai']), ['ai']);
  assert.deepEqual(match(h, 'send me mail', ['ai']), []);
  assert.deepEqual(match(h, 'visited Kuwait', ['ai']), []);
});

test('AC7: substring matching with matchWholeWords false', () => {
  const h = helpers();
  if (!h) return;
  assert.deepEqual(match(h, 'send me mail', ['ai'], { whole: false }), ['ai']);
  assert.deepEqual(match(h, 'Kuwait', ['ai'], { whole: false }), ['ai']);
});

test('AC7: multi-word phrases match across any whitespace run', () => {
  const h = helpers();
  if (!h) return;
  assert.deepEqual(match(h, 'a fully remote job today', ['remote job']), ['remote job']);
  assert.deepEqual(match(h, 'a remote\n   job', ['remote job']), ['remote job']);
  assert.deepEqual(match(h, 'remotejob', ['remote job']), []);
});

test('AC7: regex special characters are treated literally', () => {
  const h = helpers();
  if (!h) return;
  assert.deepEqual(match(h, 'I code in c++ daily', ['c++']), ['c++']);
  assert.deepEqual(match(h, 'using .net core', ['.net']), ['.net']);
  assert.deepEqual(match(h, 'buy $BTC now', ['$BTC']), ['$BTC']);
  assert.deepEqual(match(h, 'cxx not cpp', ['c++']), []);
});

test('AC7: exclude keywords veto a post', () => {
  const h = helpers();
  if (!h) return;
  assert.equal(match(h, 'remote job, no crypto', ['remote'], { exclude: ['crypto'] }), null);
  assert.deepEqual(match(h, 'remote job', ['remote'], { exclude: ['crypto'] }), ['remote']);
});

test('AC7: matched keywords are returned de-duplicated in config order', () => {
  const h = helpers();
  if (!h) return;
  const text = 'remote kubernetes remote n8n';
  assert.deepEqual(match(h, text, ['n8n', 'kubernetes', 'remote', 'n8n']), ['n8n', 'kubernetes', 'remote']);
});
