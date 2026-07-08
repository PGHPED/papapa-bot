// papapa-bot — Slack bot (Bolt + Socket Mode) running on Hack Club Nest

require("dotenv").config();

const { App } = require("@slack/bolt");
const axios = require("axios");

// --- Startup safety: fail loud if tokens are missing ---------------------
const { SLACK_BOT_TOKEN, SLACK_APP_TOKEN } = process.env;
if (!SLACK_BOT_TOKEN || !SLACK_APP_TOKEN) {
  console.error(
    "Missing SLACK_BOT_TOKEN and/or SLACK_APP_TOKEN. Check your .env file.",
  );
  process.exit(1);
}

const app = new App({
  token: SLACK_BOT_TOKEN,
  appToken: SLACK_APP_TOKEN,
  socketMode: true,
});

// Small shared HTTP client with a timeout so a slow API can't hang a command.
const http = axios.create({ timeout: 8000 });

// A registry so /papapa-help stays in sync automatically as commands grow.
const commandHelp = [];

/**
 * Register a slash command and record it for the help listing.
 * The handler always ack()s first (Slack requires a response within 3s).
 */
function registerCommand(name, description, handler) {
  commandHelp.push({ name, description });
  app.command(name, async (args) => {
    try {
      await args.ack();
      await handler(args);
    } catch (err) {
      app.logger.error(`Error in ${name}:`, err);
      try {
        await args.respond({
          text: `⚠️ Something went wrong running \`${name}\`. Try again in a moment.`,
        });
      } catch (_) {
        /* respond can fail if the trigger expired; nothing more to do. */
      }
    }
  });
}

// --- Commands ------------------------------------------------------------

// Ping — round-trip latency
registerCommand(
  "/papapa-ping",
  "Check that the bot is alive",
  async ({ respond }) => {
    await respond({ text: "🏓 Pong! Bot is alive and responding." });
  },
);

// Help — auto-generated from the registry
registerCommand(
  "/papapa-help",
  "Show this list of commands",
  async ({ respond }) => {
    const list = commandHelp
      .map((c) => `• \`${c.name}\` — ${c.description}`)
      .join("\n");
    await respond({ text: `*Available commands:*\n${list}` });
  },
);

// Cat fact
registerCommand(
  "/papapa-catfact",
  "Get a random cat fact",
  async ({ respond }) => {
    const { data } = await http.get("https://catfact.ninja/fact");
    await respond({ text: `🐱 *Cat fact:*\n${data.fact}` });
  },
);

// Joke
registerCommand("/papapa-joke", "Get a random joke", async ({ respond }) => {
  const { data } = await http.get(
    "https://official-joke-api.appspot.com/random_joke",
  );
  await respond({ text: `😂 ${data.setup}\n\n*${data.punchline}*` });
});

// Magic 8-ball — fun, no external API. Uses the text after the command.
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
registerCommand(
  "/papapa-8ball",
  "Ask the magic 8-ball a question",
  async ({ respond, command }) => {
    const question = (command.text || "").trim();
    if (!question) {
      await respond({
        text: "🎱 Ask me a question, e.g. `/papapa-8ball Will I win?`",
      });
      return;
    }
    const answer = EIGHT_BALL[Math.floor(Math.random() * EIGHT_BALL.length)];
    await respond({ text: `🎱 *You asked:* ${question}\n*Answer:* ${answer}` });
  },
);

// Uptime — how long the bot process has been running
const startedAt = Date.now();
registerCommand(
  "/papapa-uptime",
  "Show how long the bot has been online",
  async ({ respond }) => {
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    await respond({ text: `⏱️ Uptime: ${h}h ${m}m ${s}s` });
  },
);

// --- Respond when someone @mentions the bot ------------------------------
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

// --- Global error handler ------------------------------------------------
app.error(async (error) => {
  app.logger.error("Unhandled Bolt error:", error);
});

// --- Start ---------------------------------------------------------------
(async () => {
  await app.start();
  console.log("⚡ papapa-bot is running!");
})();

// Graceful shutdown so systemd restarts are clean.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    console.log(`Received ${signal}, shutting down...`);
    try {
      await app.stop();
    } catch (_) {
      /* ignore */
    }
    process.exit(0);
  });
}
