import type { EntityStaticType, EntityType, FindAllOptions, IRepository, RxDBEvent } from '@aiao/rxdb';
import { Entity, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import type { StorageFilesystem } from '@aiao/rxdb-plugin-storage';
import { OpfsStorageFilesystem, rxDBPluginStorage } from '@aiao/rxdb-plugin-storage';
import { defer, distinctUntilChanged, firstValueFrom, map, Observable, Subject, takeUntil } from 'rxjs';
import type {
  DraftSyncConflictView,
  DraftSyncMutation,
  DraftSyncPullResult,
  DraftSyncPushResult,
  DraftSyncResolution,
  DraftSyncResolutionResult,
  GenerationJobSummary,
  ImageJobRequest,
  ReferenceImageUpload,
  SyncedDraftContent
} from '../contracts/index';
import {
  validateAudioGenerationJobSummary,
  validateAudioJobRequest,
  validateVideoGenerationJobSummary,
  validateVideoJobRequest,
  type AudioResultMetadata,
  type VideoResultMetadata
} from '../contracts/index';
import { productPayloadText, validateSyncPayload, type PublicWorkPayload } from '../contracts/product-data.mjs';
import type { DraftNotebook } from './draft-notebook';
import {
  acceptNotebookConflicts,
  acceptNotebookPull,
  acceptNotebookPush,
  acceptNotebookResolution,
  blockNotebookResolution,
  createNotebookDraft,
  editNotebookDraft,
  emptyNotebook,
  prepareNotebookPushes,
  prepareNotebookResolution,
  recoverNotebookConflict,
  validateNotebook
} from './draft-notebook';
import type { ImageDraftSource, ImageSubmissionBook, ImageSubmissionSelection } from './image-submissions';
import {
  attachImageUpload,
  confirmImageSubmission,
  createImageSubmission,
  discardUnsentImageSubmission,
  markImageSubmissionHandled,
  markImageSubmissionSent,
  rejectImageSubmission,
  validateImageSubmissionBook
} from './image-submissions';
import {
  LocalCollectionCheckpoint,
  LocalCollectionRecord,
  projectCollection,
  type LocalCollection
} from './local-collections';
import { localRepository } from './local-repository';
import {
  MediaResultError,
  mediaResultMetadata,
  validateMediaBlob,
  type LocalAssetKind,
  type LocalAssetResult
} from './media-result';
import { readStudioPayload, studioPayload, type StudioDraftSnapshot, type StudioPromptState } from './studio-draft';

import type { AudioGenerationJobSummary, AudioJobRequest } from '../contracts/index';
import type { AudioSubmissionBook } from './audio-submissions';
import {
  confirmAudioSubmission,
  createAudioSubmission,
  markAudioSubmissionSent,
  validateAudioSubmissionBook
} from './audio-submissions';

import type { VideoGenerationJobSummary, VideoJobRequest } from '../contracts/index';
import type { VideoSubmissionBook } from './video-submissions';
import {
  confirmVideoSubmission,
  createVideoSubmission,
  markVideoSubmissionSent,
  validateVideoSubmissionBook
} from './video-submissions';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emptyWhere = { combinator: 'and' as const, rules: [] };
const limitBytes = 16 * 1024 * 1024;
@Entity({
  name: 'LocalDraftNotebook',
  tableName: 'local_draft_notebook',
  namespace: 'media',
  log: false,
  sync: { type: SyncType.None },
  properties: [
    { name: 'key', type: PropertyType.string, required: true },
    { name: 'payload', type: PropertyType.string, required: true },
    { name: 'revision', type: PropertyType.integer, required: true }
  ],
  indexes: [{ name: 'local_draft_notebook_key', properties: ['key'], unique: true }]
})
class LocalDraftNotebook extends EntityBase {
  key!: string;
  payload!: string;
  revision!: number;
}
@Entity({
  name: 'LocalImageSubmissionJournal',
  tableName: 'local_image_submission_journal',
  namespace: 'media',
  log: false,
  sync: { type: SyncType.None },
  properties: [
    { name: 'key', type: PropertyType.string, required: true },
    { name: 'payload', type: PropertyType.string, required: true },
    { name: 'revision', type: PropertyType.integer, required: true }
  ],
  indexes: [
    {
      name: 'local_image_submission_journal_key',
      properties: ['key'],
      unique: true
    }
  ]
})
class LocalImageSubmissionJournal extends EntityBase {
  key!: string;
  payload!: string;
  revision!: number;
}
@Entity({
  name: 'LocalAudioSubmissionJournal',
  tableName: 'local_audio_submission_journal',
  namespace: 'media',
  log: false,
  sync: { type: SyncType.None },
  properties: [
    { name: 'key', type: PropertyType.string, required: true },
    { name: 'payload', type: PropertyType.string, required: true },
    { name: 'revision', type: PropertyType.integer, required: true }
  ],
  indexes: [
    {
      name: 'local_audio_submission_journal_key',
      properties: ['key'],
      unique: true
    }
  ]
})
class LocalAudioSubmissionJournal extends EntityBase {
  key!: string;
  payload!: string;
  revision!: number;
}
@Entity({
  name: 'LocalVideoSubmissionJournal',
  tableName: 'local_video_submission_journal',
  namespace: 'media',
  log: false,
  sync: { type: SyncType.None },
  properties: [
    { name: 'key', type: PropertyType.string, required: true },
    { name: 'payload', type: PropertyType.string, required: true },
    { name: 'revision', type: PropertyType.integer, required: true }
  ],
  indexes: [
    {
      name: 'local_video_submission_journal_key',
      properties: ['key'],
      unique: true
    }
  ]
})
class LocalVideoSubmissionJournal extends EntityBase {
  key!: string;
  payload!: string;
  revision!: number;
}
@Entity({
  name: 'LocalStudioDraft',
  tableName: 'local_studio_draft',
  namespace: 'media',
  log: false,
  sync: { type: SyncType.None },
  properties: [
    { name: 'key', type: PropertyType.string, required: true },
    { name: 'payload', type: PropertyType.string, required: true },
    { name: 'revision', type: PropertyType.integer, required: true }
  ],
  indexes: [{ name: 'local_studio_draft_key', properties: ['key'], unique: true }]
})
class LocalStudioDraft extends EntityBase {
  key!: string;
  payload!: string;
  revision!: number;
}
@Entity({
  name: 'MediaDraft',
  tableName: 'media_draft',
  namespace: 'media',
  log: false,
  sync: { type: SyncType.None },
  properties: [
    { name: 'key', type: PropertyType.string, required: true },
    { name: 'prompt', type: PropertyType.string, required: true },
    { name: 'revision', type: PropertyType.integer, required: true }
  ],
  indexes: [{ name: 'media_draft_key', properties: ['key'], unique: true }]
})
export class MediaDraft extends EntityBase {
  key!: string;
  prompt!: string;
  revision!: number;
}
@Entity({
  name: 'LocalImageWork',
  tableName: 'local_image_work',
  namespace: 'media',
  log: false,
  sync: { type: SyncType.None },
  properties: [
    { name: 'jobId', type: PropertyType.string, required: true },
    { name: 'prompt', type: PropertyType.string, required: true },
    { name: 'modelId', type: PropertyType.string, required: true },
    { name: 'providerInstanceId', type: PropertyType.string, required: true },
    { name: 'fileId', type: PropertyType.string, required: true },
    { name: 'digest', type: PropertyType.string, required: true },
    { name: 'bytes', type: PropertyType.integer, required: true },
    { name: 'stage', type: PropertyType.string, required: true }
  ],
  indexes: [{ name: 'local_image_work_job', properties: ['jobId'], unique: true }]
})
export class LocalImageWork extends EntityBase {
  jobId!: string;
  prompt!: string;
  modelId!: string;
  providerInstanceId!: string;
  fileId!: string;
  digest!: string;
  bytes!: number;
  stage!: 'saving' | 'ready' | 'deleting' | 'broken';
}
/** Additive: legacy LocalImageWork and PNG paths are deliberately unchanged. */
@Entity({
  name: 'LocalMediaAsset',
  tableName: 'local_media_asset',
  namespace: 'media',
  log: false,
  sync: { type: SyncType.None },
  properties: [
    { name: 'jobId', type: PropertyType.string, required: true },
    { name: 'kind', type: PropertyType.string, required: true },
    { name: 'prompt', type: PropertyType.string, required: true },
    { name: 'modelId', type: PropertyType.string, required: true },
    { name: 'providerInstanceId', type: PropertyType.string, required: true },
    { name: 'request', type: PropertyType.string, required: true },
    { name: 'result', type: PropertyType.string, required: true },
    { name: 'fileId', type: PropertyType.string, required: true },
    { name: 'digest', type: PropertyType.string, required: true },
    { name: 'bytes', type: PropertyType.integer, required: true },
    { name: 'stage', type: PropertyType.string, required: true }
  ],
  indexes: [
    {
      name: 'local_media_asset_job',
      properties: ['kind', 'jobId'],
      unique: true
    }
  ]
})
class LocalMediaAsset extends EntityBase {
  jobId!: string;
  kind!: LocalAssetKind;
  request!: string;
  prompt!: string;
  modelId!: string;
  providerInstanceId!: string;
  result!: string;
  fileId!: string;
  digest!: string;
  bytes!: number;
  stage!: 'saving' | 'ready' | 'deleting' | 'broken';
}
export type LocalAssetSummary = LocalWorkSummary &
  ({ kind: 'audio'; result: AudioResultMetadata | null } | { kind: 'video'; result: VideoResultMetadata | null });
export type LocalMediaWorkSummary = LocalAssetSummary | (LocalWorkSummary & { kind: 'image'; result: null });
@Entity({
  name: 'LocalReferenceImage',
  tableName: 'local_reference_image',
  namespace: 'media',
  log: false,
  sync: { type: SyncType.None },
  properties: [
    { name: 'referenceId', type: PropertyType.string, required: true },
    { name: 'originalName', type: PropertyType.string, required: true },
    { name: 'mimeType', type: PropertyType.string, required: true },
    { name: 'width', type: PropertyType.integer, required: true },
    { name: 'height', type: PropertyType.integer, required: true },
    { name: 'fileId', type: PropertyType.string, required: true },
    { name: 'digest', type: PropertyType.string, required: true },
    { name: 'bytes', type: PropertyType.integer, required: true },
    { name: 'stage', type: PropertyType.string, required: true }
  ],
  indexes: [
    {
      name: 'local_reference_image_id',
      properties: ['referenceId'],
      unique: true
    }
  ]
})
export class LocalReferenceImage extends EntityBase {
  referenceId!: string;
  originalName!: string;
  mimeType!: 'image/png' | 'image/jpeg';
  width!: number;
  height!: number;
  fileId!: string;
  digest!: string;
  bytes!: number;
  stage!: 'saving' | 'ready' | 'deleting' | 'broken';
}
@Entity({
  name: 'LocalReferenceSlot',
  tableName: 'local_reference_slot',
  namespace: 'media',
  log: false,
  sync: { type: SyncType.None },
  properties: [
    { name: 'key', type: PropertyType.string, required: true },
    { name: 'referenceId', type: PropertyType.string, required: true },
    { name: 'revision', type: PropertyType.integer, required: true }
  ],
  indexes: [{ name: 'local_reference_slot_key', properties: ['key'], unique: true }]
})
export class LocalReferenceSlot extends EntityBase {
  key!: string;
  referenceId!: string;
  revision!: number;
}
export interface LocalReferenceSummary {
  referenceId: string;
  originalName: string;
  mimeType: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
  bytes: number;
  status: 'saved' | 'broken';
}
export interface LocalReferenceState {
  revision: number;
  image: LocalReferenceSummary | null;
  cleanupPending?: boolean;
}

@Entity({
  name: 'LocalPreference',
  tableName: 'local_preference',
  namespace: 'media',
  log: false,
  sync: { type: SyncType.None },
  properties: [
    { name: 'key', type: PropertyType.string, required: true },
    { name: 'payload', type: PropertyType.string, required: true },
    { name: 'revision', type: PropertyType.integer, required: true }
  ],
  indexes: [{ name: 'local_preference_key', properties: ['key'], unique: true }]
})
export class LocalPreference extends EntityBase {
  key!: string;
  payload!: string;
  revision!: number;
}

export interface LocalWorkSummary {
  jobId: string;
  prompt: string;
  modelId: string;
  bytes: number;
  status: 'saved' | 'broken';
  createdAt?: string;
}
export interface LocalImageInfo {
  mimeType: 'image/png';
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  providerInstanceId: string;
}
export interface LocalDraftSummary {
  prompt: string;
  revision: number;
}
export interface LocalPreferenceChange {
  key: string;
  payload: string;
  revision: number | null;
}
export interface LocalWorkspaceProjection {
  preferences: readonly LocalPreferenceChange[];
  draft?: { state: StudioPromptState; revision: number | null };
  works?: PublicWorkPayload[];
  collections?: boolean;
}
@Entity({
  name: 'SyncedWorkMetadata',
  tableName: 'synced_work_metadata',
  namespace: 'media',
  log: false,
  sync: { type: SyncType.None },
  properties: [
    { name: 'workId', type: PropertyType.uuid, required: true },
    { name: 'payload', type: PropertyType.string, required: true }
  ],
  indexes: [{ name: 'synced_work_id', properties: ['workId'], unique: true }]
})
class SyncedWorkMetadata extends EntityBase {
  workId!: string;
  payload!: string;
}
export class LocalMediaError extends Error {
  constructor(
    readonly code: 'unavailable' | 'locked' | 'conflict' | 'corrupt' | 'write_failed' | 'incompatible',
    message: string
  ) {
    super(message);
    this.name = 'LocalMediaError';
  }
}
/** This marker must be checked under the workspace lock before opening or using
 * the database. Future incompatible migrations must raise it before changing
 * data. An old, already open tab must stop too; never lower or remove the marker.
 * Releases predating this guard are not safe rollback targets.
 */
function assertLocalSchema(userId: string) {
  const key = `aiao-local-schema-${userId}`;
  const version = localStorage.getItem(key);
  if (version !== null && version !== '1')
    throw new LocalMediaError('incompatible', '本机数据版本与此应用不兼容，请更新应用后重试；原数据未更改。');
  if (version === null) localStorage.setItem(key, '1');
}
const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), v => v.toString(16).padStart(2, '0')).join('');
async function digest(blob: Blob): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
}
async function validateImage(blob: Blob): Promise<void> {
  if (blob.type !== 'image/png' || !blob.size || blob.size > limitBytes)
    throw new LocalMediaError('corrupt', '只可保存不超过 16 MiB 的 PNG 结果。');
  const header = new Uint8Array(await blob.slice(0, 33).arrayBuffer());
  const signature = header.slice(0, 8);
  if (!signature.every((value, i) => value === [137, 80, 78, 71, 13, 10, 26, 10][i]) || signature.length !== 8)
    throw new LocalMediaError('corrupt', '图片内容无效，未标记本地已保存。');
  const view = new DataView(header.buffer);
  if (
    header.length !== 33 ||
    view.getUint32(8) !== 13 ||
    String.fromCharCode(...header.slice(12, 16)) !== 'IHDR' ||
    !view.getUint32(16) ||
    !view.getUint32(20) ||
    view.getUint32(16) > 4096 ||
    view.getUint32(20) > 4096 ||
    view.getUint32(16) * view.getUint32(20) > 16_777_216
  )
    throw new LocalMediaError('corrupt', '图片尺寸无效或超限，未解码或保存。');
  try {
    const image = await createImageBitmap(blob);
    try {
      if (
        !image.width ||
        !image.height ||
        image.width > 4096 ||
        image.height > 4096 ||
        image.width * image.height > 16_777_216
      )
        throw new Error('Invalid dimensions');
    } finally {
      image.close();
    }
  } catch {
    throw new LocalMediaError('corrupt', '图片无法解码，未标记本地已保存。');
  }
}

