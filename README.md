# mc-panel-uptime

External uptime check for [MC Panel](https://github.com/minchiki/mc-panel) at mc-panel.space. GitHub Actions opens the panel, the site and the guide every few minutes from outside the server, checks the TLS certificates, and sends a Telegram message when something stays down for two runs in a row (and again when it recovers).

The panel's own watchdog runs on the same VPS, so it cannot report the VPS itself being down. This check can.

Secrets: `BOT_TOKEN` (Telegram bot) and `CHAT_ID` (who gets the alerts).

Канал автора: https://t.me/huicoding
