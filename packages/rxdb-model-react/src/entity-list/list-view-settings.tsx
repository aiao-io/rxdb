import { ListViewSettingsController, moveListViewItem, type ListViewField, type ListViewState } from '@aiao/rxdb-model';

import { useEffect, useEffectEvent, useId, useRef } from 'react';

interface Props {
  fields: ListViewField[];
  value: ListViewState;
  onChange: (value: ListViewState) => void;
}

const PANEL =
  'border-base-300 bg-base-100 m-0 w-80 max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-lg border p-3 shadow-xl';

export function ListViewSettings({ fields, value, onChange }: Props) {
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
    <div ref={root} className='flex shrink-0 items-center gap-1' aria-label='列表视图配置'>
      <div>
        <button type='button' popoverTarget={`${uid}-fields`} className='btn btn-ghost btn-sm'>
          字段配置
        </button>
        <div
          className={PANEL}
          id={`${uid}-fields`}
          popover='auto'
          data-list-view-popover
          role='group'
          aria-label='字段配置选项'
        >
          <p className='mb-2 text-xs opacity-60'>拖动调整顺序，使用开关控制显隐；至少保留一个字段</p>
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
                  aria-label={`拖动${field.title}排序`}
                  title='拖动排序，也可使用上下方向键'
                >
                  <span aria-hidden='true'>⠿</span>
                </button>
                <label className='flex min-w-0 flex-1 items-center justify-between gap-3 text-sm'>
                  <span className='truncate'>{field.title}</span>
                  <input
                    type='checkbox'
                    role='switch'
                    className='toggle toggle-xs shrink-0'
                    aria-label={`显示${field.title}`}
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
            重置字段
          </button>
        </div>
      </div>
      <div>
        <button
          type='button'
          popoverTarget={`${uid}-sorts`}
          className={`btn btn-ghost btn-sm ${value.sorts.length ? 'btn-active' : ''}`}
        >
          排序{value.sorts.length ? ` ${value.sorts.length}` : ''}
        </button>
        <div
          className={PANEL}
          id={`${uid}-sorts`}
          popover='auto'
          data-list-view-popover
          role='group'
          aria-label='排序选项'
        >
          <p className='mb-2 text-xs opacity-60'>按规则顺序排序，作用于全部查询结果</p>
          {value.sorts.map((sort, index) => {
            const title = fields.find(field => field.field === sort.field)?.title ?? sort.field;
            return (
              <div className='mb-2 flex items-center gap-1' key={sort.field}>
                <span className='min-w-0 flex-1 truncate text-sm'>
                  {index + 1}. {title}
                </span>
                <select
                  className='select select-xs w-20'
                  aria-label={`${title}排序方向`}
                  value={sort.sort}
                  onChange={event =>
                    change({
                      sorts: value.sorts.map(item =>
                        item.field === sort.field ? { ...item, sort: event.target.value as 'asc' | 'desc' } : item
                      )
                    })
                  }
                >
                  <option value='asc'>升序</option>
                  <option value='desc'>降序</option>
                </select>
                <button
                  type='button'
                  className='btn btn-ghost btn-xs'
                  aria-label={`提高${title}排序优先级`}
                  disabled={index === 0}
                  onClick={() => change({ sorts: moveListViewItem(value.sorts, index, -1) })}
                >
                  ↑
                </button>
                <button
                  type='button'
                  className='btn btn-ghost btn-xs'
                  aria-label={`降低${title}排序优先级`}
                  disabled={index === value.sorts.length - 1}
                  onClick={() => change({ sorts: moveListViewItem(value.sorts, index, 1) })}
                >
                  ↓
                </button>
                <button
                  type='button'
                  className='btn btn-ghost btn-xs'
                  aria-label={`移除${title}排序`}
                  onClick={() => change({ sorts: value.sorts.filter(item => item.field !== sort.field) })}
                >
                  ×
                </button>
              </div>
            );
          })}
          <select
            className='select select-sm w-full'
            aria-label='添加排序字段'
            value=''
            disabled={!available.length}
            onChange={event => {
              if (event.target.value) change({ sorts: [...value.sorts, { field: event.target.value, sort: 'asc' }] });
            }}
          >
            <option value=''>添加排序字段</option>
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
            清除排序
          </button>
        </div>
      </div>
      <div>
        <button
          type='button'
          popoverTarget={`${uid}-group`}
          className={`btn btn-ghost btn-sm ${value.groupBy ? 'btn-active' : ''}`}
        >
          分组{value.groupBy ? ' 1' : ''}
        </button>
        <div
          className={PANEL}
          id={`${uid}-group`}
          popover='auto'
          data-list-view-popover
          role='group'
          aria-label='分组选项'
        >
          <label className='mb-2 block text-sm'>
            分组字段
            <select
              className='select select-sm mt-2 w-full'
              aria-label='分组字段'
              value={value.groupBy ?? ''}
              onChange={event => change({ groupBy: event.target.value || null })}
            >
              <option value=''>不分组</option>
              {fields
                .filter(field => field.sortable)
                .map(field => (
                  <option key={field.field} value={field.field}>
                    {field.title}
                  </option>
                ))}
            </select>
          </label>
          <p className='text-xs opacity-60'>点击组标题可折叠。组内数量仅统计已加载记录。</p>
        </div>
      </div>
    </div>
  );
}
