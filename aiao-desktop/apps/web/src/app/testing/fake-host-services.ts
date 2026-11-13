import type { DesktopInteraction } from '@aiao/orbit/desktop';
import { Mock, vi } from 'vitest';

import type { AppContextNotifications } from '../services/app-context';
import type { AppContextFiles, FileCreated, FileReplaced, FileSnapshot } from '../services/app-files';
import type { AppContextClipboard } from '../services/browser-clipboard';
import type { FilePanelRequest, FilePanelResult, FilePanelTicket } from '../services/file-panels';

/** 一个屏幕上的假面板：测试像用户一样提交或取消，并能看到它是不是被收回了。 */
export interface FakePanel {
  /** 弹出面板时的请求。 */
  readonly request: FilePanelRequest;
  /** 面板被请求方收回（窗口关闭）了。 */
  closed: boolean;
  /** 用户在面板里选定。 */
  submit(result: FilePanelResult): void;
  /** 用户取消。 */
  cancel(): void;
}

/** {@link fakeHostServices} 的形状：应用上下文用到的通知中心、剪贴板、面板与磁盘门面，全是 spy。 */
export interface FakeHostServices {
  readonly notifications: { post: Mock<AppContextNotifications['post']> };
  readonly clipboard: {
    readText: Mock<() => Promise<string>>;
    writeText: Mock<(text: string) => Promise<void>>;
    userActive: Mock<() => boolean>;
  };
  readonly panels: {
    show: Mock<(request: FilePanelRequest) => FilePanelTicket>;
    readonly shown: FakePanel[];
    readonly top: FakePanel | undefined;
  };
  readonly files: {
    snapshot: Mock<AppContextFiles['snapshot']>;
    replace: Mock<AppContextFiles['replace']>;
    create: Mock<AppContextFiles['create']>;
  };
  readonly refocus: Mock<() => void>;
  /** 按序号发出的文件凭证（`h1`、`h2`…），让测试能断言它们。 */
  readonly newHandle: () => string;
}

/** 默认的文件快照：一个 5 字节的文件，修改时间 1000。 */
export const SNAPSHOT: FileSnapshot = {
  kind: 'ok',
  stamp: { modified: 1_000, size: 5 },
  bytes: new TextEncoder().encode('hello')
};

/**
 * 应用上下文需要的外部服务的替身：通知中心总是接收、剪贴板可读可写（用户手势有效）、面板由测试遥控、
 * 磁盘门面返回默认的结果。每个测试按需改 spy 的返回值。
 */
export function fakeHostServices(): FakeHostServices {
  const shown: FakePanel[] = [];
  let sequence = 0;
  return {
    notifications: { post: vi.fn(() => ({ ok: true as const, id: 'n1' })) },
    clipboard: {
      readText: vi.fn(async () => 'clipboard text'),
      writeText: vi.fn(async () => undefined),
      userActive: vi.fn(() => true)
    } satisfies AppContextClipboard,
    panels: {
      show: vi.fn((request: FilePanelRequest): FilePanelTicket => {
        let settle!: (result: FilePanelResult | null) => void;
        const result = new Promise<FilePanelResult | null>(resolve => (settle = resolve));
        const panel: FakePanel = { request, closed: false, submit: value => settle(value), cancel: () => settle(null) };
        shown.push(panel);
        return {
          result,
          close: () => {
            panel.closed = true;
            settle(null);
          }
        };
      }),
      shown,
      get top() {
        return shown.at(-1);
      }
    },
    files: {
      snapshot: vi.fn(async () => SNAPSHOT),
      replace: vi.fn(async (): Promise<FileReplaced> => ({ kind: 'ok', stamp: { modified: 2_000, size: 7 } })),
      create: vi.fn(async (): Promise<FileCreated> => ({ kind: 'ok', stamp: { modified: 3_000, size: 7 } }))
    },
    refocus: vi.fn(),
    newHandle: () => `h${++sequence}`
  };
}

/** 一个会记下「用户等待」起止的计时控制：`waiting()` 在面板开着的那段是 true，用来断言宿主只在等用户时暂停计时。 */
export function recordingInteraction(): {
  interaction: DesktopInteraction;
  waiting: () => boolean;
  waits: () => number;
} {
  let depth = 0;
  let count = 0;
  return {
    interaction: {
      async waitForUser<T>(pending: Promise<T>): Promise<T> {
        depth++;
        count++;
        try {
          return await pending;
        } finally {
          depth--;
        }
      }
    },
    waiting: () => depth > 0,
    waits: () => count
  };
}
