import { useEffect, useState } from 'react';
import './App.css';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const CHAT_ID_KEY = 'telegram-demo:chat-id';
const LINKED_KEY = 'telegram-demo:linked';
const PENDING_LINK_KEY = 'telegram-demo:pending-link';
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

/**
 * Browsers cannot reliably tell whether the Telegram app is installed. On
 * mobile we therefore use the t.me link, which is a universal/app link: the OS
 * opens the app when present and falls back to the browser when it is not.
 */
function isMobileDevice() {
  const ua = navigator.userAgent || '';
  const uaData = navigator.userAgentData;
  const iPadOsDesktopMode = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;

  return (
    Boolean(uaData?.mobile) ||
    iPadOsDesktopMode ||
    /Android|iPhone|iPad|iPod|IEMobile|Opera Mini|Mobile/i.test(ua)
  );
}

/** In-app browsers often block app links and custom schemes. */
function isInAppBrowser() {
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|FB_IAB|Instagram|Line\/|Twitter|MicroMessenger|Snapchat|Pinterest/i.test(ua);
}

function telegramTarget(link) {
  if (!link) return '';
  return isMobileDevice() ? link.deepLink : link.webLink || link.deepLink;
}

/** Kept in sessionStorage so a reload / back navigation resumes polling. */
function isValidChatId(value) {
  return /^-?\d+$/.test(value);
}

