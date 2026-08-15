/**
 * @fileoverview 内存 OPFS 句柄替身与假 metadata 仓储，供 node 侧 storage 用例共用。
 *
 * @remarks
 * 从 `storage.service.spec.ts` 原样搬出来，一个字节都没改语义 —— 目的是让
 * `backend-parity.spec.ts` 能用同一批替身把同一组行为在桌面后端上再跑一遍（US-504 AC#2）。
 * 两份各自维护的替身迟早会漂移，届时「两个后端行为一致」就成了两套替身各自的行为一致。
 *
 * @module rxdb-plugin-storage/__tests__/fixtures/memory-storage
 */

import type { RxDB } from '@aiao/rxdb';
import { type Mock, vi } from 'vitest';
import type { StorageFileMeta } from '../../file-meta.entity.js';
import { ObjectUrlRegistry } from '../../object-url.js';
import { RxdbFileStorage, type RxDBStoragePluginOptions } from '../../storage.service.js';

export interface MemoryWritableOptions {
  writeError?: Error;
  closeError?: Error;
}

export class MemoryWritable {
  readonly #chunks: Blob[] = [];
  #mimeType = '';

  constructor(
    private readonly onWrite: (blob: Blob) => void,
    private readonly options: MemoryWritableOptions = {}
  ) {}

