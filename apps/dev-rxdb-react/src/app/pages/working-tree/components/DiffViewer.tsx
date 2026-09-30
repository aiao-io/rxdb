import type { WorkingTreeDiffEntry } from '@aiao/rxdb-plugin-working-tree';
import { ChevronDown, FileDiff, Settings } from 'lucide-react';
import { createElement, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  buildFieldDiff,
  buildHunks,
  filterWhitespaceOnlyChanges,
  formatFieldValue,
  formatSide
} from '../utils/diff-format';
import { gdEntryPath, gdOpColor, gdOpIcon, gdOpLabel, gdPathColor, gdTableName } from '../utils/gd';

/** 右侧 diff 的两种显示（GitHub Desktop 的 Unified / Split 同义）。 */
export type WorkingTreeDiffViewMode = 'unified' | 'split';

/**
 * diff 显示偏好；demo 默认 Split（用户拍板）、不隐藏空白、自动换行。
 *
 * React 端的等价物是模块级单例 + `useSyncExternalStore`：Angular 参考实现用
 * `providedIn: 'root'` 的 Injectable 单例，路由来回切换偏好仍在；本页里
 * 「更改」与「历史」两个查看器实例也共享同一份。
 */
interface DiffDisplayPreferences {
  /** 显示模式；demo 默认 Split（用户拍板）。 */
  readonly mode: WorkingTreeDiffViewMode;
  /** 隐藏只有空白差异的字段（GitHub Desktop Diff Settings 的 Hide Whitespace Changes）。 */
  readonly hideWhitespace: boolean;
  /** 自动换行（GitHub Desktop Diff Settings 的 Show Word Wrap）。 */
  readonly wrap: boolean;
}

let currentPreferences: DiffDisplayPreferences = { mode: 'split', hideWhitespace: false, wrap: true };
const preferenceListeners = new Set<() => void>();

const emitPreferences = (): void => {
  for (const listener of preferenceListeners) listener();
};

const useDiffDisplayPreferences = (): {
  readonly preferences: DiffDisplayPreferences;
  readonly setViewMode: (mode: WorkingTreeDiffViewMode) => void;
  readonly toggleWhitespace: () => void;
  readonly toggleWrap: () => void;
} => {
  const preferences = useSyncExternalStore(
    listener => {
      preferenceListeners.add(listener);
      return () => {
        preferenceListeners.delete(listener);
      };
    },
    () => currentPreferences
  );
  return {
    preferences,
    setViewMode: mode => {
      currentPreferences = { ...currentPreferences, mode };
      emitPreferences();
    },
    toggleWhitespace: () => {
      currentPreferences = { ...currentPreferences, hideWhitespace: !currentPreferences.hideWhitespace };
      emitPreferences();
    },
    toggleWrap: () => {
      currentPreferences = { ...currentPreferences, wrap: !currentPreferences.wrap };
      emitPreferences();
    }
  };
};

/** Split 视图里的一行：一个字段的旧 / 新两侧，缺侧为 `null`。 */
interface SplitRow {
  readonly key: string;
  readonly before: unknown;
  readonly after: unknown;
  readonly oldNumber: number | null;
  readonly newNumber: number | null;
}

interface WorkingTreeDiffViewerProps {
  readonly entry: WorkingTreeDiffEntry | null;
}

/**
 * 右栏的 diff 查看器，模仿 GitHub Desktop 的文件 diff 视图。
 *
 * @remarks
 * 没有选中项时显示空态提示而不是空白：右栏是页面的主视觉区，空白会让
 * 「点左侧文件看右侧 diff」这个轴显得没接上。每个**字段**画成一个 hunk 盒子
 * （`buildHunks`，见 diff-format 的 TSDoc）：头部是 git 风格的
 * `@@ -a,b +c,d @@ <字段名>`（字段名占 git 里「函数上下文」的位置）。
 *
 * **两种显示模式**（GitHub Desktop 的 Unified / Split）：
 * Unified 逐字段显示 `- / +` 行；Split 是**逐行对齐的双栏**（side-by-side 形态）——
 * 一个字段占一行，旧值左栏红底、新值右栏绿底，缺侧留灰槽，两侧行号独立推进，
 * **不带「改前 / 改后」文字标签**（GitHub Desktop 的 split 也没有）。
 * 切换入口在 Diff Settings 菜单里，与 Hide Whitespace Changes / Show Word Wrap
 * 两个开关同处一菜单。两种模式只改变显示，不改变补丁内容。
 *
 * 文件头不显示**事务** id（`transactionId` 是工作树的簿记，与内容无关），
 * 路径 `schema/实体/实体id` 是「文件名」本身，完整保留、按状态着色
 * （PathLabel 同款）；操作类型图标放在 Settings 按钮的右侧（源码 diff-header 同位置）。
 *
 * 视觉对齐 GitHub Desktop：浅灰行号槽（`.gd-diff-gutter`），`-`/`+` 行整行红 / 绿底，
 * 行号与符号用对应侧的深红 / 深绿，内容文字保持正文色。
 */
