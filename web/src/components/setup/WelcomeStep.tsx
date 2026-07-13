import { useState, useEffect } from 'react';
import { setup, SetupStatusResponse } from '../../lib/api';
import type { StepProps } from '../../pages/Setup';
import { errMsg } from '../../lib/utils';

export function WelcomeStep({ data, onChange }: StepProps) {
  const [status, setStatus] = useState<SetupStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setup.getStatus()
      .then((s) => setStatus(s))
      .catch((err) => setError(errMsg(err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="step-content">
      <h2 className="step-title">Welcome to Teleton Setup</h2>
      <p className="step-description">
        Configure your autonomous Telegram agent in a few steps.
      </p>

      <details className="guide-dropdown">
        <summary>Security Notice</summary>
        <div className="guide-content">
          This software is an autonomous AI agent that can:
          <ul style={{ margin: '8px 0 8px 20px' }}>
            <li>Send and receive Telegram messages on your behalf</li>
            <li>Execute cryptocurrency transactions using your wallet</li>
            <li>Access and store conversation data</li>
            <li>Make decisions and take actions autonomously</li>
          </ul>
          You are solely responsible for all actions taken by this agent.
          By proceeding, you acknowledge that you understand these risks
          and accept full responsibility for the agent's behavior.
          <br /><br />
          <strong>Never share your API keys, wallet mnemonics, or session files.</strong>
        </div>
      </details>

      <div className="form-group">
        <label>Agent Name</label>
        <input
          type="text"
          value={data.agentName}
          onChange={(e) => onChange({ ...data, agentName: e.target.value })}
          placeholder="Nova"
          className="w-full"
        />
        <div className="helper-text">
          Your agent's display name in conversations.
        </div>
      </div>

      <div className="form-group">
        <label>Telegram Mode</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className={data.telegramMode === 'user' ? 'btn-active' : 'btn-ghost'}
            onClick={() => onChange({ ...data, telegramMode: 'user' })}
            style={{ flex: 1 }}
          >
            User Account
          </button>
          <button
            type="button"
            className={data.telegramMode === 'bot' ? 'btn-active' : 'btn-ghost'}
            onClick={() => onChange({ ...data, telegramMode: 'bot' })}
            style={{ flex: 1 }}
          >
            Bot
          </button>
        </div>
        <div className="helper-text">
          {data.telegramMode === 'user'
            ? 'Full access via your Telegram account (MTProto). Requires API ID, hash, and phone.'
            : 'Runs as a Telegram Bot (Bot API). Requires only a bot token. Some features are unavailable.'}
        </div>
      </div>

      {status?.configExists && (
        <div className="info-box">
          Existing configuration detected. It will be overwritten when setup completes.
        </div>
      )}

      {error && <div className="alert error">{error}</div>}

      {/* Risk checkbox moved to setup-nav bar (Setup.tsx) for inline layout with Next button */}

      {loading && <div className="loading">Checking workspace...</div>}
    </div>
  );
}
