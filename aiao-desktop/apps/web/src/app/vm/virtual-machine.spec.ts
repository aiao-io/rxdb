import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProtectedOperation } from '../disk/application-projection';
import { DESKTOP, DiskPath, HOME, finderPathOf, toVmPath } from '../disk/disk-path';
import { DiskStore } from '../disk/disk-store';
import { MemoryDiskStore } from '../disk/memory-disk-store';
import { ApplicationCatalog } from '../services/application-catalog';
import { DESKTOP_APPS } from '../services/desktop-apps';
import { FileOpener } from '../services/file-opener';
import { FileSystem } from '../services/file-system';
import { Toast } from '../services/toast';
import { WindowManager } from '../services/window-manager';
import { configureServices } from '../testing/angular';
import { testApps } from '../testing/desktop-apps';
import { FakeVm } from '../testing/fake-vm';
import { createWindowManagerStub } from '../testing/stubs';
import { OPEN_OSC } from './coreutils';
import { SHELL_ENV, SHELL_HOME, VirtualMachine } from './virtual-machine';

const mocks = vi.hoisted(() => ({ boot: vi.fn(), vm: { current: undefined as unknown } }));

vi.mock('@vivari/core', async importOriginal => ({
  ...(await importOriginal<typeof import('@vivari/core')>()),
  Vivari: { boot: mocks.boot }
}));
vi.mock('./vm-fs', () => ({ vivariFs: () => mocks.vm.current }));
vi.mock('./shell-patch', () => ({ patchShell: (source: string) => `patched:${source}` }));

const text = (value: string): Uint8Array => new TextEncoder().encode(value);
const decode = (value: Uint8Array): string => new TextDecoder().decode(value);

const NOTE: DiskPath = [...DESKTOP, 'note.txt'];

/** `open` 命令交给桌面的请求，按终端里的编码方式拼成载荷。 */
const request = (app: string | null, reveal: boolean, paths: readonly string[]): string =>
  encodeURIComponent(JSON.stringify({ app, reveal, paths }));

async function setup() {
  const store = new MemoryDiskStore();
  await store.write(NOTE, text('hello'));
  const vm = new FakeVm();
  mocks.vm.current = vm;
  const log: string[] = [];
  const vivari = {
    fs: {
      readFile: vi.fn(async () => 'SHELL-SOURCE'),
      writeFile: vi.fn<(path: string, data: string) => Promise<void>>(async () => undefined)
    },
    teardown: vi.fn(() => {
      log.push('teardown');
    })
  };
  mocks.boot.mockImplementation(async () => {
    log.push('boot');
    return vivari;
  });
  const changes = new Subject<readonly DiskPath[]>();
  const disk = {
    whenReady: vi.fn(async () => undefined),
    state: vi.fn(() => 'ready'),
    error: vi.fn((): string | null => null),
    run: <T>(task: (store: DiskStore) => Promise<T>) => task(store),
    changes
  };
  const wm = createWindowManagerStub();
  const opener = { open: vi.fn(), openApp: vi.fn(() => true) };
  const toast = { show: vi.fn() };
  const catalog = { violation: vi.fn<(operation: ProtectedOperation) => string | null>(() => null) };
  configureServices([
    VirtualMachine,
    { provide: FileSystem, useValue: disk },
    { provide: FileOpener, useValue: opener },
    { provide: ApplicationCatalog, useValue: catalog },
    { provide: WindowManager, useValue: wm },
    { provide: Toast, useValue: toast },
    { provide: DESKTOP_APPS, useValue: testApps() }
  ]);
  return { machine: TestBed.inject(VirtualMachine), store, vm, vivari, disk, changes, wm, opener, toast, log, catalog };
}

/** 让所有排着的微任务（含假时钟下的 await 链）跑完。 */
const settle = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