export function WorkingTreeDiffViewer({ entry }: WorkingTreeDiffViewerProps): React.JSX.Element {
  const { preferences, setViewMode, toggleWhitespace, toggleWrap } = useDiffDisplayPreferences();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsContainerRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);

  // 点设置区之外关闭（document 级，与 Angular 参考实现同款）。
  useEffect(() => {
    if (!settingsOpen) return;
    const onDocumentClick = (event: MouseEvent): void => {
      if (!settingsContainerRef.current?.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('click', onDocumentClick);
    return () => document.removeEventListener('click', onDocumentClick);
  }, [settingsOpen]);

  // 设置面板开着时按 Escape：只收这一个弹层并还焦点给触发按钮（Angular 同款）。
  useEffect(() => {
    if (!settingsOpen) return;
    const onDocumentKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setSettingsOpen(false);
        settingsButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => document.removeEventListener('keydown', onDocumentKeyDown);
  }, [settingsOpen]);

  // 三种设置变更都收面板（Angular 同款：setViewMode / toggleWhitespace / toggleWrap 都会关弹层）。
  const selectViewMode = (mode: WorkingTreeDiffViewMode) => {
    setViewMode(mode);
    setSettingsOpen(false);
  };
  const changeWhitespace = () => {
    toggleWhitespace();
    setSettingsOpen(false);
  };
  const changeWrap = () => {
    toggleWrap();
    setSettingsOpen(false);
  };

  if (entry === null) {
    return (
      <div className='gd-empty h-full text-sm'>
        <FileDiff className='text-[var(--gd-line-num)]' size={40} />
        <p>Select a change from the left to see its field-level diff</p>
      </div>
    );
  }

  const builtHunks = buildHunks(entry);
  const hunks = preferences.hideWhitespace ? filterWhitespaceOnlyChanges(builtHunks) : builtHunks;

  // Split 视图的行：一个字段一行，两侧行号独立推进（GitHub Desktop 的 side-by-side 行对齐）。
  let oldLine = 1;
  let newLine = 1;
  const splitRows: SplitRow[] = buildFieldDiff(entry).map(line => {
    const oldNumber = line.before === undefined ? null : oldLine++;
    const newNumber = line.after === undefined ? null : newLine++;
    return { key: line.key, before: line.before, after: line.after, oldNumber, newNumber };
  });

  return (
    <div className='flex h-full min-h-0 flex-col' data-testid='wt-diff-viewer'>
      <div
        className='relative shrink-0 border-b px-3 py-1'
        style={{ background: 'var(--gd-panel)', borderColor: 'var(--gd-border)' }}
      >
        <div className='flex min-w-0 items-center gap-2'>
          <FileDiff style={{ color: gdOpColor(entry.operation) }} size={14} />
          {/* 路径里的实体 id 是「文件名」的一部分，不能省略；空间不够时中间省略（尾部保留结尾）；
              文本按状态着色（GitHub Desktop PathLabel 同款） */}
          <span
            className='flex min-w-0 flex-1 items-center text-[12px] font-semibold'
            style={{ color: gdPathColor(entry.operation) }}
            title={gdEntryPath(entry)}
          >
            <span className='shrink-0'>
              {entry.namespace}/{gdTableName(entry.entity)}/
            </span>
            <span className='gd-truncate-tail min-w-0'>
              <span>{entry.entityId}</span>
            </span>
          </span>
          {entry.origin === 'remote_sync' && (
            <span
              className='rounded-full border border-[var(--gd-border)] px-1.5 text-[10px]'
              style={{ color: 'var(--gd-muted)' }}
            >
              Remote sync
            </span>
          )}
          <div className='flex shrink-0 items-center' ref={settingsContainerRef}>
            <button
              className='gd-icon-btn'
              ref={settingsButtonRef}
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen(open => !open)}
              aria-haspopup={true}
              aria-label='Diff Settings'
              data-testid='wt-diff-settings'
              title='Diff Settings'
              type='button'
            >
              <Settings size={15} />
              <ChevronDown size={10} />
            </button>
            {settingsOpen && (
              <div
                className='gd-menu gd-diff-settings-panel absolute top-full right-2 z-40 mt-1'
                aria-label='Diff Settings'
                data-testid='wt-diff-settings-popup'
                role='group'
              >
                <div className='px-3 py-1.5 text-xs font-semibold'>Diff Settings</div>
                <div className='gd-menu-header'>Diff display</div>
                <label className='gd-menu-row cursor-pointer'>
                  <input
                    checked={preferences.mode === 'unified'}
                    onChange={() => selectViewMode('unified')}
                    name='wt-diff-display'
                    type='radio'
                  />
                  Unified
                </label>
                <label className='gd-menu-row cursor-pointer'>
                  <input
                    checked={preferences.mode === 'split'}
                    onChange={() => selectViewMode('split')}
                    name='wt-diff-display'
                    type='radio'
                  />
                  Split
                </label>
                <label className='gd-menu-row cursor-pointer'>
                  <input
                    checked={preferences.hideWhitespace}
                    onChange={changeWhitespace}
                    data-testid='wt-diff-whitespace'
                    type='checkbox'
                  />
                  Hide Whitespace Changes
                </label>
                <label className='gd-menu-row cursor-pointer'>
                  <input checked={preferences.wrap} onChange={changeWrap} data-testid='wt-diff-wrap' type='checkbox' />
                  Show Word Wrap
                </label>
              </div>
            )}
          </div>
          {/* 操作类型图标；title / aria-label 挂在 span 上——Angular 端实测 svg 上的
              [title] 绑定渲染不出来（style 绑定正常），span 是稳定的载体 */}
          <span aria-label={gdOpLabel(entry.operation)} title={gdOpLabel(entry.operation)} role='img'>
            {createElement(gdOpIcon(entry.operation), {
              className: 'shrink-0',
              size: 14,
              style: { color: gdOpColor(entry.operation) }
            })}
          </span>
        </div>
      </div>
      <div className='min-h-0 flex-1 overflow-auto'>
        {preferences.mode === 'unified' ?
          hunks.length === 0 ?
            <p className='py-3 text-center text-xs' style={{ color: 'var(--gd-muted)' }}>
              No field-level patch to display
            </p>
          : hunks.map(hunk => (
              <div className='gd-hunk' key={`${hunk.key}${hunk.oldStart}${hunk.newStart}`}>
                <div className='gd-hunk-header'>
                  @@ -{hunk.oldStart},{hunk.oldCount} +{hunk.newStart},{hunk.newCount} @@ {hunk.key}
                </div>
                {hunk.rows.map(row => (
                  <div
                    className={`gd-diff-row ${row.sign === '+' ? 'gd-add' : 'gd-del'}`}
                    key={`${row.key}${row.sign}${formatFieldValue(row.value)}`}
                  >
                    <div className='gd-diff-gutter border-r border-[var(--gd-border)]'>
                      <span className='gd-diff-num'>{row.oldNumber ?? ''}</span>
                      <span className='gd-diff-num'>{row.newNumber ?? ''}</span>
                      <span className={`gd-diff-sign ${row.sign === '+' ? 'gd-add' : 'gd-del'}`}>{row.sign}</span>
                    </div>
                    <div className='gd-diff-content' style={{ whiteSpace: preferences.wrap ? undefined : 'pre' }}>
                      <span style={{ color: 'var(--gd-muted)' }}>{row.key}:</span>
                      <span>{formatFieldValue(row.value)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ))

        : <div className='gd-split' data-testid='wt-split'>
            {splitRows.map(row => (
              <div className='gd-split-row' key={row.key}>
                <div
                  className={`gd-split-cell gd-split-old ${row.before === undefined ? 'gd-split-cell-empty' : ''}`}
                  data-testid='wt-split-old'
                >
                  {row.before !== undefined && (
                    <>
                      <span className='gd-split-num'>{row.oldNumber}</span>
                      <span className='gd-split-sign'>-</span>
                      <span className='gd-split-value'>
                        {row.key}: {formatSide(row.before)}
                      </span>
                    </>
                  )}
                </div>
                <div
                  className={`gd-split-cell gd-split-new${row.after === undefined ? 'gd-split-cell-empty' : ''}`}
                  data-testid='wt-split-new'
                >
                  {row.after !== undefined && (
                    <>
                      <span className='gd-split-num'>{row.newNumber}</span>
                      <span className='gd-split-sign'>+</span>
                      <span className='gd-split-value'>
                        {row.key}: {formatSide(row.after)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        }
      </div>
    </div>
  );
}
