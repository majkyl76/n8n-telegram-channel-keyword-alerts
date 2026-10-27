import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  root, loadWorkflow, hasWorkflow, installedVersions, N8N_NODES_BASE,
} from './helpers.mjs';
import { serialize } from '../scripts/build.mjs';
import { lintText, stickyTexts } from '../scripts/lint-copy.mjs';

const wf = hasWorkflow() ? loadWorkflow() : null;
function need() {
  assert.ok(wf, 'workflow.json must be built (run: npm run build)');
}

const STICKY = 'n8n-nodes-base.stickyNote';
const TRIGGERS = ['n8n-nodes-base.scheduleTrigger', 'n8n-nodes-base.manualTrigger'];
const isSticky = (n) => n.type === STICKY;
const isTrigger = (n) => TRIGGERS.includes(n.type);

function rect(n) {
  const [x, y] = n.position;
  return { x, y, w: n.parameters.width || 0, h: n.parameters.height || 0 };
}
function covers(sticky, node) {
  const r = rect(sticky);
  const [x, y] = node.position;
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

test('build: workflow.json is not stale', () => {
  need();
  const onDisk = readFileSync(join(root, 'workflow.json'), 'utf8');
  assert.equal(onDisk, serialize(), 'workflow.json differs from build output; run npm run build');
});

test('AC1: valid importable structure with required keys', () => {
  need();
  for (const key of ['name', 'nodes', 'connections', 'settings']) {
    assert.ok(key in wf, 'missing key ' + key);
  }
  assert.equal(wf.active, false);
  assert.ok(Array.isArray(wf.nodes) && wf.nodes.length > 0);
  assert.ok(!('pinData' in wf), 'no pinData');
  assert.ok(!('id' in wf), 'no workflow id');
  assert.ok(!('versionId' in wf), 'no versionId');
  assert.ok(!(wf.meta && wf.meta.instanceId), 'no meta.instanceId');
});

test('AC1: node names and ids are unique', () => {
  need();
  const names = wf.nodes.map((n) => n.name);
  const ids = wf.nodes.map((n) => n.id);
  assert.equal(new Set(names).size, names.length, 'duplicate node names');
  assert.equal(new Set(ids).size, ids.length, 'duplicate node ids');
});

test('AC1: connections reference existing nodes', () => {
  need();
  const names = new Set(wf.nodes.map((n) => n.name));
  for (const [src, conn] of Object.entries(wf.connections)) {
    assert.ok(names.has(src), 'connection source missing: ' + src);
    for (const outputs of Object.values(conn)) {
      for (const slot of outputs) {
        for (const c of slot) assert.ok(names.has(c.node), 'target missing: ' + c.node);
      }
    }
  }
});

test('AC1: every functional node is reachable from a trigger', () => {
  need();
  const adj = {};
  for (const [src, conn] of Object.entries(wf.connections)) {
    adj[src] = [];
    for (const outputs of Object.values(conn)) {
      for (const slot of outputs) for (const c of slot) adj[src].push(c.node);
    }
  }
  const seen = new Set();
  const stack = wf.nodes.filter(isTrigger).map((n) => n.name);
  while (stack.length) {
    const cur = stack.pop();
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const nxt of adj[cur] || []) stack.push(nxt);
  }
  for (const n of wf.nodes) {
    if (isSticky(n) || isTrigger(n)) continue;
    assert.ok(seen.has(n.name), 'unreachable node: ' + n.name);
  }
});

test('AC1: no disabled nodes', () => {
  need();
  for (const n of wf.nodes) assert.notEqual(n.disabled, true, n.name + ' is disabled');
});

test('AC1: no orphan nodes (every non-trigger, non-sticky node has an input)', () => {
  need();
  const targets = new Set();
  for (const conn of Object.values(wf.connections)) {
    for (const outputs of Object.values(conn)) {
      for (const slot of outputs) for (const c of slot) targets.add(c.node);
    }
  }
  for (const n of wf.nodes) {
    if (isSticky(n) || isTrigger(n)) continue;
    assert.ok(targets.has(n.name), 'orphan node: ' + n.name);
  }
});

