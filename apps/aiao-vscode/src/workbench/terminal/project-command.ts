import type { WorkbenchFiles } from '../session.js';

/** 项目启动只执行受支持的包管理器和清单脚本。 */
export interface TerminalProjectPlan {
  readonly manager: 'npm' | 'pnpm';
  readonly script: 'dev' | 'start';
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

function script(value: unknown): TerminalProjectPlan['script'] {
  const scripts: Record<string, unknown> = record(value) ? value : {};
  const selected = (['dev', 'start'] as const).find(name => typeof scripts[name] === 'string' && scripts[name].trim());
  if (selected) return selected;
  throw new Error('package.json 需要配置非空的 scripts.dev 或 scripts.start 启动脚本');
}

/** 根据项目已保存文件选择包管理器和启动脚本，不执行清单内容。 */
export function projectRunPlan(files: WorkbenchFiles): TerminalProjectPlan {
  const config = manifest(files);
  return { manager: manager(config['packageManager'], files), script: script(config['scripts']) };
}
