/**
 * @fileoverview 基于 Popover API 的下拉选择组件（Angular `PopoverSelectComponent` 的 React 移植）。
 *
 * 语义与 Angular 侧一致：使用浏览器原生 Popover API 渲染选项列表（top layer 渲染，
 * 不受 `overflow` 容器裁剪），支持关键字过滤、键盘导航（↑↓ 移动、Enter 选中、
 * Escape 关闭并聚焦触发按钮、Tab 关闭）。打开弹框自动高亮第一项，搜索后也自动高亮第一条结果。
 *
 * @module query-builder/popover-select
 */
import { applyPopoverPosition, findOptionLabel } from '@aiao/rxdb-model';
import { useMemo, useRef, useState, type JSX } from 'react';

let uidCounter = 0;

/** {@link PopoverSelect} 的选项。 */
export interface PopoverSelectOption {
  /** 选项值。 */
  value: string;
  /** 显示文本。 */
  label: string;
}

/** {@link PopoverSelect} 的 props。 */
export interface PopoverSelectProps {
  /** 可选项列表。 */
  options: ReadonlyArray<PopoverSelectOption>;
  /** 当前选中值。 */
  selected?: string;
  /** 占位文案（未选中或选中值不在选项中时显示），缺省 `'请选择'`。 */
  placeholder?: string;
  /** 触发器与弹层最小宽度，缺省 `'8rem'`。 */
  minWidth?: string;
  /** 选中回调。 */
  onSelectChange?: (value: string) => void;
}

/**
 * 基于 Popover API 的下拉选择组件。
 */
export function PopoverSelect({
  options,
  selected = '',
  placeholder = '请选择',
  minWidth = '8rem',
  onSelectChange
}: PopoverSelectProps): JSX.Element {
  const [uid] = useState(() => `rxdb-ps-${++uidCounter}`);
  const listId = `${uid}-list`;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);

  const [filterText, setFilterText] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const currentLabel = findOptionLabel(options, selected, placeholder);

  const filteredOptions = useMemo(() => {
    const filter = filterText.toLowerCase().trim();
    if (!filter) return options;
    return options.filter(option => option.label.toLowerCase().includes(filter));
  }, [options, filterText]);

  // 过滤词变化后高亮自动回到第一项（Angular 侧 effect 同语义；渲染期调整状态）
  const [prevFiltered, setPrevFiltered] = useState(filteredOptions);
  if (prevFiltered !== filteredOptions) {
    setPrevFiltered(filteredOptions);
    setActiveIndex(0);
  }

  const activeItemId =
    activeIndex >= 0 && activeIndex < filteredOptions.length ?
      `${uid}-opt-${filteredOptions[activeIndex].value}`
    : null;

  /** beforetoggle open：清空过滤词并应用弹层定位（Angular 侧同语义）。 */
  const onBeforeToggle = (event: React.ToggleEvent<HTMLDivElement>): void => {
    if (event.nativeEvent.newState === 'open') {
      applyPopoverPosition(popoverRef.current as HTMLDivElement, triggerRef.current!.getBoundingClientRect());
      setFilterText('');
    }
  };

  /** toggle open：聚焦搜索框并重置高亮索引。 */
  const onToggle = (event: React.ToggleEvent<HTMLDivElement>): void => {
    if (event.nativeEvent.newState === 'open') {
      filterInputRef.current?.focus();
      setActiveIndex(0);
    }
  };

  /** 选中：回调 + 关闭弹层 + 聚焦触发按钮。 */
  const onSelect = (value: string): void => {
    onSelectChange?.(value);
    popoverRef.current?.hidePopover();
    triggerRef.current?.focus();
  };

  const scrollActiveIntoView = (index: number): void => {
    const option = filteredOptions[index];
    if (!option) return;
    document.getElementById(`${uid}-opt-${option.value}`)?.scrollIntoView({ block: 'nearest' });
  };

  /** 键盘导航（↑↓ 循环移动、Enter 选中、Escape 关闭并聚焦触发按钮、Tab 关闭）。 */
  const onKeydown = (event: React.KeyboardEvent): void => {
    const len = filteredOptions.length;
    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        if (len > 0) {
          const next = (activeIndex + 1) % len;
          setActiveIndex(next);
          scrollActiveIntoView(next);
        }
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        if (len > 0) {
          const next = (activeIndex - 1 + len) % len;
          setActiveIndex(next);
          scrollActiveIntoView(next);
        }
        break;
      }
      case 'Enter': {
        event.preventDefault();
        const option = filteredOptions[activeIndex];
        if (option) onSelect(option.value);
        break;
      }
      case 'Escape': {
        event.preventDefault();
        popoverRef.current?.hidePopover();
        triggerRef.current?.focus();
        break;
      }
      case 'Tab': {
        popoverRef.current?.hidePopover();
        break;
      }
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        className='select select-sm text-left'
        popoverTarget={uid}
        style={{ minWidth }}
        type='button'
      >
        {currentLabel}
      </button>
      <div
        ref={popoverRef}
        id={uid}
        className='bg-base-100 rounded-box border-base-300 border shadow-xl'
        style={{ minWidth }}
        onBeforeToggle={onBeforeToggle}
        onToggle={onToggle}
        onKeyDown={onKeydown}
        popover=''
        tabIndex={-1}
      >
        <div className='mb-1 p-2'>
          <input
            ref={filterInputRef}
            className='input input-sm w-full'
            aria-activedescendant={activeItemId ?? undefined}
            aria-controls={listId}
            aria-expanded='true'
            aria-autocomplete='list'
            placeholder='搜索...'
            role='combobox'
            type='text'
            value={filterText}
            onChange={event => setFilterText(event.target.value)}
          />
        </div>
        <ul className='menu menu-sm max-h-60 w-full flex-nowrap overflow-y-auto px-2' id={listId} role='listbox'>
          {filteredOptions.map((option, index) => (
            <li role='none' key={option.value}>
              <button
                className={`flex w-full items-center text-left text-sm${
                  option.value === selected ? 'bg-primary/15 font-semibold' : ''
                }${index === activeIndex ? 'menu-focus' : ''}`}
                aria-selected={option.value === selected}
                id={`${uid}-opt-${option.value}`}
                role='option'
                type='button'
                onClick={() => onSelect(option.value)}
              >
                <span className='grow'>{option.label}</span>
                {option.value === selected && (
                  <svg
                    className='text-primary h-3 w-3 shrink-0'
                    fill='none'
                    stroke='currentColor'
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth='2.5'
                    viewBox='0 0 24 24'
                  >
                    <polyline points='20 6 9 17 4 12' />
                  </svg>
                )}
              </button>
            </li>
          ))}
          {filteredOptions.length === 0 && <li className='px-3 py-1.5 text-sm opacity-50'>无匹配项</li>}
        </ul>
      </div>
    </>
  );
}
