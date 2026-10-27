// Code node "Check settings and list channels" (Run Once for All Items).
// Validates the config from the Set node and emits one item per channel.
// Throws a clear error BEFORE any HTTP request when the config is wrong.
// n8n globals used: $input.

const cfg = $input.first().json;

// Split a multi-line string into trimmed, non-empty lines, dropping # comments.
function lines(value) {
  return String(value == null ? '' : value)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
}

// Turn any accepted channel form into a bare username.
// Accepts: name, @name, t.me/name, https://t.me/name, https://t.me/s/name,
// and tolerates a /123 post suffix, trailing slashes and ?query strings.
function normaliseChannel(raw) {
  let s = String(raw).trim();
  s = s.replace(/^@/, ''); // drop a leading @
  s = s.replace(/^https?:\/\//i, ''); // drop protocol
  s = s.replace(/[?#].*$/, ''); // drop query string or fragment
  s = s.replace(/\/+$/, ''); // drop trailing slashes
  s = s.replace(/^t\.me\//i, ''); // drop the t.me/ host
  s = s.replace(/^s\//i, ''); // drop the /s/ public-preview segment
  s = s.split('/')[0]; // keep the username, drop any /123 post suffix
  return s;
}

// A valid Telegram username: 5 to 32 chars, letters/digits/underscore, starts with a letter.
const USERNAME = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;

const chatId = String(cfg.telegramChatId == null ? '' : cfg.telegramChatId).trim();
if (chatId === '' || chatId === 'YOUR_TELEGRAM_CHAT_ID') {
  throw new Error(
    'Set telegramChatId in "Set up your channels and keywords". It is still the placeholder YOUR_TELEGRAM_CHAT_ID.',
  );
}

const keywords = lines(cfg.keywords);
if (keywords.length === 0) {
  throw new Error('Add at least one keyword in "Set up your channels and keywords".');
}
const excludeKeywords = lines(cfg.excludeKeywords);

const rawChannels = lines(cfg.channels);
if (rawChannels.length === 0) {
  throw new Error('Add at least one channel in "Set up your channels and keywords".');
}

// Only a number or a numeric string is accepted: Number() would otherwise silently
// coerce a boolean (Number(true) === 1) or a single-element array (Number([5]) === 5)
// into a valid-looking integer.
const maxRaw = cfg.maxAlertsPerRun;
const maxIsNumberOrString = typeof maxRaw === 'number' || typeof maxRaw === 'string';
const max = maxIsNumberOrString ? Number(maxRaw) : NaN;
if (!maxIsNumberOrString || !Number.isInteger(max) || max < 1) {
  throw new Error('maxAlertsPerRun must be a positive whole number. Got: ' + String(cfg.maxAlertsPerRun));
}

const matchWholeWords = cfg.matchWholeWords !== false; // default true
const baselineOnFirstRun = cfg.baselineOnFirstRun !== false; // default true
const previewBaseUrl = String(cfg.previewBaseUrl || 'https://t.me/s/').trim() || 'https://t.me/s/';

const seen = new Set();
const channels = [];
for (const raw of rawChannels) {
  const slug = normaliseChannel(raw);
  if (!USERNAME.test(slug)) {
    throw new Error(
      'Not a valid Telegram channel username: "' + raw + '". Use 5 to 32 letters, digits or underscore, starting with a letter.',
    );
  }
  const key = slug.toLowerCase();
  if (seen.has(key)) continue; // de-duplicate case-insensitively, keep the first
  seen.add(key);
  channels.push(slug);
}

// previewBaseUrl ends with a slash by convention; join safely either way.
const base = previewBaseUrl.endsWith('/') ? previewBaseUrl : previewBaseUrl + '/';

return channels.map((channel) => ({
  json: {
    channel,
    url: base + channel,
    keywords,
    excludeKeywords,
    matchWholeWords,
    maxAlertsPerRun: max,
    baselineOnFirstRun,
    previewBaseUrl,
    chatId,
  },
}));
