import { Blob as NodeBlob } from 'node:buffer';
import { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bounded,
  providerBase,
  ProviderFailure,
  publicProvider,
  responseImage,
  type LocalProvider
} from './local-provider';

const provider: LocalProvider = {
  id: '10000000-0000-4000-8000-000000000001',
  name: '测试供应商',
  baseUrl: 'https://provider.example/v1',
  model: 'fixture-model',
  mode: 'direct',
  rememberKey: false
};
function png(width = 1024, height = 1024) {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([73, 72, 68, 82], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}
const encoded = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (
  data: unknown,
  protocol: 'openai' | 'minimax' = 'openai',
  ratio: 'square' | 'landscape' | 'portrait' = 'square'
) => responseImage(protocol, new TextEncoder().encode(JSON.stringify(data)), ratio, new AbortController().signal);
const answer = (bytes = png()) => ({ data: [{ b64_json: encoded(bytes) }] });

beforeEach(() => {
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('fetch', vi.fn());
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async (blob: Blob) => {
      const view = new DataView(await blob.arrayBuffer());
      return { width: view.getUint32(16), height: view.getUint32(20), close: vi.fn() };
    })
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('public provider configuration', () => {
  it('normalizes a base URL and selects only public fields', () => {
    expect(providerBase(' https://provider.example/v1/// ')).toBe(provider.baseUrl);
    expect(publicProvider({ ...provider, name: ' 测试供应商 ', apiKey: 'private', extra: true })).toEqual(provider);
  });
  it.each([
    'invalid',
    'http://provider.example',
    'https://user:secret@provider.example',
    'https://provider.example/?key=secret',
    'https://provider.example/#secret'
  ])('rejects unsafe base URL %s', value => {
    expect(() => providerBase(value)).toThrow('Base URL');
  });
  it.each([
    null,
    {},
    { ...provider, id: 'invalid' },
    { ...provider, name: '' },
    { ...provider, name: 'a'.repeat(81) },
    { ...provider, model: 'invalid model' },
    { ...provider, mode: 'unknown' },
    { ...provider, rememberKey: 'yes' }
  ])('rejects invalid saved provider fields', value => {
    expect(() => publicProvider(value)).toThrow('供应商配置无效');
  });
});

describe('bounded provider responses', () => {
  it('combines streamed bytes in order', async () => {
    const stream = new NodeReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3]));
        controller.close();
      }
    });
    expect(await bounded(new Response(stream as unknown as ReadableStream), 3)).toEqual(new Uint8Array([1, 2, 3]));
  });
  it('rejects a missing body and cancels streams exceeding the byte limit', async () => {
    await expect(bounded(new Response(null), 1)).rejects.toThrow('响应为空');
    const cancel = vi.fn();
    const stream = new NodeReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(4));
      },
      cancel
    });
    await expect(bounded(new Response(stream as unknown as ReadableStream), 3)).rejects.toThrow('响应过大');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(stream.locked).toBe(false);
  });
});

describe('平台图片响应本机校验', () => {
  it.each([
    ['square', 1024, 1024],
    ['landscape', 1536, 1024],
    ['portrait', 1024, 1536]
  ] as const)('%s 原图保持字节并关闭解码位图，不调用生成接口', async (ratio, width, height) => {
    const close = vi.fn();
    vi.mocked(createImageBitmap).mockResolvedValue({ width, height, close } as unknown as ImageBitmap);
    const blob = await decode(answer(png(width, height)), 'openai', ratio);
    expect(blob.type).toBe('image/png');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(png(width, height));
    expect(close).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('只下载返回的原图地址，省略凭据、Cookie 与来源', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(png()));
    const blob = await decode({ data: [{ url: 'https://images.example/result.png' }] });
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(png());
    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe('https://images.example/result.png');
    expect(options).toMatchObject({
      credentials: 'omit',
      cache: 'no-store',
      mode: 'cors',
      redirect: 'error',
      referrerPolicy: 'no-referrer'
    });
    expect(options?.headers).toBeUndefined();
    expect(options?.method).toBeUndefined();
  });
  it.each(['http://images.example/image.png', 'https://user:secret@images.example/image.png'])(
    '拒绝不安全原图地址 %s',
    async url => {
      await expect(decode({ data: [{ url }] })).rejects.toThrow('图片地址无效');
      expect(fetch).not.toHaveBeenCalled();
    }
  );
  it.each([401, 404, 500])('原图读取失败 HTTP %i 不自动重发生成', async status => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status }));
    await expect(decode({ data: [{ url: 'https://images.example/result.png' }] })).rejects.toMatchObject({
      rejected: false
    });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('原图下载断网保留失败，不发第二次请求', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network failed'));
    await expect(decode({ data: [{ url: 'https://images.example/result.png' }] })).rejects.toThrow('network failed');
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each([
    { error: 'private upstream', status: 401 },
    { error: 'private upstream', status: 'bad' },
    { error: 'private upstream', status: 1000 },
    { error: 'private upstream', status: 429, proxyRejected: true }
  ])('错误 envelope 不泄露原始信息，不信任伪造的拒绝标记', async value => {
    const failure = await decode(value).catch(error => error);
    expect(failure).toBeInstanceOf(ProviderFailure);
    expect(failure.rejected).toBe(false);
    expect(String(failure)).not.toContain('private upstream');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    null,
    {},
    { data: [] },
    { data: [{}, {}] },
    { data: [{}] },
    { data: [{ b64_json: '' }] },
    { data: [{ b64_json: '!!!' }] },
    { data: [{ b64_json: encoded(new Uint8Array(24)) }] }
  ])('拒绝缺失、损坏或多张结果', async value => {
    await expect(decode(value)).rejects.toBeInstanceOf(ProviderFailure);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    [0, 1024],
    [5000, 5000],
    [1024, 512]
  ])('拒绝异常方图尺寸 %i × %i', async (width, height) => {
    await expect(decode(answer(png(width, height)))).rejects.toThrow('图片尺寸');
    expect(createImageBitmap).not.toHaveBeenCalled();
  });
  it.each(['landscape', 'portrait'] as const)('%s 不能接收方图', async ratio => {
    await expect(decode(answer(), 'openai', ratio)).rejects.toThrow('图片尺寸');
  });
  it('不能解码的原图不交付', async () => {
    vi.mocked(createImageBitmap).mockRejectedValue(new Error('invalid image'));
    await expect(decode(answer())).rejects.toThrow();
  });
});

