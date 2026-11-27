/** 产品归档的内存处理上限；包含数据库、清单与全部文件体。 */
export const MAX_DESKTOP_BACKUP_BYTES = 256 * 1024 * 1024;
const MAX_HEADER_BYTES = 4 * 1024 * 1024;
const MAGIC = new TextEncoder().encode('AIAO-DESKTOP-BACKUP/1\n');
const PREFIX_BYTES = MAGIC.length + 4;
const DIGEST_BYTES = 32;
const MIME = 'application/vnd.aiao.desktop-backup';

export type DesktopBackupErrorCode = 'invalid_archive' | 'incompatible_version' | 'too_large';

/** 对用户可解释的归档格式错误；恢复前发生，不涉及当前存储写入。 */
export class DesktopBackupError extends Error {
  constructor(
    readonly code: DesktopBackupErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'DesktopBackupError';
  }
}

export interface DesktopBackupFile {
  readonly path: readonly string[];
  readonly blob: Blob;
}

interface ArchiveEntry {
  readonly path: readonly string[];
  readonly size: number;
  readonly sha256: string;
}

export interface DesktopBackupManifest {
  readonly format: 'aiao-desktop-backup';
  readonly formatVersion: 1;
  readonly schema: number;
  readonly createdAt: string;
  readonly sourceOrigin: string;
  readonly entries: readonly ArchiveEntry[];
}

export interface DesktopBackupInput {
  readonly schema: number;
  readonly createdAt: string;
  readonly sourceOrigin: string;
  readonly database: Blob;
  readonly files: readonly DesktopBackupFile[];
}

export interface DecodedDesktopBackup {
  readonly manifest: DesktopBackupManifest;
  readonly database: Blob;
  readonly files: readonly DesktopBackupFile[];
}

const invalid = (message: string): never => {
  throw new DesktopBackupError('invalid_archive', message);
};
const limited = (bytes: number): void => {
  if (bytes > MAX_DESKTOP_BACKUP_BYTES)
    throw new DesktopBackupError(
      'too_large',
      'Desktop backups are limited to 256 MiB. Export fewer files before trying again.'
    );
};
const digest = async (bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice()));
const hex = (bytes: Uint8Array): string => [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ?
    (value as Record<string, unknown>)
  : invalid('The backup manifest is invalid.');

function validSegment(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 255 &&
    value !== '.' &&
    value !== '..' &&
    !/[/\\]/.test(value) &&
    ![...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  );
}

function entryOf(value: unknown): ArchiveEntry {
  const entry = record(value);
  const path: unknown = entry['path'];
  if (!Array.isArray(path) || !path.length || path.length > 65 || !path.every(validSegment))
    return invalid('The backup contains an invalid file path.');
  const size = entry['size'];
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0)
    return invalid('The backup contains an invalid file size.');
  const sha256 = entry['sha256'];
  if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256))
    return invalid('The backup contains an invalid checksum.');
  return { path, size, sha256 };
}

function validOrigin(origin: unknown): origin is string {
  if (typeof origin !== 'string') return false;
  try {
    const parsed = new URL(origin);
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.origin === origin;
  } catch {
    return false;
  }
}

function manifestOf(value: unknown): DesktopBackupManifest {
  const manifest = record(value);
  if (manifest['format'] !== 'aiao-desktop-backup') return invalid('This file is not a desktop backup.');
  if (manifest['formatVersion'] !== 1)
    throw new DesktopBackupError('incompatible_version', 'This backup format needs a different desktop version.');
  const schema = manifest['schema'];
  const createdAt = manifest['createdAt'];
  const sourceOrigin = manifest['sourceOrigin'];
  if (typeof schema !== 'number' || !Number.isSafeInteger(schema) || schema < 1)
    return invalid('The backup has no valid data version.');
  if (typeof createdAt !== 'string' || !Number.isFinite(Date.parse(createdAt)) || !validOrigin(sourceOrigin))
    return invalid('The backup creation time or source is invalid.');
  if (!Array.isArray(manifest['entries']) || !manifest['entries'].length) return invalid('The backup has no database.');
  const entries = manifest['entries'].map(entryOf);
  if (entries[0].path.length !== 1 || entries[0].path[0] !== 'database.rxdb' || !entries[0].size)
    return invalid('The backup has no database.');
  if (entries.slice(1).some(entry => entry.path[0] !== 'files' || entry.path.length < 2))
    return invalid('The backup contains an invalid file location.');
  const paths = entries.map(entry => JSON.stringify(entry.path));
  const uniquePaths = new Set(paths);
  if (uniquePaths.size !== paths.length) return invalid('The backup contains duplicate files.');
  for (const entry of entries) {
    if (entry.path.some((_, index) => index > 0 && uniquePaths.has(JSON.stringify(entry.path.slice(0, index)))))
      return invalid('The backup uses the same location as both a file and a directory.');
  }
  limited(entries.reduce((sum, entry) => sum + entry.size, 0));
  return { format: 'aiao-desktop-backup', formatVersion: 1, schema, createdAt, sourceOrigin, entries };
}

