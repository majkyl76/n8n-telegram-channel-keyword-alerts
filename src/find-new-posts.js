// Code node "Find new posts that match your keywords" (Run Once for All Items).
// Input items: one per post, as emitted by the HTML nodes
//   { postId: "channel/123", text: "<html>", isoDate, url, views }.
// Reads the channel list and config from "Check settings and list channels",
// and the per-channel dedupe state from workflow static data.
// Emits one item per message to send, plus baseline notes (send=false).
//
// n8n globals used: $input, $, $getWorkflowStaticData.

const MAX_MESSAGE = 4096; // Telegram hard limit
const SNIPPET_MAX = 500; // characters of post text to include

// --- plain text from Telegram's message HTML --------------------------------
function decodeEntities(s) {
  return String(s)
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    // numeric entities, decimal and hex, e.g. &#33; &#x1F600;
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeFromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeFromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&'); // ampersand last so it cannot re-form an entity
}

function safeFromCodePoint(cp) {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return '';
  try {
    return String.fromCodePoint(cp);
  } catch (e) {
    return '';
  }
}

function htmlToText(html) {
  let s = String(html == null ? '' : html);
  // Emoji images with no inner text but an alt: keep the alt. (Fixtures carry the
  // emoji as inner text inside <b>, which survives tag stripping on its own.)
  s = s.replace(/<i\b[^>]*class="emoji"[^>]*\balt="([^"]*)"[^>]*>\s*<\/i>/gi, '$1');
  // <br> and block ends become newlines.
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|blockquote)>/gi, '\n');
  // Strip every remaining tag (leaves emoji characters and link text behind).
  s = s.replace(/<[^>]*>/g, '');
  s = decodeEntities(s);
  // Collapse whitespace: spaces/tabs runs to one space, cap blank-line runs,
  // trim each line. No leftover tag angle brackets remain by construction.
  s = s.replace(/[ \t\f\v]+/g, ' ');
  s = s.replace(/ *\n */g, '\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

// --- keyword matching -------------------------------------------------------
function escapeRegex(s) {
  // Escape every regex metacharacter so keywords match literally (c++, .net, $BTC).
  return s.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&');
}

function keywordRegex(keyword, wholeWords) {
  // Split a phrase into tokens; match across any run of whitespace between them.
  const tokens = keyword.trim().split(/\s+/).filter(Boolean).map(escapeRegex);
  if (tokens.length === 0) return null;
  let pattern = tokens.join('\\s+');
  if (wholeWords) {
    // Unicode-aware word boundaries: not preceded/followed by a letter, digit or _.
    pattern = '(?<![\\p{L}\\p{N}_])' + pattern + '(?![\\p{L}\\p{N}_])';
  }
  return new RegExp(pattern, 'iu'); // i: case-insensitive, u: Unicode (żółć == ŻÓŁĆ)
}

function matchKeywords(text, keywords, excludeKeywords, wholeWords) {
  for (const ex of excludeKeywords) {
    const re = keywordRegex(ex, wholeWords);
    if (re && re.test(text)) return null; // excluded post vetoes the whole match
  }
  const hits = [];
  const seen = new Set();
  for (const kw of keywords) {
    const re = keywordRegex(kw, wholeWords);
    if (re && re.test(text) && !seen.has(kw)) {
      seen.add(kw); // de-duplicate, keep original spelling and config order
      hits.push(kw);
    }
  }
  return hits;
}

// --- message building -------------------------------------------------------
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatUtc(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso || '');
  const p = (n) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear() +
    '-' + p(d.getUTCMonth() + 1) +
    '-' + p(d.getUTCDate()) +
    ' ' + p(d.getUTCHours()) +
    ':' + p(d.getUTCMinutes()) +
    ' UTC'
  );
}

function cutSnippet(text, max) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  let slice = t.slice(0, max - 1); // leave room for the ellipsis
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace > 0) slice = slice.slice(0, lastSpace); // cut at a word boundary
  return slice.replace(/\s+$/, '') + '…';
}

const GAP_NOTE =
  'Note: some posts may have been missed. The public preview shows only the latest posts, so run this workflow more often.';

// Cap an already-escaped string to a hard length, adding an ellipsis. Clipping
// after escaping bounds the output even if escaping expanded the input (e.g. a
// run of & < >); it may clip inside an entity but never inside a tag.
function clip(s, max) {
  return s.length <= max ? s : s.slice(0, max) + '…';
}
const HEADER_MAX = 100; // characters of channel name shown in the header
const MATCHED_MAX = 300; // characters of the "Matched: ..." list
const URL_MAX = 600; // characters of the link target

function buildAlertText(channel, post, matched, possibleGap) {
  // AC15: cap the header, matched list and link so the message stays under the
  // Telegram limit even for a very long channel name, link or keyword list.
  const header = '<b>@' + clip(escapeHtml(channel), HEADER_MAX) + '</b>';
  const date = formatUtc(post.isoDate);
  const matchedLine = 'Matched: ' + clip(escapeHtml(matched.join(', ')), MATCHED_MAX);
  const link = '<a href="' + clip(escapeHtml(post.url), URL_MAX) + '">Open post</a>';
  const build = (snippet) => {
    const parts = [header, date, '', snippet, '', matchedLine, link];
    if (possibleGap) parts.push('', GAP_NOTE);
    return parts.join('\n');
  };
  // Shrink the snippet, never the structure, until the escaped message fits.
  let budget = SNIPPET_MAX;
  let text;
  do {
    text = build(escapeHtml(cutSnippet(post.text, budget)));
    budget -= 100;
  } while (text.length >= MAX_MESSAGE && budget > 0);
  // Belt and braces: if the capped fixed parts alone still overflow, drop the
  // snippet entirely. The link line is kept last and is never cut mid-tag.
  if (text.length >= MAX_MESSAGE) {
    const parts = [header, date, matchedLine, link];
    if (possibleGap) parts.push('', GAP_NOTE);
    text = parts.join('\n');
  }
  return text;
}

