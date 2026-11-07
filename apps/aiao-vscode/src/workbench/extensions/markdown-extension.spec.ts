// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { createMarkdownExtension, type MarkdownRuntime, type MarkdownRuntimeOptions } from './markdown-extension.js';

const initial = {
  savedFiles: { 'README.md': '# 已保存标题', 'image.svg': '<svg />' },
  projectId: 'one',
  activePath: 'README.md',
  files: { 'README.md': '# 未保存的标题', 'image.svg': '<svg />' }
};

function fixture(installed = true, enabled = true) {
  const runtime: MarkdownRuntime = {
    sync: vi.fn(async () => undefined),
    execute: vi.fn(async () => undefined),
    dispose: vi.fn()
  };
  let events: MarkdownRuntimeOptions | undefined;
  const mount = vi.fn(async (_host: HTMLElement, options: MarkdownRuntimeOptions) => {
    events = options;
    return runtime;
  });
  const onEdit = vi.fn();
  const onWrite = vi.fn(async () => undefined);
  const onError = vi.fn();
  const onScroll = vi.fn();
  const onSave = vi.fn(async () => undefined);
  const host = document.createElement('div');
  const extension = createMarkdownExtension({
    getHost: () => host,
    mount,
    onEdit,
    onSave,
    onWrite,
    onReveal: vi.fn(),
    onScroll,
    onError,
    installed,
    enabled
  });
  extension.sync(initial);
  return {
    extension,
    runtime,
    mount,
    onEdit,
    onSave,
    onWrite,
    onScroll,
    onError,
    get events() {
      return events!;
    }
  };
}

