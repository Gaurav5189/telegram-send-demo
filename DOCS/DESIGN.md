# Telegram Notifier: Design

## Principles
- Flat and quiet. Borders define structure, not shadows or gradients.
- One accent color for interactive emphasis, plus dedicated error and warning
  colors for feedback.
- Left-aligned, single column, sentence case. No all-caps labels, no decorative motion.
- Plain verbs in UI copy. An action keeps one name throughout ("Send message" → "Message sent.").
- Every state explains itself in place. A failure never leaves the user without a next step.

## Color

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f6f6f4` | `#151514` | Page, message bubble, pending panel |
| `--surface` | `#ffffff` | `#1d1d1b` | Card, inputs, buttons |
| `--text` | `#1c1c1a` | `#ecece8` | Body text |
| `--muted` | `#6b6b66` | `#9a9a94` | Hints, counter, status |
| `--line` | `#d9d9d4` | `#34342f` | Structural borders and dividers |
| `--line-strong` | `#8f8f89` | `#6b6b64` | Interactive control borders (3:1) |
| `--accent` | `#176a99` | `#5aaee0` | Primary button, links, focus ring |
| `--ok` | `#2e7d32` | `#6fbf73` | Online status dot |
| `--error` | `#c0392b` | `#ff9b91` | Error text |
| `--warn` | `#8a5a00` | `#e0b055` | Fallback, popup-blocked, and in-app-browser warnings |

Primary button text: `#fff` (light), `#0d0d0c` (dark). `--accent` is dark enough
for white button text and link text to meet WCAG AA in light mode. Interactive
control borders use `--line-strong` so inputs and buttons keep a visible boundary
against `--surface`; structural lines stay quiet with `--line`.

## Typography
- Family: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
- Base: 15px / 1.5

| Role | Size | Weight |
|---|---|---|
| Title | 18px | 600 |
| Field label | 14px | 600 |
| Body, input | 15px | 400 |
| Lead, bubble | 14px | 400 |
| Hint, status, summary, preview buttons | 13px | 400 |
| Counter | 12px | 400, tabular numbers |
| Command | 12px | 400, monospace |

## Layout
- Page padding: `48px 16px`. Card: max-width 440px, centered, padding 24px.
- Section gap: 20px. Label to field: 6px. Hint below field: 6px.
- Order: header, lead, recipient, message, send, result line, preview.
- Header: title left, API status right, baseline aligned. The header wraps and
  keeps the status right-aligned when the viewport is too narrow for both.
- Preview sits below a 1px `--line` divider with 16px top padding.
- The result line reserves 20px and grows for long error text. It does not jump
  between empty, one-line, and multi-line states.

## Shape
- Card radius: 6px. Buttons, inputs, bubble: 4px.
- Border: 1px. No box shadows.

## Components

**Status**
- 7px dot plus text. Dot is `--ok` when online, `--muted` otherwise.
- States: "Checking API" on load, "API online", "API offline".
- A network failure or a failed health check moves the status to offline. Any
  2xx API response moves it back online. A server error response means the API is
  reachable, so it does not by itself clear an existing online state.

**Button (secondary)**
- Padding `8px 14px`. Border `--line-strong`, background `--surface`.
- Hover: border becomes `--muted`.
- Used for Connect and Copy.

**Button (primary)**
- Full width, background and border `--accent`, weight 600.
- Hover: `brightness(.95)`.
- Disabled: opacity .5, `not-allowed` cursor. Disabled until a valid chat ID and
  a non-empty message exist, and while a send is in flight.
- Label stays "Send message" while sending. The result line says "Sending…".

**Text button**
- Inline action for Cancel and Disconnect. No border or background, `--muted`
  text with an underline.
- Padding `4px 6px`, 13px. Keeps a 24px target.
- Hover darkens to `--text`; focus uses the accent ring. Used where a full
  secondary button would add noise to a row.

**Recipient states**

| State | Shows | Notes |
|---|---|---|
| Disconnected | Connect button and hint | Default, and after Disconnect |
| Connecting | Same, button reads "Opening Telegram…" | Button disabled |
| Pending | Waiting panel | Polling every 2s, plus on tab focus |
| Connected | "Connected: {id}" and Disconnect | Chat ID persisted |
| Expired | Disconnected plus inline error | New connect starts a fresh code |
| Manual invalid | Connect view, details open, inline error | Send stays disabled |

