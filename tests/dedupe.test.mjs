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

test('AC8: running twice on the same page alerts once', () => {
  if (!built()) return;
  const channelItems = [channelConfig('examplechannel', { keywords: ['telegram'], baselineOnFirstRun: false })];
  const inputItems = [post('examplechannel', 1, 'telegram one'), post('examplechannel', 2, 'telegram two')];
  const state = {};
  const first = runFindNew({ inputItems, channelItems, staticData: state });
  assert.equal(alerts(first.out).length, 2);
  const second = runFindNew({ inputItems, channelItems, staticData: state });
  assert.equal(alerts(second.out).length, 0, 'no re-alert on the second run');
});

test('AC8: lastSeenPostId advances to the highest id even with no match', () => {
  if (!built()) return;
  const channelItems = [channelConfig('examplechannel', { keywords: ['nothingmatcheshere'], baselineOnFirstRun: false })];
  const inputItems = [post('examplechannel', 10, 'a'), post('examplechannel', 42, 'b'), post('examplechannel', 7, 'c')];
  const state = {};
  const r = runFindNew({ inputItems, channelItems, staticData: state });
  assert.equal(alerts(r.out).length, 0);
  assert.equal(state.lastSeen_examplechannel, 42);
});

test('AC8: posts at or below lastSeenPostId never alert', () => {
  if (!built()) return;
  const channelItems = [channelConfig('examplechannel', { keywords: ['telegram'], baselineOnFirstRun: false })];
  const state = { lastSeen_examplechannel: 2 };
  const inputItems = [post('examplechannel', 1, 'telegram'), post('examplechannel', 2, 'telegram'), post('examplechannel', 3, 'telegram')];
  const r = runFindNew({ inputItems, channelItems, staticData: state });
  const ids = alerts(r.out).map((i) => i.json.postId);
  assert.deepEqual(ids, [3]);
});

test('AC8: baselineOnFirstRun true records the highest id and sends no alerts', () => {
  if (!built()) return;
  const channelItems = [channelConfig('examplechannel', { keywords: ['telegram'], baselineOnFirstRun: true })];
  const inputItems = [post('examplechannel', 5, 'telegram'), post('examplechannel', 9, 'telegram')];
  const state = {};
  const r = runFindNew({ inputItems, channelItems, staticData: state });
  assert.equal(alerts(r.out).length, 0, 'no alerts on baseline run');
  assert.equal(state.lastSeen_examplechannel, 9);
  const baseline = r.out.find((i) => i.json.kind === 'baseline');
  assert.ok(baseline, 'run output records the baseline');
  assert.equal(baseline.json.send, false, 'baseline is not sent to Telegram');
});

test('AC8: baselineOnFirstRun false alerts on first-run matches', () => {
  if (!built()) return;
  const channelItems = [channelConfig('examplechannel', { keywords: ['telegram'], baselineOnFirstRun: false })];
  const inputItems = [post('examplechannel', 5, 'telegram'), post('examplechannel', 9, 'no match'), post('examplechannel', 11, 'telegram')];
  const r = runFindNew({ inputItems, channelItems, staticData: {} });
  assert.deepEqual(alerts(r.out).map((i) => i.json.postId), [5, 11]);
});

test('AC8: channels are independent and same post numbers never collide', () => {
  if (!built()) return;
  const channelItems = [
    channelConfig('aaa', { keywords: ['hit'], baselineOnFirstRun: false }),
    channelConfig('bbb', { keywords: ['hit'], baselineOnFirstRun: false }),
  ];
  const state = { lastSeen_aaa: 5 }; // aaa already seen up to 5, bbb brand new
  const inputItems = [
    post('aaa', 5, 'hit'), post('aaa', 6, 'hit'),
    post('bbb', 5, 'hit'), post('bbb', 6, 'hit'),
  ];
  const r = runFindNew({ inputItems, channelItems, staticData: state });
  const byChannel = {};
  for (const a of alerts(r.out)) (byChannel[a.json.channel] = byChannel[a.json.channel] || []).push(a.json.postId);
  assert.deepEqual(byChannel.aaa, [6]); // only > 5
  assert.deepEqual(byChannel.bbb, [5, 6]); // fresh channel, no baseline (false)
  assert.equal(state.lastSeen_aaa, 6);
  assert.equal(state.lastSeen_bbb, 6);
});
