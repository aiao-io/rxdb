import { imageMetadata, validateImageBlob } from '../contracts/image-format';
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
  base64: string;
  sha256: string;
}
export interface LocalBackup {
  format: 'aiao-local-backup';
  version: 1;
  createdAt: string;
  providers: LocalProvider[];
  defaultId: string;
  draft: StudioPromptState | null;
  tasks: Task[];
  images: BackupImage[];
}
const limit = 64 * 1024 * 1024;
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
// Use an allowlist of public fields; restored configurations never remember a Key.
const backupProvider = (p: unknown): LocalProvider => ({
  ...publicProvider(p),
  rememberKey: false
});
function validateBackup(data: LocalBackup): LocalBackup {
  if (
    !data ||
    data.format !== 'aiao-local-backup' ||
    data.version !== 1 ||
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
      ids.has(image.job.id) ||
      typeof image.base64 !== 'string' ||
      image.base64.length > 23 * 1024 * 1024 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(image.base64)
    )
      throw new Error('备份图片格式无效或 ID 重复。');
    ids.add(image.job.id);
  }
  return data;
}
export async function createLocalBackup(
  store: LocalMediaStore,
  providers: LocalProvider[],
  defaultId: string,
  tasks: Task[]
): Promise<Blob> {
  const images: BackupImage[] = [];
  let total = 0;
  for (const work of await store.list()) {
    const image = await store.backupImage(work.jobId);
    total += Math.ceil(image.blob.size / 3) * 4;
    if (total > limit - 1024 * 1024) throw new Error('备份超过 64 MiB，请先单独下载部分作品。');
    const bytes = new Uint8Array(await image.blob.arrayBuffer());
    let raw = '';
    for (let i = 0; i < bytes.length; i += 8192) raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
    images.push({
      job: imageJob(work.jobId, image, work.createdAt ?? new Date().toISOString()),
      base64: btoa(raw),
      sha256: await digest(image.blob)
    });
  }
  const backup = validateBackup({
    format: 'aiao-local-backup',
    version: 1,
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
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  if (blob.size > limit) throw new Error('备份超过 64 MiB。');
  return blob;
}
export async function readLocalBackup(file: File): Promise<{ backup: LocalBackup; files: Blob[]; digest: string }> {
  if (file.size > limit) throw new Error('备份文件不能超过 64 MiB。');
  const data = validateBackup(JSON.parse(await file.text()));
  const files: Blob[] = [];
  for (const image of data.images) {
    const bytes = Uint8Array.from(atob(image.base64), c => c.charCodeAt(0));
    const { mimeType } = imageMetadata(bytes);
    const blob = new Blob([bytes], { type: mimeType });
    if ((await digest(blob)) !== image.sha256) throw new Error('备份图片校验失败，原数据未更改。');
    await validateImageBlob(blob);
    files.push(blob);
  }
  return { backup: data, files, digest: await digest(file) };
}
