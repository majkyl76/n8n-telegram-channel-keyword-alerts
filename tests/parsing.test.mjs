import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findHelpers, fixture, hasWorkflow } from './helpers.mjs';

function helpers() {
  if (!hasWorkflow()) {
    console.log('SKIP: build workflow.json first');
    return null;
  }
  return findHelpers();
}

test('AC6: one candidate per post block with the expected fields', () => {
  const h = helpers();
  if (!h) return;
  const items = fixture('durov.items.json');
  assert.equal(items.length, 20, 'fixture has 20 post blocks');
  const posts = items.map((i) => h.parsePost(i));
  assert.equal(posts.length, 20);
  for (const p of posts) {
    assert.equal(p.channel, 'durov');
    assert.equal(typeof p.postId, 'number');
    assert.ok(Number.isFinite(p.postId));
    assert.match(p.url, /^https:\/\/t\.me\/durov\/\d+$/);
    assert.match(p.isoDate, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(typeof p.text, 'string');
    assert.equal(typeof p.views, 'string');
  }
  assert.deepEqual(
    posts.map((p) => p.postId).slice(0, 3),
    [531, 532, 533],
  );
});

test('AC6: <br> becomes a newline and tags are stripped', () => {
  const h = helpers();
  if (!h) return;
  const out = h.htmlToText('Line one<br/>Line two<br>Line three <b>bold</b>');
  assert.equal(out, 'Line one\nLine two\nLine three bold');
  assert.ok(!out.includes('<'), 'no leftover <');
  assert.ok(!out.includes('>'), 'no leftover >');
});

test('AC6: entities are decoded (named and numeric)', () => {
  const h = helpers();
  if (!h) return;
  assert.equal(h.htmlToText('A &amp; B'), 'A & B');
  assert.equal(h.htmlToText('&lt;tag&gt;'), '<tag>');
  assert.equal(h.htmlToText('say &quot;hi&quot; it&#39;s fine'), 'say "hi" it\'s fine');
  assert.equal(h.htmlToText('a&nbsp;b'), 'a b');
  assert.equal(h.htmlToText('bang&#33; smile&#x1F600;'), 'bang! smile\u{1F600}');
});

test('AC6: emoji inner text is kept and whitespace is collapsed', () => {
  const h = helpers();
  if (!h) return;
  const emoji = '<tg-emoji emoji-id="1"><i class="emoji" style="x"><b>🩵</b></i></tg-emoji> Hello   world';
  assert.equal(h.htmlToText(emoji), '🩵 Hello world');
  // alt fallback for an empty emoji element
  assert.equal(h.htmlToText('<i class="emoji" alt="😀"></i> hi'), '😀 hi');
});

test('AC6: a real fixture post decodes to clean plain text', () => {
  const h = helpers();
  if (!h) return;
  const items = fixture('durov.items.json');
  const p538 = items.find((i) => i.postId === 'durov/538');
  const text = h.htmlToText(p538.text);
  assert.ok(!text.includes('<'), 'no leftover <');
  assert.ok(!text.includes('>'), 'no leftover >');
  assert.ok(text.includes('App Store'));
  assert.ok(text.includes('moderation tools')); // link text survives
});