describe('真实 Markdown 扩展的工作台生命周期', () => {
  it('首次执行命令才加载，使用编辑缓冲，随后执行插件命令而不自动保存', async () => {
    const f = fixture();
    expect(f.mount).not.toHaveBeenCalled();
    await f.extension.execute('markdown-preview-enhanced.openPreviewToTheSide');
    expect(f.events.snapshot).toEqual(initial);
    expect(f.runtime.execute).toHaveBeenCalledWith('markdown-preview-enhanced.openPreviewToTheSide');
    expect(f.onSave).not.toHaveBeenCalled();
    expect(f.extension.status).toBe('active');
    f.extension.dispose();
  });

  it('预览打开后同步未保存文本、选中的文档和相对图片', async () => {
    const f = fixture();
    await f.extension.execute('markdown-preview-enhanced.openPreviewToTheSide');
    const next = { ...initial, activePath: 'notes.md', files: { ...initial.files, 'notes.md': '![图](image.svg)' } };
    f.extension.sync(next);
    await vi.waitFor(() => expect(f.runtime.sync).toHaveBeenCalledWith(next));
    expect(f.onSave).not.toHaveBeenCalled();
    f.extension.dispose();
  });

  it('切换项目后释放旧宿主，旧插件事件不能修改新项目', async () => {
    const f = fixture();
    await f.extension.execute('markdown-preview-enhanced.openPreviewToTheSide');
    const old = f.events;
    f.extension.sync({ ...initial, projectId: 'two' });
    expect(f.runtime.dispose).toHaveBeenCalledOnce();
    old.onEdit('README.md', '迟到的修改', initial.files['README.md']);
    expect(f.onEdit).not.toHaveBeenCalled();
    expect(f.extension.status).toBe('idle');
    f.extension.dispose();
  });

  it('禁用立即释放宿主且移除命令，重新启用后可再次加载', async () => {
    const f = fixture();
    await f.extension.execute('markdown-preview-enhanced.openPreviewToTheSide');
    f.extension.setEnabled(false);
    expect(f.runtime.dispose).toHaveBeenCalledOnce();
    expect(f.extension.commands).toEqual([]);
    expect(f.extension.status).toBe('disabled');
    await expect(f.extension.execute('markdown-preview-enhanced.openPreviewToTheSide')).rejects.toThrow('已禁用');
    f.extension.setEnabled(true);
    await f.extension.execute('markdown-preview-enhanced.openPreviewToTheSide');
    expect(f.mount).toHaveBeenCalledTimes(2);
    f.extension.dispose();
  });

  it('未安装启动和项目切换均不恢复扩展，同一安装状态不重复释放', async () => {
    const f = fixture(false, true);
    expect(f.extension.installed).toBe(false);
    expect(f.extension.enabled).toBe(false);
    expect(f.extension.status).toBe('uninstalled');
    f.extension.sync({ ...initial, projectId: 'two' });
    expect(f.extension.status).toBe('uninstalled');
    f.extension.setInstallation({ installed: true, enabled: true });
    await f.extension.execute('markdown-preview-enhanced.openPreviewToTheSide');
    f.extension.setInstallation({ installed: true, enabled: true });
    expect(f.runtime.dispose).not.toHaveBeenCalled();
    expect(f.events.signal.aborted).toBe(false);
    f.extension.dispose();
    f.extension.setInstallation({ installed: false, enabled: false });
    expect(f.extension.installed).toBe(true);
  });

  it('卸载移除命令并拒绝启用，重装恢复命令但仍按需加载', async () => {
    const f = fixture();
    f.extension.setInstallation({ installed: false, enabled: false });
    expect(f.extension.commands).toEqual([]);
    expect(f.extension.status).toBe('uninstalled');
    f.extension.setEnabled(true);
    expect(f.extension.enabled).toBe(false);
    await expect(f.extension.execute('markdown-preview-enhanced.openPreviewToTheSide')).rejects.toThrow('未安装');
    f.extension.setInstallation({ installed: true, enabled: true });
    expect(f.extension.commands.length).toBeGreaterThan(0);
    expect(f.mount).not.toHaveBeenCalled();
    await f.extension.execute('markdown-preview-enhanced.openPreviewToTheSide');
    expect(f.extension.status).toBe('active');
    f.extension.dispose();
  });

  it('加载期间卸载并重装后，迟到宿主不能接管新安装', async () => {
    const f = fixture();
    let finish!: (runtime: MarkdownRuntime) => void;
    let signal!: AbortSignal;
    f.mount.mockImplementationOnce((_host, options) => {
      signal = options.signal;
      return new Promise(resolve => {
        finish = resolve;
      });
    });
    const pending = f.extension.execute('markdown-preview-enhanced.openPreviewToTheSide');
    f.extension.setInstallation({ installed: false, enabled: false });
    expect(signal.aborted).toBe(true);
    f.extension.setInstallation({ installed: true, enabled: true });
    finish(f.runtime);
    await expect(pending).rejects.toThrow('已切换');
    expect(f.runtime.dispose).toHaveBeenCalledOnce();
    expect(f.runtime.execute).not.toHaveBeenCalled();
    expect(f.extension.status).toBe('idle');
    f.extension.dispose();
  });

  it('加载失败显式暴露错误，并允许修复后重试', async () => {
    const f = fixture();
    f.mount.mockRejectedValueOnce(new Error('扩展资源完整性校验失败'));
    await expect(f.extension.execute('markdown-preview-enhanced.openPreviewToTheSide')).rejects.toThrow('完整性');
    expect(f.extension.status).toBe('failed');
    await f.extension.execute('markdown-preview-enhanced.openPreviewToTheSide');
    expect(f.extension.status).toBe('active');
    f.extension.dispose();
  });

  it('加载期间切换项目后丢弃并释放迟到宿主，不执行旧命令', async () => {
    const f = fixture();
    let finish!: (runtime: MarkdownRuntime) => void;
    f.mount.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const pending = f.extension.execute('markdown-preview-enhanced.openPreviewToTheSide');
    await vi.waitFor(() => expect(f.mount).toHaveBeenCalledOnce());
    f.extension.sync({ ...initial, projectId: 'two' });
    finish(f.runtime);
    await expect(pending).rejects.toThrow('已切换');
    expect(f.runtime.dispose).toHaveBeenCalledOnce();
    expect(f.runtime.execute).not.toHaveBeenCalled();
    f.extension.dispose();
  });

  it('原生预览关闭后释放宿主，迟到滚动事件不能影响编辑器', async () => {
    const f = fixture();
    await f.extension.execute('markdown-preview-enhanced.openPreviewToTheSide');
    const old = f.events;
    old.onScroll?.('README.md', 15);
    expect(f.onScroll).toHaveBeenCalledWith('README.md', 15);
    old.onClosed?.();
    expect(f.extension.status).toBe('idle');
    expect(f.runtime.dispose).toHaveBeenCalledOnce();
    old.onScroll?.('README.md', 80);
    expect(f.onScroll).toHaveBeenCalledOnce();
    f.extension.dispose();
  });

  it('迟到的插件编辑不能覆盖更新后的用户草稿', async () => {
    const f = fixture();
    await f.extension.execute('markdown-preview-enhanced.openPreviewToTheSide');
    f.extension.sync({ ...initial, files: { ...initial.files, 'README.md': '# 新草稿' } });
    f.events.onEdit('README.md', '# 插件旧修改', initial.files['README.md']);
    expect(f.onEdit).not.toHaveBeenCalled();
    expect(f.onError).toHaveBeenCalled();
    f.extension.dispose();
  });

  it('保存请求校验草稿和磁盘基线，拒绝迟到写入', async () => {
    const f = fixture();
    await f.extension.execute('markdown-preview-enhanced.openPreviewToTheSide');
    const bytes = new Uint8Array([35]);
    const baseline = { draft: initial.files['README.md'], saved: initial.savedFiles['README.md'] };
    await f.events.onWrite('README.md', bytes, baseline);
    expect(f.onWrite).toHaveBeenCalledWith('README.md', bytes);
    f.extension.sync({ ...initial, files: { ...initial.files, 'README.md': '# 用户后续输入' } });
    await expect(f.events.onWrite('README.md', bytes, baseline)).rejects.toThrow('已过期');
    expect(f.onWrite).toHaveBeenCalledOnce();
    f.extension.dispose();
  });

  it('插件修改进入当前编辑缓冲，插件保存请求独立转发', async () => {
    const f = fixture();
    await f.extension.execute('markdown-preview-enhanced.openPreviewToTheSide');
    f.events.onEdit('README.md', '# 插件修改', initial.files['README.md']);
    expect(f.onEdit).toHaveBeenCalledWith('README.md', '# 插件修改');
    expect(f.onSave).not.toHaveBeenCalled();
    await f.events.onSave('README.md');
    expect(f.onSave).toHaveBeenCalledWith('README.md');
    f.extension.dispose();
  });
});