function readPendingLink() {
  try {
    const raw = sessionStorage.getItem(PENDING_LINK_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed?.code) return null;

    if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() <= Date.now()) {
      sessionStorage.removeItem(PENDING_LINK_KEY);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function savePendingLink(link) {
  try {
    sessionStorage.setItem(PENDING_LINK_KEY, JSON.stringify(link));
  } catch {
    // Storage can be unavailable (private mode / embedded browsers).
  }
}

function clearPendingLink() {
  try {
    sessionStorage.removeItem(PENDING_LINK_KEY);
  } catch {
    // Ignore.
  }
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
  const [pendingLink, setPendingLink] = useState(readPendingLink);
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

  // Poll while the user is in Telegram pressing Start. Also polls immediately
  // when the tab becomes visible again (e.g. returning from the Telegram app).
  useEffect(() => {
    if (!pendingLink) return undefined;

    let cancelled = false;

    const checkStatus = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/telegram/link/${pendingLink.code}`);
        const payload = await response.json().catch(() => null);

        if (cancelled || !payload) return;

        if (payload.status === 'connected') {
          const connectedChatId = String(payload.chatId);
          setChatId(connectedChatId);
          setLinked(true);
          setPendingLink(null);
          clearPendingLink();
          localStorage.setItem(CHAT_ID_KEY, connectedChatId);
          localStorage.setItem(LINKED_KEY, '1');
          setStatus({
            type: 'success',
            text: 'Telegram connected.',
          });
        } else if (payload.status === 'expired') {
          setPendingLink(null);
          clearPendingLink();
          setStatus({
            type: 'error',
            text: 'That connect link expired. Connect again to get a new one.',
          });
        }
      } catch {
        // Transient network blip: keep polling until the link expires.
      }
    };

    void checkStatus();
    const timer = setInterval(checkStatus, 2000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void checkStatus();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
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
      savePendingLink(payload);
      if (payload.username) {
        setBotInfo({ username: payload.username, deepLink: `https://t.me/${payload.username}` });
      }

      // Mobile: t.me is a universal link, so the OS opens the Telegram app when
      // installed and the browser when it is not. Desktop: prefer Telegram Web,
      // whose URL handles the start payload correctly.
      const target = telegramTarget(payload);
      const opened = window.open(target, '_blank');

      if (opened) {
        try {
          opened.opener = null;
        } catch {
          // Cross-origin window; nothing to do.
        }
      } else {
        setStatus({
          type: 'pending',
          text: "Telegram didn't open automatically. Use Open Telegram again below.",
        });
      }
    } catch (error) {
      setStatus({
        type: 'error',
        text:
          error instanceof TypeError
            ? 'Could not reach the API. Check that the backend is running.'
            : error.message,
      });
    } finally {
      setConnecting(false);
    }
  }

  function handleCancelConnect() {
    setPendingLink(null);
    clearPendingLink();
    setStatus(null);
  }

  async function handleCopyCommand() {
    const command =
      pendingLink?.startCommand ?? (pendingLink ? `/start link_${pendingLink.code}` : '');

    if (!command) return;

    try {
      await navigator.clipboard.writeText(command);
      setStatus({
        type: 'success',
        text: 'Copied.',
      });
    } catch {
      setStatus({
        type: 'error',
        text: 'Could not copy. Select the command and copy it manually.',
      });
    }
  }

  function handleDisconnect() {
    setChatId('');
    setLinked(false);
    setPendingLink(null);
    clearPendingLink();
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
        text: 'Message sent.',
      });
    } catch (error) {
      const isNetworkError = error instanceof TypeError;
      setStatus({
        type: 'error',
        text: isNetworkError
          ? 'Could not reach the API. Check that the backend is running.'
          : error.message,
      });
    } finally {
      setSending(false);
    }
  }

  const mobile = isMobileDevice();
  const inApp = isInAppBrowser();
  const openTarget = telegramTarget(pendingLink);

  return (
    <main className="page">
      <section className="card" aria-labelledby="title">
        <header className="card__header">
          <h1 id="title">Telegram Notifier</h1>
          <span className="status" id="api-status" data-state={apiOnline === null ? 'checking' : apiOnline ? 'online' : 'offline'} role="status" aria-live="polite">
            <span className="status__dot" aria-hidden="true" />
            <span id="api-status-text">{apiOnline === null ? 'Checking API' : apiOnline ? 'API online' : 'API offline'}</span>
          </span>
        </header>
        <p className="subtitle">Send a message to Telegram with Mark done and Snooze buttons.</p>

        <form className="form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <span className="field__label">Recipient</span>

            {linked ? (
              <div className="connected">
                <span className="connected__label">Connected: <span>{chatId}</span></span>
                <button type="button" className="link-button" onClick={handleDisconnect}>Disconnect</button>
              </div>
            ) : pendingLink ? (
              <div className="panel" id="pending-view">
                <p className="panel__title">Waiting for Telegram…</p>
                <p className="panel__text">Press <strong>Start</strong> in the chat that just opened.</p>
                <div className="panel__actions">
                  <a className="link" href={openTarget} target="_blank" rel="noreferrer">Open Telegram again</a>
                  <button type="button" className="link-button" onClick={handleCancelConnect}>Cancel</button>
                </div>

                <div className="panel__fallback">
                  <p className="hint hint--warn" hidden={!inApp}>
                    You&apos;re in an in-app browser. If Telegram doesn&apos;t open, open this page in your default browser.
                  </p>
                  <p className="hint">
                    Telegram didn&apos;t open? Send this command to{' '}
                    {botInfo?.username ? `@${botInfo.username}` : 'the bot'} in any Telegram app.
                  </p>
                  <div className="command-row">
                    <code className="command">
                      {pendingLink.startCommand || `/start link_${pendingLink.code}`}
                    </code>
                    <button type="button" onClick={handleCopyCommand}>Copy</button>
                  </div>
                  <a
                    className="link"
                    href={mobile ? (pendingLink.webLink || pendingLink.deepLink) : pendingLink.deepLink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {mobile ? 'Use Telegram Web instead' : 'Use the Telegram desktop app instead'}
                  </a>
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
                    : botInfo?.username ? `Connect @${botInfo.username}` : 'Connect Telegram'}
                </button>
                <p className="hint">
                  Opens {botInfo?.username ? `@${botInfo.username}` : 'our bot'} in Telegram. Press{' '}
                  <strong>Start</strong> once — your chat ID is filled in automatically.
                </p>
              </div>
            )}
          </div>

          <details className="manual" id="manual">
            <summary>Use a chat ID manually</summary>
            <div className="field manual__field">
              <label htmlFor="chatId">Chat ID</label>
              <input
                id="chatId"
                name="chatId"
                type="text"
                inputMode="text"
                autoComplete="off"
                spellCheck="false"
                placeholder="123456789"
                value={chatId}
                onChange={handleManualChatIdChange}
                aria-invalid={!isValidChatId(chatId.trim()) && chatId.trim() !== '' ? 'true' : 'false'}
                aria-describedby="chat-hint chat-error"
              />
              <p className="hint" id="chat-hint">Message the bot with <strong>/start</strong> and it will reply with your chat ID.</p>
            </div>
          </details>
          <p className="error" id="chat-error" role="status" hidden={chatId.trim() === '' || isValidChatId(chatId.trim())}>
            {!chatId.trim() ? '' : 'Enter a numeric chat ID, e.g. 123456789.'}
          </p>

          <div className="field">
            <div className="label-row">
              <label htmlFor="message">Message</label>
              <span className="count"><span id="counter">{message.length}</span>/4096</span>
            </div>
            <textarea
              id="message"
              name="message"
              rows={5}
              maxLength={MAX_MESSAGE_LENGTH}
              placeholder="Deploy finished — take a look when you can."
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              dir="auto"
            />
          </div>

          <button className="button primary" type="submit" disabled={sending} aria-disabled={sending ? 'true' : 'false'}>
            {sending ? 'Sending…' : 'Send message'}
          </button>
          <p className={`result ${status ? (status.type === 'pending' ? 'pending' : status.type === 'success' ? 'success' : status.type === 'error' ? 'error' : '') : ''}`} id="result" role="status" aria-live="polite" aria-atomic="true">
            {status ? status.text : null}
          </p>

          <section className="preview" aria-label="Preview">
            <span className="label">Preview</span>
            <div className="bubble" dir="auto">{message.trim() || 'Your message appears here.'}</div>
            <div className="actions" aria-hidden="true">
              <span>Mark done ✅</span>
              <span>Snooze ⏰</span>
            </div>
          </section>
        </form>
      </section>
    </main>
  );
}
