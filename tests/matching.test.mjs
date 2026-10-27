import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertFor, hasWorkflow } from './helpers.mjs';

function built() {
  if (!hasWorkflow()) {
    console.log('SKIP: build workflow.json first');
    return false;
  }
  return true;
}

// Matching is observed through the Code node output: a matched post produces an
// alert whose `matchedKeywords` lists the hits; a post that does not match (or is
// vetoed by an exclude keyword) produces no alert (alertFor returns null).
const matched = (text, keywords, opts = {}) => {
  const a = alertFor({ text, keywords, excludeKeywords: opts.exclude || [], matchWholeWords: opts.whole !== false });
  return a ? a.matchedKeywords : null;
};

test('matching is case-insensitive', () => {
  if (!built()) return;
  assert.deepEqual(matched('We love N8N here', ['n8n']), ['n8n']);
  assert.deepEqual(matched('KUBERNETES rocks', ['kubernetes']), ['kubernetes']);
});

test('matching is Unicode-aware (Polish)', () => {
  if (!built()) return;
  assert.deepEqual(matched('test ŻÓŁĆ test', ['żółć']), ['żółć']);
  assert.deepEqual(matched('żółć', ['ŻÓŁĆ']), ['ŻÓŁĆ']);
});

test('whole-word matching with matchWholeWords true', () => {
  if (!built()) return;
  assert.deepEqual(matched('AI tools are here', ['ai']), ['ai']);
  assert.deepEqual(matched('look (AI) now', ['ai']), ['ai']);
  assert.equal(matched('send me mail', ['ai']), null); // embedded, no alert
  assert.equal(matched('visited Kuwait', ['ai']), null);
});

test('substring matching with matchWholeWords false', () => {
  if (!built()) return;
  assert.deepEqual(matched('send me mail', ['ai'], { whole: false }), ['ai']);
  assert.deepEqual(matched('Kuwait', ['ai'], { whole: false }), ['ai']);
});

test('multi-word phrases match across any whitespace run', () => {
  if (!built()) return;
  assert.deepEqual(matched('a fully remote job today', ['remote job']), ['remote job']);
  assert.deepEqual(matched('a remote\n   job', ['remote job']), ['remote job']);
  assert.equal(matched('remotejob', ['remote job']), null);
});

test('regex special characters are treated literally', () => {
  if (!built()) return;
  assert.deepEqual(matched('I code in c++ daily', ['c++']), ['c++']);
  assert.deepEqual(matched('using .net core', ['.net']), ['.net']);
  assert.deepEqual(matched('buy $BTC now', ['$BTC']), ['$BTC']);
  assert.equal(matched('cxx not cpp', ['c++']), null);
});

test('exclude keywords veto a post', () => {
  if (!built()) return;
  // Vetoed: no alert at all.
  assert.equal(matched('remote job, no crypto', ['remote'], { exclude: ['crypto'] }), null);
  // Not vetoed: the post alerts normally.
  assert.deepEqual(matched('remote job', ['remote'], { exclude: ['crypto'] }), ['remote']);
});

test('matched keywords are returned de-duplicated in config order', () => {
  if (!built()) return;
  const text = 'remote kubernetes remote n8n';
  assert.deepEqual(matched(text, ['n8n', 'kubernetes', 'remote', 'n8n']), ['n8n', 'kubernetes', 'remote']);
});
