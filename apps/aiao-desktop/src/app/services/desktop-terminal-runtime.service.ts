import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { Vivari, type VivariProcess } from '@vivari/core';

/** 旧桌面运行时里的 Terminal 窗口可以调用的控制面。 */
export interface DesktopTerminalController {
  newTab(): void;
  run(command: string): void;
  fit(): void;
  dispose(): void;
}

type RuntimeWindow = Window & {
  __aiaoTerminalBridge?: {
    mount(host: HTMLElement, onClose: () => void): DesktopTerminalController;
  };
};

interface TerminalTab {
  readonly terminal: Terminal;
  readonly fitAddon: FitAddon;
  readonly panel: HTMLDivElement;
  readonly button: HTMLButtonElement;
  process: VivariProcess | null;
  writer: WritableStreamDefaultWriter<string> | null;
  pendingInput: string;
  inputQueue: Promise<void>;
  disposed: boolean;
}

/** 在浏览器页内把 xterm 接到 Vivari 的真实 shell。 */
@Injectable({ providedIn: 'root' })
export class DesktopTerminalRuntimeService {
  private readonly document = inject(DOCUMENT);
  /** 给旧桌面脚本安装终端挂载桥。 */
  install(): void {
    const host = this.document.defaultView as RuntimeWindow | null;
    if (!host) return;

    host.__aiaoTerminalBridge = {
      mount: (container, onClose) => new DesktopTerminalControllerImpl(container, onClose, () => this.boot())
    };
  }

  private boot(): Promise<Vivari> {
    return Vivari.boot({ serviceWorkerUrl: false });
  }
}

class DesktopTerminalControllerImpl implements DesktopTerminalController {
  private readonly tabsBar: HTMLDivElement;
  private readonly panels: HTMLDivElement;
  private readonly tabs: TerminalTab[] = [];
  private readonly resizeObserver: ResizeObserver | null;
  private activeIndex = 0;
  private disposed = false;
  private runtime: Promise<Vivari> | null = null;

  constructor(
    private readonly host: HTMLElement,
    private readonly onClose: () => void,
    private readonly boot: () => Promise<Vivari>
  ) {
    this.host.classList.add('xterm-host');
    this.host.replaceChildren();

    this.tabsBar = this.createTabsBar();
    this.panels = document.createElement('div');
    this.panels.className = 'xterm-panels';
    this.host.append(this.tabsBar, this.panels);

    this.resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.fit());
    this.resizeObserver?.observe(this.host);

