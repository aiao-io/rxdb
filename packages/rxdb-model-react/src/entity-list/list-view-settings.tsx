import { moveListViewItem, type ListViewField, type ListViewState } from '@aiao/rxdb-model';

interface Props {
  fields: ListViewField[];
  value: ListViewState;
  onChange: (value: ListViewState) => void;
}

const PANEL =
  'dropdown-content border-base-300 bg-base-100 fixed inset-x-2 top-28 z-[1000] mt-2 max-h-[60dvh] w-auto sm:absolute sm:inset-x-auto sm:left-0 sm:top-auto sm:w-80 max-w-[calc(100vw-1rem)] overflow-auto rounded-lg border p-3 shadow-xl';

export function ListViewSettings({ fields, value, onChange }: Props) {
  const change = (patch: Partial<ListViewState>) => onChange({ ...value, ...patch });
  const visibleCount = fields.filter(field => !value.hiddenFields.includes(field.field)).length;
  const available = fields.filter(field => field.sortable && !value.sorts.some(sort => sort.field === field.field));
  return (
    <div className='flex shrink-0 items-center gap-1' aria-label='列表视图配置'>
      <details className='dropdown' name='rxdb-list-view-settings'>
        <summary className='btn btn-ghost btn-sm'>字段配置</summary>
        <div className={PANEL}>
          <p className='mb-2 text-xs opacity-60'>调整字段显隐与顺序，至少保留一个字段</p>
          {fields.map((field, index) => (
            <div className='flex items-center gap-2 py-1' key={field.field}>
              <label className='flex min-w-0 flex-1 items-center gap-2 text-sm'>
                <input
                  type='checkbox'
                  className='checkbox checkbox-xs'
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
                <span className='truncate'>{field.title}</span>
              </label>
              <button
                type='button'
                className='btn btn-ghost btn-xs'
                aria-label={`上移${field.title}`}
                disabled={index === 0}
                onClick={() =>
                  change({
                    fieldOrder: moveListViewItem(
                      fields.map(item => item.field),
                      index,
                      -1
                    )
                  })
                }
              >
                ↑
              </button>
              <button
                type='button'
                className='btn btn-ghost btn-xs'
                aria-label={`下移${field.title}`}
                disabled={index === fields.length - 1}
                onClick={() =>
                  change({
                    fieldOrder: moveListViewItem(
                      fields.map(item => item.field),
                      index,
                      1
                    )
                  })
                }
              >
                ↓
              </button>
            </div>
          ))}
          <button
            type='button'
            className='btn btn-ghost btn-sm mt-2'
            onClick={() => change({ fieldOrder: [], hiddenFields: [] })}
          >
            重置字段
          </button>
        </div>
      </details>
      <details className='dropdown' name='rxdb-list-view-settings'>
        <summary className={`btn btn-ghost btn-sm ${value.sorts.length ? 'btn-active' : ''}`}>
          排序{value.sorts.length ? ` ${value.sorts.length}` : ''}
        </summary>
        <div className={PANEL}>
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
      </details>
      <details className='dropdown' name='rxdb-list-view-settings'>
        <summary className={`btn btn-ghost btn-sm ${value.groupBy ? 'btn-active' : ''}`}>
          分组{value.groupBy ? ' 1' : ''}
        </summary>
        <div className={PANEL}>
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
      </details>
    </div>
  );
}
