// Live end-to-end check (AC14), run against a LOCAL n8n only.
//
//   N8N_URL=http://127.0.0.1:5678 N8N_API_KEY=... node scripts/e2e.mjs
//
// It starts two mock servers: one serves channel preview pages built from the real
// captured page in fixtures/durov.html, the other stands in for the Telegram Bot API.
// It imports workflow.json through the public REST API, creates a Telegram
// credential whose base URL is the mock Bot API, patches ONLY the config node values
// and the trigger interval in the imported copy, activates the workflow and asserts
// what the real n8n executions did. Nothing leaves the machine.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { N8N_URL, N8N_API_KEY } = process.env;
if (!N8N_URL || !N8N_API_KEY) {
  console.log('e2e: set N8N_URL and N8N_API_KEY to run the live end-to-end test. Skipping.');
  process.exit(0);
}
// 10 s, not 6: a run with a dropped connection retries and takes about 5 s, so a 6 s tick
// left no margin and runs of the same workflow could overlap (REVIEW-2 G1).
const TICK_SECONDS = Number(process.env.TICK_SECONDS || 10);
const CHAT_ID = '424242';

// ---------- preview pages from the real fixture ----------
const real = readFileSync(join(root, 'fixtures/durov.html'), 'utf8');
const WRAP = '<div class="tgme_widget_message_wrap js-widget_message_wrap">';
const parts = real.split(WRAP);
const head = parts[0];
const lastCut = parts[parts.length - 1].indexOf('    </section>');
const footer = parts[parts.length - 1].slice(lastCut);
const realBlocks = parts.slice(1).map((b, i, a) => (i === a.length - 1 ? b.slice(0, lastCut) : b));
const none = readFileSync(join(root, 'fixtures/none.html'), 'utf8');
const TEXT_RE = /(<div class="tgme_widget_message_text js-message_text"[^>]*>)([\s\S]*?)(<\/div>)/;

function retarget(block, channel, id, textHtml) {
  let b = block
    .replace(/data-post="durov\/\d+"/, `data-post="${channel}/${id}"`)
    .replace(/href="https:\/\/t\.me\/durov\/\d+"/g, `href="https://t.me/${channel}/${id}"`);
  if (textHtml === null) b = b.replace(TEXT_RE, ''); // media-only post
  else if (textHtml !== undefined) b = b.replace(TEXT_RE, (_, o, _t, c) => o + textHtml + c);
  return b;
}
const lastReal = realBlocks[realBlocks.length - 1];
const page = (blocks) => head + blocks.map((b) => WRAP + b).join('') + footer;
const baseline = (ch) => realBlocks.map((b, i) => retarget(b, ch, 533 + i)); // ids 533..552, real text

const posts = {
  newposts: [
    retarget(lastReal, 'alpha', 553, 'Kubernetes 1.40 is out, release notes <a href="https://example.org/k8s">here</a>'),
    retarget(lastReal, 'alpha', 554, null), // media only
    retarget(lastReal, 'alpha', 555, 'Nothing relevant in this one'),
    retarget(lastReal, 'alpha', 556, 'Remote ŻÓŁĆ job: <b>x &amp; y</b> &lt;3<br/>second line'),
    retarget(lastReal, 'alpha', 557, 'kubernetes remote spam offer'),
  ],
  cap: Array.from({ length: 12 }, (_, i) => retarget(lastReal, 'alpha', 560 + i, `kubernetes batch post ${i + 1}`)),
};

let phase = 'baseline';
const hits = { preview: [], bot: [] };
function previewFor(channel) {
  if (channel === 'ghost') return { status: 200, body: none };
  if (channel === 'boomer') return { status: 500, body: 'boomer' };
  const b = baseline('alpha');
  if (phase === 'baseline') return { status: 200, body: page(b) };
  if (phase === 'newposts' || phase === 'nochange') return { status: 200, body: page([...b, ...posts.newposts]) };
  return { status: 200, body: page([...posts.cap]) }; // cap (gap: 558, 559 missing)
}
const sent = [];
const sentLog = []; // every message with its arrival time, so a phase only counts its own execution
const startMocks = () =>
  new Promise((resolve) => {
    const preview = createServer((req, res) => {
      const name = decodeURIComponent(req.url.replace(/^\/s\//, '').split(/[/?]/)[0]);
      hits.preview.push({ name, ua: req.headers['user-agent'], ts: Date.now() });
      if (name === 'dropped') { req.socket.destroy(); return; } // transport error, not an HTTP status
      const r = previewFor(name);
      res.writeHead(r.status, { 'content-type': 'text/html; charset=utf-8' });
      res.end(r.body);
    });
    const bot = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        let parsed = body;
        try { parsed = JSON.parse(body); } catch {}
        hits.bot.push({ url: req.url, body: parsed });
        if (req.url.endsWith('/sendMessage')) { sent.push(parsed); sentLog.push({ ts: Date.now(), msg: parsed, id: sent.length }); }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, result: { message_id: sent.length, chat: { id: 1 }, date: 1, text: 'ok' } }));
      });
    });
    preview.listen(0, '127.0.0.1', () =>
      bot.listen(0, '127.0.0.1', () =>
        resolve({ preview, bot, previewBase: `http://127.0.0.1:${preview.address().port}/s/`, botBase: `http://127.0.0.1:${bot.address().port}` }),
      ),
    );
  });

