import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  connectRuntimeHost,
  serveRuntimeHost,
  type RuntimeHostBackend,
  type RuntimeHostConnection
} from './runtime-host-protocol.js';

const channels: MessageChannel[] = [];
afterEach(() => {
  channels.splice(0).forEach(channel => {
    channel.port1.close();
    channel.port2.close();
  });
});

async function readAll(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader();
  let text = '';
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) text += chunk.value;
  return text;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(accept => {
    resolve = accept;
  });
  return { promise, resolve };
}

function fixture() {
  const events: { output(data: string): void; exit(code: number): void }[] = [];
  const serverReady = new Set<(port: number, url: string) => void>();
  const watchers = new Map<string, (kind: 'change' | 'rename', path: string) => void>();
  const write = vi.fn(async () => undefined);
  const kill = vi.fn();
  const resize = vi.fn();
  const unwatch = vi.fn();
  const backend: RuntimeHostBackend = {
    boot: vi.fn(async () => undefined),
    mount: vi.fn(async () => undefined),
    readdir: vi.fn(async () => [
      { name: 'src', kind: 'directory' as const },
      { name: 'main.ts', kind: 'file' as const },
      { name: 'link', kind: 'other' as const }
    ]),
    readFile: vi.fn(async () => new Uint8Array([1, 2, 3])),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    rm: vi.fn(async () => undefined),
    watch: vi.fn((path, listener) => {
      watchers.set(path, listener);
      return unwatch;
    }),
    spawn: vi.fn(async (_command, _args, _options, processEvents) => {
      events.push(processEvents);
      return { write, kill, resize };
    }),
    onServerReady: vi.fn(listener => {
      serverReady.add(listener);
      return () => serverReady.delete(listener);
    }),
    teardown: vi.fn()
  };
  const channel = new MessageChannel();
  channels.push(channel);
  const stop = serveRuntimeHost(channel.port2, backend);
  const release = vi.fn();
  const host: RuntimeHostConnection = connectRuntimeHost(channel.port1, release);
  return { backend, host, events, serverReady, watchers, write, kill, resize, unwatch, release, stop };
}

