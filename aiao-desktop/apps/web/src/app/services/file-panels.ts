import { Service, computed, signal } from '@angular/core';

import type { DiskPath } from '../disk/disk-path';

/** 面板的两种用途：打开选一个文件；保存选位置与文件名。 */
export type FilePanelMode = 'open' | 'save';

/** 打开或保存面板的一次请求（ADESK-US-206 阶段 D）：谁在请求、要什么、有哪些限制。 */
export interface FilePanelRequest {
  /** 用途。 */
  readonly mode: FilePanelMode;
  /** 发起请求的应用，面板的标题里说清楚是谁要打开或保存文件。 */
  readonly app: { readonly id: string; readonly name: string; readonly icon: string };
  /** 只做显示过滤的类型列表（扩展名 `.md`、MIME `text/*`）；空表示不过滤。 */
  readonly accept: readonly string[];
  /** 打开面板：大于它的文件在面板里禁用选择并说明原因。 */
  readonly maxBytes: number;
  /** 保存面板：预填的文件名。 */
  readonly suggestedName: string;
  /** 文件名的字符数上限。 */
  readonly nameLength: number;
  /** 面板关闭之后把焦点还给发起它的窗口。 */
  readonly restoreFocus: () => void;
}

/** 用户在面板里选定的结果。取消不是结果，面板用 `null` 表示取消。 */
export type FilePanelResult =
  | { readonly kind: 'open'; readonly path: DiskPath }
  | { readonly kind: 'save'; readonly dir: DiskPath; readonly name: string; readonly replace: boolean };

/** 发起请求的一方拿到的凭据：等结果，或在窗口关闭、实例销毁时把面板收回。 */
export interface FilePanelTicket {
  /** 用户选定时是选定的结果，取消（按钮、Esc）或被收回时是 `null`。 */
  readonly result: Promise<FilePanelResult | null>;
  /** 把面板收回：面板随之关闭、不再提交任何结果。幂等。 */
  close(): void;
}

/** 屏幕上的一个面板：面板组件读它的请求，用户的选择经 `submit` / `cancel` 交还。 */
export class ActiveFilePanel {
  private settled = false;

  constructor(
    /** 这个面板的请求。 */
    readonly request: FilePanelRequest,
    private readonly finish: (panel: ActiveFilePanel, result: FilePanelResult | null) => void
  ) {}

  /** 用户确认了选择。面板已经结束（取消、被收回）之后什么也不做。 */
  submit(result: FilePanelResult): void {
    this.settle(result);
  }

  /** 用户取消（取消按钮或 Esc）。 */
  cancel(): void {
    this.settle(null);
  }

  private settle(result: FilePanelResult | null): void {
    if (this.settled) return;
    this.settled = true;
    this.finish(this, result);
  }
}

/**
 * 桌面自己的打开 / 保存面板的请求队列（ADESK-US-206 阶段 D）：应用只能请求，面板里选什么、是否覆盖由用户决定。
 * 面板是模态的，同一时刻只有最上面的一个可以操作（不同窗口的应用可以各自有面板在队列里，同一个实例同一时刻只开一个，由应用上下文保证）。
 *
 * 这个服务在首屏里，面板的界面是按需装载的组件：第一次有面板请求时才下载。
 */
@Service({ autoProvided: false })
export class FilePanels {
  private readonly stack = signal<readonly ActiveFilePanel[]>([]);
  private readonly resolvers = new Map<ActiveFilePanel, (result: FilePanelResult | null) => void>();

  /** 最上面的面板；没有面板时为 `null`。 */
  readonly current = computed(() => this.stack().at(-1) ?? null);

  /** 弹出一个面板。 */
  show(request: FilePanelRequest): FilePanelTicket {
    let resolve!: (result: FilePanelResult | null) => void;
    const result = new Promise<FilePanelResult | null>(done => (resolve = done));
    const panel = new ActiveFilePanel(request, (finished, outcome) => this.end(finished, outcome));
    this.resolvers.set(panel, resolve);
    this.stack.update(list => [...list, panel]);
    return { result, close: () => panel.cancel() };
  }

  private end(panel: ActiveFilePanel, outcome: FilePanelResult | null): void {
    this.stack.update(list => list.filter(item => item !== panel));
    this.resolvers.get(panel)?.(outcome);
    this.resolvers.delete(panel);
  }
}
