import { useEffect, useState } from 'react';
import './App.css';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const CHAT_ID_KEY = 'telegram-demo:chat-id';
const MAX_MESSAGE_LENGTH = 4096;

/** Nest validation errors arrive as string or string[]; flatten either. */
function readErrorMessage(payload, fallback) {
  if (!payload) return fallback;
  if (Array.isArray(payload.message)) return payload.message.join(' ');
  if (typeof payload.message === 'string') return payload.message;
  return fallback;
}

export default function App() {
  const [chatId, setChatId] = useState(() => localStorage.getItem(CHAT_ID_KEY) ?? '');
  const [message, setMessage] = useState('Test notification');
  const [status, setStatus] = useState(null);
  const [sending, setSending] = useState(false);
  const [apiOnline, setApiOnline] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${API_BASE}/api/telegram/health`, { signal: controller.signal })
      .then((response) => setApiOnline(response.ok))
      .catch(() => setApiOnline(false));

    return () => controller.abort();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();

    const trimmedChatId = chatId.trim();
    const trimmedMessage = message.trim();

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
        text: `Notification sent to ${trimmedChatId}.`,
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
            <p className="subtitle">Send yourself a message with one-tap actions.</p>
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
            <label htmlFor="chatId">Chat ID</label>
            <input
              id="chatId"
              name="chatId"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="123456789"
              value={chatId}
              onChange={(event) => setChatId(event.target.value)}
            />
            <p className="hint">
              Open your bot in Telegram, tap <strong>/start</strong>, and it will reply with your
              Chat ID.
            </p>
          </div>

          <div className="field">
            <div className="label-row">
              <label htmlFor="message">Notification Message</label>
              <span className={`counter ${message.length > MAX_MESSAGE_LENGTH ? 'counter--over' : ''}`}>
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
          <span className="preview-label">What you will receive</span>
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
