import { ImageSyncController } from '../../apps/web/src/local-data/image-sync.ts';

const digest = async bytes =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(value => value.toString(16).padStart(2, '0'))
    .join('');

function journal() {
  return {
    async preference(key) {
      return JSON.parse(localStorage.getItem(key));
    },
    async savePreference(key, payload, revision) {
      const saved = JSON.parse(localStorage.getItem(key));
      if ((saved?.revision ?? null) !== revision) throw new Error('JOURNAL_REVISION_CONFLICT');
      const next = (revision ?? 0) + 1;
      localStorage.setItem(key, JSON.stringify({ revision: next, payload }));
      return next;
    }
  };
}

/** 使用产品传输控制器、真实浏览器 CORS 和私有 Storage；本机文件夹与日志在验收页隔离。 */
globalThis.imageStorageAcceptance = async ({
  url,
  anonKey,
  userId,
  session,
  workspaceId,
  sourceId,
  fixture,
  interrupt
}) => {
  const response = await fetch(`/fixtures/${fixture}`);
  const bytes = await response.arrayBuffer();
  const mime = response.headers.get('content-type');
  const progress = [];
  const calls = [];
  let saved = null;
  let cut = interrupt;
  const store = {
    ...journal(),
    backupImage: async () => ({ blob: new Blob([bytes], { type: mime }) }),
    saveResult: async (job, blob) => {
      const image = await createImageBitmap(blob);
      try {
        saved = {
          jobId: job.id,
          digest: await digest(await blob.arrayBuffer()),
          bytes: blob.size,
          width: image.width,
          height: image.height
        };
      } finally {
        image.close();
      }
    }
  };
  const request = async (input, init) => {
    const call = {
      method: init?.method ?? 'GET',
      path: new URL(input).pathname,
      offset: init?.headers?.['upload-offset'] ?? null
    };
    calls.push(call);
    const result = await fetch(input, init);
    call.status = result.status;
    if (!result.ok && call.path.includes('/object/')) call.error = await result.clone().json();
    const path = new URL(input).pathname;
    if (cut === 'chunk' && init?.method === 'PATCH' && result.ok && init.headers['upload-offset'] === '0') {
      cut = false;
      throw new Error('ACCEPTANCE_CHUNK_ACK_LOST');
    }
    if (cut === 'object' && init?.method === 'POST' && result.ok && path.includes('/object/aiao-media-images/')) {
      cut = false;
      throw new Error('ACCEPTANCE_OBJECT_ACK_LOST');
    }
    if (
      cut === 'record' &&
      init?.method === 'PATCH' &&
      result.ok &&
      path.endsWith('/media_file_records') &&
      JSON.parse(init.body).status === 'uploaded'
    ) {
      cut = false;
      throw new Error('ACCEPTANCE_RECORD_ACK_LOST');
    }
    return result;
  };
  const controller = new ImageSyncController(
    store,
    { config: { url, anonKey, storageUrl: url }, userId, session },
    workspaceId,
    request
  );
  try {
    const record = await controller.upload(sourceId, undefined, offset => progress.push(offset));
    await controller.download(sourceId, record.sha256, { id: sourceId });
    return { record, progress, calls, saved };
  } catch (error) {
    return { error: error.message, progress, calls };
  }
};
