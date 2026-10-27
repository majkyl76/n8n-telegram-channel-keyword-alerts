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
const samplePost = (over = {}) => ({
  channel: 'durov',
  postId: 531,
  url: 'https://t.me/durov/531',
  isoDate: '2026-07-16T20:45:25+00:00',
  text: 'Telegram now has a Rich Text Editor. It supports tables and more.',
  views: '5M',
  ...over,
});

test('AC11: message shape has bold @channel, UTC date, snippet, Matched and a link', () => {
  const h = helpers();
  if (!h) return;
  const text = h.buildAlertText('durov', samplePost(), ['n8n', 'editor'], false);
  assert.match(text, /^<b>@durov<\/b>/m);
  assert.match(text, /2026-07-16 20:45 UTC/);
  assert.match(text, /Matched: n8n, editor/);
  assert.match(text, /<a href="https:\/\/t\.me\/durov\/531">Open post<\/a>/);
});

test('AC11: the date is formatted as YYYY-MM-DD HH:mm UTC', () => {
  const h = helpers();
  if (!h) return;
  assert.equal(h.formatUtc('2026-01-02T03:04:05+00:00'), '2026-01-02 03:04 UTC');
  assert.equal(h.formatUtc('2026-12-31T23:59:00+02:00'), '2026-12-31 21:59 UTC');
});

test('AC11: all dynamic text is HTML-escaped', () => {
  const h = helpers();
  if (!h) return;
  const text = h.buildAlertText('a&b', samplePost({ text: 'x < y & z > w' }), ['c<d'], false);
  assert.match(text, /<b>@a&amp;b<\/b>/);
  assert.match(text, /x &lt; y &amp; z &gt; w/);
  assert.match(text, /Matched: c&lt;d/);
  // No raw unescaped special chars leaked into the snippet body.
  assert.ok(!/x < y/.test(text));
});

test('AC11: snippet is at most 500 chars, cut at a word boundary with an ellipsis', () => {
  const h = helpers();
  if (!h) return;
  const long = ('word '.repeat(300)).trim(); // 1500 chars
  const snip = h.cutSnippet(long, 500);
  assert.ok(snip.length <= 500, 'snippet length ' + snip.length);
  assert.ok(snip.endsWith('…'));
  assert.ok(!/\s\S*…$/.test(' ' + snip) || snip.slice(0, -1).endsWith('word'), 'cut at a word boundary');
});

test('AC11: the gap note is appended when possibleGap is set', () => {
  const h = helpers();
  if (!h) return;
  const text = h.buildAlertText('durov', samplePost(), ['n8n'], true);
  assert.match(text, /some posts may have been missed/i);
});

test('AC11: message stays under 4096 characters for hostile input', () => {
  const h = helpers();
  if (!h) return;
  const hostile = '&<>'.repeat(5000);
  const text = h.buildAlertText('durov', samplePost({ text: hostile }), ['x'], true);
  assert.ok(text.length < 4096, 'length ' + text.length);
});
