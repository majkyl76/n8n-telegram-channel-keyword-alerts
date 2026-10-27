// Assemble workflow.json from node definitions plus the Code node sources in src/.
// The jsCode shipped in workflow.json is exactly the content of the src/ files.
// `npm run build` writes the file; a test fails if the committed file is stale.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readSrc = (name) => readFileSync(join(root, 'src', name), 'utf8');

const checkSettingsCode = readSrc('check-settings.js');
const findNewPostsCode = readSrc('find-new-posts.js');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// Names are the single source of truth for connections.
const N = {
  schedule: 'Run every 15 minutes',
  manual: 'Run manually',
  config: 'Set up your channels and keywords',
  check: 'Check settings and list channels',
  fetch: 'Fetch channel preview page',
  split: 'Split page into post blocks',
  splitOut: 'Split out each post',
  extract: 'Extract fields from each post',
  find: 'Find new posts that match your keywords',
  gate: 'Anything to send?',
  send: 'Send alert to Telegram',
};

const nodes = [
  {
    id: 'trigger-schedule',
    name: N.schedule,
    type: 'n8n-nodes-base.scheduleTrigger',
    typeVersion: 1.2,
    position: [0, 0],
    parameters: {
      rule: { interval: [{ field: 'minutes', minutesInterval: 15 }] },
    },
  },
  {
    id: 'trigger-manual',
    name: N.manual,
    type: 'n8n-nodes-base.manualTrigger',
    typeVersion: 1,
    position: [0, 220],
    parameters: {},
  },
  {
    id: 'node-config',
    name: N.config,
    type: 'n8n-nodes-base.set',
    typeVersion: 3.5,
    position: [260, 110],
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'f-channels', name: 'channels', type: 'string', value: 'durov\ntelegram' },
          { id: 'f-keywords', name: 'keywords', type: 'string', value: 'n8n\nkubernetes\nremote' },
          { id: 'f-exclude', name: 'excludeKeywords', type: 'string', value: '' },
          { id: 'f-whole', name: 'matchWholeWords', type: 'boolean', value: true },
          { id: 'f-chat', name: 'telegramChatId', type: 'string', value: 'YOUR_TELEGRAM_CHAT_ID' },
          { id: 'f-max', name: 'maxAlertsPerRun', type: 'number', value: 10 },
          { id: 'f-baseline', name: 'baselineOnFirstRun', type: 'boolean', value: true },
          { id: 'f-base', name: 'previewBaseUrl', type: 'string', value: 'https://t.me/s/' },
        ],
      },
      options: {},
    },
  },
  {
    id: 'node-check',
    name: N.check,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [520, 110],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: checkSettingsCode },
  },
  {
    id: 'node-fetch',
    name: N.fetch,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [780, 110],
    parameters: {
      url: '={{ $json.url }}',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'User-Agent', value: USER_AGENT }] },
      options: {
        batching: { batch: { batchSize: 1, batchInterval: 1000 } },
        response: { response: { fullResponse: true, neverError: true } },
        timeout: 20000,
      },
    },
    onError: 'continueRegularOutput',
    retryOnFail: true,
    maxTries: 2,
  },
  {
    id: 'node-split',
    name: N.split,
    type: 'n8n-nodes-base.html',
    typeVersion: 1.2,
    position: [1040, 110],
    parameters: {
      operation: 'extractHtmlContent',
      sourceData: 'json',
      dataPropertyName: 'data',
      extractionValues: {
        values: [
          {
            key: 'posts',
            cssSelector: '.tgme_widget_message_wrap',
            returnValue: 'html',
            returnArray: true,
          },
        ],
      },
      options: {},
    },
    onError: 'continueRegularOutput',
  },
  {
    id: 'node-splitout',
    name: N.splitOut,
    type: 'n8n-nodes-base.splitOut',
    typeVersion: 1.1,
    position: [1260, 110],
    parameters: { fieldToSplitOut: 'posts', options: {} },
    onError: 'continueRegularOutput',
  },
  {
    id: 'node-extract',
    name: N.extract,
    type: 'n8n-nodes-base.html',
    typeVersion: 1.2,
    position: [1480, 110],
    parameters: {
      operation: 'extractHtmlContent',
      sourceData: 'json',
      dataPropertyName: 'posts',
      extractionValues: {
        values: [
          { key: 'postId', cssSelector: '.tgme_widget_message', returnValue: 'attribute', attribute: 'data-post' },
          { key: 'text', cssSelector: '.tgme_widget_message_text', returnValue: 'html' },
          { key: 'isoDate', cssSelector: 'a.tgme_widget_message_date time', returnValue: 'attribute', attribute: 'datetime' },
          { key: 'url', cssSelector: 'a.tgme_widget_message_date', returnValue: 'attribute', attribute: 'href' },
          { key: 'views', cssSelector: '.tgme_widget_message_views', returnValue: 'text' },
        ],
      },
      options: {},
    },
    onError: 'continueRegularOutput',
  },
  {
    id: 'node-find',
    name: N.find,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1740, 110],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: findNewPostsCode },
  },
  {
    id: 'node-gate',
    name: N.gate,
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: [2000, 110],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [
          {
            id: 'send-true',
            leftValue: '={{ $json.send }}',
            rightValue: '',
            operator: { type: 'boolean', operation: 'true', singleValue: true },
          },
        ],
        combinator: 'and',
      },
      options: {},
    },
  },
  {
    id: 'node-send',
    name: N.send,
    type: 'n8n-nodes-base.telegram',
    typeVersion: 1.2,
    position: [2260, 110],
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: '={{ $json.chatId }}',
      text: '={{ $json.text }}',
      additionalFields: { parse_mode: 'HTML', disable_web_page_preview: true, appendAttribution: false },
    },
    credentials: { telegramApi: { name: 'Telegram account' } },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
  },
];

