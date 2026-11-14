import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  KitApp,
  OPEN_OSC,
  Program,
  ProgramProcess,
  cpProgram,
  explain,
  mvProgram,
  openProgram,
  parseOpenRequest,
  programSource,
  touchProgram
} from './coreutils';

const nodeRequire = createRequire(import.meta.url);
/** 桌面安装命令时传进去的应用名单：稳定的 id、包标识与显示名。 */
const APPS: readonly KitApp[] = [
  { id: 'textedit', bundleId: 'io.aiao.desktop.textedit', name: 'TextEdit' },
  { id: 'calculator', bundleId: 'io.aiao.desktop.calculator', name: 'Calculator' },
  { id: 'finder', bundleId: 'io.aiao.desktop.finder', name: 'Finder' },
  { id: 'notes', bundleId: 'io.aiao.desktop.notes', name: 'Notes' }
];

class Exit {
  constructor(readonly code: number) {}
}

/** 一次执行的结果：退出码与两条输出流。 */
interface Result {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

type Runner = (program: Program, args: readonly string[], cwd: string, apps?: readonly KitApp[]) => Result;

/** 搭一个假的 process，执行 `body`，把 `process.exit` 抛出的 {@link Exit} 收成退出码。 */
function execute(args: readonly string[], cwd: string, body: (process: ProgramProcess) => void): Result {
  const out: string[] = [];
  const err: string[] = [];
  let code = 0;
  const process: ProgramProcess = {
    argv: ['node', '/bin/x.js', ...args],
    env: { HOME: cwd },
    cwd: () => cwd,
    stdout: { write: (text: string) => out.push(text) },
    stderr: { write: (text: string) => err.push(text) },
    exit: (status: number): never => {
      code = status;
      throw new Exit(status);
    }
  };
  try {
    body(process);
  } catch (error) {
    if (!(error instanceof Exit)) throw error;
  }
  return { code, out: out.join(''), err: err.join('') };
}

/** 按虚拟机里的方式执行：只拿到 require 与 process，源码由 programSource 拼出（验证程序自包含）。 */
const fromSource: Runner = (program, args, cwd, apps = APPS) =>
  execute(args, cwd, process => {
    new Function('require', 'process', programSource(program, apps))(nodeRequire, process);
  });

/** 直接调用程序函数：执行的是模块里的真身，覆盖率能算到 coreutils.ts 上。 */
const direct: Runner = (program, args, cwd, apps = APPS) =>
  execute(args, cwd, process => {
    program(nodeRequire, process, { explain, openOsc: OPEN_OSC, apps });
  });

const workspace = (): string => mkdtempSync(join(tmpdir(), 'aiao-bin-'));

/** 同一组用例各跑两遍：源码字符串（虚拟机里的执行方式）与函数直调（结果必须一致）。 */
describe.each<[string, Runner]>([
  ['源码字符串', fromSource],
  ['函数直调', direct]
])('命令程序（%s）', (_name, run) => {
  describe('touch', () => {
    it('创建空文件，已存在的只更新修改时间', () => {
      const dir = workspace();
      expect(run(touchProgram, ['a.txt'], dir).code).toBe(0);
      expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('');
      writeFileSync(join(dir, 'b.txt'), 'keep');
      utimesSync(join(dir, 'b.txt'), new Date(2020, 0, 1), new Date(2020, 0, 1));
      run(touchProgram, ['b.txt'], dir);
      expect(readFileSync(join(dir, 'b.txt'), 'utf8')).toBe('keep');
      expect(statSync(join(dir, 'b.txt')).mtime.getFullYear()).toBeGreaterThan(2020);
    });

    it('-c 不创建；父目录不存在时报错并返回 1', () => {
      const dir = workspace();
      run(touchProgram, ['-c', 'nope.txt'], dir);
      expect(existsSync(join(dir, 'nope.txt'))).toBe(false);
      const result = run(touchProgram, ['missing/x.txt'], dir);
      expect(result).toMatchObject({ code: 1, err: 'touch: missing/x.txt: No such file or directory\n' });
    });
  });

  describe('mv', () => {
    it('改名，或移进已有目录', () => {
      const dir = workspace();
      writeFileSync(join(dir, 'a.txt'), 'a');
      writeFileSync(join(dir, 'b.txt'), 'b');
      mkdirSync(join(dir, 'box'));
      expect(run(mvProgram, ['a.txt', 'renamed.txt'], dir).code).toBe(0);
      expect(readFileSync(join(dir, 'renamed.txt'), 'utf8')).toBe('a');
      expect(run(mvProgram, ['renamed.txt', 'b.txt', 'box'], dir).code).toBe(0);
      expect(existsSync(join(dir, 'box', 'renamed.txt')) && existsSync(join(dir, 'box', 'b.txt'))).toBe(true);
    });

    it('源不存在、或多个源的目标不是目录时报错', () => {
      const dir = workspace();
      expect(run(mvProgram, ['ghost', 'x'], dir)).toMatchObject({
        code: 1,
        err: 'mv: rename ghost to x: No such file or directory\n'
      });
      writeFileSync(join(dir, 'a'), '');
      writeFileSync(join(dir, 'b'), '');
      expect(run(mvProgram, ['a', 'b', 'c'], dir)).toMatchObject({ code: 1, err: 'mv: c is not a directory\n' });
      expect(run(mvProgram, ['a'], dir).code).toBe(64);
    });
  });

  describe('cp', () => {
    it('复制文件；目录要 -R', () => {
      const dir = workspace();
      writeFileSync(join(dir, 'a.txt'), 'a');
      mkdirSync(join(dir, 'src', 'deep'), { recursive: true });
      writeFileSync(join(dir, 'src', 'deep', 'x.md'), 'x');
      expect(run(cpProgram, ['a.txt', 'b.txt'], dir).code).toBe(0);
      expect(readFileSync(join(dir, 'b.txt'), 'utf8')).toBe('a');
      expect(run(cpProgram, ['src', 'dst'], dir)).toMatchObject({
        code: 1,
        err: 'cp: src is a directory (not copied).\n'
      });
      expect(run(cpProgram, ['-R', 'src', 'dst'], dir).code).toBe(0);
      expect(readFileSync(join(dir, 'dst', 'deep', 'x.md'), 'utf8')).toBe('x');
    });

    it('复制到已有目录里；同一个文件报错', () => {
      const dir = workspace();
      writeFileSync(join(dir, 'a.txt'), 'a');
      mkdirSync(join(dir, 'box'));
      run(cpProgram, ['a.txt', 'box'], dir);
      expect(readFileSync(join(dir, 'box', 'a.txt'), 'utf8')).toBe('a');
      expect(run(cpProgram, ['a.txt', 'a.txt'], dir)).toMatchObject({
        code: 1,
        err: 'cp: a.txt and a.txt are identical (not copied).\n'
      });
    });
  });

  describe('open', () => {
    const payload = (out: string): unknown => {
      const match = new RegExp(`^\\x1b\\]${OPEN_OSC};([^\\x07]*)\\x07$`).exec(out);
      return match ? parseOpenRequest(match[1]) : null;
    };

    it('把绝对路径交给桌面', () => {
      const dir = workspace();
      writeFileSync(join(dir, 'a.txt'), 'a');
      const result = run(openProgram, ['a.txt', '.'], dir);
      expect(result.code).toBe(0);
      expect(payload(result.out)).toEqual({ app: null, reveal: false, paths: [join(dir, 'a.txt'), dir] });
    });

    it('-a 按应用名单找应用，交给桌面的是应用 id；-e 用 TextEdit，-R 在 Finder 里显示', () => {
      const dir = workspace();
      writeFileSync(join(dir, 'a.txt'), 'a');
      expect(payload(run(openProgram, ['-a', 'calculator'], dir).out)).toEqual({
        app: 'calculator',
        reveal: false,
        paths: []
      });
      expect(payload(run(openProgram, ['-e', 'a.txt'], dir).out)).toEqual({
        app: 'textedit',
        reveal: false,
        paths: [join(dir, 'a.txt')]
      });
      expect(payload(run(openProgram, ['-t', 'a.txt'], dir).out)).toMatchObject({ app: 'textedit' });
      expect(payload(run(openProgram, ['-R', 'a.txt'], dir).out)).toMatchObject({ reveal: true, app: null });
      expect(run(openProgram, ['-a', 'Nope'], dir)).toMatchObject({
        code: 1,
        err: "Unable to find application named 'Nope'\n"
      });
    });

    it('-a 与 -b 都接受应用 id、包标识或显示名（不区分大小写，显示名可带 .app）', () => {
      const dir = workspace();
      for (const [flag, query] of [
        ['-a', 'Calculator.app'],
        ['-a', 'CALCULATOR'],
        ['-b', 'io.aiao.desktop.calculator'],
        ['-b', 'IO.AIAO.DESKTOP.CALCULATOR'],
        ['-a', 'io.aiao.desktop.calculator']
      ])
        expect(payload(run(openProgram, [flag, query], dir).out)).toMatchObject({ app: 'calculator' });
    });

    it('先按应用 id、再按包标识、最后才按显示名：改名或同名都不会打开错的应用', () => {
      const dir = workspace();
      const crowded: KitApp[] = [
        { id: 'notes', bundleId: 'x.notes', name: 'mail' },
        { id: 'mail', bundleId: 'x.mail', name: 'Mail' },
        { id: 'a', bundleId: 'b.c', name: 'x' },
        { id: 'b', bundleId: 'q.q', name: 'b.c' }
      ];
      expect(payload(run(openProgram, ['-a', 'mail'], dir, crowded).out)).toMatchObject({ app: 'mail' });
      expect(payload(run(openProgram, ['-b', 'b.c'], dir, crowded).out)).toMatchObject({ app: 'a' });
      expect(payload(run(openProgram, ['-a', 'x'], dir, crowded).out)).toMatchObject({ app: 'a' });
    });

    it('名单里没有 TextEdit 时 -e 报错；-a 后面没跟名字也报找不到', () => {
      const dir = workspace();
      expect(run(openProgram, ['-e', 'a.txt'], dir, [APPS[1]])).toMatchObject({
        code: 1,
        err: "Unable to find application named 'TextEdit'\n"
      });
      expect(run(openProgram, ['-a'], dir)).toMatchObject({ code: 1, err: "Unable to find application named ''\n" });
    });

    it('什么参数都没有时给出用法，包括 -b', () => {
      expect(run(openProgram, [], workspace())).toMatchObject({
        code: 1,
        err: 'Usage: open [-e] [-t] [-R] [-a <application> | -b <bundle identifier>] <file> ...\n'
      });
    });

    it('文件不存在时报错，不打开任何东西', () => {
      const result = run(openProgram, ['ghost.txt'], workspace());
      expect(result.code).toBe(1);
      expect(result.err).toMatch(/^The file .*ghost\.txt does not exist\.\n$/);
      expect(result.out).toBe('');
    });

    it('parseOpenRequest 拒绝不合规的内容', () => {
      expect(parseOpenRequest('not json')).toBeNull();
      expect(parseOpenRequest(encodeURIComponent(JSON.stringify({ paths: [1] })))).toBeNull();
    });
  });
});

describe('explain', () => {
  it('把 Node 的系统错误码写成 BSD 工具的说法，未知错误沿用原文', () => {
    expect(explain({ code: 'ENOENT' })).toBe('No such file or directory');
    expect(explain({ code: 'EACCES' })).toBe('Permission denied');
    expect(explain({ code: 'ENOTEMPTY' })).toBe('Directory not empty');
    expect(explain(Object.assign(new Error('weird'), { code: 'EWEIRD' }))).toBe('weird');
    expect(explain(new Error('plain failure'))).toBe('plain failure');
    expect(explain('text')).toBe('text');
    expect(explain(null)).toBe('null');
  });
});

describe('programSource', () => {
  it('拼出自包含的源码：程序、错误说明、OSC 编号与应用名单都内嵌在里面', () => {
    const apps: KitApp[] = [{ id: 'a', bundleId: 'io.test.a', name: 'A' }];
    const source = programSource(touchProgram, apps);
    expect(source).toContain(`openOsc: ${OPEN_OSC}`);
    expect(source).toContain(`apps: ${JSON.stringify(apps)}`);
    expect(source).toContain('function explain');
    expect(source.endsWith(');\n')).toBe(true);
  });
});
