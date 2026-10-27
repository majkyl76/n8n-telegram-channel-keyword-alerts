// Produce the per-post item set that the shipped HTML nodes emit, derived with
// the same Cheerio that n8n uses, so the unit tests exercise the real item shape.
//
// Flow reproduced here:
//   1. HTML node "Split page into post blocks": cssSelector ".tgme_widget_message_wrap",
//      returnValue html, returnArray true  -> array of inner HTML strings (one per post block).
//   2. Split Out "posts" -> one item per block, field "posts".
//   3. HTML node "Extract fields from each post": per-post selectors below.
//
// Cheerio's .html() returns INNER html (see n8n-nodes-base Html/utils.js getValue),
// which is exactly what the HTML node returns for returnValue "html".
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(scriptsDir, '..', '..', '..', 'n8n-local', 'node_modules') + '/');
const cheerio = require('cheerio');

// Per-post extraction map, identical to the second HTML node's extractionValues.
const PER_POST = [
  { key: 'postId', cssSelector: '.tgme_widget_message', returnValue: 'attribute', attribute: 'data-post' },
  { key: 'text', cssSelector: '.tgme_widget_message_text', returnValue: 'html' },
  { key: 'isoDate', cssSelector: 'a.tgme_widget_message_date time', returnValue: 'attribute', attribute: 'datetime' },
  { key: 'url', cssSelector: 'a.tgme_widget_message_date', returnValue: 'attribute', attribute: 'href' },
  { key: 'views', cssSelector: '.tgme_widget_message_views', returnValue: 'text' },
];

function extractOne(blockHtml) {
  const $ = cheerio.load(blockHtml);
  const out = {};
  for (const v of PER_POST) {
    const el = $(v.cssSelector);
    if (v.returnValue === 'attribute') out[v.key] = el.attr(v.attribute);
    else if (v.returnValue === 'html') out[v.key] = el.html() || undefined;
    else out[v.key] = el.text() || undefined;
  }
  return out;
}

function pageToItems(html) {
  const $ = cheerio.load(html);
  const blocks = [];
  $('.tgme_widget_message_wrap').each((_, el) => {
    const inner = $(el).html();
    if (inner) blocks.push(inner);
  });
  return blocks.map(extractOne);
}

function run(srcName, outName) {
  const html = readFileSync(new URL(`../fixtures/${srcName}`, import.meta.url), 'utf8');
  const items = pageToItems(html);
  writeFileSync(
    new URL(`../fixtures/${outName}`, import.meta.url),
    JSON.stringify(items, null, 2) + '\n',
  );
  console.log(`${srcName}: ${items.length} post items -> fixtures/${outName}`);
}

run('examplechannel.html', 'examplechannel.items.json');
run('none.html', 'none.items.json');
