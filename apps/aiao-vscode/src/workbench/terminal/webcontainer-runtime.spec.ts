import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkbenchFiles, WorkbenchSnapshot } from '../session.js';
import {
  createWebContainerRuntime,
  type TerminalContainer,
  type TerminalFileTree,
  type TerminalRuntime
} from './webcontainer-runtime.js';

const encoder = new TextEncoder();
const instances: TerminalRuntime[] = [];

afterEach(() => {
  instances.splice(0).forEach(instance => instance.dispose());
  vi.useRealTimers();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

function snapshot(files: WorkbenchFiles, revision = '1'): WorkbenchSnapshot {
  return { projectId: 'one', revision, files };
}

function fixture(bootGate?: Promise<void>) {
  const files = new Map<string, Uint8Array>();
  const directories = new Set<string>();
  const links = new Set<string>();
  const exit = deferred<number>();
  let output!: ReadableStreamDefaultController<string>;
  let watch: ((event: 'change' | 'rename', path: string) => void) | undefined;
  let serverReady: ((port: number, url: string) => void) | undefined;
  const writeInput = vi.fn();
  const process = {
    input: new WritableStream<string>({ write: writeInput }),
    output: new ReadableStream<string>({
      start: controller => {
        output = controller;
      }
    }),
    exit: exit.promise,
    resize: vi.fn(),
    kill: vi.fn()
  };
  const closeWatcher = vi.fn();
  const removeServerListener = vi.fn();
  const readDirectory = vi.fn(async (directory: string) => {
    const prefix = directory === '.' ? '' : `${directory}/`;
    const entries = new Map<string, 'directory' | 'file' | 'link'>();
    for (const path of [...files.keys(), ...links]) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      const name = rest.split('/')[0];
      entries.set(
        name,
        rest.includes('/') ? 'directory'
        : links.has(path) ? 'link'
        : 'file'
      );
    }
    for (const path of directories) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      if (rest) entries.set(rest.split('/')[0], 'directory');
    }
    return [...entries].map(([name, kind]) => ({
      name,
      isFile: () => kind === 'file',
      isDirectory: () => kind === 'directory',
      isSymbolicLink: () => kind === 'link'
    }));
  });
  const mount = vi.fn(async (tree: TerminalFileTree) => {
    function walk(entries: TerminalFileTree, prefix = ''): void {
      for (const [name, entry] of Object.entries(entries)) {
        if ('directory' in entry) {
          directories.add(`${prefix}${name}`);
          walk(entry.directory, `${prefix}${name}/`);
        } else
          files.set(
            `${prefix}${name}`,
            typeof entry.file.contents === 'string' ? encoder.encode(entry.file.contents) : entry.file.contents
          );
      }
    }
    walk(tree);
  });
  const container: TerminalContainer = {
    fs: {
      readdir: readDirectory,
      readFile: vi.fn(async path => {
        const bytes = files.get(path);
        if (!bytes) throw new Error(`Missing ${path}`);
        return bytes;
      }),
      mkdir: vi.fn(async path => {
        directories.add(path);
      }),
      writeFile: vi.fn(async (path, value) => {
        if (directories.has(path)) throw new Error(`EISDIR: ${path}`);
        files.set(path, typeof value === 'string' ? encoder.encode(value) : value);
        watch?.('change', path);
      }),
      rm: vi.fn(async (path, options) => {
        if (directories.has(path) && !options.recursive) throw new Error(`EISDIR: ${path}`);
        files.delete(path);
        for (const file of files.keys()) if (file.startsWith(`${path}/`)) files.delete(file);
        for (const directory of directories)
          if (directory === path || directory.startsWith(`${path}/`)) directories.delete(directory);
        watch?.('rename', path);
      }),
      watch: vi.fn((_path, _options, listener) => {
        watch = listener;
        return { close: closeWatcher };
      })
    },
    mount,
    spawn: vi.fn(async () => process),
    on: vi.fn((_event, listener) => {
      serverReady = listener;
      return removeServerListener;
    }),
    teardown: vi.fn()
  };
  const options = {
    boot: vi.fn(async () => {
      await bootGate;
      return container;
    }),
    onOutput: vi.fn(),
    onFiles: vi.fn<(files: WorkbenchFiles, removed: readonly string[]) => Promise<void>>(async () => undefined),
    onServerReady: vi.fn(),
    onError: vi.fn(),
    onExit: vi.fn()
  };
  const runtime = createWebContainerRuntime(options);
  instances.push(runtime);
  return {
    runtime,
    options,
    container,
    process,
    files,
    links,
    writeInput,
    output: () => output,
    exit,
    closeWatcher,
    removeServerListener,
    readDirectory,
    change: (path: string) => watch?.('change', path),
    ready: (port: number, url: string) => serverReady?.(port, url)
  };
}