describe('MiniMax 原生响应协议', () => {
  it.each(['b64', 'url'] as const)('%s JPEG 保持原始字节与真实格式', async source => {
    const bytes = new Uint8Array([
      255, 216, 255, 194, 0, 11, 8, 4, 0, 4, 0, 1, 1, 17, 0, 255, 218, 0, 8, 1, 1, 0, 0, 63, 0, 0, 255, 217
    ]);
    const data =
      source === 'b64' ? { image_base64: [encoded(bytes)] } : { image_urls: ['https://images.example/original.png'] };
    vi.mocked(fetch).mockResolvedValue(new Response(bytes, { headers: { 'content-type': 'image/png' } }));
    vi.mocked(createImageBitmap).mockResolvedValue({
      width: 1024,
      height: 1024,
      close: vi.fn()
    } as unknown as ImageBitmap);
    const blob = await decode({ base_resp: { status_code: 0 }, data }, 'minimax');
    expect(blob.type).toBe('image/jpeg');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
    expect(fetch).toHaveBeenCalledTimes(source === 'url' ? 1 : 0);
    if (source === 'url') expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toBeUndefined();
  });
  it.each([1002, 1004, 1008, 1026, 2013, 2049])('明确拒绝码 %i 不泄露上游正文', async code => {
    const failure = await decode(
      { base_resp: { status_code: code, status_msg: 'private fixture-key' } },
      'minimax'
    ).catch(error => error);
    expect(failure).toMatchObject({ rejected: true });
    expect(String(failure)).not.toMatch(/private|fixture-key/);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([1001, 1024, 1033, 2066, 999999])('未知错误码 %i 保持待核对', async code => {
    await expect(decode({ base_resp: { status_code: code } }, 'minimax')).rejects.toMatchObject({ rejected: false });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    {},
    { base_resp: { status_code: '0' }, data: { image_urls: ['https://images.example/private.png'] } },
    { base_resp: { status_code: 0 } },
    { base_resp: { status_code: 0 }, data: { image_urls: [] } },
    {
      base_resp: { status_code: 0 },
      data: { image_urls: ['https://images.example/a.png', 'https://images.example/b.png'] }
    },
    { base_resp: { status_code: 0 }, data: { image_urls: ['https://images.example/a.png'], image_base64: ['YQ=='] } },
    { base_resp: { status_code: 0 }, data: { image_urls: 'https://images.example/a.png' } },
    { base_resp: { status_code: 0 }, data: [{ b64_json: 'YQ==' }] }
  ])('拒绝不明确或无效的原生响应', async value => {
    await expect(decode(value, 'minimax')).rejects.toMatchObject({ rejected: false });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('下载到截断 JPEG 时在解码前拒绝', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(new Uint8Array([255, 216, 255, ...new Uint8Array(24)])));
    await expect(
      decode({ base_resp: { status_code: 0 }, data: { image_urls: ['https://images.example/native.jpg'] } }, 'minimax')
    ).rejects.toThrow('PNG');
    expect(createImageBitmap).not.toHaveBeenCalled();
  });
});
