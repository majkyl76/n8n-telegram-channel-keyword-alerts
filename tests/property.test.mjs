import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runOne, alertFor, hasWorkflow } from './helpers.mjs';

function built() {
  if (!hasWorkflow()) {
    console.log('SKIP: build workflow.json first');
    return false;
  }
  return true;
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

test('property: 400 random posts always build a message under 4096 chars', () => {
  if (!built()) return;
  const rand = rng(SEED);
  for (let i = 0; i < 400; i++) {
    const len = Math.floor(rand() * 2000);
    let text = '';
    for (let j = 0; j < len; j++) text += ALPHABET[Math.floor(rand() * ALPHABET.length)];
    // Guarantee a match so the post alerts: append a sentinel keyword.
    text += ' propertymatch';
    const channel = 'ch' + Math.floor(rand() * 1e6);
    const gap = rand() < 0.5;
    const a = alertFor({
      channel,
      postId: 1000 + i,
      text,
      keywords: ['propertymatch'],
      // A prior lastSeen far below the id makes the run flag a possible gap half the time.
      staticData: gap ? { ['lastSeen_' + channel.toLowerCase()]: 1 } : {},
    });
    assert.ok(a, 'post ' + i + ' should alert');
    const msg = a.text;
    assert.ok(msg.length < 4096, `message ${i} length ${msg.length}`);
    // Structure is intact: exactly one bold header and one link.
    assert.equal((msg.match(/<b>/g) || []).length, 1);
    assert.equal((msg.match(/<a href=/g) || []).length, 1);
    assert.ok(/<\/a>/.test(msg), 'link tag closed');
  }
});

test('property: a whole word always matches, an embedded one never does', () => {
  if (!built()) return;
  const rand = rng(SEED + 1);
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
  // Keywords are also fuzzed over every character escapeRegex touches (review F1:
  // a hyphen used to crash the regex compile). before/after stay plain letters, so
  // gluing them straight onto the keyword always lands on a real word character and
  // the "embedded must not match" assertion below stays meaningful regardless of
  // what the keyword itself is made of.
  const kwAlphabet = letters.concat(['-', '.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\', '/']);
  const word = (alphabet) => {
    let w = '';
    const n = 3 + Math.floor(rand() * 6);
    for (let i = 0; i < n; i++) w += alphabet[Math.floor(rand() * alphabet.length)];
    return w;
  };
  for (let i = 0; i < 200; i++) {
    const kw = word(kwAlphabet);
    const before = word(letters);
    const after = word(letters);
    // whole word, surrounded by spaces: must match (one alert with the keyword).
    const good = alertFor({ text: `${before} ${kw} ${after}`, keywords: [kw] });
    assert.ok(good, 'whole word should match: ' + kw);
    assert.deepEqual(good.matchedKeywords, [kw]);
    // embedded inside letters: must not match with whole words on (no alert).
    const glued = runOne({ text: `${before}${kw}${after}`, keywords: [kw] }).filter((j) => j.kind === 'alert');
    assert.equal(glued.length, 0, 'embedded must not match: ' + `${before}${kw}${after}`);
  }
});
