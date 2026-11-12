import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { patchShell } from './shell-patch';

/** 从仓库里装的 @vivari/core 取出内核写进 /bin/sh.js 的源码（内核里它是一段模板字面量）。 */
function installedShell(): string {
  const assets = resolve(import.meta.dirname, '../../../../../../node_modules/@vivari/core/dist/assets');
  const kernel = readdirSync(assets).find(name => name.startsWith('kernel-worker-'));
  if (!kernel) throw new Error('kernel worker not found in @vivari/core');
  const source = readFileSync(join(assets, kernel), 'utf8');
  const start = source.indexOf('\n\tsh: `') + '\n\tsh: `'.length;
  let end = start;
  do end = source.indexOf('`', end + 1);
  while (source[end - 1] === '\\');
  return new Function(`return \`${source.slice(start, end)}\`;`)() as string;
}

const run = (shell: string, script: string, home: string): string =>
  execFileSync(process.execPath, [shell, '-c', script], { cwd: tmpdir(), env: { ...process.env, HOME: home } }).toString();

describe('patchShell', () => {
  const patched = patchShell(installedShell());
  const dir = mkdtempSync(join(tmpdir(), 'aiao-sh-'));
  const shell = join(dir, 'sh.js');
  writeFileSync(shell, patched);

  it('对当前版本的 Vivari shell 恰好各命中一次', () => {
    expect(patched).toContain('aiao-desktop');
    expect(() => patchShell('const unrelated = 1;')).toThrow(/@vivari\/core/);
  });

  it('展开开头的 ~ 与 $NAME / ${NAME}，单引号里不展开', () => {
    expect(run(shell, 'echo ~ ~/Desktop "~" $HOME ${HOME}/x "$HOME" \'$HOME\'', '/home/me')).toBe(
      '/home/me /home/me/Desktop ~ /home/me /home/me/x /home/me $HOME\n'
    );
  });

  it('未定义的变量展开成空，不产生空参数', () => {
    expect(run(shell, 'echo a $AIAO_UNDEFINED_VARIABLE b', '/home/me')).toBe('a b\n');
  });

  it('不带参数的 cd 回到 HOME', () => {
    expect(run(shell, 'cd; pwd', dir)).toBe(`${realpathSync(dir)}\n`);
  });

  it('重定向的目标也展开 ~', () => {
    run(shell, 'echo hi > ~/out.txt', dir);
    expect(readFileSync(join(dir, 'out.txt'), 'utf8')).toBe('hi\n');
  });
});
