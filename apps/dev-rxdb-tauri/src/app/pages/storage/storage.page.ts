import { RxDB } from '@aiao/rxdb';
import { StorageBackendError, type StorageBrowserEntry } from '@aiao/rxdb-plugin-storage';
import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { TauriService } from '../../services/tauri.service';

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

/** 确定性内容：第 `index` 个字节只由下标与种子决定。 */
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

/**
 * 把失败原因转成一行文案。
 *
 * @remarks
 * 后端错误优先带上 `code`：跨 IPC 的失败靠它判别（结构化克隆不保留原型），
 * 只显示 message 的话「稳定错误码」在页面上就看不出来了。
 */
const describeError = (error: unknown): string => {
  if (error instanceof StorageBackendError) return `${error.code}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
};

/** 读回内容的校验结果，展示在页面上供人工核对字节。 */
interface VerifyResult {
  /** 被校验文件的逻辑名。 */
  readonly name: string;
  /** 读回的字节数。 */
  readonly size: number;
  /** 读回内容的 SHA-256，小写十六进制。 */
  readonly sha256: string;
}

/**
 * US-505 演示页：文件内容落在 Tauri 应用数据目录里的原生文件。
 *
 * @remarks
 * 与 Electron 的同名页面刻意同构（同一套操作面、同一份确定性内容算法）：
 * 两个 demo 摆在一起才看得出「换掉的只是宿主，API 与行为都没变」。
 *
 * 页面本身**不知道**自己跑在哪个后端上 —— 后端由 `selectLocalBackend()` 在
 * `app.config.ts` 里选定：Tauri 窗口下是 Rust 宿主的原生文件，浏览器预览下是 OPFS。
 * 顶部那条后端标识读的是运行时判定，不是页面自己的假设。
 *
 * **不做 ZIP 批量下载** —— 三个 web demo 已经各自手写了一份 `showSaveFilePicker` +
 * `<a download>`，这里再抄第四份只会让存量债务更难还；单文件保存一律走 `storage.download()`。
 */
@Component({
  selector: 'app-storage-page',
  templateUrl: './storage.page.html',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class StoragePage implements OnInit, OnDestroy {
  private readonly rxdb = inject(RxDB);
  private readonly tauriService = inject(TauriService);

  /** 已释放的预览 URL 不再持有；切换预览时先回收上一个。 */
  private previewDispose: (() => void) | null = null;

  /** 内容后端是否为 Rust 宿主持有的原生文件（否则是 WebView 的 OPFS）。 */
  protected readonly isNativeBackend = signal(this.tauriService.isTauri);

  /** 存储后端的初始化状态。 */
  protected readonly status = signal<'initializing' | 'ready' | 'failed'>('initializing');

  /** 最近一次失败的可读描述；成功后清空。 */
  protected readonly errorMessage = signal<string | null>(null);

  /** 是否有操作正在执行；按钮据此禁用。 */
  protected readonly busy = signal(false);

  /** 当前浏览目录，始终以 `/` 开头。 */
  protected readonly currentPath = signal('/');

  /** 当前目录的直属条目。 */
  protected readonly entries = signal<readonly StorageBrowserEntry[]>([]);

  /** 最近一次读回校验的结果。 */
  protected readonly verifyResult = signal<VerifyResult | null>(null);

  /** 当前预览的对象 URL。 */
  protected readonly previewUrl = signal<string | null>(null);

  /** 是否已在根目录（决定「上一级」是否可用）。 */
  protected readonly atRoot = computed(() => this.currentPath() === '/');

  ngOnInit(): void {
    void this.initialize();
  }

  ngOnDestroy(): void {
    this.disposePreview();
  }

  /** 进入子目录并刷新列表。 */
  protected enter(path: string): Promise<void> {
    this.currentPath.set(path);
    return this.refresh();
  }

  /** 回到上一级目录。 */
  protected goUp(): Promise<void> {
    const current = this.currentPath();
    const parent = current.slice(0, current.lastIndexOf('/'));
    return this.enter(parent === '' ? '/' : parent);
  }

  /** 重新拉取当前目录的条目。 */
  protected refresh(): Promise<void> {
    return this.run(async () => {
      this.entries.set(await this.rxdb.storage.listEntries({ path: this.currentPath() }));
    });
  }

  /** 在当前目录下新建子目录。 */
  protected createDirectory(name: string): Promise<void> {
    return this.run(async () => {
      await this.rxdb.storage.createDirectory(name, { path: this.currentPath() });
      this.entries.set(await this.rxdb.storage.listEntries({ path: this.currentPath() }));
    });
  }

  /** 上传文件选择器里选中的文件。 */
  protected uploadPicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    input.value = '';
    return this.run(async () => {
      for (const file of picked) await this.uploadOne(file);
      this.entries.set(await this.rxdb.storage.listEntries({ path: this.currentPath() }));
    });
  }

  /**
   * 生成一个确定性内容的文件并上传。
   *
   * @param name - 文件名，同时决定内容种子
   * @param sizeText - 大小，单位 MiB，允许小数
   *
   * @remarks
   * 「大文件也能落地」要的是几十 MiB 的素材。走文件选择器就得先在磁盘上摆一份，
   * 就地生成则只需要一个名字和一个尺寸，且内容可按公式复算。
   */
  protected uploadGenerated(name: string, sizeText: string): Promise<void> {
    return this.run(async () => {
      const sizeMib = Number(sizeText);
      if (!Number.isFinite(sizeMib) || sizeMib < 0) {
        throw new Error(`生成大小必须是非负数字，收到 ${sizeText}`);
      }

      await this.uploadOne(createPatternFile(name, Math.round(sizeMib * BYTES_PER_MIB)));
      this.entries.set(await this.rxdb.storage.listEntries({ path: this.currentPath() }));
    });
  }

  /** 读回文件内容并展示大小与 SHA-256。 */
  protected verify(entry: StorageBrowserEntry): Promise<void> {
    if (entry.kind !== 'file') return Promise.resolve();

    return this.run(async () => {
      this.verifyResult.set(null);
      const blob = await this.rxdb.storage.read(entry.meta.id);
      const bytes = await blob.arrayBuffer();
      this.verifyResult.set({
        name: entry.name,
        size: bytes.byteLength,
        sha256: toHex(await crypto.subtle.digest('SHA-256', bytes))
      });
    });
  }

  /** 创建一次性预览 URL。 */
  protected preview(entry: StorageBrowserEntry): Promise<void> {
    if (entry.kind !== 'file') return Promise.resolve();

    return this.run(async () => {
      const result = await this.rxdb.storage.preview(entry.meta.id);
      this.disposePreview();
      this.previewDispose = result.dispose;
      this.previewUrl.set(result.url);
    });
  }

  /** 保存单个文件到本机。 */
  protected download(entry: StorageBrowserEntry): Promise<void> {
    if (entry.kind !== 'file') return Promise.resolve();

    return this.run(() => this.rxdb.storage.download(entry.meta.id));
  }

  /** 把文件改名为输入框里的名字。 */
  protected rename(entry: StorageBrowserEntry, newName: string): Promise<void> {
    if (entry.kind !== 'file') return Promise.resolve();

    return this.run(async () => {
      await this.rxdb.storage.rename(entry.meta.id, newName, { overwrite: true });
      this.entries.set(await this.rxdb.storage.listEntries({ path: this.currentPath() }));
    });
  }

  /** 删除文件及其 metadata。 */
  protected remove(entry: StorageBrowserEntry): Promise<void> {
    if (entry.kind !== 'file') return Promise.resolve();

    return this.run(async () => {
      await this.rxdb.storage.delete(entry.meta.id);
      this.entries.set(await this.rxdb.storage.listEntries({ path: this.currentPath() }));
    });
  }

  /**
   * 初始化存储根并列出根目录。
   *
   * @remarks
   * 「就绪」在**首次列表拉完之后**才置位。反过来（先置就绪再拉列表）会让页面有一段
   * 自称就绪、列表却还是空的窗口期 —— 观察者据此判断「目录里什么都没有」是错的。
   */
  private async initialize(): Promise<void> {
    try {
      await this.rxdb.storage.init();
    } catch (error) {
      this.status.set('failed');
      this.errorMessage.set(describeError(error));
      return;
    }
    await this.refresh();
    this.status.set('ready');
  }

  /** 覆盖式上传到当前目录。 */
  private async uploadOne(file: File): Promise<void> {
    await this.rxdb.storage.upload(file, { path: this.currentPath(), overwrite: true });
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

  /** 回收上一个预览 URL。 */
  private disposePreview(): void {
    this.previewDispose?.();
    this.previewDispose = null;
    this.previewUrl.set(null);
  }
}
