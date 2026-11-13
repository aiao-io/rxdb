import { describe, expect, it, vi } from 'vitest';
import { uploadImageChunks } from './resumable-image-upload';

const endpoint = 'https://storage.example.test/storage/v1/upload/resumable';
const path = 'owner/workspace/work/immutable.png';
const bytes = new Uint8Array(6 * 1024 * 1024 + 11);
function journal() {
  let row: { payload: string; revision: number } | null = null;
  return {
    get row() {
      return row;
    },
    replace(payload: string) {
      row = { payload, revision: row!.revision };
    },
    preference: vi.fn(async () => row),
    savePreference: vi.fn(async (_key: string, payload: string, revision: number | null) => {
      if ((row?.revision ?? null) !== revision) throw new Error('传输记录已变化');
      row = { payload, revision: (revision ?? 0) + 1 };
      return row.revision;
    })
  };
}
async function interrupted() {
  const store = journal();
  const request = vi.fn(async (_url: string, init: RequestInit) => {
    if (init.method === 'POST') return new Response(null, { status: 201, headers: { location: `${endpoint}/first` } });
    throw new TypeError('offline');
  });
  await expect(uploadImageChunks(store, endpoint, path, bytes, 'image/png', request)).rejects.toThrow('offline');
  return store;
}
function complete(offset: number, length = bytes.length) {
  return new Response(null, {
    status: 204,
    headers: { 'upload-offset': String(offset), 'upload-length': String(length) }
  });
}

describe('持久 TUS 图片会话', () => {
  it('只在服务端 offset 核对且日志落盘后报告分片进度', async () => {
    const store = journal();
    const progress = vi.fn((offset: number) => expect(JSON.parse(store.row!.payload).offset).toBe(offset));
    const request = vi.fn(async (_url: string, init: RequestInit) =>
      init.method === 'POST' ?
        new Response(null, { status: 201, headers: { location: `${endpoint}/progress` } })
      : complete(Number(new Headers(init.headers).get('upload-offset')) + (init.body as ArrayBuffer).byteLength)
    );
    await uploadImageChunks(store, endpoint, path, bytes, 'image/png', request, progress);
    expect(progress.mock.calls.map(([offset]) => offset)).toEqual([0, 6 * 1024 * 1024, bytes.length]);
  });
  it('重开先报告 HEAD 核对的字节数，错误分片不增加进度', async () => {
    const store = await interrupted();
    const progress = vi.fn();
    const request = vi.fn(async (_url: string, init: RequestInit) =>
      complete(init.method === 'HEAD' ? 6 * 1024 * 1024 : bytes.length - 1)
    );
    await expect(uploadImageChunks(store, endpoint, path, bytes, 'image/png', request, progress)).rejects.toThrow(
      '进度不一致'
    );
    expect(progress).toHaveBeenCalledExactlyOnceWith(6 * 1024 * 1024);
  });
  it('未能保存续传日志时不显示未经持久确认的进度', async () => {
    const store = journal();
    store.savePreference.mockRejectedValue(new Error('设备只读'));
    const progress = vi.fn();
    await expect(
      uploadImageChunks(
        store,
        endpoint,
        path,
        bytes,
        'image/png',
        async () => new Response(null, { status: 201, headers: { location: `${endpoint}/progress` } }),
        progress
      )
    ).rejects.toThrow('设备只读');
    expect(progress).not.toHaveBeenCalled();
  });
  it.each([404, 410])('会话已过期（%s）时只重建当前文件，不沿用旧 offset', async status => {
    const store = await interrupted();
    const request = vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === 'HEAD') return new Response(null, { status });
      if (init.method === 'POST')
        return new Response(null, { status: 201, headers: { location: `${endpoint}/replacement` } });
      return complete(Number(new Headers(init.headers).get('upload-offset')) + (init.body as ArrayBuffer).byteLength);
    });
    await uploadImageChunks(store, endpoint, path, bytes, 'image/png', request);
    expect(request.mock.calls.map(([, init]) => init.method)).toEqual(['HEAD', 'POST', 'PATCH', 'PATCH']);
    const patches = request.mock.calls.filter(([, init]) => init.method === 'PATCH');
    expect(patches.every(([url]) => url === `${endpoint}/replacement`)).toBe(true);
    expect(new Headers(patches[0][1].headers).get('upload-offset')).toBe('0');
  });
  it.each([401, 403, 429, 500])('进度查询 %s 时保留会话且不自动重建', async status => {
    const store = await interrupted();
    const before = store.row!.payload;
    const request = vi.fn(async () => new Response(null, { status }));
    await expect(uploadImageChunks(store, endpoint, path, bytes, 'image/png', request)).rejects.toThrow('进度读取失败');
    expect(request).toHaveBeenCalledOnce();
    expect(store.row!.payload).toBe(before);
  });
  it('完整分片已接受但最后应答丢失时，仅 HEAD 核对，不重传任何字节', async () => {
    const store = await interrupted();
    const request = vi.fn(async () => complete(bytes.length));
    await uploadImageChunks(store, endpoint, path, bytes, 'image/png', request);
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]).toEqual([`${endpoint}/first`, expect.objectContaining({ method: 'HEAD' })]);
  });
  it.each<Record<string, string>>([
    { 'upload-offset': '1', 'upload-length': String(bytes.length + 1) },
    { 'upload-offset': '-1', 'upload-length': String(bytes.length) },
    { 'upload-offset': String(bytes.length + 1), 'upload-length': String(bytes.length) },
    { 'upload-offset': '1e3', 'upload-length': String(bytes.length) },
    { 'upload-length': String(bytes.length) }
  ])('无法核对服务端文件长度或 offset 时不发分片：%j', async headers => {
    const store = await interrupted();
    const request = vi.fn(async () => new Response(null, { status: 200, headers }));
    await expect(uploadImageChunks(store, endpoint, path, bytes, 'image/png', request)).rejects.toThrow('续传');
    expect(request).toHaveBeenCalledOnce();
  });
  it.each([
    { version: 2 },
    { path: 'other-file' },
    { bytes: bytes.length - 1 },
    { mimeType: 'image/jpeg' },
    { offset: -1 },
    { location: 'https://evil.example/storage/v1/upload/resumable/stolen' },
    { location: 'https://user:secret@storage.example.test/storage/v1/upload/resumable/stolen' },
    { location: `${endpoint}/first#fragment` }
  ])('本机会话被替换后保留原记录并停止，不向新地址发请求：%j', async changed => {
    const store = await interrupted();
    store.replace(JSON.stringify({ ...JSON.parse(store.row!.payload), ...changed }));
    const before = store.row!.payload;
    const request = vi.fn(async () => complete(bytes.length));
    await expect(uploadImageChunks(store, endpoint, path, bytes, 'image/png', request)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
    expect(store.row!.payload).toBe(before);
  });
  it('写入设备续传日志失败时不发送分片，不把不可恢复的会话当成成功', async () => {
    const store = journal();
    store.savePreference.mockRejectedValueOnce(new Error('device full'));
    const request = vi.fn(async () => new Response(null, { status: 201, headers: { location: `${endpoint}/new` } }));
    await expect(uploadImageChunks(store, endpoint, path, bytes, 'image/png', request)).rejects.toThrow('device full');
    expect(request).toHaveBeenCalledOnce();
    expect(store.row).toBeNull();
  });
});