  async write(value: Blob | ArrayBuffer | ArrayBufferView | string): Promise<void> {
    if (this.options.writeError) {
      throw this.options.writeError;
    }

    if (value instanceof Blob) {
      // 标准语义：写回一个已失效的 getFile() 快照会抛 NotReadableError
      const source = fileSnapshotSource.get(value);
      if (source && source.handle.currentBlob !== source.blobAtSnapshot) {
        throw new DOMException('The requested file could not be read', 'NotReadableError');
      }
      this.#mimeType ||= value.type;
      this.#chunks.push(value);
    } else if (value instanceof ArrayBuffer) {
      this.#chunks.push(new Blob([value]));
    } else if (ArrayBuffer.isView(value)) {
      const bytes = new Uint8Array(value.byteLength);
      bytes.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
      this.#chunks.push(new Blob([bytes.buffer]));
    } else {
      this.#chunks.push(new Blob([value]));
    }

    this.onWrite(new Blob(this.#chunks, { type: this.#mimeType }));
  }

  close(): Promise<void> {
    return this.options.closeError ? Promise.reject(this.options.closeError) : Promise.resolve();
  }
}

/**
 * 记录每个 `getFile()` 快照对应的来源句柄与当时的 blob。
 *
 * 用于在替身里复现 File System 标准的 **snapshot state** 语义：
 * `getFile()` 返回的 File 绑定调用那一刻的磁盘状态，文件此后被修改，该 File 即不可读。
 * 旧替身每次都从当前 blob 新建 File、永不失效 —— 这正是「补偿回滚用失效快照」
 * 这个缺陷长期没被测试抓到的原因。
 */
const fileSnapshotSource = new WeakMap<Blob, { handle: MemoryFileHandle; blobAtSnapshot: Blob }>();

export class MemoryFileHandle {
  #blob = new Blob([]);

  readonly kind = 'file' as const;

  /** 供快照失效判定读取当前磁盘内容 */
  get currentBlob(): Blob {
    return this.#blob;
  }

  constructor(
    private readonly fileName: string,
    private readonly writableOptions: MemoryWritableOptions = {}
  ) {}

  async createWritable(): Promise<MemoryWritable> {
    return new MemoryWritable(blob => {
      this.#blob = blob;
    }, this.writableOptions);
  }

  async getFile(): Promise<File> {
    const blobAtSnapshot = this.#blob;
    const file = new File([blobAtSnapshot], this.fileName, {
      type: blobAtSnapshot.type || 'application/octet-stream'
    });
    fileSnapshotSource.set(file, { handle: this, blobAtSnapshot });
    return file;
  }
}

export class MemoryDirectoryHandle {
  readonly kind = 'directory' as const;
  readonly directories = new Map<string, MemoryDirectoryHandle>();
  readonly files = new Map<string, MemoryFileHandle>();
  fileHandleFactory: (name: string) => MemoryFileHandle = name => new MemoryFileHandle(name);

  /**
   * 按**实时游标**推进，而不是先物化成数组。
   *
   * 真实的目录迭代器是按索引推进的活游标：迭代过程中删掉当前项，后续项会前移，
   * 下一次推进就跳过一项。旧替身用 `Array.from(...)` 提前物化，永远不会重现这种漏删 ——
   * 于是「边异步迭代边 removeEntry」的缺陷在测试里看不出来。
   */
  async *entries(): AsyncIterableIterator<[string, MemoryDirectoryHandle | MemoryFileHandle]> {
    const liveKeys = () => [
      ...Array.from(this.directories.keys()).sort((a, b) => a.localeCompare(b)),
      ...Array.from(this.files.keys()).sort((a, b) => a.localeCompare(b))
    ];

    for (let index = 0; index < liveKeys().length; index++) {
      const name = liveKeys()[index];
      const handle = this.directories.get(name) ?? this.files.get(name);
      if (!handle) continue;
      yield [name, handle];
    }
  }

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<MemoryDirectoryHandle> {
    if (!this.directories.has(name)) {
      if (!options?.create) {
        throw new DOMException('Directory not found', 'NotFoundError');
      }

      this.directories.set(name, new MemoryDirectoryHandle());
    }

    return this.directories.get(name)!;
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<MemoryFileHandle> {
    if (!this.files.has(name)) {
      if (!options?.create) {
        throw new DOMException('File not found', 'NotFoundError');
      }

      this.files.set(name, this.fileHandleFactory(name));
    }

    return this.files.get(name)!;
  }

  async removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> {
    if (this.files.delete(name)) {
      return;
    }

    if (!this.directories.has(name)) {
      throw new DOMException('Entry not found', 'NotFoundError');
    }

    if (!options?.recursive) {
      throw new DOMException('Recursive flag required', 'InvalidModificationError');
    }

    this.directories.delete(name);
  }
}

type FakeStorageMetaRule = {
  field: 'id' | 'opfsPath';
  value: string;
};

export class FakeStorageFileMeta {
  static store = new Map<string, FakeStorageFileMeta>();

  id: string;
  name!: string;
  mimeType!: string;
  size!: number;
  opfsPath!: string;
  contentVersion!: number;

  constructor(initData: Partial<FakeStorageFileMeta>) {
    this.id = initData.id || `meta-${FakeStorageFileMeta.store.size + 1}`;
    Object.assign(this, initData);
  }

  static reset(): void {
    FakeStorageFileMeta.store.clear();
  }
}

export type FakeStorageMetaEntityType = {
  new (initData: Partial<FakeStorageFileMeta>): FakeStorageFileMeta;
  store: Map<string, FakeStorageFileMeta>;
  reset(): void;
};

export class FakeRepository {
  constructor(private readonly EntityType: FakeStorageMetaEntityType) {}

  async find(options: { where?: { rules?: FakeStorageMetaRule[] }; limit?: number; offset?: number } = {}) {
    const rules = options.where?.rules ?? [];
    const matched = Array.from(this.EntityType.store.values()).filter(entity =>
      rules.every(rule => entity[rule.field] === rule.value)
    );

    const offset = options.offset ?? 0;
    if (typeof options.limit === 'number') {
      return matched.slice(offset, offset + options.limit);
    }

    return matched.slice(offset);
  }

  async create(entity: FakeStorageFileMeta): Promise<FakeStorageFileMeta> {
    this.EntityType.store.set(entity.id, entity);
    return entity;
  }

  async update(entity: FakeStorageFileMeta, patch: Partial<FakeStorageFileMeta>): Promise<FakeStorageFileMeta> {
    Object.assign(entity, patch);
    this.EntityType.store.set(entity.id, entity);
    return entity;
  }

  async remove(entity: FakeStorageFileMeta): Promise<FakeStorageFileMeta> {
    this.EntityType.store.delete(entity.id);
    return entity;
  }
}

/** 假 adapter：`getRepository` 恒返回同一个 {@link FakeRepository}。 */
export interface FakeAdapter {
  getRepository: Mock<() => FakeRepository>;
}

/** 假 RxDB：只提供 storage 用得到的 `config.sync.local.adapter` 与 `connect()`。 */
export interface FakeRxDB {
  config: { sync: { local: { adapter: string } } };
  connect: Mock<() => Promise<FakeAdapter>>;
}

/** {@link createService} 造出来的一套装置。 */
export interface MemoryStorageHarness {
  adapter: FakeAdapter;
  repository: FakeRepository;
  rxdb: FakeRxDB;
  service: RxdbFileStorage;
}

/**
 * 造一个接在假仓储上的 {@link RxdbFileStorage}。
 *
 * @remarks
 * 返回类型**必须显式写出**：`vi.fn()` 的推断类型引用了 `@vitest/spy` 内部的 `Procedure`，
 * 从 `.d.ts` 里指不到（TS2883），而本文件是被多个 spec 复用的导出模块，声明必须可发射。
 *
 * @param options - 插件选项；`rootDir` 缺省为 `files`
 * @param objectUrls - 对象 URL 注册表替身
 * @param entityType - metadata 实体类型替身
 * @param localAdapterName - `sync.local.adapter` 的取值。
 *   桌面后端据此判定是否允许启用（AC#9），因此后端不同这里就得跟着不同。
 */
export const createService = (
  options: RxDBStoragePluginOptions = {},
  objectUrls = new ObjectUrlRegistry(() => 'blob:x', vi.fn()),
  entityType: FakeStorageMetaEntityType = FakeStorageFileMeta,
  localAdapterName = 'sqlite'
): MemoryStorageHarness => {
  const repository = new FakeRepository(entityType);
  const adapter: FakeAdapter = {
    getRepository: vi.fn(() => repository)
  };
  const rxdb: FakeRxDB = {
    config: {
      sync: {
        local: {
          adapter: localAdapterName
        }
      }
    },
    connect: vi.fn(() => Promise.resolve(adapter))
  };

  const service = new RxdbFileStorage(
    rxdb as unknown as RxDB,
    { rootDir: 'files', ...options },
    entityType as unknown as typeof StorageFileMeta,
    objectUrls
  );

  return {
    adapter,
    repository,
    rxdb,
    service
  };
};
