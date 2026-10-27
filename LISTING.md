# Send Telegram alerts for keyword matches in public channels

Follow public Telegram channels and get a direct message only when a post mentions
something you care about. This template reads the public web preview of each channel
(`t.me/s/<name>`), finds new posts, filters by your keywords, and sends one Telegram
message per match. It is for anyone who tracks news, jobs, deals, releases or tenders
across several channels and wants a ping instead of endless scrolling. You need a
Telegram bot token and your chat id. Reading the channels needs no API key.

## How it works

- A schedule (every 15 minutes) or a manual run starts the flow.
- One Set node holds all your channels and keywords. A Code node checks the settings
  and lists the channels.
- An HTTP Request node fetches each channel preview, one request at a time with a one
  second gap. HTML nodes split the page into posts and pull out id, text, date and link.
- A Code node keeps posts newer than the last one seen, applies your keyword and
  exclude rules, caps the count per run, and updates the saved state per channel.
- A Telegram node sends one message per match, with the channel, date, a snippet, the
  matched keywords and a link to the post.

## Setup

- Import the workflow.
- Connect a Telegram credential named `Telegram Bot account` (bot token from @BotFather).
- Edit the Set node: channels (one per line), keywords (one per line), optional exclude
  keywords, whole-word matching, your chat id, and the per-run cap.
- Activate the workflow. Alerts then arrive on the schedule.

## Requirements

- n8n 2.44.7 or later.
- A Telegram bot and its token.
- Your Telegram chat id (message the bot, then read it from the Telegram API).

## Categories

Suggested: Marketing, Social Media, or Other. I am not certain of the exact category
list in the marketplace, so please map these to the closest official options.

## Tags

telegram, alerts, keywords, monitoring, channels, notifications, scraping, news

## Limitations

- The preview shows roughly the latest 20 posts per channel, so a very busy channel can
  scroll posts off between runs. Raise the frequency if needed.
- Only public channels with a web preview work. Private channels and groups do not.
- Dedupe state is saved only while the workflow is active and running from the schedule.
  Manual runs from the editor do not persist state, so a manual test alerts each time.
- Telegram may change the preview HTML, which can mean updating the selectors.
