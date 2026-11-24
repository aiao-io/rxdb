import { DiskPath, uniqueName } from './disk-path';
import { DiskError, DiskStore } from './disk-store';

/** 一次压缩的结果：归档文件名与完整字节。 */
export interface ZipResult {
  /** 归档文件名：单个条目是 `<名字>.zip`，多个条目是 `Archive.zip`。 */
  readonly name: string;
  /** 完整 ZIP 文件字节。 */
  readonly bytes: Uint8Array;
}

/** 压缩选项。 */
export interface ZipOptions {
  /** 目录条目没有自己的修改时间，用它兜底；默认 `Date.now`。 */
  readonly now?: () => number;
}

/** ZIP 里的一个条目。 */
interface ZipEntry {
  /** 以 `/` 分隔、UTF-8 编码的条目名；目录以 `/` 结尾。 */
  readonly name: string;
  /** 文件内容；目录为 `null`。 */
  readonly data: Uint8Array | null;
  /** DOS 格式的修改日期：`(年-1980)<<9 | 月<<5 | 日`。 */
  readonly date: number;
  /** DOS 格式的修改时间：`时<<11 | 分<<5 | 秒/2`。 */
  readonly time: number;
}

/** 中央目录里每个条目的记录。 */
interface CentralRecord {
  readonly entry: ZipEntry;
  readonly crc: number;
  readonly offset: number;
}

const encoder = new TextEncoder();

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

/** ZIP 的 CRC-32（多项式 0xEDB88320）；也用来校验归档内容。 */
export const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const dosDateTime = (time: number): { readonly date: number; readonly time: number } => {
  const moment = new Date(time);
  const date = ((moment.getFullYear() - 1980) << 9) | ((moment.getMonth() + 1) << 5) | moment.getDate();
  return { date, time: (moment.getHours() << 11) | (moment.getMinutes() << 5) | Math.floor(moment.getSeconds() / 2) };
};

/** 小端写手：把头部与内容攒成一段字节。 */
class ZipWriter {
  private readonly chunks: Uint8Array[] = [];
  private written = 0;

  get offset(): number {
    return this.written;
  }

  u16(value: number): void {
    this.chunks.push(Uint8Array.of(value & 0xff, (value >>> 8) & 0xff));
    this.written += 2;
  }

  u32(value: number): void {
    this.chunks.push(Uint8Array.of(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff));
    this.written += 4;
  }

  bytes(value: Uint8Array): void {
    this.chunks.push(value);
    this.written += value.byteLength;
  }

  build(): Uint8Array {
    const result = new Uint8Array(this.written);
    let at = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, at);
      at += chunk.byteLength;
    }
    return result;
  }
}

/** 顶层条目名：重名（忽略大小写）的先补上父目录名，还重名就追加序号。 */
function entryRoots(paths: readonly DiskPath[]): readonly string[] {
  const taken = new Set<string>();
  return paths.map(path => {
    const name = path.at(-1) ?? '';
    const parent = path.at(-2);
    let entry = name;
    if (taken.has(entry.toLowerCase()) && parent) entry = `${parent}/${entry}`;
    let index = 2;
    while (taken.has(entry.toLowerCase())) {
      const dot = entry.lastIndexOf('.');
      const stem = dot > 0 ? entry.slice(0, dot) : entry;
      const extension = dot > 0 ? entry.slice(dot) : '';
      entry = `${stem} ${index}${extension}`;
      index++;
    }
    taken.add(entry.toLowerCase());
    return entry;
  });
}

/** 递归收集条目；目录自己也是条目（名字以 `/` 结尾），隐藏条目一并收进。 */
async function collect(
  store: DiskStore,
  path: DiskPath,
  entryName: string,
  now: number,
  out: ZipEntry[]
): Promise<void> {
  const kind = await store.kindOf(path);
  if (!kind) throw new DiskError('ENOENT', path);
  if (kind === 'file') {
    const data = await store.read(path);
    out.push({ name: entryName, data, ...dosDateTime((await store.info(path)).modified) });
    return;
  }
  out.push({ name: `${entryName}/`, data: null, ...dosDateTime(now) });
  for (const child of await store.list(path))
    await collect(store, [...path, child.name], `${entryName}/${child.name}`, now, out);
}

