const crypto = require("crypto");
const db = require("../data/db");
const { economy, cpanel } = require("../config");
const { createEmailAccount, deleteEmailAccount } = require("./cpanelClient");
const { getCpanelAccountById, getNextCpanelAccount, getCpanelAccountForEmailRow } = require("./cpanelAccountService");

const generateCooldownByUser = new Map();

function normalizeEmailAddress(emailAddress) {
  return String(emailAddress || "").trim().toLowerCase();
}

function decodeQuotedPrintable(input) {
  return String(input || "")
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-F]{2})/gi, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function htmlToText(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractMultipartText(body) {
  const raw = String(body || "");
  const boundaryMatch = raw.match(/(?:^|\n)--([A-Za-z0-9'()+_.,\/:?= -]{8,})/);
  if (!boundaryMatch) {
    return raw;
  }

  const boundary = boundaryMatch[1].trim();
  const segments = raw.split(`--${boundary}`);
  let htmlFallback = "";

  for (const segment of segments) {
    const part = segment.trim();
    if (!part || part === "--") {
      continue;
    }

    const splitIndex = part.search(/\r?\n\r?\n/);
    if (splitIndex < 0) {
      continue;
    }

    const headerText = part.slice(0, splitIndex).toLowerCase();
    const payload = part.slice(splitIndex).replace(/^\r?\n\r?\n/, "");

    const isPlain = headerText.includes("content-type: text/plain");
    const isHtml = headerText.includes("content-type: text/html");
    const isBase64 = headerText.includes("content-transfer-encoding: base64");
    const isQuoted = headerText.includes("content-transfer-encoding: quoted-printable");

    let decoded = payload;
    if (isBase64) {
      try {
        decoded = Buffer.from(payload.replace(/\s+/g, ""), "base64").toString("utf8");
      } catch (err) {
        decoded = payload;
      }
    } else if (isQuoted) {
      decoded = Buffer.from(decodeQuotedPrintable(payload), "binary").toString("utf8");
    }

    if (isPlain && decoded.trim()) {
      return decoded.trim();
    }

    if (isHtml && decoded.trim() && !htmlFallback) {
      htmlFallback = htmlToText(decoded);
    }
  }

  return htmlFallback || raw;
}

function randomLocalPart() {
  return `tmp${crypto.randomBytes(4).toString("hex")}`;
}

function canGenerateNow(userId) {
  const now = Date.now();
  const last = generateCooldownByUser.get(userId) || 0;
  if (now - last < 5000) {
    return false;
  }
  generateCooldownByUser.set(userId, now);
  return true;
}

async function generateEmailForUser(user) {
  if (!canGenerateNow(user.id)) {
    throw new Error("Too many requests. Please wait a few seconds.");
  }

  if (user.balance < economy.generateCost) {
    throw new Error("Insufficient points. Use /redeem or /addbal.");
  }

  const cpanelAccount = getNextCpanelAccount();
  if (!cpanelAccount) {
    throw new Error("No cPanel account configured. Ask admin to add one in /panel.");
  }

  const localPart = randomLocalPart();
  const randomPassword = crypto.randomBytes(12).toString("base64url");
  const fullEmail = cpanelAccount.domain ? `${localPart}@${cpanelAccount.domain}` : `${localPart}@example.com`;

  try {
    await createEmailAccount(localPart, randomPassword, cpanelAccount);
  } catch (err) {
    if (!cpanelAccount.strictMode && !cpanel.strictMode) {
      console.warn("cPanel create failed; continuing due to CPANEL_STRICT_MODE=false:", err.message);
    } else {
      throw new Error(`Email creation failed: ${err.message}`);
    }
  }

  const tx = db.transaction(() => {
    db.prepare(
      "INSERT INTO emails (email, owner_id, status, cpanel_account_id) VALUES (?, ?, 'active', ?)"
    ).run(fullEmail, user.id, cpanelAccount.id ?? null);
    db.prepare("UPDATE users SET balance = balance - ? WHERE id = ?").run(economy.generateCost, user.id);
    db.prepare(
      "INSERT INTO transactions (user_id, type, amount, description) VALUES (?, 'email_generate', ?, ?)"
    ).run(user.id, -economy.generateCost, `Generated ${fullEmail}`);
  });
  tx();

  return fullEmail;
}

function listOwnedEmails(userId) {
  return db
    .prepare("SELECT id, email, status, created_at FROM emails WHERE owner_id = ? ORDER BY id ASC")
    .all(userId);
}

function listAccessibleEmails(userId) {
  return db
    .prepare(
      `SELECT e.id, e.email, e.status, e.created_at,
              CASE WHEN e.owner_id = ? THEN 'owner' ELSE 'shared' END AS access_type
       FROM emails e
       LEFT JOIN shared_access sa ON sa.email_id = e.id AND sa.user_id = ?
       WHERE e.status = 'active' AND (e.owner_id = ? OR sa.user_id = ?)
       ORDER BY e.id DESC`
    )
    .all(userId, userId, userId, userId);
}

function getEmailByAddress(email) {
  return db.prepare("SELECT * FROM emails WHERE email = ?").get(normalizeEmailAddress(email));
}

function listActiveEmailAddresses() {
  return db
    .prepare("SELECT email FROM emails WHERE status = 'active' ORDER BY id ASC")
    .all()
    .map((row) => row.email);
}

function listActiveEmailRecords() {
  return db
    .prepare("SELECT email, cpanel_account_id FROM emails WHERE status = 'active' ORDER BY id ASC")
    .all();
}

function getAccessibleEmailForUser(emailAddress, userId) {
  const email = getEmailByAddress(emailAddress);
  if (!email || email.status !== "active") {
    return null;
  }

  if (email.owner_id === userId) {
    return email;
  }

  const shared = db
    .prepare("SELECT id FROM shared_access WHERE email_id = ? AND user_id = ?")
    .get(email.id, userId);

  return shared ? email : null;
}

function buildExternalId(message) {
  if (message?.messageId) {
    return String(message.messageId);
  }

  const raw = [
    message?.to || "",
    message?.from || "",
    message?.subject || "",
    message?.date || "",
    message?.body || "",
  ].join("|");

  return crypto.createHash("sha256").update(raw).digest("hex");
}

function saveReceivedMail(emailAddress, message) {
  const normalizedEmail = normalizeEmailAddress(emailAddress);
  const email = getEmailByAddress(normalizedEmail);
  if (!email || email.status !== "active") {
    return false;
  }

  const externalId = buildExternalId(message);
  const result = db.prepare(
    `INSERT OR IGNORE INTO received_mails
     (email_id, external_id, from_address, subject, body, received_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    email.id,
    externalId,
    message?.from || null,
    message?.subject || null,
    message?.body || null,
    message?.date || null
  );

  return result.changes > 0;
}

function getReceivedMailsForUser(emailAddress, userId, limit = 10) {
  const email = getAccessibleEmailForUser(normalizeEmailAddress(emailAddress), userId);
  if (!email) {
    throw new Error("Email not found or you do not have access.");
  }

  const rows = db
    .prepare(
      `SELECT from_address, subject, body, received_at, created_at
       FROM received_mails
       WHERE email_id = ?
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(email.id, limit);

  return rows.map((row) => ({
    ...row,
    body: extractMultipartText(row.body),
  }));
}

function transferEmail(emailAddress, fromUserId, toUserId) {
  const email = getEmailByAddress(normalizeEmailAddress(emailAddress));
  if (!email || email.status !== "active") {
    throw new Error("Email not found or not active.");
  }
  if (email.owner_id !== fromUserId) {
    throw new Error("You are not the owner of this email.");
  }

  db.prepare("UPDATE emails SET owner_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(toUserId, email.id);
  db.prepare("DELETE FROM shared_access WHERE email_id = ?").run(email.id);
}

function transferByIndex(fromUserId, index, toUserId) {
  const rows = listOwnedEmails(fromUserId).filter((r) => r.status === "active");
  const row = rows[index - 1];
  if (!row) {
    throw new Error("Invalid email index.");
  }
  transferEmail(row.email, fromUserId, toUserId);
  return row.email;
}

async function deleteEmail(emailAddress, userId) {
  const email = getEmailByAddress(normalizeEmailAddress(emailAddress));
  if (!email || email.status !== "active") {
    throw new Error("Email not found or already deleted.");
  }
  if (email.owner_id !== userId) {
    throw new Error("You are not the owner of this email.");
  }

  try {
    const cpanelAccount = getCpanelAccountForEmailRow(email) || getCpanelAccountById(null);
    await deleteEmailAccount(emailAddress, cpanelAccount);
  } catch (err) {
    const cpanelAccount = getCpanelAccountForEmailRow(email);
    if (!cpanelAccount?.strictMode && !cpanel.strictMode) {
      console.warn("cPanel delete failed; continuing due to CPANEL_STRICT_MODE=false:", err.message);
    } else {
      throw new Error(`Email delete failed: ${err.message}`);
    }
  }

  db.prepare(
    "UPDATE emails SET status = 'deleted', owner_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(email.id);
  db.prepare("DELETE FROM shared_access WHERE email_id = ?").run(email.id);
}

function acceptDeletedEmail(emailAddress, userId) {
  const email = getEmailByAddress(normalizeEmailAddress(emailAddress));
  if (!email || email.status !== "deleted") {
    throw new Error("Email is not available for reclaim.");
  }

  db.prepare(
    "UPDATE emails SET status = 'active', owner_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(userId, email.id);
}

function shareEmail(emailAddress, ownerId, targetUserId) {
  const email = getEmailByAddress(normalizeEmailAddress(emailAddress));
  if (!email || email.status !== "active") {
    throw new Error("Email not found or inactive.");
  }
  if (email.owner_id !== ownerId) {
    throw new Error("Only owner can share this email.");
  }

  db.prepare("INSERT OR IGNORE INTO shared_access (email_id, user_id) VALUES (?, ?)").run(email.id, targetUserId);
}

function stopShareEmail(emailAddress, ownerId) {
  const email = getEmailByAddress(normalizeEmailAddress(emailAddress));
  if (!email) {
    throw new Error("Email not found.");
  }
  if (email.owner_id !== ownerId) {
    throw new Error("Only owner can stop share access.");
  }

  db.prepare("DELETE FROM shared_access WHERE email_id = ?").run(email.id);
}

function getRecipientsForEmail(emailAddress) {
  const email = getEmailByAddress(normalizeEmailAddress(emailAddress));
  if (!email || email.status !== "active") {
    return [];
  }

  const owner = db.prepare("SELECT telegram_id FROM users WHERE id = ?").get(email.owner_id);
  const shared = db
    .prepare(
      `SELECT u.telegram_id
       FROM shared_access sa
       JOIN users u ON u.id = sa.user_id
       WHERE sa.email_id = ?`
    )
    .all(email.id);

  const recipients = [];
  if (owner?.telegram_id) {
    recipients.push(owner.telegram_id);
  }
  for (const row of shared) {
    recipients.push(row.telegram_id);
  }
  return [...new Set(recipients)];
}

module.exports = {
  generateEmailForUser,
  listOwnedEmails,
  listAccessibleEmails,
  listActiveEmailAddresses,
  listActiveEmailRecords,
  saveReceivedMail,
  getReceivedMailsForUser,
  transferEmail,
  transferByIndex,
  deleteEmail,
  acceptDeletedEmail,
  shareEmail,
  stopShareEmail,
  getRecipientsForEmail,
};