async function validateReferenceImage(blob: Blob): Promise<{
  width: number;
  height: number;
  mimeType: 'image/png' | 'image/jpeg';
}> {
  if (!['image/png', 'image/jpeg'].includes(blob.type) || !blob.size || blob.size > 8 * 1024 * 1024)
    throw new LocalMediaError('corrupt', '参考图仅支持不超过 8 MiB 的真实 PNG/JPEG。');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let width = 0,
    height = 0;
  if (blob.type === 'image/png') {
    await validateImage(blob);
    const view = new DataView(bytes.buffer);
    width = view.getUint32(16);
    height = view.getUint32(20);
  } else {
    // Bound allocation BEFORE pixel decoding. Read JPEG segment lengths, not just magic bytes.
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9)
      throw new LocalMediaError('corrupt', '参考图 MIME 与真实内容不符。');
    const view = new DataView(bytes.buffer);
    let offset = 2;
    const frames = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 0xff) break;
      while (bytes[offset] === 0xff) ++offset;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (frames.has(marker) && length >= 8) {
        height = view.getUint16(offset + 3);
        width = view.getUint16(offset + 5);
        break;
      }
      offset += length;
    }
  }
  if (!width || !height || width > 4096 || height > 4096 || width * height > 16_777_216)
    throw new LocalMediaError('corrupt', '参考图尺寸无效或超限；未解码或保存。');
  if (blob.type === 'image/jpeg') {
    try {
      const image = await createImageBitmap(blob);
      try {
        if (image.width !== width || image.height !== height) throw new Error('Invalid dimensions');
      } finally {
        image.close();
      }
    } catch {
      throw new LocalMediaError('corrupt', '参考图无法解码；未发送或保存。');
    }
  }
  return {
    width,
    height,
    mimeType: blob.type === 'image/png' ? 'image/png' : 'image/jpeg'
  };
}

/** Per-account persistent metadata plus storage-plugin file bodies.
 * Browser: SQLite/IndexedDB + OPFS. Electron: host SQLite + native app-data files.
 * No memory fallback and no remote URL is persisted as an image. Same-origin isolation,
 * not encryption: user namespaces do not protect against XSS or local OS inspection.
 */
