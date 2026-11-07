import { MessageChannel as NodeMessageChannel } from 'node:worker_threads';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { projectPath } from './runtime-host-page.js';
import { RUNTIME_HOST_CONNECT, RUNTIME_HOST_READY, connectRuntimeHost } from './runtime-host-protocol.js';
import { createVivariBackend, previewFrameUrl, startVivariHost, type VivariInstance } from './vivari-host.js';

const HOST = 'http://localhost:4331';
const WORKBENCH = 'http://localhost:4320';

function dirent(name: string, kind: 'file' | 'directory' | 'other') {
  return { name, isFile: () => kind === 'file', isDirectory: () => kind === 'directory' };
}

/** vivari 进程的替身：合并输出之外还有 stdout / stderr 两个视图，取消它们只是不再排队。 */
function fakeProcess() {
  let output!: ReadableStreamDefaultController<string>;
  let settle!: (code: number) => void;
  const written: string[] = [];
  const cancelStdout = vi.fn();
  const cancelStderr = vi.fn();
  const process = {
    output: new ReadableStream<string>({
      start(controller) {
        output = controller;
      }
    }),
    stdout: new ReadableStream<string>({ cancel: cancelStdout }),
    stderr: new ReadableStream<string>({ cancel: cancelStderr }),
    input: new WritableStream<string>({
      write(data) {
        written.push(data);
      }
    }),
    exit: new Promise<number>(resolve => {
      settle = resolve;
    }),
    kill: vi.fn()
  };
  return { process, output, written, cancelStdout, cancelStderr, exit: (code: number) => settle(code) };
}

function fakeVivari() {
  const serverReady = new Set<(port: number, url: string) => void>();
  const vivari = {
    fs: {
      readdir: vi.fn(async () => [dirent('src', 'directory'), dirent('main.ts', 'file'), dirent('link', 'other')]),
      readFile: vi.fn(async () => {
        const shared = new Uint8Array(new SharedArrayBuffer(3));
        shared.set([1, 2, 3]);
        return shared;
      }),
      writeFile: vi.fn(async () => undefined),
      mkdir: vi.fn(async () => undefined),
      rm: vi.fn(async () => undefined)
    },
    mount: vi.fn(async () => undefined),
    spawn: vi.fn(),
    on: vi.fn((_event: 'server-ready', listener: (port: number, url: string) => void) => {
      serverReady.add(listener);
      return () => {
        serverReady.delete(listener);
      };
    }),
    attachPreview: vi.fn(() => vi.fn()),
    teardown: vi.fn()
  };
  return { vivari, serverReady, instance: vivari as unknown as VivariInstance };
}

const location = { origin: HOST };

describe('vivari 宿主：项目路径', () => {
  it('项目根挂在 /project，只接受项目内的相对路径', () => {
    expect(projectPath('.')).toBe('/project');
    expect(projectPath('')).toBe('/project');
    expect(projectPath('src/main.ts')).toBe('/project/src/main.ts');
    for (const path of ['/etc/passwd', '../secret', 'src/../../x', 'src//a', './a'])
      expect(() => projectPath(path)).toThrow('项目内的相对路径');
  });

  it('服务预览改走宿主源上的预览容器页，带上内核宿主页的名字', () => {
    const url = previewFrameUrl(location, 'aiao-runtime-host-vivari-1', `${HOST}/preview/5173/?__vv_kernel=abc`);
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(`${HOST}/preview-frame.html`);
    expect(parsed.searchParams.get('host')).toBe('aiao-runtime-host-vivari-1');
    expect(parsed.searchParams.get('src')).toBe('/preview/5173/?__vv_kernel=abc');
    // vivari 的 server-ready 给的是相对宿主源的地址
    expect(previewFrameUrl(location, 'aiao-runtime-host-vivari-1', '/preview/5173/?__vv_kernel=abc')).toBe(url);
    expect(() => previewFrameUrl(location, 'host', 'https://evil.example/preview/5173/')).toThrow('预览地址');
    expect(() => previewFrameUrl(location, 'host', `${HOST}/assets/kernel.js`)).toThrow('预览地址');
  });
});

