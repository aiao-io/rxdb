import type { RxDB, UUID } from '@aiao/rxdb';
import {
  localDateKey,
  msUntilNextLocalMidnight,
  RESTORING_MARKER_KEY,
  type BoardSearchUnavailableReason,
  type BoardSearchUpstream
} from '@aiao/rxdb-plugin-board';
import { useEffect, useId, useRef, useState, type RefObject } from 'react';

import { useBoard, type UseBoardReturn } from '../use-board.js';
import { errorText, type ToastState } from './types.js';
import type { LatestRef } from './use-state-ref.js';

/** 视图内元素 id（ARIA 关联用，同页多实例互不冲突）。 */
export interface ViewIds {
  readonly suggestionList: string;
  readonly dialogTitle: string;
  readonly detailDescription: string;
  readonly detailDue: string;
}

/** 视图公共底座：数据桥、根元素、提示、焦点与「今天」。 */
export interface ViewCore {
  readonly board: UseBoardReturn;
  /** 最新一帧的看板数据（`await` 之后读它，不读闭包里的旧帧）。 */
  readonly boardRef: LatestRef<UseBoardReturn>;
  readonly areaRef: RefObject<HTMLElement | null>;
  readonly ids: ViewIds;
  readonly today: string;
  /** 写入口门禁：恢复中 / 读取中 / 读取失败。 */
  readonly writeLocked: boolean;
  readonly notice: string | null;
  readonly toast: ToastState | null;
  readonly exportBackupRef: LatestRef<(() => void | Promise<void>) | undefined>;
  readonly setNotice: (message: string | null) => void;
  readonly setToast: (toast: ToastState | null) => void;
  readonly showNotice: (message: string) => void;
  readonly showToast: (message: string, undoable: boolean) => void;
  /** 执行领域动作：先清旧提示，失败转提示并返回 `undefined`。 */
  readonly guard: <T>(operation: () => Promise<T>) => Promise<T | undefined>;
  readonly focusSoon: (selector: string) => void;
  readonly focusTaskSoon: (taskId: UUID) => void;
  readonly setReturnFocus: (target: EventTarget | null) => void;
  readonly restoreFocus: () => void;
}

/**
 * 聚焦卡片并在约 1 秒内守住：提交与重渲染是异步的，卡片节点被移动 / 重建时焦点会掉回 body，
 * 掉回时补聚焦；用户已把焦点移到别处（如按 `/` 进筛选框）立即停止，不抢焦点。
 */
const focusTaskLater = (area: () => HTMLElement | null, taskId: UUID, attempts: number, force: boolean): void => {
  const card = area()?.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`);
  const active = document.activeElement;
  const idle = active === null || active === document.body || active === card;
  if (!force && !idle) return;
  if (card && active !== card) card.focus();
  if (attempts > 0) requestAnimationFrame(() => focusTaskLater(area, taskId, attempts - 1, false));
};

/**
 * 等目标渲染且可聚焦再聚焦（渲染与活查询回流都是异步的；禁用中的输入框 focus 会静默失败），
 * 逐帧重试至多 30 帧。
 */
const focusLater = (area: () => HTMLElement | null, selector: string, attempts: number): void => {
  const target = area()?.querySelector<HTMLElement>(selector);
  target?.focus();
  if (target && document.activeElement === target) return;
  if (attempts > 0) requestAnimationFrame(() => focusLater(area, selector, attempts - 1));
};

/** 安装看板数据桥：搜索插件可用时注入上游，否则带上不可用原因。 */
const useInstalledBoard = (rxdb: RxDB): UseBoardReturn => {
  const installed = rxdb.getPlugins('search')[0] as { readonly searchCollection?: unknown } | undefined;
  const upstream = installed && typeof installed.searchCollection === 'function' ? installed : undefined;
  const searchUnavailableReason: BoardSearchUnavailableReason | undefined =
    installed === undefined ? 'plugin_not_installed'
    : upstream === undefined ? 'adapter_unsupported'
    : undefined;
  return useBoard(
    rxdb,
    upstream ? { search: { upstream: upstream as BoardSearchUpstream } } : { searchUnavailableReason }
  );
};

/** 提示横幅（5 秒）与操作提示（6 秒）。 */
const useFeedback = () => {
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const timers = useRef<{ notice: number | null; toast: number | null }>({ notice: null, toast: null });

  useEffect(() => {
    const current = timers.current;
    return () => {
      if (current.notice !== null) window.clearTimeout(current.notice);
      if (current.toast !== null) window.clearTimeout(current.toast);
    };
  }, []);

  const showNotice = (message: string): void => {
    setNotice(message);
    if (timers.current.notice !== null) window.clearTimeout(timers.current.notice);
    timers.current.notice = window.setTimeout(() => setNotice(null), 5000);
  };
  const showToast = (message: string, undoable: boolean): void => {
    setToast({ message, undoable });
    if (timers.current.toast !== null) window.clearTimeout(timers.current.toast);
    timers.current.toast = window.setTimeout(() => setToast(null), 6000);
  };
  const guard = async <T>(operation: () => Promise<T>): Promise<T | undefined> => {
    try {
      setNotice(null);
      return await operation();
    } catch (error) {
      showNotice(errorText(error));
      return undefined;
    }
  };
  return { notice, toast, setNotice, setToast, showNotice, showToast, guard };
};

/** 本地「今天」：窗口聚焦 / 页面可见时重算，并在下一个本地午夜自动刷新（逾期判定基准）。 */
const useToday = (): string => {
  const [today, setToday] = useState(() => localDateKey(new Date()));
  useEffect(() => {
    let timer: number | null = null;
    const refresh = (): void => {
      const now = new Date();
      setToday(localDateKey(now));
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(refresh, msUntilNextLocalMidnight(now));
    };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return today;
};

/** 视图公共底座。 */
export const useViewCore = (rxdb: RxDB, exportBackup: (() => void | Promise<void>) | undefined): ViewCore => {
  const board = useInstalledBoard(rxdb);
  const boardRef = useRef(board);
  boardRef.current = board;
  const exportBackupRef = useRef(exportBackup);
  exportBackupRef.current = exportBackup;
  const areaRef = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const uid = useId().replace(/[^\w-]/g, '');
  const feedback = useFeedback();
  const today = useToday();

  // 跨页恢复门禁（US-539 AC#5）：另一页开始恢复时经 storage 事件同步「恢复中」
  useEffect(() => {
    const onStorage = (): void => {
      boardRef.current.setRestoring(
        typeof localStorage !== 'undefined' && localStorage.getItem(RESTORING_MARKER_KEY) !== null
      );
    };
    onStorage();
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const area = (): HTMLElement | null => areaRef.current;
  return {
    board,
    boardRef,
    areaRef,
    ids: {
      suggestionList: `rxb-${uid}-suggestions`,
      dialogTitle: `rxb-${uid}-dialog-title`,
      detailDescription: `rxb-${uid}-description`,
      detailDue: `rxb-${uid}-due`
    },
    today,
    writeLocked: board.restoring || board.loading || board.readError !== null,
    exportBackupRef,
    ...feedback,
    focusSoon: selector => focusLater(area, selector, 30),
    focusTaskSoon: taskId => focusTaskLater(area, taskId, 60, true),
    setReturnFocus: target => {
      returnFocusRef.current = target instanceof HTMLElement ? target : null;
    },
    restoreFocus: () => {
      const target = returnFocusRef.current;
      returnFocusRef.current = null;
      if (target?.isConnected) target.focus();
    }
  };
};
