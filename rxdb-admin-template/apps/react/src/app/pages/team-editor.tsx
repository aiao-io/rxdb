import { useI18n } from '@aiao/rxdb-i18n-react';
import { EntityList } from '@aiao/rxdb-model-react';
import { useRxDB } from '@aiao/rxdb-react';
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { entityDisplayName } from '../entities/entity-labels';
import { visibleEntityEntries } from '../entities/entity-registry';

/** 编辑界面的固定高度：实体列表的 VTable 画布需要一个确定的尺寸。 */
const EDITOR_HEIGHT = '32rem';

/** 页签组的键盘移动：左右方向键首尾相接，Home / End 到首尾；其余按键返回 `undefined`，不处理。 */
function movedPosition(key: string, position: number, count: number): number | undefined {
  if (key === 'ArrowRight') return (position + 1) % count;
  if (key === 'ArrowLeft') return (position + count - 1) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return undefined;
}

/**
 * 团队任务编辑界面（ADMIN-US-221 AC#4）：用模型驱动的实体列表编辑任务所在的团队库。
 *
 * @remarks
 * 实体页签与列表都来自团队库（最近的 `RxDBProvider`）注册的实体元数据，标签是随语言切换的实体显示名，
 * 组件里不写任何具体实体名；换一套业务实体，这里不需要改。每次保存都由团队库的 working-tree 捕获进任务工作树。
 * 页签遵循 WAI-ARIA 页签模式：只有选中的页签在 Tab 序列里，左右方向键与 Home / End 在页签间移动。
 * 切换实体时按实体重建列表，不把上一个实体的筛选与排序状态带过去。
 */
export default function TeamEditor() {
  const { t } = useI18n();
  const database = useRxDB();
  const entries = useMemo(() => visibleEntityEntries(database.config.entities), [database]);
  const [position, setPosition] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const panelId = `${id}-panel`;
  const tabId = (index: number): string => `${id}-tab-${index}`;
  const current = entries[position];

  if (!current) {
    return (
      <div className='flex flex-col' data-testid='team-editor' style={{ height: EDITOR_HEIGHT }}>
        <div role='alert'>{t('entity.none')}</div>
      </div>
    );
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const next = movedPosition(event.key, index, entries.length);
    if (next === undefined) return;
    event.preventDefault();
    setPosition(next);
    tabs.current[next]?.focus();
  };

  return (
    <div className='flex flex-col' data-testid='team-editor' style={{ height: EDITOR_HEIGHT }}>
      {/* 未选中的页签沿用正文颜色：DaisyUI 默认把它减淡到对比度 3.4，达不到 WCAG AA 的 4.5 */}
      <div aria-label={t('teamEditor.entities')} className='tabs tabs-border shrink-0 overflow-x-auto' role='tablist'>
        {entries.map((entry, index) => (
          <button
            key={`${entry.namespace}/${entry.name}`}
            ref={element => {
              tabs.current[index] = element;
            }}
            aria-controls={panelId}
            aria-selected={index === position}
            className='tab text-base-content'
            id={tabId(index)}
            role='tab'
            tabIndex={index === position ? 0 : -1}
            type='button'
            onClick={() => setPosition(index)}
            onKeyDown={event => onKeyDown(event, index)}
          >
            {entityDisplayName(entry, t)}
          </button>
        ))}
      </div>
      <div aria-labelledby={tabId(position)} className='page-host min-h-0 flex-1' id={panelId} role='tabpanel'>
        <EntityList key={`${current.namespace}/${current.name}`} name={current.name} namespace={current.namespace} />
      </div>
    </div>
  );
}