/** 同一快照的数据库归档与文件体，封装为带校验的产品备份；不包含远程应用与运行时缓存。 */
export async function encodeDesktopBackup(input: DesktopBackupInput): Promise<Blob> {
  const sources = [
    { path: ['database.rxdb'], blob: input.database },
    ...input.files.map(file => ({ path: ['files', ...file.path], blob: file.blob }))
  ];
  const proposed = {
    format: 'aiao-desktop-backup',
    formatVersion: 1,
    schema: input.schema,
    createdAt: input.createdAt,
    sourceOrigin: input.sourceOrigin,
    entries: sources.map(source => ({ path: source.path, size: source.blob.size, sha256: '0'.repeat(64) }))
  };
  manifestOf(proposed);
  const entries: ArchiveEntry[] = [];
  const bodies: Blob[] = [];
  for (const source of sources) {
    const bytes = new Uint8Array(await source.blob.arrayBuffer());
    entries.push({ path: source.path, size: bytes.length, sha256: hex(await digest(bytes)) });
    bodies.push(new Blob([bytes]));
  }
  const header = new TextEncoder().encode(JSON.stringify({ ...proposed, entries }));
  if (header.length > MAX_HEADER_BYTES) throw new DesktopBackupError('too_large', 'The backup file list is too large.');
  const prefix = new Uint8Array(PREFIX_BYTES);
  prefix.set(MAGIC);
  new DataView(prefix.buffer).setUint32(MAGIC.length, header.length, true);
  const archive = new Blob([prefix, header, ...bodies, await digest(header)], { type: MIME });
  limited(archive.size);
  return archive;
}

async function readManifest(archive: Blob): Promise<{ manifest: DesktopBackupManifest; bodyStart: number }> {
  limited(archive.size);
  if (archive.size < PREFIX_BYTES + DIGEST_BYTES) return invalid('The backup is truncated or not a desktop backup.');
  const prefix = new Uint8Array(await archive.slice(0, PREFIX_BYTES).arrayBuffer());
  if (!MAGIC.every((byte, index) => prefix[index] === byte)) return invalid('This file is not a desktop backup.');
  const length = new DataView(prefix.buffer).getUint32(MAGIC.length, true);
  if (!length || length > MAX_HEADER_BYTES || PREFIX_BYTES + length > archive.size - DIGEST_BYTES)
    return invalid('The backup manifest is truncated or too large.');
  const header = new Uint8Array(await archive.slice(PREFIX_BYTES, PREFIX_BYTES + length).arrayBuffer());
  const footer = new Uint8Array(await archive.slice(archive.size - DIGEST_BYTES).arrayBuffer());
  if (hex(await digest(header)) !== hex(footer)) return invalid('The backup manifest checksum does not match.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(header));
  } catch {
    return invalid('The backup manifest is not valid UTF-8 JSON.');
  }
  return { manifest: manifestOf(parsed), bodyStart: PREFIX_BYTES + length };
}

/** 完整验证后才交出数据库与文件体；返回的 Blob 是校验过的字节，不继续依赖可变的本机文件。 */
export async function decodeDesktopBackup(archive: Blob, schema: number): Promise<DecodedDesktopBackup> {
  const { manifest, bodyStart } = await readManifest(archive);
  if (manifest.schema !== schema)
    throw new DesktopBackupError(
      'incompatible_version',
      `This backup uses data version ${manifest.schema}; open it with a matching desktop version.`
    );
  const total = manifest.entries.reduce((sum, entry) => sum + entry.size, bodyStart + DIGEST_BYTES);
  if (total !== archive.size) return invalid('The backup is truncated or contains unexpected data.');
  let offset = bodyStart;
  const bodies: Blob[] = [];
  for (const entry of manifest.entries) {
    const bytes = new Uint8Array(await archive.slice(offset, offset + entry.size).arrayBuffer());
    if (hex(await digest(bytes)) !== entry.sha256)
      return invalid(`The backup content checksum does not match: ${entry.path.join('/')}`);
    bodies.push(new Blob([bytes]));
    offset += entry.size;
  }
  return {
    manifest,
    database: bodies[0],
    files: manifest.entries.slice(1).map((entry, index) => ({ path: entry.path.slice(1), blob: bodies[index + 1] }))
  };
}
