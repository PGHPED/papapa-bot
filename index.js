require("dotenv").config();

const fs = require("fs");
const path = require("path");
const os = require("os");
const cron = require("node-cron");
const { App } = require("@slack/bolt");
const axios = require("axios");

const { SLACK_BOT_TOKEN, SLACK_APP_TOKEN } = process.env;
if (!SLACK_BOT_TOKEN || !SLACK_APP_TOKEN) {
  console.error("Missing SLACK_BOT_TOKEN and/or SLACK_APP_TOKEN. Check your .env file.");
  process.exit(1);
}

const app = new App({
  token: SLACK_BOT_TOKEN,
  appToken: SLACK_APP_TOKEN,
  socketMode: true,
});

const http = axios.create({ timeout: 8000 });
const startedAt = Date.now();
const commandHelp = [];

const DATA_FILE = path.join(__dirname, "data.json");
const store = { scores: {}, standup: {}, github: {}, githubInit: false };
try {
  Object.assign(store, JSON.parse(fs.readFileSync(DATA_FILE, "utf8")));
} catch (_) {}
function save() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
  } catch (err) {
    console.error("Failed to save data.json:", err.message);
  }
}

function registerCommand(name, description, handler) {
  commandHelp.push({ name, description });
  app.command(name, async (args) => {
    try {
      await args.ack();
      await handler(args);
    } catch (err) {
      app.logger.error(`Error in ${name}:`, err);
      try {
        await args.respond({ text: `⚠️ Something went wrong running \`${name}\`. Try again in a moment.` });
      } catch (_) {}
    }
  });
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${sec}s`);
  return parts.join(" ");
}

function decodeEntities(str) {
  return String(str)
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&hellip;/g, "…")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

registerCommand("/papapa-ping", "Check that the bot is alive", async ({ respond }) => {
  await respond({ text: "🏓 Pong! Bot is alive and responding." });
});

registerCommand("/papapa-help", "Show this list of commands", async ({ respond }) => {
  const list = commandHelp.map((c) => `• \`${c.name}\` — ${c.description}`).join("\n");
  await respond({ text: `*Available commands:*\n${list}` });
});

registerCommand("/papapa-fact", "Get a random fun fact", async ({ respond }) => {
  const { data } = await http.get("https://uselessfacts.jsph.pl/api/v2/facts/random?language=en");
  await respond({ text: `💡 *Fun fact:*\n${data.text}` });
});

registerCommand("/papapa-weather", "Get weather for a city, e.g. Madrid", async ({ respond, command }) => {
  const city = (command.text || "").trim();
  if (!city) {
    await respond({ text: "🌤️ Tell me a city, e.g. `/papapa-weather Madrid`." });
    return;
  }
  const { data } = await http.get(`https://wttr.in/${encodeURIComponent(city)}?format=%l:+%c+%t+(feels+%f),+wind+%w,+humidity+%h`);
  await respond({ text: `🌤️ ${String(data).trim()}` });
});

registerCommand("/papapa-uptime", "Show how long the bot has been online", async ({ respond }) => {
  await respond({ text: `⏱️ Bot uptime: ${formatDuration(Date.now() - startedAt)}` });
});

