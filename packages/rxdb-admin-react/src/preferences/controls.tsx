import type { DrawerRow, ResolvedControl } from '@aiao/rxdb-admin';
import { useState, type ReactElement, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useAdminText } from '../context.js';
import { ShortcutList } from './shortcut-list.js';
import { ThemeGrid } from './theme-grid.js';
import { WidgetList } from './widget-list.js';

type Option = { value: string; label: string };

function NumberControl({
  row,
  control
}: {
  row: DrawerRow;
  control: Extract<ResolvedControl, { kind: 'number' }>;
}): ReactElement {
  const value = row.value as number | null;
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value === null ? '' : String(value));
  }

  const commit = (): void => {
    if (draft.trim() === '') {
      if (control.nullable) row.set(null);
      else setDraft(String(value));
      return;
    }
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) row.set(parsed);
    else setDraft(value === null ? '' : String(value));
  };

  return (
    <span className='flex items-center gap-1'>
      <input
        id={`prefs-${row.id}`}
        type='number'
        className='input input-sm w-28'
        min={control.min}
        max={control.max}
        step={control.step}
        value={draft}
        disabled={!row.enabled}
        data-testid={`pref-${row.path}`}
        onChange={event => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => event.key === 'Enter' && commit()}
      />
      {control.unit && <span className='text-xs opacity-60'>{control.unit}</span>}
    </span>
  );
}

function TextControl({ row, placeholder }: { row: DrawerRow; placeholder: string | undefined }): ReactElement {
  const value = String(row.value ?? '');
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  return (
    <input
      id={`prefs-${row.id}`}
      type='text'
      className='input input-sm w-56'
      value={draft}
      placeholder={placeholder}
      disabled={!row.enabled}
      data-testid={`pref-${row.path}`}
      onChange={event => setDraft(event.target.value)}
      onBlur={() => draft !== value && row.set(draft)}
      onKeyDown={event => event.key === 'Enter' && row.set(draft)}
    />
  );
}

function ColorControl({ row, presets }: { row: DrawerRow; presets: readonly string[] }): ReactElement {
  const t = useAdminText();
  const value = String(row.value ?? '');
  return (
    <span className='flex flex-wrap items-center gap-2' role='group' aria-label={row.label}>
      {presets.map(color => (
        <button
          key={color}
          type='button'
          className='admin-color-dot'
          style={{ backgroundColor: color }}
          aria-label={color}
          aria-pressed={value.toLowerCase() === color}
          data-testid='pref-color-preset'
          onClick={() => row.set(color)}
        />
      ))}
      <input
        type='color'
        className='admin-color-input'
        value={value || '#167bff'}
        aria-label={row.label}
        data-testid='pref-color-input'
        onChange={event => row.set(event.target.value)}
      />
      {value !== '' && (
        <button
          type='button'
          className='btn btn-ghost btn-xs'
          data-testid='pref-color-reset'
          onClick={() => row.set('')}
        >
          {t('prefs.reset')}
        </button>
      )}
    </span>
  );
}

function CardsControl({ row, options, preview }: { row: DrawerRow; options: Option[]; preview: string }): ReactElement {
  return (
    <div className='admin-cards' role='group' aria-label={row.label}>
      {options.map(option => (
        <button
          key={option.value}
          type='button'
          className='admin-card'
          aria-pressed={row.value === option.value}
          aria-disabled={!row.enabled}
          data-testid={`pref-${row.path}-${option.value}`}
          onClick={() => row.enabled && row.set(option.value)}
        >
          <span className='admin-preview' data-kind={preview} data-value={option.value} aria-hidden='true'>
            <i />
            <i />
            <i />
          </span>
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * 按控件种类渲染一行设置的输入部分。
 * @param props - 设置行。
 * @returns 控件元素。
 */
export function RowControl({ row }: { row: DrawerRow }): ReactElement {
  const { control } = row;
  switch (control.kind) {
    case 'switch':
      return (
        <input
          id={`prefs-${row.id}`}
          type='checkbox'
          className='toggle toggle-sm'
          checked={row.value === true}
          disabled={!row.enabled}
          data-testid={`pref-${row.path}`}
          onChange={event => row.set(event.target.checked)}
        />
      );
    case 'select':
      return (
        <select
          id={`prefs-${row.id}`}
          className='select select-sm w-56'
          value={String(row.value ?? '')}
          disabled={!row.enabled}
          data-testid={`pref-${row.path}`}
          onChange={event => row.set(event.target.value)}
        >
          {control.options.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    case 'segmented':
      return (
        <span className='join' role='group' aria-label={row.label}>
          {control.options.map(option => (
            <button
              key={option.value}
              type='button'
              className={row.value === option.value ? 'btn btn-xs join-item btn-primary' : 'btn btn-xs join-item'}
              aria-pressed={row.value === option.value}
              disabled={!row.enabled}
              data-testid={`pref-${row.path}-${option.value || 'default'}`}
              onClick={() => row.set(option.value)}
            >
              {option.label}
            </button>
          ))}
        </span>
      );
    case 'cards':
      return <CardsControl row={row} options={control.options} preview={control.preview} />;
    case 'number':
      return <NumberControl row={row} control={control} />;
    case 'text':
      return <TextControl row={row} placeholder={control.placeholder} />;
    case 'color':
      return <ColorControl row={row} presets={control.presets} />;
    case 'themes':
      return <ThemeGrid row={row} />;
    case 'widgets':
      return <WidgetList />;
    case 'shortcuts':
      return <ShortcutList />;
  }
}

/** 需要独占一行（控件在标题下方）的控件种类。 */
export const STACKED_KINDS: ReadonlySet<ResolvedControl['kind']> = new Set([
  'cards',
  'themes',
  'widgets',
  'shortcuts',
  'color'
]);
