import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DesktopData } from '../data/desktop-data';
import { Preferences } from '../data/preferences';
import type { ProtectedOperation } from '../disk/application-projection';
import { DESKTOP, DiskPath, HOME, finderPathOf, toVmPath } from '../disk/disk-path';
import { DiskStore } from '../disk/disk-store';
import { MemoryDiskStore } from '../disk/memory-disk-store';
import { ApplicationCatalog } from '../services/application-catalog';
import { DesktopAppServices } from '../services/desktop-app-services';
import { DESKTOP_APPS } from '../services/desktop-apps';
import { FileOpener } from '../services/file-opener';
import { FileSystem, type DiskChange } from '../services/file-system';
import { FinderPreferences } from '../services/finder-preferences';
import {
  GIT_TERMINAL_VERSION,
  GitWorkbenchRuntime,
  type GitTerminalCommand,
  type GitTerminalResult
} from '../services/git/git-runtime';
import { Toast } from '../services/toast';
import { WindowManager } from '../services/window-manager';
import { configureServices } from '../testing/angular';
import { testApps } from '../testing/desktop-apps';
import { FakeDesktopData } from '../testing/fake-desktop-data';
import { FakeVm } from '../testing/fake-vm';
import { createWindowManagerStub } from '../testing/stubs';
import { OPEN_OSC } from './coreutils';
import type { TerminalCommandResponse } from './terminal-command';
import { SHELL_ENV, SHELL_HOME, VirtualMachine } from './virtual-machine';
import type { GithubTerminalRequest, GithubTerminalResult } from './workspace-git';

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
  const changes = new Subject<DiskChange>();
  const disk = {
    whenReady: vi.fn(async () => undefined),
    state: vi.fn(() => 'ready'),
    error: vi.fn((): string | null => null),
    run: <T>(task: (store: DiskStore) => Promise<T>) => task(store),
    notifyChanges: (paths: readonly DiskPath[], source: DiskChange['source'] = 'desktop') =>
      changes.next({ paths, source }),
    changes
  };
  const wm = createWindowManagerStub();
  const opener = { open: vi.fn(), openApp: vi.fn(() => true) };
  const toast = { show: vi.fn() };
  const workspace = {
    openDirectory: vi.fn<(path: DiskPath) => Promise<{ projectId: string; name: string }>>(async () => ({
      projectId: 'existing-repository',
      name: 'repo'
    })),
    runTerminal: vi.fn<(request: GithubTerminalRequest) => Promise<GithubTerminalResult>>(async () => ({
      code: 0,
      stdout: 'workspace status\n',
      stderr: ''
    }))
  };
  const catalog = { violation: vi.fn<(operation: ProtectedOperation) => string | null>(() => null) };
  configureServices([
    VirtualMachine,
    FinderPreferences,
    Preferences,
    { provide: DesktopData, useValue: new FakeDesktopData() },
    { provide: FileSystem, useValue: disk },
    { provide: DesktopAppServices, useValue: { get: () => workspace } },
    { provide: FileOpener, useValue: opener },
    { provide: ApplicationCatalog, useValue: catalog },
    { provide: WindowManager, useValue: wm },
    { provide: Toast, useValue: toast },
    { provide: DESKTOP_APPS, useValue: testApps() }
  ]);
  return {
    machine: TestBed.inject(VirtualMachine),
    finderPreferences: TestBed.inject(FinderPreferences),
    store,
    vm,
    vivari,
    disk,
    changes,
    wm,
    opener,
    toast,
    log,
    catalog,
    workspace
  };
}

/** 让所有排着的微任务（含假时钟下的 await 链）跑完。 */
const settle = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

const channels: BroadcastChannel[] = [];
beforeEach(() => {
  const NativeChannel = BroadcastChannel;
  vi.stubGlobal(
    'BroadcastChannel',
    class extends NativeChannel {
      constructor(name: string) {
        super(name);
        channels.push(this);
      }
    }
  );
  vi.useFakeTimers();
  mocks.boot.mockReset();
});

afterEach(() => {
  for (const channel of channels.splice(0)) channel.close();
  vi.useRealTimers();
});