describe('vivari 宿主：运行时后端', () => {
  it('按独立源宿主的布局启动 vivari，重复启动复用同一次', async () => {
    const fake = fakeVivari();
    const boot = vi.fn(async () => fake.instance);
    const backend = createVivariBackend({ boot, location, hostName: 'host' });
    await Promise.all([backend.boot(), backend.boot()]);
    expect(boot).toHaveBeenCalledOnce();
  });

  it('挂载前清空项目目录，文件操作都落在 /project 下，读出的字节不落在共享内存上', async () => {
    const fake = fakeVivari();
    const backend = createVivariBackend({ boot: async () => fake.instance, location, hostName: 'host' });
    await backend.boot();
    await backend.mount({ 'main.ts': { file: { contents: 'one' } } });
    expect(fake.vivari.fs.rm).toHaveBeenCalledWith('/project', { recursive: true, force: true });
    expect(fake.vivari.mount).toHaveBeenCalledWith(
      { 'main.ts': { file: { contents: 'one' } } },
      { mountPoint: '/project' }
    );
    expect(fake.vivari.fs.rm.mock.invocationCallOrder[0]).toBeLessThan(fake.vivari.mount.mock.invocationCallOrder[0]!);
    expect(await backend.readdir('src')).toEqual([
      { name: 'src', kind: 'directory' },
      { name: 'main.ts', kind: 'file' },
      { name: 'link', kind: 'other' }
    ]);
    expect(fake.vivari.fs.readdir).toHaveBeenCalledWith('/project/src', { withFileTypes: true });
    const bytes = await backend.readFile('main.ts');
    expect([...bytes]).toEqual([1, 2, 3]);
    expect(bytes.buffer).toBeInstanceOf(ArrayBuffer);
    await backend.writeFile('src/a.ts', 'a');
    await backend.mkdir('src/deep');
    await backend.rm('src/old', true);
    expect(fake.vivari.fs.writeFile).toHaveBeenCalledWith('/project/src/a.ts', 'a');
    expect(fake.vivari.fs.mkdir).toHaveBeenCalledWith('/project/src/deep', { recursive: true });
    expect(fake.vivari.fs.rm).toHaveBeenLastCalledWith('/project/src/old', { recursive: true, force: true });
    await expect(backend.readFile('../escape')).rejects.toThrow('项目内的相对路径');
  });

  it('监听由 VM 里的 Node 监听进程完成（SDK 监听看不到进程写入），逐行解析事件并补上监听目录', async () => {
    const fake = fakeVivari();
    const watcher = fakeProcess();
    fake.vivari.spawn.mockResolvedValueOnce(watcher.process);
    const backend = createVivariBackend({ boot: async () => fake.instance, location, hostName: 'host' });
    await backend.boot();
    const listener = vi.fn();
    const onError = vi.fn();
    const unwatch = backend.watch('src', listener, onError);
    await vi.waitFor(() =>
      // vivari 的 node -e 不把后续参数放进 process.argv，监听目录直接写进脚本
      expect(fake.vivari.spawn).toHaveBeenCalledWith('node', ['-e', expect.stringContaining('"/project/src"')], {
        cwd: '/project'
      })
    );
    await vi.waitFor(() => expect(watcher.cancelStdout).toHaveBeenCalledOnce());
    expect(watcher.cancelStderr).toHaveBeenCalledOnce();
    watcher.output.enqueue('[Vivari] notice\naiao-watch:["change","main.ts"]\naiao-watch:["rename","deep/');
    watcher.output.enqueue('a.ts"]\n');
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));
    expect(listener.mock.calls).toEqual([
      ['change', 'src/main.ts'],
      ['rename', 'src/deep/a.ts']
    ]);
    unwatch();
    expect(watcher.process.kill).toHaveBeenCalledOnce();
    watcher.exit(-1);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(onError).not.toHaveBeenCalled();
  });

  it('监听进程意外退出时带上它的错误输出报告故障', async () => {
    const fake = fakeVivari();
    const watcher = fakeProcess();
    fake.vivari.spawn.mockResolvedValueOnce(watcher.process);
    const backend = createVivariBackend({ boot: async () => fake.instance, location, hostName: 'host' });
    await backend.boot();
    const onError = vi.fn();
    backend.watch('.', vi.fn(), onError);
    await vi.waitFor(() => expect(watcher.cancelStdout).toHaveBeenCalledOnce());
    watcher.output.enqueue('[Vivari] watcher\nError: EMFILE: too many open files\n');
    watcher.exit(1);
    watcher.output.close();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(String(onError.mock.calls[0]![0])).toMatch(/监听进程退出（1）[\s\S]*\[Vivari\] watcher[\s\S]*EMFILE/);
  });

  it('监听进程起不来时报告故障；起来之前就注销的监听，起来后立即结束', async () => {
    const fake = fakeVivari();
    const late = fakeProcess();
    let finish!: (child: unknown) => void;
    fake.vivari.spawn
      .mockRejectedValueOnce(new Error('ERR_COMMAND_NOT_FOUND: node'))
      .mockReturnValueOnce(new Promise(resolve => (finish = resolve)));
    const backend = createVivariBackend({ boot: async () => fake.instance, location, hostName: 'host' });
    await backend.boot();
    const onError = vi.fn();
    backend.watch('.', vi.fn(), onError);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(new Error('ERR_COMMAND_NOT_FOUND: node')));
    const unwatch = backend.watch('.', vi.fn(), onError);
    unwatch();
    finish(late.process);
    await vi.waitFor(() => expect(late.process.kill).toHaveBeenCalledOnce());
    late.exit(-1);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(onError).toHaveBeenCalledOnce();
  });

  it('进程在项目根运行并带上环境变量，输出转发完再报告退出码，输入写进进程', async () => {
    const fake = fakeVivari();
    const child = fakeProcess();
    fake.vivari.spawn.mockResolvedValueOnce(child.process);
    const backend = createVivariBackend({ boot: async () => fake.instance, location, hostName: 'host' });
    await backend.boot();
    const events: string[] = [];
    const running = await backend.spawn(
      'pnpm',
      ['install'],
      { env: { CI: '1' }, size: { cols: 120, rows: 30 } },
      {
        output: data => events.push(`output:${data}`),
        exit: code => events.push(`exit:${code}`)
      }
    );
    expect(fake.vivari.spawn).toHaveBeenCalledWith('pnpm', ['install'], {
      cwd: '/project',
      env: { npm_config_lockfile: 'false', npm_config_package_lock: 'false', CI: '1' }
    });
    // 只读合并输出；不读的 stdout / stderr 视图要取消，否则长跑进程的输出会一直排在队列里
    expect(child.cancelStdout).toHaveBeenCalledOnce();
    expect(child.cancelStderr).toHaveBeenCalledOnce();
    await running.write('y\r');
    expect(child.written).toEqual(['y\r']);
    child.output.enqueue('Progress');
    child.exit(0);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(events).toEqual(['output:Progress']);
    child.output.enqueue('Done');
    child.output.close();
    await vi.waitFor(() => expect(events).toEqual(['output:Progress', 'output:Done', 'exit:0']));
    running.kill();
    expect(child.process.kill).toHaveBeenCalledOnce();
  });

  it('没传环境变量的进程（如交互 Shell）也不读写锁文件：vivari 把原生包换成 WASM 版本，锁文件会把它们换回原生包', async () => {
    const fake = fakeVivari();
    fake.vivari.spawn.mockResolvedValueOnce(fakeProcess().process);
    const backend = createVivariBackend({ boot: async () => fake.instance, location, hostName: 'host' });
    await backend.boot();
    await backend.spawn('sh', [], { env: undefined, size: { cols: 80, rows: 24 } }, { output: vi.fn(), exit: vi.fn() });
    expect(fake.vivari.spawn).toHaveBeenCalledWith('sh', [], {
      cwd: '/project',
      env: { npm_config_lockfile: 'false', npm_config_package_lock: 'false' }
    });
  });

  it('启动前注册的服务就绪回调在启动后收到预览容器页地址；拆除时释放 vivari', async () => {
    const fake = fakeVivari();
    const backend = createVivariBackend({ boot: async () => fake.instance, location, hostName: 'host-1' });
    const listener = vi.fn();
    const off = backend.onServerReady(listener);
    await backend.boot();
    fake.serverReady.forEach(notify => notify(5173, `${HOST}/preview/5173/?__vv_kernel=k`));
    expect(listener).toHaveBeenCalledExactlyOnceWith(
      5173,
      `${HOST}/preview-frame.html?host=host-1&src=%2Fpreview%2F5173%2F%3F__vv_kernel%3Dk`
    );
    off();
    fake.serverReady.forEach(notify => notify(5174, `${HOST}/preview/5174/`));
    expect(listener).toHaveBeenCalledOnce();
    backend.teardown();
    expect(fake.vivari.teardown).toHaveBeenCalledOnce();
  });

  it('启动途中被拆除时，启动完成的 vivari 立即释放，调用明确拒绝', async () => {
    const fake = fakeVivari();
    let finish!: (instance: VivariInstance) => void;
    const backend = createVivariBackend({
      boot: () =>
        new Promise<VivariInstance>(resolve => {
          finish = resolve;
        }),
      location,
      hostName: 'host'
    });
    const booting = backend.boot();
    backend.teardown();
    finish(fake.instance);
    await expect(booting).rejects.toThrow('已拆除');
    expect(fake.vivari.teardown).toHaveBeenCalledOnce();
    await expect(backend.readFile('main.ts')).rejects.toThrow('已拆除');
  });

  it('尚未启动时文件操作明确拒绝', async () => {
    const backend = createVivariBackend({ boot: async () => fakeVivari().instance, location, hostName: 'host' });
    await expect(backend.readFile('main.ts')).rejects.toThrow('尚未启动');
  });
});

