import { Service, inject } from '@angular/core';
import { Vivari } from '@vivari/core';
import { Subscription } from 'rxjs';

import { fileKind } from '../disk/disk-kinds';
import { DISK_ROOTS, HOME, finderPathOf, fromVmPath, parentOf, toVmPath } from '../disk/disk-path';
import { FsNode } from '../disk/disk-tree';
import { ApplicationCatalog } from '../services/application-catalog';
import { DESKTOP_APPS } from '../services/desktop-apps';
import { FileOpener } from '../services/file-opener';
import { FileSystem, describeDiskError } from '../services/file-system';
import { Toast } from '../services/toast';
import { WindowManager } from '../services/window-manager';
import { cpProgram, mvProgram, openProgram, parseOpenRequest, programSource, touchProgram } from './coreutils';
import { DiskVmSync } from './disk-vm-sync';
import { patchShell } from './shell-patch';
import { vivariFs } from './vm-fs';

/** 终端输出停下这么久之后扫描一次：命令跑完总会重画提示符，所以几乎所有改动都能马上同步。 */
const SETTLE_DELAY = 300;
/** 不打印任何东西的后台进程写的文件，靠定时扫描发现。 */
const POLL_INTERVAL = 3_000;

/** 终端里的用户与主目录：和 Finder 的 Macintosh HD 是同一块磁盘。 */
export const SHELL_HOME = toVmPath(HOME);
export const SHELL_ENV: Readonly<Record<string, string>> = {
  HOME: SHELL_HOME,
  USER: HOME[HOME.length - 1],
  LOGNAME: HOME[HOME.length - 1],
  TERM: 'xterm-256color',
  COLORTERM: 'truecolor'
};

const PROGRAMS = { touch: touchProgram, mv: mvProgram, cp: cpProgram, open: openProgram } as const;

interface Machine {
  readonly vivari: Vivari;
  readonly sync: DiskVmSync;
  readonly subscription: Subscription;
  readonly ticker: ReturnType<typeof setInterval>;
}

/**
 * 页面里唯一的一台 Vivari 虚拟机：所有终端窗口与标签共用它（像一台机器开多个终端）。
 * 第一个标签开机，开机时把 Macintosh HD 复制进去；最后一个标签关掉时把终端的改动写回磁盘再拆掉。
 *
 * 每个浏览器标签页各有自己的一台（ADESK-US-105）。Vivari 1.3.0 把虚拟机文件系统的镜像写在 OPFS 的 `vv-vfs`
 * （目录名写死在它的工作线程里，没有按实例分区的选项），所有标签页的虚拟机共用这一份，镜像的索引由它自己用 Web Lock
 * 合并。实测两个标签页同时开机、同时往镜像里写各自的文件、一个先关掉另一个继续用，都没有出现覆盖、损坏或开机失败，
 * 各自的文件在重开的虚拟机里都在，所以不另做分区。共用镜像不影响磁盘：卷里的内容每次开机都由 `DiskVmSync.attach`
 * 先清掉镜像恢复出来的旧内容，再以库为准重新挂载；只有卷之外的路径（例如 `/home/user`）会在各台虚拟机之间共用。
 */
@Service({ autoProvided: false })
export class VirtualMachine {
  private readonly fs = inject(FileSystem);
  private readonly opener = inject(FileOpener);
  private readonly catalog = inject(ApplicationCatalog);
  private readonly wm = inject(WindowManager);
  private readonly toast = inject(Toast);
  private readonly apps = inject(DESKTOP_APPS);
  private machine: Promise<Machine> | null = null;
  private users = 0;
  private stopping: Promise<void> = Promise.resolve();
  private settleTimer: ReturnType<typeof setTimeout> | undefined;

  /** 取得（必要时启动）虚拟机；每次成功或失败的 `acquire` 都要配一次 `release`。 */
  async acquire(): Promise<Vivari> {
    this.users++;
    this.machine ??= this.stopping.then(() => this.boot());
    const machine = this.machine;
    try {
      return (await machine).vivari;
    } catch (error) {
      if (this.machine === machine) this.machine = null;
      throw error;
    }
  }

