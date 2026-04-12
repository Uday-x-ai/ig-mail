const express = require("express");
const path = require("path");
const axios = require("axios");
const { botToken, web } = require("../config");
const { getUserByTelegramId } = require("../services/userService");
const { listAccessibleEmails, getReceivedMailsForUser } = require("../services/emailService");
const { verifyWebAppToken } = require("../services/webAppAuth");

async function getTelegramProfilePhotoUrl(telegramId) {
  if (!botToken) {
    return null;
  }

  const base = `https://api.telegram.org/bot${botToken}`;

  try {
    const photosRes = await axios.get(`${base}/getUserProfilePhotos`, {
      params: { user_id: telegramId, limit: 1 },
      timeout: 10000,
    });

    const sizes = photosRes.data?.result?.photos?.[0];
    if (!Array.isArray(sizes) || !sizes.length) {
      return null;
    }

    const best = sizes[sizes.length - 1];
    const fileId = best?.file_id;
    if (!fileId) {
      return null;
    }

    const fileRes = await axios.get(`${base}/getFile`, {
      params: { file_id: fileId },
      timeout: 10000,
    });

    const filePath = fileRes.data?.result?.file_path;
    if (!filePath) {
      return null;
    }

    return `https://api.telegram.org/file/bot${botToken}/${filePath}`;
  } catch (err) {
    return null;
  }
}

function createWebServer() {
  const app = express();
  const publicDir = path.join(__dirname, "public");

  app.use("/webapp", express.static(publicDir));

  app.get("/webapp", (req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });

  app.get("/api/webapp/inbox", async (req, res) => {
    const token = String(req.query.token || "");
    const auth = verifyWebAppToken(token);
    if (!auth) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const user = getUserByTelegramId(auth.telegramId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const emails = listAccessibleEmails(user.id);
    const inbox = emails.map((item) => {
      const latest = getReceivedMailsForUser(item.email, user.id, 1)[0] || null;
      return {
        email: item.email,
        accessType: item.access_type,
        latest,
      };
    });

    const photoUrl = await getTelegramProfilePhotoUrl(user.telegram_id);

    return res.json({
      user: {
        telegramId: user.telegram_id,
        displayName: `User ${user.telegram_id}`,
        photoUrl,
      },
      inbox,
    });
  });

  app.get("/api/webapp/inbox/:email", (req, res) => {
    const token = String(req.query.token || "");
    const auth = verifyWebAppToken(token);
    if (!auth) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const user = getUserByTelegramId(auth.telegramId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const email = decodeURIComponent(req.params.email || "").trim().toLowerCase();
    try {
      const rows = getReceivedMailsForUser(email, user.id, 50);
      return res.json({
        email,
        messages: rows,
      });
    } catch (err) {
      return res.status(404).json({ error: err.message });
    }
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  function start() {
    app.listen(web.port, () => {
      console.log(`Web app listening on port ${web.port}`);
    });
  }

  return { start };
}

module.exports = {
  createWebServer,
};
