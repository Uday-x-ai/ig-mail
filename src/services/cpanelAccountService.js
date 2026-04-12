const db = require("../data/db");
const { cpanel: legacyCpanel } = require("../config");

function normalize(value) {
  return String(value || "").trim();
}

function rowToAccount(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    username: row.username,
    apiToken: row.api_token,
    domain: row.domain,
    status: row.status,
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: "database",
  };
}

function getLegacyAccount() {
  if (!legacyCpanel.baseUrl || !legacyCpanel.username || !legacyCpanel.apiToken || !legacyCpanel.domain) {
    return null;
  }

  return {
    id: null,
    name: "Legacy config",
    baseUrl: legacyCpanel.baseUrl,
    username: legacyCpanel.username,
    apiToken: legacyCpanel.apiToken,
    domain: legacyCpanel.domain,
    status: "active",
    isDefault: true,
    createdAt: null,
    updatedAt: null,
    source: "env",
  };
}

function listCpanelAccounts() {
  const rows = db.prepare("SELECT * FROM cpanel_accounts ORDER BY is_default DESC, id ASC").all();
  const accounts = rows.map(rowToAccount).filter(Boolean);
  if (!accounts.length) {
    const legacy = getLegacyAccount();
    return legacy ? [legacy] : [];
  }
  return accounts;
}

function listEnabledCpanelAccounts() {
  const rows = db.prepare("SELECT * FROM cpanel_accounts WHERE status = 'active' ORDER BY is_default DESC, id ASC").all();
  const accounts = rows.map(rowToAccount).filter(Boolean);
  if (!accounts.length) {
    const legacy = getLegacyAccount();
    return legacy ? [legacy] : [];
  }
  return accounts;
}

function getCpanelAccountById(accountId) {
  if (accountId === null || accountId === undefined) {
    return getLegacyAccount();
  }

  const row = db.prepare("SELECT * FROM cpanel_accounts WHERE id = ?").get(accountId);
  return rowToAccount(row);
}

function getCpanelAccountForEmailRow(emailRow) {
  if (!emailRow) {
    return getLegacyAccount();
  }

  return getCpanelAccountById(emailRow.cpanel_account_id);
}

function getNextCpanelAccount() {
  const accounts = listEnabledCpanelAccounts();
  if (!accounts.length) {
    return null;
  }

  if (!getNextCpanelAccount._cursor) {
    getNextCpanelAccount._cursor = 0;
  }

  const account = accounts[getNextCpanelAccount._cursor % accounts.length];
  getNextCpanelAccount._cursor = (getNextCpanelAccount._cursor + 1) % accounts.length;
  return account;
}

function addCpanelAccount(input) {
  const name = normalize(input.name);
  const baseUrl = normalize(input.baseUrl);
  const username = normalize(input.username);
  const apiToken = normalize(input.apiToken);
  const domain = normalize(input.domain);

  if (!name || !baseUrl || !username || !apiToken || !domain) {
    throw new Error("All fields are required: name, baseUrl, username, apiToken, domain.");
  }

  const result = db.prepare(
    `INSERT INTO cpanel_accounts (name, base_url, username, api_token, domain, status, is_default)
     VALUES (?, ?, ?, ?, ?, 'active', ?)`
  ).run(name, baseUrl, username, apiToken, domain, input.isDefault ? 1 : 0);

  if (input.makeDefault) {
    setDefaultCpanelAccount(result.lastInsertRowid);
  }

  return getCpanelAccountById(result.lastInsertRowid);
}

function setDefaultCpanelAccount(accountId) {
  db.transaction(() => {
    db.prepare("UPDATE cpanel_accounts SET is_default = 0").run();
    db.prepare("UPDATE cpanel_accounts SET is_default = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(accountId);
  })();
}

function deleteCpanelAccount(accountId) {
  const account = getCpanelAccountById(accountId);
  if (!account || account.source !== "database") {
    throw new Error("CPanel account not found.");
  }

  db.prepare("DELETE FROM cpanel_accounts WHERE id = ?").run(accountId);
  return account;
}

module.exports = {
  addCpanelAccount,
  deleteCpanelAccount,
  getCpanelAccountById,
  getCpanelAccountForEmailRow,
  getLegacyAccount,
  getNextCpanelAccount,
  listCpanelAccounts,
  listEnabledCpanelAccounts,
  setDefaultCpanelAccount,
};
