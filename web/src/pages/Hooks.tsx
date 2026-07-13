import { useState, useRef, useCallback, useEffect, Fragment } from 'react';
import { api } from '../lib/api';
import { errMsg } from '../lib/utils';
import { List, ListRow } from '../components/List';
import { useResource } from '../hooks/useResource';
import { Alert } from '../components/Alert';
import { SkeletonRows } from '../components/Skeleton';
import { toast } from '../lib/toast';
import { useConfirm } from '../components/ConfirmDialog';

interface TriggerEntry {
  id: string;
  keyword: string;
  context: string;
  enabled: boolean;
}

interface BlocklistData {
  enabled: boolean;
  keywords: string[];
  message: string;
}

interface HooksData {
  blocklist: BlocklistData;
  triggers: TriggerEntry[];
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <label className="toggle" style={{ margin: 0 }}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="toggle-track" />
      <span className="toggle-thumb" />
    </label>
  );
}

// ── BlocklistCard ──────────────────────────────────────────────────────────

function BlocklistCard({ initialData, onError }: { initialData: BlocklistData; onError: (msg: string | null) => void }) {
  const [enabled, setEnabled] = useState(initialData.enabled);
  const [keywords, setKeywords] = useState<string[]>(initialData.keywords);
  const [message, setMessage] = useState(initialData.message);
  const [input, setInput] = useState('');

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef<BlocklistData>(initialData);
  ref.current = { enabled, keywords, message };

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const save = useCallback((config: BlocklistData) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await api.updateBlocklist(config);
      } catch (err) {
        onError(errMsg(err));
        toast.error(errMsg(err));
      }
    }, 400);
  }, [onError]);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    save({ ...ref.current, enabled: next });
  };

  const addKeyword = () => {
    const kw = input.trim();
    if (kw.length < 2) return;
    if (keywords.includes(kw)) { setInput(''); return; }
    const next = [...keywords, kw];
    setKeywords(next);
    setInput('');
    save({ ...ref.current, keywords: next });
  };

  const removeKeyword = (kw: string) => {
    const next = keywords.filter((k) => k !== kw);
    setKeywords(next);
    save({ ...ref.current, keywords: next });
  };

  const changeMessage = (msg: string) => {
    setMessage(msg);
    save({ ...ref.current, message: msg });
  };

  return (
    <div className="card hooks-card">
      <div className="card-header hooks-card-head">
        <div>
          <div className="section-title">Keyword Blocklist</div>
          <p className="card-description">Messages containing these keywords are blocked. Word-boundary matching, no substrings.</p>
        </div>
        <Toggle checked={enabled} onChange={toggle} />
      </div>

      <div className={`hooks-body${enabled ? '' : ' dimmed'}`}>
        <div className="field">
          <label className="field-label">Keywords</label>
          <div className="chip-field">
            {keywords.map((kw) => (
              <span key={kw} className="chip">
                {kw}
                <button className="chip-remove" onClick={() => removeKeyword(kw)} aria-label={`Remove ${kw}`}>&#x2715;</button>
              </span>
            ))}
            <input
              className="chip-input"
              type="text"
              placeholder={keywords.length ? 'Add…' : 'Add a keyword…'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); addKeyword(); }
                if (e.key === 'Backspace' && !input && keywords.length) removeKeyword(keywords[keywords.length - 1]);
              }}
            />
          </div>
        </div>

        <div className="field">
          <label className="field-label">Block reply (optional)</label>
          <input
            type="text"
            placeholder="Message sent when a message is blocked…"
            value={message}
            onChange={(e) => changeMessage(e.target.value)}
            maxLength={500}
            style={{ width: '100%' }}
          />
        </div>
      </div>
    </div>
  );
}

// ── TriggersCard ───────────────────────────────────────────────────────────

const EMPTY = { keyword: '', context: '' };