- Disconnected: "Connect @nemo_calls_bot" with a hint line below. If bot identity
  is unavailable, the label falls back to "Connect Telegram" and the hint says
  "our bot".
- Connecting: the connect button is disabled and reads "Opening Telegram…".
- Connected: a row with "Connected: {id}" and a Disconnect text button. The
  connect button and hint are hidden. Long IDs wrap inside the row.
- Manual chat ID is a `<details>` disclosure, closed by default. It stays
  available in every state. When connected, the field mirrors the current chat
  ID so it can be edited; editing switches to manual mode. Typing a valid
  numeric ID connects; an invalid value shows an inline error and disables Send.
  Manual entry cancels a pending link.
- The chat ID error sits below the disclosure so it stays visible if the
  disclosure is closed.
- Disconnect clears the chat ID and any pending link. Closing the disclosure
  never clears a live connection.

**Pending panel**
- 1px `--line` border, 4px radius, `--bg` fill, 12px padding.
- Title "Waiting for Telegram…", then "Press Start in the chat that just opened."
- Actions: "Open Telegram again" (accent) and "Cancel" (text button).
- If a popup is blocked: "Telegram didn't open automatically. Use Open Telegram
  again below." in `--warn`.
- Fallback: "Telegram didn't open? Send this command to @bot in any Telegram
  app." with the `/start link_…` command and a Copy button. The command is
  selectable and wraps.
- Copy failure leaves the command selectable: "Could not copy. Select the
  command and copy it manually."
- Alternate client link: "Use the Telegram desktop app instead" on desktop,
  "Use Telegram Web instead" on mobile.
- In-app browsers get a `--warn` line suggesting the default browser.
- Expiry, reuse, or an invalid code replaces the panel with the disconnected
  state and: "That connect link expired. Connect again to get a new one."

**Message field**
- Textarea, min-height 112px, vertical resize only, max 4096 characters.
- Counter `n/4096` right-aligned on the label row. Pasting beyond the limit is
  clamped by the browser; no over-limit state is shown.
- Placeholder: "Deploy finished — take a look when you can."
- While sending, the textarea is read-only so the preview cannot diverge from
  the text already in flight.

**Send and result line**
- Result states: empty, "Sending…", "Message sent.", "Telegram connected.",
  and error text.
- Success uses `--text`; progress and empty use `--muted`; errors use `--error`.
- Errors are shown verbatim from the API when useful, including Telegram delivery
  failures. A network failure reads "Could not reach the API. Check that the
  backend is running."
- Editing the message or recipient clears a stale result.
- Missing or invalid chat ID opens the manual field and focuses it.

**Preview**
- Bubble: `--bg` fill, 1px `--line` border, max-width 85%, shrinks to fit short
  text, wraps long text and unbroken strings. It mirrors the trimmed textarea.
- Empty message shows "Your message appears here." in `--muted`.
- Under the bubble, two inert buttons (Mark done ✅, Snooze ⏰). They are
  `aria-hidden` and use accent-colored text. Keep the Telegram inline-keyboard
  labels in the backend in sync with this sentence-case copy.

## Behavior

**On load**
1. Show the card immediately with "Checking API".
2. Fetch health and bot identity in parallel. Health failure does not block the UI.
3. Restore a valid chat ID from `localStorage`. Invalid stored values are removed.
4. Restore a pending link from `sessionStorage` and resume polling. Malformed
   or expired stored data is discarded; an expired link shows its error.
5. If both a chat ID and a pending link exist, the pending panel wins until it
   connects or is cancelled; the stored recipient returns afterwards.
6. Connected and pending states survive reloads; an in-flight send does not.

**Connect**
1. `POST /api/telegram/link` creates a single-use code (10 minutes).
2. Choose the target: `deepLink` on mobile, `webLink` on desktop (falling back to
   `deepLink`). `t.me` is a universal link on mobile; desktop uses Telegram Web
   because a normal desktop tab cannot launch `tg://`.
3. Open Telegram in a new tab. A blocked popup is not an error: the pending panel
   keeps "Open Telegram again" as the direct next step.
