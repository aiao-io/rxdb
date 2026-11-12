/**
 * 补给终端的命令：Vivari 自带的 coreutils 只有 echo / cat / ls / mkdir / rm 等，没有 touch、mv、cp、open。
 * 每个命令写成自包含的函数（不引用模块里的任何东西），安装时用 `programSource` 拼成 `/bin/<name>.js`，
 * 在虚拟机里由 Node 以 CommonJS 执行；单测里用同样的源码在宿主 Node 上跑。
 */

/** `open` 把请求写成这个编号的 OSC 转义序列，终端标签截下它交给桌面打开。 */
export const OPEN_OSC = 7337;

/** 程序在虚拟机里用到的 `fs` 子集。 */
export interface ProgramFs {
  existsSync(path: string): boolean;
  statSync(path: string): { isDirectory(): boolean };
  readFileSync(path: string): Uint8Array;
  writeFileSync(path: string, data: Uint8Array | string): void;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  readdirSync(path: string): string[];
  renameSync(from: string, to: string): void;
  utimesSync(path: string, atime: Date, mtime: Date): void;
}

/** 程序在虚拟机里用到的 `path` 子集。 */
export interface ProgramPath {
  resolve(...parts: string[]): string;
  join(...parts: string[]): string;
  basename(path: string): string;
}

export interface ProgramProcess {
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string | undefined>>;
  cwd(): string;
  readonly stdout: { write(text: string): unknown };
  readonly stderr: { write(text: string): unknown };
  exit(code: number): never;
}

/** 安装时一并传给程序的东西：错误说明、`open` 的 OSC 编号、桌面的内置应用名单。 */
export interface ProgramKit {
  explain(error: unknown): string;
  readonly openOsc: number;
  readonly apps: readonly string[];
}

export type Program = (require: (id: string) => unknown, process: ProgramProcess, kit: ProgramKit) => void;

/** `open` 交给桌面的请求：用哪个应用（`null` 表示按文件类型）、是否在 Finder 里显示、绝对路径。 */
export interface OpenRequest {
  readonly app: string | null;
  readonly reveal: boolean;
  readonly paths: readonly string[];
}

/** Node 的系统错误码写成 BSD 工具的说法。 */
function explain(error: unknown): string {
  const known: Readonly<Record<string, string>> = {
    EACCES: 'Permission denied',
    EEXIST: 'File exists',
    EINVAL: 'Invalid argument',
    EISDIR: 'Is a directory',
    ENOENT: 'No such file or directory',
    ENOTDIR: 'Not a directory',
    ENOTEMPTY: 'Directory not empty',
    EPERM: 'Operation not permitted'
  };
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && known[code]) return known[code];
  return error instanceof Error ? error.message : String(error);
}

export const touchProgram: Program = (require, process, kit) => {
  const fs = require('fs') as ProgramFs;
  const path = require('path') as ProgramPath;
  const args = process.argv.slice(2);
  const files = args.filter(arg => !arg.startsWith('-'));
  if (!files.length) {
    process.stderr.write('usage: touch [-c] file ...\n');
    process.exit(64);
  }
  const create = !args.includes('-c');
  const now = new Date();
  let status = 0;
  for (const file of files) {
    const target = path.resolve(process.cwd(), file);
    try {
      if (fs.existsSync(target)) fs.utimesSync(target, now, now);
      else if (create) fs.writeFileSync(target, '');
    } catch (error) {
      process.stderr.write(`touch: ${file}: ${kit.explain(error)}\n`);
      status = 1;
    }
  }
  process.exit(status);
};

export const mvProgram: Program = (require, process, kit) => {
  const fs = require('fs') as ProgramFs;
  const path = require('path') as ProgramPath;
  const args = process.argv.slice(2);
  const operands = args.filter(arg => !arg.startsWith('-'));
  if (operands.length < 2) {
    process.stderr.write('usage: mv [-f | -n] source target\n       mv [-f | -n] source ... directory\n');
    process.exit(64);
  }
  const target = operands[operands.length - 1];
  const targetPath = path.resolve(process.cwd(), target);
  const intoDir = fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory();
  const sources = operands.slice(0, -1);
  if (sources.length > 1 && !intoDir) {
    process.stderr.write(`mv: ${target} is not a directory\n`);
    process.exit(1);
  }
  const noClobber = args.includes('-n');
  let status = 0;
  for (const source of sources) {
    const from = path.resolve(process.cwd(), source);
    const to = intoDir ? path.join(targetPath, path.basename(from)) : targetPath;
    if (noClobber && fs.existsSync(to)) continue;
    try {
      fs.renameSync(from, to);
    } catch (error) {
      const shown = intoDir ? path.join(target, path.basename(from)) : target;
      process.stderr.write(`mv: rename ${source} to ${shown}: ${kit.explain(error)}\n`);
      status = 1;
    }
  }
  process.exit(status);
};

