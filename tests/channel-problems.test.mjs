import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runFindNew, channelConfig, hasWorkflow, fixture } from './helpers.mjs';

function built() {
  if (!hasWorkflow()) {
    console.log('SKIP: build workflow.json first');
    return false;
  }
  return true;
}
function post(channel, id, text) {
  return {
    postId: `${channel}/${id}`, text,
    isoDate: '2026-07-16T20:45:25+00:00',
    url: `https://t.me/${channel}/${id}`, views: '1K',
  };
}
const notices = (out) => out.filter((i) => i.json.kind === 'notice');

test('AC10: a channel with no posts produces one notice, then stays quiet', () => {
  if (!built()) return;
  const channelItems = [channelConfig('ghost', { keywords: ['telegram'] })];
  const state = {};
  const first = runFindNew({ inputItems: [], channelItems, staticData: state });
  const n = notices(first.out);
  assert.equal(n.length, 1);
  assert.match(n[0].json.text, /Channel @ghost returned no posts/);
  assert.match(n[0].json.text, /public web preview/);
  assert.equal(n[0].json.send, true);
  // Second run, still no posts: no further notice.
  const second = runFindNew({ inputItems: [], channelItems, staticData: state });
  assert.equal(notices(second.out).length, 0, 'no repeat notice while still broken');
});

test('AC10: recovery sends no message and clears the flag', () => {
  if (!built()) return;
  const channelItems = [channelConfig('durov', { keywords: ['telegram'], baselineOnFirstRun: false })];
  const state = { problem_durov: true };
  const r = runFindNew({ inputItems: [post('durov', 1, 'telegram')], channelItems, staticData: state });
  assert.equal(notices(r.out).length, 0, 'no message on recovery');
  assert.ok(!('problem_durov' in state), 'problem flag cleared');
});

test('AC10: none.html (zero post blocks) is treated as a channel problem', () => {
  if (!built()) return;
  const items = fixture('none.items.json');
  assert.equal(items.length, 0, 'none.html yields no post blocks');
  const channelItems = [channelConfig('none', { keywords: ['telegram'] })];
  const r = runFindNew({ inputItems: items, channelItems, staticData: {} });
  assert.equal(notices(r.out).length, 1);
});

test('AC10: one bad channel does not stop the others', () => {
  if (!built()) return;
  const channelItems = [
    channelConfig('ghost', { keywords: ['telegram'], baselineOnFirstRun: false }),
    channelConfig('durov', { keywords: ['telegram'], baselineOnFirstRun: false }),
  ];
  const inputItems = [post('durov', 1, 'telegram here')];
  const r = runFindNew({ inputItems, channelItems, staticData: {} });
  assert.equal(notices(r.out).length, 1, 'ghost gets a notice');
  assert.equal(r.out.filter((i) => i.json.kind === 'alert').length, 1, 'durov still alerts');
});
