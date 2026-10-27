// Shared test helpers. Tests load workflow.json and run the Code nodes' shipped
// jsCode in node:vm with stubbed n8n globals, so they exercise the artefact.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const N8N_NODES_BASE =
  '/workspace/n8n-local/node_modules/n8n-nodes-base/dist/nodes';

export function hasWorkflow() {
  return existsSync(join(root, 'workflow.json'));
}

export function loadWorkflow() {
  return JSON.parse(readFileSync(join(root, 'workflow.json'), 'utf8'));
}

export function nodeByName(wf, name) {
  const n = wf.nodes.find((x) => x.name === name);
  if (!n) throw new Error('No node named ' + name);
  return n;
}

export function codeByName(wf, name) {
  return nodeByName(wf, name).parameters.jsCode;
}

export function fixture(name) {
  return JSON.parse(readFileSync(join(root, 'fixtures', name), 'utf8'));
}

// Run a Code node body, allowing its top-level `return`. Using `new Function`
// (not node:vm) keeps returned objects in this realm, so assert.deepEqual works.
// n8n globals are injected as parameters; any other global name (e.g. $testExpose
// when not provided) is simply undeclared, and `typeof` on it stays safe.
function runBody(jsCode, sandbox) {
  const names = Object.keys(sandbox);
  const fn = new Function(...names, 'console', jsCode);
  return fn(...names.map((n) => sandbox[n]), console);
}

// Run "Check settings and list channels" with a config object as the single input item.
export function runCheckSettings(config) {
  const wf = loadWorkflow();
  const jsCode = codeByName(wf, 'Check settings and list channels');
  const $input = {
    first: () => ({ json: config }),
    all: () => [{ json: config }],
  };
  return runBody(jsCode, { $input });
}

// Pull the pure helpers out of "Find new posts..." via its documented test seam.
export function findHelpers() {
  const wf = loadWorkflow();
  const jsCode = codeByName(wf, 'Find new posts that match your keywords');
  return runBody(jsCode, {
    $testExpose: true,
    $input: { all: () => [] },
    $: () => ({ all: () => [], first: () => ({ json: {} }) }),
    $getWorkflowStaticData: () => ({}),
  });
}

// Run "Find new posts..." main(). inputItems: array of post json objects.
// channelItems: array of channel config json objects. staticData: mutated in place.
export function runFindNew({ inputItems, channelItems, staticData }) {
  const wf = loadWorkflow();
  const jsCode = codeByName(wf, 'Find new posts that match your keywords');
  const state = staticData || {};
  const out = runBody(jsCode, {
    $input: { all: () => inputItems.map((j) => ({ json: j })) },
    $: (name) => {
      if (name !== 'Check settings and list channels') {
        throw new Error('Unexpected node reference: ' + name);
      }
      return {
        all: () => channelItems.map((j) => ({ json: j })),
        first: () => ({ json: channelItems[0] }),
      };
    },
    $getWorkflowStaticData: () => state,
  });
  return { out, staticData: state };
}

// Build a channel config item as "Check settings and list channels" would emit it.
export function channelConfig(channel, overrides = {}) {
  return {
    channel,
    url: 'https://t.me/s/' + channel,
    keywords: ['n8n'],
    excludeKeywords: [],
    matchWholeWords: true,
    maxAlertsPerRun: 10,
    baselineOnFirstRun: true,
    previewBaseUrl: 'https://t.me/s/',
    chatId: '12345',
    ...overrides,
  };
}

// Golden config used by both the golden test and the samples generator.
export const GOLDEN_CONFIG = {
  keywords: ['AI', 'Telegram'],
  excludeKeywords: [],
  matchWholeWords: true,
  maxAlertsPerRun: 5,
  baselineOnFirstRun: false,
  chatId: '12345',
};

export function runGolden() {
  const inputItems = fixture('durov.items.json');
  const channelItems = [channelConfig('durov', GOLDEN_CONFIG)];
  return runFindNew({ inputItems, channelItems, staticData: {} }).out;
}

// Collect every typeVersion number declared for a node type in the installed n8n.
const TYPE_DIR = {
  scheduleTrigger: 'Schedule',
  manualTrigger: 'ManualTrigger',
  set: 'Set',
  code: 'Code',
  httpRequest: 'HttpRequest',
  html: 'Html',
  splitOut: 'Transform/SplitOut',
  if: 'If',
  telegram: 'Telegram',
  stickyNote: 'StickyNote',
};

function walkNodeFiles(dir, acc) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walkNodeFiles(p, acc);
    else if (entry.endsWith('.node.js')) acc.push(p);
  }
}

export function installedVersions(typeSuffix) {
  const sub = TYPE_DIR[typeSuffix];
  if (!sub) return null;
  const dir = join(N8N_NODES_BASE, sub);
  if (!existsSync(dir)) return null;
  const files = [];
  walkNodeFiles(dir, files);
  const versions = new Set();
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/version:\s*\[([0-9.,\s]+)\]/g)) {
      for (const n of m[1].split(',')) {
        const v = Number(n.trim());
        if (!Number.isNaN(v)) versions.add(v);
      }
    }
    for (const m of src.matchAll(/(?:version|defaultVersion):\s*([0-9.]+)\s*[,}]/g)) {
      const v = Number(m[1]);
      if (!Number.isNaN(v)) versions.add(v);
    }
  }
  return versions;
}
