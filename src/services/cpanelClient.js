const axios = require("axios");
const { cpanel } = require("../config");

function normalizeAccount(account) {
  const source = account || cpanel;
  return {
    baseUrl: source.baseUrl || "",
    username: source.username || "",
    apiToken: source.apiToken || "",
    domain: source.domain || "",
    status: source.status || "active",
    strictMode: typeof source.strictMode === "boolean" ? source.strictMode : cpanel.strictMode,
    id: source.id ?? null,
    source: source.source || (account ? "database" : "env"),
  };
}

function ensureConfigured(account) {
  const resolved = normalizeAccount(account);
  if (!resolved.baseUrl || !resolved.username || !resolved.apiToken || !resolved.domain) {
    throw new Error("cPanel is not fully configured in environment variables.");
  }

  return resolved;
}

function client(account) {
  const resolved = ensureConfigured(account);
  return axios.create({
    baseURL: resolved.baseUrl.replace(/\/+$/, ""),
    headers: {
      Authorization: `cpanel ${resolved.username}:${resolved.apiToken}`,
      Accept: "application/json",
      "User-Agent": "TempMailBot/0.1",
    },
    timeout: 15000,
  });
}

function formatCpanelError(operation, err) {
  const status = err?.response?.status;
  const body = err?.response?.data;
  const bodyText =
    typeof body === "string"
      ? body
      : body?.errors?.join("; ") || body?.error || body?.message || "";

  if (status === 403) {
    return `${operation} failed (403 Access denied). Check CPANEL_BASE_URL (port 2083), API token permissions, and server firewall/IP allowlist.`;
  }

  if (status) {
    return `${operation} failed (${status})${bodyText ? `: ${bodyText}` : ""}`;
  }

  return `${operation} failed: ${err.message}`;
}

async function createEmailAccount(localPart, password, account) {
  const resolved = ensureConfigured(account);
  const http = client(resolved);
  let response;
  try {
    response = await http.get("/execute/Email/add_pop", {
      params: {
        email: localPart,
        domain: resolved.domain,
        password,
        quota: 100,
      },
    });
  } catch (err) {
    throw new Error(formatCpanelError("Create email", err));
  }

  if (!response.data?.status) {
    throw new Error(response.data?.errors?.join("; ") || "Create email failed");
  }

  return `${localPart}@${resolved.domain}`;
}

async function deleteEmailAccount(fullEmail, account) {
  const [localPart, domain] = fullEmail.split("@");
  const resolved = ensureConfigured(account);
  const http = client(resolved);
  let response;
  try {
    response = await http.get("/execute/Email/delete_pop", {
      params: {
        email: localPart,
        domain,
      },
    });
  } catch (err) {
    throw new Error(formatCpanelError("Delete email", err));
  }

  if (!response.data?.status) {
    throw new Error(response.data?.errors?.join("; ") || "Delete email failed");
  }
}

async function createForwarder(fullEmail, forwardToAddress, account) {
  const [localPart, domain] = fullEmail.split("@");
  const [destLocalPart, destDomain] = forwardToAddress.split("@");
  const resolved = ensureConfigured(account);
  const http = client(resolved);
  let response;
  try {
    response = await http.get("/execute/Email/add_forwarder", {
      params: {
        domain,
        email: localPart,
        fwdopt: "fwd",
        fwdemail: `${destLocalPart}@${destDomain}`,
      },
    });
  } catch (err) {
    throw new Error(formatCpanelError("Create forwarder", err));
  }

  if (!response.data?.status) {
    throw new Error(response.data?.errors?.join("; ") || "Create forwarder failed");
  }
}

function normalizeEmailAddress(emailAddress) {
  return String(emailAddress || "").trim().toLowerCase();
}

function extractAddress(value) {
  if (!value) {
    return "";
  }

  const match = String(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return normalizeEmailAddress(match ? match[0] : value);
}

function decodeMimeWord(value) {
  if (!value || !value.includes("=?")) {
    return value;
  }

  return value.replace(/=\?([^?]+)\?([bqBQ])\?([^?]+)\?=/g, (_, charset, encoding, text) => {
    try {
      if (encoding.toUpperCase() === "B") {
        return Buffer.from(text, "base64").toString("utf8");
      }

      const qp = text
        .replace(/_/g, " ")
        .replace(/=([0-9A-F]{2})/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16)));
      return Buffer.from(qp, "binary").toString("utf8");
    } catch (err) {
      return text;
    }
  });
}

function parseHeaderBlock(headerText) {
  const headers = {};
  let current = "";

  for (const line of String(headerText || "").split(/\r?\n/)) {
    if (!line) {
      continue;
    }

    if (/^[ \t]/.test(line) && current) {
      headers[current] = `${headers[current]} ${line.trim()}`;
      continue;
    }

    const idx = line.indexOf(":");
    if (idx <= 0) {
      continue;
    }

    current = line.slice(0, idx).trim().toLowerCase();
    headers[current] = line.slice(idx + 1).trim();
  }

  return headers;
}

function parseContentType(contentType) {
  const raw = String(contentType || "text/plain");
  const parts = raw.split(";").map((item) => item.trim()).filter(Boolean);
  const type = (parts[0] || "text/plain").toLowerCase();
  const params = {};

  for (const param of parts.slice(1)) {
    const eq = param.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = param.slice(0, eq).trim().toLowerCase();
    const value = param.slice(eq + 1).trim().replace(/^"|"$/g, "");
    params[key] = value;
  }

  return { type, params };
}