test('AC1: every node type and typeVersion exists in installed n8n', () => {
  need();
  if (!existsSync(N8N_NODES_BASE)) {
    console.log('SKIP: n8n-nodes-base not installed at ' + N8N_NODES_BASE);
    return;
  }
  for (const n of wf.nodes) {
    assert.ok(n.type.startsWith('n8n-nodes-base.'), 'non-core node: ' + n.type);
    const suffix = n.type.slice('n8n-nodes-base.'.length);
    const versions = installedVersions(suffix);
    assert.ok(versions, 'unknown node type: ' + n.type);
    assert.ok(versions.has(n.typeVersion), `${n.type} v${n.typeVersion} not in {${[...versions].join(',')}}`);
  }
});

test('AC1: workflow name is a plain verb-first title under 80 chars', () => {
  need();
  assert.ok(wf.name.length <= 80, 'name too long');
  assert.match(wf.name, /^[A-Z][a-z]+ /, 'name should start with a capitalised verb');
  // no emoji / non-ASCII
  assert.ok(!/[^\x00-\x7F]/.test(wf.name), 'name has non-ASCII/emoji');
});

test('AC5: no node uses an n8n default name', () => {
  need();
  const DEFAULTS = /^(HTTP Request|Set|Edit Fields|Code|If|Telegram|Schedule Trigger|Manual Trigger|HTML|Split Out)\d*$/;
  for (const n of wf.nodes) {
    if (isSticky(n)) continue;
    assert.ok(!DEFAULTS.test(n.name), 'default name: ' + n.name);
    assert.ok(n.name.length <= 50, 'name over 50 chars: ' + n.name);
  }
});

test('AC2: exactly one yellow main sticky at the top-left', () => {
  need();
  const stickies = wf.nodes.filter(isSticky);
  const nonSticky = wf.nodes.filter((n) => !isSticky(n));
  const yellow = stickies.filter((s) => (s.parameters.color || 1) === 1);
  assert.equal(yellow.length, 1, 'exactly one yellow main sticky');
  const main = yellow[0];
  const allX = wf.nodes.map((n) => n.position[0]);
  const allY = wf.nodes.map((n) => n.position[1]);
  assert.equal(main.position[0], Math.min(...allX), 'main sticky must have the minimum x');
  assert.equal(main.position[1], Math.min(...allY), 'main sticky must have the minimum y');
  // nothing sits above or to the left of it
  for (const n of nonSticky) {
    assert.ok(n.position[0] >= main.position[0]);
    assert.ok(n.position[1] >= main.position[1]);
  }
});

