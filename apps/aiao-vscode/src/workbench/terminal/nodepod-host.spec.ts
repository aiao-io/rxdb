import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNodepodBackend, type NodepodInstance } from './nodepod-host.js';
import type { RuntimeHostProcessEvents } from './runtime-host-protocol.js';

const HOST = 'http://localhost:4332';
const location = { origin: HOST };
const document = { createElement: vi.fn(() => ({ tagName: 'DIV' })) } as unknown as Document;

type WatchCallback = (event: 'change' | 'rename', name: string | null) => void;

/** 内存里的 MemoryVolume 替身：只实现宿主用到的同步接口。 */
function fakeVolume() {
  const files = new Map<string, Uint8Array>();
  const directories = new Set<string>(['/']);
  const watches: { target: string; callback: WatchCallback; close: ReturnType<typeof vi.fn>; error?: () => void }[] =
    [];
  const parent = (path: string): string => path.slice(0, path.lastIndexOf('/')) || '/';
  const kindSync = (path: string): 'file' | 'directory' | null =>
    files.has(path) ? 'file'
    : directories.has(path) ? 'directory'
    : null;
  const below = (path: string) => (candidate: string) => candidate.startsWith(`${path}/`);
  const volume = {
    kindSync,
    readdirSync: vi.fn((path: string) =>
      [...files.keys(), ...directories]
        .filter(candidate => candidate !== path && parent(candidate) === path)
        .map(candidate => candidate.slice(path.length + 1))
    ),
    childKindsSync: vi.fn((path: string, names: string[]) => names.map(name => kindSync(`${path}/${name}`))),
    readFileSync: vi.fn((path: string) => {
      const bytes = files.get(path);
      if (!bytes) throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
      return bytes;
    }),
    writeFileSync: vi.fn((path: string, value: string | Uint8Array) => {
      files.set(path, typeof value === 'string' ? new TextEncoder().encode(value) : value);
    }),
    mkdirSync: vi.fn((path: string) => {
      for (let current = path; current !== '/'; current = parent(current)) directories.add(current);
    }),
    removeTreeSync: vi.fn((path: string) => {
      [...files.keys()].filter(below(path)).forEach(file => files.delete(file));
      [...directories].filter(below(path)).forEach(directory => directories.delete(directory));
      files.delete(path);
      directories.delete(path);
    }),
    unlinkSync: vi.fn((path: string) => files.delete(path)),
    rmdirSync: vi.fn((path: string) => directories.delete(path)),
    watch: vi.fn((target: string, _options: unknown, callback: WatchCallback) => {
      const entry: (typeof watches)[number] = { target, callback, close: vi.fn() };
      watches.push(entry);
      return {
        close: entry.close,
        on: (_event: 'error', listener: () => void) => {
          entry.error = listener;
        }
      };
    })
  };
  return { volume, files, directories, watches };
}

/** NodepodProcess 替身：output 是 stdout，error 是 stderr，completion 在输出之后兑现。 */
function fakeChild() {
  const listeners = new Map<string, (chunk: string) => void>();
  let finish!: (value: { stdout: string; stderr: string; exitCode: number }) => void;
  const child = {
    on: vi.fn((event: string, listener: (chunk: string) => void) => {
      listeners.set(event, listener);
      return child;
    }),
    write: vi.fn(),
    kill: vi.fn(),
    completion: new Promise<{ stdout: string; stderr: string; exitCode: number }>(resolve => {
      finish = resolve;
    })
  };
  return {
    child,
    stdout: (chunk: string) => listeners.get('output')?.(chunk),
    stderr: (chunk: string) => listeners.get('error')?.(chunk),
    exit: (exitCode: number) => finish({ stdout: '', stderr: '', exitCode })
  };
}

interface FakeTerminal {
  cols: number;
  rows: number;
  open(element: unknown): void;
  write(text: string): void;
  clear(): void;
  onData(listener: (data: string) => void): { dispose(): void };
  onResize(listener: () => void): { dispose(): void };
}

