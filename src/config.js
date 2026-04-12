const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

function toInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
}

const adminIds = (process.env.ADMIN_TELEGRAM_IDS || "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean)
  .map((v) => Number(v));

module.exports = {
  botToken: process.env.BOT_TOKEN || "",
  web: {
    baseUrl: process.env.WEB_APP_BASE_URL || "",
    port: toInt(process.env.WEB_PORT, 3000),
    secret: process.env.WEB_APP_SECRET || process.env.BOT_TOKEN || "",
  },
  dbPath: path.resolve(process.cwd(), process.env.DB_PATH || "./data/tempmail.db"),
  requiredChannel: process.env.REQUIRED_CHANNEL || "",
  requiredChannelLink: process.env.REQUIRED_CHANNEL_LINK || "",
  paytm: {
    enabled: (process.env.PAYTM_DEPOSIT_ENABLED || "false").toLowerCase() === "true",
    mid: process.env.PAYTM_MID || process.env.MID || "",
    verifyBaseUrl: process.env.PAYTM_VERIFY_BASE_URL || "",
    upiPa: process.env.PAYTM_UPI_PA || "",
    upiPn: process.env.PAYTM_UPI_PN || "Paytm",
    timeoutSeconds: toInt(process.env.PAYTM_TIMEOUT_SECONDS, 300),
    pollMs: toInt(process.env.PAYTM_POLL_MS, 5000),
  },
  cpanel: {
    baseUrl: process.env.CPANEL_BASE_URL || "",
    username: process.env.CPANEL_USERNAME || "",
    apiToken: process.env.CPANEL_API_TOKEN || "",
    domain: process.env.CPANEL_DOMAIN || "",
    strictMode: (process.env.CPANEL_STRICT_MODE || "true").toLowerCase() === "true",
  },
  economy: {
    dailyRedeemPoints: toInt(process.env.DAILY_REDEEM_POINTS, 2),
    referralRewardPoints: toInt(process.env.REFERRAL_REWARD_POINTS, 3),
    generateCost: toInt(process.env.GENERATE_COST, 1),
  },
  pollIntervalMs: toInt(process.env.POLL_INTERVAL_MS, 30000),
  adminIds,
};
