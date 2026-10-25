import { Blob as NodeBlob } from 'node:buffer';
import { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bounded,
  generateLocalImage,
  providerBase,
  ProviderFailure,
  publicProvider,
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
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const generate = (
  configuration = provider,
  ratio: 'square' | 'landscape' | 'portrait' = 'square',
  key = 'fixture-key'
) => generateLocalImage(configuration, key, '测试图片', ratio, new AbortController().signal);

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

describe('single image dispatch', () => {
  it.each(['b64', 'url'] as const)(
    'accepts native MiniMax JPEG %s results without changing original bytes',
    async source => {
      const bytes = new Uint8Array([
        255, 216, 255, 194, 0, 11, 8, 4, 0, 4, 0, 1, 1, 17, 0, 255, 218, 0, 8, 1, 1, 0, 0, 63, 0, 0, 255, 217
      ]);
      const data =
        source === 'b64' ? { image_base64: [encoded(bytes)] } : { image_urls: ['https://images.example/original.png'] };
      vi.mocked(fetch).mockResolvedValueOnce(response({ base_resp: { status_code: 0 }, data }));
      if (source === 'url')
        vi.mocked(fetch).mockResolvedValueOnce(new Response(bytes, { headers: { 'content-type': 'image/png' } }));
      vi.mocked(createImageBitmap).mockResolvedValue({
        width: 1024,
        height: 1024,
        close: vi.fn()
      } as unknown as ImageBitmap);
      const blob = await generate({ ...provider, baseUrl: 'https://api.minimax.cn/v1', model: 'image-01' });
      expect(blob.type).toBe('image/jpeg');
      expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
      expect(fetch).toHaveBeenCalledTimes(source === 'url' ? 2 : 1);
      if (source === 'url')
        expect(vi.mocked(fetch).mock.calls[1][1]).toMatchObject({
          credentials: 'omit',
          redirect: 'error',
          referrerPolicy: 'no-referrer'
        });
    }
  );

  it.each([
    ['square', 1024, 1024, '1024x1024'],
    ['landscape', 1536, 1024, '1536x1024'],
    ['portrait', 1024, 1536, '1024x1536']
  ] as const)('dispatches exactly one %s image and closes the decoded bitmap', async (ratio, width, height, size) => {
    vi.mocked(fetch).mockResolvedValue(response({ data: [{ b64_json: encoded(png(width, height)) }] }));
    const close = vi.fn();
    vi.mocked(createImageBitmap).mockResolvedValue({ width, height, close } as unknown as ImageBitmap);
    const blob = await generate(provider, ratio);
    expect(blob.type).toBe('image/png');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(png(width, height));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://provider.example/v1/images/generations',
      expect.objectContaining({
        method: 'POST',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        body: JSON.stringify({
          model: provider.model,
          prompt: '测试图片',
          n: 1,
          size,
          quality: 'low',
          output_format: 'png'
        })
      })
    );
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('uses the relay only when proxy mode is selected explicitly', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ data: [{ b64_json: encoded(png()) }] }));
    await generate({ ...provider, mode: 'proxy' });
    expect(fetch).toHaveBeenCalledWith(
      '/api/relay',
      expect.objectContaining({
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer fixture-key',
          'x-provider-base': provider.baseUrl
        }
      })
    );
  });

  it('downloads a cross-origin URL with no authorization, cookies or referrer', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: [{ url: 'https://images.example/result.png' }] }))
      .mockResolvedValueOnce(new Response(png()));
    await generate();
    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, options] = vi.mocked(fetch).mock.calls[1];
    expect(String(url)).toBe('https://images.example/result.png');
    expect(options).toMatchObject({
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      cache: 'no-store'
    });
    expect(options?.headers).toBeUndefined();
    expect(options?.body).toBeUndefined();
  });

  it.each(['http://images.example/result.png', 'https://user:secret@images.example/result.png'])(
    'rejects an unsafe image URL without downloading it',
    async url => {
      vi.mocked(fetch).mockResolvedValue(response({ data: [{ url }] }));
      await expect(generate()).rejects.toThrow('图片地址无效');
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  );

  it('preserves an uncertain outcome if a returned URL cannot be read', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: [{ url: 'https://images.example/result.png' }] }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }));
    await expect(generate()).rejects.toMatchObject({
      rejected: false,
      message: expect.stringContaining('图片读取失败')
    });
  });

  it.each([400, 401, 403, 404, 413, 422, 429])(
    'classifies HTTP %i as a definite rejection without exposing response content',
    async status => {
      vi.mocked(fetch).mockResolvedValue(response({ secret: 'private upstream response' }, status));
      await expect(generate()).rejects.toMatchObject({
        rejected: true,
        message: `供应商或代理返回 HTTP ${status}。请核对配置和供应商记录。`
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  );
  it.each([500, 502, 503])('keeps HTTP %i uncertain and never retries', async status => {
    vi.mocked(fetch).mockResolvedValue(response({}, status));
    await expect(generate()).rejects.toMatchObject({ rejected: false });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    { error: 'private', status: 429 },
    { error: 'private', status: 200 }
  ])('keeps error envelopes uncertain and redacts upstream messages', async value => {
    vi.mocked(fetch).mockResolvedValue(response(value));
    await expect(generate()).rejects.toMatchObject({
      rejected: false,
      message: expect.not.stringContaining('private')
    });
  });
  it.each(['', 'with space', '中文'])('rejects invalid keys before dispatch', async key => {
    await expect(generate(provider, 'square', key)).rejects.toBeInstanceOf(ProviderFailure);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    {},
    { data: [] },
    { data: [{}, {}] },
    { data: [{}] },
    { data: [{ b64_json: '' }] },
    { data: [{ b64_json: '!!!' }] },
    { data: [{ b64_json: encoded(new Uint8Array(24)) }] }
  ])('rejects malformed or ambiguous generation results without retrying', async value => {
    vi.mocked(fetch).mockResolvedValue(response(value));
    await expect(generate()).rejects.toBeInstanceOf(ProviderFailure);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    [0, 1024],
    [5000, 5000],
    [1024, 512]
  ])('rejects invalid square dimensions %i x %i', async (width, height) => {
    vi.mocked(fetch).mockResolvedValue(response({ data: [{ b64_json: encoded(png(width, height)) }] }));
    await expect(generate()).rejects.toThrow('图片尺寸');
    expect(createImageBitmap).not.toHaveBeenCalled();
  });
  it.each(['landscape', 'portrait'] as const)('rejects square bytes for a %s request', async ratio => {
    vi.mocked(fetch).mockResolvedValue(response({ data: [{ b64_json: encoded(png()) }] }));
    await expect(generate(provider, ratio)).rejects.toThrow('图片尺寸');
  });
});

const minimaxProvider: LocalProvider = {
  ...provider,
  baseUrl: 'https://api.minimax.cn/v1',
  model: 'image-01'
};

describe('MiniMax native image dispatch', () => {
  it.each([
    ['square', 1024, 1024],
    ['landscape', 1536, 1024],
    ['portrait', 1024, 1536]
  ] as const)('maps %s to explicit pixel dimensions without aspect_ratio', async (ratio, width, height) => {
    vi.mocked(fetch).mockResolvedValue(
      response({
        base_resp: { status_code: 0 },
        data: { image_base64: [encoded(png(width, height))] }
      })
    );
    const blob = await generate(minimaxProvider, ratio);
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(png(width, height));
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      'https://api.minimax.cn/v1/image_generation',
      expect.objectContaining({
        body: JSON.stringify({
          model: 'image-01',
          prompt: '测试图片',
          n: 1,
          width,
          height,
          response_format: 'url',
          prompt_optimizer: false
        })
      })
    );
  });

  it.each(['https://api.minimax.io/v1', 'https://api.minimaxi.com/v1'])(
    'recognizes only an official native base %s',
    async baseUrl => {
      vi.mocked(fetch).mockResolvedValue(
        response({
          base_resp: { status_code: 0 },
          data: { image_base64: [encoded(png())] }
        })
      );
      await generate({ ...minimaxProvider, baseUrl });
      expect(vi.mocked(fetch).mock.calls[0][0]).toBe(`${baseUrl}/image_generation`);
    }
  );

  it('does not identify a lookalike host as MiniMax', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ data: [{ b64_json: encoded(png()) }] }));
    await generate({ ...provider, baseUrl: 'https://api.minimax.cn.evil.example/v1' });
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://api.minimax.cn.evil.example/v1/images/generations');
  });

  it('keeps the existing relay request contract and reads its native response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({
        base_resp: { status_code: 0 },
        data: { image_base64: [encoded(png())] }
      })
    );
    await generate({ ...minimaxProvider, mode: 'proxy' });
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      '/api/relay',
      expect.objectContaining({
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer fixture-key',
          'x-provider-base': minimaxProvider.baseUrl
        },
        body: JSON.stringify({
          model: 'image-01',
          prompt: '测试图片',
          n: 1,
          size: '1024x1024',
          quality: 'low',
          output_format: 'png'
        })
      })
    );
  });

  it('reads a native URL without forwarding Key, cookies or referrer', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        response({ base_resp: { status_code: 0 }, data: { image_urls: ['https://images.example/native.png'] } })
      )
      .mockResolvedValueOnce(new Response(png()));
    await generate(minimaxProvider);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(vi.mocked(fetch).mock.calls[1][0])).toBe('https://images.example/native.png');
    expect(vi.mocked(fetch).mock.calls[1][1]).toMatchObject({
      mode: 'cors',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer'
    });
    expect(vi.mocked(fetch).mock.calls[1][1]?.headers).toBeUndefined();
  });

  it.each([1002, 1004, 1008, 1026, 2013, 2049])(
    'classifies native rejection %i and redacts its message',
    async code => {
      vi.mocked(fetch).mockResolvedValue(
        response({ base_resp: { status_code: code, status_msg: 'private fixture-key upstream' } })
      );
      const failure = await generate(minimaxProvider).catch((error: unknown) => error);
      expect(failure).toMatchObject({ rejected: true, message: expect.stringContaining(String(code)) });
      expect(String(failure)).not.toMatch(/private|fixture-key|upstream/);
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  );

  it.each([1001, 1024, 1033, 2066, 999999])('preserves native error %i as uncertain without retrying', async code => {
    vi.mocked(fetch).mockResolvedValue(
      response({ base_resp: { status_code: code, status_msg: 'private fixture-key upstream' } })
    );
    const failure = await generate(minimaxProvider).catch((error: unknown) => error);
    expect(failure).toMatchObject({ rejected: false, message: expect.stringContaining(String(code)) });
    expect(String(failure)).not.toMatch(/private|fixture-key|upstream/);
    expect(fetch).toHaveBeenCalledTimes(1);
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
  ])('rejects invalid or ambiguous native envelopes before fetching an image', async data => {
    vi.mocked(fetch).mockResolvedValue(response(data));
    await expect(generate(minimaxProvider)).rejects.toMatchObject({ rejected: false });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects truncated JPEG bytes before decoding or saving', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        response({ base_resp: { status_code: 0 }, data: { image_urls: ['https://images.example/native.jpg'] } })
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([255, 216, 255, ...new Uint8Array(24)])));
    await expect(generate(minimaxProvider)).rejects.toThrow('PNG');
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it.each(['direct', 'proxy'] as const)('validates native model and prompt before %s dispatch', async mode => {
    await expect(generate({ ...minimaxProvider, mode, model: 'unsupported-image' })).rejects.toMatchObject({
      rejected: true
    });
    await expect(
      generateLocalImage(
        { ...minimaxProvider, mode },
        'fixture-key',
        'x'.repeat(1501),
        'square',
        new AbortController().signal
      )
    ).rejects.toMatchObject({ rejected: true });
    expect(fetch).not.toHaveBeenCalled();
  });
});
