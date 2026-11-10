import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WATCH_EVENT, watchProject, watchScript, type WatcherFs } from './project-watcher.js';

type Listener = (kind: string, name: string | null) => void;

/** 内存里的目录树：键是相对根的目录，值是子项。 */
function fakeFs(tree: Record<string, readonly [name: string, directory: boolean][]>) {
  const listeners = new Map<string, Listener>();
  const errors = new Map<string, () => void>();
  const closed: string[] = [];
  const relative = (path: string): string => (path === '/project' ? '' : path.slice('/project/'.length));
  const missing = (path: string): Error =>
    Object.assign(new Error(`ENOENT: no such file or directory, scandir '${path}'`), { code: 'ENOENT' });
  const fs: WatcherFs = {
    watch(path, listener) {
      const key = relative(path);
      if (!(key in tree) && !key.endsWith('.ts')) throw missing(path);
      listeners.set(key, listener);
      return {
        close: () => {
          closed.push(key);
          listeners.delete(key);
        },
        on: (_event, handler) => {
          errors.set(key, () => handler(new Error('watcher error')));
        }
      };
    },
    readdirSync(path) {
      const key = relative(path);
      if (key.endsWith('.ts')) throw Object.assign(new Error(`ENOTDIR: ${path}`), { code: 'ENOTDIR' });
      const entries = tree[key];
      if (!entries) throw missing(path);
      return entries.map(([name, directory]) => ({ name, isDirectory: () => directory }));
    }
  };
  return { fs, tree, listeners, errors, closed };
}

const IGNORED = ['node_modules', '.git'];

describe('VM 内项目监听', () => {
  it('逐目录监听项目，跳过忽略的目录；事件路径相对项目根', () => {
    const f = fakeFs({
      '': [
        ['src', true],
        ['node_modules', true],
        ['package.json', false]
      ],
      src: [
        ['main.ts', false],
        ['deep', true]
      ],
      'src/deep': []
    });
    const emit = vi.fn();
    watchProject(f.fs, '/project', IGNORED, emit);
    expect([...f.listeners.keys()].sort()).toEqual(['', 'src', 'src/deep']);
    f.listeners.get('src')!('change', 'main.ts');
    f.listeners.get('')!('change', 'package.json');
    f.listeners.get('src')!('change', null);
    expect(emit.mock.calls).toEqual([
      ['change', 'src/main.ts'],
      ['change', 'package.json']
    ]);
  });

  it('新出现的目录开始监听，消失的目录连同子目录停止监听；新增文件不当目录监听', () => {
    const f = fakeFs({
      '': [['src', true]],
      src: [['old', true]],
      'src/old': [['inner', true]],
      'src/old/inner': []
    });
    const emit = vi.fn();
    watchProject(f.fs, '/project', IGNORED, emit);
    f.tree['src/new'] = [['nested', true]];
    f.tree['src/new/nested'] = [];
    f.listeners.get('src')!('rename', 'new');
    expect(f.listeners.has('src/new')).toBe(true);
    expect(f.listeners.has('src/new/nested')).toBe(true);
    delete f.tree['src/old'];
    delete f.tree['src/old/inner'];
    f.listeners.get('src')!('rename', 'old');
    expect(f.listeners.has('src/old')).toBe(false);
    expect(f.listeners.has('src/old/inner')).toBe(false);
    expect(f.closed).toEqual(expect.arrayContaining(['src/old', 'src/old/inner']));
    f.listeners.get('src')!('rename', 'created.ts');
    expect(f.listeners.has('src/created.ts')).toBe(false);
    f.listeners.get('')!('rename', 'node_modules');
    expect(f.listeners.has('node_modules')).toBe(false);
    expect(emit).toHaveBeenCalledWith('rename', 'src/new');
    expect(emit).toHaveBeenCalledWith('rename', 'node_modules');
  });

  it('监听器报错（目录被删）时停掉它；其他文件系统错误照常抛出', () => {
    const f = fakeFs({ '': [['src', true]], src: [] });
    watchProject(f.fs, '/project', IGNORED, vi.fn());
    f.errors.get('src')!();
    expect(f.listeners.has('src')).toBe(false);
    const broken: WatcherFs = {
      watch: () => ({ close: vi.fn(), on: vi.fn() }),
      readdirSync: () => {
        throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
      }
    };
    expect(() => watchProject(broken, '/project', IGNORED, vi.fn())).toThrow('EACCES');
  });
});

describe('VM 内监听脚本', () => {
  const directories: string[] = [];
  afterEach(async () => {
    await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
  });

  it.each(['aiao-watch-', 'aiao-watch-"\');process.exit(72);("\n'])(
    '序列化成 node -e 脚本后独立运行，路径 %j 不改变脚本语义',
    async prefix => {
      const root = await mkdtemp(join(tmpdir(), prefix));
      directories.push(root);
      await mkdir(join(root, 'src'));
      await mkdir(join(root, 'node_modules'));
      const child = spawn(process.execPath, ['-e', watchScript(root, IGNORED)], { stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      let diagnostic = '';
      child.stderr.on('data', chunk => (diagnostic += String(chunk)));
      child.stdout.on('data', chunk => (output += String(chunk)));
      try {
        await new Promise(resolve => setTimeout(resolve, 300));
        await writeFile(join(root, 'src', 'main.ts'), 'one');
        await writeFile(join(root, 'node_modules', 'ignored.js'), 'x');
        await vi.waitFor(() => expect(output, diagnostic).toContain(`${WATCH_EVENT}["rename","src/main.ts"]`), {
          timeout: 5000
        });
        expect(output).not.toContain('node_modules/ignored.js');
        for (const line of output.trim().split('\n')) expect(line.startsWith(WATCH_EVENT)).toBe(true);
      } finally {
        child.kill();
      }
    }
  );
});