/** NodepodTerminal 替身：像真实实现一样 new 出 xterm、写提示符、订阅输入与尺寸。 */
function fakeShell() {
  const received: string[] = [];
  const resized: [number, number][] = [];
  let terminal: FakeTerminal | undefined;
  const shell = {
    attach: vi.fn((element: unknown) => {
      const created = new (shell.options!.Terminal as new (options: unknown) => FakeTerminal)({ cursorBlink: true });
      terminal = created;
      created.open(element);
      created.write('nodepod:/project$ ');
      created.onData(data => received.push(data));
      created.onResize(() => resized.push([created.cols, created.rows]));
    }),
    detach: vi.fn(),
    options: undefined as undefined | { Terminal: unknown }
  };
  return { shell, received, resized, terminal: () => terminal };
}

function fakeNodepod() {
  const volume = fakeVolume();
  const shell = fakeShell();
  const nodepod = {
    volume: volume.volume,
    spawn: vi.fn(),
    createTerminal: vi.fn((options: { Terminal: unknown }) => {
      shell.shell.options = options;
      return shell.shell;
    }),
    teardown: vi.fn(async () => undefined)
  };
  return { nodepod, volume, shell, instance: nodepod as unknown as NodepodInstance };
}

function recorder() {
  const log: string[] = [];
  const events: RuntimeHostProcessEvents = {
    output: data => log.push(`output:${data}`),
    exit: code => log.push(`exit:${code}`)
  };
  return { log, events };
}

