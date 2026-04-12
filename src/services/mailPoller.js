const { pollIntervalMs } = require("../config");
const { listMailboxMessages } = require("./cpanelClient");
const { getLegacyAccount, getCpanelAccountById } = require("./cpanelAccountService");
const { getRecipientsForEmail, listActiveEmailRecords, saveReceivedMail } = require("./emailService");

function startMailPoller(bot) {
  let isRunning = false;

  setInterval(async () => {
    if (isRunning) {
      return;
    }
    isRunning = true;

    try {
      const activeEmails = listActiveEmailRecords();
      if (!activeEmails.length) {
        return;
      }

      const grouped = new Map();
      for (const row of activeEmails) {
        const key = row.cpanel_account_id ?? "legacy";
        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key).push(row.email);
      }

      for (const [accountKey, mailboxList] of grouped.entries()) {
        const account = accountKey === "legacy" ? getLegacyAccount() : getCpanelAccountById(accountKey);
        if (!account) {
          continue;
        }

        const messages = await listMailboxMessages(mailboxList, account);
        for (const msg of messages) {
          const recipients = getRecipientsForEmail(msg.to);
          if (!recipients.length) {
            continue;
          }

          const inserted = saveReceivedMail(msg.to, msg);
          if (!inserted) {
            continue;
          }

          const text = [
            "New email received",
            `To: ${msg.to}`,
            `From: ${msg.from || "unknown"}`,
            `Subject: ${msg.subject || "(no subject)"}`,
            "",
            msg.body || "(empty body)",
          ].join("\n");

          for (const chatId of recipients) {
            await bot.sendMessage(chatId, text);
          }
        }
      }
    } catch (err) {
      console.error("Mail poller error:", err.message);
    } finally {
      isRunning = false;
    }
  }, pollIntervalMs);
}

module.exports = {
  startMailPoller,
};