export class LocalMediaStore {
  private locked = false;
  private closing: Promise<void> | null = null;
  private readonly urls = new Map<string, string>();
  private readonly channel: BroadcastChannel;
  private readonly lifetime = new AbortController();
  private readonly studioClosed = new Subject<void>();
  get isLocked(): boolean {
    return this.locked;
  }
  private constructor(
    readonly userId: string,
    private readonly db: RxDB,
    private readonly filesystem: StorageFilesystem,
    readonly backend: 'browser' | 'desktop',
    private readonly closeBackend: () => Promise<void>
  ) {
    this.channel = new BroadcastChannel(`aiao-media-${userId}`);
    this.channel.onmessage = event => {
      if (event.data?.locked === true) {
        void this.close().catch(() => undefined);
      }
    };
  }
  static async open(userId: string): Promise<LocalMediaStore> {
    if ('__aiaoRxdbDesktopHost__' in globalThis || 'aiaoDesktop' in globalThis)
      throw new LocalMediaError('unavailable', '当前图片 MVP 仅支持 Web；桌面数据未打开或迁移。');
    if (
      !uuid.test(userId) ||
      typeof navigator === 'undefined' ||
      !navigator.storage?.getDirectory ||
      !navigator.locks ||
      typeof BroadcastChannel === 'undefined' ||
      typeof createImageBitmap !== 'function'
    )
      throw new LocalMediaError('unavailable', '此运行环境不支持所需持久存储、Web Locks 或图片解码；没有内存降级。');
    userId = userId.toLowerCase();
    const rootDir = `aiao-media-v1-${userId}`;
    const dbName = `am1-${userId.replace(/-/g, '')}`;
    const adapterName = 'wa-sqlite';
    const db = new RxDB({
      dbName,
      context: { userId },
      entities: [
        LocalPreference,
        LocalCollectionRecord,
        LocalCollectionCheckpoint,
        MediaDraft,
        LocalStudioDraft,
        LocalImageWork,
        LocalMediaAsset,
        LocalReferenceImage,
        LocalReferenceSlot,
        LocalDraftNotebook,
        LocalImageSubmissionJournal,
        LocalAudioSubmissionJournal,
        LocalVideoSubmissionJournal,
        SyncedWorkMetadata
      ],
      sync: { local: { adapter: adapterName }, type: SyncType.None }
    });
    const filesystem: StorageFilesystem = new OpfsStorageFilesystem(rootDir);
    const closeBackend = async () => undefined;
    db.adapter(
      adapterName,
      host =>
        new RxDBAdapterWaSqlite(host, {
          vfs: 'IDBBatchAtomicVFS',
          async: true,
          wasmPath: '/wa-sqlite/wa-sqlite-async.wasm'
        })
    );
    db.use(rxDBPluginStorage, {
      rootDir,
      previewLimitBytes: 64 * 1024 * 1024,
      filesystem: () => filesystem
    });
    const store = new LocalMediaStore(userId, db, filesystem, 'browser', closeBackend);
    try {
      await navigator.locks.request(`aiao-media-account-${userId}`, async () => {
        if (store.isLocked) throw new LocalMediaError('locked', '本地数据已锁定。');
        assertLocalSchema(userId);
        await db.connect(adapterName);
        await db.storage.init();
      });
      await store.recover();
      await store.refreshCollections();
      return store;
    } catch (error) {
      await store.close().catch(() => undefined);
      if (error instanceof LocalMediaError && error.code === 'incompatible') throw error;
      throw new LocalMediaError(
        'unavailable',
        '本地数据库或文件后端打开失败；不会宣称已保存，请检查浏览器权限和剩余空间。'
      );
    }
  }
  async audioSubmission() {
    const [row] = await this.collection('audio-submissions');
    return row ? (JSON.parse(row.payload) as NonNullable<AudioSubmissionBook['pending']>) : null;
  }
  createAudioSubmission(request: AudioJobRequest) {
    return this.audioSubmissionOperation(book => createAudioSubmission(book, request));
  }
  markAudioSubmissionSent(key: string) {
    return this.audioSubmissionOperation(book => markAudioSubmissionSent(book, key));
  }
  confirmAudioSubmission(key: string, job: AudioGenerationJobSummary) {
    return this.audioSubmissionOperation(book => confirmAudioSubmission(book, key, job));
  }
  async videoSubmission() {
    const [row] = await this.collection('video-submissions');
    return row ? (JSON.parse(row.payload) as NonNullable<VideoSubmissionBook['pending']>) : null;
  }
  createVideoSubmission(request: VideoJobRequest) {
    return this.videoSubmissionOperation(book => createVideoSubmission(book, request));
  }
  markVideoSubmissionSent(key: string) {
    return this.videoSubmissionOperation(book => markVideoSubmissionSent(book, key));
  }
  confirmVideoSubmission(key: string, job: VideoGenerationJobSummary) {
    return this.videoSubmissionOperation(book => confirmVideoSubmission(book, key, job));
  }
  async imageSubmissions() {
    return (await this.collection('image-submissions')).map(
      row => JSON.parse(row.payload) as ImageSubmissionBook['submissions'][number]
    );
  }
  createImageSubmission(
    selection: ImageSubmissionSelection,
    referenceId: string | null,
    source: ImageDraftSource | null = null
  ) {
    return this.imageSubmissionOperation(async book => {
      if (referenceId) await this.referenceBlobUnlocked(referenceId);
      if (source) {
        const repo = (await firstValueFrom(this.db.localAdapter$)).getRepository(LocalDraftNotebook);
        const [row] = await repo.find({ where: emptyWhere });
        const draft = row ? validateNotebook(JSON.parse(row.payload)).drafts.find(item => item.id === source.id) : null;
        if (
          !draft ||
          draft.localRevision !== source.localRevision ||
          draft.deleted ||
          draft.conflict ||
          draft.content?.kind !== 'image'
        )
          throw new LocalMediaError('conflict', '来源同步草稿已更新、删除或有冲突；没有发送，请重新选择。');
      }
      if (
        book.submissions.some(
          item =>
            !item.jobId &&
            !item.rejected &&
            item.localReferenceId === referenceId &&
            JSON.stringify(item.selection) === JSON.stringify(selection)
        )
      )
        throw new LocalMediaError('conflict', '已有相同的未确认提交；请核对原回执，不创建第二个任务。');
      return createImageSubmission(
        book,
        selection,
        referenceId,
        source,
        crypto.randomUUID(),
        crypto.randomUUID(),
        new Date().toISOString()
      );
    });
  }
  attachImageUpload(id: string, revision: number, upload: ReferenceImageUpload) {
    return this.imageSubmissionOperation(book => attachImageUpload(book, id, revision, upload));
  }
  rejectImageSubmission(id: string, revision: number, status: 400 | 401 | 403 | 429) {
    return this.imageSubmissionOperation(book => rejectImageSubmission(book, id, revision, status));
  }
  markImageSubmissionSent(id: string, revision: number) {
    return this.imageSubmissionOperation(book => markImageSubmissionSent(book, id, revision, new Date().toISOString()));
  }
  confirmImageSubmission(id: string, revision: number, jobId: string, request: ImageJobRequest) {
    return this.imageSubmissionOperation(book => confirmImageSubmission(book, id, revision, jobId, request));
  }
  markImageResultHandled(jobId: string) {
    return this.imageSubmissionOperation(book => markImageSubmissionHandled(book, jobId));
  }
  async discardUnsentImageSubmission(id: string, revision: number) {
    await this.imageSubmissionOperation(book => discardUnsentImageSubmission(book, id, revision));
    await this.exclusive(() => this.recoverReferencesUnlocked());
  }
  syncNotebook(): Promise<DraftNotebook> {
    return this.notebookOperation(book => book, false);
  }
  createSyncDraft(content: SyncedDraftContent) {
    return this.notebookOperation(book => createNotebookDraft(book, content, crypto.randomUUID()));
  }
  saveSyncDraft(id: string, content: SyncedDraftContent | null, expectedLocalRevision: number) {
    return this.notebookOperation(book => editNotebookDraft(book, id, content, expectedLocalRevision));
  }
  prepareSyncPushes(): Promise<DraftSyncMutation[]> {
    return this.notebookOperation(book => prepareNotebookPushes(book, () => crypto.randomUUID()));
  }
  acceptSyncPush(mutation: DraftSyncMutation, result: DraftSyncPushResult): Promise<void> {
    return this.notebookOperation(book => acceptNotebookPush(book, mutation, result));
  }
  acceptSyncPull(result: DraftSyncPullResult, expectedCheckpoint: string | null): Promise<void> {
    return this.notebookOperation(book => acceptNotebookPull(book, result, expectedCheckpoint));
  }
  acceptSyncConflicts(conflicts: DraftSyncConflictView[]): Promise<void> {
    return this.notebookOperation(book => acceptNotebookConflicts(book, conflicts));
  }
  prepareSyncResolution(id: string, choice: DraftSyncResolution['choice']) {
    return this.notebookOperation(book => prepareNotebookResolution(book, id, choice));
  }
  acceptSyncResolution(id: string, result: DraftSyncResolutionResult): Promise<void> {
    return this.notebookOperation(book => acceptNotebookResolution(book, id, result));
  }
  rejectSyncResolution(id: string): Promise<void> {
    return this.notebookOperation(book => {
      const draft = book.drafts.find(item => item.conflict?.id === id);
      if (draft) draft.resolution = null;
    });
  }
  blockSyncResolution(id: string): Promise<void> {
    return this.notebookOperation(book => blockNotebookResolution(book, id));
  }
  recoverSyncConflict(id: string) {
    return this.notebookOperation(book => recoverNotebookConflict(book, id, crypto.randomUUID()));
  }
  resetSyncCheckpoint(): Promise<void> {
    return this.notebookOperation(book => {
      book.checkpoint = null;
    });
  }
  async reference(): Promise<LocalReferenceState> {
    return this.exclusive(async () => {
      await this.recoverReferencesUnlocked();
      return this.referenceStateUnlocked();
    });
  }
  async saveReference(file: File, expectedRevision: number): Promise<LocalReferenceState> {
    const size = await validateReferenceImage(file),
      checksum = await digest(file);
    return this.exclusive(async () => {
      await this.recoverReferencesUnlocked();
      const slots = await this.referenceSlots(),
        refs = await this.references();
      const [slot] = await slots.find({ where: emptyWhere });
      if ((slot?.revision ?? 0) !== expectedRevision)
        throw new LocalMediaError('conflict', '另一标签页已修改参考图；未覆盖，请重新载入。');
      const referenceId = crypto.randomUUID();
      const reference = await refs.create(
        this.db.entityManager.instantiate(LocalReferenceImage, {
          referenceId,
          originalName: Array.from(file.name, character => {
            const code = character.charCodeAt(0);
            return code < 32 || code === 127 || character === '/' || character === '\\' ? '_' : character;
          })
            .join('')
            .slice(0, 120),
          mimeType: size.mimeType,
          width: size.width,
          height: size.height,
          fileId: '',
          digest: checksum,
          bytes: file.size,
          stage: 'saving'
        })
      );
      // Journal -> bytes -> verified ready -> atomic slot switch -> old-file cleanup.
      // Until the slot switch, the previous reference remains fully recoverable.
      const meta = await this.db.storage.upload(new File([file], this.referencePath(reference), { type: file.type }));
      const linked = await refs.update(reference, { fileId: meta.id });
      await this.readReferenceVerified(linked);
      await refs.update(linked, { stage: 'ready' });
      const revision = expectedRevision + 1;
      if (slot) await slots.update(slot, { referenceId, revision });
      else
        await slots.create(
          this.db.entityManager.instantiate(LocalReferenceSlot, {
            key: 'main',
            referenceId,
            revision
          })
        );
      let cleanupPending = false;
      try {
        await this.recoverReferencesUnlocked();
      } catch {
        cleanupPending = true;
      }
      return { ...(await this.referenceStateUnlocked()), cleanupPending };
    });
  }
  async removeReference(expectedRevision: number): Promise<LocalReferenceState> {
    return this.exclusive(async () => {
      const slots = await this.referenceSlots();
      const [slot] = await slots.find({ where: emptyWhere });
      const referenceId = slot?.referenceId;
      if ((slot?.revision ?? 0) !== expectedRevision)
        throw new LocalMediaError('conflict', '另一标签页已修改参考图；未删除，请重新载入。');
      if (slot?.referenceId)
        await slots.update(slot, {
          referenceId: '',
          revision: expectedRevision + 1
        });
      if (referenceId) this.releasePreviews(`reference:${referenceId}`);
      let cleanupPending = false;
      try {
        await this.recoverReferencesUnlocked();
      } catch {
        // The slot commit is acknowledged. Report cleanup separately from the
        // logical deletion so the UI does not keep a now-invalid reference.
        cleanupPending = true;
      }
      return { ...(await this.referenceStateUnlocked()), cleanupPending };
    });
  }
  async referenceBlob(referenceId: string): Promise<Blob> {
    return this.exclusive(() => this.referenceBlobUnlocked(referenceId));
  }
  async referenceBlobForSubmission(submissionId: string): Promise<Blob> {
    return this.exclusive(() => this.referenceBlobForSubmissionUnlocked(submissionId));
  }
  async previewSubmissionReference(submissionId: string): Promise<string> {
    return this.exclusive(async () => {
      const blob = await this.referenceBlobForSubmissionUnlocked(submissionId);
      if (this.locked) throw new LocalMediaError('locked', '本地数据已锁定。');
      const url = URL.createObjectURL(blob);
      this.urls.set(url, `submission:${submissionId}`);
      return url;
    });
  }
  async previewReference(referenceId: string): Promise<string> {
    return this.exclusive(async () => {
      const blob = await this.referenceBlobUnlocked(referenceId);
      if (this.locked) throw new LocalMediaError('locked', '本地数据已锁定。');
      const url = URL.createObjectURL(blob);
      this.urls.set(url, `reference:${referenceId}`);
      return url;
    });
  }