test('AC2: main sticky word count and required headings', () => {
  need();
  const main = wf.nodes.filter(isSticky).find((s) => (s.parameters.color || 1) === 1);
  const text = main.parameters.content;
  const words = text.replace(/[#>*`]/g, ' ').split(/\s+/).filter(Boolean).length;
  assert.ok(words >= 100 && words <= 300, 'main sticky words=' + words + ' (want 100-300)');
  assert.match(text, /### How it works/);
  assert.match(text, /### Setup/);
  // Setup must name the credential, config values and how to test, and the static-data limit.
  assert.match(text, /Telegram Bot account/);
  assert.match(text, /telegramChatId/);
  assert.match(text, /Run manually/);
  assert.match(text, /static data/i);
});

test('AC2: white section stickies each cover >= 2 nodes and not the main sticky', () => {
  need();
  const stickies = wf.nodes.filter(isSticky);
  const main = stickies.find((s) => (s.parameters.color || 1) === 1);
  const white = stickies.filter((s) => s.parameters.color === 7);
  const functional = wf.nodes.filter((n) => !isSticky(n));
  assert.ok(white.length >= 1, 'needs white section stickies');
  const covered = new Set();
  for (const s of white) {
    const hits = functional.filter((n) => covers(s, n));
    assert.ok(hits.length >= 2, `section sticky "${s.name}" covers ${hits.length} nodes (want >=2)`);
    const w = (s.parameters.content || '').split(/\s+/).filter(Boolean).length;
    assert.ok(w < 50, `section sticky "${s.name}" has ${w} words (want <50)`);
    assert.ok(!covers(s, main), `section sticky "${s.name}" must not cover the main sticky`);
    hits.forEach((n) => covered.add(n.name));
  }
  for (const n of functional) {
    assert.ok(covered.has(n.name), 'functional node not under any section sticky: ' + n.name);
  }
});

test('AC2: at most one red sticky, covering exactly one node, on the Telegram node', () => {
  need();
  const stickies = wf.nodes.filter(isSticky);
  const red = stickies.filter((s) => s.parameters.color === 3);
  assert.ok(red.length <= 1, 'at most one red sticky');
  if (red.length === 1) {
    const functional = wf.nodes.filter((n) => !isSticky(n));
    const hits = functional.filter((n) => covers(red[0], n));
    assert.equal(hits.length, 1, 'red sticky must cover exactly one node');
    assert.equal(hits[0].type, 'n8n-nodes-base.telegram', 'red sticky belongs on the Telegram node');
  }
});

test('AC2: only the expected sticky colours are used', () => {
  need();
  for (const s of wf.nodes.filter(isSticky)) {
    const c = s.parameters.color || 1;
    assert.ok([1, 3, 7].includes(c), 'unexpected sticky colour ' + c + ' on ' + s.name);
  }
});

test('AC3: no secrets anywhere in the JSON', () => {
  need();
  const raw = JSON.stringify(wf);
  assert.ok(!/\d{6,12}:[A-Za-z0-9_-]{30,}/.test(raw), 'looks like a bot token');
  assert.ok(!/Bearer\s/.test(raw), 'contains Bearer');
  assert.ok(!/api_key/i.test(raw), 'contains api_key');
  assert.ok(!/[A-Za-z0-9+/=]{40,}/.test(raw), 'long random-looking string');
  assert.ok(!/patyjewicz/i.test(raw), "contains owner's name");
  assert.ok(!/majkyl76@|@gmail\.com/i.test(raw), 'contains a personal email');
});

test('AC3: Telegram credential referenced by name only, no id', () => {
  need();
  const tg = wf.nodes.find((n) => n.type === 'n8n-nodes-base.telegram');
  assert.ok(tg, 'telegram node present');
  assert.deepEqual(tg.credentials, { telegramApi: { name: 'Telegram Bot account' } });
  assert.ok(!('id' in tg.credentials.telegramApi), 'no credential id');
  // No other node uses credentials.
  for (const n of wf.nodes) {
    if (n === tg) continue;
    assert.ok(!n.credentials, n.name + ' should not have credentials');
  }
});

test('AC12: honest limits appear in the main sticky', () => {
  need();
  const main = wf.nodes.filter(isSticky).find((s) => (s.parameters.color || 1) === 1);
  const t = main.parameters.content.toLowerCase();
  assert.match(t, /20 posts|latest 20|about 20/);
  assert.match(t, /manual runs do not save|manual test alerts again/);
  assert.match(t, /active/);
  assert.match(t, /telegram may change/);
  assert.match(t, /public channels|public web preview|web preview/);
  assert.match(t, /one request per channel|one second gap/);
});

test('AC13: README, LISTING and sticky text pass copy lint', () => {
  need();
  const issues = [];
  for (const f of ['README.md', 'LISTING.md']) {
    const p = join(root, f);
    assert.ok(existsSync(p), f + ' must exist');
    issues.push(...lintText(readFileSync(p, 'utf8'), f));
  }
  for (const s of stickyTexts()) issues.push(...lintText(s.text, s.label));
  assert.equal(issues.length, 0, 'copy lint issues:\n' + issues.join('\n'));
});

test('Code nodes avoid globals that the n8n Code node sandbox does not provide', () => {
  // The n8n Code node sandbox has no `new URL`, URLSearchParams, Buffer, structuredClone,
  // TextEncoder or TextDecoder, unlike plain Node.js.
  const wf = JSON.parse(readFileSync(new URL('../workflow.json', import.meta.url), 'utf8'));
  for (const node of wf.nodes.filter((n) => n.type === 'n8n-nodes-base.code')) {
    assert.doesNotMatch(node.parameters.jsCode, /\b(new URL|URLSearchParams|Buffer|structuredClone|TextEncoder|TextDecoder)\b/, node.name);
  }
});

test('HTML node reads the HTTP body from "data", and the Telegram node drops the n8n attribution line', () => {
  const wf = JSON.parse(readFileSync(new URL('../workflow.json', import.meta.url), 'utf8'));
  const html = wf.nodes.find((n) => n.name === 'Split page into post blocks');
  assert.equal(html.parameters.dataPropertyName, 'data');
  assert.equal(html.onError, 'continueRegularOutput');
  const send = wf.nodes.find((n) => n.name === 'Send alert to Telegram');
  assert.equal(send.parameters.additionalFields.appendAttribution, false);
});
