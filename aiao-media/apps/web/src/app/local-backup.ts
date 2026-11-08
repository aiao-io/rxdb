import { strFromU8, strToU8, unzip, zip, type AsyncZippable, type Unzipped } from 'fflate';
import { imageExtension, imageMetadata, validateImageBlob } from '../contracts/image-format';
import type { GenerationJobSummary } from '../contracts/index';
import { validateGenerationJobSummary } from '../contracts/index';
import type { LocalMediaStore, StudioPromptState } from '../local-data/index';
import { ownedStudioPrompt } from '../local-data/studio-draft';
import { publicProvider, type LocalProvider } from './local-provider';
type Task = GenerationJobSummary & {
  channel?: 'direct' | 'proxy' | 'platform';
  saved?: boolean;
  acknowledged?: boolean;
};
interface BackupImage {
  job: GenerationJobSummary;
  sha256: string;
}
interface LegacyBackupImage extends BackupImage {
  base64: string;
}
interface ArchivedBackupImage extends BackupImage {
  path: string;
}
interface BackupContent {
  format: 'aiao-local-backup';
  createdAt: string;
  providers: LocalProvider[];
  defaultId: string;
  draft: StudioPromptState | null;
  tasks: Task[];
}
export type LocalBackup = BackupContent &
  ({ version: 1; images: LegacyBackupImage[] } | { version: 2; images: ArchivedBackupImage[] });
const limit = 64 * 1024 * 1024;
const imageLimit = 16 * 1024 * 1024;
const archiveImagePath =
  /^images\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg)$/i;
const digest = async (blob: Blob) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), b =>
    b.toString(16).padStart(2, '0')
  ).join('');
