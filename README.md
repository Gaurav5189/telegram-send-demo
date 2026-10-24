# Telegram Notifier Demo

NestJS + grammY backend with a React (Vite) test UI. Send a notification to a
Telegram chat and act on it with inline **Mark Done ✅** / **Snooze ⏰** buttons.

```
backend/           NestJS API (port 3000)
  src/telegram/    TelegramModule, service, controller
frontend/          React + Vite UI (port 5173)
```

## 1. Create a bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram, send `/newbot`, and copy the token.
2. In `backend/`, copy `.env.example` to `.env` and set `TELEGRAM_BOT_TOKEN`.
3. Open your new bot and tap **Start** so it is allowed to message you.

## 2. Run the backend

```bash
cd backend
npm install
npm run start:dev
```

The bot starts long polling on boot. Verify the API:

```bash
curl http://localhost:3000/api/telegram/health
# {"status":"ok"}
```

## 3. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Message the bot with `/start`, copy the Chat ID it
replies with, paste it into the form, and send a notification.

## API

`POST /api/telegram/send`

```json
{ "chatId": "123456789", "message": "Test notification" }
```

Success: `200 { "ok": true, "messageId": 42 }`. Validation errors return `400`,
Telegram delivery failures return `502`.

`GET /api/telegram/health` → `{ "status": "ok" }`

## Notes

- The backend fails fast at boot if `TELEGRAM_BOT_TOKEN` is missing, because the
  bot cannot poll without it.
- Only one polling process per bot token can run at a time. Stop other instances
  (or a deployed copy) if you see `409 Conflict`.
- The frontend talks to `http://localhost:3000` by default; override with
  `VITE_API_URL` when running elsewhere.
