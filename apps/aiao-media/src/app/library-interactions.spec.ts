import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalImageMvp } from './local-image-mvp';
import type { LibraryState, LibraryWork } from './work-library-session';

const originalInert = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'inert');
const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');

function work(index: number): LibraryWork {
  return {
    jobId: `work-${index}`,
    prompt: `森林作品 ${index}`,
    modelId: 'image-model',
    bytes: 10,
    status: 'saved',
    createdAt: '2026-11-05T00:00:00Z',
    viewKey: `file-${index}`,
    url: `blob:thumbnail-${index}`,
    mimeType: 'image/png',
    previewStatus: 'ready'
  };
}

function page(number: number, works: LibraryWork[], total = 26): LibraryState {
  return { page: number, works, total, pageSize: 24, loading: false, error: null };
}

function rig(state = page(1, [work(1)], 1)) {
  const fixture = TestBed.createComponent(LocalImageMvp);
  const component = fixture.componentInstance;
  const store = {
    delete: vi.fn<(id: string) => Promise<void>>(async () => undefined),
    previewImage: vi.fn(async (id: string) => ({ url: `blob:original-${id}`, mimeType: 'image/png' as const })),
    imageInfo: vi.fn().mockRejectedValue(new Error('测试不读取文件详情')),
    release: vi.fn(),
    close: vi.fn(async () => undefined)
  };
  const library = { query: vi.fn(), setVisible: vi.fn(), close: vi.fn() };
  Object.assign(component, { store, library });
  component.view.set('library');
  component.localStatus.set('ready');
  component.localWorksKnown.set(true);
  component.libraryPage.set(state);
  component.works.set(state.works);
  const element: HTMLElement = fixture.nativeElement;
  const render = () => fixture.detectChanges();
  const accept = (next: LibraryState) =>
    (component as unknown as { acceptLibraryPage(value: LibraryState): void }).acceptLibraryPage(next);
  const open = async (entry = state.works[0]) => {
    component.openViewer(entry, { currentTarget: document.createElement('button') } as unknown as Event);
    await vi.waitFor(() => expect(component.viewer()?.image).not.toBeNull());
    render();
  };
  render();
  return { component, element, store, library, render, accept, open };
}

beforeEach(() => {
  vi.spyOn(LocalImageMvp.prototype, 'ngOnInit').mockImplementation(() => undefined);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  Object.defineProperty(HTMLElement.prototype, 'inert', { value: false, configurable: true, writable: true });
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
  );
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    }
  });
});

afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalInert) Object.defineProperty(HTMLElement.prototype, 'inert', originalInert);
  else Reflect.deleteProperty(HTMLElement.prototype, 'inert');
  if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShowModal);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
});