function noticeText(channel) {
  return (
    'Channel @' + channel + ' returned no posts. ' +
    'Check the name and that the channel has a public web preview.'
  );
}

function baselineText(channel, count) {
  return (
    'Baseline set for @' + channel + '. Recorded the latest of ' + count +
    ' posts. New posts from now on will alert.'
  );
}

// --- post parsing -----------------------------------------------------------
function parsePost(raw) {
  const dataPost = String(raw.postId == null ? '' : raw.postId).trim();
  const slash = dataPost.lastIndexOf('/');
  const channel = slash >= 0 ? dataPost.slice(0, slash) : '';
  const postId = parseInt(dataPost.slice(slash + 1), 10);
  // AC16: build the permalink from the validated channel and numeric id, never
  // from the page href (which is attacker-controllable). raw.url is ignored.
  const url = channel && Number.isFinite(postId) ? 'https://t.me/' + channel + '/' + postId : '';
  return {
    channel,
    channelKey: channel.toLowerCase(),
    postId,
    url,
    isoDate: String(raw.isoDate || '').trim(),
    text: htmlToText(raw.text),
    views: String(raw.views || '').trim(),
  };
}

// --- main -------------------------------------------------------------------
function main() {
  const staticData = $getWorkflowStaticData('global');
  const channelItems = $('Check settings and list channels').all().map((i) => i.json);
  const cfg = channelItems[0] || {};
  const keywords = cfg.keywords || [];
  const excludeKeywords = cfg.excludeKeywords || [];
  const wholeWords = cfg.matchWholeWords !== false;
  const maxAlerts = Number(cfg.maxAlertsPerRun) || 10;
  const baselineOnFirstRun = cfg.baselineOnFirstRun !== false;
  const chatId = cfg.chatId;

  // Group the parsed posts by channel.
  const byChannel = {};
  for (const item of $input.all()) {
    const post = parsePost(item.json);
    if (!post.channel || !Number.isFinite(post.postId)) continue;
    (byChannel[post.channelKey] = byChannel[post.channelKey] || []).push(post);
  }

  const out = [];

  for (const cItem of channelItems) {
    const channel = cItem.channel;
    const key = String(channel).toLowerCase();
    const group = (byChannel[key] || []).slice().sort((a, b) => a.postId - b.postId);
    const problemKey = 'problem_' + key;
    const lastKey = 'lastSeen_' + key;

    // AC10: a channel with no post blocks gets one notice, then stays quiet
    // until it recovers.
    if (group.length === 0) {
      if (!staticData[problemKey]) {
        staticData[problemKey] = true;
        out.push({ json: { send: true, kind: 'notice', channel, chatId, text: noticeText(channel) } });
      }
      continue;
    }
    if (staticData[problemKey]) delete staticData[problemKey]; // recovered, no message

    const highest = group[group.length - 1].postId;
    const lowest = group[0].postId;
    const hasState = Object.prototype.hasOwnProperty.call(staticData, lastKey);
    const lastSeen = hasState ? staticData[lastKey] : null;

    // AC9: a jump at the bottom of the page means posts may have scrolled off.
    const possibleGap = hasState && lastSeen != null && lowest > lastSeen + 1;

    let candidates;
    let baseline = false;
    if (!hasState) {
      if (baselineOnFirstRun) {
        candidates = [];
        baseline = true;
      } else {
        candidates = group.slice();
      }
    } else {
      candidates = group.filter((p) => p.postId > lastSeen);
    }

    // AC8: state always advances to the highest id seen, even with no match.
    staticData[lastKey] = hasState ? Math.max(lastSeen, highest) : highest;

    if (baseline) {
      out.push({
        json: { send: false, kind: 'baseline', channel, chatId, text: baselineText(channel, group.length), possibleGap },
      });
      continue;
    }

    // Keyword filter, keeping chronological order.
    const matched = [];
    for (const p of candidates) {
      const hits = matchKeywords(p.text, keywords, excludeKeywords, wholeWords);
      if (hits && hits.length > 0) matched.push({ post: p, matched: hits });
    }

    // AC9 cap: send only the NEWEST maxAlerts, in chronological order, then a summary.
    let overflow = 0;
    let shown = matched;
    if (matched.length > maxAlerts) {
      overflow = matched.length - maxAlerts;
      shown = matched.slice(matched.length - maxAlerts);
    }

    for (const m of shown) {
      out.push({
        json: {
          send: true,
          kind: 'alert',
          channel,
          chatId,
          postId: m.post.postId,
          url: m.post.url,
          isoDate: m.post.isoDate,
          views: m.post.views,
          snippet: cutSnippet(m.post.text, SNIPPET_MAX),
          matchedKeywords: m.matched,
          possibleGap,
          text: buildAlertText(channel, m.post, m.matched, possibleGap),
        },
      });
    }

    if (overflow > 0) {
      out.push({
        json: {
          send: true,
          kind: 'summary',
          channel,
          chatId,
          text: '+' + overflow + ' more matching posts not shown',
        },
      });
    }
  }

  return out;
}

return main();
