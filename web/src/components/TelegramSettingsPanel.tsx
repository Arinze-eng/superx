import { PillTabs } from './PillTabs';
import { EditableField } from './EditableField';
import { InfoTip } from './InfoTip';
import { ArrayInput } from './ArrayInput';
import type { ConfigKeyData } from '../lib/api';

// Global "who does the agent respond to" policy — same All/List/Admin/Off
// vocabulary as per-tool access levels, but persisted as the policy enum.
export const POLICY_OPTIONS = [
  { value: 'open', label: 'All' },
  { value: 'allowlist', label: 'List' },
  { value: 'admin-only', label: 'Admin' },
  { value: 'disabled', label: 'Off' },
];

interface TelegramSettingsPanelProps {
  getLocal: (key: string) => string;
  getServer?: (key: string) => string;
  setLocal: (key: string, value: string) => void;
  saveConfig: (key: string, value: string) => Promise<void>;
  cancelLocal?: (key: string) => void;
  configKeys?: ConfigKeyData[];
  onArraySave?: (key: string, values: string[]) => Promise<void>;
  extended?: boolean;
}

function getArrayValue(raw: string): string[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw).map(String);
  } catch {
    return [];
  }
}

export function TelegramSettingsPanel({
  getLocal,
  getServer = () => '',
  setLocal,
  saveConfig,
  cancelLocal = () => {},
  onArraySave,
  extended,
}: TelegramSettingsPanelProps) {
  const telegramTitle = (
    <div className="card-header">
      <div className="section-title">Telegram</div>
    </div>
  );

  const telegramCore = (
    <>
      <div style={{ display: 'grid', gap: '16px' }}>

        {/* ── Identity ──────────────────────────────────────────── */}
        {extended && (
          <div style={{ display: 'grid', gap: '12px' }}>
            <EditableField
              label="Bot Username"
              description="Bot username without @"
              configKey="telegram.bot_username"
              value={getLocal('telegram.bot_username')}
              serverValue={getServer('telegram.bot_username')}
              onChange={(v) => setLocal('telegram.bot_username', v)}
              onSave={(v) => saveConfig('telegram.bot_username', v)}
              onCancel={() => cancelLocal('telegram.bot_username')}
            />
            <EditableField
              label="Owner Name"
              description="Owner's first name (used in system prompt)"
              configKey="telegram.owner_name"
              value={getLocal('telegram.owner_name')}
              serverValue={getServer('telegram.owner_name')}
              onChange={(v) => setLocal('telegram.owner_name', v)}
              onSave={(v) => saveConfig('telegram.owner_name', v)}
              onCancel={() => cancelLocal('telegram.owner_name')}
            />
            <EditableField
              label="Owner Username"
              description="Owner's Telegram username (without @)"
              configKey="telegram.owner_username"
              value={getLocal('telegram.owner_username')}
              serverValue={getServer('telegram.owner_username')}
              onChange={(v) => setLocal('telegram.owner_username', v)}
              onSave={(v) => saveConfig('telegram.owner_username', v)}
              onCancel={() => cancelLocal('telegram.owner_username')}
            />
            <EditableField
              label="Owner ID"
              description="Primary admin Telegram user ID (auto-added to Admin IDs)"
              configKey="telegram.owner_id"
              type="text"
              value={getLocal('telegram.owner_id')}
              serverValue={getServer('telegram.owner_id')}
              onChange={(v) => setLocal('telegram.owner_id', v)}
              onSave={(v) => saveConfig('telegram.owner_id', v)}
              onCancel={() => cancelLocal('telegram.owner_id')}
              placeholder="123456789"
            />
          </div>
        )}

        {/* ── Policies (2-column grid, immediate-save) ──────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                DM Policy
                <InfoTip text="Controls who can DM the agent. 'Open' = anyone, 'Allow Users' = only IDs in the allow list below, 'Admin Only' = only admins." />
              </span>
            </label>
            <PillTabs
              value={getLocal('telegram.dm_policy')}
              options={POLICY_OPTIONS}
              onChange={(v) => saveConfig('telegram.dm_policy', v)}
              ariaLabel="DM policy"
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                Group Policy
                <InfoTip text="Controls which group chats the agent responds in. 'Open' = all groups, 'Allow Groups' = only IDs in the allow list, 'Admin Only' = only admin-owned groups." />
              </span>
            </label>
            <PillTabs
              value={getLocal('telegram.group_policy')}
              options={POLICY_OPTIONS}
              onChange={(v) => saveConfig('telegram.group_policy', v)}
              ariaLabel="Group policy"
            />
          </div>
        </div>

        {/* ── Access Control — who 'List' / 'Admin' resolve to ── */}
        {onArraySave && (
          <div style={{ display: 'grid', gap: '14px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Admin IDs
                  <InfoTip text="Telegram user IDs with full control: can use all tools, bypass restrictions, and manage the agent. Backs the 'Admin' option." />
                </span>
              </label>
              <ArrayInput
                value={getArrayValue(getLocal('telegram.admin_ids'))}
                onChange={(values) => onArraySave('telegram.admin_ids', values)}
                validate={(v) => (/^\d+$/.test(v) ? null : 'Must be a number')}
                placeholder="Enter ID..."
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Allowed Users
                  <InfoTip text="Telegram user IDs allowed when DM Policy (or a tool) is set to 'List'." />
                </span>
              </label>
              <ArrayInput
                value={getArrayValue(getLocal('telegram.allow_from'))}
                onChange={(values) => onArraySave('telegram.allow_from', values)}
                validate={(v) => (/^\d+$/.test(v) ? null : 'Must be a number')}
                placeholder="Enter ID..."
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Allowed Groups
                  <InfoTip text="Group/channel IDs allowed when Group Policy is set to 'List'." />
                </span>
              </label>
              <ArrayInput
                value={getArrayValue(getLocal('telegram.group_allow_from'))}
                onChange={(values) => onArraySave('telegram.group_allow_from', values)}
                validate={(v) => (/^\d+$/.test(v) ? null : 'Must be a number')}
                placeholder="Enter ID..."
              />
            </div>
          </div>
        )}

        {/* ── Behavior (toggles, immediate-save) ────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={{ fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }} htmlFor="require-mention">
            Require Mention
            <InfoTip text="When on, the agent ignores group messages unless it's @mentioned. Keeps it quiet in busy chats." />
          </label>
          <label className="toggle">
            <input
              id="require-mention"
              type="checkbox"
              checked={getLocal('telegram.require_mention') === 'true'}
              onChange={(e) => saveConfig('telegram.require_mention', String(e.target.checked))}
            />
            <span className="toggle-track" />
            <span className="toggle-thumb" />
          </label>
        </div>
        {extended && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }} htmlFor="typing-sim">
              Typing Simulation
              <InfoTip text="Shows a 'typing...' bubble in the chat before the agent replies, like a real person." />
            </label>
            <label className="toggle">
              <input
                id="typing-sim"
                type="checkbox"
                checked={getLocal('telegram.typing_simulation') === 'true'}
                onChange={(e) => saveConfig('telegram.typing_simulation', String(e.target.checked))}
              />
              <span className="toggle-track" />
              <span className="toggle-thumb" />
            </label>
          </div>
        )}
      </div>
    </>
  );

  const telegramAdvancedTitle = (
    <div className="card-header">
      <div className="section-title">Advanced Telegram</div>
    </div>
  );

  const telegramAdvanced = (
    <>
      <div style={{ display: 'grid', gap: '16px' }}>

        {/* ── Tuning (EditableField) ────────────────────────── */}
            <div style={{ display: 'grid', gap: '12px' }}>
              <EditableField
                label="Debounce (ms)"
                description="Group message debounce delay in ms (0 = disabled)"
                configKey="telegram.debounce_ms"
                type="number"
                value={getLocal('telegram.debounce_ms')}
                serverValue={getServer('telegram.debounce_ms')}
                onChange={(v) => setLocal('telegram.debounce_ms', v)}
                onSave={(v) => saveConfig('telegram.debounce_ms', v)}
                onCancel={() => cancelLocal('telegram.debounce_ms')}
                min={0}
                step={100}
                inline
              />
              <EditableField
                label="Max Message Length"
                description="Maximum message length in characters"
                configKey="telegram.max_message_length"
                type="number"
                value={getLocal('telegram.max_message_length')}
                serverValue={getServer('telegram.max_message_length')}
                onChange={(v) => setLocal('telegram.max_message_length', v)}
                onSave={(v) => saveConfig('telegram.max_message_length', v)}
                onCancel={() => cancelLocal('telegram.max_message_length')}
                min={1}
                step={100}
                inline
              />
            </div>

            {/* ── Rate Limits (EditableField, restart badge) ────── */}
            <div style={{ display: 'grid', gap: '12px' }}>
              <EditableField
                label="Rate Limit · Messages/sec"
                description="Rate limit: messages per second (requires restart)"
                configKey="telegram.rate_limit_messages_per_second"
                type="number"
                value={getLocal('telegram.rate_limit_messages_per_second')}
                serverValue={getServer('telegram.rate_limit_messages_per_second')}
                onChange={(v) => setLocal('telegram.rate_limit_messages_per_second', v)}
                onSave={(v) => saveConfig('telegram.rate_limit_messages_per_second', v)}
                onCancel={() => cancelLocal('telegram.rate_limit_messages_per_second')}
                hotReload="restart"
                min={0}
                step={0.1}
                inline
              />
              <EditableField
                label="Rate Limit · Groups/min"
                description="Rate limit: groups per minute (requires restart)"
                configKey="telegram.rate_limit_groups_per_minute"
                type="number"
                value={getLocal('telegram.rate_limit_groups_per_minute')}
                serverValue={getServer('telegram.rate_limit_groups_per_minute')}
                onChange={(v) => setLocal('telegram.rate_limit_groups_per_minute', v)}
                onSave={(v) => saveConfig('telegram.rate_limit_groups_per_minute', v)}
                onCancel={() => cancelLocal('telegram.rate_limit_groups_per_minute')}
                hotReload="restart"
                min={1}
                inline
              />
            </div>
      </div>
    </>
  );

  if (extended) {
    return (
      <>
        {telegramTitle}
        <div className="card">{telegramCore}</div>
        {telegramAdvancedTitle}
        <div className="card">{telegramAdvanced}</div>
      </>
    );
  }

  return (
    <>
      {telegramTitle}
      {telegramCore}
    </>
  );
}
