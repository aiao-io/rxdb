import { SEED_VERSION } from '../disk/disk-volume';

export interface AuditedDesktopFile {
  readonly id: string;
  readonly parentId?: string | null;
  readonly name: string;
  readonly type: 'file' | 'folder';
  readonly size: number;
  readonly contentId: string | null;
}

export interface AuditedStorageMeta {
  readonly id: string;
  readonly opfsPath: string;
  readonly size: number;
}

export interface AuditedStorageBody {
  readonly path: string;
  readonly size: number;
}

export interface DesktopStorageAudit {
  readonly issues: readonly string[];
  readonly orphanMetaIds: readonly string[];
  readonly orphanPaths: readonly string[];
  readonly files: number;
  readonly bytes: number;
}

function checkParents(file: AuditedDesktopFile, rows: ReadonlyMap<string, AuditedDesktopFile>): string | null {
  const seen = new Set([file.id]);
  let id = file.parentId;
  while (id != null) {
    const parent = rows.get(id);
    if (!parent || parent.type !== 'folder') return `Invalid parent directory: ${file.name}`;
    if (seen.has(id)) return `Directory cycle: ${file.name}`;
    seen.add(id);
    id = parent.parentId;
  }
  return null;
}

/** 只识别明确无引用的桌面文件体；其他存储域的所有权由其应用决定。 */
export function auditDesktopStorage(
  files: readonly AuditedDesktopFile[],
  metas: readonly AuditedStorageMeta[],
  bodies: readonly AuditedStorageBody[]
): DesktopStorageAudit {
  const issues: string[] = [];
  const rows = new Map(files.map(file => [file.id, file]));
  const metadata = new Map(metas.map(meta => [meta.id, meta]));
  const bodyMap = new Map(bodies.map(body => [body.path, body]));
  const paths = new Set(metas.map(meta => meta.opfsPath));
  const names = files.map(file => JSON.stringify([file.parentId ?? null, file.name]));
  if (rows.size !== files.length || new Set(names).size !== files.length)
    issues.push('Duplicate file identity or name.');
  if (metadata.size !== metas.length || paths.size !== metas.length) issues.push('Duplicate storage identity or path.');
  for (const file of files) {
    const parentIssue = checkParents(file, rows);
    if (parentIssue) issues.push(parentIssue);
    const meta = file.contentId ? metadata.get(file.contentId) : undefined;
    if (file.type === 'folder' && (file.contentId || file.size !== 0))
      issues.push(`Directory has content: ${file.name}`);
    if (file.contentId && !meta) issues.push(`File content is missing: ${file.name}`);
    if (file.type === 'file' && !file.contentId && file.size !== 0) issues.push(`File has no content: ${file.name}`);
    if (meta && meta.size !== file.size) issues.push(`File size does not match content: ${file.name}`);
  }
  for (const meta of metas) {
    const body = bodyMap.get(meta.opfsPath);
    if (!body) issues.push(`Storage body is missing: ${meta.opfsPath}`);
    else if (body.size !== meta.size) issues.push(`Storage body size does not match: ${meta.opfsPath}`);
  }
  const referenced = new Set(files.flatMap(file => (file.contentId ? [file.contentId] : [])));
  return {
    issues,
    orphanMetaIds: metas
      .filter(meta => meta.opfsPath.startsWith('blobs/') && !referenced.has(meta.id))
      .map(meta => meta.id),
    orphanPaths: bodies.filter(body => body.path.startsWith('blobs/') && !paths.has(body.path)).map(body => body.path),
    files: files.filter(file => file.type === 'file').length,
    bytes: bodies.reduce((sum, body) => sum + body.size, 0)
  };
}

/** 恢复后不能再触发卷重建或中断批次回滚，否则验证过的内容会在首次挂载时改变。 */
export function assertCompletedDiskState(preferences: readonly { key: string; value: unknown }[]): void {
  const marker = preferences.find(row => row.key === 'seed:disk')?.value;
  const value = marker as { version?: unknown; seededAt?: unknown } | null;
  if (
    value?.version !== SEED_VERSION ||
    !Number.isFinite(value.seededAt) ||
    preferences.some(row => row.key === 'disk:pending-batch' || row.key === 'apps:pending-projection')
  )
    throw new Error('The backup contains an unfinished disk operation. Reopen the source desktop before exporting.');
}
