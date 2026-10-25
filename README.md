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

Open the interactive API documentation at http://localhost:3000/api/docs.

## 3. Run the frontend

```bash
cd frontend
npm install
cp .env.example .env   # VITE_API_URL=http://localhost:3000
npm run dev
```

Open http://localhost:5173 and click **Connect Telegram**. Telegram opens, you
press **Start** once, and the app fills in your Chat ID automatically. Type a
message and send it.

## How a zero-knowledge user connects

Nobody needs to know what a Chat ID is:

1. The UI's **Connect Telegram** button asks the backend for a one-time code.
2. The backend returns two links plus a pasteable command:
   - `deepLink`: `https://t.me/nemo_calls_bot?start=link_4dwNOSW4syjy` (mobile app / desktop app)
   - `webLink`: `https://web.telegram.org/z/#?tgaddr=tg://resolve?domain=nemo_calls_bot%26start=link_4dwNOSW4syjy` (Telegram Web)
   - `startCommand`: `/start link_4dwNOSW4syjy` (works in any Telegram client)
3. The UI picks the link by platform and opens it:
   - **Mobile:** `deepLink`. `t.me` is a universal/app link, so the OS opens the
     installed Telegram app and falls back to the browser only when it is not
     installed.
   - **Desktop:** `webLink`, because a `t.me` preview opened in a normal desktop
     tab cannot launch the bot's `tg://` start button.
4. The user presses **Start** in Telegram. The bot receives `/start link_…`,
   binds that chat to the code, and replies "✅ Connected!".
5. The UI is polling `GET /api/telegram/link/:code`; it sees `connected`, stores
   the Chat ID in `localStorage`, and shows the green connected card.

The Chat ID is still visible under **Use a Chat ID manually** for debugging, but
it is an implementation detail rather than something users must copy.

Link codes are single-use, expire after 10 minutes, and are kept in memory, so
restarting the backend invalidates pending links.

### Mobile vs desktop, and app detection

There is **no reliable web API to detect whether an app is installed**. Browsers
deliberately hide that, so the page cannot branch on "Telegram installed?".
Instead:

- On mobile, the `t.me` universal link delegates the decision to the operating
  system: app if installed, browser otherwise. This is the standard and most
  reliable approach.
- On desktop, we cannot detect the Telegram desktop app either. Firing `tg://`
  blindly can show an error or do nothing, so we use Telegram Web by default and
  offer the desktop-app link explicitly.

The pending panel covers the cases where the automatic choice does not work:

- **Nothing opened / popup blocked:** "Open Telegram again" is a normal link.
- **Telegram Web is logged out:** the page shows a login screen. "Use the
  Telegram desktop app instead" (or the copied command) avoids it.
- **In-app browsers** (Instagram, Facebook, etc.) often block universal links:
  the UI detects common ones and suggests opening the page in the default
  browser.
- **Copy the command:** `/start link_…` can be pasted into any Telegram client,
  including the desktop app or a phone that is already signed in.
- **Reload / back navigation:** the pending link is stored in `sessionStorage`,
  so polling resumes instead of silently losing the code.
- **Backgrounded tab:** a `visibilitychange` listener checks immediately when
  the user returns from Telegram.
- **Expired or reused code:** cleared from storage and the UI asks for a fresh
  connection.

Clipboard access can be unavailable in some embedded browsers or on plain HTTP.
In that case the command remains selectable in the page for manual copying.


## API

`POST /api/telegram/send`

```json
{ "chatId": "123456789", "message": "Test notification" }
```

Success: `200 { "ok": true, "messageId": 42 }`. Validation errors return `400`,
Telegram delivery failures return `502`.

`GET /api/telegram/health` → `{ "status": "ok" }`

`GET /api/telegram/bot` → `{ "username": "nemo_calls_bot", "deepLink": "https://t.me/nemo_calls_bot" }`

`POST /api/telegram/link` → `{ "code": "…", "username": "…", "deepLink": "https://t.me/…?start=link_…", "webLink": "https://web.telegram.org/z/#?tgaddr=…", "startCommand": "/start link_…", "expiresAt": "…" }`

`GET /api/telegram/link/:code` → `{ "status": "pending" }`, `{ "status": "connected", "chatId": "…" }`, or `{ "status": "expired" }`

## Deploying behind Caddy (Hugging Face Spaces)

The `Caddyfile` + `supervisord.conf` setup (Caddy on `:7860` → NestJS on `:3000`)
is sound: if `GET /api/telegram/health` returns `{"status":"ok"}` through the
public URL, the proxy is working.

A deployed copy still returns

```json
{ "message": "Telegram bot is not reachable yet: Network request for 'getMe' failed!", "statusCode": 503 }
```

because **Hugging Face Spaces block outbound traffic to `api.telegram.org`** at
the network level. No code or Caddy change can fix that from inside the Space.
Calls have to go through a relay outside HF:

- The backend reads `TELEGRAM_API_ROOT` at boot (default
  `https://api.telegram.org`) and sends every Bot API call through it.
- A working relay is the Cloudflare Pages bridge
  `https://<bridge_link>.pages.dev`, which forwards
  `https://<bridge_link>.pages.dev/bot<token>/<method>` to
  `https://api.telegram.org/bot<token>/<method>` unchanged (GET, POST, query
  strings, and long polling included).

In the Space open **Settings → Variables and secrets** and add:

```
TELEGRAM_API_ROOT = https://<bridge_link>.pages.dev
```

Then **Restart** the Space. Logs should show:

```
[TelegramService] Using Telegram Bot API root https://<bridge_link>.pages.dev
[TelegramService] Telegram bot @your_bot is polling
```

If the second line is missing, the Space cannot reach the Bot API (or the
relay). Requests still go out over HTTPS with the token in the path, so keep the
relay private if you build your own; the alternative is to move the backend to a
host without egress filtering (Render, Fly.io, Railway, Koyeb, a VPS) and keep
only the frontend on HF. Point the frontend at that API with `VITE_API_URL` and
add its origin to `CORS_ORIGINS`.

## Notes

- The backend fails fast at boot if `TELEGRAM_BOT_TOKEN` is missing, because the
  bot cannot poll without it.
- Only one polling process per bot token can run at a time. Stop other instances
  (or a deployed copy) if you see `409 Conflict`.
- The frontend uses relative `/api/...` URLs by default, which is what you want
  when Caddy serves the UI and API from one origin. For local development the
  two dev servers are separate: copy `frontend/.env.example` to `frontend/.env`
  so `VITE_API_URL=http://localhost:3000` is set.
- The backend allows `http://localhost:5173` by default. Set `CORS_ORIGINS` in
  `backend/.env` to your Cloudflare Pages origin, for example
  `CORS_ORIGINS=https://your-app.pages.dev`. Multiple origins can be separated
  with commas.
- This is still a demo: links and chat bindings live in memory, there are no user
  accounts, and anyone holding a valid link code can read the bound Chat ID. For
  production, persist links and chat bindings in a database, associate them with
  an authenticated user, and rate-limit `POST /api/telegram/link`.
