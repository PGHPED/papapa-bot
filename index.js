require("dotenv").config();

const os = require("os");
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

registerCommand("/papapa-ping", "Check that the bot is alive", async ({ respond }) => {
  await respond({ text: "🏓 Pong! Bot is alive and responding." });
});

registerCommand("/papapa-help", "Show this list of commands", async ({ respond }) => {
  const list = commandHelp.map((c) => `• \`${c.name}\` — ${c.description}`).join("\n");
  await respond({ text: `*Available commands:*\n${list}` });
});

registerCommand("/papapa-catfact", "Get a random cat fact", async ({ respond }) => {
  const { data } = await http.get("https://catfact.ninja/fact");
  await respond({ text: `🐱 *Cat fact:*\n${data.fact}` });
});

registerCommand("/papapa-joke", "Get a random joke", async ({ respond }) => {
  const { data } = await http.get("https://official-joke-api.appspot.com/random_joke");
  await respond({ text: `😂 ${data.setup}\n\n*${data.punchline}*` });
});

const EIGHT_BALL = [
  "It is certain.",
  "Without a doubt.",
  "Yes, definitely.",
  "Ask again later.",
  "Cannot predict now.",
  "Don't count on it.",
  "My reply is no.",
  "Very doubtful.",
];
registerCommand("/papapa-8ball", "Ask the magic 8-ball a question", async ({ respond, command }) => {
  const question = (command.text || "").trim();
  if (!question) {
    await respond({ text: "🎱 Ask me a question, e.g. `/papapa-8ball Will I win?`" });
    return;
  }
  const answer = EIGHT_BALL[Math.floor(Math.random() * EIGHT_BALL.length)];
  await respond({ text: `🎱 *You asked:* ${question}\n*Answer:* ${answer}` });
});

registerCommand("/papapa-roll", "Roll dice, e.g. 2d6 (default 1d6)", async ({ respond, command }) => {
  const input = (command.text || "1d6").trim().toLowerCase();
  const match = input.match(/^(\d{1,3})?d(\d{1,4})$/);
  if (!match) {
    await respond({ text: "🎲 Use the format `NdM`, e.g. `/papapa-roll 2d6`." });
    return;
  }
  const count = Math.min(parseInt(match[1] || "1", 10), 100);
  const sides = Math.min(parseInt(match[2], 10), 1000);
  if (count < 1 || sides < 2) {
    await respond({ text: "🎲 Need at least 1 die with 2+ sides." });
    return;
  }
  const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
  const total = rolls.reduce((a, b) => a + b, 0);
  await respond({ text: `🎲 Rolled *${count}d${sides}*: ${rolls.join(", ")}\n*Total:* ${total}` });
});

registerCommand("/papapa-choose", "Pick one option, e.g. pizza, tacos, sushi", async ({ respond, command }) => {
  const options = (command.text || "").split(",").map((o) => o.trim()).filter(Boolean);
  if (options.length < 2) {
    await respond({ text: "🤔 Give me at least two options, e.g. `/papapa-choose pizza, tacos`." });
    return;
  }
  const pick = options[Math.floor(Math.random() * options.length)];
  await respond({ text: `🤔 I choose: *${pick}*` });
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
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
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
