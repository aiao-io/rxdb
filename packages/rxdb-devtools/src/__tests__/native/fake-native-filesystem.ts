/**
 * @fileoverview 原生文件后端的内存替身，供 `native-files-provider.spec.ts` 使用。
 *
 * @remarks
 * 它**只按段序列寻址**，内部完全不做路径解析——这正是被测契约要求的形状。如果替身自己也
 * 把段拼回字符串再切开，那么「provider 挡住了逃逸路径」这条断言就会因为替身的解析行为
 * 而变得不可信。
 *
 * 另外它记账：`opened` 记录真正打开过的读写句柄，用来断言「流没开起来时一个句柄都不开」。
 */

import type { DevToolsNativeEntry, DevToolsNativeFilesystem } from '../../native/native-files-provider.js';
import type { DevToolsChunkSink, DevToolsChunkSource } from '../../provider/types.js';

/** 内存替身；额外暴露种子方法与句柄记账。 */
export interface FakeNativeFilesystem extends DevToolsNativeFilesystem {
  /** 种一个文件；内容是 `size` 个由下标派生的字节，便于逐字节比对。 */
  seedFile(segments: readonly string[], size: number): void;
  /** 种一个目录。 */
  seedDirectory(segments: readonly string[]): void;
  /** 读回已提交的文件内容；未提交或不存在时为 `undefined`。 */
  contentOf(segments: readonly string[]): Uint8Array | undefined;
  /** 至今打开过的读写句柄数。 */
  readonly opened: { read: number; write: number };
  /** 尚未提交也未丢弃的临时产物条数。 */
  pendingTemporaries(): number;
}

/** 按下标派生字节，好让断言能查「字节一致」而不是只查长度。 */
function bytesOf(size: number): Uint8Array {
  const data = new Uint8Array(size);
  for (let index = 0; index < size; index += 1) data[index] = (index * 7 + 3) % 256;
  return data;
}

/** 段之间用 NUL 连接：名字里可以有空格、点与斜杠，但不会有 NUL。 */
const SEPARATOR = '\u0000';

function keyOf(segments: readonly string[]): string {
  return segments.join(SEPARATOR);
}

function segmentsOf(key: string): readonly string[] {
  return key.length === 0 ? [] : key.split(SEPARATOR);
}

/**
 * 建一个内存原生文件系统替身。
 *
 * @returns 可直接交给 provider 的替身。
 */
export function createFakeNativeFilesystem(): FakeNativeFilesystem {
  const files = new Map<string, Uint8Array>();
  const directories = new Set<string>([keyOf([])]);
  const temporaries = new Set<string>();
  const opened = { read: 0, write: 0 };

  function ensureParents(segments: readonly string[]): void {
    for (let depth = 0; depth < segments.length; depth += 1) {
      directories.add(keyOf(segments.slice(0, depth)));
    }
  }

  function entryOf(segments: readonly string[]): DevToolsNativeEntry | undefined {
    const key = keyOf(segments);
    const name = segments.at(-1) ?? '';
    const file = files.get(key);
    if (file !== undefined) return { name, kind: 'file', size: file.byteLength, lastModified: 1 };
    if (directories.has(key)) return { name, kind: 'directory', size: 0, lastModified: 1 };
    return undefined;
  }

  /** 直属子项的名字：所有 key 恰好比 `segments` 多一段的条目。 */
  function childNames(segments: readonly string[]): readonly string[] {
    const names = new Set<string>();
    for (const key of [...files.keys(), ...directories]) {
      const parts = segmentsOf(key);
      if (parts.length !== segments.length + 1) continue;
      if (keyOf(parts.slice(0, -1)) !== keyOf(segments)) continue;
      const last = parts.at(-1);
      if (last !== undefined) names.add(last);
    }
    return [...names].sort();
  }

  function notFound(): Error {
    return Object.assign(new Error('missing'), { code: 'ENOENT' });
  }

  return {
    opened,

    seedFile(segments, size) {
      ensureParents(segments);
      files.set(keyOf(segments), bytesOf(size));
    },

    seedDirectory(segments) {
      ensureParents(segments);
      directories.add(keyOf(segments));
    },

    contentOf(segments) {
      return files.get(keyOf(segments));
    },

    pendingTemporaries() {
      return temporaries.size;
    },

    list(segments) {
      if (!directories.has(keyOf(segments))) return Promise.reject(notFound());
      const entries = childNames(segments).map(name => entryOf([...segments, name]));
      return Promise.resolve(entries.filter((entry): entry is DevToolsNativeEntry => entry !== undefined));
    },

    stat(segments) {
      return Promise.resolve(entryOf(segments));
    },

    createDirectory(segments) {
      ensureParents(segments);
      directories.add(keyOf(segments));
      return Promise.resolve();
    },

    remove(segments) {
      const prefix = keyOf(segments);
      const owned = (key: string): boolean => key === prefix || key.startsWith(prefix + SEPARATOR);
      for (const key of [...files.keys()]) if (owned(key)) files.delete(key);
      for (const key of [...directories]) if (owned(key)) directories.delete(key);
      return Promise.resolve();
    },

    openRead(segments) {
      const content = files.get(keyOf(segments));
      if (content === undefined) return Promise.reject(notFound());
      opened.read += 1;
      const source: DevToolsChunkSource = {
        totalBytes: content.byteLength,
        read(offset, length) {
          return Promise.resolve(content.slice(offset, offset + length));
        },
        close() {
          return Promise.resolve();
        }
      };
      return Promise.resolve(source);
    },

    openWrite(segments) {
      opened.write += 1;
      const temporaryKey = keyOf(segments) + SEPARATOR + 'tmp';
      temporaries.add(temporaryKey);
      const chunks: Uint8Array[] = [];

      const sink: DevToolsChunkSink = {
        write(data) {
          // 临时产物在 commit 之前对读者不可见：字节只攒在这里，不进 `files`。
          chunks.push(data.slice());
          return Promise.resolve();
        },
        commit() {
          const merged = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
          let offset = 0;
          for (const chunk of chunks) {
            merged.set(chunk, offset);
            offset += chunk.byteLength;
          }
          ensureParents(segments);
          files.set(keyOf(segments), merged);
          temporaries.delete(temporaryKey);
          return Promise.resolve();
        },
        discard() {
          chunks.length = 0;
          temporaries.delete(temporaryKey);
          return Promise.resolve();
        }
      };
      return Promise.resolve(sink);
    }
  };
}

/** 供断言使用的同一套派生字节。 */
export function expectedBytes(size: number): Uint8Array {
  return bytesOf(size);
}
