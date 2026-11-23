import type { ProgramProcess } from './coreutils';

export interface TerminalCommandRequest {
  readonly pid: number;
  readonly args: readonly string[];
  readonly cwd: string;
}

export interface TerminalCommandResponse {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** 在 Vivari 子进程里执行，等待桌面返回命令输出和退出码。 */
export function runTerminalCommand(process: ProgramProcess, command: string): void {
  const name = process.env[`AIAO_${command.toUpperCase()}_CHANNEL`];
  if (!name) {
    process.stderr.write(`${command}: desktop connection unavailable\n`);
    return process.exit(1);
  }
  const channel = new BroadcastChannel(name);
  // BroadcastChannel 不计入 Vivari 的进程句柄。引用 stdin 保持进程存活，不读取管道里的数据。
  process.stdin.ref();
  channel.onmessage = ({ data }: MessageEvent<TerminalCommandResponse & { pid: number }>) => {
    if (data.pid !== process.pid || typeof data.exitCode !== 'number') return;
    channel.close();
    if (data.stdout) process.stdout.write(`${data.stdout}\n`);
    if (data.stderr) process.stderr.write(`${data.stderr}\n`);
    process.exitCode = data.exitCode;
    process.stdin.unref();
  };
  channel.postMessage({ pid: process.pid, args: process.argv.slice(2), cwd: process.cwd() } satisfies TerminalCommandRequest);
}

export const terminalCommandSource = (command: string): string =>
  `(${runTerminalCommand.toString()})(process, ${JSON.stringify(command)});\n`;

function isRequest(value: unknown): value is TerminalCommandRequest {
  const request = value as Partial<TerminalCommandRequest> | null;
  return (
    !!request &&
    Number.isSafeInteger(request.pid) &&
    typeof request.cwd === 'string' &&
    request.cwd.startsWith('/') &&
    Array.isArray(request.args) &&
    request.args.every(arg => typeof arg === 'string')
  );
}

/** 同一台虚拟机上的同名命令按到达顺序执行，完成后才唤醒发起命令的子进程。 */
export class TerminalCommandChannel {
  private readonly channel: BroadcastChannel;
  private pending = Promise.resolve();

  constructor(name: string, execute: (request: TerminalCommandRequest) => Promise<TerminalCommandResponse>) {
    this.channel = new BroadcastChannel(name);
    this.channel.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (!isRequest(data)) return;
      this.pending = this.pending.then(async () => {
        const response = await execute(data);
        this.channel.postMessage({ pid: data.pid, ...response });
      });
    };
  }

  async close(): Promise<void> {
    this.channel.onmessage = null;
    await this.pending;
    this.channel.close();
  }
}
