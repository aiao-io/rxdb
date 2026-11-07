import type { TerminalContainer } from './terminal-runtime.js';

/** 「运行」可选的方式；`esbuild-wasm` 只做浏览器内编译预览，不启动终端。 */
export const RUNTIME_IDS = ['esbuild-wasm', 'webcontainer', 'vivari', 'nodepod', 'almostnode', 'burrow'] as const;

/** 运行方式标识，见 {@link RUNTIME_IDS}。 */
export type RuntimeId = (typeof RUNTIME_IDS)[number];

export const isRuntimeId = (value: unknown): value is RuntimeId => (RUNTIME_IDS as readonly unknown[]).includes(value);

/** 运行方式在设置里显示的名称。 */
export const RUNTIME_LABELS: Readonly<Record<RuntimeId, string>> = {
  'esbuild-wasm': '即时编译（esbuild-wasm，无终端）',
  webcontainer: 'WebContainer',
  vivari: 'vivari',
  nodepod: 'Nodepod',
  almostnode: 'almostnode',
  burrow: 'burrow'
};

/** 在运行时里启动的一条命令。 */
export interface TerminalCommand {
  readonly command: string;
  readonly args: readonly string[];
}

/** 运行时声明的终端能力，交互 Shell 与项目运行按它启动。 */
export interface RuntimeCapabilities {
  /** 交互 Shell 页签启动的命令。 */
  readonly shell: TerminalCommand;
  /**
   * 输出 OSC 654 状态标记的 shell（如 `jsh --osc`），项目运行把命令输入这里；
   * 没有时项目运行直接起安装、启动进程并自行回显命令行。
   */
  readonly markedShell?: TerminalCommand;
  /**
   * 进程接在伪终端上：Ctrl+C 原样写给进程，由终端驱动转成 SIGINT；
   * 没有伪终端时项目运行自己回显 ^C 并结束前台进程。
   */
  readonly pty: boolean;
}

/** 浏览器内 Node 运行时的接入点：声明能力并启动容器。 */
export interface TerminalRuntimeAdapter {
  readonly id: Exclude<RuntimeId, 'esbuild-wasm'>;
  readonly capabilities: RuntimeCapabilities;
  boot(): Promise<TerminalContainer>;
}
