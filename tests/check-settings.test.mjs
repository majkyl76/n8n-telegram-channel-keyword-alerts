import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCheckSettings, hasWorkflow } from './helpers.mjs';

const base = {
  channels: 'examplechannel',
  keywords: 'n8n',
  excludeKeywords: '',
  matchWholeWords: true,
  telegramChatId: '12345',
  maxAlertsPerRun: 10,
  baselineOnFirstRun: true,
  previewBaseUrl: 'https://t.me/s/',
};
const cfg = (o) => ({ ...base, ...o });
function skipUnbuilt() {
  if (!hasWorkflow()) {
    console.log('SKIP: build workflow.json first');
    return true;
  }
  return false;
}

test('throws when chat id is still the placeholder', () => {
  if (skipUnbuilt()) return;
  assert.throws(() => runCheckSettings(cfg({ telegramChatId: 'YOUR_TELEGRAM_CHAT_ID' })), /YOUR_TELEGRAM_CHAT_ID/);
});

test('throws when chat id is empty', () => {
  if (skipUnbuilt()) return;
  assert.throws(() => runCheckSettings(cfg({ telegramChatId: '' })), /telegramChatId/);
});

test('throws when there are no keywords', () => {
  if (skipUnbuilt()) return;
  assert.throws(() => runCheckSettings(cfg({ keywords: '  \n# comment' })), /keyword/i);
});

test('throws when there are no channels', () => {
  if (skipUnbuilt()) return;
  assert.throws(() => runCheckSettings(cfg({ channels: '\n# just a comment' })), /channel/i);
});

test('throws on an invalid channel username, naming the offending value', () => {
  if (skipUnbuilt()) return;
  assert.throws(() => runCheckSettings(cfg({ channels: 'examplechannel\n123bad' })), /123bad/);
  assert.throws(() => runCheckSettings(cfg({ channels: 'ab' })), /ab/); // too short
});

test('throws when maxAlertsPerRun is not a positive integer', () => {
  if (skipUnbuilt()) return;
  assert.throws(() => runCheckSettings(cfg({ maxAlertsPerRun: 0 })), /maxAlertsPerRun/);
  assert.throws(() => runCheckSettings(cfg({ maxAlertsPerRun: 2.5 })), /maxAlertsPerRun/);
  assert.throws(() => runCheckSettings(cfg({ maxAlertsPerRun: -3 })), /maxAlertsPerRun/);
});

test('normalises every accepted channel format', () => {
  if (skipUnbuilt()) return;
  const items = runCheckSettings(
    cfg({
      channels: [
        'examplechannel',
        '@telegram',
        't.me/n8nteam',
        'https://t.me/examplechannel_test',
        'https://t.me/s/some_channel',
        'https://t.me/examplechannel/531?embed=1',
        'https://t.me/trailing/',
      ].join('\n'),
    }),
  );
  const slugs = items.map((i) => i.json.channel);
  assert.deepEqual(slugs, ['examplechannel', 'telegram', 'n8nteam', 'examplechannel_test', 'some_channel', 'trailing']);
  // /531 post suffix and ?query stripped, duplicate examplechannel removed.
});

test('de-duplicates channels case-insensitively, keeping the first', () => {
  if (skipUnbuilt()) return;
  const items = runCheckSettings(cfg({ channels: 'Examplechannel\nexamplechannel\nEXAMPLECHANNEL\ntelegram' }));
  assert.deepEqual(items.map((i) => i.json.channel), ['Examplechannel', 'telegram']);
});

test('emits one item per channel carrying the config and a fetch url', () => {
  if (skipUnbuilt()) return;
  const items = runCheckSettings(cfg({ channels: 'examplechannel\ntelegram', keywords: 'n8n\nremote' }));
  assert.equal(items.length, 2);
  assert.equal(items[0].json.url, 'https://t.me/s/examplechannel');
  assert.deepEqual(items[0].json.keywords, ['n8n', 'remote']);
  assert.equal(items[0].json.chatId, '12345');
  assert.equal(items[0].json.matchWholeWords, true);
});

test('ignores blank lines and # comments in channels and keywords', () => {
  if (skipUnbuilt()) return;
  const items = runCheckSettings(cfg({ channels: '# channels\n\nexamplechannel\n  \ntelegram', keywords: '# kw\nn8n\n\nremote' }));
  assert.deepEqual(items.map((i) => i.json.channel), ['examplechannel', 'telegram']);
  assert.deepEqual(items[0].json.keywords, ['n8n', 'remote']);
});