    this.newTab();
  }

  newTab(): void {
    if (this.disposed) return;

    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: "'SF Mono', ui-monospace, 'JetBrains Mono', Menlo, Monaco, Consolas, monospace",
      fontSize: 12.5,
      scrollback: 5_000,
      theme: {
        background: '#1b1b1d',
        foreground: '#e6e6e6',
        cursor: '#ffffff',
        selectionBackground: 'rgba(120, 170, 255, 0.35)'
      }
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    const panel = document.createElement('div');
    panel.className = 'xterm-panel';
    this.panels.append(panel);
    terminal.open(panel);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tm-tab';
    button.innerHTML = '<span class="tm-tab-title"></span><span class="x">×</span>';
    button.querySelector<HTMLElement>('.tm-tab-title')!.textContent = 'Local shell';

    const tab: TerminalTab = {
      terminal,
      fitAddon,
      panel,
      button,
      process: null,
      writer: null,
      pendingInput: '',
      inputQueue: Promise.resolve(),
      disposed: false
    };
    const index = this.tabs.push(tab) - 1;

    button.addEventListener('click', event => {
      const currentIndex = this.tabs.indexOf(tab);
      if (currentIndex < 0) return;
      if ((event.target as HTMLElement).closest('.x')) {
        event.stopPropagation();
        this.closeTab(currentIndex);
        return;
      }
      this.activate(currentIndex);
    });
    terminal.onData(data => this.queueInput(tab, data));
    terminal.onResize(size => tab.process?.resize({ cols: size.cols, rows: size.rows }));

    this.activate(index);
    void this.start(tab);
  }

  run(command: string): void {
    const tab = this.tabs[this.activeIndex];
    if (!tab || tab.disposed) return;
    this.queueInput(tab, `${command}\r`);
    tab.terminal.focus();
  }

  fit(): void {
    if (this.disposed) return;
    const tab = this.tabs[this.activeIndex];
    if (!tab || tab.disposed) return;
    tab.fitAddon.fit();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver?.disconnect();

    for (const tab of this.tabs) this.disposeTab(tab);
    this.tabs.length = 0;
    this.host.replaceChildren();

    void this.runtime?.then(runtime => runtime.teardown()).catch(() => undefined);
  }

  private createTabsBar(): HTMLDivElement {
    const tabsBar = document.createElement('div');
    tabsBar.className = 'tm-tabs';

    const newTab = document.createElement('button');
    newTab.type = 'button';
    newTab.className = 'tm-tab tm-new-tab';
    newTab.textContent = '+';
    newTab.title = 'New Tab';
    newTab.addEventListener('click', () => this.newTab());
    tabsBar.append(newTab);
    return tabsBar;
  }

  private activate(index: number): void {
    if (this.disposed || !this.tabs[index]) return;
    this.activeIndex = index;
    this.tabs.forEach((tab, tabIndex) => {
      tab.button.classList.toggle('on', tabIndex === index);
      tab.panel.hidden = tabIndex !== index;
    });
    this.fit();
    this.tabs[index].terminal.focus();
  }

  private closeTab(index: number): void {
    if (this.disposed || !this.tabs[index]) return;
    if (this.tabs.length === 1) {
      this.onClose();
      return;
    }

    const [tab] = this.tabs.splice(index, 1);
    this.disposeTab(tab);
    this.activeIndex = Math.min(this.activeIndex, this.tabs.length - 1);
    this.refreshTabBar();
    this.activate(this.activeIndex);
  }

  private refreshTabBar(): void {
    const newTab = this.tabsBar.querySelector('.tm-new-tab');
    this.tabsBar.replaceChildren(...this.tabs.map(tab => tab.button));
    if (newTab) this.tabsBar.append(newTab);
  }

  private async start(tab: TerminalTab): Promise<void> {
    tab.terminal.writeln('\x1b[2mStarting local shell with Vivari…\x1b[0m');

    try {
      this.runtime ??= this.boot();
      const runtime = await this.runtime;
      if (this.disposed || tab.disposed) return;

      this.fitAddon(tab);
      const process = await runtime.spawn('sh', [], {
        cwd: '/',
        env: {
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor'
        },
        terminal: this.dimensions(tab)
      });
      if (this.disposed || tab.disposed) {
        process.kill();
        return;
      }

      tab.process = process;
      tab.writer = process.input.getWriter();
      const pendingInput = tab.pendingInput;
      tab.pendingInput = '';
      if (pendingInput) this.queueInput(tab, pendingInput);

      void this.consumeOutput(tab, process);
      void process.exit.then(code => {
        if (tab.disposed) return;
        tab.writer?.releaseLock();
        tab.writer = null;
        tab.process = null;
        tab.terminal.writeln(`\r\n\x1b[2m[process exited with code ${code}]\x1b[0m`);
      });
    } catch (error) {
      if (tab.disposed) return;
      const message = error instanceof Error ? error.message : String(error);
      tab.terminal.writeln(`\r\n\x1b[31mVivari failed to start the local shell: ${message}\x1b[0m`);
    }
  }

  private async consumeOutput(tab: TerminalTab, process: VivariProcess): Promise<void> {
    try {
      for await (const chunk of process.output) {
        if (tab.disposed) return;
        tab.terminal.write(chunk);
      }
    } catch (error) {
      if (tab.disposed) return;
      const message = error instanceof Error ? error.message : String(error);
      tab.terminal.writeln(`\r\n\x1b[31mterminal output failed: ${message}\x1b[0m`);
    }
  }

  private queueInput(tab: TerminalTab, data: string): void {
    if (tab.disposed) return;
    tab.inputQueue = tab.inputQueue.then(async () => {
      if (!tab.writer) {
        tab.pendingInput += data;
        return;
      }
      try {
        await tab.writer.write(data);
      } catch {
        tab.pendingInput += data;
      }
    });
  }

  private fitAddon(tab: TerminalTab): void {
    if (this.activeIndex === this.tabs.indexOf(tab)) tab.fitAddon.fit();
  }

  private dimensions(tab: TerminalTab): { cols: number; rows: number } {
    if (this.activeIndex === this.tabs.indexOf(tab)) tab.fitAddon.fit();
    return { cols: Math.max(2, tab.terminal.cols), rows: Math.max(2, tab.terminal.rows) };
  }

  private disposeTab(tab: TerminalTab): void {
    if (tab.disposed) return;
    tab.disposed = true;
    tab.process?.kill();
    tab.process = null;
    tab.writer?.releaseLock();
    tab.writer = null;
    tab.fitAddon.dispose();
    tab.terminal.dispose();
    tab.panel.remove();
    tab.button.remove();
  }
}
