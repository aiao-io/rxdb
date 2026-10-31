import { ListViewSettingsController, moveListViewItem, type ListViewField, type ListViewState } from '@aiao/rxdb-model';
import { useModelI18n } from '../i18n.js';

import { useEffect, useEffectEvent, useId, useRef } from 'react';

interface Props {
  fields: ListViewField[];
  value: ListViewState;
  onChange: (value: ListViewState) => void;
}

const PANEL =
  'border-base-300 bg-base-100 m-0 w-80 max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-lg border p-3 shadow-xl';

export function ListViewSettings({ fields, value, onChange }: Props) {
  const { t } = useModelI18n();

  const uid = useId();
  const root = useRef<HTMLDivElement>(null);
  const fieldsForDrag = useEffectEvent(() => fields.map(field => field.field));
  const reorder = useEffectEvent((order: string[]) => onChange({ ...value, fieldOrder: order }));
  useEffect(() => {
    const controller = new ListViewSettingsController(root.current!, { fields: fieldsForDrag, onReorder: reorder });
    return () => controller.dispose();
  }, []);
  const change = (patch: Partial<ListViewState>) => onChange({ ...value, ...patch });
  const visibleCount = fields.filter(field => !value.hiddenFields.includes(field.field)).length;
  const available = fields.filter(field => field.sortable && !value.sorts.some(sort => sort.field === field.field));
  return (
    <div ref={root} className='flex shrink-0 items-center gap-1' aria-label={t('text.6b86260762')}>
      <div>
        <button type='button' popoverTarget={`${uid}-fields`} className='btn btn-ghost btn-sm'>
          {t('text.1d83b16aa6')}
        </button>
        <div
          className={PANEL}
          id={`${uid}-fields`}
          popover='auto'
          data-list-view-popover
          role='group'
          aria-label={t('text.084463effd')}
        >
          <p className='mb-2 text-xs opacity-60'>{t('text.d6e9f3d96d')}</p>
          <div data-list-view-fields>
            {fields.map(field => (
              <div
                className='border-base-300 data-[drop-target=true]:border-primary flex h-10 items-center gap-2 border-b-2 border-transparent data-[dragging]:opacity-40'
                data-list-view-field
                key={field.field}
              >
                <button
                  type='button'
                  className='btn btn-ghost btn-xs cursor-grab touch-none active:cursor-grabbing'
                  data-list-view-drag={field.field}
                  aria-label={t('text.f514f3563c', { p0: field.title })}
                  title={t('text.ed04121b89')}
                >
                  <span aria-hidden='true'>⠿</span>
                </button>
                <label className='flex min-w-0 flex-1 items-center justify-between gap-3 text-sm'>
                  <span className='truncate'>{field.title}</span>
                  <input
                    type='checkbox'
                    role='switch'
                    className='toggle toggle-xs shrink-0'
                    aria-label={t('text.b79914c1ca', { p0: field.title })}
                    checked={!value.hiddenFields.includes(field.field)}
                    disabled={visibleCount === 1 && !value.hiddenFields.includes(field.field)}
                    onChange={event =>
                      change({
                        hiddenFields:
                          event.target.checked ?
                            value.hiddenFields.filter(name => name !== field.field)
                          : [...value.hiddenFields, field.field]
                      })
                    }
                  />
                </label>
              </div>
            ))}
          </div>
          <button
            type='button'
            className='btn btn-ghost btn-sm mt-2'
            onClick={() => change({ fieldOrder: [], hiddenFields: [] })}
          >
            {t('text.7879eb052a')}
          </button>
        </div>
      </div>
      <div>
        <button
          type='button'
          popoverTarget={`${uid}-sorts`}
          className={`btn btn-ghost btn-sm ${value.sorts.length ? 'btn-active' : ''}`}
        >
          {t('text.a96c9a8541')}
          {value.sorts.length ? ` ${value.sorts.length}` : ''}
        </button>
        <div
          className={PANEL}
          id={`${uid}-sorts`}
          popover='auto'
          data-list-view-popover
          role='group'
          aria-label={t('text.71b3e13c24')}
        >
          <p className='mb-2 text-xs opacity-60'>{t('text.4562165f63')}</p>
          {value.sorts.map((sort, index) => {
            const title = fields.find(field => field.field === sort.field)?.title ?? sort.field;
            return (
              <div className='mb-2 flex items-center gap-1' key={sort.field}>
                <span className='min-w-0 flex-1 truncate text-sm'>
                  {index + 1}. {title}
                </span>
                <select
                  className='select select-xs w-20'
                  aria-label={t('text.826e3ac40e', { p0: title })}
                  value={sort.sort}
                  onChange={event =>
                    change({
                      sorts: value.sorts.map(item =>
                        item.field === sort.field ? { ...item, sort: event.target.value as 'asc' | 'desc' } : item
                      )
                    })
                  }
                >
                  <option value='asc'>{t('text.ca715c0d8d')}</option>
                  <option value='desc'>{t('text.4b77c35468')}</option>
                </select>
                <button
                  type='button'
                  className='btn btn-ghost btn-xs'
                  aria-label={t('text.64105f43ad', { p0: title })}
                  disabled={index === 0}
                  onClick={() => change({ sorts: moveListViewItem(value.sorts, index, -1) })}
                >
                  ↑
                </button>
                <button
                  type='button'
                  className='btn btn-ghost btn-xs'
                  aria-label={t('text.30fdff6ce3', { p0: title })}
                  disabled={index === value.sorts.length - 1}
                  onClick={() => change({ sorts: moveListViewItem(value.sorts, index, 1) })}
                >
                  ↓
                </button>
                <button
                  type='button'
                  className='btn btn-ghost btn-xs'
                  aria-label={t('text.400dd902e6', { p0: title })}
                  onClick={() => change({ sorts: value.sorts.filter(item => item.field !== sort.field) })}
                >
                  ×
                </button>
              </div>
            );
          })}
          <select
            className='select select-sm w-full'
            aria-label={t('text.e14e86ebc3')}
            value=''
            disabled={!available.length}
            onChange={event => {
              if (event.target.value) change({ sorts: [...value.sorts, { field: event.target.value, sort: 'asc' }] });
            }}
          >
            <option value=''>{t('text.e14e86ebc3')}</option>
            {available.map(field => (
              <option key={field.field} value={field.field}>
                {field.title}
              </option>
            ))}
          </select>
          <button
            type='button'
            className='btn btn-ghost btn-sm mt-2'
            disabled={!value.sorts.length}
            onClick={() => change({ sorts: [] })}
          >
            {t('text.cdf8bcd4bf')}
          </button>
        </div>
      </div>
      <div>
        <button
          type='button'
          popoverTarget={`${uid}-group`}
          className={`btn btn-ghost btn-sm ${value.groupBy ? 'btn-active' : ''}`}
        >
          {t('text.399ee69347')}
          {value.groupBy ? ' 1' : ''}
        </button>
        <div
          className={PANEL}
          id={`${uid}-group`}
          popover='auto'
          data-list-view-popover
          role='group'
          aria-label={t('text.0dbd9be387')}
        >
          <label className='mb-2 block text-sm'>
            {t('text.d9c96ad4bd')}
            <select
              className='select select-sm mt-2 w-full'
              aria-label={t('text.d9c96ad4bd')}
              value={value.groupBy ?? ''}
              onChange={event => change({ groupBy: event.target.value || null })}
            >
              <option value=''>{t('text.fcd40ee3f0')}</option>
              {fields
                .filter(field => field.sortable)
                .map(field => (
                  <option key={field.field} value={field.field}>
                    {field.title}
                  </option>
                ))}
            </select>
          </label>
          <p className='text-xs opacity-60'>{t('text.02e429a961')}</p>
        </div>
      </div>
    </div>
  );
}
