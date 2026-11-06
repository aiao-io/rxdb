/** 终端视图与浏览器 Shell 之间的输入、尺寸事件。 */
export interface TerminalViewOptions {
  onData(data: string): void;
  onResize(size: { cols: number; rows: number }): void;
}

/** 保留 ANSI 与交互输入的终端视图，不解析或执行命令。 */
export interface TerminalView {
  readonly cols: number;
  readonly rows: number;
  write(data: string): void;
  focus(): void;
  fit(): void;
  clear(): void;
  dispose(): void;
}

/** 懒加载 xterm 并随可见面板尺寸调整终端。 */
export async function createTerminalView(host: HTMLElement, options: TerminalViewOptions): Promise<TerminalView> {
  const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]);
  const terminal = new Terminal({
    cols: 80,
    rows: 24,
    allowProposedApi: false,
    convertEol: true,
    cursorBlink: true,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 12,
    lineHeight: 1.2,
    scrollback: 5000,
    linkHandler: { activate: () => undefined },
    theme: {
      background: '#181818',
      foreground: '#cccccc',
      cursor: '#aeafad',
      selectionBackground: '#264f78',
      black: '#000000',
      red: '#cd3131',
      green: '#0dbc79',
      yellow: '#e5e510',
      blue: '#2472c8',
      magenta: '#bc3fbc',
      cyan: '#11a8cd',
      white: '#e5e5e5',
      brightBlack: '#666666',
      brightRed: '#f14c4c',
      brightGreen: '#23d18b',
      brightYellow: '#f5f543',
      brightBlue: '#3b8eea',
      brightMagenta: '#d670d6',
      brightCyan: '#29b8db',
      brightWhite: '#e5e5e5'
    }
  });
  const addon = new FitAddon();
  let disposed = false;
  let lastSize = '';

  function reportSize(size: { cols: number; rows: number }): void {
    if (disposed || size.cols < 1 || size.rows < 1) return;
    const key = `${size.cols}:${size.rows}`;
    if (key === lastSize) return;
    lastSize = key;
    options.onResize(size);
  }

  function fit(): void {
    if (disposed || !host.isConnected) return;
    const bounds = host.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    addon.fit();
    reportSize({ cols: terminal.cols, rows: terminal.rows });
  }

  try {
    terminal.loadAddon(addon);
    terminal.open(host);
  } catch (cause) {
    terminal.dispose();
    throw cause;
  }
  host.classList.add('wb-terminal-screen');
  host.dataset['workbenchTerminal'] = '';
  terminal.textarea?.setAttribute('aria-label', '终端输入');
  const input = terminal.onData(data => {
    if (!disposed) options.onData(data);
  });
  const resize = terminal.onResize(reportSize);
  const observer = new ResizeObserver(fit);
  observer.observe(host);
  fit();
  void host.ownerDocument.fonts?.ready.then(fit);

  return {
    get cols() {
      return terminal.cols;
    },
    get rows() {
      return terminal.rows;
    },
    write(data) {
      if (!disposed) terminal.write(data);
    },
    focus() {
      if (!disposed) terminal.focus();
    },
    fit,
    clear() {
      if (!disposed) terminal.clear();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      input.dispose();
      resize.dispose();
      terminal.dispose();
      host.replaceChildren();
      host.classList.remove('wb-terminal-screen');
      delete host.dataset['workbenchTerminal'];
    }
  };
}
