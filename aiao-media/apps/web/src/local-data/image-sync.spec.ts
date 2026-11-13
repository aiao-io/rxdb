import { describe, expect, it, vi } from 'vitest';
import type { ProductAuthorization } from '../app/supabase-auth';
import { ImageSyncController, type RemoteFileRecord } from './image-sync';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const jobId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const png = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jV1kAAAAASUVORK5CYII='),
  char => char.charCodeAt(0)
);
const job = {
  id: jobId,
  request: {
    kind: 'image',
    operation: 'text-to-image',
    providerInstanceId: userId,
    providerRevision: 1,
    modelId: 'fixture',
    prompt: '同步图片'
  },
  status: 'completed',
  createdAt: '2026-10-30T00:00:00Z',
  updatedAt: '2026-10-30T00:00:00Z',
  delivery: { status: 'available', expiresAt: null, acknowledgedAt: null },
  failure: null
} as never;
const access = {
  config: { url: 'https://abcdefghijklmnopqrst.supabase.co', anonKey: 'sb_publishable_fixture' },
  userId,
  session: { access_token: 'user-token' }
} as unknown as ProductAuthorization;

const digestOf = async (bytes: Uint8Array<ArrayBuffer>) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(value => value.toString(16).padStart(2, '0'))
    .join('');
const fileRecord = async (overrides: Partial<RemoteFileRecord> = {}): Promise<RemoteFileRecord> => {
  const digest = await digestOf(png);
  return {
    id: '44444444-4444-4444-8444-444444444444',
    workspaceId,
    sourceId: jobId,
    version: digest,
    path: `${userId}/${workspaceId}/${jobId}/${digest}.png`,
    mimeType: 'image/png',
    width: 1,
    height: 1,
    bytes: png.byteLength,
    sha256: digest,
    status: 'pending',
    deleted: false,
    revision: 1,
    baseRevision: 0,
    ...overrides
  };
};
const pngStore = (bytes = png) => {
  const preferences = new Map<string, { payload: string; revision: number }>();
  return {
    preferences,
    backupImage: vi.fn(async () => ({ blob: new Blob([bytes], { type: 'image/png' }) })),
    saveResult: vi.fn(),
    preference: vi.fn(async (key: string) => preferences.get(key) ?? null),
    savePreference: vi.fn(async (key: string, payload: string, revision: number | null) => {
      expect(key).toMatch(/^[a-z0-9-]{1,80}$/);
      if ((preferences.get(key)?.revision ?? null) !== revision) throw new Error('另一标签页已修改传输记录');
      const next = (revision ?? 0) + 1;
      preferences.set(key, { payload, revision: next });
      return next;
    })
  };
};

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}
const isRecords = (call: Call) => call.url.includes('/rest/v1/media_file_records');
/** 记录请求并按路由应答；像浏览器 fetch 一样，信号已中止的请求直接拒绝。 */
function remote(route: (call: Call) => Response | undefined) {
  const calls: Call[] = [];
  const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    init?.signal?.throwIfAborted();
    const call = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(new Headers(init?.headers)),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body
    };
    if (call.url.includes('/rpc/media_image_upload_allowed')) return Response.json(true);
    calls.push(call);
    return route(call) ?? new Response(null, { status: 200 });
  });
  return { calls, request };
}