registerCommand("/papapa-stats", "Show live server & bot stats", async ({ respond }) => {
  const totalMem = os.totalmem();
  const usedMem = totalMem - os.freemem();
  const usedPct = ((usedMem / totalMem) * 100).toFixed(1);
  const load = os.loadavg().map((n) => n.toFixed(2)).join(", ");
  const procMem = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
  const gib = (n) => (n / 1024 / 1024 / 1024).toFixed(2);
  await respond({
    blocks: [
      { type: "header", text: { type: "plain_text", text: "📊 Server & Bot Stats" } },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Host:*\n${os.hostname()}` },
          { type: "mrkdwn", text: `*Platform:*\n${os.platform()} (${os.arch()})` },
          { type: "mrkdwn", text: `*CPU cores:*\n${os.cpus().length}` },
          { type: "mrkdwn", text: `*Load avg (1/5/15m):*\n${load}` },
          { type: "mrkdwn", text: `*Memory:*\n${gib(usedMem)} / ${gib(totalMem)} GiB (${usedPct}%)` },
          { type: "mrkdwn", text: `*Bot RSS:*\n${procMem} MiB` },
          { type: "mrkdwn", text: `*Server uptime:*\n${formatDuration(os.uptime() * 1000)}` },
          { type: "mrkdwn", text: `*Bot uptime:*\n${formatDuration(Date.now() - startedAt)}` },
        ],
      },
    ],
    text: `Memory ${usedPct}% used, load ${load}`,
  });
});

registerCommand("/papapa-standup", "Submit your standup entry for today", async ({ respond, command }) => {
  const text = (command.text || "").trim();
  if (!text) {
    await respond({ text: "📝 Add your update, e.g. `/papapa-standup Yesterday I fixed X, today I work on Y, no blockers.`" });
    return;
  }
  store.standup[command.user_id] = { name: command.user_name || command.user_id, text };
  save();
  await respond({ text: "✅ Standup saved! It will be included in the next daily summary." });
});

async function postStandupSummary(client) {
  const channel = process.env.STANDUP_CHANNEL;
  if (!channel) return;
  const entries = Object.values(store.standup);
  const today = new Date().toISOString().slice(0, 10);
  if (!entries.length) {
    await client.chat.postMessage({ channel, text: `📋 *Daily standup — ${today}*\n_No standup entries were submitted._` });
  } else {
    const body = entries.map((e) => `• *${e.name}:* ${e.text}`).join("\n");
    await client.chat.postMessage({ channel, text: `📋 *Daily standup — ${today}*\n${body}` });
  }
  store.standup = {};
  save();
}

const TRIVIA_ID = "trivia_answer";
registerCommand("/papapa-trivia", "Play a trivia question (buttons)", async ({ respond }) => {
  const { data } = await http.get("https://opentdb.com/api.php?amount=1&type=multiple");
  const q = data.results && data.results[0];
  if (!q) {
    await respond({ text: "❓ Couldn't fetch a question right now. Try again." });
    return;
  }
  const question = decodeEntities(q.question);
  const correct = decodeEntities(q.correct_answer);
  const answers = shuffle([correct, ...q.incorrect_answers.map(decodeEntities)]);
  await respond({
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `🧠 *Trivia — ${decodeEntities(q.category)}*\n${question}` } },
      {
        type: "actions",
        elements: answers.map((a, i) => ({
          type: "button",
          text: { type: "plain_text", text: a.slice(0, 75) },
          value: JSON.stringify({ a, k: correct }).slice(0, 2000),
          action_id: `${TRIVIA_ID}_${i}`,
        })),
      },
    ],
    text: question,
  });
});

app.action(new RegExp(`^${TRIVIA_ID}_\\d+$`), async ({ ack, body, action, respond }) => {
  await ack();
  let payload;
  try {
    payload = JSON.parse(action.value);
  } catch (_) {
    return;
  }
  const correct = payload.a === payload.k;
  const userId = body.user.id;
  const name = body.user.name || body.user.username || userId;
  if (correct) {
    const entry = store.scores[userId] || { name, points: 0 };
    entry.name = name;
    entry.points += 1;
    store.scores[userId] = entry;
    save();
  }
  await respond({
    replace_original: true,
    text: `${correct ? "✅" : "❌"} <@${userId}> answered *${payload.a}*.\nCorrect answer: *${payload.k}*${correct ? "  (+1 point)" : ""}`,
  });
});

registerCommand("/papapa-scores", "Show the trivia leaderboard", async ({ respond }) => {
  const rows = Object.values(store.scores).sort((a, b) => b.points - a.points).slice(0, 10);
  if (!rows.length) {
    await respond({ text: "🏆 No scores yet. Play with `/papapa-trivia`!" });
    return;
  }
  const medals = ["🥇", "🥈", "🥉"];
  const board = rows.map((r, i) => `${medals[i] || `${i + 1}.`} *${r.name}* — ${r.points}`).join("\n");
  await respond({ text: `🏆 *Trivia leaderboard*\n${board}` });
});

const bannedWords = (process.env.BANNED_WORDS || "")
  .split(",")
  .map((w) => w.trim().toLowerCase())
  .filter(Boolean);

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

app.message(async ({ message, client }) => {
  if (!bannedWords.length) return;
  if (message.subtype || message.bot_id || !message.text) return;
  const lower = message.text.toLowerCase();
  const hit = bannedWords.find((w) => new RegExp(`\\b${escapeRegex(w)}\\b`).test(lower));
  if (!hit) return;
  try {
    await client.reactions.add({ channel: message.channel, timestamp: message.ts, name: "triangular_flag_on_post" });
  } catch (_) {}
  const modChannel = process.env.MOD_LOG_CHANNEL;
  if (modChannel) {
    let link = "";
    try {
      const perma = await client.chat.getPermalink({ channel: message.channel, message_ts: message.ts });
      link = perma.permalink ? `\n<${perma.permalink}|View message>` : "";
    } catch (_) {}
    await client.chat.postMessage({
      channel: modChannel,
      text: `🚩 Flagged message from <@${message.user}> in <#${message.channel}> (matched \`${hit}\`).${link}`,
    });
  }
});

