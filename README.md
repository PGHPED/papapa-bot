# papapa-bot

A little Slack bot I built for the Stardance "Make a Slack Bot" mission. It started as a `/ping` command and kind of grew from there — now it does trivia, daily standups, some light moderation, and posts my GitHub PR updates.

It runs 24/7 on my Hack Club Nest server, so it stays online even with my laptop closed.

## What it can do

Slash commands:

- `/papapa-ping` — quick "is it alive?" check
- `/papapa-help` — lists every command
- `/papapa-fact` — a random fun fact
- `/papapa-weather Madrid` — current weather for a city
- `/papapa-uptime` — how long the bot has been running
- `/papapa-stats` — live server stats (CPU, RAM, load) pulled straight from the box
- `/papapa-standup <your update>` — save your standup for the day
- `/papapa-trivia` — a trivia question with clickable answers
- `/papapa-scores` — the trivia leaderboard

It also replies when you `@`-mention it.

Running in the background:

- **Daily standup** — every morning at 9am it posts a summary of everyone's standups to a channel, then wipes the slate for the next day.
- **Moderation** — flags messages containing banned words with a 🚩 and (optionally) pings a mod channel.
- **GitHub** — polls a repo every few minutes and posts when a PR is opened, updated, merged or closed.

Scores and standup entries live in a `data.json` file so they survive restarts.

## Stack

- Node.js
- [@slack/bolt](https://slack.dev/bolt-js/) in Socket Mode (no public webhook needed)
- axios for the API calls
- node-cron for the 9am standup
- hosted on [Hack Club Nest](https://hackclub.app/) with systemd

## Running it yourself

Clone it and install the deps:

```bash
git clone https://github.com/PGHPED/papapa-bot.git
cd papapa-bot
npm install
```

Make a `.env` file with your Slack tokens (Socket Mode, so you need both):

```bash
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
```

Optional stuff — only fill in what you want to use, the rest just stays off:

```bash
STANDUP_CHANNEL=C0XXXXXXX        # channel for the 9am standup summary
STANDUP_TZ=Europe/Madrid         # your timezone
BANNED_WORDS=word1,word2         # moderation
MOD_LOG_CHANNEL=C0YYYYYYY        # where flagged messages get reported
GITHUB_REPO=owner/repo           # repo to watch
GITHUB_CHANNEL=C0ZZZZZZZ         # where PR updates get posted
GITHUB_TOKEN=ghp_...             # optional, for private repos / rate limits
GITHUB_POLL_MINUTES=5            # how often to check
```

Then:

```bash
node index.js
```

You should see `⚡ papapa-bot is running!`.

Don't forget to register the slash commands and add the scopes (`chat:write`, `reactions:write`, `channels:history`) in your app config at [api.slack.com/apps](https://api.slack.com/apps), and invite the bot to the channels you want it in.

## Keeping it alive on Nest

It runs as a systemd service so it restarts automatically if it ever crashes. To update:

```bash
cd ~/papapa-bot
git pull
npm install
systemctl restart slackbot
journalctl -u slackbot -f
```

---

Built for [Stardance](https://stardance.hackclub.com/) 🌟