describe('VirtualMachine 开机与关机', () => {
  it('终端里的用户与主目录和 Finder 的 Macintosh HD 是同一块磁盘', () => {
    expect(SHELL_HOME).toBe('/Users/stevejobs');
    expect(SHELL_ENV).toMatchObject({
      HOME: SHELL_HOME,
      USER: 'stevejobs',
      LOGNAME: 'stevejobs',
      TERM: 'xterm-256color'
    });
  });

  it('第一次 acquire 开机：给 shell 打补丁、装上补充命令，并把磁盘复制进虚拟机', async () => {
    const { machine, vm, vivari } = await setup();
    expect(await machine.acquire()).toBe(vivari);
    expect(mocks.boot).toHaveBeenCalledExactlyOnceWith({ serviceWorkerUrl: false });

    const written = new Map(vivari.fs.writeFile.mock.calls.map(([path, data]) => [path, data]));
    expect(written.get('/bin/sh.js')).toBe('patched:SHELL-SOURCE');
    expect([...written.keys()].sort()).toEqual([
      '/bin/code.js',
      '/bin/cp.js',
      '/bin/defaults.js',
      '/bin/git.js',
      '/bin/mv.js',
      '/bin/open.js',
      '/bin/sh.js',
      '/bin/touch.js'
    ]);
    expect(written.get('/bin/open.js')).toContain(`openOsc: ${OPEN_OSC}`);
    expect(written.get('/bin/git.js')).toContain('(process, "git")');
    expect(written.get('/bin/defaults.js')).toContain('(process, "defaults")');
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

  it('终端改动落盘会通知应用，不会回推并覆盖终端接下来的写入', async () => {
    const { machine, vm, store, changes } = await setup();
    await machine.acquire();
    const events: DiskChange[] = [];
    changes.subscribe(event => events.push(event));
    const pushes = vi.spyOn(vm, 'remove');
    await vm.write(toVmPath(NOTE), text('from shell'));

    machine.noteActivity();
    await vi.advanceTimersByTimeAsync(300);
    expect(decode(await store.read(NOTE))).toBe('from shell');
    expect(events).toEqual([{ paths: [NOTE], source: 'terminal' }]);
    expect(pushes).not.toHaveBeenCalled();
  });

  it('桌面这边的改动按路径推进虚拟机', async () => {
    const { machine, vm, store, changes } = await setup();
    await machine.acquire();
    await store.write([...DESKTOP, 'saved.txt'], text('from TextEdit'));
    changes.next({ paths: [[...DESKTOP, 'saved.txt']], source: 'desktop' });
    await settle();
    expect(decode(await vm.read(toVmPath([...DESKTOP, 'saved.txt'])))).toBe('from TextEdit');
  });

  it('推进失败时提示同步失败的原因', async () => {
    const { machine, vm, changes, toast } = await setup();
    await machine.acquire();
    vi.spyOn(vm, 'remove').mockRejectedValueOnce(new Error('vm is gone'));
    changes.next({ paths: [[...DESKTOP, 'x.txt']], source: 'desktop' });
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

function terminalChannel(name: string) {
  const channel = new BroadcastChannel(name);
  let pid = 0;
  const run = (args: readonly string[], cwd = SHELL_HOME): Promise<TerminalCommandResponse> => {
    const id = ++pid;
    return new Promise(resolve => {
      const receive = ({ data }: MessageEvent<TerminalCommandResponse & { pid: number }>) => {
        if (data.pid !== id) return;
        channel.removeEventListener('message', receive);
        resolve(data);
      };
      channel.addEventListener('message', receive);
      channel.postMessage({ pid: id, args, cwd });
    });
  };
  return { channel, run };
}

describe('VirtualMachine 终端里的 code', () => {
  it('先同步终端文件，再打开当前 Git 目录，不启动未绑定的编辑器', async () => {
    const { machine, vm, store, wm, opener, workspace } = await setup();
    wm.open.mockReturnValue({});
    await machine.acquire();
    const { run } = terminalChannel(machine.shellEnv.AIAO_CODE_CHANNEL);
    const root = [...DESKTOP, 'repo'];
    await vm.mkdir(toVmPath(root));
    await vm.write(toVmPath([...root, '.git']), text('git metadata'));
    await vm.write(toVmPath([...root, 'from-shell.txt']), text('unsynced'));

    await expect(run(['.'], toVmPath(root))).resolves.toMatchObject({ exitCode: 0, stdout: '', stderr: '' });
    expect(await store.read([...root, 'from-shell.txt'])).toEqual(text('unsynced'));
    expect(workspace.openDirectory).toHaveBeenCalledExactlyOnceWith(root);
    expect(wm.open).toHaveBeenCalledExactlyOnceWith('vscode', {
      projectId: 'existing-repository',
      workspaceName: 'repo'
    });
    expect(opener.openApp).not.toHaveBeenCalled();
  });

  it('普通目录原地打开，不构造 Git 仓库；不接受文件、缺失目录或 VM 临时路径', async () => {
    const { machine, store, wm, workspace } = await setup();
    const root = [...DESKTOP, 'plain folder'];
    await store.mkdir(root);
    wm.open.mockReturnValue({});
    await machine.acquire();
    const { run } = terminalChannel(machine.shellEnv.AIAO_CODE_CHANNEL);
    await expect(run(['Desktop/plain folder'])).resolves.toMatchObject({ exitCode: 0 });
    expect(wm.open).toHaveBeenCalledExactlyOnceWith(
      'vscode',
      expect.objectContaining({
        projectId: expect.stringMatching(/^folder-/),
        workspacePath: root,
        workspaceName: 'plain folder'
      })
    );
    expect(await store.kindOf([...root, '.git'])).toBeNull();
    expect(workspace.openDirectory).not.toHaveBeenCalled();
    for (const path of ['Desktop/note.txt', 'Desktop/missing', '/tmp'])
      await expect(run([path])).resolves.toMatchObject({ exitCode: 1, stderr: expect.stringContaining('code:') });
    await expect(run(['--wait'])).resolves.toMatchObject({ exitCode: 64, stderr: expect.stringContaining('usage:') });
    expect(wm.open).toHaveBeenCalledTimes(1);
  });

  it('Git 子目录只打开所选目录，open -a 指定目录也不会落回最近项目', async () => {
    const { machine, store, wm, opener, workspace } = await setup();
    const root = [...DESKTOP, 'repo'];
    const nested = [...root, 'src'];
    await store.write([...root, '.git'], text('git metadata'));
    await store.mkdir(nested);
    wm.open.mockReturnValue({});
    await machine.open(request('vscode', false, [toVmPath(nested)]));
    expect(wm.open).toHaveBeenCalledWith(
      'vscode',
      expect.objectContaining({ workspacePath: nested, workspaceName: 'src' })
    );
    await machine.open(request('vscode', false, [toVmPath([...DESKTOP, 'not-here'])]));
    expect(wm.open).toHaveBeenCalledTimes(1);
    expect(opener.openApp).not.toHaveBeenCalled();
    expect(workspace.openDirectory).not.toHaveBeenCalled();
  });
});

describe('VirtualMachine 终端里的 defaults', () => {
  const operands = ['write', 'com.apple.finder', 'AppleShowAllFiles'];

  it('命令与 Finder 使用同一项布尔偏好，写完才报告成功', async () => {
    const { machine, finderPreferences } = await setup();
    await machine.acquire();
    const { run } = terminalChannel(machine.shellEnv.AIAO_DEFAULTS_CHANNEL);

    expect(finderPreferences.showHiddenFiles()).toBe(false);
    await expect(run([...operands, '-bool', 'true'])).resolves.toMatchObject({ exitCode: 0, stderr: '' });
    expect(finderPreferences.showHiddenFiles()).toBe(true);

    await expect(run([...operands, '-bool', 'false'])).resolves.toMatchObject({ exitCode: 0, stderr: '' });
    expect(finderPreferences.showHiddenFiles()).toBe(false);
    await expect(run([...operands, '-boolean', 'YES'])).resolves.toMatchObject({ exitCode: 0 });
    expect(finderPreferences.showHiddenFiles()).toBe(true);
    await expect(run([...operands, '-boolean', 'NO'])).resolves.toMatchObject({ exitCode: 0 });
    expect(finderPreferences.showHiddenFiles()).toBe(false);
  });

  it('拒绝其他偏好和非法布尔值，写入失败后仍可重试', async () => {
    const { machine, finderPreferences } = await setup();
    await machine.acquire();
    const { run } = terminalChannel(machine.shellEnv.AIAO_DEFAULTS_CHANNEL);
    const write = vi.spyOn(finderPreferences, 'setShowHiddenFiles').mockRejectedValueOnce(new Error('disk full'));

    for (const args of [
      [...operands, '-bool', 'maybe'],
      [...operands, '-string', 'true'],
      ['write', 'other.domain', 'AppleShowAllFiles', '-bool', 'true'],
      ['write', 'com.apple.finder', 'OtherKey', '-bool', 'true']
    ])
      await expect(run(args)).resolves.toMatchObject({ exitCode: 64, stderr: expect.stringContaining('usage:') });
    expect(write).not.toHaveBeenCalled();

    await expect(run([...operands, '-bool', 'true'])).resolves.toMatchObject({
      exitCode: 1,
      stderr: 'defaults: disk full'
    });
    expect(finderPreferences.showHiddenFiles()).toBe(false);
    await expect(run([...operands, '-bool', 'true'])).resolves.toMatchObject({ exitCode: 0 });
    expect(finderPreferences.showHiddenFiles()).toBe(true);
  });
});

describe('VirtualMachine 终端里的 git', () => {
  async function terminal() {
    const context = await setup();
    await context.machine.acquire();
    const { channel, run: git } = terminalChannel(context.machine.shellEnv.AIAO_GIT_CHANNEL);
    return { ...context, channel, git };
  }

  it('忽略损坏的请求，随后仍能回复版本查询', async () => {
    const { channel, git } = await terminal();
    channel.postMessage(null);
    channel.postMessage({ pid: 0, args: [0], cwd: '/tmp' });
    await expect(git(['--version'])).resolves.toMatchObject({ exitCode: 0, stdout: GIT_TERMINAL_VERSION, stderr: '' });
  });

  it('用 git -C 从主目录操作已登记的仓库，先同步终端里的文件', async () => {
    const { git, store, vm, workspace } = await terminal();
    const project = [...DESKTOP, 'registered'];
    const cwd = toVmPath([...project, 'src']);
    await vm.write(toVmPath([...project, '.git']), text('gitdir: /opfs/registered/.git\n'));
    await vm.write(`${cwd}/note.txt`, text('unsynced edit'));
    workspace.runTerminal.mockImplementationOnce(async () => ({
      code: 0,
      stdout: decode(await store.read([...project, 'src', 'note.txt'])),
      stderr: ''
    }));

    await expect(git(['-C', 'Desktop/registered', '-C', 'src', 'status'])).resolves.toMatchObject({
      exitCode: 0,
      stdout: 'unsynced edit',
      stderr: ''
    });
    expect(workspace.runTerminal).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ cwd, args: ['status'] }));
  });

  it('两个标签的请求依次读取、写回同一个仓库，保留各自的输出和退出码', async () => {
    const { channel, git, vm, store } = await terminal();
    const observer = new BroadcastChannel(channel.name);
    const overlapping = new Promise<void>(resolve => {
      observer.onmessage = ({ data }) => {
        if (data.args?.[0] === 'status') resolve();
      };
    });
    const root = `${SHELL_HOME}/Desktop/git-project`;
    await vm.mkdir(`${root}/.git`);
    await vm.write(`${root}/gone/file`, text('remove'));
    await vm.write(`${root}/nested/README.md`, text('before'));
    const runTerminal = vi.fn(async (command: GitTerminalCommand): Promise<GitTerminalResult> => {
      if (command.args[0] === 'status') return { ...command, exitCode: 7, stdout: 'second', stderr: 'warning' };
      await overlapping;
      return {
        files: [{ path: 'nested/README.md', bytes: new TextEncoder().encode('after') }],
        directories: ['.git', 'nested', 'new/empty', 'new'],
        exitCode: 0,
        stdout: 'first',
        stderr: ''
      };
    });
    vi.stubGlobal('location', { origin: 'https://desktop.example' });
    const create = vi
      .spyOn(GitWorkbenchRuntime, 'create')
      .mockResolvedValue({ runTerminal } as unknown as GitWorkbenchRuntime);
    try {
      const responses = await Promise.all([git(['checkout', 'branch'], root), git(['status'], `${root}/nested`)]);
      expect(responses).toEqual([
        { pid: 1, exitCode: 0, stdout: 'first', stderr: '' },
        { pid: 2, exitCode: 7, stdout: 'second', stderr: 'warning' }
      ]);
      const second = runTerminal.mock.calls[1][0];
      expect(second.cwd).toBe('nested');
      expect(second.files.map(file => [file.path, decode(file.bytes)])).toEqual([['nested/README.md', 'after']]);
      expect(second.directories).toContain('new/empty');
      expect(decode(await store.read([...DESKTOP, 'git-project', 'nested', 'README.md']))).toBe('after');
      expect(await store.kindOf([...DESKTOP, 'git-project', 'new', 'empty'])).toBe('directory');
    } finally {
      create.mockRestore();
    }
  });

  it('加载失败交给发起命令的进程，下次调用可以重试', async () => {
    const { git } = await terminal();
    vi.stubGlobal('location', { origin: 'https://desktop.example' });
    const create = vi.spyOn(GitWorkbenchRuntime, 'create').mockRejectedValue(new Error('WASM unavailable'));
    try {
      await expect(git(['status'])).resolves.toMatchObject({ exitCode: 1, stderr: 'git: WASM unavailable' });
      await expect(git(['status'])).resolves.toMatchObject({ exitCode: 1 });
      expect(create).toHaveBeenCalledTimes(2);
    } finally {
      create.mockRestore();
    }
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
