import { WorkbenchSession, type WorkbenchCompilation, type WorkbenchSnapshot } from './session.js';

/** 保存与后台预览的界面阶段。 */
export type SavePreviewPhase = 'idle' | 'saving' | 'waiting' | 'compiling' | 'error';

/** 编译只读取已保存快照，不向工作区或 Git 写入。 */
export type SavePreviewCompile = (snapshot: WorkbenchSnapshot, signal: AbortSignal) => Promise<WorkbenchCompilation>;

/** 保存后的预览排程配置。 */
export interface SavePreviewOptions {
  /** 连续保存合并编译的等待时间。 @defaultValue 100 */
  delayMs?: number;
  onPhase?: (phase: SavePreviewPhase) => void;
  /** 仅接收后台预览错误；保存和显式运行错误由对应 Promise 返回。 */
  onError?: (cause: Error) => void;
}

/** 保存完成即可继续 Git 操作，预览随后在后台更新。 */
export interface SavePreviewController {
  save(paths?: readonly string[]): Promise<void>;
  run(): Promise<void>;
  /** 自动打开项目时只预览磁盘快照，不持久化用户正在输入的草稿。 */
  runSaved(): Promise<void>;
  /** 切换项目、恢复或丢弃缓冲前取消待运行的预览；不打断落盘。 */
  cancel(): void;
  /** 先于 session 释放，终止排程和编译。 */
  dispose(): void;
}

interface PreviewIntent {
  epoch: number;
  projectId: string;
}

function waitForCompilation(
  promise: Promise<WorkbenchCompilation>,
  signal: AbortSignal
): Promise<WorkbenchCompilation> {
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort);
    const abort = () => {
      cleanup();
      reject(new DOMException('编译已取消', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
      result => {
        cleanup();
        resolve(result);
      },
      cause => {
        cleanup();
        reject(cause);
      }
    );
    if (signal.aborted) abort();
  });
}

/** 用持久化屏障和编译代次合并连续保存。 */
export function createSavePreviewController(
  session: WorkbenchSession,
  compile: SavePreviewCompile,
  options: SavePreviewOptions = {}
): SavePreviewController {
  let epoch = 0;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: AbortController | undefined;
  let target: { projectId: string; revision: string | null } | undefined;
  let lastPreview: { projectId: string; revision: string } | undefined;
  const current = (intent: PreviewIntent) =>
    !disposed && intent.epoch === epoch && session.state.projectId === intent.projectId;
  const phase = (value: SavePreviewPhase) => options.onPhase?.(value);

  function invalidate(): void {
    epoch++;
    session.cancelRun();
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    active?.abort();
    active = undefined;
    target = undefined;
  }

  function begin(): PreviewIntent {
    if (disposed) throw new Error('保存预览调度器已经释放');
    const projectId = session.state.projectId;
    if (!projectId) throw new Error('请先打开项目');
    invalidate();
    return { epoch, projectId };
  }

  async function persist(intent: PreviewIntent, paths?: readonly string[]): Promise<void> {
    while (current(intent)) {
      await session.save(paths);
      const modified = paths ? paths.some(path => session.isModified(path)) : session.state.dirty;
      if (!modified) return;
    }
  }

  async function preview(intent: PreviewIntent): Promise<void> {
    if (!current(intent)) return;
    const controller = new AbortController();
    active = controller;
    target = { projectId: intent.projectId, revision: session.state.revision };
    phase('compiling');
    try {
      await session.runSaved(async snapshot => {
        if (!current(intent) || controller.signal.aborted) throw new DOMException('编译已取消', 'AbortError');
        const result = await waitForCompilation(compile(snapshot, controller.signal), controller.signal);
        if (!current(intent) || controller.signal.aborted) throw new DOMException('编译已取消', 'AbortError');
        return result;
      });
      if (current(intent)) {
        const revision = session.state.preview?.revision ?? target?.revision ?? session.state.revision;
        target = undefined;
        if (revision) lastPreview = { projectId: intent.projectId, revision };
        phase('idle');
      }
    } finally {
      if (active === controller) active = undefined;
    }
  }

  return {
    async save(paths) {
      const scope = paths ? [...paths] : undefined;
      const modified = scope ? scope.some(path => session.isModified(path)) : session.state.dirty;
      if (!disposed && !modified) {
        const revision = session.state.revision;
        const covered =
          (target?.projectId === session.state.projectId && target?.revision === revision) ||
          (lastPreview?.projectId === session.state.projectId && lastPreview.revision === revision);
        if (covered) return;
      }
      const intent = begin();
      phase('saving');
      try {
        await persist(intent, scope);
        if (!current(intent)) return;
        target = { projectId: intent.projectId, revision: session.state.revision };
        phase('waiting');
        timer = setTimeout(() => {
          timer = undefined;
          void preview(intent).catch(cause => {
            if (!current(intent)) return;
            target = undefined;
            phase('error');
            options.onError?.(cause instanceof Error ? cause : new Error(String(cause)));
          });
        }, options.delayMs ?? 100);
      } catch (cause) {
        if (!current(intent)) return;
        target = undefined;
        phase('error');
        throw cause;
      }
    },
    async run() {
      const intent = begin();
      phase('saving');
      try {
        await persist(intent);
        await preview(intent);
      } catch (cause) {
        if (!current(intent)) return;
        target = undefined;
        phase('error');
        throw cause;
      }
    },
    async runSaved() {
      const intent = begin();
      try {
        await preview(intent);
      } catch (cause) {
        if (!current(intent)) return;
        target = undefined;
        phase('error');
        throw cause;
      }
    },
    cancel() {
      if (disposed) return;
      invalidate();
      phase('idle');
    },
    dispose() {
      if (disposed) return;
      invalidate();
      disposed = true;
    }
  };
}
