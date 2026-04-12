const crypto = require("crypto");
const db = require("../data/db");

function randomCode(bytes = 5) {
  return crypto.randomBytes(bytes).toString("hex");
}

function ensureUser(telegramId) {
  let user = db.prepare("SELECT * FROM users WHERE telegram_id = ?").get(telegramId);
  if (!user) {
    const privateKey = randomCode(16);
    const referralCode = randomCode(4);
    db.prepare(
      "INSERT INTO users (telegram_id, private_key, referral_code) VALUES (?, ?, ?)"
    ).run(telegramId, privateKey, referralCode);
    user = db.prepare("SELECT * FROM users WHERE telegram_id = ?").get(telegramId);
  }
  return user;
}

function getUserByTelegramId(telegramId) {
  return db.prepare("SELECT * FROM users WHERE telegram_id = ?").get(telegramId);
}

function getUserById(userId) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
}

function getUserByPrivateKey(privateKey) {
  return db.prepare("SELECT * FROM users WHERE private_key = ?").get(privateKey);
}

function getUserByReferralCode(code) {
  return db.prepare("SELECT * FROM users WHERE referral_code = ?").get(code);
}

function setReferredBy(userId, referrerId) {
  db.prepare("UPDATE users SET referred_by = ? WHERE id = ? AND referred_by IS NULL").run(referrerId, userId);
}

function updateLastRedeem(userId, isoTime) {
  db.prepare("UPDATE users SET last_redeem_at = ? WHERE id = ?").run(isoTime, userId);
}

function addBalance(userId, amount, type, description) {
  const tx = db.transaction(() => {
    db.prepare("UPDATE users SET balance = balance + ? WHERE id = ?").run(amount, userId);
    db.prepare(
      "INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)"
    ).run(userId, type, amount, description || null);
  });
  tx();
}

function getReferralStats(userId) {
  const totalReferrals = db.prepare("SELECT COUNT(*) AS count FROM users WHERE referred_by = ?").get(userId).count;
  const earnings = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE user_id = ? AND type = 'referral_reward'")
    .get(userId).total;
  return { totalReferrals, earnings };
}

function importAccount(fromTelegramId, privateKey) {
  const source = getUserByPrivateKey(privateKey);
  if (!source) {
    throw new Error("Invalid private key.");
  }

  const current = ensureUser(fromTelegramId);
  if (current.id === source.id) {
    return source;
  }

  const tx = db.transaction(() => {
    db.prepare("UPDATE emails SET owner_id = ? WHERE owner_id = ?").run(current.id, source.id);
    db.prepare("UPDATE users SET balance = balance + ? WHERE id = ?").run(source.balance, current.id);
    db.prepare("UPDATE users SET balance = 0 WHERE id = ?").run(source.id);
    db.prepare("DELETE FROM shared_access WHERE user_id = ?").run(source.id);
  });

  tx();
  return ensureUser(fromTelegramId);
}

module.exports = {
  ensureUser,
  getUserByTelegramId,
  getUserById,
  getUserByPrivateKey,
  getUserByReferralCode,
  setReferredBy,
  updateLastRedeem,
  addBalance,
  getReferralStats,
  importAccount,
};