  async studioDraft(): Promise<StudioDraftSnapshot | null> {
    return this.exclusive(async () => {
      const rows = await this.readRows(LocalStudioDraft, {
        where: {
          combinator: 'and',
          rules: [{ field: 'key', operator: '=', value: 'image-studio' }]
        }
      });
      if (rows.length > 1) throw new LocalMediaError('corrupt', '本机编辑草稿重复；未覆盖原数据。');
      return rows[0] ? readStudioPayload(rows[0].payload, rows[0].revision) : null;
    });
  }
  async saveStudioDraft(state: StudioPromptState, expectedRevision: number | null): Promise<StudioDraftSnapshot> {
    const payload = studioPayload(state);
    return this.exclusive(async () => {
      const rows = await this.readRows(LocalStudioDraft, {
        where: {
          combinator: 'and',
          rules: [{ field: 'key', operator: '=', value: 'image-studio' }]
        }
      });
      if (rows.length > 1) throw new LocalMediaError('corrupt', '本机编辑草稿重复；未覆盖原数据。');
      const old = rows[0];
      if (old) readStudioPayload(old.payload, old.revision);
      if ((old?.revision ?? null) !== expectedRevision)
        throw new LocalMediaError('conflict', '另一窗口已修改主创作草稿；当前输入保留，未覆盖对方。');
      if (old?.payload === payload) return readStudioPayload(old.payload, old.revision);
      const revision = (old?.revision ?? 0) + 1;
      if (!Number.isSafeInteger(revision))
        throw new LocalMediaError('write_failed', '本机草稿版本已超出范围，未覆盖原数据。');
      const repo = await this.repository(LocalStudioDraft);
      if (old) await repo.update(old, { payload, revision });
      else
        await repo.create(
          this.db.entityManager.instantiate(LocalStudioDraft, {
            key: 'image-studio',
            payload,
            revision
          })
        );
      return readStudioPayload(payload, revision);
    });
  }
  studioDraft$(): Observable<StudioDraftSnapshot | null> {
    return this.live(() =>
      this.db.entityManager
        .getRepository(LocalStudioDraft)
        .find({
          where: {
            combinator: 'and',
            rules: [{ field: 'key', operator: '=', value: 'image-studio' }]
          },
          limit: 2
        })
        .pipe(
          map(rows => {
            if (this.locked) throw new LocalMediaError('locked', '本机访问已锁定。');
            if (rows.length > 1) throw new LocalMediaError('corrupt', '本机编辑草稿重复。');
            return rows[0] ? readStudioPayload(rows[0].payload, rows[0].revision) : null;
          })
        )
    );
  }
  async lockAccount(): Promise<void> {
    if (!this.locked) this.channel.postMessage({ locked: true });
    await this.close();
  }
  async draft(): Promise<LocalDraftSummary | null> {
    return this.exclusive(async () => {
      const [draft] = await (await this.drafts()).find({ where: emptyWhere });
      return draft ? { prompt: draft.prompt, revision: draft.revision } : null;
    });
  }
  async saveDraft(prompt: string, expectedRevision: number | null): Promise<LocalDraftSummary> {
    if (typeof prompt !== 'string' || prompt.length > 4000)
      throw new LocalMediaError('write_failed', '草稿最多 4000 字。');
    return this.exclusive(async () => {
      const repo = await this.drafts();
      const [previous] = await repo.find({ where: emptyWhere });
      if ((previous?.revision ?? null) !== expectedRevision)
        throw new LocalMediaError('conflict', '另一标签页已更新草稿；请重新载入后合并，未覆盖对方内容。');
      const revision = (previous?.revision ?? 0) + 1;
      if (previous) await repo.update(previous, { prompt, revision });
      else
        await repo.create(
          this.db.entityManager.instantiate(MediaDraft, {
            key: 'main',
            prompt,
            revision
          })
        );
      return { prompt, revision };
    });
  }
  /** Device-only settings and task journal; never part of draft synchronization. */
  async preference(key: string): Promise<{ payload: string; revision: number } | null> {
    return this.exclusive(async () => {
      const [row] = await this.readRows(LocalPreference, {
        where: {
          combinator: 'and',
          rules: [{ field: 'key', operator: '=', value: key }]
        }
      });
      return row ? { payload: row.payload, revision: row.revision } : null;
    });
  }
  async savePreference(key: string, payload: string, revision: number | null): Promise<number> {
    const [next] = await this.savePreferences([{ key, payload, revision }]);
    return next;
  }
  async savePreferences(changes: readonly LocalPreferenceChange[], collections = false): Promise<number[]> {
    const keys = new Set(changes.map(change => change.key));
    if (
      keys.size !== changes.length ||
      changes.some(change => !/^[a-z0-9-]{1,80}$/.test(change.key) || change.payload.length > 512 * 1024)
    )
      throw new LocalMediaError('write_failed', '本机设置格式无效、重复或过大。');
    return this.exclusive(async () => {
      const adapter = await firstValueFrom(this.db.localAdapter$);
      const events: RxDBEvent[] = [];
      const revisions = await adapter.transaction(async executor => {
        const repo = localRepository(LocalPreference, executor.getRepository(LocalPreference), event =>
          events.push(event)
        );
        const revisions: number[] = [];
        for (const change of changes) {
          const revision = await this.writePreference(repo, change);
          revisions.push(revision);
          if (collections) await this.projectPreference(executor, events, change.key, change.payload, revision);
        }
        return revisions;
      });
      for (const event of events) this.db.dispatchEvent(event);
      return revisions;
    });
  }
  async ensurePreference(key: string, payload: string): Promise<{ payload: string; revision: number }> {
    if (!/^[a-z0-9-]{1,80}$/.test(key) || payload.length > 512 * 1024)
      throw new LocalMediaError('write_failed', '设置格式无效。');
    return this.exclusive(async () => {
      const repo = await this.repository(LocalPreference);
      const [row] = await repo.find({
        where: { combinator: 'and', rules: [{ field: 'key', operator: '=', value: key }] }
      });
      if (row) return { payload: row.payload, revision: row.revision };
      const created = await repo.create(
        this.db.entityManager.instantiate(LocalPreference, { key, payload, revision: 1 })
      );
      return { payload: created.payload, revision: created.revision };
    });
  }
  async applyProjection(projection: LocalWorkspaceProjection): Promise<void> {
    const draftPayload = projection.draft ? studioPayload(projection.draft.state) : null;
    return this.exclusive(async () => {
      const adapter = await firstValueFrom(this.db.localAdapter$),
        events: RxDBEvent[] = [];
      await adapter.transaction(async executor => {
        const preferences = localRepository(LocalPreference, executor.getRepository(LocalPreference), event =>
          events.push(event)
        );
        for (const change of projection.preferences) {
          const revision = await this.writePreference(preferences, change);
          if (projection.collections)
            await this.projectPreference(executor, events, change.key, change.payload, revision);
        }
        if (projection.works) {
          const works = localRepository(SyncedWorkMetadata, executor.getRepository(SyncedWorkMetadata), event =>
            events.push(event)
          );
          const existing = await works.find({ where: emptyWhere });
          for (const input of projection.works) {
            const value = validateSyncPayload('work', input),
              payload = productPayloadText('work', value);
            const old = existing.find(row => row.workId === value.jobId);
            if (old && old.payload !== payload) await works.update(old, { payload });
            if (!old)
              await works.create(
                this.db.entityManager.instantiate(SyncedWorkMetadata, { workId: value.jobId, payload })
              );
          }
          for (const old of existing)
            if (!projection.works.some(work => work.jobId === old.workId)) await works.remove(old);
        }
        if (!projection.draft) return;
        const drafts = localRepository(LocalStudioDraft, executor.getRepository(LocalStudioDraft), event =>
          events.push(event)
        );
        const [old] = await drafts.find({
          where: { combinator: 'and', rules: [{ field: 'key', operator: '=', value: 'image-studio' }] }
        });
        if ((old?.revision ?? null) !== projection.draft.revision)
          throw new LocalMediaError('conflict', '同步期间本机草稿已变化；未覆盖本机内容。');
        if (old) readStudioPayload(old.payload, old.revision);
        if (old?.payload === draftPayload) return;
        if (old) await drafts.update(old, { payload: draftPayload!, revision: old.revision + 1 });
        else
          await drafts.create(
            this.db.entityManager.instantiate(LocalStudioDraft, {
              key: 'image-studio',
              payload: draftPayload!,
              revision: 1
            })
          );
      });
      for (const event of events) this.db.dispatchEvent(event);
    });
  }
  preference$(key: string): Observable<{ payload: string; revision: number } | null> {
    return this.live(() =>
      this.db.entityManager
        .getRepository(LocalPreference)
        .findOne({
          where: { combinator: 'and', rules: [{ field: 'key', operator: '=', value: key }] }
        })
        .pipe(map(row => (row ? { payload: row.payload, revision: row.revision } : null)))
    );
  }
  async refreshCollections(): Promise<void> {
    return this.exclusive(async () => {
      const adapter = await firstValueFrom(this.db.localAdapter$),
        events: RxDBEvent[] = [];
      await adapter.transaction(async executor => {
        const preferences = executor.getRepository(LocalPreference);
        for (const key of ['providers-v1', 'tasks-v1']) {
          const [row] = await preferences.find({
            where: { combinator: 'and', rules: [{ field: 'key', operator: '=', value: key }] }
          });
          if (row) await this.projectPreference(executor, events, key, row.payload, row.revision);
        }
        for (const [entity, collection] of [
          [LocalDraftNotebook, 'drafts'],
          [LocalImageSubmissionJournal, 'image-submissions'],
          [LocalAudioSubmissionJournal, 'audio-submissions'],
          [LocalVideoSubmissionJournal, 'video-submissions']
        ] as const) {
          const [row] = await executor.getRepository(entity).find({ where: emptyWhere });
          if (row) await projectCollection(this.db, executor, events, collection, row.payload, row.revision);
        }
      });
      for (const event of events) this.db.dispatchEvent(event);
    });
  }
  async collection(collection: LocalCollection): Promise<{ sourceId: string; payload: string; status: string }[]> {
    await this.refreshCollections();
    return this.exclusive(() =>
      this.readRows(LocalCollectionRecord, {
        where: { combinator: 'and', rules: [{ field: 'collection', operator: '=', value: collection }] },
        orderBy: [{ field: 'position', sort: 'asc' }],
        limit: 1000
      })
    );
  }
  collection$(collection: LocalCollection): Observable<{ sourceId: string; payload: string; status: string }[]> {
    return this.live(() =>
      this.db.entityManager.getRepository(LocalCollectionRecord).findAll({
        where: { combinator: 'and', rules: [{ field: 'collection', operator: '=', value: collection }] },
        orderBy: [{ field: 'position', sort: 'asc' }]
      })
    );
  }
  async syncedWorks(): Promise<PublicWorkPayload[]> {
    return this.exclusive(async () =>
      (await this.readRows(SyncedWorkMetadata, { where: emptyWhere })).map(row =>
        validateSyncPayload('work', JSON.parse(row.payload))
      )
    );
  }
  syncedWorks$(): Observable<PublicWorkPayload[]> {
    return this.live(() =>
      this.db.entityManager
        .getRepository(SyncedWorkMetadata)
        .findAll({ where: emptyWhere })
        .pipe(map(rows => rows.map(row => validateSyncPayload('work', JSON.parse(row.payload)))))
    );
  }
  async backupImage(jobId: string): Promise<{
    blob: Blob;
    prompt: string;
    modelId: string;
    providerInstanceId: string;
  }> {
    return this.exclusive(async () => {
      const repo = await this.works();
      const [work] = await repo.find({
        where: {
          combinator: 'and',
          rules: [{ field: 'jobId', operator: '=', value: jobId }]
        }
      });
      if (!work || work.stage !== 'ready') throw new LocalMediaError('corrupt', '作品文件未就绪，备份未完成。');
      return {
        blob: await this.readVerified(work),
        prompt: work.prompt,
        modelId: work.modelId,
        providerInstanceId: work.providerInstanceId
      };
    });
  }
  async imageInfo(jobId: string): Promise<LocalImageInfo> {
    const image = await this.backupImage(jobId);
    const header = new DataView(await image.blob.slice(0, 24).arrayBuffer());
    return {
      mimeType: 'image/png',
      width: header.getUint32(16),
      height: header.getUint32(20),
      bytes: image.blob.size,
      sha256: await digest(image.blob),
      providerInstanceId: image.providerInstanceId
    };
  }
  async saveResult(job: GenerationJobSummary, blob: Blob): Promise<LocalWorkSummary> {
    if (
      !uuid.test(job.id) ||
      job.status !== 'completed' ||
      !uuid.test(job.request.providerInstanceId) ||
      job.request.kind !== 'image' ||
      job.request.prompt.length > 4000
    )
      throw new LocalMediaError('write_failed', '任务不是有效的已完成图片结果。');
    await validateImage(blob);
    const checksum = await digest(blob);
    return this.exclusive(async () => {
      await this.recoverUnlocked();
      const repo = await this.works();
      const [previous] = await repo.find({
        where: {
          combinator: 'and',
          rules: [{ field: 'jobId', operator: '=', value: job.id }]
        }
      });
      if (previous?.stage === 'ready') {
        if (previous.digest !== checksum) throw new LocalMediaError('conflict', '此任务已有不同的本地图片，未覆盖。');
        await this.readVerified(previous);
        return this.summary(previous);
      }
      if (previous) await this.deleteUnlocked(previous);
      // Persist intent before bytes, so a crash is detectable, not a fake saved work.
      const work = await repo.create(
        this.db.entityManager.instantiate(LocalImageWork, {
          jobId: job.id,
          prompt: job.request.prompt,
          modelId: job.request.modelId,
          providerInstanceId: job.request.providerInstanceId,
          fileId: '',
          digest: checksum,
          bytes: blob.size,
          stage: 'saving'
        })
      );
      try {
        const meta = await this.db.storage.upload(new File([blob], `${job.id}.png`, { type: 'image/png' }));
        const linked = await repo.update(work, { fileId: meta.id });
        await this.readVerified(linked);
        const ready = await repo.update(linked, { stage: 'ready' });
        return this.summary(ready);
      } catch {
        // Keep the journal. The next locked recovery verifies or removes the partial artifact.
        throw new LocalMediaError('write_failed', '本地图片写入或关联失败，未确认保存；可在交付期限内重试。');
      }
    });
  }
  async list(): Promise<LocalWorkSummary[]> {
    return this.exclusive(async () => {
      return (
        await (
          await this.works()
        ).find({
          where: { combinator: 'and', rules: [{ field: 'stage', operator: 'in', value: ['ready', 'broken'] }] },
          orderBy: [
            { field: 'createdAt', sort: 'asc' },
            { field: 'id', sort: 'asc' }
          ]
        })
      ).map(work => this.summary(work));
    });
  }
  works$(): Observable<LocalWorkSummary[]> {
    return this.live(() =>
      this.db.entityManager
        .getRepository(LocalImageWork)
        .findAll({
          where: { combinator: 'and', rules: [{ field: 'stage', operator: 'in', value: ['ready', 'broken'] }] },
          orderBy: [
            { field: 'createdAt', sort: 'desc' },
            { field: 'id', sort: 'desc' }
          ]
        })
        .pipe(map(works => works.map(work => this.summary(work))))
    );
  }
  async preview(jobId: string): Promise<string> {
    return this.exclusive(async () => {
      const [work] = await (
        await this.works()
      ).find({
        where: {
          combinator: 'and',
          rules: [{ field: 'jobId', operator: '=', value: jobId }]
        }
      });
      if (!work || work.stage !== 'ready') throw new LocalMediaError('corrupt', '当前账号没有可读的本地作品。');
      const blob = await this.readVerified(work);
      if (this.locked) throw new LocalMediaError('locked', '本地数据已锁定。');
      const url = URL.createObjectURL(blob);
      this.urls.set(url, `image:${jobId}`);
      return url;
    });
  }
  release(url: string) {
    if (this.urls.delete(url)) URL.revokeObjectURL(url);
  }
  async delete(jobId: string): Promise<void> {
    return this.exclusive(async () => {
      const [work] = await (
        await this.works()
      ).find({
        where: {
          combinator: 'and',
          rules: [{ field: 'jobId', operator: '=', value: jobId }]
        }
      });
      if (work) await this.deleteUnlocked(work);
    });
  }
  async recover(): Promise<void> {
    await this.exclusive(async () => {
      await this.recoverUnlocked();
      await this.recoverAssetsUnlocked();
    });
  }
  /** One public persistence entry, with compatibility delegation for old images. */
  async saveMediaResult(
    job: GenerationJobSummary | AudioGenerationJobSummary | VideoGenerationJobSummary,
    blob: Blob
  ): Promise<LocalMediaWorkSummary> {
    if (job.request.kind === 'image')
      return {
        ...(await this.saveResult(job as GenerationJobSummary, blob)),
        kind: 'image',
        result: null
      };
    let receipt: AudioGenerationJobSummary | VideoGenerationJobSummary;
    try {
      receipt =
        job.request.kind === 'audio' ? validateAudioGenerationJobSummary(job) : validateVideoGenerationJobSummary(job);
      if (receipt.status !== 'completed' || !receipt.result) throw new Error('no result');
      await validateMediaBlob(receipt.request.kind, blob, receipt.result, this.lifetime.signal);
    } catch (error) {
      if (this.locked) throw new LocalMediaError('locked', '本地媒体访问已锁定。');
      throw new LocalMediaError('write_failed', error instanceof Error ? error.message : '不是有效的已完成媒体结果。');
    }
    const checksum = await digest(blob),
      kind = receipt.request.kind,
      result = JSON.stringify(receipt.result);
    return this.exclusive(async () => {
      await this.recoverAssetsUnlocked();
      const repo = await this.assets(),
        [previous] = await repo.find({
          where: {
            combinator: 'and',
            rules: [
              { field: 'jobId', operator: '=', value: receipt.id },
              { field: 'kind', operator: '=', value: kind }
            ]
          }
        });
      if (previous?.stage === 'ready') {
        if (
          previous.digest !== checksum ||
          previous.result !== result ||
          previous.request !== JSON.stringify(receipt.request) ||
          previous.prompt !== receipt.request.prompt ||
          previous.modelId !== receipt.request.modelId ||
          previous.providerInstanceId !== receipt.request.providerInstanceId
        )
          throw new LocalMediaError('conflict', '此任务已有不同的本地媒体，未覆盖。');
        await this.readAssetVerified(previous);
        return this.assetSummary(previous);
      }
      if (previous) await this.deleteAssetUnlocked(previous);
      const asset = await repo.create(
        this.db.entityManager.instantiate(LocalMediaAsset, {
          jobId: receipt.id,
          kind,
          prompt: receipt.request.prompt,
          modelId: receipt.request.modelId,
          providerInstanceId: receipt.request.providerInstanceId,
          request: JSON.stringify(receipt.request),
          result,
          digest: checksum,
          bytes: blob.size,
          fileId: '',
          stage: 'saving'
        })
      );
      try {
        const meta = await this.db.storage.upload(new File([blob], this.assetName(asset), { type: blob.type }));
        const linked = await repo.update(asset, { fileId: meta.id });
        await this.readAssetVerified(linked);
        const ready = await repo.update(linked, { stage: 'ready' });
        return this.assetSummary(ready);
      } catch {
        throw new LocalMediaError('write_failed', '本地媒体写入或回读失败，未确认保存；可核对并重试原任务。');
      }
    });
  }
  async listAssets(kind?: LocalAssetKind): Promise<LocalAssetSummary[]> {
    return this.exclusive(async () => {
      return (await (await this.assets()).find(this.assetQuery(kind))).map(asset => this.assetSummary(asset));
    });
  }
  async listMedia(): Promise<LocalMediaWorkSummary[]> {
    const images = await this.list(),
      assets = await this.listAssets();
    return [
      ...images.map(work => ({
        ...work,
        kind: 'image' as const,
        result: null
      })),
      ...assets
    ];
  }
  assets$(kind: LocalAssetKind): Observable<LocalAssetSummary[]> {
    return this.live(() =>
      this.db.entityManager
        .getRepository(LocalMediaAsset)
        .findAll(this.assetQuery(kind))
        .pipe(map(assets => assets.map(asset => this.assetSummary(asset))))
    );
  }
  async verifyAsset(kind: LocalAssetKind, jobId: string): Promise<void> {
    await this.exclusive(async () => {
      await this.readReadyAsset(kind, jobId);
    });
  }
  /** Keep the account lock from persisted verification through a bounded ACK.
   * App-controlled deletion in another window cannot race this declaration.
   * Does not protect against OS/DevTools clearing or promise backup retention. */
  async withVerifiedAsset<T>(kind: LocalAssetKind, jobId: string, acknowledge: () => Promise<T>): Promise<T> {
    return this.exclusive(async () => {
      await this.readReadyAsset(kind, jobId);
      if (this.locked) throw new LocalMediaError('locked', '本地媒体访问已锁定。');
      return acknowledge();
    });
  }
  async previewAsset(kind: LocalAssetKind, jobId: string): Promise<string> {
    return this.exclusive(async () => {
      const blob = await this.readReadyAsset(kind, jobId);
      if (this.locked) throw new LocalMediaError('locked', '本地媒体访问已锁定。');
      const url = URL.createObjectURL(blob);
      this.urls.set(url, `${kind}:${jobId}`);
      return url;
    });
  }
  async deleteAsset(kind: LocalAssetKind, jobId: string): Promise<void> {
    await this.exclusive(async () => {
      const asset = await this.findAsset(kind, jobId);
      if (asset) await this.deleteAssetUnlocked(asset);
    });
  }
  /** Lock synchronously and revoke previews, then wait for in-flight writes to leave the user lock. */
  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.locked = true;
    this.lifetime.abort();
    this.studioClosed.next();
    this.studioClosed.complete();
    this.releasePreviews();
    this.channel.close();
    this.closing = navigator.locks.request(`aiao-media-account-${this.userId}`, async () => {
      try {
        await this.db.disconnectAll();
      } finally {
        await this.closeBackend();
      }
    });
    return this.closing;
  }
  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.locked) throw new LocalMediaError('locked', '本地数据已锁定，请先在线重新验证当前账号。');
    return navigator.locks.request(`aiao-media-account-${this.userId}`, async () => {
      if (this.locked) throw new LocalMediaError('locked', '本地数据已锁定。');
      assertLocalSchema(this.userId);
      return operation();
    });
  }
  private async readRows<T extends EntityType>(
    entity: T,
    options: EntityStaticType<T, 'findOptions'>
  ): Promise<InstanceType<T>[]> {
    const adapter = await firstValueFrom(this.db.localAdapter$);
    return adapter.getRepository(entity).find(options);
  }
  private live<T>(query: () => Observable<T>): Observable<T> {
    return defer(() => {
      if (this.locked) throw new LocalMediaError('locked', '本机访问已锁定。');
      return query().pipe(
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
        takeUntil(this.studioClosed)
      );
    });
  }
  private assetQuery(kind?: LocalAssetKind): FindAllOptions<typeof LocalMediaAsset> {
    return {
      where: {
        combinator: 'and',
        rules: [
          { field: 'stage', operator: 'in', value: ['ready', 'broken'] },
          ...(kind ? [{ field: 'kind' as const, operator: '=' as const, value: kind }] : [])
        ]
      },
      orderBy: [
        { field: 'jobId', sort: 'asc' },
        { field: 'id', sort: 'asc' }
      ]
    };
  }
  private projectPreference(
    executor: import('@aiao/rxdb').TransactionExecutor,
    events: RxDBEvent[],
    key: string,
    payload: string,
    revision: number
  ): Promise<void> {
    if (key === 'providers-v1' || key === 'tasks-v1')
      return projectCollection(
        this.db,
        executor,
        events,
        key === 'providers-v1' ? 'providers' : 'tasks',
        payload,
        revision
      );
    return Promise.resolve();
  }
  private async commitBook(
    entity: typeof LocalDraftNotebook,
    collection: LocalCollection,
    key: string,
    payload: string,
    previous: { payload: string; revision: number } | null
  ): Promise<void> {
    const adapter = await firstValueFrom(this.db.localAdapter$),
      events: RxDBEvent[] = [];
    await adapter.transaction(async executor => {
      const repo = localRepository(entity, executor.getRepository(entity), event => events.push(event));
      const [row] = await repo.find({ where: emptyWhere });
      if (
        (row?.revision ?? null) !== (previous?.revision ?? null) ||
        (row?.payload ?? null) !== (previous?.payload ?? null)
      )
        throw new LocalMediaError('conflict', '本机提交集合已变化，未覆盖或发送。');
      const revision = payload === previous?.payload ? previous.revision : (previous?.revision ?? 0) + 1;
      if (payload !== row?.payload) {
        if (row) await repo.update(row, { payload, revision });
        else await repo.create(this.db.entityManager.instantiate(entity, { key, payload, revision }));
      }
      await projectCollection(this.db, executor, events, collection, payload, revision);
    });
    for (const event of events) this.db.dispatchEvent(event);
  }
  private async writePreference(
    repo: IRepository<typeof LocalPreference>,
    { key, payload, revision }: LocalPreferenceChange
  ): Promise<number> {
    const [row] = await repo.find({
      where: { combinator: 'and', rules: [{ field: 'key', operator: '=', value: key }] }
    });
    if ((row?.revision ?? null) !== revision)
      throw new LocalMediaError('conflict', '另一标签页已修改设置，请刷新后重试。');
    const next = (revision ?? 0) + 1;
    if (row) await repo.update(row, { payload, revision: next });
    else await repo.create(this.db.entityManager.instantiate(LocalPreference, { key, payload, revision: next }));
    return next;
  }
  private releasePreviews(owner?: string): void {
    for (const [url, identity] of this.urls) if (owner === undefined || identity === owner) this.release(url);
  }
  private async repository<T extends EntityType>(entity: T): Promise<IRepository<T>> {
    const adapter = await firstValueFrom(this.db.localAdapter$);
    return localRepository(entity, adapter.getRepository(entity), event => this.db.dispatchEvent(event));
  }
  private async notebookOperation<T>(operation: (book: DraftNotebook) => T, write = true): Promise<T> {
    return this.exclusive(async () => {
      const repo = (await firstValueFrom(this.db.localAdapter$)).getRepository(LocalDraftNotebook);
      const [row] = await repo.find({ where: emptyWhere });
      let book = emptyNotebook();
      if (row) {
        try {
          book = validateNotebook(JSON.parse(row.payload));
        } catch {
          throw new LocalMediaError('corrupt', '同步草稿日志不可读；不会创建空日志覆盖原数据。');
        }
      }
      const previous = row ? { payload: row.payload, revision: row.revision } : null;
      const result = operation(book);
      if (write) {
        const payload = JSON.stringify(validateNotebook(book));
        await this.commitBook(LocalDraftNotebook, 'drafts', 'notebook', payload, previous);
        const [saved] = await repo.find({ where: emptyWhere });
        if (saved?.payload !== payload || this.locked)
          throw new LocalMediaError('write_failed', '提交意图持久化未确认；没有发送任务。');
      }
      return structuredClone(result);
    });
  }
  private async imageSubmissionOperation<T>(
    operation: (book: ImageSubmissionBook) => T | Promise<T>,
    write = true
  ): Promise<T> {
    return this.exclusive(async () => {
      const repo = (await firstValueFrom(this.db.localAdapter$)).getRepository(LocalImageSubmissionJournal);
      const [row] = await repo.find({ where: emptyWhere });
      let book: ImageSubmissionBook = { version: 1, submissions: [] };
      if (row) {
        try {
          book = validateImageSubmissionBook(JSON.parse(row.payload));
        } catch {
          throw new LocalMediaError('corrupt', '图片提交日志不可读；停止提交，不用空日志覆盖或重复生成。');
        }
      }
      const previous = row ? { payload: row.payload, revision: row.revision } : null;
      const result = await operation(book);
      if (write) {
        const payload = JSON.stringify(validateImageSubmissionBook(book));
        await this.commitBook(LocalImageSubmissionJournal, 'image-submissions', 'submissions', payload, previous);
        const [saved] = await repo.find({ where: emptyWhere });
        if (saved?.payload !== payload || this.locked)
          throw new LocalMediaError('write_failed', '提交意图持久化未确认；没有发送任务。');
      }
      return structuredClone(result);
    });
  }
  private async audioSubmissionOperation<T>(
    operation: (book: AudioSubmissionBook) => T | Promise<T>,
    write = true
  ): Promise<T> {
    return this.exclusive(async () => {
      const repo = (await firstValueFrom(this.db.localAdapter$)).getRepository(LocalAudioSubmissionJournal);
      const [row] = await repo.find({ where: emptyWhere });
      let book: AudioSubmissionBook = { version: 1, pending: null };
      if (row) {
        try {
          book = validateAudioSubmissionBook(JSON.parse(row.payload));
        } catch {
          throw new LocalMediaError('corrupt', '配音提交日志不可读；停止提交，不用空日志覆盖或重复生成。');
        }
      }
      const previous = row ? { payload: row.payload, revision: row.revision } : null;
      const result = await operation(book);
      if (write) {
        const payload = JSON.stringify(validateAudioSubmissionBook(book));
        await this.commitBook(LocalAudioSubmissionJournal, 'audio-submissions', 'submissions', payload, previous);
        const [saved] = await repo.find({ where: emptyWhere });
        if (saved?.payload !== payload || this.locked)
          throw new LocalMediaError('write_failed', '提交意图持久化未确认；没有发送任务。');
      }
      return structuredClone(result);
    });
  }
  private async videoSubmissionOperation<T>(
    operation: (book: VideoSubmissionBook) => T | Promise<T>,
    write = true
  ): Promise<T> {
    return this.exclusive(async () => {
      const repo = (await firstValueFrom(this.db.localAdapter$)).getRepository(LocalVideoSubmissionJournal);
      const [row] = await repo.find({ where: emptyWhere });
      let book: VideoSubmissionBook = { version: 1, pending: null };
      if (row) {
        try {
          book = validateVideoSubmissionBook(JSON.parse(row.payload));
        } catch {
          throw new LocalMediaError('corrupt', '视频提交日志不可读；停止提交，不用空日志覆盖或重复生成。');
        }
      }
      const previous = row ? { payload: row.payload, revision: row.revision } : null;
      const result = await operation(book);
      if (write) {
        const payload = JSON.stringify(validateVideoSubmissionBook(book));
        await this.commitBook(LocalVideoSubmissionJournal, 'video-submissions', 'submissions', payload, previous);
        const [saved] = await repo.find({ where: emptyWhere });
        if (saved?.payload !== payload || this.locked)
          throw new LocalMediaError('write_failed', '提交意图持久化未确认；没有发送任务。');
      }
      return structuredClone(result);
    });
  }
  private async assets() {
    return this.repository(LocalMediaAsset);
  }
  private async works() {
    return this.repository(LocalImageWork);
  }
  private async drafts() {
    return this.repository(MediaDraft);
  }
  private async references() {
    return this.repository(LocalReferenceImage);
  }
  private async referenceSlots() {
    return this.repository(LocalReferenceSlot);
  }
  private referencePath(reference: LocalReferenceImage): string {
    if (!uuid.test(reference.referenceId) || !['image/png', 'image/jpeg'].includes(reference.mimeType))
      throw new LocalMediaError('corrupt', '本地参考图记录无效。');
    return `reference-${reference.referenceId}.${reference.mimeType === 'image/png' ? 'png' : 'jpg'}`;
  }
  private referenceSummary(reference: LocalReferenceImage): LocalReferenceSummary {
    return {
      referenceId: reference.referenceId,
      originalName: reference.originalName,
      mimeType: reference.mimeType,
      width: reference.width,
      height: reference.height,
      bytes: reference.bytes,
      status: reference.stage === 'ready' ? 'saved' : 'broken'
    };
  }
  private async readReferenceVerified(reference: LocalReferenceImage): Promise<Blob> {
    const path = this.referencePath(reference);
    if (
      !reference.fileId ||
      !/^[a-f0-9]{64}$/.test(reference.digest) ||
      reference.bytes < 1 ||
      reference.bytes > 8 * 1024 * 1024
    )
      throw new LocalMediaError('corrupt', '本地参考图记录不完整。');
    const meta = await this.db.storage.getMeta(reference.fileId);
    if (!meta || meta.opfsPath !== path || meta.mimeType !== reference.mimeType || meta.size !== reference.bytes)
      throw new LocalMediaError('corrupt', '本地参考图或关联记录已缺失。');
    let blob: Blob;
    try {
      blob = await this.db.storage.read(reference.fileId);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError')
        throw new LocalMediaError('corrupt', '本地参考图文件已缺失。');
      throw new LocalMediaError('unavailable', '参考图暂不可读，未删除持久文件。');
    }
    if (blob.size !== reference.bytes || (await digest(blob)) !== reference.digest)
      throw new LocalMediaError('corrupt', '本地参考图损坏或被修改。');
    const size = await validateReferenceImage(blob);
    if (size.width !== reference.width || size.height !== reference.height)
      throw new LocalMediaError('corrupt', '本地参考图尺寸与记录不符。');
    return blob;
  }
  private async referenceStateUnlocked(): Promise<LocalReferenceState> {
    const [slot] = await (await this.referenceSlots()).find({ where: emptyWhere });
    if (!slot?.referenceId) return { revision: slot?.revision ?? 0, image: null };
    const [reference] = await (
      await this.references()
    ).find({
      where: {
        combinator: 'and',
        rules: [{ field: 'referenceId', operator: '=', value: slot.referenceId }]
      }
    });
    // A dangling link is observable, never silently presented as a valid image.
    return {
      revision: slot.revision,
      image:
        reference ?
          this.referenceSummary(reference)
        : {
            referenceId: slot.referenceId,
            originalName: '关联记录缺失',
            mimeType: 'image/png',
            width: 0,
            height: 0,
            bytes: 0,
            status: 'broken'
          }
    };
  }
  private async referenceBlobUnlocked(referenceId: string): Promise<Blob> {
    const state = await this.referenceStateUnlocked();
    if (state.image?.referenceId !== referenceId || state.image.status !== 'saved')
      throw new LocalMediaError('corrupt', '当前账号草稿没有这张可读参考图。');
    const [reference] = await (
      await this.references()
    ).find({
      where: {
        combinator: 'and',
        rules: [{ field: 'referenceId', operator: '=', value: referenceId }]
      }
    });
    if (!reference) throw new LocalMediaError('corrupt', '本地参考图记录已缺失。');
    return this.readReferenceVerified(reference);
  }
  private async referenceBlobForSubmissionUnlocked(submissionId: string): Promise<Blob> {
    const repo = (await firstValueFrom(this.db.localAdapter$)).getRepository(LocalImageSubmissionJournal);
    const [row] = await repo.find({ where: emptyWhere });
    const item =
      row ?
        validateImageSubmissionBook(JSON.parse(row.payload)).submissions.find(item => item.id === submissionId)
      : null;
    if (!item?.localReferenceId) throw new LocalMediaError('corrupt', '此提交没有本机参考图关联。');
    const [reference] = await (
      await this.references()
    ).find({
      where: {
        combinator: 'and',
        rules: [{ field: 'referenceId', operator: '=', value: item.localReferenceId }]
      }
    });
    if (!reference || reference.stage !== 'ready')
      throw new LocalMediaError('corrupt', '提交关联的本机参考图缺失；未发送。');
    return this.readReferenceVerified(reference);
  }
  private async deleteReferenceUnlocked(reference: LocalReferenceImage) {
    const path = this.referencePath(reference),
      repo = await this.references();
    const deleting = reference.stage === 'deleting' ? reference : await repo.update(reference, { stage: 'deleting' });
    for (const meta of await this.db.storage.list()) if (meta.opfsPath === path) await this.db.storage.delete(meta.id);
    await this.filesystem.removeFile(path);
    await repo.remove(deleting);
    this.releasePreviews(`reference:${reference.referenceId}`);
  }
  private async recoverReferencesUnlocked() {
    const repo = await this.references(),
      [slot] = await (await this.referenceSlots()).find({ where: emptyWhere });
    const journalRepo = (await firstValueFrom(this.db.localAdapter$)).getRepository(LocalImageSubmissionJournal);
    const [journal] = await journalRepo.find({ where: emptyWhere });
    let pinned = new Set<string>();
    if (journal) {
      try {
        pinned = new Set(
          validateImageSubmissionBook(JSON.parse(journal.payload)).submissions.flatMap(item =>
            item.localReferenceId ? [item.localReferenceId] : []
          )
        );
      } catch {
        throw new LocalMediaError('corrupt', '图片提交日志不可读；停止参考图清理，保留原文件。');
      }
    }
    for (const reference of await repo.find({ where: emptyWhere })) {
      if (reference.referenceId !== slot?.referenceId && !pinned.has(reference.referenceId)) {
        await this.deleteReferenceUnlocked(reference);
        continue;
      }
      if (reference.stage !== 'ready') continue;
      try {
        await this.readReferenceVerified(reference);
      } catch (error) {
        if (error instanceof LocalMediaError && error.code === 'corrupt')
          await repo.update(reference, { stage: 'broken' });
        else throw error; // Temporary denial must not destroy the file or mark corruption.
      }
    }
    const retained = new Set((await repo.find({ where: emptyWhere })).map(reference => this.referencePath(reference)));
    const owned = (name: string) => /^reference-[0-9a-f-]+\.(png|jpg)$/.test(name) && uuid.test(name.slice(10, -4));
    for (const meta of await this.db.storage.list())
      if (owned(meta.name) && meta.opfsPath === meta.name && !retained.has(meta.name))
        await this.db.storage.delete(meta.id);
    const orphans: string[] = [];
    for await (const entry of this.filesystem.list('/'))
      if (entry.kind === 'file' && owned(entry.name) && !retained.has(entry.name)) orphans.push(entry.name);
    for (const path of orphans) await this.filesystem.removeFile(path);
  }
  private async readVerified(work: LocalImageWork): Promise<Blob> {
    if (
      !work.fileId ||
      !uuid.test(work.jobId) ||
      !/^[a-f0-9]{64}$/.test(work.digest) ||
      work.bytes < 1 ||
      work.bytes > limitBytes
    )
      throw new LocalMediaError('corrupt', '本地作品记录不完整。');
    const meta = await this.db.storage.getMeta(work.fileId);
    if (!meta || meta.opfsPath !== `${work.jobId}.png` || meta.mimeType !== 'image/png' || meta.size !== work.bytes)
      throw new LocalMediaError('corrupt', '本地图片或关联记录已缺失。');
    let blob: Blob;
    try {
      blob = await this.db.storage.read(work.fileId);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'NotFoundError')
        throw new LocalMediaError('corrupt', '本地图片文件已缺失。');
      throw new LocalMediaError('unavailable', '本地图片暂不可读，未删除持久文件。');
    }
    if (blob.size !== work.bytes || (await digest(blob)) !== work.digest)
      throw new LocalMediaError('corrupt', '本地图片损坏或被修改。');
    await validateImage(blob);
    return blob;
  }
  private summary(work: LocalImageWork): LocalWorkSummary {
    return {
      jobId: work.jobId,
      prompt: work.prompt,
      modelId: work.modelId,
      bytes: work.bytes,
      createdAt: new Date(work.createdAt).toISOString(),
      status: work.stage === 'ready' ? 'saved' : 'broken'
    };
  }
  private async deleteUnlocked(work: LocalImageWork) {
    if (!uuid.test(work.jobId)) throw new LocalMediaError('corrupt', '无法安全删除无效的本地记录。');
    const repo = await this.works();
    const deleting = work.stage === 'deleting' ? work : await repo.update(work, { stage: 'deleting' });
    const meta = (await this.db.storage.list()).find(item => item.opfsPath === `${work.jobId}.png`);
    if (meta) await this.db.storage.delete(meta.id);
    // Crash before plugin metadata insertion may leave a predictable unreferenced file.
    await this.filesystem.removeFile(`${work.jobId}.png`);
    await repo.remove(deleting);
    this.releasePreviews(`image:${work.jobId}`);
  }
  private async recoverUnlocked(): Promise<void> {
    await this.recoverReferencesUnlocked();
    const repo = await this.works();
    const works = await repo.find({ where: emptyWhere });
    const metas = await this.db.storage.list();
    for (const work of works) {
      if (work.stage === 'deleting') {
        await this.deleteUnlocked(work);
        continue;
      }
      if (work.stage === 'saving') {
        const meta = metas.find(item => item.opfsPath === `${work.jobId}.png`);
        if (!meta) {
          await this.deleteUnlocked(work);
          continue;
        }
        const linked = await repo.update(work, { fileId: meta.id });
        try {
          await this.readVerified(linked);
        } catch (error) {
          if (error instanceof LocalMediaError && error.code === 'corrupt') {
            await this.deleteUnlocked(linked);
            continue;
          }
          throw error;
        }
        await repo.update(linked, { stage: 'ready' });
      } else if (work.stage === 'ready') {
        try {
          await this.readVerified(work);
        } catch (error) {
          if (error instanceof LocalMediaError && error.code === 'corrupt')
            await repo.update(work, { stage: 'broken' });
          else throw error;
        }
      }
    }
    const retained = new Set((await repo.find({ where: emptyWhere })).map(work => `${work.jobId}.png`));
    // Touch only this account's media-owned deterministic filenames, never generic files.
    for (const meta of await this.db.storage.list())
      if (
        uuid.test(meta.name.slice(0, -4)) &&
        meta.name.endsWith('.png') &&
        meta.opfsPath === meta.name &&
        !retained.has(meta.name)
      )
        await this.db.storage.delete(meta.id);
    const orphans: string[] = [];
    for await (const entry of this.filesystem.list('/'))
      if (
        entry.kind === 'file' &&
        entry.name.endsWith('.png') &&
        uuid.test(entry.name.slice(0, -4)) &&
        !retained.has(entry.name)
      )
        orphans.push(entry.name);
    for (const path of orphans) await this.filesystem.removeFile(path);
  }
  private assetName(asset: Pick<LocalMediaAsset, 'jobId' | 'kind'>) {
    if (!uuid.test(asset.jobId) || !['audio', 'video'].includes(asset.kind))
      throw new LocalMediaError('corrupt', '本地媒体身份无效，停止文件操作。');
    return `${asset.kind}-${asset.jobId.toLowerCase()}.${asset.kind === 'audio' ? 'wav' : 'mp4'}`;
  }
  private assetMetadata(asset: LocalMediaAsset): LocalAssetResult {
    try {
      this.assetName(asset);
      if (asset.result.length > 4096 || asset.request.length > 8192) throw new Error('oversized metadata');
      const request =
        asset.kind === 'audio' ?
          validateAudioJobRequest(JSON.parse(asset.request))
        : validateVideoJobRequest(JSON.parse(asset.request));
      if (
        request.kind !== asset.kind ||
        request.prompt !== asset.prompt ||
        request.modelId !== asset.modelId ||
        request.providerInstanceId !== asset.providerInstanceId
      )
        throw new Error('mismatched provenance');
      const result = mediaResultMetadata(asset.kind, JSON.parse(asset.result));
      if (result.bytes !== asset.bytes) throw new Error('mismatched bytes');
      return result;
    } catch {
      throw new LocalMediaError('corrupt', '本地媒体格式/时长记录已损坏。');
    }
  }
  private assetSummary(asset: LocalMediaAsset): LocalAssetSummary {
    let result: LocalAssetResult | null = null;
    try {
      result = this.assetMetadata(asset);
    } catch {
      /* Broken works stay visible and deletable. */
    }
    return {
      jobId: asset.jobId,
      kind: asset.kind,
      prompt: asset.prompt,
      modelId: asset.modelId,
      bytes: asset.bytes,
      result,
      status: asset.stage === 'ready' && result ? 'saved' : 'broken'
    } as LocalAssetSummary;
  }
  private async readAssetVerified(asset: LocalMediaAsset, decode = true): Promise<Blob> {
    const name = this.assetName(asset),
      expected = this.assetMetadata(asset);
    if (!asset.fileId || !/^[a-f0-9]{64}$/.test(asset.digest))
      throw new LocalMediaError('corrupt', '本地媒体文件关联不完整。');
    const meta = await this.db.storage.getMeta(asset.fileId);
    if (
      !meta ||
      meta.opfsPath !== name ||
      meta.name !== name ||
      meta.mimeType !== expected.mediaType ||
      meta.size !== expected.bytes
    )
      throw new LocalMediaError('corrupt', '本地媒体文件或关联已缺失。');
    let blob: Blob;
    try {
      blob = await this.db.storage.read(asset.fileId);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'NotFoundError')
        throw new LocalMediaError('corrupt', '本地媒体文件已缺失。');
      throw new LocalMediaError('unavailable', '本地媒体暂不可读，未删除持久文件。');
    }
    if (blob.size !== expected.bytes || (await digest(blob)) !== asset.digest)
      throw new LocalMediaError('corrupt', '本地媒体字节已损坏或被修改。');
    try {
      await validateMediaBlob(asset.kind, blob, expected, this.lifetime.signal, decode);
    } catch (error) {
      if (error instanceof MediaResultError) throw new LocalMediaError(error.code, error.message);
      throw error;
    }
    if (this.locked) throw new LocalMediaError('locked', '本地媒体访问已锁定。');
    return blob;
  }
  private async findAsset(kind: LocalAssetKind, jobId: string) {
    this.assetName({ kind, jobId });
    const [asset] = await (
      await this.assets()
    ).find({
      where: {
        combinator: 'and',
        rules: [
          { field: 'kind', operator: '=', value: kind },
          { field: 'jobId', operator: '=', value: jobId }
        ]
      }
    });
    return asset;
  }
  private async readReadyAsset(kind: LocalAssetKind, jobId: string): Promise<Blob> {
    const asset = await this.findAsset(kind, jobId);
    if (!asset || asset.stage !== 'ready') throw new LocalMediaError('corrupt', '当前账号没有可读的本地媒体。');
    try {
      return await this.readAssetVerified(asset);
    } catch (error) {
      if (error instanceof LocalMediaError && error.code === 'corrupt') {
        await (await this.assets()).update(asset, { stage: 'broken' });
      }
      throw error;
    }
  }
  private async deleteAssetUnlocked(asset: LocalMediaAsset) {
    const name = this.assetName(asset),
      repo = await this.assets();
    const deleting = asset.stage === 'deleting' ? asset : await repo.update(asset, { stage: 'deleting' });
    for (const meta of await this.db.storage.list())
      if (meta.opfsPath === name && meta.name === name) await this.db.storage.delete(meta.id);
    await this.filesystem.removeFile(name);
    await repo.remove(deleting);
    this.releasePreviews(`${asset.kind}:${asset.jobId}`);
  }
  private async recoverAssetsUnlocked(): Promise<void> {
    const repo = await this.assets(),
      assets = await repo.find({ where: emptyWhere }),
      metas = await this.db.storage.list();
    for (const asset of assets) {
      const name = this.assetName(asset);
      if (!['saving', 'ready', 'broken', 'deleting'].includes(asset.stage))
        throw new LocalMediaError('corrupt', '本地媒体恢复状态无效，不覆盖记录。');
      if (asset.stage === 'deleting') {
        await this.deleteAssetUnlocked(asset);
        continue;
      }
      if (asset.stage === 'saving') {
        const meta = metas.find(item => item.opfsPath === name && item.name === name);
        if (!meta) {
          await this.deleteAssetUnlocked(asset);
          continue;
        }
        const linked = await repo.update(asset, { fileId: meta.id });
        try {
          await this.readAssetVerified(linked, false);
        } catch (error) {
          if (error instanceof LocalMediaError && error.code === 'corrupt') {
            await this.deleteAssetUnlocked(linked);
            continue;
          }
          throw error;
        }
        await repo.update(linked, { stage: 'ready' });
      } else if (asset.stage === 'ready') {
        try {
          await this.readAssetVerified(asset, false);
        } catch (error) {
          if (error instanceof LocalMediaError && error.code === 'corrupt') {
            await repo.update(asset, { stage: 'broken' });
          } else throw error;
        }
      }
    }
    const retained = new Set((await repo.find({ where: emptyWhere })).map(asset => this.assetName(asset)));
    const owned = (name: string) =>
      /^(audio|video)-[0-9a-f-]+\.(wav|mp4)$/.test(name) &&
      ((name.startsWith('audio-') && name.endsWith('.wav')) || (name.startsWith('video-') && name.endsWith('.mp4'))) &&
      uuid.test(name.slice(6, -4));
    for (const meta of await this.db.storage.list())
      if (owned(meta.name) && meta.opfsPath === meta.name && !retained.has(meta.name))
        await this.db.storage.delete(meta.id);
    const orphans: string[] = [];
    for await (const entry of this.filesystem.list('/'))
      if (entry.kind === 'file' && owned(entry.name) && !retained.has(entry.name)) orphans.push(entry.name);
    for (const name of orphans) await this.filesystem.removeFile(name);
  }
}

// Compatibility name for existing browser consumers; both names use explicit runtime selection.
export { LocalMediaStore as BrowserMediaStore };
