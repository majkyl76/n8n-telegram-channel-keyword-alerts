import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runFindNew, channelConfig, hasWorkflow } from './helpers.mjs';

function built() {
  if (!hasWorkflow()) {
    console.log('SKIP: build workflow.json first');
    return false;
  }
  return true;
}
function post(channel, id, text) {
  return {
    postId: `${channel}/${id}`,
    text,
    isoDate: '2026-07-16T20:45:25+00:00',
    url: `https://t.me/${channel}/${id}`,
    views: '1K',
  };
}
const alerts = (out) => out.filter((i) => i.json.kind === 'alert');

test('a gap at the bottom of the page sets possibleGap and notes it', () => {
  if (!built()) return;
  const channelItems = [channelConfig('examplechannel', { keywords: ['telegram'], baselineOnFirstRun: false })];
  const state = { lastSeen_examplechannel: 100 };
  // lowest id 105 > lastSeen+1 (101) -> gap
  const inputItems = [post('examplechannel', 105, 'telegram'), post('examplechannel', 106, 'telegram')];
  const r = runFindNew({ inputItems, channelItems, staticData: state });
  const a = alerts(r.out);
  assert.ok(a.length > 0);
  assert.equal(a[0].json.possibleGap, true);
  assert.match(a[0].json.text, /some posts may have been missed/i);
  assert.match(a[0].json.text, /more often/i);
});

test('no gap when the page continues from the last seen post', () => {
  if (!built()) return;
  const channelItems = [channelConfig('examplechannel', { keywords: ['telegram'], baselineOnFirstRun: false })];
  const state = { lastSeen_examplechannel: 100 };
  const inputItems = [post('examplechannel', 101, 'telegram'), post('examplechannel', 102, 'telegram')];
  const r = runFindNew({ inputItems, channelItems, staticData: state });
  for (const a of alerts(r.out)) {
    assert.equal(a.json.possibleGap, false);
    assert.doesNotMatch(a.json.text, /may have been missed/i);
  }
});

test('cap sends only the newest N matches plus a summary, and advances state', () => {
  if (!built()) return;
  const channelItems = [channelConfig('examplechannel', { keywords: ['telegram'], baselineOnFirstRun: false, maxAlertsPerRun: 3 })];
  const inputItems = [];
  for (let id = 1; id <= 7; id++) inputItems.push(post('examplechannel', id, 'telegram ' + id));
  const state = {};
  const r = runFindNew({ inputItems, channelItems, staticData: state });
  const a = alerts(r.out);
  assert.equal(a.length, 3, 'capped at maxAlertsPerRun');
  assert.deepEqual(a.map((i) => i.json.postId), [5, 6, 7], 'newest 3 in chronological order');
  const summary = r.out.find((i) => i.json.kind === 'summary');
  assert.ok(summary, 'a summary message is sent');
  assert.match(summary.json.text, /\+4 more matching posts not shown/);
  assert.equal(state.lastSeen_examplechannel, 7, 'state advances past all matches');
});
