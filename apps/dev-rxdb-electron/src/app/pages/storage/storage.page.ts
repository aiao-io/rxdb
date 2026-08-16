import { StorageBackendError, type StorageBrowserEntry } from '@aiao/rxdb-plugin-storage';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { DesktopDatabaseService } from '../../services/desktop-database.service';

/**
 * 生成测试内容用的分块大小。
 *
 * @remarks
 * 只影响生成时的分配粒度，不影响字节本身 —— {@link patternByte} 用的是**绝对下标**，
 * 换块大小不会改变同一个 (name, size) 生成出来的内容。
 */
const PATTERN_BLOCK_BYTES = 64 * 1024;

/** 一 MiB 的字节数；页面上的大小输入以 MiB 计。 */
const BYTES_PER_MIB = 1024 * 1024;

/**
 * 确定性内容：第 `index` 个字节只由下标与种子决定。
 *
 * @remarks
 * e2e 侧（`apps/dev-rxdb-electron-e2e/src/storage-persistence.spec.ts`）按同一个公式
 * 在 Node 里复算期望字节，因此这里改一个常数就会让那套断言全红 —— 这正是想要的：
 * 「读回来的和写进去的一致」必须由两侧独立算出同一个结果来证明，而不是页面自己跟自己比。
 */
const patternByte = (index: number, seed: number): number => (index * 31 + seed) & 0xff;

/** 把名字折成一个 0–255 的种子，让不同文件的内容互不相同。 */
const seedOf = (name: string): number => {
  let seed = 0;
  for (const character of name) seed = (seed * 33 + character.charCodeAt(0)) & 0xff;
  return seed;
};

/** 按 {@link patternByte} 生成 `size` 字节的确定性文件。 */
const createPatternFile = (name: string, size: number): File => {
  const seed = seedOf(name);
  // 显式写 `Uint8Array<ArrayBuffer>`：默认推断是 `ArrayBufferLike`，
  // 其中包含 `SharedArrayBuffer`，而 `BlobPart` 不收 —— 少了这个参数会 TS2345。
  const blocks: Uint8Array<ArrayBuffer>[] = [];
  for (let offset = 0; offset < size; offset += PATTERN_BLOCK_BYTES) {
    const block = new Uint8Array(Math.min(PATTERN_BLOCK_BYTES, size - offset));
    for (let index = 0; index < block.length; index++) block[index] = patternByte(offset + index, seed);
    blocks.push(block);
  }
  return new File(blocks, name, { type: 'application/octet-stream' });
};

/** 把摘要字节转成小写十六进制。 */
const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');

/** 读回内容的校验结果，展示在页面上供 e2e 跨重启比对。 */
interface VerifyResult {
  readonly name: string;
  readonly size: number;
  readonly sha256: string;
}

/**
 * US-504 演示页：文件内容落在应用数据目录里的原生文件。
 *
 * @remarks
 * 只做覆盖 AC#1 / #3 / #5 所需的最小操作面（上传 / 浏览 / 读回校验 / 预览 / 下载 /
 * 重命名 / 删除 / 新建目录）。**不做 ZIP 批量下载** —— 三个 web demo 已经各自手写了一份
 * `showSaveFilePicker` + `<a download>`，这里再抄第四份只会让存量债务更难还（见故事
 * Out of Scope）；单文件保存一律走 `service.download()`。
 */
@Component({
  selector: 'app-storage-page',
  templateUrl: './storage.page.html',
  standalone: true
})
export default class StoragePage implements OnInit, OnDestroy {
  private readonly desktopDatabase = inject(DesktopDatabaseService);

  /** 切换预览时先回收上一个，否则上一次的对象 URL 始终活着。 */
  private previewDispose: (() => void) | null = null;

  readonly status = signal<'initializing' | 'ready' | 'failed'>('initializing');

  readonly errorMessage = signal<string | null>(null);

  /** 模板与 e2e 都靠它判断「操作进行中」。 */
  readonly busy = signal(false);

  readonly currentPath = signal('/');

  readonly entries = signal<readonly StorageBrowserEntry[]>([]);

  readonly verifyResult = signal<VerifyResult | null>(null);

  readonly previewUrl = signal<string | null>(null);

  /** 派生：`/` 时禁用「上一级」。 */
  readonly atRoot = computed(() => this.currentPath() === '/');

  ngOnInit(): void {
    void this.initialize();
  }

  ngOnDestroy(): void {
    this.disposePreview();
  }

  enter(path: string): Promise<void> {
    this.currentPath.set(path);
    return this.refresh();
  }

  goUp(): Promise<void> {
    const current = this.currentPath();
    const parent = current.slice(0, current.lastIndexOf('/'));
    return this.enter(parent === '' ? '/' : parent);
  }

  refresh(): Promise<void> {
    return this.run(() => this.loadEntries());
  }

  createDirectory(name: string): Promise<void> {
    return this.run(async () => {
      await this.desktopDatabase.storage.createDirectory(name, { path: this.currentPath() });
      await this.loadEntries();
    });
  }

  uploadPicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    input.value = '';
    return this.run(async () => {
      for (const file of picked) await this.uploadOne(file);
      await this.loadEntries();
    });
  }

  /**
   * 生成一个确定性内容的文件并上传。
   *
   * @remarks
   * AC#5 要的是「≥ 50 MiB 且内容可复算」。走文件选择器就得先在磁盘上摆一份 50 MiB 的
   * 素材，e2e 与手工验证都得各自准备；就地生成则只需要一个名字和一个尺寸。
   *
   * @param name - 文件名，同时决定内容种子
   * @param sizeText - 大小，单位 MiB，允许小数
   */
  uploadGenerated(name: string, sizeText: string): Promise<void> {
    return this.run(async () => {
      const sizeMib = Number(sizeText);
      if (!Number.isFinite(sizeMib) || sizeMib < 0) {
        throw new Error(`生成大小必须是非负数字，收到 ${sizeText}`);
      }

      await this.uploadOne(createPatternFile(name, Math.round(sizeMib * BYTES_PER_MIB)));
      await this.loadEntries();
    });
  }

  verify(entry: StorageBrowserEntry): Promise<void> {
    if (entry.kind !== 'file') return Promise.resolve();

    return this.run(async () => {
      this.verifyResult.set(null);
      const blob = await this.desktopDatabase.storage.read(entry.meta.id);
      const bytes = await blob.arrayBuffer();
      this.verifyResult.set({
        name: entry.name,
        size: bytes.byteLength,
        sha256: toHex(await crypto.subtle.digest('SHA-256', bytes))
      });
    });
  }

  preview(entry: StorageBrowserEntry): Promise<void> {
    if (entry.kind !== 'file') return Promise.resolve();

    return this.run(async () => {
      const result = await this.desktopDatabase.storage.preview(entry.meta.id);
      this.disposePreview();
      this.previewDispose = result.dispose;
      this.previewUrl.set(result.url);
    });
  }

  download(entry: StorageBrowserEntry): Promise<void> {
    if (entry.kind !== 'file') return Promise.resolve();

    return this.run(() => this.desktopDatabase.storage.download(entry.meta.id));
  }

  rename(entry: StorageBrowserEntry, newName: string): Promise<void> {
    if (entry.kind !== 'file') return Promise.resolve();

    return this.run(async () => {
      await this.desktopDatabase.storage.rename(entry.meta.id, newName, { overwrite: true });
      await this.loadEntries();
    });
  }

  remove(entry: StorageBrowserEntry): Promise<void> {
    if (entry.kind !== 'file') return Promise.resolve();

    return this.run(async () => {
      await this.desktopDatabase.storage.delete(entry.meta.id);
      await this.loadEntries();
    });
  }

  /**
   * 初始化存储根并列出根目录。
   *
   * @remarks
   * 「就绪」在**首次列表拉完之后**才置位。反过来（先置就绪再拉列表）会让页面有一段
   * 自称就绪、列表却还是空的窗口期 —— 观察者据此判断「目录里什么都没有」是错的，
   * 而这正是重启后读回内容的那条 e2e 唯一能依据的信号。
   *
   * 同理，首次列表**失败**也必须落到 `failed`：init 成功只说明存储根建起来了，
   * 不等于这个页面已经能如实展示目录。让它停在 `ready`，e2e 等到的就是一个
   * 「就绪且为空」的假信号。
   */
  private async initialize(): Promise<void> {
    try {
      await this.desktopDatabase.storage.init();
      await this.loadEntries();
    } catch (error) {
      this.status.set('failed');
      this.errorMessage.set(describeError(error));
      return;
    }
    this.status.set('ready');
  }

  /**
   * 拉一次当前目录的列表。
   *
   * @remarks
   * 这里**故意会 reject**，怎么呈现失败由调用方决定：交互路径把它交给 `run` 收进
   * `errorMessage`，初始化路径则要据此把整页判为 `failed`。曾经两边都走 `run`，
   * 于是首次列表失败时页面照样置位 `ready` —— 一个自称就绪、`entries` 却是空数组的页面，
   * 读起来正是「这个目录里什么都没有」，而真相是它一个条目都没读到。
   */
  private async loadEntries(): Promise<void> {
    this.entries.set(await this.desktopDatabase.storage.listEntries({ path: this.currentPath() }));
  }

  private async uploadOne(file: File): Promise<void> {
    await this.desktopDatabase.storage.upload(file, { path: this.currentPath(), overwrite: true });
  }

  /**
   * 跑一次操作，把忙碌态与失败原因收敛到两个信号上。
   *
   * @remarks
   * **永不 reject**：调用点全在模板的事件绑定里，抛出去只会变成一条 unhandled rejection，
   * 页面上什么都看不到 —— 而这个 demo 存在的意义就是让失败看得见。
   */
  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.errorMessage.set(null);
    try {
      await action();
    } catch (error) {
      this.errorMessage.set(describeError(error));
    } finally {
      this.busy.set(false);
    }
  }

  private disposePreview(): void {
    this.previewDispose?.();
    this.previewDispose = null;
    this.previewUrl.set(null);
  }
}

/**
 * 把失败原因转成一行文案。
 *
 * @remarks
 * 后端错误优先带上 `code`：跨 IPC 的失败靠它判别（结构化克隆不保留原型），
 * 只显示 message 的话 AC#6 的「稳定错误码」在页面上就看不出来了。
 */
const describeError = (error: unknown): string => {
  if (error instanceof StorageBackendError) return `${error.code}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
};