describe('作品库操作反馈与连续查看', () => {
  it('大图和删除操作的可访问名称包含作品身份', async () => {
    const r = rig(page(1, [work(1), work(2)], 2));
    const names = [...r.element.querySelectorAll<HTMLButtonElement>('.photo-button')].map(button =>
      button.getAttribute('aria-label')
    );
    expect(names).toEqual(['查看大图：森林作品 1', '查看大图：森林作品 2']);
    expect(r.element.querySelector('.work-actions .danger')?.getAttribute('aria-label')).toBe(
      '删除本机图片：森林作品 1'
    );
    await r.component.deleteWork(work(1));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('森林作品 1'));
  });

  it('大图内删除期间阻止重复操作，失败后就地显示可重试的错误', async () => {
    const r = rig();
    await r.open();
    let reject!: (error: Error) => void;
    r.store.delete.mockReturnValueOnce(new Promise((_resolve, no) => (reject = no)));
    const deleting = r.component.deleteViewed();
    await r.component.deleteViewed();
    r.render();
    expect(r.store.delete).toHaveBeenCalledTimes(1);
    expect(r.element.querySelector<HTMLButtonElement>('.viewer-actions .danger')?.disabled).toBe(true);
    reject(new Error('磁盘忙'));
    await deleting;
    r.render();
    expect(r.element.querySelector('dialog [role="alert"]')?.textContent).toContain('删除未完成');
    expect(r.component.viewer()).not.toBeNull();
    await r.component.deleteViewed();
    expect(r.component.viewer()).toBeNull();
  });

  it.each([false, true])('旧删除完成不会关闭后来打开的查看器（重新打开同图：%s）', async reopenSame => {
    const entries = [work(1), work(2)];
    const r = rig(page(1, entries, 2));
    await r.open(entries[0]);
    let resolve!: () => void;
    r.store.delete.mockReturnValueOnce(new Promise<void>(yes => (resolve = yes)));
    const deleting = r.component.deleteViewed();
    r.component.closeViewer();
    const next = entries[reopenSame ? 0 : 1];
    await r.open(next);
    resolve();
    await deleting;
    expect(r.component.viewer()?.work).toBe(next);
    expect(r.component.viewer()?.image?.url).toBe(`blob:original-${next.jobId}`);
  });

  it('从一页末尾连续进入下一页，并显示全局序号且可反向返回', async () => {
    const first = Array.from({ length: 24 }, (_, index) => work(index + 1));
    const r = rig(page(1, first));
    await r.open(first[23]);
    expect(r.element.querySelector('.viewer-side .eyebrow')?.textContent).toContain('24 / 26');
    r.component.stepViewer(1);
    expect(r.library.query).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 24 }));
    r.accept(page(2, [work(25), work(26)]));
    await vi.waitFor(() => expect(r.component.viewer()?.work.jobId).toBe('work-25'));
    r.render();
    expect(r.element.querySelector('.viewer-side .eyebrow')?.textContent).toContain('25 / 26');
    r.component.stepViewer(-1);
    expect(r.library.query).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0 }));
    r.accept(page(1, first));
    await vi.waitFor(() => expect(r.component.viewer()?.work.jobId).toBe('work-24'));
    expect(r.store.release).toHaveBeenCalledWith('blob:original-work-25');
  });

  it('跨页读取失败时保留原图并在查看器内说明，关闭后迟到页不重新打开', async () => {
    const first = Array.from({ length: 24 }, (_, index) => work(index + 1));
    const r = rig(page(1, first));
    await r.open(first[23]);
    r.component.stepViewer(1);
    r.accept({ ...page(2, []), error: '读取失败' });
    r.render();
    expect(r.component.viewer()?.work.jobId).toBe('work-24');
    expect(r.element.querySelector('dialog [role="alert"]')?.textContent).toContain('读取');
    r.component.stepViewer(-1);
    expect(r.library.query).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0 }));
    r.accept(page(1, first));
    await vi.waitFor(() => expect(r.component.viewer()?.work.jobId).toBe('work-23'));
    r.component.stepViewer(1);
    await vi.waitFor(() => expect(r.component.viewer()?.work.jobId).toBe('work-24'));
    r.component.stepViewer(1);
    r.component.closeViewer();
    expect(r.store.release).toHaveBeenCalledWith('blob:original-work-24');
    r.accept(page(2, [work(25), work(26)]));
    expect(r.component.viewer()).toBeNull();
  });

  it('同步期间可查看原图和翻页，但删除按钮禁用且方法不写入', async () => {
    const r = rig();
    r.component.sync.update(state => ({ ...state, busy: true }));
    await r.open();
    expect(r.element.querySelector('.viewer-stage img')).not.toBeNull();
    expect(r.element.querySelector<HTMLButtonElement>('.viewer-actions .danger')?.disabled).toBe(true);
    await r.component.deleteViewed();
    r.render();
    expect(r.store.delete).not.toHaveBeenCalled();
    expect(r.element.querySelector('dialog [role="alert"]')?.textContent).toContain('删除暂不可用');
  });

  it('其他标签页在当前图前方删除作品后，序号更新且下一张不跳图', async () => {
    const entries = [work(1), work(2), work(3), work(4), work(5)];
    const r = rig(page(1, entries, 5));
    await r.open(entries[2]);
    r.accept(page(1, entries.slice(1), 4));
    r.render();
    expect(r.element.querySelector('.viewer-side .eyebrow')?.textContent).toContain('2 / 4');
    r.component.stepViewer(1);
    expect(r.component.viewer()?.work.jobId).toBe('work-4');
  });

  it('其他标签页在当前图前方新增作品后，上一张保持相邻', async () => {
    const entries = [work(1), work(2), work(3)];
    const r = rig(page(1, entries, 3));
    await r.open(entries[1]);
    r.accept(page(1, [work(0), ...entries], 4));
    r.render();
    expect(r.element.querySelector('.viewer-side .eyebrow')?.textContent).toContain('3 / 4');
    r.component.stepViewer(-1);
    expect(r.component.viewer()?.work.jobId).toBe('work-1');
  });

  it('当前图被其他标签页删除时说明原因并停止导航，已加载预览保留', async () => {
    const entries = [work(1), work(2), work(3)];
    const r = rig(page(1, entries, 3));
    await r.open(entries[1]);
    r.accept(page(1, [entries[0], entries[2]], 2));
    r.render();
    expect(r.element.querySelector('dialog [role="alert"]')?.textContent).toContain('重新选择');
    expect(r.element.querySelector('.viewer-stage img')).not.toBeNull();
    expect(r.element.querySelector('.viewer-nav')).toBeNull();
    r.component.stepViewer(1);
    expect(r.component.viewer()?.work.jobId).toBe('work-2');
  });

  it('查看原尺寸后可切回适应窗口，切换作品恢复适应窗口', async () => {
    const r = rig(page(1, [work(1), work(2)], 2));
    await r.open();
    const original = [...r.element.querySelectorAll<HTMLButtonElement>('dialog button')].find(button =>
      button.textContent?.includes('原尺寸')
    );
    expect(original).toBeDefined();
    original!.click();
    r.render();
    expect(r.element.querySelector('.viewer-stage')?.classList.contains('original-size')).toBe(true);
    r.component.stepViewer(1);
    r.render();
    expect(r.element.querySelector('.viewer-stage')?.classList.contains('original-size')).toBe(false);
  });
});
