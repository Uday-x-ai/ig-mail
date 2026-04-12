const crypto = require("crypto");
const { web } = require("../config");

function getSecret() {
  return web.secret || "change-me";
}

function createWebAppToken(telegramId, ttlSeconds = 1800) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    telegramId: Number(telegramId),
    exp: nowSeconds + Math.max(60, ttlSeconds),
  };

  const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", getSecret())
    .update(payloadEncoded)
    .digest("base64url");

  return `${payloadEncoded}.${signature}`;
}

function verifyWebAppToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return null;
  }

  const [payloadEncoded, signature] = token.split(".");
  const expected = crypto
    .createHmac("sha256", getSecret())
    .update(payloadEncoded)
    .digest("base64url");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadEncoded, "base64url").toString("utf8"));
  } catch (err) {
    return null;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!payload?.telegramId || !payload?.exp || payload.exp < nowSeconds) {
    return null;
  }

  return payload;
}

module.exports = {
  createWebAppToken,
  verifyWebAppToken,
};
