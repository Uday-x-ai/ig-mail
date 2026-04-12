# Product Requirements Document

## Project
TempMail Telegram Bot with cPanel Email Integration

## Product Summary
Users can generate disposable emails, receive messages in Telegram, and manage ownership via transfer/sharing workflows backed by a points economy.

## Objectives
- Easy temporary email from Telegram
- Credit-based monetization model
- Secure ownership and transfer
- Viral referral loop

## Core Command Scope
- Wallet: /mybal, /addbal, /redeem
- Email: /generate, /id, /delete, /accept
- Transfer: /transfer, /bulktransfer, /transfermailbynumber
- Sharing: /share, /stopshare
- Security: /myprivatekey, /import
- Referral: /viewreferral
- Utility: /cancel, /uses, /help, /shop

## Data Model
- users
- emails
- shared_access
- transactions
- command_usage

## Integrations
- Telegram Bot API
- cPanel API for email account lifecycle and forwarding

## Security
- Private key based account recovery
- Basic anti-abuse throttling on generation
- Ownership checks for state-changing actions

## Future Enhancements
- Web dashboard
- Multi-domain selection
- Paid plans
- Dedicated inbox UI
