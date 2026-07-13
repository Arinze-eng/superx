import { useState, useRef, useEffect, useCallback } from 'react';

interface ArrayInputProps {
  value: string[];
  onChange: (values: string[]) => void;
  validate?: (item: string) => string | null;
  placeholder?: string;
  disabled?: boolean;
}

export function ArrayInput({ value, onChange, validate, placeholder, disabled }: ArrayInputProps) {
  const [draft, setDraft] = useState(value);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [focusedChip, setFocusedChip] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const chipRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const isDirty = JSON.stringify(draft) !== JSON.stringify(value);

  const addItem = useCallback((raw: string) => {
    const item = raw.trim();
    if (!item) return;
    if (validate) {
      const err = validate(item);
      if (err) { setError(err); return; }
    }
    if (draft.includes(item)) {
      setError('Duplicate item');
      return;
    }
    setError(null);
    setDraft(prev => [...prev, item]);
    setInputValue('');
  }, [draft, validate]);

  const removeItem = useCallback((index: number) => {
    setDraft(prev => prev.filter((_, i) => i !== index));
    if (draft.length <= 1) {
      inputRef.current?.focus();
      setFocusedChip(-1);
    } else if (index >= draft.length - 1) {
      const newIdx = index - 1;
      setFocusedChip(newIdx);
      setTimeout(() => chipRefs.current[newIdx]?.focus(), 0);
    } else {
      setFocusedChip(index);
      setTimeout(() => chipRefs.current[index]?.focus(), 0);
    }
  }, [draft.length]);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      addItem(inputValue);
    } else if (e.key === 'Backspace' && inputValue === '' && draft.length > 0) {
      const lastIdx = draft.length - 1;
      setFocusedChip(lastIdx);
      chipRefs.current[lastIdx]?.focus();
    }
  }, [inputValue, addItem, draft.length]);

  const handleChipKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        if (index > 0) {
          setFocusedChip(index - 1);
          chipRefs.current[index - 1]?.focus();
        }
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (index < draft.length - 1) {
          setFocusedChip(index + 1);
          chipRefs.current[index + 1]?.focus();
        } else {
          setFocusedChip(-1);
          inputRef.current?.focus();
        }
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        removeItem(index);
        break;
      case 'Escape':
        e.preventDefault();
        setFocusedChip(-1);
        inputRef.current?.focus();
        break;
      case 'Home':
        e.preventDefault();
        setFocusedChip(0);
        chipRefs.current[0]?.focus();
        break;
      case 'End':
        e.preventDefault();
        if (draft.length > 0) {
          const last = draft.length - 1;
          setFocusedChip(last);
          chipRefs.current[last]?.focus();
        }
        break;
    }
  }, [draft.length, removeItem]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text');
    const items = text.split(/[,;\n\t]+/).map(s => s.trim()).filter(Boolean);
    if (items.length <= 1) return;

    e.preventDefault();
    const toAdd: string[] = [];
    for (const item of items) {
      if (draft.includes(item) || toAdd.includes(item)) continue;
      if (validate && validate(item)) continue;
      toAdd.push(item);
    }
    if (toAdd.length > 0) {
      setDraft(prev => [...prev, ...toAdd]);
      setError(null);
    }
  }, [draft, validate]);

  const handleSave = () => { onChange(draft); };
  const handleCancel = () => { setDraft(value); setError(null); };

  return (
    <div className={`array-input${disabled ? ' disabled' : ''}`}>
      {draft.length > 0 && (
        <div className="tags" role="listbox" aria-orientation="horizontal">
          {draft.map((item, idx) => (
            <div
              key={`${item}-${idx}`}
              ref={el => { chipRefs.current[idx] = el; }}
              role="option"
              aria-selected="true"
              tabIndex={focusedChip === idx ? 0 : -1}
              onKeyDown={e => handleChipKeyDown(e, idx)}
              onFocus={() => setFocusedChip(idx)}
              onBlur={() => { if (focusedChip === idx) setFocusedChip(-1); }}
              className={`tag${focusedChip === idx ? ' focused' : ''}`}
            >
              <span className="tag-label">{item}</span>
              <button
                type="button"
                className="tag-remove"
                aria-label={`Remove ${item}`}
                disabled={disabled}
                onClick={e => { e.stopPropagation(); removeItem(idx); }}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <path d="M5 5l14 14M19 5 5 19" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="tag-input-row">
        <input
          ref={inputRef}
          type="text"
          className="tag-input"
          value={inputValue}
          onChange={e => { setInputValue(e.target.value); setError(null); }}
          onKeyDown={handleInputKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder ?? 'Add pattern…'}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
        />
        <button type="button" className="btn-sm" disabled={disabled || !inputValue.trim()} onClick={() => addItem(inputValue)}>
          Add
        </button>
      </div>

      {error && <div className="tag-error">{error}</div>}
      {isDirty && (
        <div className="tag-actions">
          <button type="button" className="btn-sm" onClick={handleSave} disabled={disabled}>Save</button>
          <button type="button" className="btn-ghost btn-sm" onClick={handleCancel} disabled={disabled}>Cancel</button>
        </div>
      )}
    </div>
  );
}
