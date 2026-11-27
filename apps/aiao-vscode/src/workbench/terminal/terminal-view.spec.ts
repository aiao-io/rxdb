// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTerminalView, type TerminalView } from './terminal-view.js';

const fake = vi.hoisted(() => ({
  write: vi.fn(),
  focus: vi.fn(),
  clear: vi.fn(),
  dispose: vi.fn(),
  fit: vi.fn(),
  disposeAddon: vi.fn(),
  cols: 80,
  rows: 24,
  input: undefined as ((data: string) => void) | undefined,
  resize: undefined as ((size: { cols: number; rows: number }) => void) | undefined
}));

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    textarea = document.createElement('textarea');
    write = fake.write;
    focus = fake.focus;
    clear = fake.clear;
    get cols() {
      return fake.cols;
    }
    get rows() {
      return fake.rows;
    }
    loadAddon() {
      return;
    }
    open(host: HTMLElement) {
      host.append(this.textarea);
    }
    onData(callback: (data: string) => void) {
      fake.input = callback;
      return {
        dispose: () => {
          fake.input = undefined;
        }
      };
    }
    onResize(callback: (size: { cols: number; rows: number }) => void) {
      fake.resize = callback;
      return {
        dispose: () => {
          fake.resize = undefined;
        }
      };
    }
    dispose() {
      fake.dispose();
      fake.disposeAddon();
    }
  }
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit = fake.fit;
  }
}));

let resized: ResizeObserverCallback;
let disconnected: ReturnType<typeof vi.fn>;
const views: TerminalView[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  fake.cols = 80;
  fake.rows = 24;
  fake.input = undefined;
  fake.resize = undefined;
  disconnected = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      disconnect = disconnected;
      constructor(callback: ResizeObserverCallback) {
        resized = callback;
      }
      observe() {
        return;
      }
    }
  );
});

afterEach(() => {
  views.splice(0).forEach(view => view.dispose());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

async function fixture(width = 640, height = 180) {
  const host = document.createElement('div');
  vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({ width, height } as DOMRect);
  document.body.append(host);
  const options = { onData: vi.fn(), onResize: vi.fn() };
  const view = await createTerminalView(host, options);
  views.push(view);
  return { host, view, ...options };
}

describe('交互终端视图', () => {
  it('原样转发 ANSI 输出、中文输入与 Ctrl+C，不解释命令', async () => {
    const { host, view, onData } = await fixture();
    view.write('\u001b[31mfailed\u001b[0m\r\n');
    fake.input?.('中文');
    fake.input?.('\u0003');
    expect(fake.write).toHaveBeenCalledWith('\u001b[31mfailed\u001b[0m\r\n');
    expect(onData.mock.calls).toEqual([['中文'], ['\u0003']]);
    expect(host.querySelector('textarea')?.getAttribute('aria-label')).toBe('终端输入');
    view.focus();
    view.clear();
    expect(fake.focus).toHaveBeenCalledOnce();
    expect(fake.clear).toHaveBeenCalledOnce();
  });

  it('可见时拟合尺寸并去重上报，隐藏时不把进程缩到零', async () => {
    const { host, view, onResize } = await fixture(0, 0);
    expect(fake.fit).not.toHaveBeenCalled();
    expect(onResize).not.toHaveBeenCalled();
    vi.mocked(host.getBoundingClientRect).mockReturnValue({ width: 960, height: 240 } as DOMRect);
    fake.cols = 120;
    fake.rows = 32;
    resized([], {} as ResizeObserver);
    expect(fake.fit).toHaveBeenCalledOnce();
    expect(onResize).toHaveBeenCalledExactlyOnceWith({ cols: 120, rows: 32 });
    view.fit();
    fake.resize?.({ cols: 120, rows: 32 });
    expect(onResize).toHaveBeenCalledOnce();
    fake.resize?.({ cols: 0, rows: 0 });
    expect(onResize).toHaveBeenCalledOnce();
    expect([view.cols, view.rows]).toEqual([120, 32]);
  });

  it('释放后停止观察与输入输出，重复释放不影响其他工作台', async () => {
    const { view, onData, onResize } = await fixture();
    onResize.mockClear();
    view.dispose();
    view.dispose();
    fake.input?.('late');
    fake.resize?.({ cols: 100, rows: 30 });
    view.write('late');
    view.focus();
    view.clear();
    resized([], {} as ResizeObserver);
    expect(disconnected).toHaveBeenCalledOnce();
    expect(fake.dispose).toHaveBeenCalledOnce();
    expect(fake.disposeAddon).toHaveBeenCalledOnce();
    expect(fake.write).not.toHaveBeenCalled();
    expect(fake.focus).not.toHaveBeenCalled();
    expect(fake.clear).not.toHaveBeenCalled();
    expect(onData).not.toHaveBeenCalled();
    expect(onResize).not.toHaveBeenCalled();
  });
});