describe('运行时宿主协议', () => {
  it('启动、挂载与文件读写原样转发到宿主后端，目录项还原成带判断方法的对象', async () => {
    const f = fixture();
    await f.host.boot();
    await f.host.mount({ 'main.ts': { file: { contents: 'one' } } });
    const entries = await f.host.fs.readdir('.', { withFileTypes: true });
    expect(entries.map(entry => [entry.name, entry.isFile(), entry.isDirectory()])).toEqual([
      ['src', false, true],
      ['main.ts', true, false],
      ['link', false, false]
    ]);
    expect(await f.host.fs.readFile('main.ts')).toEqual(new Uint8Array([1, 2, 3]));
    await f.host.fs.writeFile('src/new.ts', 'new');
    await f.host.fs.mkdir('src/deep', { recursive: true });
    await f.host.fs.rm('src/old', { force: true, recursive: true });
    await f.host.fs.rm('main.ts', { force: true });
    expect(f.backend.boot).toHaveBeenCalledOnce();
    expect(f.backend.mount).toHaveBeenCalledWith({ 'main.ts': { file: { contents: 'one' } } });
    expect(f.backend.readdir).toHaveBeenCalledWith('.');
    expect(f.backend.writeFile).toHaveBeenCalledWith('src/new.ts', 'new');
    expect(f.backend.mkdir).toHaveBeenCalledWith('src/deep');
    expect(f.backend.rm).toHaveBeenNthCalledWith(1, 'src/old', true);
    expect(f.backend.rm).toHaveBeenNthCalledWith(2, 'main.ts', false);
  });

  it('宿主后端的失败按原消息拒绝调用', async () => {
    const f = fixture();
    vi.mocked(f.backend.readFile).mockRejectedValueOnce(new Error('ENOENT: missing.ts'));
    await expect(f.host.fs.readFile('missing.ts')).rejects.toThrow('ENOENT: missing.ts');
  });

  it('进程输出按序进入输出流，退出时先关闭流再给出退出码；输入、尺寸与结束转发给宿主进程', async () => {
    const f = fixture();
    const child = await f.host.spawn('pnpm', ['install'], { terminal: { cols: 80, rows: 24 }, env: { CI: '1' } });
    expect(f.backend.spawn).toHaveBeenCalledWith(
      'pnpm',
      ['install'],
      { env: { CI: '1' }, size: { cols: 80, rows: 24 } },
      expect.anything()
    );
    const reader = child.output.getReader();
    f.events[0]!.output('Progress: 1');
    f.events[0]!.output('Done in 1s');
    expect((await reader.read()).value).toBe('Progress: 1');
    expect((await reader.read()).value).toBe('Done in 1s');
    const writer = child.input.getWriter();
    await writer.write('y\r');
    await vi.waitFor(() => expect(f.write).toHaveBeenCalledWith('y\r'));
    child.resize({ cols: 120, rows: 40 });
    await vi.waitFor(() => expect(f.resize).toHaveBeenCalledWith({ cols: 120, rows: 40 }));
    child.kill();
    await vi.waitFor(() => expect(f.kill).toHaveBeenCalledOnce());
    f.events[0]!.exit(130);
    expect((await reader.read()).done).toBe(true);
    expect(await child.exit).toBe(130);
    // 退出后的尺寸变化没有接收方，直接忽略
    child.resize({ cols: 90, rows: 30 });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(f.resize).toHaveBeenCalledOnce();
  });

  it('宿主拒绝启动进程时 spawn 失败，不留下悬空的输出流', async () => {
    const f = fixture();
    vi.mocked(f.backend.spawn).mockRejectedValueOnce(new Error('ERR_COMMAND_NOT_FOUND: deno'));
    await expect(f.host.spawn('deno', [], { terminal: { cols: 80, rows: 24 } })).rejects.toThrow('deno');
  });

  it('进程在 spawn 返回前就退出时输出不丢，之后的输入与结束不再转发', async () => {
    const f = fixture();
    vi.mocked(f.backend.spawn).mockImplementationOnce(async (_command, _args, _options, processEvents) => {
      processEvents.output('v24.0.0');
      processEvents.exit(0);
      return { write: f.write, kill: f.kill };
    });
    const child = await f.host.spawn('node', ['-v'], { terminal: { cols: 80, rows: 24 } });
    expect(await child.exit).toBe(0);
    expect(await readAll(child.output)).toBe('v24.0.0');
    child.kill();
    await child.input.getWriter().write('late');
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(f.kill).not.toHaveBeenCalled();
    expect(f.write).not.toHaveBeenCalled();
  });

  it('结果无法跨源复制时调用明确失败，不会一直挂起', async () => {
    const f = fixture();
    vi.mocked(f.backend.readFile).mockResolvedValueOnce({ bytes: () => undefined } as unknown as Uint8Array);
    await expect(f.host.fs.readFile('main.ts')).rejects.toThrow(/clone/i);
  });

  it('宿主监听在注册之后失败时同样让连接失效', async () => {
    const f = fixture();
    let fail!: (cause: unknown) => void;
    vi.mocked(f.backend.watch).mockImplementationOnce((_path, _listener, onError) => {
      fail = onError;
      return f.unwatch;
    });
    f.host.fs.watch('.', { recursive: true }, vi.fn());
    await vi.waitFor(() => expect(fail).toBeTypeOf('function'));
    fail(new Error('监听进程退出（1）'));
    await vi.waitFor(() => expect(f.host.fs.readFile('main.ts')).rejects.toThrow('监听进程退出'));
  });

  it('宿主注册监听失败时连接失效，进行中与之后的调用都以该原因拒绝', async () => {
    const f = fixture();
    vi.mocked(f.backend.watch).mockImplementationOnce(() => {
      throw new Error('watch unsupported');
    });
    f.host.fs.watch('.', { recursive: true }, vi.fn());
    await expect(f.host.fs.readFile('main.ts')).rejects.toThrow('watch unsupported');
    await expect(f.host.boot()).rejects.toThrow('watch unsupported');
  });

  it('文件监听把宿主事件交给对应回调，关闭后注销宿主监听', async () => {
    const f = fixture();
    const listener = vi.fn();
    const watcher = f.host.fs.watch('.', { recursive: true }, listener);
    await vi.waitFor(() => expect(f.watchers.has('.')).toBe(true));
    f.watchers.get('.')!('change', 'src/main.ts');
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith('change', 'src/main.ts'));
    watcher.close();
    await vi.waitFor(() => expect(f.unwatch).toHaveBeenCalledOnce());
  });

  it('服务就绪事件带上宿主给出的预览地址，取消订阅后不再收到', async () => {
    const f = fixture();
    const listener = vi.fn();
    const off = f.host.on('server-ready', listener);
    f.serverReady.forEach(notify => notify(5173, 'http://localhost:4331/preview.html?src=%2Fpreview%2F5173%2F'));
    await vi.waitFor(() =>
      expect(listener).toHaveBeenCalledWith(5173, 'http://localhost:4331/preview.html?src=%2Fpreview%2F5173%2F')
    );
    off();
    f.serverReady.forEach(notify => notify(5174, 'later'));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(listener).toHaveBeenCalledOnce();
  });

  it('释放时通知宿主拆除，未结束的进程以 -1 退出，之后的调用明确拒绝', async () => {
    const f = fixture();
    const child = await f.host.spawn('sh', [], { terminal: { cols: 80, rows: 24 } });
    const pending = deferred<void>();
    vi.mocked(f.backend.writeFile).mockReturnValueOnce(pending.promise);
    const writing = f.host.fs.writeFile('slow.ts', 'slow');
    f.host.teardown();
    expect(await child.exit).toBe(-1);
    await expect(writing).rejects.toThrow('已释放');
    await expect(f.host.fs.readFile('main.ts')).rejects.toThrow('已释放');
    await vi.waitFor(() => expect(f.backend.teardown).toHaveBeenCalledOnce());
    expect(f.release).toHaveBeenCalledOnce();
  });
});