  release(): void {
    this.users = Math.max(0, this.users - 1);
    if (this.users > 0 || !this.machine) return;
    const machine = this.machine;
    this.machine = null;
    clearTimeout(this.settleTimer);
    this.stopping = this.shutdown(machine);
  }

  /** 终端有输出：等它停下来再扫描一次。 */
  noteActivity(): void {
    clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => void this.pull(), SETTLE_DELAY);
  }

  /** 终端里的 `open`：先把刚写的文件同步回磁盘，再交给桌面打开。 */
  async open(data: string): Promise<void> {
    const request = parseOpenRequest(data);
    if (!request) return;
    await this.pull();
    if (request.app && !request.paths.length) {
      this.opener.openApp(request.app, null);
      return;
    }
    for (const vmPath of request.paths) await this.openPath(vmPath, request.app, request.reveal);
  }

  private async openPath(vmPath: string, app: string | null, reveal: boolean): Promise<void> {
    const path = fromVmPath(vmPath);
    if (!DISK_ROOTS.includes(path[0])) {
      this.toast.show(`“${vmPath}” is not on Macintosh HD`);
      return;
    }
    if (reveal) {
      this.wm.open('finder', { path: finderPathOf(parentOf(path)), select: path.at(-1) });
      return;
    }
    const kind = await this.fs.run(store => store.kindOf(path));
    const name = path.at(-1) ?? '';
    if (kind === 'directory' && !name.toLowerCase().endsWith('.app')) {
      this.wm.open('finder', { path: finderPathOf(path) });
      return;
    }
    const { kind: label, icon } = fileKind(name);
    const node: FsNode = { name, path, kind: 'file', icon, k: label, hidden: name.startsWith('.') };
    if (app) this.opener.openApp(app, node);
    else this.opener.open(node);
  }

  private async pull(): Promise<void> {
    const machine = await this.machine?.catch(() => null);
    if (!machine) return;
    await machine.sync
      .pull()
      .catch((error: unknown) => this.toast.show(`Terminal sync failed: ${describeDiskError(error)}`));
  }

  private async boot(): Promise<Machine> {
    await this.fs.whenReady();
    if (this.fs.state() !== 'ready') throw new Error(`Macintosh HD is unavailable: ${this.fs.error()}`);
    const vivari = await Vivari.boot({ serviceWorkerUrl: false });
    try {
      await this.install(vivari);
      const sync = new DiskVmSync({ run: task => this.fs.run(task) }, vivariFs(vivari), {
        roots: DISK_ROOTS,
        ignore: name => name === 'node_modules',
        veto: (path, change) =>
          this.catalog.violation(change === 'remove' ? { kind: 'remove', path } : { kind: 'write', path }),
        onVetoed: reasons => this.toast.show(`${reasons[0]} The change made in Terminal was reverted.`)
      });
      const subscription = this.fs.changes.subscribe(paths =>
        sync.push(paths).catch((error: unknown) => this.toast.show(`Terminal sync failed: ${describeDiskError(error)}`))
      );
      await sync.attach();
      const ticker = setInterval(() => void this.pull(), POLL_INTERVAL);
      return { vivari, sync, subscription, ticker };
    } catch (error) {
      vivari.teardown();
      throw error;
    }
  }

  /** 给自带的 shell 打补丁（~、$NAME、cd、提示符），装上 touch / mv / cp / open。 */
  private async install(vivari: Vivari): Promise<void> {
    const apps = Object.values(this.apps).flatMap(app =>
      app.kind === 'system' ? [] : [{ id: app.id, bundleId: app.bundleId, name: app.name }]
    );
    await vivari.fs.writeFile('/bin/sh.js', patchShell(await vivari.fs.readFile('/bin/sh.js', 'utf-8')));
    for (const [name, program] of Object.entries(PROGRAMS))
      await vivari.fs.writeFile(`/bin/${name}.js`, programSource(program, apps));
  }

  private async shutdown(pending: Promise<Machine>): Promise<void> {
    const machine = await pending.catch(() => null);
    if (!machine) return;
    clearInterval(machine.ticker);
    machine.subscription.unsubscribe();
    await machine.sync
      .pull()
      .catch((error: unknown) => this.toast.show(`Terminal sync failed: ${describeDiskError(error)}`));
    machine.vivari.teardown();
  }
}