const archiveName = (paths: readonly DiskPath[]): string =>
  paths.length === 1 ? `${paths[0].at(-1) ?? ''}.zip` : 'Archive.zip';

/**
 * 把一组文件或目录打成 ZIP：只存不压（method 0）、UTF-8 文件名、每个条目带 CRC-32 校验，目录递归收进。
 * 不写磁盘，只返回字节；落盘用 {@link compressToZipFile}。
 */
export async function compressToZip(
  store: DiskStore,
  paths: readonly DiskPath[],
  options: ZipOptions = {}
): Promise<ZipResult> {
  if (!paths.length) throw new Error('Select items to compress.');
  const now = options.now ?? Date.now;
  const roots = entryRoots(paths);
  const entries: ZipEntry[] = [];
  for (const [index, path] of paths.entries()) await collect(store, path, roots[index], now(), entries);

  const contentBytes = entries.reduce((sum, entry) => sum + (entry.data?.byteLength ?? 0), 0);
  if (contentBytes > 0xffffffff) throw new Error('The selection is larger than a ZIP archive can hold (4 GiB).');
  if (entries.some(entry => encoder.encode(entry.name).byteLength > 0xffff))
    throw new Error('An item name is too long for a ZIP archive.');

  const writer = new ZipWriter();
  const directory: CentralRecord[] = [];
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = entry.data ?? new Uint8Array();
    const crc = entry.data ? crc32(entry.data) : 0;
    const offset = writer.offset;
    writer.u32(0x04034b50);
    writer.u16(20);
    writer.u16(0x0800);
    writer.u16(0);
    writer.u16(entry.time);
    writer.u16(entry.date);
    writer.u32(crc);
    writer.u32(data.byteLength);
    writer.u32(data.byteLength);
    writer.u16(name.byteLength);
    writer.u16(0);
    writer.bytes(name);
    writer.bytes(data);
    directory.push({ entry, crc, offset });
  }
  const centralAt = writer.offset;
  for (const { entry, crc, offset } of directory) {
    const name = encoder.encode(entry.name);
    const size = entry.data?.byteLength ?? 0;
    writer.u32(0x02014b50);
    writer.u16(20);
    writer.u16(20);
    writer.u16(0x0800);
    writer.u16(0);
    writer.u16(entry.time);
    writer.u16(entry.date);
    writer.u32(crc);
    writer.u32(size);
    writer.u32(size);
    writer.u16(name.byteLength);
    writer.u16(0);
    writer.u16(0);
    writer.u16(0);
    writer.u16(0);
    writer.u32(entry.data ? 0 : 0x10);
    writer.u32(offset);
    writer.bytes(name);
  }
  const centralSize = writer.offset - centralAt;
  writer.u32(0x06054b50);
  writer.u16(0);
  writer.u16(0);
  writer.u16(directory.length);
  writer.u16(directory.length);
  writer.u32(centralSize);
  writer.u32(centralAt);
  writer.u16(0);

  return { name: archiveName(paths), bytes: writer.build() };
}

/** 打成 ZIP 并写进目标目录（归档与同级重名时追加序号），返回落盘路径。 */
export async function compressToZipFile(
  store: DiskStore,
  paths: readonly DiskPath[],
  dir: DiskPath,
  options: ZipOptions = {}
): Promise<DiskPath> {
  const kind = await store.kindOf(dir);
  if (kind !== 'directory')
    throw new DiskError(
      kind ? 'ENOTDIR' : 'ENOENT',
      dir,
      'The destination folder no longer exists. Choose another folder.'
    );
  const { name, bytes } = await compressToZip(store, paths, options);
  const target = [
    ...dir,
    uniqueName(
      (await store.list(dir)).map(entry => entry.name),
      name
    )
  ];
  await store.write(target, bytes);
  return target;
}
