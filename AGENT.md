# Agent Guide — Telegram Notifier Demo

## 1. What this project is

A **single-purpose demo**: send a notification message to a specific Telegram chat from a web UI, then act on it with two inline keyboard buttons (`Mark done ✅`, `Snooze ⏰`).

It is intentionally minimal to teach three things clearly:
- How a web frontend connects to a Telegram bot (without the user knowing chat IDs).
- How a one-time handshake link binds a browser session to a Telegram chat.
- How inline keyboard actions are handled by a bot and mirrored back into the UI preview.

**Do not treat it as a production messaging platform.** It has no user accounts, no database persistence for links/chat bindings, and no rate limiting. For production, you must add authentication, persistent storage, and rate limits.

---

## 2. Architecture (read before editing anything)

```
Frontend (React + Vite, port 5173)
  │  HTTP / JSON (CORS enabled for localhost:5173 by default)
  ▼
Backend (NestJS + TypeScript, port 3000)
  │  Bot API calls (grammY)
  ▼
Telegram Bot (long-polling)
  │  Messages + InlineKeyboard
  ▼
User's Telegram Client
```

The backend is the **authoritative source of truth** for:
- Bot identity (`GET /api/telegram/bot`)
- One-time link codes (`POST /api/telegram/link`, `GET /api/telegram/link/:code`)
- Link expiry (server-side `expiresAt` check, not just client clock)
- Notification delivery (`POST /api/telegram/send` with inline keyboard)

The frontend is a **test UI** that shows the live message preview and handles the connection handshake. It does not know how to talk to Telegram directly; all Telegram interactions go through the backend.

---

## 3. Technology stack (exact versions matter)

| Layer | Tech | Key files |
|---|---|---|
| **Backend** | NestJS 11 (`@nestjs/*`), TypeScript 5.7, grammY 1.38, `node:crypto` for link codes | `backend/src/telegram/*.ts`, `backend/src/app.module.ts`, `backend/src/main.ts` |
| **Frontend** | React 19.1 (`react`, `react-dom`), Vite 6.3 (`@vitejs/plugin-react`) | `frontend/src/App.jsx`, `frontend/src/App.css`, `frontend/src/main.jsx` |
| **Deployment proxy** | Caddy (`Caddyfile`) + `supervisord.conf` for Hugging Face Spaces (port 7860 → 3000) | `Caddyfile`, `supervisord.conf` (repo root) |

The backend uses `ConfigModule.forRoot({ isGlobal: true })`, so `.env` variables (`TELEGRAM_BOT_TOKEN`, `PORT`, `TELEGRAM_API_ROOT`, `CORS_ORIGINS`) are available everywhere without explicit imports.

---

## 4. How the interaction flow works (step-by-step)

This is the core mechanism. Understand it before changing any of these parts.

### 4.1 Connection handshake (link creation → polling → binding)

1. Frontend calls `POST /api/telegram/link`.
2. Backend creates a single-use, 10-minute code (`randomBytes(9).base64url`).
3. Backend returns: `code`, `username`, `deepLink`, `webLink`, `startCommand`, `expiresAt`.
4. Frontend opens the appropriate Telegram link (`deepLink` on mobile, `webLink` on desktop).
5. User presses **Start** in Telegram. The bot receives `/start link_...`.
6. Bot calls `completeLink(code, chat.id)`, which binds the chat ID to the pending link.
7. Bot replies: `"✅ Connected! Head back to the app..."` (or error if expired/reused).
8. Frontend polls `GET /api/telegram/link/:code` every 2 seconds (`visibilitychange` resumes polling when the user returns).
9. When the server returns `{ status: 'connected', chatId: '...' }`, the frontend stores the ID in `localStorage` and shows the connected row.
10. If `expired`, the pending link is cleared and an error message is shown.

**Critical constraints:**
- Links are **in-memory only** (`Map`). Restarting the backend invalidates all pending links.
- Only one polling process per bot token can run (long-polling). If you see `409 Conflict`, another instance is running.
- The server is authoritative for expiry. The client uses the stored `expiresAt` only as a fallback (to handle clock skew gracefully, not as a hard cut-off before polling).