describe('Markdown 预览的视区同步', () => {
  it('首次激活前保留源编辑器的光标和视区', async () => {
    const f = fixture();
    f.runtime.cursor = vi.fn(async () => undefined);
    f.runtime.viewport = vi.fn(async () => undefined);
    f.extension.cursor(80, 4);
    f.extension.viewport({ firstLine: 70, lastLine: 100 });
    await f.extension.execute('markdown-preview-enhanced.openPreviewToTheSide');
    expect(f.runtime.cursor).toHaveBeenCalledWith(80, 4);
    expect(f.runtime.viewport).toHaveBeenCalledWith({ firstLine: 70, lastLine: 100 });
    f.extension.dispose();
  });

  it('工作台视区转发给真实宿主，禁用后停止转发', async () => {
    const f = fixture();
    f.runtime.viewport = vi.fn(async () => undefined);
    await f.extension.execute('markdown-preview-enhanced.openPreviewToTheSide');
    f.extension.viewport({ firstLine: 20, lastLine: 50 });
    expect(f.runtime.viewport).toHaveBeenCalledWith({ firstLine: 20, lastLine: 50 });
    f.extension.setEnabled(false);
    f.extension.viewport({ firstLine: 40, lastLine: 70 });
    expect(f.runtime.viewport).toHaveBeenCalledOnce();
    f.extension.dispose();
  });
});