// --- sticky notes -----------------------------------------------------------
// Sticky Note colour numbers (n8n-nodes-base.stickyNote): 1 = yellow, 3 = red,
// 7 = neutral/white. This template uses one yellow overview sticky, three
// white section stickies, and one red warning sticky on the Telegram node.
const mainSticky = [
  '## Telegram public channel keyword alerts',
  '',
  'Watches public Telegram channels and messages you on Telegram when a post matches your keywords.',
  '',
  '### How it works',
  'Every 15 minutes it reads the public web preview at t.me/s/<channel> for each channel you list and parses the latest posts (about 20). It keeps the ones newer than the last post it saw, checks them against your keywords and sends one message per match. The last post per channel is stored in workflow static data, so you are not alerted twice.',
  '',
  '### Setup',
  '1. Connect a Telegram credential named "Telegram account" (the token comes from @BotFather).',
  '2. Open "Set up your channels and keywords" and edit: channels (one per line), keywords (one per line), optional excludeKeywords, matchWholeWords, telegramChatId, maxAlertsPerRun, baselineOnFirstRun.',
  '3. Set telegramChatId: send a message to the account you made with @BotFather, then read the chat id from the Telegram API.',
  '4. Test with "Run manually". Manual runs do not save state, so a manual test alerts again each time. State is only saved when the workflow is active and started by the schedule.',
  '',
  '### Customization',
  'You can replace the last node with Slack, email or something else. If a busy channel scrolls posts off the preview between runs, shorten the schedule.',
  '',
  'Limits: only public channels with a web preview work, the preview shows roughly the latest 20 posts, and Telegram may change the HTML. It does not hammer Telegram: one request per channel with a one second gap.',
].join('\n');

const stickies = [
  { id: 'sticky-main', name: 'Overview', position: [-520, -260], width: 460, height: 900, color: 1, content: mainSticky },
  {
    id: 'sticky-a',
    name: 'Section trigger',
    position: [-40, -120],
    width: 760,
    height: 360,
    color: 7,
    content: [
      '### 1. Trigger and settings',
      'The schedule or a manual run starts the flow. Edit your channels and keywords in the Set node. The Code node checks the settings and lists one channel per item.',
    ].join('\n'),
  },
  {
    id: 'sticky-b',
    name: 'Section fetch',
    position: [740, -120],
    width: 820,
    height: 360,
    color: 7,
    content: [
      '### 2. Fetch and parse',
      'Fetch each channel preview page, one request per channel, one second apart. The HTML nodes split the page into posts and pull out the id, text, date, link and views.',
    ].join('\n'),
  },
  {
    id: 'sticky-c',
    name: 'Section alert',
    position: [1580, -120],
    width: 840,
    height: 360,
    color: 7,
    content: [
      '### 3. Match and alert',
      'Find posts newer than the last seen, keep keyword matches, cap per run and update the saved state. Send one Telegram message per match.',
    ].join('\n'),
  },
  {
    id: 'sticky-warn',
    name: 'Warning telegram',
    position: [2200, -10],
    width: 260,
    height: 320,
    color: 3,
    content: [
      '### Set this first',
      'Add your Telegram chat id and connect the Telegram credential before you activate. Without them the Telegram node cannot send.',
    ].join('\n'),
  },
];

for (const s of stickies) {
  nodes.push({
    id: s.id,
    name: s.name,
    type: 'n8n-nodes-base.stickyNote',
    typeVersion: 1,
    position: s.position,
    parameters: { content: s.content, height: s.height, width: s.width, color: s.color },
  });
}

// --- connections ------------------------------------------------------------
const one = (node) => ({ main: [[{ node, type: 'main', index: 0 }]] });
const connections = {
  [N.schedule]: one(N.config),
  [N.manual]: one(N.config),
  [N.config]: one(N.check),
  [N.check]: one(N.fetch),
  [N.fetch]: one(N.split),
  [N.split]: one(N.splitOut),
  [N.splitOut]: one(N.extract),
  [N.extract]: one(N.find),
  [N.find]: one(N.gate),
  // If: true output -> send, false output -> nothing.
  [N.gate]: { main: [[{ node: N.send, type: 'main', index: 0 }], []] },
};

export function buildWorkflow() {
  return {
    name: 'Send Telegram alerts for keyword matches in public channels',
    nodes,
    connections,
    active: false,
    settings: { executionOrder: 'v1' },
  };
}

export function serialize() {
  return JSON.stringify(buildWorkflow(), null, 2) + '\n';
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  writeFileSync(join(root, 'workflow.json'), serialize());
  console.log('Wrote workflow.json');
}