4. Poll `GET /api/telegram/link/:code` every 2 seconds and immediately on
   `visibilitychange`. Never overlap polls; a slow request skips the next tick.
   A transient poll failure is ignored.
5. The server is authoritative for expiry. The stored `expiresAt` is only a
   fallback so a skewed client clock cannot invalidate a live code early.
6. On `connected`, store the chat ID, stop polling, and show the connected row
   with "Telegram connected." in the result line.
7. On `expired`, stop polling and clear the pending link. If no valid chat ID
   exists, show "That connect link expired. Connect again to get a new one."
   If an existing chat ID is stored, keep it connected and show an informational
   result instead of disconnecting it.
8. Cancel stops polling, clears the pending link and its feedback, and discards
   any in-flight poll response.

**Manual chat ID**
- The field mirrors the connected chat ID when one exists.
- Accept only an optional minus sign followed by digits (`/^-?\d+$/`).
- Valid values connect immediately, persist, and cancel any pending link.
- Empty values disconnect. Invalid values show an inline error, keep the value
  for correction, and disable Send. The error remains visible when the
  disclosure is closed.
- Typing while connecting invalidates the in-flight connect response.

**Send**
1. Capture the current chat ID and message, then trim both. Both are required;
   chat ID must be numeric.
2. `POST /api/telegram/send` with `{ chatId, message }`.
3. Disable Send, make fields read-only, and show "Sending…" for the duration.
4. On success show "Message sent." and keep the recipient and text for a repeat.
5. On failure show the API message and restore the controls. Flatten validation
   `message` arrays into one sentence. If the response is not JSON, fall back to
   "Request failed with status {code}." A timeout reads "The request timed out.
   Try again."

**Persistence**
- `telegram-demo:chat-id` in `localStorage`: last valid recipient, manual or linked.
- `telegram-demo:pending-link` in `sessionStorage`: pending handshake, so reload
  or back navigation resumes polling.
- Malformed JSON or missing fields are discarded rather than restored.
- Storage access is wrapped: private mode or embedded browsers fall back to
  in-memory state without breaking the page.

## API contract

| Call | Used for |
|---|---|
| `GET /api/telegram/health` | API status; `{ "status": "ok" }` |
| `GET /api/telegram/bot` | Bot name and public link; `{ username, deepLink }` |
| `POST /api/telegram/link` | One-time handshake; `{ code, username, deepLink, webLink, startCommand, expiresAt }` |
| `GET /api/telegram/link/:code` | Poll; `{ status: "pending" }`, `{ status: "connected", chatId }`, or `{ status: "expired" }` |
| `POST /api/telegram/send` | `{ chatId, message }`; success `{ ok: true, messageId }` |

- Validation failures return `400`; Telegram delivery failures return `502`;
  bot or link creation failures return `503`.
- Treat an unknown or reused link code as `expired`, not as a retryable error.
- Show the backend's `message` when it is useful; fall back to a status-based
  sentence when the body is missing or not JSON.

## Edge cases

