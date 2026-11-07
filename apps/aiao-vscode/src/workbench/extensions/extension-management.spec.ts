// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { createExtensionManagement, MARKDOWN_EXTENSION, prepareMarkdownExtension } from './extension-management.js';

function fixture(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    })
  };
  const prepare = vi.fn<(signal: AbortSignal) => Promise<void>>(async () => undefined);
  const onChange = vi.fn();
  const manager = createExtensionManagement({ storage, prepare, onChange });
  return { manager, storage, prepare, onChange, values };
}

const key = `aiao-workbench:extensions:${MARKDOWN_EXTENSION.id}:installation`;
const removed = { [key]: JSON.stringify({ installed: false, enabled: false }) };

describe('扩展安装管理', () => {
  it('保留预装扩展和旧版禁用偏好，读取时不加载插件', () => {
    const f = fixture({ [`aiao-workbench:extensions:${MARKDOWN_EXTENSION.id}:enabled`]: 'false' });
    expect(f.manager.state).toMatchObject({ installed: true, enabled: false, operation: null, error: '' });
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.storage.setItem).not.toHaveBeenCalled();
  });

  it('卸载状态刷新后仍保留，不被旧预装和启用配置覆盖', async () => {
    const f = fixture();
    await f.manager.uninstall();
    expect(f.manager.state).toMatchObject({ installed: false, enabled: false, operation: null });
    expect(fixture(Object.fromEntries(f.values)).manager.state.installed).toBe(false);
    expect(f.prepare).not.toHaveBeenCalled();
  });

  it('安装验证真实资源后才持久化，并在重装时启用', async () => {
    const f = fixture(removed);
    let finish!: () => void;
    f.prepare.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    );
    const installing = f.manager.install();
    expect(f.manager.state).toMatchObject({ installed: false, enabled: false, operation: 'installing' });
    expect(f.storage.setItem).not.toHaveBeenCalled();
    finish();
    await installing;
    expect(f.manager.state).toMatchObject({ installed: true, enabled: true, operation: null });
    expect(fixture(Object.fromEntries(f.values)).manager.state.enabled).toBe(true);
  });

  it('重复安装共用一次操作，安装中不能卸载或启停', async () => {
    const f = fixture(removed);
    let finish!: () => void;
    f.prepare.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    );
    const first = f.manager.install();
    const second = f.manager.install();
    await expect(f.manager.uninstall()).rejects.toThrow('正在');
    expect(() => f.manager.setEnabled(true)).toThrow('正在');
    finish();
    await Promise.all([first, second]);
    expect(f.prepare).toHaveBeenCalledOnce();
  });

  it('安装失败保留未安装状态和真实错误，允许重试', async () => {
    const f = fixture(removed);
    f.prepare.mockRejectedValueOnce(new Error('资源不存在：404'));
    await expect(f.manager.install()).rejects.toThrow('404');
    expect(f.manager.state).toMatchObject({
      installed: false,
      enabled: false,
      operation: null,
      error: '资源不存在：404'
    });
    expect(f.storage.setItem).not.toHaveBeenCalled();
    await f.manager.install();
    expect(f.manager.state).toMatchObject({ installed: true, enabled: true, error: '' });
  });

  it('持久化失败不误报卸载成功，也不禁用正在运行的插件', async () => {
    const f = fixture();
    f.storage.setItem.mockImplementationOnce(() => {
      throw new Error('存储已满');
    });
    await expect(f.manager.uninstall()).rejects.toThrow('存储已满');
    expect(f.manager.state).toMatchObject({ installed: true, enabled: true, operation: null, error: '存储已满' });
  });

  it('禁用与卸载独立，启停持久化且未安装不能启用', async () => {
    const f = fixture();
    f.manager.setEnabled(false);
    expect(f.manager.state).toMatchObject({ installed: true, enabled: false });
    expect(fixture(Object.fromEntries(f.values)).manager.state.enabled).toBe(false);
    await f.manager.uninstall();
    expect(() => f.manager.setEnabled(true)).toThrow('未安装');
  });

  it('工作台释放后中止安装，迟到结果不能恢复安装记录', async () => {
    const f = fixture(removed);
    let finish!: () => void;
    f.prepare.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    );
    const installing = f.manager.install();
    const signal = f.prepare.mock.calls[0][0];
    f.manager.dispose();
    expect(signal.aborted).toBe(true);
    finish();
    await installing;
    expect(f.storage.setItem).not.toHaveBeenCalled();
  });

  it('同步资源异常和安装记录写入失败均恢复未安装状态', async () => {
    const f = fixture(removed);
    f.prepare.mockImplementationOnce(() => {
      throw new Error('网络断开');
    });
    await expect(f.manager.install()).rejects.toThrow('网络断开');
    expect(f.manager.state.operation).toBeNull();
    f.storage.setItem.mockImplementationOnce(() => {
      throw new Error('无法写入');
    });
    await expect(f.manager.install()).rejects.toThrow('无法写入');
    expect(f.manager.state).toMatchObject({ installed: false, enabled: false, operation: null });
  });

  it('禁用记录写入失败保留原状态，释放后拒绝操作', async () => {
    const f = fixture();
    f.storage.setItem.mockImplementationOnce(() => {
      throw new Error('拒绝写入');
    });
    expect(() => f.manager.setEnabled(false)).toThrow('拒绝写入');
    expect(f.manager.state.enabled).toBe(true);
    f.manager.dispose();
    await expect(f.manager.install()).rejects.toThrow('已经释放');
    await expect(f.manager.uninstall()).rejects.toThrow('已经释放');
    expect(() => f.manager.setEnabled(false)).toThrow('已经释放');
  });

  it('损坏的安装记录显式报错，不将其误认为预装', () => {
    expect(() => fixture({ [key]: JSON.stringify({ installed: 'yes', enabled: true }) })).toThrow('安装记录无效');
    expect(() => fixture({ [key]: '[]' })).toThrow('安装记录无效');
  });

  it('已安装时安装、未安装时卸载均幂等', async () => {
    const f = fixture();
    await f.manager.install();
    expect(f.prepare).not.toHaveBeenCalled();
    await f.manager.uninstall();
    f.storage.setItem.mockClear();
    await f.manager.uninstall();
    expect(f.storage.setItem).not.toHaveBeenCalled();
  });
});