function decodeQuotedPrintable(input) {
  return String(input || "")
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-F]{2})/gi, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function decodeTransferEncoding(content, encoding) {
  const mode = String(encoding || "").trim().toLowerCase();
  const raw = String(content || "");

  try {
    if (mode === "base64") {
      return Buffer.from(raw.replace(/\s+/g, ""), "base64").toString("utf8");
    }
    if (mode === "quoted-printable") {
      return Buffer.from(decodeQuotedPrintable(raw), "binary").toString("utf8");
    }
  } catch (err) {
    return raw;
  }

  return raw;
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

function splitHeaderAndBody(rawPart) {
  const splitIndex = rawPart.search(/\r?\n\r?\n/);
  const headerText = splitIndex >= 0 ? rawPart.slice(0, splitIndex) : "";
  const bodyText = splitIndex >= 0 ? rawPart.slice(splitIndex).replace(/^\r?\n\r?\n/, "") : rawPart;
  return { headerText, bodyText };
}

function parseMultipartParts(bodyText, boundary) {
  const delimiter = `--${boundary}`;
  const chunks = String(bodyText || "").split(delimiter);
  const parts = [];

  for (const chunk of chunks) {
    let item = chunk.trim();
    if (!item || item === "--") {
      continue;
    }
    if (item.endsWith("--")) {
      item = item.slice(0, -2).trim();
    }
    if (!item) {
      continue;
    }

    const { headerText, bodyText: content } = splitHeaderAndBody(item);
    const headers = parseHeaderBlock(headerText);
    parts.push({ headers, content });
  }

  return parts;
}

function extractBodyFromPart(headers, content) {
  const parsedType = parseContentType(headers["content-type"] || "text/plain");
  const transferEncoding = headers["content-transfer-encoding"] || "";

  if (parsedType.type.startsWith("multipart/") && parsedType.params.boundary) {
    const nested = parseMultipartParts(content, parsedType.params.boundary);
    let firstHtml = "";
    for (const part of nested) {
      const extracted = extractBodyFromPart(part.headers, part.content);
      if (extracted.plain) {
        return extracted;
      }
      if (!firstHtml && extracted.html) {
        firstHtml = extracted.html;
      }
    }
    return { plain: "", html: firstHtml };
  }

  const decoded = decodeTransferEncoding(content, transferEncoding).trim();

  if (parsedType.type === "text/plain") {
    return { plain: decoded, html: "" };
  }

  if (parsedType.type === "text/html") {
    return { plain: "", html: htmlToText(decoded) };
  }

  return { plain: "", html: "" };
}

function parseRawEmail(rawContent) {
  const raw = String(rawContent || "");
  const { headerText, bodyText } = splitHeaderAndBody(raw);
  const headers = parseHeaderBlock(headerText);

  const deliveredTo = extractAddress(headers["delivered-to"] || headers["envelope-to"] || headers.to);
  const from = decodeMimeWord(headers.from || "");
  const subject = decodeMimeWord(headers.subject || "");
  const date = headers.date || null;
  const messageId = headers["message-id"] || null;
  const bodyResult = extractBodyFromPart(headers, bodyText);
  const body = (bodyResult.plain || bodyResult.html || bodyText || "").trim();

  return {
    to: deliveredTo,
    from,
    subject,
    date,
    messageId,
    body,
  };
}

async function callCpanel(http, path, params) {
  const response = await http.get(path, { params });
  if (!response.data?.status) {
    const reason = response.data?.errors?.join("; ") || `${path} failed`;
    throw new Error(reason);
  }
  return response.data;
}

async function listMailboxMessages(mailboxes = [], account) {
  const resolved = ensureConfigured(account);
  if (!resolved.baseUrl || !resolved.username || !resolved.apiToken) {
    return [];
  }

  const http = client(resolved);
  const messages = [];
  const uniqueMailboxes = [...new Set((mailboxes || []).map(normalizeEmailAddress).filter(Boolean))];

  for (const fullEmail of uniqueMailboxes) {
    const [localPart, domain] = fullEmail.split("@");
    if (!localPart || !domain) {
      continue;
    }

    const inboxDirs = [
      `mail/${domain}/${localPart}/new`,
      `mail/${domain}/${localPart}/cur`,
    ];

    for (const dir of inboxDirs) {
      let files = [];
      try {
        const listData = await callCpanel(http, "/execute/Fileman/list_files", {
          dir,
          types: "file",
          show_hidden: 0,
        });
        files = (listData.data || []).map((item) => item.file).filter(Boolean);
      } catch (err) {
        continue;
      }

      for (const file of files) {
        try {
          const fileData = await callCpanel(http, "/execute/Fileman/get_file_content", {
            dir,
            file,
          });
          const parsed = parseRawEmail(fileData.data?.content || "");
          const toAddress = parsed.to || fullEmail;
          messages.push({
            to: toAddress,
            from: parsed.from,
            subject: parsed.subject,
            body: parsed.body,
            date: parsed.date,
            messageId: parsed.messageId || `${toAddress}:${file}`,
          });
        } catch (err) {
          continue;
        }
      }
    }
  }

  return messages;
}

module.exports = {
  createEmailAccount,
  deleteEmailAccount,
  createForwarder,
  listMailboxMessages,
};