// ---------- n8n REST ----------
const api = async (path, init = {}) => {
  const r = await fetch(`${N8N_URL.replace(/\/$/, '')}/api/v1${path}`, {
    ...init,
    headers: { 'X-N8N-API-KEY': N8N_API_KEY, 'content-type': 'application/json' },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${init.method || 'GET'} ${path} -> ${r.status} ${t.slice(0, 400)}`);
  return t ? JSON.parse(t) : null;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const setNode = (wf, name, fn) => fn(wf.nodes.find((n) => n.name === name));
const setAssign = (wf, field, value) =>
  setNode(wf, 'Set up your channels and keywords', (n) => {
    n.parameters.assignments.assignments.find((a) => a.name === field).value = value;
  });

let results = [];
const check = (name, fn) => {
  try { fn(); results.push([name, 'PASS']); console.log('PASS', name); }
  catch (e) { results.push([name, 'FAIL ' + e.message]); console.log('FAIL', name, '\n   ', e.message.split('\n').slice(0, 6).join('\n    ')); }
};

async function waitForRun(workflowId, afterMs, timeoutMs = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const { data } = await api(`/executions?workflowId=${workflowId}&limit=10&includeData=true`);
    const fresh = data.filter((e) => e.stoppedAt && new Date(e.startedAt).getTime() > afterMs).sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));
    if (fresh.length) return fresh[0];
    await sleep(500);
  }
  throw new Error('timed out waiting for an execution');
}
const outOf = (exec, node) => (exec.data?.resultData?.runData?.[node]?.[0]?.data?.main ?? []).map((b) => (b || []).map((i) => i.json));

async function runPhase(workflowId, name) {
  // No sleep before taking T: in one run the first execution after activation started during
  // a 1.5 s sleep here, so the baseline phase awaited the second run and saw no notices.
  // Messages are tied to the execution by message_id below, so no drain is needed.
  phase = name;
  const T = Date.now();
  const exec = await waitForRun(workflowId, T);
  await sleep(300);
  // Count only what arrived during this execution, so a straggler from the previous run cannot leak in.
  const from = new Date(exec.startedAt).getTime() - 50;
  const to = new Date(exec.stoppedAt).getTime() + 500;
  // Messages are tied to this execution by the message_id the mock returned to its
  // Telegram node, so a run that overlaps in time cannot add or take messages (REVIEW-2 G1).
  const ids = new Set(outOf(exec, 'Send alert to Telegram').flat().map((j) => j?.message_id ?? j?.result?.message_id).filter((x) => x != null));
  const mine = sentLog.filter((e) => ids.has(e.id)).map((e) => e.msg);
  const inWindow = sentLog.filter((e) => e.ts >= from && e.ts <= to).length;
  if (inWindow !== mine.length) console.log(`   note: ${inWindow} messages arrived during this execution's window, ${mine.length} belong to it`);
  const fetched = hits.preview.filter((h) => h.ts >= from && h.ts <= to);
  console.log(`-- phase ${name}: execution ${exec.id} status=${exec.status} (${to - 500 - from - 50} ms), messages sent=${mine.length}, preview fetches=${fetched.map((h) => h.name).join(',')}`);
  if (exec.status !== 'success') console.log('   execution error:', JSON.stringify(exec.data?.resultData?.error ?? {}, null, 1).slice(0, 1200), 'lastNode=', exec.data?.resultData?.lastNodeExecuted);
  return { exec, sent: mine, fetches: fetched };
}

async function main() {
  const mocks = await startMocks();
  const created = { workflow: null, credential: null };
  try {
    const cred = await api('/credentials', {
      method: 'POST',
      body: JSON.stringify({ name: 'e2e Telegram Bot account', type: 'telegramApi', data: { accessToken: '123456:E2E-LOCAL-MOCK-TOKEN', baseUrl: mocks.botBase } }),
    });
    created.credential = cred.id;
    const wf = JSON.parse(readFileSync(process.env.WORKFLOW_FILE || join(root, 'workflow.json'), 'utf8'));
    // The only patches: config values, trigger interval, credential binding.
    setAssign(wf, 'channels', 'alpha\nghost\nboomer');
    setAssign(wf, 'keywords', 'kubernetes\nremote\nżółć');
    setAssign(wf, 'excludeKeywords', 'spam');
    setAssign(wf, 'telegramChatId', CHAT_ID);
    setAssign(wf, 'previewBaseUrl', mocks.previewBase);
    setNode(wf, 'Run every 15 minutes', (n) => { n.parameters.rule.interval = [{ field: 'seconds', secondsInterval: TICK_SECONDS }]; });
    setNode(wf, 'Send alert to Telegram', (n) => { n.credentials.telegramApi = { id: cred.id, name: cred.name }; });
    wf.name = 'e2e ' + wf.name;
    const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings };
    const w = await api('/workflows', { method: 'POST', body: JSON.stringify(body) });
    created.workflow = w.id;
    console.log('imported workflow', w.id, 'with', w.nodes.length, 'nodes');
    await api(`/workflows/${w.id}/activate`, { method: 'POST', body: '{}' });
    console.log(`activated, schedule every ${TICK_SECONDS}s`);

    // ---- phase 1: baseline ----
    let r = await runPhase(w.id, 'baseline');
    check('baseline: execution succeeded', () => assert.equal(r.exec.status, 'success'));
    check('baseline: all three channels fetched with a browser User-Agent', () => {
      assert.deepEqual(r.fetches.map((f) => f.name).sort(), ['alpha', 'boomer', 'ghost']);
      assert.ok(r.fetches.every((f) => /Mozilla/.test(f.ua)));
    });
    check('baseline: no keyword alerts, only the two channel-problem notices', () => {
      const alerts = r.sent.filter((m) => /Open post|kubernetes/i.test(m.text));
      assert.equal(alerts.length, 0, JSON.stringify(alerts));
      assert.equal(r.sent.length, 2, JSON.stringify(r.sent.map((m) => m.text)));
      assert.ok(r.sent.every((m) => /returned no posts/.test(m.text)));
      assert.ok(r.sent.some((m) => m.text.includes('ghost')) && r.sent.some((m) => m.text.includes('boomer')));
      assert.ok(r.sent.every((m) => String(m.chat_id) === CHAT_ID));
    });
    check('baseline: real HTML nodes parsed the real fixture (20 posts) into the Code node', () => {
      const inItems = outOf(r.exec, 'Extract fields from each post')[0];
      assert.equal(inItems.length, 20, `got ${inItems.length}`);
      console.log('   first parsed item:', JSON.stringify(inItems[0]).slice(0, 700));
      assert.match(inItems[0].postId, /^alpha\/533$/);
      assert.ok(inItems[0].text.length > 0 && /^https:\/\/t\.me\/alpha\/533$/.test(inItems[0].url) && /^2026-/.test(inItems[0].isoDate));
    });

    // ---- phase 2: new posts ----
    r = await runPhase(w.id, 'newposts');
    check('newposts: exactly two keyword alerts (553 and 556), in order', () => {
      const texts = r.sent.map((m) => m.text);
      console.log('   full alert 1:', JSON.stringify(r.sent[0]));
      assert.equal(r.sent.length, 2, JSON.stringify(texts));
      assert.match(texts[0], /alpha\/553/);
      assert.match(texts[1], /alpha\/556/);
    });
    check('newposts: excluded (557), irrelevant (555) and media-only (554) posts are silent', () => {
      assert.equal(r.sent.length, 2, 'expected exactly the two alerts');
      const all = r.sent.map((m) => m.text).join('\n');
      for (const id of [554, 555, 557]) assert.ok(!all.includes(`alpha/${id}`), `post ${id} alerted`);
    });
    check('newposts: message format (HTML parse mode, escaping, matched keywords, link)', () => {
      assert.ok(r.sent.length >= 2, 'expected two alerts, got ' + r.sent.length); // REVIEW-2 G2
      const m = r.sent[1];
      assert.equal(m.parse_mode, 'HTML');
      assert.match(m.text, /Matched: .*(remote|żółć)/i);
      assert.match(m.text, /<a href="https:\/\/t\.me\/alpha\/556">Open post<\/a>/);
      assert.ok(m.text.includes('x &amp; y') && m.text.includes('&lt;3'), m.text);
      assert.ok(!/<b>x/.test(m.text), 'raw post markup leaked');
      assert.ok(m.text.length < 4096);
      console.log('   sample message:\n' + m.text.split('\n').map((l) => '     | ' + l).join('\n'));
    });

    // ---- phase 3: no change ----
    r = await runPhase(w.id, 'nochange');
    check('nochange: zero messages (dedupe and one-off notices hold across runs)', () => assert.equal(r.sent.length, 0, JSON.stringify(r.sent.map((m) => m.text))));

    // ---- phase 4: cap and gap ----
    r = await runPhase(w.id, 'cap');
    check('cap: 10 individual alerts (newest) plus one summary "+2 more"', () => {
      const texts = r.sent.map((m) => m.text);
      assert.equal(texts.length, 11, JSON.stringify(texts));
      assert.match(texts[10], /\+2 more matching posts not shown/);
      assert.match(texts[0], /alpha\/562/); // newest 10 of 560..571, chronological
      assert.match(texts[9], /alpha\/571/);
    });
    check('gap: alerts carry the possible-gap note', () => {
      assert.ok(r.sent.length >= 10, 'expected at least 10 alerts');
      assert.ok(r.sent.slice(0, 10).every((m) => /may have been missed/i.test(m.text)), r.sent[0].text);
    });
    r = await runPhase(w.id, 'cap');
    check('cap: next run repeats nothing', () => assert.equal(r.sent.length, 0));
    // ---- a second copy where one channel drops the connection (real transport-error items) ----
    await api(`/workflows/${w.id}/deactivate`, { method: 'POST', body: '{}' });
    const wf2 = JSON.parse(readFileSync(process.env.WORKFLOW_FILE || join(root, 'workflow.json'), 'utf8'));
    setAssign(wf2, 'channels', 'dropped\nalpha');
    setAssign(wf2, 'keywords', 'kubernetes');
    setAssign(wf2, 'telegramChatId', CHAT_ID);
    setAssign(wf2, 'previewBaseUrl', mocks.previewBase);
    setNode(wf2, 'Run every 15 minutes', (n) => { n.parameters.rule.interval = [{ field: 'seconds', secondsInterval: TICK_SECONDS }]; });
    setNode(wf2, 'Send alert to Telegram', (n) => { n.credentials.telegramApi = { id: cred.id, name: cred.name }; });
    const w2 = await api('/workflows', { method: 'POST', body: JSON.stringify({ name: 'e2e dropped ' + wf2.name, nodes: wf2.nodes, connections: wf2.connections, settings: wf2.settings }) });
    created.workflow2 = w2.id;
    await api(`/workflows/${w2.id}/activate`, { method: 'POST', body: '{}' });
    phase = 'baseline';
    r = await runPhase(w2.id, 'dropped-connection');
    check('dropped connection: run still succeeds, the dead channel gets one notice, the good channel is still read', () => {
      assert.equal(r.exec.status, 'success', JSON.stringify(r.exec.data?.resultData?.error ?? {}).slice(0, 300));
      assert.deepEqual([...new Set(r.fetches.map((f) => f.name))].sort(), ['alpha', 'dropped']);
      assert.equal(r.sent.length, 1, JSON.stringify(r.sent.map((m) => m.text)));
      assert.match(r.sent[0].text, /dropped/);
    });
  } finally {
    if (created.workflow2) {
      await api(`/workflows/${created.workflow2}/deactivate`, { method: 'POST', body: '{}' }).catch(() => {});
      await api(`/workflows/${created.workflow2}`, { method: 'DELETE' }).catch(() => {});
    }
    if (created.workflow) {
      await api(`/workflows/${created.workflow}/deactivate`, { method: 'POST', body: '{}' }).catch(() => {});
      await api(`/workflows/${created.workflow}`, { method: 'DELETE' }).catch(() => {});
    }
    if (created.credential) await api(`/credentials/${created.credential}`, { method: 'DELETE' }).catch(() => {});
    mocks.preview.close();
    mocks.bot.close();
  }
  const failed = results.filter(([, s]) => s !== 'PASS');
  console.log(`\ne2e summary: ${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error('e2e crashed:', e); process.exit(2); });