describe('正式扩展安装资源检查', () => {
  const bytes = new TextEncoder().encode('extension entry');
  const metadata = async () => ({
    id: MARKDOWN_EXTENSION.id,
    version: MARKDOWN_EXTENSION.version,
    manifest: {
      publisher: 'shd101wyy',
      name: 'markdown-preview-enhanced',
      version: MARKDOWN_EXTENSION.version,
      browser: './out/web/extension.js'
    },
    files: [
      {
        path: 'out/web/extension.js',
        bytes: bytes.length,
        sha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte =>
          byte.toString(16).padStart(2, '0')
        ).join('')
      }
    ]
  });

  it('校验清单与浏览器入口内容，正确使用部署资源根', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(await metadata())))
      .mockResolvedValueOnce(new Response(bytes));
    await prepareMarkdownExtension('https://example.com/sub/assets/', new AbortController().signal, fetcher);
    expect(fetcher.mock.calls.map(call => String(call[0]))).toEqual([
      `https://example.com/sub/assets/extensions/${MARKDOWN_EXTENSION.id}/extension-assets.json`,
      `https://example.com/sub/assets/extensions/${MARKDOWN_EXTENSION.id}/out/web/extension.js`
    ]);
  });

  it('清单 404、版本不匹配、浏览器入口缺失或校验失败均拒绝安装', async () => {
    const signal = new AbortController().signal;
    await expect(
      prepareMarkdownExtension(
        'https://example.com/',
        signal,
        vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 }))
      )
    ).rejects.toThrow('404');
    const wrong = { ...(await metadata()), version: '0.0.0' };
    await expect(
      prepareMarkdownExtension(
        'https://example.com/',
        signal,
        vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(wrong)))
      )
    ).rejects.toThrow('清单');
    const missing = { ...(await metadata()), files: [] };
    await expect(
      prepareMarkdownExtension(
        'https://example.com/',
        signal,
        vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(missing)))
      )
    ).rejects.toThrow('入口');
    const unavailable = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(await metadata())))
      .mockResolvedValueOnce(new Response('', { status: 503 }));
    await expect(prepareMarkdownExtension('https://example.com/', signal, unavailable)).rejects.toThrow('503');
    const corrupt = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(await metadata())))
      .mockResolvedValueOnce(new Response('corrupted entry'));
    await expect(prepareMarkdownExtension('https://example.com/', signal, corrupt)).rejects.toThrow('校验');
  });
});