export const cpProgram: Program = (require, process, kit) => {
  const fs = require('fs') as ProgramFs;
  const path = require('path') as ProgramPath;
  const args = process.argv.slice(2);
  const recursive = /[Rr]/.test(args.filter(arg => arg.startsWith('-')).join(''));
  const operands = args.filter(arg => !arg.startsWith('-'));
  if (operands.length < 2) {
    process.stderr.write('usage: cp [-R] source target\n       cp [-R] source ... directory\n');
    process.exit(64);
  }
  const target = operands[operands.length - 1];
  const targetPath = path.resolve(process.cwd(), target);
  const intoDir = fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory();
  const sources = operands.slice(0, -1);
  if (sources.length > 1 && !intoDir) {
    process.stderr.write(`cp: ${target} is not a directory\n`);
    process.exit(1);
  }
  const copy = (from: string, to: string): void => {
    if (!fs.statSync(from).isDirectory()) {
      fs.writeFileSync(to, fs.readFileSync(from));
      return;
    }
    fs.mkdirSync(to, { recursive: true });
    for (const name of fs.readdirSync(from)) copy(path.join(from, name), path.join(to, name));
  };
  const refuse = (from: string, to: string, source: string): string | null => {
    if (from === to) return `cp: ${source} and ${target} are identical (not copied).\n`;
    if (!fs.statSync(from).isDirectory()) return null;
    if (!recursive) return `cp: ${source} is a directory (not copied).\n`;
    return to.startsWith(`${from}/`) ? `cp: cannot copy ${source} into itself.\n` : null;
  };
  let status = 0;
  for (const source of sources) {
    const from = path.resolve(process.cwd(), source);
    const to = intoDir ? path.join(targetPath, path.basename(from)) : targetPath;
    try {
      const reason = refuse(from, to, source);
      if (reason) {
        process.stderr.write(reason);
        status = 1;
      } else copy(from, to);
    } catch (error) {
      process.stderr.write(`cp: ${source}: ${kit.explain(error)}\n`);
      status = 1;
    }
  }
  process.exit(status);
};

export const openProgram: Program = (require, process, kit) => {
  const fs = require('fs') as ProgramFs;
  const path = require('path') as ProgramPath;
  const args = process.argv.slice(2);
  let wanted: string | null = null;
  let reveal = false;
  const files: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-a') wanted = args[++i] ?? '';
    else if (arg === '-e' || arg === '-t') wanted = 'TextEdit';
    else if (arg === '-R') reveal = true;
    else files.push(arg);
  }
  if (wanted === null && !files.length) {
    process.stderr.write('Usage: open [-e] [-t] [-R] [-a <application>] <file> ...\n');
    process.exit(1);
  }
  let app: string | null = null;
  if (wanted !== null) {
    const name = wanted.replace(/\.app$/i, '').toLowerCase();
    app = kit.apps.find(candidate => candidate.toLowerCase() === name) ?? null;
    if (app === null) {
      process.stderr.write(`Unable to find application named '${wanted}'\n`);
      process.exit(1);
    }
  }
  const paths = files.map(file => path.resolve(process.cwd(), file));
  const missing = paths.find(file => !fs.existsSync(file));
  if (missing) {
    process.stderr.write(`The file ${missing} does not exist.\n`);
    process.exit(1);
  }
  process.stdout.write(`\x1b]${kit.openOsc};${encodeURIComponent(JSON.stringify({ app, reveal, paths }))}\x07`);
  process.exit(0);
};

/** 拼出虚拟机里 `/bin/<name>.js` 的源码。 */
export const programSource = (program: Program, apps: readonly string[]): string =>
  `(${program.toString()})(require, process, { explain: ${explain.toString()}, openOsc: ${OPEN_OSC}, apps: ${JSON.stringify(apps)} });\n`;

/** 解析终端截下的 `open` 请求；不合规的内容返回 `null`。 */
export function parseOpenRequest(data: string): OpenRequest | null {
  let value: unknown;
  try {
    value = JSON.parse(decodeURIComponent(data));
  } catch {
    return null;
  }
  const request = value as Partial<Record<keyof OpenRequest, unknown>> | null;
  if (typeof request !== 'object' || request === null) return null;
  const app = request.app ?? null;
  if (app !== null && typeof app !== 'string') return null;
  if (typeof request.reveal !== 'boolean') return null;
  if (!Array.isArray(request.paths) || !request.paths.every(path => typeof path === 'string')) return null;
  return { app, reveal: request.reveal, paths: request.paths };
}
