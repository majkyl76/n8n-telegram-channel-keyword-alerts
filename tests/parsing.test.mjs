import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runFindNew, channelConfig, alertFor, fixture, hasWorkflow } from './helpers.mjs';

function built() {
  if (!hasWorkflow()) {
    console.log('SKIP: build workflow.json first');
    return false;
  }
  return true;
}

// Parsing is observed through the Code node output. An alert item carries the
// parsed fields (channel, numeric postId, derived url, isoDate, views, snippet).
// The plain-text conversion is observed through the unescaped `snippet` field.
const snippetOf = (text, keywords = ['match']) => alertFor({ text, keywords }).snippet;

test('AC6: one candidate per post block with the expected fields', () => {
  if (!built()) return;
  const items = fixture('durov.items.json');
  assert.equal(items.length, 20, 'fixture has 20 post blocks');

  // Every post in the fixture mentions "Telegram": matching them with no cap and
  // no baseline makes one alert per candidate, in chronological (postId) order.
  const out = runFindNew({
    inputItems: items,
    channelItems: [channelConfig('durov', { keywords: ['Telegram'], baselineOnFirstRun: false, maxAlertsPerRun: 100 })],
    staticData: {},
  }).out.map((i) => i.json);
  const alerts = out.filter((j) => j.kind === 'alert');
  assert.deepEqual(alerts.map((a) => a.postId).slice(0, 3), [531, 532, 533]);
  for (const a of alerts) {
    assert.equal(a.channel, 'durov');
    assert.equal(typeof a.postId, 'number');
    assert.ok(Number.isFinite(a.postId));
    assert.match(a.url, /^https:\/\/t\.me\/durov\/\d+$/);
    assert.match(a.isoDate, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(typeof a.snippet, 'string');
    assert.equal(typeof a.views, 'string');
  }

  // A baseline run reports how many candidates were parsed from the 20 blocks.
  const baseline = runFindNew({
    inputItems: items,
    channelItems: [channelConfig('durov', { keywords: ['Telegram'], baselineOnFirstRun: true })],
    staticData: {},
  }).out.map((i) => i.json).find((j) => j.kind === 'baseline');
  assert.match(baseline.text, /Recorded the latest of 20 posts/);
});

test('AC6: <br> becomes a separator and tags are stripped', () => {
  if (!built()) return;
  // The snippet collapses whitespace to single spaces, so a <br> newline shows as
  // a space: words are separated (not glued) and no tag markup survives.
  const snip = snippetOf('Line one<br/>Line two<br>Line three <b>bold</b> match');
  assert.equal(snip, 'Line one Line two Line three bold match');
  assert.ok(!snip.includes('<'), 'no leftover <');
  assert.ok(!snip.includes('>'), 'no leftover >');
});

test('AC6: entities are decoded (named and numeric)', () => {
  if (!built()) return;
  assert.equal(snippetOf('A &amp; B match'), 'A & B match');
  assert.equal(snippetOf('&lt;tag&gt; match'), '<tag> match');
  assert.equal(snippetOf('say &quot;hi&quot; it&#39;s fine match'), 'say "hi" it\'s fine match');
  assert.equal(snippetOf('a&nbsp;b match'), 'a b match');
  assert.equal(snippetOf('bang&#33; smile&#x1F600; match'), 'bang! smile\u{1F600} match');
});

test('AC6: emoji inner text is kept and whitespace is collapsed', () => {
  if (!built()) return;
  const emoji = '<tg-emoji emoji-id="1"><i class="emoji" style="x"><b>🩵</b></i></tg-emoji> Hello   world match';
  assert.equal(snippetOf(emoji), '🩵 Hello world match');
  // alt fallback for an empty emoji element
  assert.equal(snippetOf('<i class="emoji" alt="😀"></i> hi match'), '😀 hi match');
});

test('AC6: a real fixture post decodes to clean plain text', () => {
  if (!built()) return;
  const items = fixture('durov.items.json');
  const p538 = items.find((i) => i.postId === 'durov/538');
  // "moderation" matches this post, so it alerts and we can read its plain text.
  const out = runFindNew({
    inputItems: [p538],
    channelItems: [channelConfig('durov', { keywords: ['moderation'], baselineOnFirstRun: false })],
    staticData: {},
  }).out.map((i) => i.json);
  const a = out.find((j) => j.kind === 'alert');
  assert.ok(a, 'post 538 should alert on "moderation"');
  assert.ok(!a.snippet.includes('<'), 'no leftover <');
  assert.ok(!a.snippet.includes('>'), 'no leftover >');
  assert.ok(a.snippet.includes('App Store'));
  assert.ok(a.snippet.includes('moderation tools')); // link text survives
});
