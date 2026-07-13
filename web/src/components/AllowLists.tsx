import { useState } from 'react';
import { Segmented } from './Segmented';

interface AllowListsProps {
  getLocal: (key: string) => string;
  onSave: (key: string, values: string[]) => void;
}

type ListKey = 'telegram.admin_ids' | 'telegram.allow_from' | 'telegram.group_allow_from';

const LISTS: { key: ListKey; label: string; empty: string }[] = [
  { key: 'telegram.admin_ids', label: 'Admins', empty: 'No admins yet' },
  { key: 'telegram.allow_from', label: 'Users', empty: 'No allowed users yet' },
  { key: 'telegram.group_allow_from', label: 'Groups', empty: 'No allowed groups yet' },
];

function parseIds(raw: string): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export function AllowLists({ getLocal, onSave }: AllowListsProps) {
  const [tab, setTab] = useState<ListKey>(LISTS[0].key);
  const [draft, setDraft] = useState('');

  const active = LISTS.find((l) => l.key === tab)!;
  const ids = parseIds(getLocal(tab));

  const add = () => {
    const v = draft.trim();
    setDraft('');
    if (!/^\d+$/.test(v) || ids.includes(v)) return;
    onSave(tab, [...ids, v]);
  };
  const remove = (id: string) => onSave(tab, ids.filter((x) => x !== id));

  return (
    <div className="allowlists">
      <Segmented<ListKey>
        value={tab}
        onChange={setTab}
        ariaLabel="Allow list"
        options={LISTS.map((l) => ({ value: l.key, label: `${l.label} ${parseIds(getLocal(l.key)).length}` }))}
      />

      <div className="allowlist-rows">
        {ids.length === 0 ? (
          <div className="allowlist-empty">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>{active.empty}</span>
          </div>
        ) : (
          ids.map((id) => (
            <div key={id} className="allowlist-row">
              <span className="allowlist-id">{id}</span>
              <button className="allowlist-clear" aria-label={`Remove ${id}`} onClick={() => remove(id)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>

      <div className="allowlist-add">
        <input
          value={draft}
          inputMode="numeric"
          onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          placeholder="Add ID…"
          aria-label="Add ID"
        />
        <button className="allowlist-addbtn" onClick={add} disabled={!draft.trim()}>Add</button>
      </div>
    </div>
  );
}