beforeEach(() => {
  vi.useFakeTimers();
  mocks.boot.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('VirtualMachine 开机与关机', () => {
  it('终端里的用户与主目录和 Finder 的 Macintosh HD 是同一块磁盘', () => {
    expect(SHELL_HOME).toBe('/Users/prasenjit');
    expect(SHELL_ENV).toMatchObject({
      HOME: SHELL_HOME,
      USER: 'prasenjit',
      LOGNAME: 'prasenjit',
      TERM: 'xterm-256color'
    });
  });

  it('第一次 acquire 开机：给 shell 打补丁、装上 touch/mv/cp/open，并把磁盘复制进虚拟机', async () => {
    const { machine, vm, vivari } = await setup();
    expect(await machine.acquire()).toBe(vivari);
    expect(mocks.boot).toHaveBeenCalledExactlyOnceWith({ serviceWorkerUrl: false });

    const written = new Map(vivari.fs.writeFile.mock.calls.map(([path, data]) => [path, data]));
    expect(written.get('/bin/sh.js')).toBe('patched:SHELL-SOURCE');
    expect([...written.keys()].sort()).toEqual([
      '/bin/cp.js',
      '/bin/mv.js',
      '/bin/open.js',
      '/bin/sh.js',
      '/bin/touch.js'
    ]);
    expect(written.get('/bin/open.js')).toContain(`openOsc: ${OPEN_OSC}`);
    expect(written.get('/bin/open.js')).toContain('{"id":"finder","bundleId":"io.test.finder","name":"Finder"}');
    expect(written.get('/bin/open.js')).not.toContain('Launchpad');
    expect(decode(await vm.read(toVmPath(NOTE)))).toBe('hello');
  });

  it('多个终端共用一台机器：并发 acquire 只开一次机', async () => {
    const { machine } = await setup();
    const [first, second] = await Promise.all([machine.acquire(), machine.acquire()]);
    expect(first).toBe(second);
    expect(mocks.boot).toHaveBeenCalledTimes(1);
  });

  it('还有终端在用时 release 不拆机；最后一个关掉才把改动写回磁盘再拆机', async () => {
    const { machine, vm, store, vivari } = await setup();
    await machine.acquire();
    await machine.acquire();
    await vm.write(toVmPath([...DESKTOP, 'from-terminal.txt']), text('written in the VM'));

    machine.release();
    await settle();
    expect(vivari.teardown).not.toHaveBeenCalled();

    machine.release();
    await settle();
    expect(vivari.teardown).toHaveBeenCalledTimes(1);
    expect(decode(await store.read([...DESKTOP, 'from-terminal.txt']))).toBe('written in the VM');
  });

  it('拆机之后立刻再 acquire，要等上一台机器拆完才开新的', async () => {
    const { machine, log } = await setup();
    await machine.acquire();
    machine.release();
    await machine.acquire();
    expect(log).toEqual(['boot', 'teardown', 'boot']);
  });

  it('没有人在用时多余的 release 不报错', async () => {
    const { machine } = await setup();
    machine.release();
    await machine.acquire();
    machine.release();
    machine.release();
    await settle();
  });

  it('磁盘没有挂上时开机失败并说明原因，失败不被缓存，磁盘恢复后可以重试', async () => {
    const { machine, disk } = await setup();
    disk.state.mockReturnValue('failed');
    disk.error.mockReturnValue('OPFS is unavailable');
    await expect(machine.acquire()).rejects.toThrow('Macintosh HD is unavailable: OPFS is unavailable');
    expect(mocks.boot).not.toHaveBeenCalled();
    machine.release();

    disk.state.mockReturnValue('ready');
    await expect(machine.acquire()).resolves.toBeDefined();
    expect(mocks.boot).toHaveBeenCalledTimes(1);
  });

  it('开机过程中装命令失败时拆掉已经启动的机器并抛出原错误', async () => {
    const { machine, vivari } = await setup();
    vivari.fs.readFile.mockRejectedValueOnce(new Error('cannot read /bin/sh.js'));
    await expect(machine.acquire()).rejects.toThrow('cannot read /bin/sh.js');
    expect(vivari.teardown).toHaveBeenCalledTimes(1);
  });
});

describe('VirtualMachine 与磁盘同步', () => {
  it('终端输出停下 300ms 后扫描一次，把终端里的改动写回磁盘；连续输出会重新计时', async () => {
    const { machine, vm, store } = await setup();
    await machine.acquire();
    await vm.write(toVmPath([...DESKTOP, 'made.txt']), text('x'));

    machine.noteActivity();
    await vi.advanceTimersByTimeAsync(200);
    machine.noteActivity();
    await vi.advanceTimersByTimeAsync(299);
    expect(await store.kindOf([...DESKTOP, 'made.txt'])).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(decode(await store.read([...DESKTOP, 'made.txt']))).toBe('x');
  });

  it('没有输出的后台进程写的文件，靠每 3 秒的定时扫描发现', async () => {
    const { machine, vm, store } = await setup();
    await machine.acquire();
    await vm.write(toVmPath([...HOME, 'background.log']), text('tick'));
    await vi.advanceTimersByTimeAsync(2999);
    expect(await store.kindOf([...HOME, 'background.log'])).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(decode(await store.read([...HOME, 'background.log']))).toBe('tick');
  });

  it('桌面这边的改动按路径推进虚拟机', async () => {
    const { machine, vm, store, changes } = await setup();
    await machine.acquire();
    await store.write([...DESKTOP, 'saved.txt'], text('from TextEdit'));
    changes.next([[...DESKTOP, 'saved.txt']]);
    await settle();
    expect(decode(await vm.read(toVmPath([...DESKTOP, 'saved.txt'])))).toBe('from TextEdit');
  });

  it('推进失败时提示同步失败的原因', async () => {
    const { machine, vm, changes, toast } = await setup();
    await machine.acquire();
    vi.spyOn(vm, 'remove').mockRejectedValueOnce(new Error('vm is gone'));
    changes.next([[...DESKTOP, 'x.txt']]);
    await settle();
    expect(toast.show).toHaveBeenCalledExactlyOnceWith('Terminal sync failed: vm is gone');
  });

  it('扫描失败时提示，不中断后续的扫描', async () => {
    const { machine, vm, toast } = await setup();
    await machine.acquire();
    vi.spyOn(vm, 'stat').mockRejectedValueOnce(new Error('scan failed'));
    machine.noteActivity();
    await vi.advanceTimersByTimeAsync(300);
    expect(toast.show).toHaveBeenCalledExactlyOnceWith('Terminal sync failed: scan failed');

    await vm.write(toVmPath([...DESKTOP, 'later.txt']), text('ok'));
    await vi.advanceTimersByTimeAsync(3000);
    expect(toast.show).toHaveBeenCalledTimes(1);
  });

  it('拆机时的最后一次写回失败也只是提示，机器照样拆掉', async () => {
    const { machine, vm, vivari, toast } = await setup();
    await machine.acquire();
    vi.spyOn(vm, 'stat').mockRejectedValue(new Error('disk gone'));
    machine.release();
    await settle();
    expect(toast.show).toHaveBeenCalledWith('Terminal sync failed: disk gone');
    expect(vivari.teardown).toHaveBeenCalledTimes(1);
  });

  it('拆机后停止定时扫描，也不再跟随桌面的改动', async () => {
    const { machine, vm, changes, store } = await setup();
    await machine.acquire();
    machine.release();
    await settle();
    expect(changes.observed).toBe(false);

    await vm.write(toVmPath([...DESKTOP, 'after.txt']), text('late'));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await store.kindOf([...DESKTOP, 'after.txt'])).toBeNull();
  });

  it('机器启动前没有扫描可做：noteActivity 的回调安静地结束', async () => {
    const { machine, toast } = await setup();
    machine.noteActivity();
    await vi.advanceTimersByTimeAsync(300);
    expect(toast.show).not.toHaveBeenCalled();
  });
});

describe('VirtualMachine 预装应用保护', () => {
  const reason = 'The item “Notes.app” can’t be removed because it’s part of a preinstalled application.';
  const INFO: DiskPath = ['Applications', 'Notes.app', 'Contents', 'Info.plist'];
  const INFO_VM = '/Applications/Notes.app/Contents/Info.plist';

  /** 磁盘上放一个预装包，应用目录服务对落在包上的删除与写入给出拒绝原因。 */
  async function protectedSetup() {
    const context = await setup();
    await context.store.write(INFO, text('<plist/>'));
    context.catalog.violation.mockImplementation(operation =>
      operation.kind !== 'move' && operation.path[1] === 'Notes.app' ? reason : null
    );
    await context.machine.acquire();
    return context;
  }

  it('终端里删掉预装包：向应用目录服务问过之后否决回写，磁盘不变，虚拟机里恢复，并提示已撤销', async () => {
    const { machine, vm, store, catalog, toast } = await protectedSetup();
    await vm.remove('/Applications/Notes.app');
    machine.noteActivity();
    await vi.advanceTimersByTimeAsync(300);

    expect(catalog.violation).toHaveBeenCalledWith({ kind: 'remove', path: ['Applications', 'Notes.app'] });
    expect(await store.kindOf(INFO)).toBe('file');
    expect(decode(await vm.read(INFO_VM))).toBe('<plist/>');
    expect(toast.show).toHaveBeenCalledExactlyOnceWith(`${reason} The change made in Terminal was reverted.`);
  });

  it('终端里改写受保护的文件：按写入问应用目录服务，被否决后磁盘和虚拟机里都保持原样', async () => {
    const { machine, vm, store, catalog, toast } = await protectedSetup();
    await vm.write(INFO_VM, text('tampered'));
    machine.noteActivity();
    await vi.advanceTimersByTimeAsync(300);

    expect(catalog.violation).toHaveBeenCalledWith({ kind: 'write', path: INFO });
    expect(decode(await store.read(INFO))).toBe('<plist/>');
    expect(decode(await vm.read(INFO_VM))).toBe('<plist/>');
    expect(toast.show).toHaveBeenCalledTimes(1);
  });

  it('同一次扫描里多处被否决、原因相同时只提示一次；放行的改动照常写回', async () => {
    const { machine, vm, store, toast } = await protectedSetup();
    await vm.write(INFO_VM, text('tampered'));
    await vm.write('/Applications/Notes.app/Contents/PkgInfo', text('tampered'));
    await vm.write(toVmPath([...DESKTOP, 'fine.txt']), text('fine'));
    machine.noteActivity();
    await vi.advanceTimersByTimeAsync(300);

    expect(toast.show).toHaveBeenCalledTimes(1);
    expect(decode(await store.read([...DESKTOP, 'fine.txt']))).toBe('fine');
  });

  it('没有被保护的改动时不提示', async () => {
    const { machine, vm, toast } = await protectedSetup();
    await vm.write(toVmPath([...DESKTOP, 'fine.txt']), text('fine'));
    machine.noteActivity();
    await vi.advanceTimersByTimeAsync(300);
    expect(toast.show).not.toHaveBeenCalled();
  });
});

describe('VirtualMachine 终端里的 open', () => {
  it('不合规的请求被忽略', async () => {
    const { machine, opener, wm, toast } = await setup();
    await machine.open('not json');
    expect([opener.open, opener.openApp, wm.open, toast.show].map(spy => spy.mock.calls.length)).toEqual([0, 0, 0, 0]);
  });

  it('只指定应用（open -a / -b）：请求里是应用 id，启动应用，不带文件', async () => {
    const { machine, opener } = await setup();
    await machine.open(request('textedit', false, []));
    expect(opener.openApp).toHaveBeenCalledExactlyOnceWith('textedit', null);
  });

  it('按文件类型打开：交给文件打开器，节点带上种类与图标', async () => {
    const { machine, opener } = await setup();
    await machine.open(request(null, false, [toVmPath(NOTE)]));
    expect(opener.open).toHaveBeenCalledExactlyOnceWith({
      name: 'note.txt',
      path: NOTE,
      kind: 'file',
      icon: 'f-txt',
      k: 'Plain text',
      hidden: false
    });
  });

  it('指定应用打开文件（open -a Name file）：按应用 id 交给文件打开器', async () => {
    const { machine, opener } = await setup();
    await machine.open(request('preview', false, [toVmPath(NOTE)]));
    expect(opener.openApp).toHaveBeenCalledExactlyOnceWith('preview', expect.objectContaining({ name: 'note.txt' }));
    expect(opener.open).not.toHaveBeenCalled();
  });

  it('目录用 Finder 打开；.app 目录当作程序包文件处理', async () => {
    const { machine, store, opener, wm } = await setup();
    await store.mkdir([...DESKTOP, 'Projects']);
    await store.mkdir(['Applications', 'Notes.app']);
    await machine.open(request(null, false, [toVmPath([...DESKTOP, 'Projects'])]));
    expect(wm.open).toHaveBeenCalledExactlyOnceWith('finder', { path: finderPathOf([...DESKTOP, 'Projects']) });

    await machine.open(request(null, false, ['/Applications/Notes.app']));
    expect(opener.open).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: 'Notes.app', kind: 'file', icon: 'f-app', hidden: false })
    );
  });

  it('-R 在 Finder 里显示：打开所在目录并选中该项', async () => {
    const { machine, wm } = await setup();
    await machine.open(request(null, true, [toVmPath(NOTE)]));
    expect(wm.open).toHaveBeenCalledExactlyOnceWith('finder', { path: finderPathOf(DESKTOP), select: 'note.txt' });
  });

  it('不在 Macintosh HD 上的路径只提示', async () => {
    const { machine, toast, opener, wm } = await setup();
    await machine.open(request(null, false, ['/tmp/scratch.txt']));
    expect(toast.show).toHaveBeenCalledExactlyOnceWith('“/tmp/scratch.txt” is not on Macintosh HD');
    expect(opener.open).not.toHaveBeenCalled();
    expect(wm.open).not.toHaveBeenCalled();
  });

  it('隐藏文件的节点标记为 hidden；一次 open 多个路径按顺序逐个打开', async () => {
    const { machine, opener } = await setup();
    await machine.open(request(null, false, [toVmPath(NOTE), toVmPath([...HOME, '.zshrc'])]));
    expect(
      opener.open.mock.calls.map(call => (call as unknown as [{ name: string; hidden: boolean }])[0])
    ).toMatchObject([
      { name: 'note.txt', hidden: false },
      { name: '.zshrc', hidden: true }
    ]);
  });

  it('open 之前先把终端刚写的文件同步回磁盘，所以刚 touch 出来的目录也能被 Finder 打开', async () => {
    const { machine, vm, wm } = await setup();
    await machine.acquire();
    await vm.mkdir(toVmPath([...DESKTOP, 'fresh-dir']));
    await machine.open(request(null, false, [toVmPath([...DESKTOP, 'fresh-dir'])]));
    expect(wm.open).toHaveBeenCalledExactlyOnceWith('finder', { path: finderPathOf([...DESKTOP, 'fresh-dir']) });
  });
});
