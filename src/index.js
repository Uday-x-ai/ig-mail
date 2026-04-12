const TelegramBot = require("node-telegram-bot-api");
const { botToken } = require("./config");
require("./data/db");
const { registerCommandHandlers } = require("./bot/commands");
const { startMailPoller } = require("./services/mailPoller");
const { createWebServer } = require("./web/server");

if (!botToken) {
  throw new Error("BOT_TOKEN is missing in environment variables.");
}

const bot = new TelegramBot(botToken, { polling: true });

bot.setMyCommands([
  { command: "start", description: "Start the bot" },
  { command: "help", description: "Show command help" },
  { command: "mybal", description: "Check points balance" },
  { command: "deposit", description: "Add points using Paytm" },
  { command: "addbal", description: "Add points (admin only)" },
  { command: "redeem", description: "Claim daily free points" },
  { command: "generate", description: "Create a temporary email" },
  { command: "id", description: "List your emails" },
  { command: "mail", description: "View inbox for one email" },
  { command: "mails", description: "View inbox for one email" },
  { command: "webmail", description: "Open the web inbox" },
  { command: "delete", description: "Delete owned email" },
  { command: "accept", description: "Reclaim a deleted email" },
  { command: "transfer", description: "Transfer ownership" },
  { command: "transfermailbynumber", description: "Transfer by list number" },
  { command: "bulktransfer", description: "Start multi-transfer mode" },
  { command: "share", description: "Share read access" },
  { command: "stopshare", description: "Remove sharing access" },
  { command: "myprivatekey", description: "Show private key" },
  { command: "import", description: "Recover account" },
  { command: "viewreferral", description: "Show referral stats" },
  { command: "uses", description: "Command usage stats" },
  { command: "shop", description: "View shop options" },
  { command: "panel", description: "Admin cPanel account manager" },
  { command: "cancel", description: "Cancel active flow" },
]).catch((err) => {
  console.warn("Failed to register bot commands:", err.message);
});

registerCommandHandlers(bot);
startMailPoller(bot);
createWebServer().start();

console.log("TempMail bot is running.");
