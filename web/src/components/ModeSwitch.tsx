import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ModeData {
  mode: 'user' | 'bot';
  canSwitchToBot: boolean;
  canSwitchToUser: boolean;
}

export function ModeSwitch() {
  const [data, setData] = useState<ModeData | null>(null);
  const [switching, setSwitching] = useState(false);
  const [showModal, setShowModal] = useState<'bot' | 'user' | null>(null);

  // Bot credentials
  const [botToken, setBotToken] = useState('');
  const [botValidating, setBotValidating] = useState(false);
  const [botInfo, setBotInfo] = useState<{ username: string } | null>(null);
  const [botError, setBotError] = useState('');

  // User credentials
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [phone, setPhone] = useState('');

  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/agent/mode', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {});
  }, []);

  const closeModal = () => {
    setShowModal(null);
    setBotToken('');
    setBotInfo(null);
    setBotError('');
    setApiId('');
    setApiHash('');
    setPhone('');
    setError('');
  };

  const validateBotToken = async (token: string) => {
    if (!/^[0-9]+:[A-Za-z0-9_-]+$/.test(token)) {
      setBotError('Invalid format (expected id:hash)');
      return;
    }
    setBotValidating(true);
    setBotError('');
    try {
      const res = await fetch('/setup/validate/bot-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const result = await res.json();
      if (result.data?.valid) {
        setBotInfo({ username: result.data.bot?.username || 'unknown' });
        setBotError('');
      } else {
        setBotError(result.data?.error || 'Invalid token');
        setBotInfo(null);
      }
    } catch {
      setBotError('Validation failed');
    } finally {
      setBotValidating(false);
    }
  };

  const doSwitch = async (
    targetMode: 'user' | 'bot',
    opts?: { botToken?: string; userCredentials?: { apiId: number; apiHash: string; phone: string } }
  ) => {
    setSwitching(true);
    setError('');
    try {
      const res = await fetch('/api/agent/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mode: targetMode, ...opts }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || 'Switch failed');
        return;
      }
      setData({ mode: targetMode, canSwitchToBot: true, canSwitchToUser: true });
      closeModal();
    } catch {
      setError('Network error');
    } finally {
      setSwitching(false);
    }
  };

  const handleToggle = (targetMode: 'user' | 'bot') => {
    if (!data || targetMode === data.mode || switching) return;

    if (targetMode === 'bot' && !data.canSwitchToBot) {
      setShowModal('bot');
      return;
    }

    if (targetMode === 'user' && !data.canSwitchToUser) {
      setShowModal('user');
      return;
    }

    // Credentials exist, switch directly
    doSwitch(targetMode);
  };

  const handleBotSubmit = () => {
    if (!botToken.trim() || !botInfo) return;
    doSwitch('bot', { botToken });
  };

  const handleUserSubmit = () => {
    const id = parseInt(apiId);
    if (!id || !apiHash.trim() || !phone.trim()) return;
    doSwitch('user', { userCredentials: { apiId: id, apiHash, phone } });
  };

  if (!data) return null;

  return (
    <div style={{ padding: '0 4px', marginBottom: '8px' }}>
      <div className="pill-bar" style={{ display: 'flex', width: '100%', marginBottom: 0 }}>
        <button
          type="button"
          className={data.mode === 'user' ? 'active' : ''}
          style={{ flex: 1 }}
          disabled={switching}
          onClick={() => handleToggle('user')}
        >User</button>
        <button
          type="button"
          className={data.mode === 'bot' ? 'active' : ''}
          style={{ flex: 1 }}
          disabled={switching}
          onClick={() => handleToggle('bot')}
        >Bot</button>
      </div>

      {switching && (
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
          Restarting agent...
        </div>
      )}

      {error && !showModal && (
        <div style={{ fontSize: '11px', color: 'var(--red)', marginTop: '4px', lineHeight: '1.3' }}>
          {error}
        </div>
      )}

      {/* ── Bot Token Modal ── */}
      {showModal === 'bot' && createPortal(
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <h2 style={{ fontSize: 'var(--font-lg)', fontWeight: 600, marginBottom: '4px' }}>
              Switch to Bot Mode
            </h2>
            <p style={{ fontSize: 'var(--font-sm)', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 'var(--leading-normal)' }}>
              Enter your bot token from <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>@BotFather</a>. Your existing config will be preserved.
            </p>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label>Bot Token</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="password"
                  value={botToken}
                  onChange={e => {
                    setBotToken(e.target.value);
                    setBotInfo(null);
                    setBotError('');
                  }}
                  placeholder="123456:ABC-DEF..."
                  style={{ flex: 1 }}
                />
                <button
                  className="btn-ghost"
                  disabled={!botToken.trim() || botValidating}
                  onClick={() => validateBotToken(botToken)}
                  style={{ whiteSpace: 'nowrap', fontSize: 'var(--font-sm)' }}
                >{botValidating ? 'Checking...' : 'Validate'}</button>
              </div>
              {botInfo && (
                <div style={{ fontSize: 'var(--font-sm)', color: 'var(--accent)', marginTop: '6px' }}>
                  @{botInfo.username}
                </div>
              )}
              {botError && (
                <div style={{ fontSize: 'var(--font-sm)', color: 'var(--red)', marginTop: '6px' }}>
                  {botError}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={closeModal} style={{ fontSize: 'var(--font-sm)' }}>
                Cancel
              </button>
              <button
                disabled={!botInfo || switching}
                onClick={handleBotSubmit}
                style={{ fontSize: 'var(--font-sm)' }}
              >{switching ? 'Switching...' : 'Switch to Bot'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── User Credentials Modal ── */}
      {showModal === 'user' && createPortal(
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <h2 style={{ fontSize: 'var(--font-lg)', fontWeight: 600, marginBottom: '4px' }}>
              Switch to User Mode
            </h2>
            <p style={{ fontSize: 'var(--font-sm)', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 'var(--leading-normal)' }}>
              Get your credentials from{' '}
              <a href="https://my.telegram.org/apps" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
                my.telegram.org/apps
              </a>. Your bot config will be preserved.
            </p>

            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label>API ID</label>
              <input
                type="text"
                inputMode="numeric"
                value={apiId}
                onChange={e => setApiId(e.target.value.replace(/\D/g, ''))}
                placeholder="12345678"
                className="w-full"
              />
            </div>

            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label>API Hash</label>
              <input
                type="text"
                value={apiHash}
                onChange={e => setApiHash(e.target.value)}
                placeholder="0123456789abcdef..."
                className="w-full"
              />
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label>Phone Number</label>
              <input
                type="text"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+1234567890"
                className="w-full"
              />
            </div>

            {error && (
              <div style={{ fontSize: 'var(--font-sm)', color: 'var(--red)', marginBottom: '12px' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={closeModal} style={{ fontSize: 'var(--font-sm)' }}>
                Cancel
              </button>
              <button
                disabled={!apiId || !apiHash.trim() || !phone.trim() || switching}
                onClick={handleUserSubmit}
                style={{ fontSize: 'var(--font-sm)' }}
              >{switching ? 'Switching...' : 'Switch to User'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
