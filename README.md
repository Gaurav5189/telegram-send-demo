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

Open http://localhost:5173 and click **Connect Telegram**. Telegram opens, you
press **Start** once, and the app fills in your Chat ID automatically. Type a
message and send it.

## How a zero-knowledge user connects

Nobody needs to know what a Chat ID is:

1. The UI's **Connect Telegram** button asks the backend for a one-time code.
2. The backend creates a one-time code and returns two links:
   - `deepLink`: `https://t.me/nemo_calls_bot?start=link_4dwNOSW4syjy` (mobile / desktop app)
   - `webLink`: `https://web.telegram.org/z/#?tgaddr=tg://resolve?domain=nemo_calls_bot%26start=link_4dwNOSW4syjy` (Telegram Web)
3. The user presses **Start** in Telegram. The bot receives `/start link_…`,
   binds that chat to the code, and replies "✅ Connected!".
4. The UI is polling `GET /api/telegram/link/:code`; it sees `connected`, stores
   the Chat ID in `localStorage`, and shows the green connected card.

The Chat ID is still visible under **Use a Chat ID manually** for debugging, but
it is an implementation detail rather than something users must copy.

Link codes are single-use, expire after 10 minutes, and are kept in memory, so
restarting the backend invalidates pending links.

## API

`POST /api/telegram/send`

```json
{ "chatId": "123456789", "message": "Test notification" }
```

Success: `200 { "ok": true, "messageId": 42 }`. Validation errors return `400`,
Telegram delivery failures return `502`.

`GET /api/telegram/health` → `{ "status": "ok" }`

`GET /api/telegram/bot` → `{ "username": "nemo_calls_bot", "deepLink": "https://t.me/nemo_calls_bot" }`

`POST /api/telegram/link` → `{ "code": "…", "username": "…", "deepLink": "https://t.me/…?start=link_…", "webLink": "https://web.telegram.org/z/#?tgaddr=…", "expiresAt": "…" }`

`GET /api/telegram/link/:code` → `{ "status": "pending" }`, `{ "status": "connected", "chatId": "…" }`, or `{ "status": "expired" }`

## Notes

- The backend fails fast at boot if `TELEGRAM_BOT_TOKEN` is missing, because the
  bot cannot poll without it.
- Only one polling process per bot token can run at a time. Stop other instances
  (or a deployed copy) if you see `409 Conflict`.
- The frontend talks to `http://localhost:3000` by default; override with
  `VITE_API_URL` when running elsewhere.
- The backend allows `http://localhost:5173` by default. Set `CORS_ORIGINS` in
  `backend/.env` to your Cloudflare Pages origin, for example
  `CORS_ORIGINS=https://your-app.pages.dev`. Multiple origins can be separated
  with commas.
- This is still a demo: links and chat bindings live in memory, there are no user
  accounts, and anyone holding a valid link code can read the bound Chat ID. For
  production, persist links and chat bindings in a database, associate them with
  an authenticated user, and rate-limit `POST /api/telegram/link`.