async function booted() {
  const fake = fakeNodepod();
  let notify!: (port: number, url: string) => void;
  const backend = createNodepodBackend({
    boot: async onServerReady => {
      notify = onServerReady;
      return fake.instance;
    },
    location,
    document
  });
  await backend.boot();
  return { ...fake, backend, notify: (port: number, url: string) => notify(port, url) };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('Nodepod 宿主后端', () => {
  it('服务就绪地址相对宿主源补全，启动前注册的回调也能收到；注销后不再收到', async () => {
    const fake = fakeNodepod();
    let notify!: (port: number, url: string) => void;
    const backend = createNodepodBackend({
      boot: async onServerReady => {
        notify = onServerReady;
        return fake.instance;
      },
      location,
      document
    });
    const listener = vi.fn();
    const off = backend.onServerReady(listener);
    await Promise.all([backend.boot(), backend.boot()]);
    notify(5173, '/__virtual__/pod-1/5173');
    expect(listener).toHaveBeenCalledExactlyOnceWith(5173, `${HOST}/__virtual__/pod-1/5173`);
    off();
    notify(5174, `${HOST}/__virtual__/pod-1/5174`);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('挂载前清空项目目录，文件读写、目录与删除都落在 /project 下，读出的字节是副本', async () => {
    const { backend, volume } = await booted();
    volume.files.set('/project/stale.ts', new Uint8Array([9]));
    volume.directories.add('/project');
    await backend.mount({
      'package.json': { file: { contents: '{}' } },
      src: { directory: { 'main.ts': { file: { contents: new Uint8Array([1, 2]) } } } }
    });
    expect(volume.files.has('/project/stale.ts')).toBe(false);
    expect([...volume.files.keys()].sort()).toEqual(['/project/package.json', '/project/src/main.ts']);
    expect(await backend.readdir('.')).toEqual(
      expect.arrayContaining([
        { name: 'package.json', kind: 'file' },
        { name: 'src', kind: 'directory' }
      ])
    );
    const bytes = await backend.readFile('src/main.ts');
    expect([...bytes]).toEqual([1, 2]);
    expect(bytes).not.toBe(volume.files.get('/project/src/main.ts'));
    await backend.writeFile('src/new.ts', 'new');
    await backend.mkdir('src/deep/er');
    expect(volume.directories.has('/project/src/deep/er')).toBe(true);
    await backend.rm('src/new.ts', false);
    await backend.rm('src/deep', true);
    await backend.rm('missing.ts', false);
    expect(volume.files.has('/project/src/new.ts')).toBe(false);
    expect(volume.directories.has('/project/src/deep')).toBe(false);
    await expect(backend.readFile('../etc/passwd')).rejects.toThrow('项目内的相对路径');
  });

  it('监听文件系统卷：事件路径补上监听目录，空名字忽略；注销关闭监听，监听报错交给 onError', async () => {
    const { backend, volume } = await booted();
    const listener = vi.fn();
    const onError = vi.fn();
    const unwatch = backend.watch('src', listener, onError);
    expect(volume.volume.watch).toHaveBeenCalledWith('/project/src', { recursive: true }, expect.any(Function));
    const watch = volume.watches[0]!;
    watch.callback('rename', 'deep/a.ts');
    watch.callback('change', null);
    expect(listener).toHaveBeenCalledExactlyOnceWith('rename', 'src/deep/a.ts');
    watch.error?.();
    expect(onError).toHaveBeenCalledOnce();
    unwatch();
    expect(watch.close).toHaveBeenCalledOnce();
  });

  it('项目进程在项目根运行：stdout 与 stderr 合并转发，输出之后才报告退出码，输入与结束交给进程', async () => {
    const { backend, nodepod } = await booted();
    const process = fakeChild();
    nodepod.spawn.mockResolvedValueOnce(process.child);
    const { log, events } = recorder();
    const running = await backend.spawn(
      'pnpm',
      ['install'],
      { env: { CI: '1' }, size: { cols: 80, rows: 24 } },
      events
    );
    expect(nodepod.spawn).toHaveBeenCalledWith('pnpm', ['install'], { cwd: '/project', env: { CI: '1' } });
    process.stdout('Packages: +14\n');
    process.stderr('WARN deprecated\n');
    process.exit(0);
    await vi.waitFor(() =>
      expect(log).toEqual(['output:Packages: +14\n', 'output:WARN deprecated\n', 'exit:0'])
    );
    await running.write('y\n');
    running.kill();
    expect(process.child.write).toHaveBeenCalledWith('y\n');
    expect(process.child.kill).toHaveBeenCalledOnce();
  });

  it('无参 sh 接到 NodepodTerminal：提示符与回显写进输出，输入交给终端，尺寸可变，结束时卸下终端', async () => {
    const { backend, nodepod, shell } = await booted();
    const { log, events } = recorder();
    const running = await backend.spawn('sh', [], { env: undefined, size: { cols: 100, rows: 30 } }, events);
    expect(nodepod.spawn).not.toHaveBeenCalled();
    expect(shell.shell.attach).toHaveBeenCalledWith({ tagName: 'DIV' });
    expect(log).toEqual(['output:nodepod:/project$ ']);
    const terminal = shell.terminal()!;
    expect([terminal.cols, terminal.rows]).toEqual([100, 30]);
    await running.write('ls\r');
    expect(shell.received).toEqual(['ls\r']);
    terminal.clear();
    expect(log.at(-1)).toBe('output:\u001b[2J\u001b[3J\u001b[H');
    running.resize?.({ cols: 120, rows: 40 });
    expect(shell.resized).toEqual([[120, 40]]);
    running.kill();
    running.kill();
    expect(shell.shell.detach).toHaveBeenCalledOnce();
    terminal.write('late');
    expect(log.filter(entry => entry.startsWith('exit'))).toEqual(['exit:0']);
    expect(log).not.toContain('output:late');
  });

  it('拆除时释放 Nodepod；尚未启动或已拆除时文件操作明确拒绝', async () => {
    const fake = fakeNodepod();
    const backend = createNodepodBackend({ boot: async () => fake.instance, location, document });
    await expect(backend.readFile('main.ts')).rejects.toThrow('尚未启动');
    await backend.boot();
    backend.teardown();
    expect(fake.nodepod.teardown).toHaveBeenCalledOnce();
    await expect(backend.readFile('main.ts')).rejects.toThrow('已拆除');
  });
});
