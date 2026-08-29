/**
 * 内存版 OPFS：只实现 provider 真正用到的那几个 handle 方法。
 *
 * 刻意**不**装成完整的 File System Access API——补全没用到的方法会让「provider 依赖了什么」
 * 从测试里消失，而这正是这份替身要暴露的东西。用到的方法一旦改名，这里立刻编译失败。
 */

interface FakeFile {
  readonly kind: 'file';
  bytes: Uint8Array;
  lastModified: number;
}

interface FakeDirectory {
  readonly kind: 'directory';
  readonly children: Map<string, FakeNode>;
}

type FakeNode = FakeFile | FakeDirectory;

/** 测试侧的观察与播种入口。 */
export interface FakeOpfsRoot {
  readonly handle: FileSystemDirectoryHandle;
  writeFile(path: string, size: number): void;
  mkdir(path: string): void;
  exists(path: string): boolean;
  fileSize(path: string): number;
}

function directory(): FakeDirectory {
  return { kind: 'directory', children: new Map() };
}

function notFound(): DOMException {
  return new DOMException('missing', 'NotFoundError');
}

function typeMismatch(): DOMException {
  return new DOMException('kind mismatch', 'TypeMismatchError');
}

function segmentsOf(path: string): string[] {
  return path.split('/').filter(Boolean);
}

/** 把一个内存目录包装成 provider 看得见的 handle。 */
function wrapDirectory(name: string, node: FakeDirectory): FileSystemDirectoryHandle {
  const handle = {
    kind: 'directory' as const,
    name,
    async *entries(): AsyncIterableIterator<[string, FileSystemHandle]> {
      // 排序后交出：Map 的插入序会让「列表顺序」变成播种顺序的函数。
      for (const key of [...node.children.keys()].sort()) {
        const child = node.children.get(key);
        if (child === undefined) continue;
        yield [key, (child.kind === 'directory' ? wrapDirectory(key, child) : wrapFile(key, child)) as FileSystemHandle];
      }
    },
    getDirectoryHandle: (childName: string, options?: { create?: boolean }) => {
      const existing = node.children.get(childName);
      if (existing !== undefined) {
        if (existing.kind !== 'directory') return Promise.reject(typeMismatch());
        return Promise.resolve(wrapDirectory(childName, existing));
      }
      if (options?.create !== true) return Promise.reject(notFound());
      const created = directory();
      node.children.set(childName, created);
      return Promise.resolve(wrapDirectory(childName, created));
    },
    getFileHandle: (childName: string, options?: { create?: boolean }) => {
      const existing = node.children.get(childName);
      if (existing !== undefined) {
        if (existing.kind !== 'file') return Promise.reject(typeMismatch());
        return Promise.resolve(wrapFile(childName, existing));
      }
      if (options?.create !== true) return Promise.reject(notFound());
      const created: FakeFile = { kind: 'file', bytes: new Uint8Array(0), lastModified: 0 };
      node.children.set(childName, created);
      return Promise.resolve(wrapFile(childName, created));
    },
    removeEntry: (childName: string) => {
      if (!node.children.delete(childName)) return Promise.reject(notFound());
      return Promise.resolve();
    }
  };
  return handle as unknown as FileSystemDirectoryHandle;
}

function wrapFile(name: string, node: FakeFile): FileSystemFileHandle {
  const handle = {
    kind: 'file' as const,
    name,
    // 真实 `getFile()` 交出的是 Blob；这里额外带上 `bytes`，好让 writable 把
    // 「写一整个 Blob」这条真实路径也落到内存里（provider 的 commit 正是这么搬运的）。
    getFile: () =>
      Promise.resolve({
        name,
        size: node.bytes.byteLength,
        lastModified: node.lastModified,
        bytes: node.bytes
      } as unknown as File),
    createWritable: () => {
      const chunks: Uint8Array[] = [];
      return Promise.resolve({
        write: (data: Uint8Array | { bytes: Uint8Array }) => {
          chunks.push(data instanceof Uint8Array ? data : data.bytes);
          return Promise.resolve();
        },
        close: () => {
          const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
          const merged = new Uint8Array(total);
          let offset = 0;
          for (const chunk of chunks) {
            merged.set(chunk, offset);
            offset += chunk.byteLength;
          }
          node.bytes = merged;
          return Promise.resolve();
        },
        abort: () => Promise.resolve()
      } as unknown as FileSystemWritableFileStream);
    }
  };
  return handle as unknown as FileSystemFileHandle;
}

/**
 * 建一个空的内存 OPFS 根。
 *
 * @returns 可播种、可观察的根。
 */
export function createFakeOpfsRoot(): FakeOpfsRoot {
  const root = directory();

  const resolve = (segments: readonly string[], create: boolean): FakeDirectory | undefined => {
    let current = root;
    for (const segment of segments) {
      const next = current.children.get(segment);
      if (next?.kind === 'directory') {
        current = next;
        continue;
      }
      if (next !== undefined || !create) return undefined;
      const created = directory();
      current.children.set(segment, created);
      current = created;
    }
    return current;
  };

  const lookup = (path: string): FakeNode | undefined => {
    const segments = segmentsOf(path);
    const name = segments.pop();
    if (name === undefined) return root;
    return resolve(segments, false)?.children.get(name);
  };

  return {
    handle: wrapDirectory('', root),
    writeFile: (path, size) => {
      const segments = segmentsOf(path);
      const name = segments.pop() ?? '';
      const parent = resolve(segments, true);
      parent?.children.set(name, { kind: 'file', bytes: new Uint8Array(size), lastModified: 0 });
    },
    mkdir: path => {
      resolve(segmentsOf(path), true);
    },
    exists: path => lookup(path) !== undefined,
    fileSize: path => {
      const node = lookup(path);
      return node?.kind === 'file' ? node.bytes.byteLength : -1;
    }
  };
}
