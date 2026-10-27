// Copy quality checks for README.md, LISTING.md and the sticky note text in
// workflow.json (AC13). No em dashes, no banned words, British spelling for a
// short list. Code spans and fenced blocks are ignored so API fields and code
// identifiers (parse_mode, color, etc.) are not flagged.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const BANNED = [
  'excited', 'leverage', 'seamless', 'robust', 'cutting-edge', 'streamline',
  'tailored', 'ensure', 'delve', 'passionate', 'game-changer', 'powerful',
  'effortless', 'supercharge', 'unlock',
];

// American form -> British form, flagged in prose only.
const AMERICAN = [
  ['organize', 'organise'], ['color', 'colour'], ['license', 'licence (noun)'],
  ['behavior', 'behaviour'], ['summarize', 'summarise'], ['analyze', 'analyse'],
  ['center', 'centre'], ['favor', 'favour'],
];

function stripCode(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' ') // fenced blocks
    .replace(/`[^`]*`/g, ' '); // inline code
}

export function lintText(text, label) {
  const issues = [];
  const emDashes = (text.match(/—/g) || []).length;
  if (emDashes > 0) issues.push(`${label}: ${emDashes} em dash(es)`);

  const prose = stripCode(text);
  const low = prose.toLowerCase();
  for (const word of BANNED) {
    const re = new RegExp('\\b' + word.replace(/[-]/g, '\\$&') + '\\b', 'i');
    if (re.test(low)) issues.push(`${label}: banned word "${word}"`);
  }
  for (const [us, uk] of AMERICAN) {
    const re = new RegExp('\\b' + us + '\\b', 'i');
    if (re.test(low)) issues.push(`${label}: American spelling "${us}" (use ${uk})`);
  }
  return issues;
}

export function stickyTexts() {
  const wf = JSON.parse(readFileSync(join(root, 'workflow.json'), 'utf8'));
  return wf.nodes
    .filter((n) => n.type === 'n8n-nodes-base.stickyNote')
    .map((n) => ({ label: `sticky:${n.name}`, text: n.parameters.content || '' }));
}

export function lintAll() {
  const issues = [];
  for (const file of ['README.md', 'LISTING.md']) {
    const p = join(root, file);
    if (!existsSync(p)) {
      issues.push(`${file}: missing`);
      continue;
    }
    issues.push(...lintText(readFileSync(p, 'utf8'), file));
  }
  if (existsSync(join(root, 'workflow.json'))) {
    for (const s of stickyTexts()) issues.push(...lintText(s.text, s.label));
  } else {
    issues.push('workflow.json: missing');
  }
  return issues;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const issues = lintAll();
  if (issues.length) {
    console.error('Copy lint found issues:');
    for (const i of issues) console.error('  - ' + i);
    process.exit(1);
  }
  console.log('Copy lint: clean.');
}