describe('vivari 宿主：握手', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function hostWindow() {
    const listeners = new Set<(event: MessageEvent) => void>();
    const parent = { postMessage: vi.fn() };
    const view = {
      name: 'aiao-runtime-host-vivari-1',
      location,
      parent,
      addEventListener: vi.fn((_type: 'message', listener: (event: MessageEvent) => void) => listeners.add(listener)),
      removeEventListener: vi.fn((_type: 'message', listener: (event: MessageEvent) => void) =>
        listeners.delete(listener)
      )
    };
    const dispatch = (event: Partial<MessageEvent>) => listeners.forEach(listener => listener(event as MessageEvent));
    return { view, parent, dispatch, listeners };
  }

  it('宣告就绪后只接受父窗口从允许的工作台来源发来的第一次连接', async () => {
    const fake = fakeVivari();
    const boot = vi.fn(async () => fake.instance);
    const { view, parent, dispatch, listeners } = hostWindow();
    startVivariHost(view as unknown as Window, { parents: [WORKBENCH, 'http://localhost:4330'], boot });
    expect(parent.postMessage).toHaveBeenCalledExactlyOnceWith({ type: RUNTIME_HOST_READY }, '*');
    const channel = new NodeMessageChannel();
    const ports = [channel.port2 as unknown as MessagePort];
    dispatch({
      source: parent as unknown as Window,
      origin: 'https://evil.example',
      data: { type: RUNTIME_HOST_CONNECT },
      ports
    });
    dispatch({ source: {} as Window, origin: WORKBENCH, data: { type: RUNTIME_HOST_CONNECT }, ports });
    dispatch({ source: parent as unknown as Window, origin: WORKBENCH, data: { type: 'other' }, ports });
    dispatch({
      source: parent as unknown as Window,
      origin: WORKBENCH,
      data: { type: RUNTIME_HOST_CONNECT },
      ports: []
    });
    expect(listeners.size).toBe(1);
    dispatch({ source: parent as unknown as Window, origin: WORKBENCH, data: { type: RUNTIME_HOST_CONNECT }, ports });
    expect(listeners.size).toBe(0);
    const host = connectRuntimeHost(channel.port1 as unknown as MessagePort, () => undefined);
    await host.boot();
    expect(boot).toHaveBeenCalledOnce();
    expect((view as unknown as { aiaoVivariHost?: unknown }).aiaoVivariHost).toBeDefined();
    host.teardown();
    await vi.waitFor(() => expect(fake.vivari.teardown).toHaveBeenCalledOnce());
    channel.port1.close();
  });
});
