import { useEffect, useState } from 'react';
import './App.css';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const CHAT_ID_KEY = 'telegram-demo:chat-id';
const LINKED_KEY = 'telegram-demo:linked';
const MAX_MESSAGE_LENGTH = 4096;

/** Nest validation errors arrive as string or string[]; flatten either. */
function readErrorMessage(payload, fallback) {
  if (!payload) return fallback;
  if (Array.isArray(payload.message)) return payload.message.join(' ');
  if (typeof payload.message === 'string') return payload.message;
  return fallback;
}

function storedChatId() {
  return localStorage.getItem(CHAT_ID_KEY) ?? '';
}

export default function App() {
  const [chatId, setChatId] = useState(storedChatId);
  const [linked, setLinked] = useState(
    () => localStorage.getItem(LINKED_KEY) === '1' && /^-?\d+$/.test(storedChatId()),
  );
  const [message, setMessage] = useState('Test notification');
  const [status, setStatus] = useState(null);
  const [sending, setSending] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [pendingLink, setPendingLink] = useState(null);
  const [botInfo, setBotInfo] = useState(null);
  const [apiOnline, setApiOnline] = useState(null);

  // Health + bot identity, so the button can name the bot before it is clicked.
  useEffect(() => {
    const controller = new AbortController();

    fetch(`${API_BASE}/api/telegram/health`, { signal: controller.signal })
      .then((response) => setApiOnline(response.ok))
      .catch(() => setApiOnline(false));

    fetch(`${API_BASE}/api/telegram/bot`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setBotInfo(data))
      .catch(() => setBotInfo(null));

    return () => controller.abort();
  }, []);

  // Poll while the user is in Telegram pressing Start.
  useEffect(() => {
    if (!pendingLink) return undefined;

    let cancelled = false;

    const timer = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE}/api/telegram/link/${pendingLink.code}`);
        const payload = await response.json().catch(() => null);

        if (cancelled || !payload) return;

        if (payload.status === 'connected') {
          const connectedChatId = String(payload.chatId);
          setChatId(connectedChatId);
          setLinked(true);
          setPendingLink(null);
          localStorage.setItem(CHAT_ID_KEY, connectedChatId);
          localStorage.setItem(LINKED_KEY, '1');
          setStatus({
            type: 'success',
            text: 'Telegram connected. Send your first notification!',
          });
        } else if (payload.status === 'expired') {
          setPendingLink(null);
          setStatus({
            type: 'error',
            text: 'That connect link expired. Click Connect Telegram to try again.',
          });
        }
      } catch {
        // Transient network blip: keep polling until the link expires.
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pendingLink]);

  async function handleConnect() {
    setConnecting(true);
    setStatus(null);

    try {
      const response = await fetch(`${API_BASE}/api/telegram/link`, { method: 'POST' });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(readErrorMessage(payload, 'Could not start the Telegram connection.'));
      }

      setPendingLink(payload);
      if (payload.username) {
        setBotInfo({ username: payload.username, deepLink: `https://t.me/${payload.username}` });
      }

      // Called from a click handler, so popup blockers normally allow this.
      // We prefer the web.telegram.org URL (handles bot start payloads correctly
      // inside Telegram Web) and fall back to the t.me link.
      window.open(payload.webLink || payload.deepLink, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setStatus({
        type: 'error',
        text:
          error instanceof TypeError
            ? `Could not reach the API at ${API_BASE}. Is the backend running?`
            : error.message,
      });
    } finally {
      setConnecting(false);
    }
  }

  function handleDisconnect() {
    setChatId('');
    setLinked(false);
    setPendingLink(null);
    setStatus(null);
    localStorage.removeItem(CHAT_ID_KEY);
    localStorage.removeItem(LINKED_KEY);
  }

  function handleManualChatIdChange(event) {
    setChatId(event.target.value);
    if (linked) {
      setLinked(false);
      localStorage.removeItem(LINKED_KEY);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const trimmedChatId = chatId.trim();
    const trimmedMessage = message.trim();

    if (!trimmedChatId) {
      setStatus({
        type: 'error',
        text: 'Connect Telegram first, or open "Use a Chat ID manually" below.',
      });
      return;
    }

    if (!/^-?\d+$/.test(trimmedChatId)) {
      setStatus({ type: 'error', text: 'Enter a numeric chat ID, e.g. 123456789.' });
      return;
    }

    if (!trimmedMessage) {
      setStatus({ type: 'error', text: 'Write a message before sending.' });
      return;
    }

    setSending(true);
    setStatus({ type: 'pending', text: 'Sending…' });
    localStorage.setItem(CHAT_ID_KEY, trimmedChatId);

    try {
      const response = await fetch(`${API_BASE}/api/telegram/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: trimmedChatId, message: trimmedMessage }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(readErrorMessage(payload, `Request failed with status ${response.status}.`));
      }

      setStatus({
        type: 'success',
        text: `Notification sent to chat ${trimmedChatId}.`,
      });
    } catch (error) {
      const isNetworkError = error instanceof TypeError;
      setStatus({
        type: 'error',
        text: isNetworkError
          ? `Could not reach the API at ${API_BASE}. Is the backend running?`
          : error.message,
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="page">
      <section className="card" aria-labelledby="title">
        <header className="card__header">
          <div className="brand" aria-hidden="true">
            ✈️
          </div>
          <div>
            <h1 id="title">Telegram Notifier</h1>
            <p className="subtitle">Connect Telegram, then send a message with one-tap actions.</p>
          </div>
          <span
            className={`pill ${apiOnline === null ? 'pill--idle' : apiOnline ? 'pill--online' : 'pill--offline'}`}
            title={`${API_BASE}/api/telegram/health`}
          >
            <span className="pill__dot" aria-hidden="true" />
            {apiOnline === null ? 'Checking API' : apiOnline ? 'API online' : 'API offline'}
          </span>
        </header>

        <form className="form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <span className="field__label">Recipient</span>

            {linked ? (
              <div className="connected">
                <span className="connected__dot" aria-hidden="true" />
                <div className="connected__text">
                  <strong>Telegram connected</strong>
                  <span className="hint">Chat ID {chatId}</span>
                </div>
                <button type="button" className="text-button" onClick={handleDisconnect}>
                  Disconnect
                </button>
              </div>
            ) : pendingLink ? (
              <div className="connect connect--pending">
                <p className="connect__text">
                  <strong>Waiting for Telegram…</strong> Press <strong>Start</strong> in the chat
                  that just opened.
                </p>
                <div className="connect__actions">
                  <a
                    className="text-link"
                    href={pendingLink.webLink || pendingLink.deepLink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Telegram again
                  </a>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setPendingLink(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="connect">
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={handleConnect}
                  disabled={connecting}
                >
                  {connecting
                    ? 'Opening Telegram…'
                    : `Connect Telegram${botInfo?.username ? ` (@${botInfo.username})` : ''}`}
                </button>
                <p className="hint">
                  Opens {botInfo?.username ? `@${botInfo.username}` : 'our bot'} in Telegram. Press{' '}
                  <strong>Start</strong> once — your Chat ID is filled in automatically.
                </p>
              </div>
            )}
          </div>

          <details className="manual">
            <summary>Use a Chat ID manually</summary>
            <div className="field manual__field">
              <label htmlFor="chatId">Chat ID</label>
              <input
                id="chatId"
                name="chatId"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="123456789"
                value={chatId}
                onChange={handleManualChatIdChange}
              />
              <p className="hint">
                Message the bot with <strong>/start</strong> and it will reply with your Chat ID.
              </p>
            </div>
          </details>

          <div className="field">
            <div className="label-row">
              <label htmlFor="message">Notification Message</label>
              <span
                className={`counter ${message.length > MAX_MESSAGE_LENGTH ? 'counter--over' : ''}`}
              >
                {message.length}/{MAX_MESSAGE_LENGTH}
              </span>
            </div>
            <textarea
              id="message"
              name="message"
              rows={5}
              maxLength={MAX_MESSAGE_LENGTH}
              placeholder="Deploy finished — take a look when you can."
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </div>

          <button className="button" type="submit" disabled={sending}>
            {sending ? 'Sending…' : 'Send Notification'}
          </button>

          <div className="status" role="status" aria-live="polite">
            {status && (
              <span className={`badge badge--${status.type}`}>
                <span aria-hidden="true">
                  {status.type === 'success' ? '✓' : status.type === 'error' ? '!' : '…'}
                </span>
                {status.text}
              </span>
            )}
          </div>
        </form>

        <footer className="card__footer">
          <span className="preview-label">What your recipient will see</span>
          <div className="bubble">
            <p>{message.trim() || 'Your notification text'}</p>
            <div className="keyboard" aria-hidden="true">
              <span>Mark Done ✅</span>
              <span>Snooze ⏰</span>
            </div>
          </div>
        </footer>
      </section>
    </main>
  );
}
