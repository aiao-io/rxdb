import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { OPEN_OSC, Program, cpProgram, mvProgram, openProgram, parseOpenRequest, programSource, touchProgram } from './coreutils';

const nodeRequire = createRequire(import.meta.url);
/** 桌面安装命令时传进去的内置应用名单。 */
const APPS = ['TextEdit', 'Calculator', 'Finder'];

class Exit {
  constructor(readonly code: number) {}
}

/** 按虚拟机里的方式执行：只拿到 require 与 process，源码由 programSource 拼出（验证程序自包含）。 */
function run(program: Program, args: readonly string[], cwd: string) {
  const out: string[] = [];
  const err: string[] = [];
  let code = 0;
  const process = {
    argv: ['node', '/bin/x.js', ...args],
    env: { HOME: cwd },
    cwd: () => cwd,
    stdout: { write: (text: string) => out.push(text) },
    stderr: { write: (text: string) => err.push(text) },
    exit: (status: number) => {
      code = status;
      throw new Exit(status);
    }
  };
  try {
    new Function('require', 'process', programSource(program, APPS))(nodeRequire, process);
  } catch (error) {
    if (!(error instanceof Exit)) throw error;
  }
  return { code, out: out.join(''), err: err.join('') };
}

const workspace = (): string => mkdtempSync(join(tmpdir(), 'aiao-bin-'));

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
    expect(run(cpProgram, ['src', 'dst'], dir)).toMatchObject({ code: 1, err: 'cp: src is a directory (not copied).\n' });
    expect(run(cpProgram, ['-R', 'src', 'dst'], dir).code).toBe(0);
    expect(readFileSync(join(dir, 'dst', 'deep', 'x.md'), 'utf8')).toBe('x');
  });

  it('复制到已有目录里；同一个文件报错', () => {
    const dir = workspace();
    writeFileSync(join(dir, 'a.txt'), 'a');
    mkdirSync(join(dir, 'box'));
    run(cpProgram, ['a.txt', 'box'], dir);
    expect(readFileSync(join(dir, 'box', 'a.txt'), 'utf8')).toBe('a');
    expect(run(cpProgram, ['a.txt', 'a.txt'], dir)).toMatchObject({ code: 1, err: 'cp: a.txt and a.txt are identical (not copied).\n' });
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

  it('-a 按内置应用名单找应用（不区分大小写），-e 用 TextEdit，-R 在 Finder 里显示', () => {
    const dir = workspace();
    writeFileSync(join(dir, 'a.txt'), 'a');
    expect(payload(run(openProgram, ['-a', 'calculator'], dir).out)).toEqual({ app: 'Calculator', reveal: false, paths: [] });
    expect(payload(run(openProgram, ['-e', 'a.txt'], dir).out)).toEqual({
      app: 'TextEdit',
      reveal: false,
      paths: [join(dir, 'a.txt')]
    });
    expect(payload(run(openProgram, ['-R', 'a.txt'], dir).out)).toMatchObject({ reveal: true });
    expect(run(openProgram, ['-a', 'Nope'], dir)).toMatchObject({
      code: 1,
      err: "Unable to find application named 'Nope'\n"
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