describe('平台 Supabase 图片同步', () => {
  it('已移出图库的作品在上传字节前拒绝，已有 uploaded 回执也要重新核对许可', async () => {
    const uploaded = await fileRecord({ status: 'uploaded' });
    const request = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('/media_image_upload_allowed') ? Response.json(false) : Response.json([uploaded])
    );
    await expect(
      new ImageSyncController(pngStore() as never, access, workspaceId, request).upload(jobId)
    ).rejects.toThrow('已从同步图库移除');
    expect(request.mock.calls.some(([input]) => String(input).includes('/storage/v1/'))).toBe(false);
  });
  it('原字节回读期间图库被移除，不复用旧 uploaded 回执报告成功', async () => {
    const uploaded = await fileRecord({ status: 'uploaded' });
    let checks = 0;
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      init?.signal?.throwIfAborted();
      const url = String(input);
      if (url.includes('/media_image_upload_allowed')) return Response.json(++checks === 1);
      return url.includes('/media_file_records') ? Response.json([uploaded]) : new Response(png);
    });
    await expect(
      new ImageSyncController(pngStore() as never, access, workspaceId, request).upload(jobId)
    ).rejects.toThrow('已从同步图库移除');
    expect(checks).toBe(2);
    expect(request.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
  });
  it('远端接收进度到达总字节后仍等待原字节核对与关联提交', async () => {
    const record = await fileRecord();
    let resolveRead!: (response: Response) => void;
    const reading = new Promise<Response>(resolve => {
      resolveRead = resolve;
    });
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/rpc/media_image_upload_allowed')) return Response.json(true);
      if (String(input).includes('/rest/v1/'))
        return Response.json([{ ...record, status: init?.method === 'PATCH' ? 'uploaded' : 'pending' }]);
      return init?.method === 'POST' ? new Response(null, { status: 200 }) : reading;
    });
    const progress = vi.fn();
    const uploading = new ImageSyncController(pngStore() as never, access, workspaceId, request).upload(
      jobId,
      undefined,
      progress
    );
    try {
      await vi.waitFor(() => expect(progress).toHaveBeenLastCalledWith(png.length));
      expect(request.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
    } finally {
      resolveRead(new Response(png));
    }
    expect(await uploading).toMatchObject({ status: 'uploaded' });
  });
  it('已入队原图身份变化时在网络请求前拒绝，避免换字节上传', async () => {
    const request = vi.fn();
    const controller = new ImageSyncController(pngStore() as never, access, workspaceId, request);
    await expect(controller.upload(jobId, { sha256: 'a'.repeat(64), bytes: png.length })).rejects.toThrow(
      '已选队列版本'
    );
    expect(request).not.toHaveBeenCalled();
    await expect(controller.upload(jobId, { sha256: await digestOf(png), bytes: 1 })).rejects.toThrow('已选队列版本');
    expect(request).not.toHaveBeenCalled();
  });

  it('自建 HTTPS IP 的原图请求使用自己的 Storage 服务', async () => {
    const uploaded = await fileRecord({ status: 'uploaded' });
    const { calls, request } = remote(call =>
      isRecords(call) ? Response.json([uploaded]) : new Response(new Blob([png], { type: 'image/png' }))
    );
    const selfHosted = { ...access, config: { ...access.config, url: 'https://47.103.117.118' } };
    await new ImageSyncController(pngStore() as never, selfHosted, workspaceId, request).download(
      jobId,
      uploaded.sha256,
      job
    );
    const storage = calls.find(call => call.url.includes('/storage/v1/'));
    expect(storage?.url).toBe(
      `https://47.103.117.118/storage/v1/object/authenticated/aiao-media-images/${uploaded.path}`
    );
  });

  it('显式 Storage 地址优先于托管项目默认地址', async () => {
    const uploaded = await fileRecord({ status: 'uploaded' });
    const { calls, request } = remote(call =>
      isRecords(call) ? Response.json([uploaded]) : new Response(new Blob([png], { type: 'image/png' }))
    );
    const configured = { ...access, config: { ...access.config, storageUrl: 'https://storage.example.test' } };
    await new ImageSyncController(pngStore() as never, configured, workspaceId, request).download(
      jobId,
      uploaded.sha256,
      job
    );
    expect(calls.find(call => call.url.includes('/storage/v1/'))?.url).toMatch(/^https:\/\/storage.example.test\//);
  });

  it.each([
    ['/storage/v1/upload/resumable/upload-id', true],
    ['https://evil.example/storage/v1/upload/resumable/id', false],
    ['/auth/v1/steal-token', false],
    ['https://user:password@47.103.117.118/storage/v1/upload/resumable/id', false]
  ])('自建 IP 续传回执 %s 的可信检查为 %s', async (location, allowed) => {
    const large = new Uint8Array(6 * 1024 * 1024 + 1);
    large.set(png);
    const digest = await digestOf(large);
    const pending = await fileRecord({
      version: digest,
      sha256: digest,
      bytes: large.byteLength,
      path: `${userId}/${workspaceId}/${jobId}/${digest}.png`
    });
    const { calls, request } = remote(call => {
      if (call.url.includes('/object/authenticated/')) return new Response(new Blob([large]));
      if (call.url.endsWith('/upload/resumable')) return new Response(null, { status: 201, headers: { location } });
      if (call.method === 'PATCH' && !isRecords(call))
        return new Response(null, {
          status: 204,
          headers: {
            'upload-offset': String(Number(call.headers['upload-offset']) + (call.body as ArrayBuffer).byteLength)
          }
        });
      if (!isRecords(call)) return undefined;
      if (call.method === 'GET') return Response.json([]);
      if (call.method === 'POST') return Response.json([pending], { status: 201 });
      return Response.json([{ ...pending, status: 'uploaded', revision: 2, baseRevision: 1 }]);
    });
    const configured = { ...access, config: { ...access.config, url: 'https://47.103.117.118' } };
    const upload = new ImageSyncController(pngStore(large) as never, configured, workspaceId, request).upload(jobId);
    if (allowed) await expect(upload).resolves.toMatchObject({ status: 'uploaded' });
    else await expect(upload).rejects.toThrow('未授权');
    const chunks = calls.filter(call => call.method === 'PATCH' && !isRecords(call));
    expect(chunks).toHaveLength(allowed ? 2 : 0);
    expect(chunks.every(call => call.url === 'https://47.103.117.118/storage/v1/upload/resumable/upload-id')).toBe(
      true
    );
  });

  it.each([
    { version: 'b'.repeat(64) },
    { mimeType: 'image/jpeg' as const },
    { width: 2 },
    { height: 2 },
    { deleted: true }
  ])('文件关联元数据与原图不一致时拒绝复用回执：%j', async patch => {
    const record = await fileRecord({ status: 'uploaded', ...patch });
    const { calls, request } = remote(() => Response.json([record]));
    await expect(
      new ImageSyncController(pngStore() as never, access, workspaceId, request).upload(jobId)
    ).rejects.toThrow('回执与原图');
    expect(calls).toHaveLength(1);
  });
  it.each([200, 409])('对象写入返回 %s 后必须读取原字节，错误内容不得提交已上传', async status => {
    const pending = await fileRecord();
    const changed = png.slice();
    changed[changed.length - 1] ^= 1;
    const { calls, request } = remote(call => {
      if (isRecords(call)) return Response.json([pending]);
      if (call.method === 'POST') return new Response(null, { status });
      return new Response(changed);
    });
    await expect(
      new ImageSyncController(pngStore() as never, access, workspaceId, request).upload(jobId)
    ).rejects.toThrow('完整性');
    expect(
      calls.some(call => call.url.includes('/object/authenticated/aiao-media-images/') && call.method === 'GET')
    ).toBe(true);
    expect(
      calls
        .filter(call => isRecords(call) && call.method === 'PATCH')
        .every(call => (call.body as Partial<RemoteFileRecord>).status === 'needs_review')
    ).toBe(true);
  });
  it.each(['empty', 'short', 'long'] as const)('远端原字节 %s 时拒绝完成，超限流及时取消', async scenario => {
    const uploaded = await fileRecord({ status: 'uploaded' });
    const cancel = vi.fn();
    const { request } = remote(call => {
      if (isRecords(call)) return Response.json([uploaded]);
      if (scenario === 'empty') return new Response(null);
      if (scenario === 'short') return new Response(png.slice(0, -1));
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(png);
            controller.enqueue(new Uint8Array([1]));
          },
          cancel
        })
      );
    });
    await expect(
      new ImageSyncController(pngStore() as never, access, workspaceId, request).upload(jobId)
    ).rejects.toThrow('完整性');
    if (scenario === 'long') expect(cancel).toHaveBeenCalledOnce();
  });
  it('拒绝异常远端长度后不分配无界原图缓存或写入本机', async () => {
    const uploaded = await fileRecord({ status: 'uploaded', bytes: 16 * 1024 * 1024 + 1 });
    const { calls, request } = remote(() => Response.json([uploaded]));
    const store = pngStore();
    await expect(
      new ImageSyncController(store as never, access, workspaceId, request).download(jobId, uploaded.sha256, job)
    ).rejects.toThrow('文件限制');
    expect(calls).toHaveLength(1);
    expect(store.saveResult).not.toHaveBeenCalled();
  });
  it('已有 uploaded 记录仍核对远端对象，不以数据库状态代替原字节证据', async () => {
    const uploaded = await fileRecord({ status: 'uploaded' });
    const { calls, request } = remote(call => (isRecords(call) ? Response.json([uploaded]) : new Response('wrong')));
    await expect(
      new ImageSyncController(pngStore() as never, access, workspaceId, request).upload(jobId)
    ).rejects.toThrow('完整性');
    expect(calls.some(call => !isRecords(call) && call.method === 'POST')).toBe(false);
  });
  it('远端原字节核对失败保留 HTTP 状态，供持久队列限次退避', async () => {
    const pending = await fileRecord();
    const { request } = remote(call => {
      if (isRecords(call)) return Response.json([pending]);
      return new Response(null, { status: call.method === 'POST' ? 200 : 503 });
    });
    await expect(
      new ImageSyncController(pngStore() as never, access, workspaceId, request).upload(jobId)
    ).rejects.toMatchObject({ status: 503 });
  });
  it('首次上传先 INSERT 待传记录，原图写入后按 id 与修订 UPDATE 为已上传，不用 upsert', async () => {
    const pending = await fileRecord();
    const { calls, request } = remote(call => {
      if (call.url.includes('/object/authenticated/')) return new Response(new Blob([png]));
      if (!isRecords(call)) return undefined;
      if (call.method === 'GET') return Response.json([]);
      if (call.method === 'POST') return Response.json([pending], { status: 201 });
      return Response.json([{ ...pending, status: 'uploaded', revision: 2, baseRevision: 1 }]);
    });
    const store = pngStore();

    const result = await new ImageSyncController(store as never, access, workspaceId, request).upload(jobId);

    expect(result).toMatchObject({ status: 'uploaded', revision: 2 });
    expect(store.backupImage).toHaveBeenCalledWith(jobId);
    expect(calls[0].url).toContain(`sourceId=eq.${jobId}&version=eq.${pending.sha256}`);
    const insert = calls.findIndex(call => isRecords(call) && call.method === 'POST');
    const object = calls.findIndex(call => call.url.includes('/storage/v1/object/aiao-media-images/'));
    const commit = calls.findIndex(call => isRecords(call) && call.method === 'PATCH');
    expect(insert).toBeGreaterThan(0);
    expect(object).toBeGreaterThan(insert);
    expect(commit).toBeGreaterThan(object);
    expect(calls[insert].headers['prefer']).not.toContain('merge-duplicates');
    expect(calls[insert].body).toMatchObject({ status: 'pending', version: pending.sha256, path: pending.path });
    expect(Object.keys(calls[insert].body as object)).not.toEqual(
      expect.arrayContaining(['id', 'revision', 'baseRevision'])
    );
    expect(calls[commit].url).toContain(`id=eq.${pending.id}&revision=eq.1`);
    expect(calls[commit].body).toEqual({ status: 'uploaded', revision: 2, baseRevision: 1, updatedBy: userId });
    expect(calls.filter(call => call.method === 'PATCH')).toHaveLength(1);
    expect(JSON.stringify(calls)).not.toContain('service_role');
  });

  it('续用上次停在 needs_review 的记录：对象已存在时按它的修订提交，不新建记录', async () => {
    const stalled = await fileRecord({ status: 'needs_review', revision: 3, baseRevision: 2 });
    const { calls, request } = remote(call => {
      if (call.url.includes('/object/authenticated/')) return new Response(new Blob([png]));
      if (call.url.includes('/storage/v1/object/')) return new Response(null, { status: 409 });
      if (!isRecords(call)) return undefined;
      if (call.method === 'GET') return Response.json([stalled]);
      return Response.json([{ ...stalled, status: 'uploaded', revision: 4, baseRevision: 3 }]);
    });

    const result = await new ImageSyncController(pngStore() as never, access, workspaceId, request).upload(jobId);

    expect(result.status).toBe('uploaded');
    expect(calls.some(call => isRecords(call) && call.method === 'POST')).toBe(false);
    const commits = calls.filter(call => call.method === 'PATCH');
    expect(commits).toHaveLength(1);
    expect(commits[0].url).toContain('revision=eq.3');
    expect(commits[0].body).toMatchObject({ status: 'uploaded', revision: 4, baseRevision: 3 });
  });

  it('另一设备抢先建记录并提交同一版本时改用那一条，按远端现状确认而不覆盖', async () => {
    const theirs = await fileRecord();
    const reads = [[], [theirs], [{ ...theirs, status: 'uploaded', revision: 2, baseRevision: 1 }]];
    const { calls, request } = remote(call => {
      if (call.url.includes('/object/authenticated/')) return new Response(new Blob([png]));
      if (!isRecords(call)) return undefined;
      if (call.method === 'GET') return Response.json(reads.shift());
      if (call.method === 'POST') return Response.json({ code: '23505' }, { status: 409 });
      return Response.json([]);
    });

    const result = await new ImageSyncController(pngStore() as never, access, workspaceId, request).upload(jobId);

    expect(result).toMatchObject({ id: theirs.id, status: 'uploaded', revision: 2 });
    expect(reads).toEqual([]);
    expect(calls.filter(call => call.method === 'PATCH')).toHaveLength(1);
  });

  it('大图对象已存在（续传创建返回 409）时核对原字节再提交，不再传分片', async () => {
    const large = new Uint8Array(6 * 1024 * 1024 + 1);
    large.set(png);
    const digest = await digestOf(large);
    const pending = await fileRecord({
      version: digest,
      sha256: digest,
      bytes: large.byteLength,
      path: `${userId}/${workspaceId}/${jobId}/${digest}.png`
    });
    const { calls, request } = remote(call => {
      if (call.url.includes('/object/authenticated/')) return new Response(new Blob([large]));
      if (call.url.endsWith('/upload/resumable')) return new Response(null, { status: 409 });
      if (!isRecords(call)) return undefined;
      if (call.method === 'GET') return Response.json([]);
      if (call.method === 'POST') return Response.json([pending], { status: 201 });
      return Response.json([{ ...pending, status: 'uploaded', revision: 2, baseRevision: 1 }]);
    });

    const result = await new ImageSyncController(pngStore(large) as never, access, workspaceId, request).upload(jobId);

    expect(result.status).toBe('uploaded');
    expect(calls.filter(call => call.method === 'PATCH' && !isRecords(call))).toHaveLength(0);
  });

  it('未注入请求函数时直接调用全局 fetch，不把它挂在控制器上调用', async () => {
    const browserFetch = vi.fn(function (this: unknown) {
      // 浏览器的 fetch 只接受 Window 作接收者，挂到别的对象上调用会抛 Illegal invocation。
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
      return Promise.resolve(Response.json([]));
    });
    vi.stubGlobal('fetch', browserFetch);
    try {
      await expect(new ImageSyncController(pngStore() as never, access, workspaceId).records(jobId)).resolves.toEqual(
        []
      );
      expect(browserFetch).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('下载按作品摘要精确取版本，同一来源的其他版本不会被当成当前原图', async () => {
    const current = await fileRecord({ status: 'uploaded', revision: 2, baseRevision: 1 });
    const other = 'b'.repeat(64);
    const older = {
      ...current,
      id: '55555555-5555-4555-8555-555555555555',
      version: other,
      sha256: other,
      path: `${userId}/${workspaceId}/${jobId}/${other}.png`
    };
    const { calls, request } = remote(call =>
      isRecords(call) ? Response.json([older, current]) : new Response(new Blob([png], { type: 'image/png' }))
    );
    const store = pngStore();

    await new ImageSyncController(store as never, access, workspaceId, request).download(jobId, current.sha256, job);

    expect(calls[0].url).toContain(`sourceId=eq.${jobId}&version=eq.${current.sha256}`);
    expect(calls[1].url).toContain(current.path);
    expect(store.saveResult).toHaveBeenCalledWith(job, expect.any(Blob));
  });

  it('下载私有对象后校验字节，摘要不匹配时拒绝落盘', async () => {
    const digest = 'a'.repeat(64);
    const record = await fileRecord({
      status: 'uploaded',
      version: digest,
      sha256: digest,
      path: `${userId}/${workspaceId}/${jobId}/${digest}.png`
    });
    const { request } = remote(call =>
      isRecords(call) ? Response.json([record]) : new Response(new Blob([png], { type: 'image/png' }))
    );
    const store = pngStore();

    await expect(
      new ImageSyncController(store as never, access, workspaceId, request).download(jobId, digest, job)
    ).rejects.toThrow('完整性');
    expect(store.saveResult).not.toHaveBeenCalled();
  });

  it.each(['missing', 'pending', 'needs_review'] as const)(
    '原图 %s 时提示回有原图设备补传，不请求 Storage 或落盘',
    async status => {
      const record = await fileRecord({ status: status === 'missing' ? 'pending' : status });
      const { calls, request } = remote(call =>
        isRecords(call) ? Response.json(status === 'missing' ? [] : [record]) : undefined
      );
      const store = pngStore();

      await expect(
        new ImageSyncController(store as never, access, workspaceId, request).download(jobId, record.sha256, job)
      ).rejects.toThrow('请在有原图的设备打开“设置图片同步范围”，选择“已有及以后保存的图片”并确认');

      expect(calls).toHaveLength(1);
      expect(store.saveResult).not.toHaveBeenCalled();
    }
  );

  it('同步目标变化后中止：取回的原图不再写入本机', async () => {
    const scope = new AbortController();
    const current = await fileRecord({ status: 'uploaded' });
    const { request } = remote(call => {
      if (isRecords(call)) return Response.json([current]);
      scope.abort(new Error('同步目标已变化'));
      return new Response(new Blob([png], { type: 'image/png' }));
    });
    const store = pngStore();

    await expect(
      new ImageSyncController(store as never, access, workspaceId, request, scope.signal).download(
        jobId,
        current.sha256,
        job
      )
    ).rejects.toThrow('同步目标已变化');
    expect(store.saveResult).not.toHaveBeenCalled();
  });

  it('同步目标变化后中止：已写入的对象不再提交记录，也不标记待核对', async () => {
    const scope = new AbortController();
    const pending = await fileRecord();
    const { calls, request } = remote(call => {
      if (isRecords(call)) return call.method === 'GET' ? Response.json([]) : Response.json([pending], { status: 201 });
      scope.abort(new Error('同步目标已变化'));
      return new Response(null, { status: 200 });
    });

    await expect(
      new ImageSyncController(pngStore() as never, access, workspaceId, request, scope.signal).upload(jobId)
    ).rejects.toThrow('同步目标已变化');
    expect(calls.some(call => call.method === 'PATCH')).toBe(false);
  });
  it('大图分片应答丢失后重开控制器，先核对同一会话的服务端 offset，只传剩余字节', async () => {
    const bytes = new Uint8Array(6 * 1024 * 1024 + 7);
    bytes.set(png);
    const digest = await digestOf(bytes);
    let record = await fileRecord({
      bytes: bytes.length,
      version: digest,
      sha256: digest,
      path: `${userId}/${workspaceId}/${jobId}/${digest}.png`
    });
    const store = pngStore(bytes);
    let offset = 0;
    let loseReceipt = true;
    const { calls, request } = remote(call => {
      if (call.url.includes('/object/authenticated/')) return new Response(new Blob([bytes]));
      if (isRecords(call)) {
        if (call.method === 'GET') return Response.json([record]);
        record = { ...record, ...(call.body as Partial<RemoteFileRecord>) };
        return Response.json([record]);
      }
      if (call.method === 'POST')
        return new Response(null, { status: 201, headers: { location: '/storage/v1/upload/resumable/same-session' } });
      if (call.method === 'HEAD')
        return new Response(null, {
          status: 200,
          headers: { 'upload-offset': String(offset), 'upload-length': String(bytes.length) }
        });
      expect(Number(call.headers['upload-offset'])).toBe(offset);
      offset += (call.body as Uint8Array).byteLength;
      if (loseReceipt) {
        loseReceipt = false;
        throw new TypeError('response lost');
      }
      return new Response(null, { status: 204, headers: { 'upload-offset': String(offset) } });
    });
    await expect(new ImageSyncController(store as never, access, workspaceId, request).upload(jobId)).rejects.toThrow(
      'response lost'
    );
    expect(offset).toBe(6 * 1024 * 1024);
    expect(store.preferences.size).toBe(1);
    expect(JSON.stringify([...store.preferences])).not.toContain('user-token');
    await expect(
      new ImageSyncController(store as never, access, workspaceId, request).upload(jobId)
    ).resolves.toMatchObject({ status: 'uploaded' });
    expect(calls.filter(call => !isRecords(call) && call.method === 'POST')).toHaveLength(1);
    expect(calls.filter(call => call.method === 'HEAD')).toHaveLength(1);
    expect(
      calls
        .filter(call => !isRecords(call) && call.method === 'PATCH')
        .map(call => (call.body as Uint8Array).byteLength)
    ).toEqual([6 * 1024 * 1024, 7]);
  });

  it.each(['missing', 'too-large', 'wrong-length'] as const)(
    'TUS 续传 %s 回执不能当成完整上传并提交文件关联',
    async scenario => {
      const bytes = new Uint8Array(6 * 1024 * 1024 + 7);
      bytes.set(png);
      const digest = await digestOf(bytes);
      const record = await fileRecord({
        bytes: bytes.length,
        version: digest,
        sha256: digest,
        path: `${userId}/${workspaceId}/${jobId}/${digest}.png`
      });
      const { calls, request } = remote(call => {
        if (isRecords(call)) return Response.json([record]);
        if (call.method === 'POST')
          return new Response(null, {
            status: 201,
            headers: { location: '/storage/v1/upload/resumable/invalid-receipt' }
          });
        return new Response(null, {
          status: 204,
          headers:
            scenario === 'missing' ?
              {}
            : {
                'upload-offset': String(scenario === 'too-large' ? bytes.length + 1 : 1),
                'upload-length': String(bytes.length + 1)
              }
        });
      });
      await expect(
        new ImageSyncController(pngStore(bytes) as never, access, workspaceId, request).upload(jobId)
      ).rejects.toThrow('续传');
      expect(
        calls
          .filter(call => isRecords(call) && call.method === 'PATCH')
          .every(call => (call.body as Partial<RemoteFileRecord>).status === 'needs_review')
      ).toBe(true);
    }
  );
});
