# Telegram public channel keyword alerts

Watch public Telegram channels and get a Telegram message when a post matches your
keywords. It reads the public web preview at `https://t.me/s/<channel>`, so it needs
no Telegram API id or user session for reading. Only a bot token is needed to send
the alert. Built with core n8n nodes only.

## What it does

For each channel you list, every 15 minutes the workflow fetches the preview page,
parses the latest posts, keeps the ones newer than the last post it saw, filters by
your keywords, and sends one Telegram message per match. Matches are capped per run,
with a short summary when there are more.

## Requirements

- n8n 2.44.7 or later (tested on 2.44.7), self-hosted or cloud.
- A Telegram bot. Create one with @BotFather and copy its token.
- Your chat id. Message your bot, then open
  `https://api.telegram.org/bot<token>/getUpdates` and read `chat.id`. For a group,
  add the bot to the group first.

## Setup

1. Import `workflow.json`.
2. Open **Send alert to Telegram** and connect a Telegram credential named
   `Telegram Bot account` using your bot token.
3. Open **Set up your channels and keywords** and edit the values:
   - `channels`: one per line. Accepts `name`, `@name`, `t.me/name`,
     `https://t.me/name` and `https://t.me/s/name`.
   - `keywords`: one per line. Phrases are allowed.
   - `excludeKeywords`: optional. Any match here vetoes the post.
   - `matchWholeWords`: on by default, so `ai` does not match `mail`.
   - `telegramChatId`: replace the placeholder with your chat id.
   - `maxAlertsPerRun`: default 10.
   - `baselineOnFirstRun`: on by default. The first run per channel records the
     latest post and sends nothing, so you are not flooded with history.
4. Save and activate the workflow.

## How it dedupes

The workflow stores the highest post id it has seen per channel in workflow static
data. Posts at or below that id never alert again. State is saved only when the
workflow is active and runs from the schedule trigger. Manual runs from the editor do
not save state, so a manual test alerts again each time.

## How to test

Use **Run manually** with one channel and a common keyword. You should receive a
message. Remember that manual runs do not persist state, so repeat manual runs alert
again. For a true end-to-end check, activate the workflow and wait for the schedule.

## Swapping the notification

To send somewhere else, replace **Send alert to Telegram** with a Slack, Gmail,
email (SMTP) or webhook node. Each outgoing item carries `chatId` and a ready-made
`text` field. For Slack or email you will want the plain snippet fields on the item
(`snippet`, `channel`, `url`, `matchedKeywords`) rather than the Telegram HTML text.

## Limits

- The preview shows roughly the latest 20 posts per channel. A very busy channel can
  scroll posts off between runs. When a run has a matching post, the alert notes this and
  suggests running more often. A gap in a run with no matching post is silent, because the
  note rides on the alert message.
- Only public channels with a web preview work. Private channels and groups do not.
- Telegram can change the preview HTML, which may need the selectors updated.
- This is polite scraping: one request per channel per run, with a one second gap and
  the default 15 minute schedule.

## Troubleshooting

- "returned no posts": check the channel name and that `t.me/s/<name>` opens in a
  browser without login. A misspelt name gives one notice, then stays quiet.
- No message: check the bot token, the chat id, and that you have messaged the bot at
  least once.
- Alerts repeat on every manual run: expected, because manual runs do not save state.
- Retries: n8n counts `maxTries` as the total number of attempts, so the HTTP node
  retries once and the Telegram node retries twice after the first try.

## Tests

`npm test` runs the unit and structure tests offline in a few seconds. `npm run build`
regenerates `workflow.json` from `src/`. `npm run lint:copy` checks the writing.

## Live import test

Imported unchanged into a local n8n 2.44.7 through the public API, then activated with
the schedule patched to 10 seconds. A mock preview server (built from a real captured
`t.me/s/` page) and a mock Telegram Bot API ran on localhost. All 12 end-to-end checks
passed: baseline, new matches, no repeats, the alert cap with a "+2 more" summary, the
gap note, and a dead channel or a dropped connection not stopping the others. The real Telegram Bot API was
not called. See `samples/e2e-run.txt` and `VERIFICATION.md`.
