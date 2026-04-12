# TempMail Telegram Bot (cPanel)

A starter implementation of the PRD you shared: a points-based Telegram TempMail bot with email ownership, transfer, sharing, referrals, and account recovery.

## Features Included

- Wallet commands: /mybal, /redeem, /addbal
- Deposit command: /deposit (Paytm polling flow)
- Email lifecycle: /generate, /id, /delete, /accept
- Ownership transfer: /transfer, /transfermailbynumber, /bulktransfer
- Sharing controls: /share, /stopshare
- Recovery: /myprivatekey, /import
- Referrals: /start <refcode>, /viewreferral
- Utility: /cancel, /uses, /help, /shop
- Web inbox UI: /webmail (Telegram inline Web App button)
- cPanel API client abstraction (create/delete/forwarder hooks)
- Incoming mail polling service placeholder for Telegram forwarding

## Quick Start

1. Install dependencies:
   npm install

2. Create environment file:
   copy .env.example .env

3. Update .env values.

Web app variables:
- WEB_PORT=3000
- WEB_APP_BASE_URL=https://your-public-domain
- WEB_APP_SECRET=long-random-secret

4. Start bot:
   npm run dev

## Notes

- Uses SQLite for local development via better-sqlite3.
- cPanel endpoints can differ between providers. Update src/services/cpanelClient.js if needed.
- For production, migrate to MySQL/PostgreSQL and add robust queueing (Redis).

## Paytm Deposit Setup

Set these env values to enable /deposit:

- PAYTM_DEPOSIT_ENABLED=true
- PAYTM_MID=your_mid
- PAYTM_VERIFY_BASE_URL=https://paytm.udayscriptsx.workers.dev/
- PAYTM_UPI_PA=your_upi_id
- PAYTM_UPI_PN=Paytm

The bot generates a UPI QR and verifies payment by polling the configured URL with `mid` and `id` query params. On `TXN_SUCCESS` and `RESPMSG=Txn Success`, points are credited.
