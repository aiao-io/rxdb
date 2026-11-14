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

import { OPEN_OSC } from '../../vm/coreutils';
import { SHELL_ENV, SHELL_HOME, VirtualMachine } from '../../vm/virtual-machine';

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** 一个终端标签：xterm 接到页面共用的 Vivari 虚拟机里真实的 `sh` 进程，从 Macintosh HD 的主目录开始。 */
@Component({
  selector: 'app-terminal-tab',
  host: { style: 'display: contents' },
  template: `<div class="xterm-panel" #panel [hidden]="!active()"></div>`
})
export class TerminalTab implements OnDestroy {
  private readonly vm = inject(VirtualMachine);
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

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
  private readonly fitAddon = new FitAddon();
  private process: VivariProcess | null = null;
  private writer: WritableStreamDefaultWriter<string> | null = null;
  private pendingInput = '';
  private inputQueue = Promise.resolve();
  private disposed = false;
  private acquired = false;

  readonly active = input(false);

  constructor() {
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.onData(data => this.queueInput(data));
    this.terminal.onResize(size => this.process?.resize({ cols: size.cols, rows: size.rows }));
    /* `open` 命令把要打开的路径写成 OSC 序列，这里截下来交给桌面，不显示在终端里。 */
    this.terminal.parser.registerOscHandler(OPEN_OSC, data => {
      void this.vm.open(data);
      return true;
    });
    afterNextRender(() => {
      this.terminal.open(this.panel().nativeElement);
      void this.start();
    });
    afterRenderEffect(() => {
      if (!this.active()) return;
      this.fit();
      this.terminal.focus();
    });
  }

  fit(): void {
    if (!this.disposed && this.active()) this.fitAddon.fit();
  }

  run(command: string): void {
    this.queueInput(`${command}\r`);
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
    this.terminal.writeln('\x1b[2mStarting local shell with Vivari…\x1b[0m');
    this.acquired = true;
    try {
      const runtime = await this.vm.acquire();
      if (this.disposed) return;
      this.fit();
      const process = await runtime.spawn('sh', [], {
        cwd: SHELL_HOME,
        env: { ...SHELL_ENV },
        terminal: { cols: Math.max(2, this.terminal.cols), rows: Math.max(2, this.terminal.rows) }
      });
      if (this.disposed) {
        process.kill();
        return;
      }
      this.attach(process);
    } catch (error) {
      if (!this.disposed)
        this.terminal.writeln(`\r\n\x1b[31mVivari failed to start the local shell: ${describe(error)}\x1b[0m`);
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
      this.terminal.writeln(`\r\n\x1b[2m[process exited with code ${code}]\x1b[0m`);
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
      if (!this.disposed) this.terminal.writeln(`\r\n\x1b[31mterminal output failed: ${describe(error)}\x1b[0m`);
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