async function pollGitHub(client) {
  const repo = process.env.GITHUB_REPO;
  const channel = process.env.GITHUB_CHANNEL;
  if (!repo || !channel) return;
  const headers = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const { data } = await http.get(`https://api.github.com/repos/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=10`, { headers });
  const firstRun = store.githubInit !== true;
  for (const pr of [...data].reverse()) {
    const key = String(pr.number);
    if (store.github[key] === pr.updated_at) continue;
    const wasKnown = Boolean(store.github[key]);
    store.github[key] = pr.updated_at;
    if (firstRun) continue;
    const state = pr.merged_at ? "merged 🟣" : pr.state === "closed" ? "closed 🔴" : wasKnown ? "updated 🟡" : "opened 🟢";
    await client.chat.postMessage({
      channel,
      text: `*PR #${pr.number}* ${state}\n<${pr.html_url}|${pr.title}> by ${pr.user.login}`,
    });
  }
  store.githubInit = true;
  save();
}

app.event("app_mention", async ({ event, say }) => {
  try {
    await say({
      text: `👋 Hi <@${event.user}>! Try \`/papapa-help\` to see what I can do.`,
      thread_ts: event.thread_ts || event.ts,
    });
  } catch (err) {
    app.logger.error("Error in app_mention:", err);
  }
});

app.error(async (error) => {
  app.logger.error("Unhandled Bolt error:", error);
});

(async () => {
  await app.start();
  console.log("⚡ papapa-bot is running!");

  if (process.env.STANDUP_CHANNEL) {
    const tz = process.env.STANDUP_TZ;
    cron.schedule(
      process.env.STANDUP_CRON || "0 9 * * *",
      () => postStandupSummary(app.client).catch((err) => app.logger.error("Standup error:", err)),
      tz ? { timezone: tz } : undefined,
    );
    console.log(`🗓️  Daily standup scheduled (${process.env.STANDUP_CRON || "0 9 * * *"}${tz ? ` ${tz}` : ""}).`);
  }

  if (process.env.GITHUB_REPO && process.env.GITHUB_CHANNEL) {
    const minutes = Math.max(1, parseInt(process.env.GITHUB_POLL_MINUTES || "5", 10));
    const run = () => pollGitHub(app.client).catch((err) => app.logger.error("GitHub poll error:", err));
    run();
    setInterval(run, minutes * 60 * 1000);
    console.log(`🐙 GitHub PR polling every ${minutes}m for ${process.env.GITHUB_REPO}.`);
  }

  if (bannedWords.length) console.log(`🛡️  Moderation active (${bannedWords.length} banned words).`);
})();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    console.log(`Received ${signal}, shutting down...`);
    try {
      await app.stop();
    } catch (_) {}
    process.exit(0);
  });
}