function TriggersCard({ initialTriggers, onError }: { initialTriggers: TriggerEntry[]; onError: (msg: string | null) => void }) {
  const confirm = useConfirm();
  const [triggers, setTriggers] = useState<TriggerEntry[]>(initialTriggers);
  const [openId, setOpenId] = useState<string | null>(null); // trigger id, '__new__', or null
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const valid = form.keyword.trim().length >= 2 && form.context.trim().length >= 1;

  const openEdit = (t: TriggerEntry) => {
    if (openId === t.id) { setOpenId(null); return; }
    setOpenId(t.id);
    setForm({ keyword: t.keyword, context: t.context });
  };

  const openNew = () => {
    if (openId === '__new__') { setOpenId(null); return; }
    setOpenId('__new__');
    setForm(EMPTY);
  };

  const create = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const res = await api.createTrigger({ keyword: form.keyword.trim(), context: form.context.trim() });
      setTriggers((prev) => [...prev, res.data]);
      setOpenId(null);
      toast.success('Trigger created');
    } catch (err) {
      onError(errMsg(err));
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!valid || !openId) return;
    setSaving(true);
    try {
      const res = await api.updateTrigger(openId, { keyword: form.keyword.trim(), context: form.context.trim() });
      setTriggers((prev) => prev.map((t) => (t.id === openId ? res.data : t)));
      setOpenId(null);
      toast.success('Trigger updated');
    } catch (err) {
      onError(errMsg(err));
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!(await confirm({ message: 'Delete this trigger?', destructive: true, confirmLabel: 'Delete' }))) return;
    try {
      await api.deleteTrigger(id);
      setTriggers((prev) => prev.filter((t) => t.id !== id));
      setOpenId(null);
      toast.success('Trigger deleted');
    } catch (err) {
      onError(errMsg(err));
      toast.error(errMsg(err));
    }
  };

  const toggle = async (t: TriggerEntry) => {
    try {
      await api.toggleTrigger(t.id, !t.enabled);
      setTriggers((prev) => prev.map((x) => (x.id === t.id ? { ...x, enabled: !t.enabled } : x)));
    } catch (err) {
      onError(errMsg(err));
      toast.error(errMsg(err));
    }
  };

  // Rendered as a direct call (not <EditForm/>) so the inputs keep focus across keystrokes.
  const editForm = (onSubmit: () => void, submitLabel: string, onDelete?: () => void) => (
    <div className="ios-sublist hooks-edit">
      <input
        type="text"
        placeholder="Keyword (min 2 chars)"
        value={form.keyword}
        onChange={(e) => setForm((f) => ({ ...f, keyword: e.target.value }))}
        maxLength={100}
        style={{ width: '100%' }}
      />
      <textarea
        placeholder="Context to inject when the keyword is detected…"
        value={form.context}
        onChange={(e) => setForm((f) => ({ ...f, context: e.target.value }))}
        maxLength={2000}
        rows={3}
        style={{ width: '100%', resize: 'vertical' }}
      />
      <div className="hooks-edit-actions">
        {onDelete && <button className="btn-danger btn-sm" onClick={onDelete}>Delete</button>}
        <div style={{ flex: 1 }} />
        <button className="btn-ghost btn-sm" onClick={() => setOpenId(null)}>Cancel</button>
        <button className="btn-sm" onClick={onSubmit} disabled={saving || !valid}>
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </div>
  );

  return (
    <div className="card hooks-card">
      <div className="card-header hooks-card-head">
        <div>
          <div className="section-title">Context Triggers</div>
          <p className="card-description">When a keyword is detected, its context is injected into the LLM prompt.</p>
        </div>
        <span className="badge count">{triggers.length}/50</span>
      </div>

      <List>
        {triggers.map((t) => {
          const isOpen = openId === t.id;
          return (
            <Fragment key={t.id}>
              <ListRow
                className={t.enabled ? '' : 'dimmed'}
                leading="#"
                title={`“${t.keyword}”`}
                subtitle={t.context}
                trailing={<Toggle checked={t.enabled} onChange={() => toggle(t)} />}
                disclosure
                expanded={isOpen}
                onClick={() => openEdit(t)}
              />
              {isOpen && editForm(saveEdit, 'Save', () => remove(t.id))}
            </Fragment>
          );
        })}

        <ListRow
          className="hooks-add"
          leading={<span style={{ fontSize: '18px', lineHeight: 1 }}>+</span>}
          title="New trigger"
          disclosure
          expanded={openId === '__new__'}
          onClick={openNew}
        />
        {openId === '__new__' && editForm(create, 'Add')}
      </List>
    </div>
  );
}

// ── Hooks page ─────────────────────────────────────────────────────────────

export function Hooks() {
  const { data, loading, error, setError } = useResource<HooksData>(
    async () => {
      const [blockRes, trigRes] = await Promise.all([api.getBlocklist(), api.getTriggers()]);
      return { blocklist: blockRes.data, triggers: trigRes.data };
    },
    [],
  );

  return (
    <div>
      <div className="header">
        <h1>Hooks</h1>
        <p>Keyword blocklist and context injection triggers</p>
      </div>

      {error && <Alert type="error" message={error} onDismiss={() => setError(null)} style={{ marginBottom: '14px' }} />}

      {loading ? (
        <SkeletonRows />
      ) : data && (
        <>
          <BlocklistCard initialData={data.blocklist} onError={setError} />
          <TriggersCard initialTriggers={data.triggers} onError={setError} />
        </>
      )}
    </div>
  );
}