| Case | Handling |
|---|---|
| API or backend down | Status shows offline; Connect and Send fail with a clear network message |
| Bot identity unavailable | Generic connect label; pending hint says "the bot" |
| Popup blocked | Pending panel remains; "Open Telegram again" is a real link |
| In-app browser | Pending panel warns to open the page in the default browser |
| Telegram Web logged out | Alternate desktop-app link and pasteable command |
| Clipboard unavailable | Copy error; command remains selectable |
| Link expired, reused, or backend restarted | Pending panel clears and explains how to reconnect |
| Reload or back navigation | Pending link restored from `sessionStorage`; polling resumes |
| Backgrounded tab | `visibilitychange` checks status immediately on return |
| Network blip while polling | Polling continues without clearing the panel; status recovers on the next 2xx |
| Overlapping polls | A slow poll skips the next tick; responses are ignored after cancel/connect |
| Client clock skew | Server link status decides expiry; stored `expiresAt` is only a fallback |
| Stored chat ID plus pending link | Pending panel wins; cancel or expiry returns the existing connection |
| Multi-tab | Each tab polls independently; last successful connection wins, reload resyncs storage |
| Invalid stored chat ID | Removed on load; page starts disconnected |
| Malformed stored data | Discarded instead of restored |
| Invalid manual ID | Inline error, Send disabled, details stays available |
| Negative group/channel ID | Full keyboard, optional leading minus accepted (`-100…`) |
| Manual entry during pending/connecting | Cancels the handshake; stale response ignored |
| Whitespace-only message | Trimmed; Send stays disabled |
| Message at 4096 characters | Counter shows 4096/4096; Send remains enabled |
| Editing during send | Fields are read-only until the request completes |
| Double submit | Send is disabled while in flight |
| Bot blocked or chat not found | Telegram's delivery error appears in the result line; recipient is kept |
| Request timeout or non-JSON response | Retryable error text; controls are restored |
| Right-to-left message | Textarea and bubble use `dir="auto"`; surrounding UI stays left-aligned |
| Long chat ID, command, error, or message | Wrap via `overflow-wrap: anywhere`; no horizontal scroll |
| Narrow viewport | Header wraps; card shrinks to viewport minus 32px; no breakpoints |
| Storage unavailable | In-memory fallback; current tab still works |
| Dark mode | Separate error and warning tokens keep AA contrast |
| High contrast / forced colors | Control borders and status dots fall back to system colors |

## Copy

| Context | Copy |
|---|---|
| Title | Telegram Notifier |
| Lead | Send a message to Telegram with Mark done and Snooze buttons. |
| Status | Checking API / API online / API offline |
| Connect | Connect @bot / Connect Telegram |
| Connect hint | Opens @bot in Telegram. Press Start and your chat ID is filled in. |
| Connecting | Opening Telegram… |
| Pending | Waiting for Telegram… / Press Start in the chat that just opened. |
| Pending actions | Open Telegram again / Cancel |
| Popup blocked | Telegram didn't open automatically. Use Open Telegram again below. |
| Fallback | Telegram didn't open? Send this command to @bot in any Telegram app. |
| Alternate client | Use the Telegram desktop app instead / Use Telegram Web instead |
| In-app browser | You're in an in-app browser. If Telegram doesn't open, open this page in your default browser. |
| Copy result | Copied. / Could not copy. Select the command and copy it manually. |
| Expired | That connect link expired. Connect again to get a new one. |
| Connected | Connected: {id} / Disconnect |
| Manual | Use a chat ID manually / Chat ID |
| Manual error | Enter a numeric chat ID, e.g. 123456789. |
| Message | Message / n/4096 |
| Send | Send message / Sending… / Message sent. |
| Connected result | Telegram connected. |
| Network error | Could not reach the API. Check that the backend is running. |
| Preview empty | Your message appears here. |
| Preview buttons | Mark done ✅ / Snooze ⏰ |

## States and accessibility
- Focus: `2px solid --accent`, 2px offset, on buttons, links, inputs, textarea,
  and summary. Never remove the native focus indication without a replacement.
- Text contrast: body, muted, accent, error, and warning text meet WCAG AA on
  their backgrounds in both themes.
- Non-text contrast: interactive borders and the focus ring meet 3:1.
- Each state has a live region: API status, pending/connect feedback, copy
  feedback, chat ID error, and the result line (`role="status"`). The result
  line is atomic.
- The chat ID input is described by its hint and inline error and sets
  `aria-invalid` when the value is not numeric. The message textarea is described
  by the counter.
- Fields and Send are one form. Enter in the chat ID submits; Enter in the
  textarea inserts a newline. While sending, the form is `aria-busy` and the
  fields are read-only.
- The textarea and preview bubble use `dir="auto"` so right-to-left messages
  render correctly without flipping the surrounding UI.
- Status dots are `aria-hidden`; their text carries the meaning. Invalid and
  error states use text, not color alone.
- The preview actions are `aria-hidden` and not focusable.
- Theme follows `prefers-color-scheme`. No animations or transitions.
- Reduced motion needs no special case because nothing moves.

## Responsive
- Single column at all widths. Card shrinks to viewport minus 32px.
- No breakpoints. At very narrow widths the header wraps, the connected row
  wraps, and the command, bubble, and result text break long strings.
- Preview buttons stay side by side; their labels are short enough for a 320px
  viewport.
