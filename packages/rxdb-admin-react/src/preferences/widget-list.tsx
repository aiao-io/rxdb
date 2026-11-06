import {
  moveVisibleWidget,
  PINNED_WIDGETS,
  toggleWidgetHidden,
  visibleWidgets,
  type WidgetKey
} from '@aiao/rxdb-admin';
import { Eye, EyeOff, GripVertical } from 'lucide-react';
import { useState, type ReactElement, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';

/**
 * 顶栏部件的顺序与显隐：拖拽或上下方向键调整顺序，眼睛按钮切换显隐（设置入口不可隐藏）。
 * @returns 列表元素。
 */
export function WidgetList(): ReactElement {
  const shell = useAdminShell();
  const t = useAdminText();
  const { widget } = useAdminStore(shell.preferences);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropTo, setDropTo] = useState<number | null>(null);
  const visible = visibleWidgets(widget);
  const hidden = widget.order.filter(key => widget.hidden.includes(key));

  const reorder = (from: number, to: number): void =>
    shell.preferences.setPath('widget.order', moveVisibleWidget(widget, from, to));
  const toggle = (key: WidgetKey): void =>
    shell.preferences.setPath('widget.hidden', toggleWidgetHidden(widget.hidden, key));

  const onKeyDown = (event: ReactKeyboardEvent<HTMLLIElement>, index: number): void => {
    const delta =
      event.key === 'ArrowUp' ? -1
      : event.key === 'ArrowDown' ? 1
      : 0;
    if (delta === 0 || event.target !== event.currentTarget) return;
    event.preventDefault();
    reorder(index, index + delta);
    requestAnimationFrame(() => document.getElementById(`prefs-widget-${visible[index]}`)?.focus());
  };

  return (
    <div data-testid='pref-widgets'>
      <p className='admin-row-hint mb-2'>{t('prefs.widgets.dragHint')}</p>
      <ul aria-label={t('prefs.widgets.visible')}>
        {visible.map((key, index) => (
          <li
            key={key}
            id={`prefs-widget-${key}`}
            className='admin-widget-row'
            tabIndex={0}
            draggable
            data-testid={`pref-widget-${key}`}
            data-dragging={dragFrom === index}
            data-drop-target={dropTo === index && dragFrom !== index}
            onKeyDown={event => onKeyDown(event, index)}
            onDragStart={() => setDragFrom(index)}
            onDragOver={event => {
              if (dragFrom === null) return;
              event.preventDefault();
              setDropTo(index);
            }}
            onDrop={event => {
              event.preventDefault();
              if (dragFrom !== null && dragFrom !== index) reorder(dragFrom, index);
              setDragFrom(null);
              setDropTo(null);
            }}
            onDragEnd={() => {
              setDragFrom(null);
              setDropTo(null);
            }}
          >
            <GripVertical size={16} className='admin-widget-handle' aria-hidden='true' />
            <span className='grow'>{t(`widget.${key}`)}</span>
            <button
              type='button'
              className='btn btn-ghost btn-xs btn-square'
              aria-label={`${t('prefs.widgets.hide')}：${t(`widget.${key}`)}`}
              disabled={PINNED_WIDGETS.includes(key)}
              title={PINNED_WIDGETS.includes(key) ? t('prefs.widgets.pinned') : undefined}
              data-testid={`pref-widget-toggle-${key}`}
              onClick={() => toggle(key)}
            >
              <Eye size={14} />
            </button>
          </li>
        ))}
      </ul>
      {hidden.length > 0 && (
        <>
          <p className='admin-row-hint mt-3 mb-1'>{t('prefs.widgets.hidden')}</p>
          <ul aria-label={t('prefs.widgets.hidden')}>
            {hidden.map(key => (
              <li key={key} className='admin-widget-row' data-testid={`pref-widget-${key}`}>
                <span className='grow line-through opacity-60'>{t(`widget.${key}`)}</span>
                <button
                  type='button'
                  className='btn btn-ghost btn-xs btn-square'
                  aria-label={`${t('prefs.widgets.show')}：${t(`widget.${key}`)}`}
                  data-testid={`pref-widget-toggle-${key}`}
                  onClick={() => toggle(key)}
                >
                  <EyeOff size={14} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
