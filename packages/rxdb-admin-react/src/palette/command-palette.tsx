import { Search } from 'lucide-react';
import { useEffect, useRef, type ReactElement, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';
import { closeOnBackdrop, useModalDialog } from '../use-dialog.js';

/**
 * 命令面板：聚合菜单、命令与应用注册的来源（如全文搜索），键盘上下选择、回车执行。
 * 以原生模态 `<dialog>` 呈现；输入框是 combobox，结果是 listbox。
 * @returns 面板元素。
 */
export function CommandPalette(): ReactElement {
  const shell = useAdminShell();
  const t = useAdminText();
  const state = useAdminStore(shell.palette);
  const close = (): void => shell.palette.close();
  const ref = useModalDialog(state.open, close);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.open) inputRef.current?.focus();
  }, [state.open]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    // 输入法组合中的按键交给输入法；Safari 确认候选的回车在 compositionend 之后到达，isComposing 为 false、keyCode 为 229
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      shell.palette.moveSelection(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      void shell.palette.select();
    }
  };

  return (
    <dialog
      ref={ref}
      className='admin-palette'
      aria-label={t('widget.search')}
      data-testid='admin-palette'
      onClick={event => closeOnBackdrop(event, close)}
    >
      {state.open && (
        <>
          <div className='admin-palette-input'>
            <Search size={18} aria-hidden='true' />
            <input
              ref={inputRef}
              type='text'
              role='combobox'
              aria-expanded='true'
              aria-controls='admin-palette-list'
              aria-activedescendant={state.total > 0 ? `admin-palette-option-${state.selectedIndex}` : undefined}
              aria-autocomplete='list'
              autoComplete='off'
              placeholder={t('palette.placeholder')}
              aria-label={t('palette.placeholder')}
              value={state.query}
              data-testid='admin-palette-input'
              onChange={event => shell.palette.setQuery(event.target.value)}
              onKeyDown={onKeyDown}
            />
          </div>
          <div id='admin-palette-list' role='listbox' className='admin-palette-list' aria-label={t('widget.search')}>
            {state.groups.map(group => (
              <div key={group.id} role='group' aria-label={group.labelKey ? t(group.labelKey) : group.label}>
                <div className='admin-palette-group' aria-hidden='true'>
                  {group.labelKey ? t(group.labelKey) : group.label}
                </div>
                {group.entries.map(entry => (
                  <div
                    key={`${group.id}:${entry.item.id}`}
                    id={`admin-palette-option-${entry.index}`}
                    role='option'
                    className='admin-palette-item'
                    aria-selected={entry.index === state.selectedIndex}
                    data-testid='admin-palette-option'
                    onMouseMove={() => entry.index !== state.selectedIndex && shell.palette.hover(entry.index)}
                    onClick={() => void shell.palette.select(entry.index)}
                  >
                    {entry.item.icon as ReactElement}
                    <span>
                      {entry.segments.map((segment, index) =>
                        segment.match ?
                          <mark key={index}>{segment.text}</mark>
                        : <span key={index}>{segment.text}</span>
                      )}
                    </span>
                    {entry.item.sublabel && <span className='admin-palette-sub'>{entry.item.sublabel}</span>}
                  </div>
                ))}
              </div>
            ))}
            {state.total === 0 && !state.loading && state.mode === 'results' && (
              <p className='admin-palette-empty' role='status'>
                {t('palette.empty')}
              </p>
            )}
            {state.loading && (
              <p className='admin-palette-empty' role='status'>
                {t('palette.loading')}
              </p>
            )}
            {state.failed.length > 0 && (
              <p className='admin-palette-empty text-warning' role='status'>
                {t('palette.failed')}
              </p>
            )}
          </div>
          <div className='admin-palette-footer' aria-hidden='true'>
            <span>
              <kbd className='kbd kbd-xs'>↑</kbd> <kbd className='kbd kbd-xs'>↓</kbd> {t('palette.hint.navigate')}
            </span>
            <span>
              <kbd className='kbd kbd-xs'>↵</kbd> {t('palette.hint.open')}
            </span>
            <span>
              <kbd className='kbd kbd-xs'>Esc</kbd> {t('palette.hint.close')}
            </span>
          </div>
        </>
      )}
    </dialog>
  );
}