describe('浏览器 Node 终端运行时', () => {
  it('挂载已保存文件并连接真实 shell 的输入、输出、尺寸、服务地址和退出', async () => {
    const f = fixture();
    await f.runtime.start(snapshot({ 'src/main.ts': 'console.log(1)' }), { cols: 80, rows: 24 });
    expect(f.container.spawn).toHaveBeenCalledWith('jsh', [], { terminal: { cols: 80, rows: 24 } });
    expect(new TextDecoder().decode(f.files.get('src/main.ts'))).toBe('console.log(1)');
    f.output().enqueue('\u001b[31merror\u001b[0m\r\n');
    await f.runtime.write('node --version\r');
    await vi.waitFor(() => expect(f.options.onOutput).toHaveBeenCalledWith('\u001b[31merror\u001b[0m\r\n'));
    expect(f.process.input.locked).toBe(true);
    expect(f.writeInput).toHaveBeenCalledWith('node --version\r', expect.anything());
    f.runtime.resize({ cols: 120, rows: 32 });
    expect(f.process.resize).toHaveBeenCalledWith({ cols: 120, rows: 32 });
    f.ready(5173, 'https://example.webcontainer-api.io');
    expect(f.options.onServerReady).toHaveBeenCalledWith(5173, 'https://example.webcontainer-api.io');
    f.exit.resolve(0);
    await vi.waitFor(() => expect(f.options.onExit).toHaveBeenCalledWith(0));
  });

  it('同步编辑器保存时只写改动，不把写回事件再次当成终端修改', async () => {
    const f = fixture();
    await f.runtime.start(snapshot({ 'src/main.ts': 'one', 'old.ts': 'old' }), { cols: 80, rows: 24 });
    await f.runtime.sync(snapshot({ 'src/main.ts': 'two', 'new.ts': 'new' }, '2'));
    expect(f.container.fs.writeFile).toHaveBeenCalledWith('src/main.ts', 'two');
    expect(f.container.fs.rm).toHaveBeenCalledWith('old.ts', { force: true });
    await f.runtime.flush();
    expect(f.options.onFiles).not.toHaveBeenCalled();
    await f.runtime.sync(snapshot({ 'src/main.ts': 'two', 'new.ts': 'new' }, '3'));
    expect(f.container.fs.writeFile).toHaveBeenCalledTimes(2);
  });

  it('终端新增、修改、删除与二进制回写为同一批次，跳过安装产物与符号链接', async () => {
    const f = fixture();
    await f.runtime.start(snapshot({ 'main.ts': 'one', 'old.ts': 'old' }), { cols: 80, rows: 24 });
    f.files.set('main.ts', encoder.encode('two'));
    f.files.delete('old.ts');
    f.files.set('src/new.ts', encoder.encode('new'));
    f.files.set('image.png', new Uint8Array([0, 255]));
    f.files.set('node_modules/pkg/index.js', encoder.encode('large dependency'));
    f.files.set('dist/main.js', encoder.encode('build output'));
    f.files.set('.git/config', encoder.encode('private metadata'));
    f.links.add('linked.ts');
    f.change('main.ts');
    await f.runtime.flush();
    expect(f.options.onFiles).toHaveBeenCalledWith(
      {
        'main.ts': 'two',
        'src/new.ts': 'new',
        'image.png': new Uint8Array([0, 255])
      },
      ['old.ts']
    );
    expect(f.readDirectory).not.toHaveBeenCalledWith('node_modules', { withFileTypes: true });
    expect(f.readDirectory).not.toHaveBeenCalledWith('dist', { withFileTypes: true });
    await f.runtime.flush();
    expect(f.options.onFiles).toHaveBeenCalledTimes(1);
  });

  it('失败的持久化不推进基线，重试 flush 会再次回写', async () => {
    const f = fixture();
    await f.runtime.start(snapshot({ 'main.ts': 'one' }), { cols: 80, rows: 24 });
    f.files.set('main.ts', encoder.encode('two'));
    f.options.onFiles.mockRejectedValueOnce(new Error('revision conflict'));
    f.change('main.ts');
    await expect(f.runtime.flush()).rejects.toThrow('revision conflict');
    await f.runtime.flush();
    expect(f.options.onFiles).toHaveBeenCalledTimes(2);
  });

  it('陈旧的编辑器快照不会覆盖未回写的终端修改或删除终端新文件', async () => {
    const f = fixture();
    await f.runtime.start(snapshot({ 'main.ts': 'one' }), { cols: 80, rows: 24 });
    f.files.set('main.ts', encoder.encode('terminal'));
    f.files.set('new.ts', encoder.encode('created in terminal'));
    let echo: Promise<void> | undefined;
    f.options.onFiles.mockImplementationOnce(async writes => {
      echo = f.runtime.sync(snapshot({ ...writes, 'other.ts': 'editor' }, '3'));
    });
    await f.runtime.sync(snapshot({ 'main.ts': 'one', 'other.ts': 'editor' }, '2'));
    await echo;
    expect(new TextDecoder().decode(f.files.get('main.ts'))).toBe('terminal');
    expect(new TextDecoder().decode(f.files.get('new.ts'))).toBe('created in terminal');
    expect(new TextDecoder().decode(f.files.get('other.ts'))).toBe('editor');
    expect(f.options.onFiles).toHaveBeenCalledTimes(1);
  });

  it('编辑器把目录换成单文件时移除旧空目录，也支持单文件换成目录', async () => {
    const f = fixture();
    await f.runtime.start(snapshot({ 'a/b.js': 'nested' }), { cols: 80, rows: 24 });
    await f.runtime.sync(snapshot({ a: 'single file' }, '2'));
    expect(f.container.fs.rm).toHaveBeenCalledWith('a', { force: true, recursive: true });
    expect(new TextDecoder().decode(f.files.get('a'))).toBe('single file');
    await f.runtime.sync(snapshot({ 'a/c.js': 'nested again' }, '3'));
    expect(f.files.has('a')).toBe(false);
    expect(new TextDecoder().decode(f.files.get('a/c.js'))).toBe('nested again');
  });

  it('目录里终端新建文件先持久化，陈旧快照不能递归删除该目录', async () => {
    const f = fixture();
    await f.runtime.start(snapshot({ 'a/b.js': 'nested' }), { cols: 80, rows: 24 });
    f.files.set('a/new.ts', encoder.encode('new terminal file'));
    let echo: Promise<void> | undefined;
    f.options.onFiles.mockImplementationOnce(async writes => {
      echo = f.runtime.sync(snapshot({ 'a/b.js': 'nested', ...writes }, '3'));
    });
    await f.runtime.sync(snapshot({ a: 'stale replacement' }, '2'));
    await echo;
    expect(f.options.onFiles).toHaveBeenCalledWith({ 'a/new.ts': 'new terminal file' }, []);
    expect(f.files.has('a/new.ts')).toBe(true);
    expect(f.files.has('a/b.js')).toBe(true);
    expect(f.files.has('a')).toBe(false);
    expect(f.container.fs.rm).not.toHaveBeenCalledWith('a/b.js', { force: true });
    expect(f.container.fs.rm).not.toHaveBeenCalledWith('a', { force: true, recursive: true });
  });

  it('终端回写失败时拒绝正向同步，保留尚未持久化的容器文件', async () => {
    const f = fixture();
    await f.runtime.start(snapshot({ 'main.ts': 'one' }), { cols: 80, rows: 24 });
    f.files.set('main.ts', encoder.encode('terminal'));
    f.options.onFiles.mockRejectedValueOnce(new Error('storage failed'));
    await expect(f.runtime.sync(snapshot({ 'main.ts': 'editor' }, '2'))).rejects.toThrow('storage failed');
    expect(new TextDecoder().decode(f.files.get('main.ts'))).toBe('terminal');
    expect(f.container.fs.writeFile).not.toHaveBeenCalled();
  });

  it('启动失败会释放全局容器所有权，下一项目仍能启动', async () => {
    const failed = fixture();
    failed.options.boot.mockRejectedValueOnce(new Error('blocked by browser'));
    await expect(failed.runtime.start(snapshot({ 'main.ts': 'one' }), { cols: 80, rows: 24 })).rejects.toThrow(
      'blocked by browser'
    );
    const next = fixture();
    await next.runtime.start(snapshot({ 'main.ts': 'two' }), { cols: 80, rows: 24 });
    expect(next.options.boot).toHaveBeenCalledOnce();
  });

  it('产物目录事件不会触发全项目扫描', async () => {
    vi.useFakeTimers();
    const f = fixture();
    await f.runtime.start(snapshot({ 'main.ts': 'one' }), { cols: 80, rows: 24 });
    f.change('node_modules/pkg/index.js');
    f.change('dist/main.js');
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.readDirectory).not.toHaveBeenCalled();
  });

  it('不允许将其他项目快照写进已启动容器', async () => {
    const f = fixture();
    await f.runtime.start(snapshot({ 'main.ts': 'one' }), { cols: 80, rows: 24 });
    await expect(f.runtime.sync({ ...snapshot({ 'main.ts': 'two' }), projectId: 'two' })).rejects.toThrow('项目');
    expect(f.container.fs.writeFile).not.toHaveBeenCalled();
  });

  it('超限文件与非法路径不会进入持久化回调', async () => {
    const f = fixture();
    await f.runtime.start(snapshot({ 'main.ts': 'one' }), { cols: 80, rows: 24 });
    f.files.set('huge.ts', new Uint8Array(2 * 1024 * 1024 + 1));
    await expect(f.runtime.flush()).rejects.toThrow('limit');
    expect(f.options.onFiles).not.toHaveBeenCalled();
    f.files.delete('huge.ts');
    f.files.set('-invalid.ts', encoder.encode('invalid'));
    await expect(f.runtime.flush()).rejects.toThrow('path');
    expect(f.options.onFiles).not.toHaveBeenCalled();
  });

  it('释放终止进程与监听器，并阻止迟到输出、服务地址和退出事件', async () => {
    const f = fixture();
    await f.runtime.start(snapshot({ 'main.ts': 'one' }), { cols: 80, rows: 24 });
    f.runtime.dispose();
    f.ready(3000, 'https://late.webcontainer-api.io');
    f.exit.resolve(0);
    await Promise.resolve();
    expect(f.process.kill).toHaveBeenCalledOnce();
    expect(f.closeWatcher).toHaveBeenCalledOnce();
    expect(f.removeServerListener).toHaveBeenCalledOnce();
    expect(f.container.teardown).toHaveBeenCalledOnce();
    expect(f.options.onServerReady).not.toHaveBeenCalled();
    expect(f.options.onExit).not.toHaveBeenCalled();
    await expect(f.runtime.write('pwd\r')).rejects.toThrow('释放');
  });

  it('启动中释放后等待旧容器销毁才允许下一次 boot', async () => {
    const gate = deferred<void>();
    const old = fixture(gate.promise);
    const first = old.runtime.start(snapshot({ 'main.ts': 'one' }), { cols: 80, rows: 24 });
    await vi.waitFor(() => expect(old.options.boot).toHaveBeenCalled());
    old.runtime.dispose();
    const next = fixture();
    const second = next.runtime.start(snapshot({ 'main.ts': 'two' }), { cols: 80, rows: 24 });
    await Promise.resolve();
    expect(next.options.boot).not.toHaveBeenCalled();
    gate.resolve();
    await first;
    await second;
    expect(old.container.teardown).toHaveBeenCalledOnce();
    expect(old.container.spawn).not.toHaveBeenCalled();
    expect(next.options.boot).toHaveBeenCalledOnce();
  });

  it('停止等待进程退出后的最后一次文件变更持久化，再销毁容器', async () => {
    const f = fixture();
    await f.runtime.start(snapshot({ 'main.ts': 'one' }), { cols: 80, rows: 24 });
    f.process.kill.mockImplementation(() => {
      f.files.set('main.ts', encoder.encode('last write'));
      f.exit.resolve(0);
    });
    await f.runtime.stop();
    expect(f.options.onFiles).toHaveBeenCalledWith({ 'main.ts': 'last write' }, []);
    expect(f.process.kill).toHaveBeenCalledOnce();
    expect(f.options.onExit).not.toHaveBeenCalled();
    expect(f.container.teardown).toHaveBeenCalledOnce();
    expect(f.options.onFiles.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(f.container.teardown).mock.invocationCallOrder[0]
    );
  });

  it('读取文件期间释放后忽略已销毁文件系统的迟到异常', async () => {
    const f = fixture();
    await f.runtime.start(snapshot({ 'main.ts': 'one' }), { cols: 80, rows: 24 });
    const read = deferred<Uint8Array>();
    vi.mocked(f.container.fs.readFile).mockReturnValueOnce(read.promise);
    const flushed = f.runtime.flush();
    await vi.waitFor(() => expect(f.container.fs.readFile).toHaveBeenCalled());
    f.runtime.dispose();
    read.reject(new Error('filesystem torn down'));
    await flushed;
    expect(f.options.onFiles).not.toHaveBeenCalled();
    expect(f.options.onError).not.toHaveBeenCalled();
    expect(f.container.teardown).toHaveBeenCalledOnce();
  });

  it('spawn 期间释放也会杀掉迟到进程，不重复销毁监听器或容器', async () => {
    const f = fixture();
    const spawn = deferred<typeof f.process>();
    vi.mocked(f.container.spawn).mockReturnValueOnce(spawn.promise);
    const pending = f.runtime.start(snapshot({ 'main.ts': 'one' }), { cols: 80, rows: 24 });
    await vi.waitFor(() => expect(f.container.spawn).toHaveBeenCalled());
    f.runtime.dispose();
    spawn.resolve(f.process);
    await pending;
    expect(f.process.kill).toHaveBeenCalledOnce();
    expect(f.closeWatcher).toHaveBeenCalledOnce();
    expect(f.removeServerListener).toHaveBeenCalledOnce();
    expect(f.container.teardown).toHaveBeenCalledOnce();
  });

  it('停止时持久化失败保留容器，重试成功后才销毁', async () => {
    const f = fixture();
    await f.runtime.start(snapshot({ 'main.ts': 'one' }), { cols: 80, rows: 24 });
    f.files.set('main.ts', encoder.encode('unsaved terminal edit'));
    f.process.kill.mockImplementation(() => f.exit.resolve(0));
    f.options.onFiles.mockRejectedValueOnce(new Error('storage failed'));
    await expect(f.runtime.stop()).rejects.toThrow('storage failed');
    expect(f.container.teardown).not.toHaveBeenCalled();
    await f.runtime.stop();
    expect(f.options.onFiles).toHaveBeenCalledTimes(2);
    expect(f.container.teardown).toHaveBeenCalledOnce();
  });

  it('停止无响应进程明确超时并保留可重试的容器', async () => {
    vi.useFakeTimers();
    const f = fixture();
    await f.runtime.start(snapshot({ 'main.ts': 'one' }), { cols: 80, rows: 24 });
    const stopped = expect(f.runtime.stop()).rejects.toThrow('停止超时');
    await vi.advanceTimersByTimeAsync(5000);
    await stopped;
    expect(f.container.teardown).not.toHaveBeenCalled();
    f.exit.resolve(0);
    await f.runtime.stop();
    expect(f.container.teardown).toHaveBeenCalledOnce();
  });
});