### 4.2 Notification with interactive buttons

- `POST /api/telegram/send` takes `{ chatId, message }`.
- The backend attaches an `InlineKeyboard` with two buttons: `action_done` and `action_snooze`.
- When a user taps a button, the bot answers the callback (`text: ACTION_LABELS[data]`) and edits the original message text to append the status (`— Marked as done ✅` or `— Snoozed ⏰`), then removes the inline keyboard so the action cannot be tapped twice.

This is handled entirely by `telegram.service.ts`. The frontend preview (`bubble` + `actions`) is **inert** (`aria-hidden="true"`) — it mirrors the live message but does not send anything. It exists only for visual confirmation.

---

## 5. How to edit this codebase correctly

### Before making any change

- Read `DESIGN.md` (`DOCS/DESIGN.md`). It defines the design contract (colors, typography, layout, behavior, edge cases, accessibility, copy). Any change that contradicts it needs a design reason.
- Check `.env` files (`backend/.env`, `frontend/.env`). The backend requires `TELEGRAM_BOT_TOKEN`. Without it, the bot fails fast on boot (`throw new Error(...)`).
- Confirm the build passes: `npm run build` in both `backend/` and `frontend/`.

### What to edit for common changes

| What you want to change | Where it lives | What to check |
|---|---|---|
| Button colors / borders / shadows | `frontend/src/App.css` | Replace the flat tokens (`--line`, `--line-strong`, `--accent`) consistently. Do not reintroduce gradients or box shadows. |
| Card width / padding / typography | `App.css` (`.card`, `.label`, `.result`, `.bubble`) | Keep single-column layout, `max-width: 440px`, no breakpoints. |
| Copy / labels / status text | `frontend/src/App.jsx` (JSX strings) + `DESIGN.md` (`## Copy`) | Match sentence case (`Send message`, not `Send Notification`). No all-caps. |
| Message preview styling | `App.css` (`.preview`, `.bubble`) + JSX (`Preview` label, `dir="auto"`) | Preview buttons (`Mark done ✅`, `Snooze ⏰`) must stay `aria-hidden`. The bubble uses `dir="auto"` for RTL support. |
| Connection flow / link creation | `backend/src/telegram/telegram.service.ts` (`createConnectLink`, `getLinkStatus`) + `App.jsx` (`handleConnect`, `useEffect` polling) | Never change link TTL (`LINK_TTL_MS = 10 * 60 * 1000`) without updating the design spec. Keep polling interval at 2s. Never overlap polls (a slow request skips the next tick). |
| Manual chat ID validation / display | `App.jsx` (`isValidChatId`, `handleManualChatIdChange`) + CSS (`.manual`, `.error`) | Accept optional leading minus (`-?") for group/channel IDs. Show inline error when invalid; keep error visible even if disclosure is closed. |
| Send validation / result messages | `App.jsx` (`handleSubmit`) + `DESIGN.md` (`## Copy`) | Trim before validation. Message limit is `4096`. Success text: `Message sent.`; progress: `Sending…`; errors: API message or `Could not reach the API. Check that the backend is running.` |
| Inline keyboard labels | `telegram.service.ts` (`ACTION_LABELS`) + JSX preview (`.actions span`) | Keep sentence case (`Marked as done ✅`, `Snoozed ⏰`). The JSX preview and backend keyboard labels must stay in sync. |
| API endpoint behavior | `backend/src/telegram/telegram.controller.ts` + `DESIGN.md` (`## API contract`) | `400` for validation, `502` for Telegram delivery failures, `503` for bot/link creation failures. Unknown/reused link codes return `expired`, not retryable errors. |
| Accessibility / live regions | `App.jsx` (JSX `role`, `aria-live`, `aria-atomic`, `aria-invalid`, `aria-busy`) | Status dot is `aria-hidden`; text carries meaning. Result line is `role="status" aria-atomic="true"`. Chat input uses `aria-invalid`. Message textarea uses `dir="auto"`. |
| Dark mode / reduced motion | `App.css` (`@media (prefers-color-scheme: dark)`) | Dark tokens (`--accent: #5aaee0`, `--warn: #e0b055`) are defined. No animations exist by design (`transition-duration: 0.01ms` only for `prefers-reduced-motion`). |

### What NOT to do

- **Do not** add database persistence for links or chat IDs (the design explicitly states this is a demo limitation; adding it without updating the design spec creates inconsistency).
- **Do not** change the inline keyboard labels without updating both `telegram.service.ts` (`ACTION_LABELS`) and the JSX preview (`.actions span`).
- **Do not** introduce new buttons, sections, or navigation. The design is flat and single-column.
- **Do not** change the result line format from a simple text message (`Sending…`, `Message sent.`) to badges/icons. The design removed badges in favor of plain text.
- **Do not** change `API_BASE` logic (relative URLs for production, `.env` override for local dev). The Caddy proxy serves both from one origin.

---

## 6. How to use this as a template for bigger applications

### What transfers directly

| Pattern | How to reuse |
|---|---|
| **Handshaking via one-time deep links** | Keep `POST /api/link` → open `t.me` → poll `GET /link/:code` → bind chat ID. This is the standard Telegram bot onboarding pattern. Replace the `randomBytes` code generation with a UUID or JWT if you need longer lifetimes or audit trails. |
| **Inline keyboard with callback acknowledgment** | The `action_done` / `action_snooze` pattern is a standard Telegram notification interaction. Replace `ACTION_LABELS` with your actions; keep the `editMessageText` + `reply_markup: { inline_keyboard: [] }` pattern to prevent double-taps. |
| **Live polling with `visibilitychange`** | Essential for mobile users who switch apps. Keep the 2-second interval and the overlap guard (`cancelled` flag, skip tick on slow responses). |
| **Server-authoritative expiry** | Always check `expiresAt` server-side. Use `sessionStorage` for reload resilience, `localStorage` for persistent recipient IDs, and never rely solely on client-side expiration. |
| **Flat, border-defined UI** | The `DESIGN.md` color system (`--line`, `--line-strong`, `--accent`, `--warn`, `--ok`, `--error`) and the single-column layout (`max-width: 440px`, `padding: 24px`) work well for focused, single-task UIs. It reduces cognitive load. |
| **Error-first copy** | Every state has a message in plain language (`Sending…`, `That connect link expired.`, `Could not reach the API.`). No colored badges alone. This is an accessibility and usability win. |

### What must change for production

| Demo limitation | Production requirement |
|---|---|
| In-memory links (`Map`) and chat bindings (`localStorage`) | Persist links and bindings in a database (PostgreSQL, MongoDB, etc.) with user association and rate limiting. |
| No authentication | Add login/session management (JWT, OAuth, etc.) so links and chat IDs are scoped to a user. |
| No rate limit on `POST /link` | Rate-limit link creation per IP/user to prevent abuse. |
| 10-minute link TTL | Consider shorter TTLs for sensitive actions, or use signed tokens (`jwt.sign`) with server-side revocation. |
| Bot token in `.env` | Rotate tokens securely (secret manager, Kubernetes secrets, etc.). Never commit tokens. |
| No deployment monitoring | Add health checks, logging aggregation, and alerting for `TELEGRAM_API_ROOT` failures (especially on HF Spaces). |
| Caddy proxy for one host | Use a reverse proxy (Caddy, Nginx, Traefik) with HTTPS termination. The `CORS_ORIGINS` must match the deployed origin exactly. |

---

## 7. Design philosophy (why it looks and behaves this way)

Read `DOCS/DESIGN.md` before changing visuals. The design is built on a single principle:

> **Flat and quiet. Borders define structure, not shadows or gradients.**

This is not an aesthetic preference — it is a usability strategy:

- **No decorative motion** (`no animations`, `no transition` on focus states): reduces cognitive load for users switching between apps (mobile) or with reduced-motion preferences.
- **One accent color (`--accent`)** for interactive focus, primary buttons, links, focus ring: creates a clear visual hierarchy without introducing multiple colors.
- **Dedicated error (`--error`) and warning (`--warn`) colors**: errors are never shown as just a red border; they have explicit text (`"That connect link expired."`, `"Enter a numeric chat ID."`). This meets WCAG AA text contrast requirements in both light and dark modes.
- **Single column, sentence case, plain verbs**: the UI does not compete with the message content. The preview bubble (`Your message appears here.`) mirrors the live textarea so the user knows exactly what the recipient will see.
- **Interactive borders (`--line-strong`)** separate inputs from the page (`--line` separates sections): this creates depth without shadows, which is critical for accessibility (high-contrast modes, forced colors).

### Key design tokens (light mode)

| Token | Value | Contrast notes |
|---|---|---|
| `--bg` | `#f6f6f4` | Page background |
| `--surface` | `#ffffff` | Card, inputs, buttons |
| `--line` | `#d9d9d4` | Section dividers |
| `--line-strong` | `#8f8f89` | Input borders (3.25:1 on `--surface` in light mode) |
| `--accent` | `#176a99` | Primary button, links, focus ring (5.9:1 on `--surface`) |
| `--ok` | `#2e7d32` | Online status dot |
| `--warn` | `#8a5a00` | Popup-blocked, in-app browser warnings (5.48:1 on `--bg`) |
| `--error` | `#c0392b` | Error text (5.44:1 on `--surface`) |

In dark mode (`prefers-color-scheme: dark`):
- `--accent` becomes `#5aaee0` (lighter, to maintain contrast on dark `--surface` `#1d1d1b`).
- `--warn` becomes `#e0b055` (brighter, to remain visible on dark `--bg` `#151514`).
- `--line-strong` becomes `#6b6b64` (3.15:1 on `--surface`).

---

## 8. File reference map (what does what, exactly)

### Root
- `README.md` — user-facing setup guide (bot creation, `.env`, local dev, deployment notes).
- `Caddyfile` — Caddy reverse proxy config (port 7860 → backend 3000) for HF Spaces.
- `supervisord.conf` — process supervisor config (Caddy + backend) for HF Spaces.

### Backend (`backend/`)
- `.env.example` — `TELEGRAM_BOT_TOKEN`, `PORT`, `TELEGRAM_API_ROOT`, `CORS_ORIGINS`.
- `src/main.ts` — Bootstrap: CORS setup (`localhost:5173` default), Swagger (`/api/docs`), DNS (`ipv4first`), port (`3000` default).
- `src/app.module.ts` — Root module: `ConfigModule` (global), `TelegramModule`.
- `src/telegram/telegram.module.ts` — Module registration for Telegram service/controller.
- `src/telegram/telegram.controller.ts` — 4 endpoints: `POST send`, `GET health`, `GET bot`, `POST link`, `GET link/:code`.
- `src/telegram/telegram.service.ts` — Bot lifecycle, link handshake (`createConnectLink`, `getLinkStatus`), notification (`sendNotification` with `InlineKeyboard`), command handlers (`/start`), callback handling (`action_done`, `action_snooze`), message editing after button tap.

### Frontend (`frontend/`)
- `.env.example` — `VITE_API_URL=http://localhost:3000` for separate-dev-server setup.
- `src/main.jsx` — React 19 StrictMode entry.
- `src/App.jsx` — Main component. State: `chatId`, `message`, `pendingLink`, `sending`, `connecting`, `status`, `botInfo`, `apiOnline`. Key functions: `handleConnect`, `handleCancelConnect`, `handleCopyCommand`, `handleDisconnect`, `handleManualChatIdChange`, `handleSubmit`. Poll effect (`useEffect` on `pendingLink`) with `visibilitychange` listener.
- `src/App.css` — Design tokens, flat layout, responsive rules (`@media (forced-colors: active)`, `@media (prefers-color-scheme: dark)`).
- `index.html` — Basic HTML skeleton (`<title>`, viewport meta).
- `vite.config.js` — Vite React plugin (`@vitejs/plugin-react`), port `5173`.

### Documentation (`DOCS/`)
- `DESIGN.md` — Authoritative design spec (colors, typography, layout, components, behavior, edge cases, copy, accessibility, responsive, API contract, prototype reference removed).
- `plan.md` — Original project plan (architecture diagram, structure, notes).
- `concept.html` — Prototype HTML (will be deleted; references real API by default, `?demo=1` for simulated state, `?state=...` for named state previews).

---

## 9. Inspiration and philosophical notes

### Why this project exists as a demo

It demonstrates three production-relevant patterns in a minimal package:

1. **Zero-knowledge onboarding**: the user never needs to know what a "chat ID" is (`/start link_...` + polling).
2. **Inline keyboard as persistent state machine**: the bot edits the message on button tap (removing the keyboard so actions cannot be repeated) and confirms back to the user.
3. **Reactive preview**: the web UI mirrors the live message so the user sees the exact text and interactive buttons before sending.

### Design inspiration sources

- **Flat, border-defined UI**: derived from modern accessibility-first design systems (no decorative shadows; borders do the structural work). This aligns with `forced-colors` support and high-contrast mode compatibility.
- **Single-column, sentence-case copy**: reduces scanning time and avoids the "all-caps label" anti-pattern common in dashboard UIs.
- **Atomic result line**: the `role="status" aria-atomic="true"` pattern ensures screen readers announce state changes (`Sending…` → `Message sent.` → `Telegram connected.`) without disrupting the user's focus.
- **Server-side expiry**: avoids relying solely on client clocks (which can be wrong, especially on mobile after sleep/wake).
- **Pending-state resilience**: `sessionStorage` for reloads, `visibilitychange` for background tabs, and overlap guards for slow networks all come from real-world mobile-web interaction failures.

---

## 10. Quick reference for agents

### Commands

```bash
# Full setup
cd backend && npm install && cp .env.example .env  # then add TELEGRAM_BOT_TOKEN
cd ../frontend && npm install && cp .env.example .env

# Run (separate terminals)
# Terminal 1: backend on 3000 (with bot polling)
cd backend && npm run start:dev
# Terminal 2: frontend on 5173
cd frontend && npm run dev
```

### Key URLs

- Health: `http://localhost:3000/api/telegram/health`
- Bot identity: `http://localhost:3000/api/telegram/bot`
- Swagger docs: `http://localhost:3000/api/docs`
- Frontend: `http://localhost:5173`

### Environment variables (must be set before starting backend)

- `TELEGRAM_BOT_TOKEN` (required; bot fails fast without it)
- `PORT` (default `3000`)
- `TELEGRAM_API_ROOT` (optional; required for hosts that block `api.telegram.org`, e.g. HF Spaces with a Cloudflare relay)
- `CORS_ORIGINS` (optional; default `http://localhost:5173`)

### Design rules to enforce

- Never add gradients, shadows, or decorative icons (`✈️` was removed).
- Never use all-caps labels (`UPPERCASE`) or decorative motion (`animation`, `transition` on interactive elements).
- Always show plain-verb copy (`Send message`, not `Send Notification`).
- Always explain failures in text (`"That connect link expired."`, `"Enter a numeric chat ID."`) — never rely on color alone.
- Always keep the preview (`bubble`) and the actual message (`textarea`) synchronized (`trim()` before displaying).
- Always preserve the `aria-hidden="true"` on preview buttons; they are decorative.
- Always keep `dir="auto"` on the message textarea and preview bubble for RTL support.
- Always use `localStorage` for chat ID persistence and `sessionStorage` for pending links.
- Always treat server `status` (`pending`/`connected`/`expired`) as authoritative; use `expiresAt` only as a fallback for clock skew.

---

## 11. File change log (for version tracking)

When editing, update this log in the commit message or PR description:

```
- backend/src/telegram/telegram.service.ts  (bot handlers, link handshake, keyboard)
- backend/src/telegram/telegram.controller.ts  (API contract, validation)
- backend/src/app.module.ts / main.ts  (bootstrap, CORS, Swagger)
- frontend/src/App.jsx  (state, interaction, copy, accessibility)
- frontend/src/App.css  (design tokens, layout, responsive, dark mode)
```

Do not change `README.md` or `DOCS/plan.md` without updating `DESIGN.md` first, because the design spec (`DESIGN.md`) is the authoritative source of truth for all UI, copy, and behavior decisions.
