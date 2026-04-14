const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { dbPath } = require("../config");

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id   INTEGER UNIQUE NOT NULL,
    private_key   TEXT    NOT NULL,
    referral_code TEXT    NOT NULL,
    balance       INTEGER NOT NULL DEFAULT 0,
    last_redeem_at TEXT,
    referred_by   INTEGER REFERENCES users(id),
    created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cpanel_accounts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    base_url   TEXT NOT NULL,
    username   TEXT NOT NULL,
    api_token  TEXT NOT NULL,
    domain     TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'active',
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS emails (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    email             TEXT UNIQUE NOT NULL,
    owner_id          INTEGER REFERENCES users(id),
    status            TEXT NOT NULL DEFAULT 'active',
    cpanel_account_id INTEGER REFERENCES cpanel_accounts(id),
    created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS received_mails (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    email_id     INTEGER NOT NULL REFERENCES emails(id),
    external_id  TEXT    NOT NULL,
    from_address TEXT,
    subject      TEXT,
    body         TEXT,
    received_at  TEXT,
    created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(email_id, external_id)
  );

  CREATE TABLE IF NOT EXISTS shared_access (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    email_id INTEGER NOT NULL REFERENCES emails(id),
    user_id  INTEGER NOT NULL REFERENCES users(id),
    UNIQUE(email_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    type        TEXT    NOT NULL,
    amount      INTEGER NOT NULL,
    description TEXT,
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS command_usage (
    command      TEXT PRIMARY KEY,
    total_count  INTEGER NOT NULL DEFAULT 0,
    last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

module.exports = db;
