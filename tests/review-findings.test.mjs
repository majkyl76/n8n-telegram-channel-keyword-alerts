// Regression tests for the independent review findings (SPEC AC15..AC19).
// All behaviour is exercised through the shipped Code node's input and output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, loadWorkflow, runOne, alertFor, runFindNew, channelConfig, hasWorkflow } from './helpers.mjs';

function built() {
  if (!hasWorkflow()) {
    console.log('SKIP: build workflow.json first');
    return false;
  }
  return true;
}

test('AC15: message stays under 4096 with a 5000-char link and 300 matched keywords', () => {
  if (!built()) return;
  // AC16 derives the link from the channel and id, so a huge link only arises from
  // a huge channel name: use one to drive both the long-link and long-header path.
  const channel = 'a'.repeat(5000);
  const keywords = Array.from({ length: 300 }, (_, i) => 'kw' + String(i).padStart(3, '0'));
  const text = keywords.join(' '); // every keyword present -> 300 matches
  const a = alertFor({ channel, postId: 777, text, keywords });
  assert.ok(a, 'the post should alert');
  assert.equal(a.matchedKeywords.length, 300, 'all 300 keywords matched');
  assert.ok(a.text.length < 4096, 'message length ' + a.text.length);
  // The link line survives, with the <a ...>...</a> tag intact (not cut mid-tag).
  assert.match(a.text, /<a href="[^"]*">Open post<\/a>\s*$/);
});

test('AC15: a very long matched-keyword list alone is cut, message stays bounded', () => {
  if (!built()) return;
  const keywords = Array.from({ length: 300 }, (_, i) => 'longkw' + String(i).padStart(3, '0'));
  const a = alertFor({ channel: 'durov', postId: 10, text: keywords.join(' '), keywords });
  assert.ok(a.text.length < 4096, 'message length ' + a.text.length);
  assert.match(a.text, /Matched: /);
  assert.match(a.text, /<a href="https:\/\/t\.me\/durov\/10">Open post<\/a>\s*$/);
});

test('AC16: the post link is built from the channel and id, not the page href', () => {
  if (!built()) return;
  const a = alertFor({
    channel: 'durov',
    postId: 531,
    url: 'https://evil.example/pwn?x="><script>alert(1)</script>',
    text: 'match',
    keywords: ['match'],
  });
  assert.equal(a.url, 'https://t.me/durov/531', 'url derived from channel + id');
  assert.match(a.text, /<a href="https:\/\/t\.me\/durov\/531">Open post<\/a>/);
  assert.ok(!a.text.includes('evil.example'), 'hostile href must not reach the message');
});

test('AC17: no $testExpose or test hook ships in any Code node', () => {
  if (!built()) return;
  const wf = loadWorkflow();
  for (const node of wf.nodes.filter((n) => n.type === 'n8n-nodes-base.code')) {
    assert.doesNotMatch(node.parameters.jsCode, /testExpose/, node.name + ' ships a test hook');
    assert.doesNotMatch(node.parameters.jsCode, /Test seam/, node.name + ' ships a test seam');
  }
});

test('AC19: the parsing nodes between HTTP and Code continue on error', () => {
  if (!built()) return;
  const wf = loadWorkflow();
  for (const name of ['Split page into post blocks', 'Split out each post', 'Extract fields from each post']) {
    const node = wf.nodes.find((n) => n.name === name);
    assert.ok(node, 'node present: ' + name);
    assert.equal(node.onError, 'continueRegularOutput', name + ' must continue on error');
  }
});

test('AC19: an error/empty item is treated as a channel with no posts, not a crash', () => {
  if (!built()) return;
  // A dropped connection forwards an item with no post data; the Code node must
  // not throw and must treat the channel as having returned nothing.
  const out = runFindNew({
    inputItems: [{}],
    channelItems: [channelConfig('durov', { keywords: ['x'], baselineOnFirstRun: false })],
    staticData: {},
  }).out.map((i) => i.json);
  assert.equal(out.filter((j) => j.kind === 'alert').length, 0);
  assert.equal(out.filter((j) => j.kind === 'notice').length, 1, 'one no-posts notice');
});

test('AC19: one dead item does not stop a healthy channel in the same run', () => {
  if (!built()) return;
  const out = runFindNew({
    inputItems: [{}, { postId: 'durov/5', text: 'match here', isoDate: '2026-07-16T20:45:25+00:00', views: '1K' }],
    channelItems: [
      channelConfig('ghost', { keywords: ['match'], baselineOnFirstRun: false }),
      channelConfig('durov', { keywords: ['match'], baselineOnFirstRun: false }),
    ],
    staticData: {},
  }).out.map((i) => i.json);
  assert.equal(out.filter((j) => j.kind === 'notice').length, 1, 'ghost gets one notice');
  assert.equal(out.filter((j) => j.kind === 'alert').length, 1, 'durov still alerts');
});
