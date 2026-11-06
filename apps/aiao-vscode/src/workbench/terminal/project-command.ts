import type { WorkbenchFiles } from '../session.js';

/** 项目启动只执行受支持的包管理器和清单脚本。 */
export interface TerminalProjectPlan {
  readonly manager: 'npm' | 'pnpm';
  readonly script: 'dev' | 'start';
  /** 追加给启动脚本的固定参数，只由下方规则产生，不取自清单内容。 */
  readonly args: readonly string[];
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function manifest(files: WorkbenchFiles): Record<string, unknown> {
  const source = files['package.json'];
  if (source === undefined) throw new Error('项目根目录缺少 package.json，无法启动项目');
  let parsed: unknown;
  try {
    const content = typeof source === 'string' ? source : new TextDecoder('utf-8', { fatal: true }).decode(source);
    parsed = JSON.parse(content);
  } catch {
    throw new Error('package.json 不是有效的 JSON');
  }
  if (!record(parsed)) throw new Error('package.json 必须是对象');
  return parsed;
}

function manager(value: unknown, files: WorkbenchFiles): TerminalProjectPlan['manager'] {
  if (value === undefined) return Object.hasOwn(files, 'pnpm-lock.yaml') ? 'pnpm' : 'npm';
  const selected = typeof value === 'string' ? /^(npm|pnpm)@[^@\s]+$/.exec(value)?.[1] : undefined;
  if (selected === 'npm' || selected === 'pnpm') return selected;
  throw new Error('package.json packageManager 仅支持 npm@版本 或 pnpm@版本');
}

/** vite 在终端里启动会清屏，冲掉刚输出的安装过程；脚本没写清屏配置时补 `--clearScreen false`。 */
function scriptArgs(command: string): readonly string[] {
  const vite = /^vite(\s|$)/.test(command.trim());
  return vite && !/--clear-?screen/i.test(command) ? ['--clearScreen', 'false'] : [];
}

function script(value: unknown): Pick<TerminalProjectPlan, 'script' | 'args'> {
  const scripts: Record<string, unknown> = record(value) ? value : {};
  for (const name of ['dev', 'start'] as const) {
    const command = scripts[name];
    if (typeof command === 'string' && command.trim()) return { script: name, args: scriptArgs(command) };
  }
  throw new Error('package.json 需要配置非空的 scripts.dev 或 scripts.start 启动脚本');
}

/** 根据项目已保存文件选择包管理器和启动脚本，不执行清单内容。 */
export function projectRunPlan(files: WorkbenchFiles): TerminalProjectPlan {
  const config = manifest(files);
  return { manager: manager(config['packageManager'], files), ...script(config['scripts']) };
}
