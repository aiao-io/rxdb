import { useI18n } from '@aiao/rxdb-i18n-angular';
import {
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  afterRenderEffect,
  inject,
  input,
  viewChild
} from '@angular/core';
import { type VivariProcess } from '@vivari/core';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { DesktopAppServices } from '../../services/desktop-app-services';

import { OPEN_OSC } from '../../vm/coreutils';
import { VirtualMachine } from '../../vm/virtual-machine';

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** 一个终端标签：xterm 接到页面共用的 Vivari 虚拟机里真实的 `sh` 进程。 */
@Component({
  selector: 'app-terminal-tab',
  host: { style: 'display: contents' },
  template: `<div class="xterm-panel" #panel [hidden]="!active()"></div>`
})
export class TerminalTab implements OnDestroy {
  private readonly vm = inject(DesktopAppServices).get(VirtualMachine);
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly fitAddon = new FitAddon();

  private readonly terminal = new Terminal({
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
  private process: VivariProcess | null = null;
  private writer: WritableStreamDefaultWriter<string> | null = null;
  private pendingInput = '';
  private inputQueue = Promise.resolve();
  private disposed = false;
  private acquired = false;
  protected readonly i18n = useI18n();

  readonly active = input(false);
  readonly cwd = input.required<string>();
  readonly focusOnMount = input.required<boolean>();
  /** 字号（CSS 像素），由 Shell 菜单的 ⌘+/⌘- 调整。 */
  readonly fontSize = input(12.5);

  constructor() {
    this.terminal.parser.registerOscHandler(OPEN_OSC, async data => {
      await this.vm.open(data);
      return true;
    });
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.onData(data => this.queueInput(data));
    this.terminal.onResize(size => this.process?.resize({ cols: size.cols, rows: size.rows }));
    afterNextRender(() => {
      this.terminal.open(this.panel().nativeElement);
      void this.start();
    });
    let firstActivation = true;
    afterRenderEffect(() => {
      if (!this.active()) return;
      this.fit();
      if (!firstActivation || this.focusOnMount()) this.terminal.focus();
      firstActivation = false;
    });
    /* 字号变化时改 xterm 配置并重新排版，终端打开前只记配置。 */
    afterRenderEffect(() => {
      const size = this.fontSize();
      if (this.terminal.options.fontSize === size) return;
      this.terminal.options.fontSize = size;
      if (this.terminal.element && this.active()) this.fitAddon.fit();
    });
  }

  fit(): void {
    if (!this.disposed && this.active()) this.fitAddon.fit();
  }

  run(command: string): void {
    this.queueInput(`${command}\r`);
    this.terminal.focus();
  }

  /** 清掉滚动缓冲，不向 shell 写入任何命令。 */
  clearScrollback(): void {
    this.terminal.clear();
    this.terminal.focus();
  }

  /** 当前选中的文本；没有选中是空串。 */
  selection(): string {
    return this.terminal.getSelection();
  }

  /** 把文本喂给终端，等同粘贴。 */
  pasteText(text: string): void {
    this.terminal.paste(text);
    this.terminal.focus();
  }

  ngOnDestroy(): void {
    this.disposed = true;
    this.process?.kill();
    this.process = null;
    this.writer?.releaseLock();
    this.writer = null;
    this.fitAddon.dispose();
    this.terminal.dispose();
    if (this.acquired) this.vm.release();
  }

  private async start(): Promise<void> {
    this.terminal.writeln(`\x1b[2m${this.i18n.t('apps.terminal.startingShell')}\x1b[0m`);
    this.acquired = true;
    try {
      const runtime = await this.vm.acquire();
      if (this.disposed) return;
      this.fit();
      const process = await runtime.spawn('sh', [], {
        cwd: this.cwd(),
        env: this.vm.shellEnv,
        terminal: { cols: Math.max(2, this.terminal.cols), rows: Math.max(2, this.terminal.rows) }
      });
      if (this.disposed) {
        process.kill();
        return;
      }
      this.attach(process);
    } catch (error) {
      if (!this.disposed)
        this.terminal.writeln(
          `\r\n\x1b[31m${this.i18n.t('error.terminal.startFailed', { reason: describe(error) })}\x1b[0m`
        );
    }
  }

  private attach(process: VivariProcess): void {
    this.process = process;
    this.writer = process.input.getWriter();
    const pending = this.pendingInput;
    this.pendingInput = '';
    if (pending) this.queueInput(pending);
    void this.consumeOutput(process);
    void process.exit.then(code => {
      if (this.disposed) return;
      this.writer?.releaseLock();
      this.writer = null;
      this.process = null;
      this.terminal.writeln(`\r\n\x1b[2m${this.i18n.t('apps.terminal.processExited', { code: String(code) })}\x1b[0m`);
    });
  }

  private async consumeOutput(process: VivariProcess): Promise<void> {
    try {
      for await (const chunk of process.output) {
        if (this.disposed) return;
        this.terminal.write(chunk);
        this.vm.noteActivity();
      }
    } catch (error) {
      if (!this.disposed)
        this.terminal.writeln(
          `\r\n\x1b[31m${this.i18n.t('error.terminal.outputFailed', { reason: describe(error) })}\x1b[0m`
        );
    }
  }

  /** 进程就绪前的输入先攒着，连上后按顺序补发。 */
  private queueInput(data: string): void {
    if (this.disposed) return;
    this.inputQueue = this.inputQueue.then(async () => {
      if (!this.writer) {
        this.pendingInput += data;
        return;
      }
      try {
        await this.writer.write(data);
      } catch {
        this.pendingInput += data;
      }
    });
  }
}