function imageJob(
  id: string,
  image: { prompt: string; modelId: string; providerInstanceId: string },
  createdAt: string
): GenerationJobSummary {
  return {
    id,
    request: {
      kind: 'image',
      operation: 'text-to-image',
      providerRevision: 1,
      providerInstanceId: image.providerInstanceId,
      modelId: image.modelId,
      prompt: image.prompt
    },
    status: 'completed',
    createdAt,
    updatedAt: createdAt,
    delivery: { status: 'available', expiresAt: null, acknowledgedAt: null },
    failure: null
  };
}
const backupProvider = (p: unknown): LocalProvider => ({
  ...publicProvider(p),
  rememberKey: false
});
function validateBackup(data: LocalBackup): LocalBackup {
  if (
    !data ||
    data.format !== 'aiao-local-backup' ||
    ![1, 2].includes(data.version) ||
    !Array.isArray(data.providers) ||
    data.providers.length > 30 ||
    !Array.isArray(data.tasks) ||
    data.tasks.length > 100 ||
    !Array.isArray(data.images)
  )
    throw new Error('不支持的备份格式或版本。');
  data.providers = data.providers.map(backupProvider);
  if (
    typeof data.defaultId !== 'string' ||
    new Set(data.providers.map(p => p.id)).size !== data.providers.length ||
    (data.defaultId && !data.providers.some(p => p.id === data.defaultId))
  )
    throw new Error('备份供应商 ID 无效或重复。');
  data.draft = data.draft ? ownedStudioPrompt(data.draft) : null;
  data.tasks = data.tasks.map(t => {
    const { saved, acknowledged, channel, ...summary } = t;
    if (channel !== undefined && !['direct', 'proxy', 'platform'].includes(channel))
      throw new Error('备份任务通道无效。');
    return {
      channel: channel ?? 'direct',
      ...validateGenerationJobSummary(summary),
      ...(saved ? { saved: true } : {}),
      ...(acknowledged ? { acknowledged: true } : {})
    };
  });
  if (new Set(data.tasks.map(t => t.id)).size !== data.tasks.length) throw new Error('备份任务 ID 重复。');
  const ids = new Set<string>();
  for (const image of data.images) {
    image.job = validateGenerationJobSummary(image.job);
    if (
      image.job.status !== 'completed' ||
      image.job.request.kind !== 'image' ||
      ids.has(image.job.id) ||
      typeof image.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(image.sha256)
    )
      throw new Error('备份图片格式无效或 ID 重复。');
    ids.add(image.job.id);
  }
  if (data.version === 1) data.images.forEach(validateLegacyImage);
  else data.images.forEach(validateArchivedImage);
  return data;
}
function validateLegacyImage(image: LegacyBackupImage): void {
  if (
    typeof image.base64 !== 'string' ||
    image.base64.length > 23 * 1024 * 1024 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(image.base64)
  )
    throw new Error('备份图片格式无效。');
}
function validateArchivedImage(image: ArchivedBackupImage): void {
  if (image.path !== `images/${image.job.id}.png` && image.path !== `images/${image.job.id}.jpg`)
    throw new Error('备份图片路径无效。');
}
function createArchive(files: AsyncZippable): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    zip(files, (error, result) => (error ? reject(error) : resolve(result)));
  });
}
function readArchive(bytes: Uint8Array): Promise<Unzipped> {
  const names = new Set<string>();
  let total = 0;
  let invalid: Error | null = null;
  return new Promise((resolve, reject) => {
    unzip(
      bytes,
      {
        filter: entry => {
          total += entry.originalSize;
          if (total > limit) invalid = new Error('备份解压后不能超过 64 MiB。');
          if (entry.name === 'images/' && entry.originalSize === 0) return false;
          if (names.has(entry.name) || (entry.name !== 'backup.json' && !archiveImagePath.test(entry.name)))
            invalid = new Error('备份 ZIP 包含无效或重复路径。');
          if (entry.compression === 0 && entry.originalSize !== entry.size)
            invalid = new Error('备份 ZIP 文件大小与声明不一致。');
          if (entry.name !== 'backup.json' && entry.originalSize > imageLimit)
            invalid = new Error('备份图片超过大小限制。');
          names.add(entry.name);
          return invalid === null;
        }
      },
      (error, result) => {
        if (invalid) return reject(invalid);
        if (error) return reject(new Error('备份 ZIP 已损坏或格式无效。'));
        const size = Object.values(result).reduce((sum, content) => sum + content.byteLength, 0);
        if (size > limit) return reject(new Error('备份解压后不能超过 64 MiB。'));
        resolve(result);
      }
    );
  });
}
export async function createLocalBackup(
  store: LocalMediaStore,
  providers: LocalProvider[],
  defaultId: string,
  tasks: Task[]
): Promise<Blob> {
  const images: ArchivedBackupImage[] = [];
  const files: AsyncZippable = {};
  let total = 0;
  for (const work of await store.list()) {
    const image = await store.backupImage(work.jobId);
    total += image.blob.size;
    if (total > limit) throw new Error('备份超过 64 MiB，请先单独下载部分作品。');
    const bytes = new Uint8Array(await image.blob.arrayBuffer());
    const path = `images/${work.jobId}.${imageExtension(imageMetadata(bytes).mimeType)}`;
    files[path] = [bytes, { level: 0 }];
    images.push({
      job: imageJob(work.jobId, image, work.createdAt ?? new Date().toISOString()),
      path,
      sha256: await digest(image.blob)
    });
  }
  const backup = validateBackup({
    format: 'aiao-local-backup',
    version: 2,
    createdAt: new Date().toISOString(),
    providers: providers.map(backupProvider),
    defaultId,
    draft: (await store.studioDraft())?.state ?? null,
    tasks: tasks.map(t => ({
      ...(t.channel ? { channel: t.channel } : {}),
      ...validateGenerationJobSummary({
        id: t.id,
        request: t.request,
        status: t.status,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        delivery: t.delivery,
        failure: t.failure
      }),
      ...(t.saved ? { saved: true } : {}),
      ...(t.acknowledged ? { acknowledged: true } : {})
    })),
    images
  });
  const manifest = strToU8(JSON.stringify(backup, null, 2));
  if (total + manifest.byteLength > limit) throw new Error('备份解压后不能超过 64 MiB。');
  files['backup.json'] = manifest;
  const blob = new Blob([await createArchive(files)], { type: 'application/zip' });
  if (blob.size > limit) throw new Error('备份超过 64 MiB。');
  return blob;
}
export async function readLocalBackup(file: File): Promise<{ backup: LocalBackup; files: Blob[]; digest: string }> {
  if (file.size > limit) throw new Error('备份文件不能超过 64 MiB。');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const archive = bytes[0] === 0x50 && bytes[1] === 0x4b ? await readArchive(bytes) : null;
  if (archive && !archive['backup.json']) throw new Error('备份 ZIP 缺少 backup.json。');
  const data = validateBackup(JSON.parse(strFromU8(archive ? archive['backup.json'] : bytes)));
  if ((archive && data.version !== 2) || (!archive && data.version !== 1)) throw new Error('备份格式与版本不一致。');
  if (archive && Object.keys(archive).length !== data.images.length + 1)
    throw new Error('备份 ZIP 文件与图片清单不一致。');
  const sources =
    data.version === 1 ?
      data.images.map(image => Uint8Array.from(atob(image.base64), c => c.charCodeAt(0)))
    : data.images.map(image => {
        const content = archive?.[image.path];
        if (!content) throw new Error('备份图片文件缺失。');
        return content;
      });
  const files: Blob[] = [];
  for (const [index, image] of data.images.entries()) {
    const bytes = sources[index];
    if (bytes.byteLength > imageLimit) throw new Error('备份图片超过大小限制。');
    const { mimeType } = imageMetadata(bytes);
    if (data.version === 2 && data.images[index].path !== `images/${image.job.id}.${imageExtension(mimeType)}`)
      throw new Error('备份图片后缀与真实格式不一致。');
    const blob = new Blob([new Uint8Array(bytes)], { type: mimeType });
    if ((await digest(blob)) !== image.sha256) throw new Error('备份图片校验失败，原数据未更改。');
    await validateImageBlob(blob);
    files.push(blob);
  }
  return { backup: data, files, digest: await digest(file) };
}
