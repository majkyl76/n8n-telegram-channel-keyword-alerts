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

test('AC11: message shape has bold @channel, UTC date, snippet, Matched and a link', () => {
  if (!built()) return;
  const a = alertFor({
    channel: 'examplechannel',
    postId: 531,
    isoDate: '2026-07-16T20:45:25+00:00',
    text: 'n8n Rich Text Editor is here',
    keywords: ['n8n', 'editor'],
  });
  assert.match(a.text, /^<b>@examplechannel<\/b>/m);
  assert.match(a.text, /2026-07-16 20:45 UTC/);
  assert.match(a.text, /Matched: n8n, editor/);
  assert.match(a.text, /<a href="https:\/\/t\.me\/examplechannel\/531">Open post<\/a>/);
});

test('AC11: the date is formatted as YYYY-MM-DD HH:mm UTC', () => {
  if (!built()) return;
  assert.match(alertFor({ text: 'match', keywords: ['match'], isoDate: '2026-01-02T03:04:05+00:00' }).text, /2026-01-02 03:04 UTC/);
  // A non-UTC offset is converted to UTC.
  assert.match(alertFor({ text: 'match', keywords: ['match'], isoDate: '2026-12-31T23:59:00+02:00' }).text, /2026-12-31 21:59 UTC/);
});

test('AC11: all dynamic text is HTML-escaped', () => {
  if (!built()) return;
  // Channel, snippet and matched keywords all carry special characters.
  const a = alertFor({ channel: 'a&b', text: 'alpha &lt;tag&gt; &amp; c&lt;d omega', keywords: ['c<d'] });
  assert.match(a.text, /<b>@a&amp;b<\/b>/);
  assert.ok(a.text.includes('&lt;tag&gt;') && a.text.includes('&amp;'), a.text);
  assert.match(a.text, /Matched: c&lt;d/);
  // Decoded specials are re-escaped, never left raw in the body.
  assert.ok(!a.text.includes('<tag>'), 'decoded tag leaked unescaped');
});

test('AC11: snippet is at most 500 chars, cut at a word boundary with an ellipsis', () => {
  if (!built()) return;
  const long = ('word '.repeat(300)).trim() + ' snippetmatch'; // >1500 chars
  const a = alertFor({ text: long, keywords: ['snippetmatch'] });
  assert.ok(a.snippet.length <= 500, 'snippet length ' + a.snippet.length);
  assert.ok(a.snippet.endsWith('…'));
  assert.ok(a.snippet.slice(0, -1).trim().endsWith('word'), 'cut at a word boundary');
});

test('AC11: the gap note is appended when possibleGap is set', () => {
  if (!built()) return;
  // A lastSeen far below the post id makes the run flag a possible gap.
  const a = alertFor({ channel: 'examplechannel', postId: 531, text: 'match', keywords: ['match'], staticData: { lastSeen_examplechannel: 1 } });
  assert.equal(a.possibleGap, true);
  assert.match(a.text, /some posts may have been missed/i);
});

test('AC11: message stays under 4096 characters for hostile input', () => {
  if (!built()) return;
  const hostile = '&<>'.repeat(5000) + ' hostilematch';
  const a = alertFor({ channel: 'examplechannel', postId: 531, text: hostile, keywords: ['hostilematch'], staticData: { lastSeen_examplechannel: 1 } });
  assert.ok(a.text.length < 4096, 'length ' + a.text.length);
});
