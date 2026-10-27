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

// Hand-rolled deterministic RNG (mulberry32) with a fixed seed.
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = 1234567;
const ALPHABET = 'abcdef ŻÓŁĆ <>&"\'\n\t äé😀#@/.$+'.split('');

test('AC11 property: 400 random posts always build a message under 4096 chars', () => {
  const h = helpers();
  if (!h) return;
  const rand = rng(SEED);
  for (let i = 0; i < 400; i++) {
    const len = Math.floor(rand() * 2000);
    let text = '';
    for (let j = 0; j < len; j++) text += ALPHABET[Math.floor(rand() * ALPHABET.length)];
    const channel = 'ch' + Math.floor(rand() * 1e6);
    const post = { channel, postId: i, url: 'https://t.me/' + channel + '/' + i, isoDate: '2026-07-16T20:45:25+00:00', text, views: '1' };
    const gap = rand() < 0.5;
    const msg = h.buildAlertText(channel, post, ['x', 'y'], gap);
    assert.ok(msg.length < 4096, `message ${i} length ${msg.length}`);
    // Structure is intact: exactly one bold header and one link.
    assert.equal((msg.match(/<b>/g) || []).length, 1);
    assert.equal((msg.match(/<a href=/g) || []).length, 1);
    assert.ok(msg.endsWith('</a>') || /<\/a>\n/.test(msg + '\n'));
  }
});

test('AC7 property: a whole word always matches, an embedded one never does', () => {
  const h = helpers();
  if (!h) return;
  const rand = rng(SEED + 1);
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const word = () => {
    let w = '';
    const n = 3 + Math.floor(rand() * 6);
    for (let i = 0; i < n; i++) w += letters[Math.floor(rand() * letters.length)];
    return w;
  };
  for (let i = 0; i < 200; i++) {
    const kw = word();
    const before = word();
    const after = word();
    // whole word, surrounded by spaces: must match
    const good = `${before} ${kw} ${after}`;
    assert.deepEqual(h.matchKeywords(good, [kw], [], true), [kw], 'whole word should match: ' + good);
    // embedded inside letters: must not match with whole words on
    const glued = `${before}${kw}${after}`;
    assert.deepEqual(h.matchKeywords(glued, [kw], [], true), [], 'embedded must not match: ' + glued);
  }
});
