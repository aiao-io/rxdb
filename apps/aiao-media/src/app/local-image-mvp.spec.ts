import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { GenerationJobSummary } from '../contracts/index';
import type { PublicWorkPayload } from '../contracts/product-data.mjs';
import type { LocalWorkSummary } from '../local-data/index';
import { LocalImageMvp } from './local-image-mvp';
import { WorkMetadataSession } from './work-metadata-session';

const remote: PublicWorkPayload = {
  version: 1,
  jobId: 'remote',
  prompt: '同步作品',
  modelId: 'fixture',
  providerInstanceId: 'provider',
  mimeType: 'image/png',
  width: 64,
  height: 64,
  bytes: 10,
  sha256: 'hash',
  createdAt: '2026-01-01T00:00:00Z'
};
const task: GenerationJobSummary = {
  id: remote.jobId,
  request: {
    kind: 'image',
    operation: 'text-to-image',
    providerInstanceId: 'provider',
    providerRevision: 1,
    modelId: 'fixture',
    prompt: '同步作品'
  },
  status: 'completed',
  createdAt: remote.createdAt,
  updatedAt: remote.createdAt,
  delivery: { status: 'available', expiresAt: null, acknowledgedAt: null },
  failure: null
};

const originalInert = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'inert');
beforeAll(() =>
  Object.defineProperty(HTMLElement.prototype, 'inert', { value: false, writable: true, configurable: true })
);
afterAll(() => {
  if (originalInert) Object.defineProperty(HTMLElement.prototype, 'inert', originalInert);
  else Reflect.deleteProperty(HTMLElement.prototype, 'inert');
});
afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});

function rig() {
  vi.spyOn(LocalImageMvp.prototype, 'ngOnInit').mockImplementation(() => undefined);
  const fixture = TestBed.createComponent(LocalImageMvp);
  const component = fixture.componentInstance;
  component.view.set('library');
  component.localStatus.set('ready');
  component.syncedWorks.set([remote]);
  component.history.set([task]);
  const streams: Subject<LocalWorkSummary[]>[] = [];
  const session = new WorkMetadataSession(
    {
      works$: () => {
        const stream = new Subject<LocalWorkSummary[]>();
        streams.push(stream);
        return stream;
      }
    },
    state => {
      component.works.set(state.works);
      component.localWorksKnown.set(state.known);
      component.localWorksError.set(state.error ?? '');
    }
  );
  session.start();
  const element: HTMLElement = fixture.nativeElement;
  const text = () => {
    fixture.detectChanges();
    return element.textContent ?? '';
  };
  return { fixture, component, session, streams, element, text };
}

function downloadRig(
  download = vi.fn<() => Promise<void>>(async () => undefined),
  works: PublicWorkPayload[] = [remote]
) {
  const r = rig();
  r.streams[0].next([]);
  r.component.targetKind.set('platform');
  r.component.authUser.set({ id: 'fixture-account', email: null });
  r.component.syncInitialized.set(true);
  r.component.syncedWorks.set(works);
  r.component.imageSyncMessage.set('仅上传以后的图片');
  Object.assign(r.component, {
    imageSyncController: vi.fn(async () => ({ download })),
    readTasks: vi.fn(async () => undefined),
    retryLibrary: vi.fn()
  });
  const card = (jobId: string) => {
    r.text();
    const prompt = r.component.syncedWorks().find(work => work.jobId === jobId)?.prompt;
    const element = [...r.element.querySelectorAll<HTMLElement>('.remote-card')].find(
      candidate => candidate.querySelector('h3')?.textContent === prompt
    );
    expect(element).toBeDefined();
    return element!;
  };
  const retrieve = (jobId = remote.jobId) => {
    const button = card(jobId).querySelector<HTMLButtonElement>('button');
    expect(button).not.toBeNull();
    return button!;
  };
  return { ...r, card, retrieve, download };
}

describe('图库原图取回反馈', () => {
  it('账号窗口关闭时仅目标作品显示取回进度和忙碌状态', async () => {
    let complete!: () => void;
    const pending = new Promise<void>(resolve => {
      complete = resolve;
    });
    const second = { ...remote, jobId: 'another-work', prompt: '另一张同步作品', sha256: 'another-hash' };
    const r = downloadRig(
      vi.fn(async () => pending),
      [remote, second]
    );

    r.retrieve().click();
    await vi.waitFor(() => expect(r.download).toHaveBeenCalledOnce());

    expect(r.element.querySelector('dialog')).toBeNull();
    expect(r.card(remote.jobId).getAttribute('aria-busy')).toBe('true');
    expect(r.card(remote.jobId).querySelector('[role=status]')?.textContent).toContain('正在从平台账号取回原图');
    expect(r.retrieve().disabled).toBe(true);
    expect(r.card(second.jobId).getAttribute('aria-busy')).not.toBe('true');
    expect(r.card(second.jobId).querySelector('[role=status], [role=alert]')).toBeNull();
    expect(r.component.imageSyncMessage()).toBe('仅上传以后的图片');

    complete();
    await vi.waitFor(() => expect(r.retrieve().disabled).toBe(false));
    r.session.close();
  });

  it.each(['远端图片尚未完成上传或已被移除。', '远端图片记录操作失败，原图保留。', '远端图片读取失败；本机数据保留。'])(
    '取回失败在当前卡片显示原因且可重试：%s',
    async message => {
      const download = vi.fn(async () => undefined).mockRejectedValueOnce(new Error(message));
      const r = downloadRig(download);

      r.retrieve().click();
      await vi.waitFor(() =>
        expect(r.card(remote.jobId).querySelector('[role=alert]')?.textContent).toContain(message)
      );

      expect(r.element.querySelector('dialog')).toBeNull();
      expect(r.card(remote.jobId).getAttribute('aria-busy')).not.toBe('true');
      expect(r.retrieve().disabled).toBe(false);
      expect(r.component.imageSyncMessage()).toBe('仅上传以后的图片');

      r.retrieve().click();
      await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(2));
      await vi.waitFor(() =>
        expect(r.card(remote.jobId).querySelector('[role=status]')?.textContent).toContain('原图已校验并保存到本机')
      );

      expect(r.card(remote.jobId).querySelector('[role=alert]')).toBeNull();
      expect(r.element.querySelector('#toast[role=status]')?.textContent).toContain('原图已校验并保存到本机');
      expect(r.component.imageSyncMessage()).toBe('仅上传以后的图片');
      r.session.close();
    }
  );

  it('同一作品换了原图版本时不复用旧版本的失败提示', async () => {
    const message = '旧版本原图尚未上传';
    const download = vi.fn(async () => undefined).mockRejectedValueOnce(new Error(message));
    const r = downloadRig(download);

    r.retrieve().click();
    await vi.waitFor(() => expect(r.card(remote.jobId).querySelector('[role=alert]')?.textContent).toContain(message));
    const updated = { ...remote, sha256: 'new-original-hash' };
    r.component.syncedWorks.set([updated]);

    expect(r.card(remote.jobId).querySelector('[role=status], [role=alert]')).toBeNull();
    expect(r.card(remote.jobId).textContent).not.toContain(message);
    expect(r.retrieve().disabled).toBe(false);

    r.retrieve().click();
    await vi.waitFor(() =>
      expect(download).toHaveBeenLastCalledWith(
        updated.jobId,
        updated.sha256,
        expect.objectContaining({ id: updated.jobId })
      )
    );
    await vi.waitFor(() => expect(r.retrieve().disabled).toBe(false));
    r.session.close();
  });

  it('取回成功后删除本机副本，远端卡片不再显示已保存提示', async () => {
    const r = downloadRig();
    const local: LocalWorkSummary = {
      jobId: remote.jobId,
      prompt: remote.prompt,
      modelId: remote.modelId,
      bytes: remote.bytes,
      status: 'saved'
    };
    Object.assign(r.component, {
      store: { delete: vi.fn(async () => r.streams[0].next([])), close: vi.fn(async () => undefined) }
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    r.retrieve().click();
    await vi.waitFor(() =>
      expect(r.card(remote.jobId).querySelector('[role=status]')?.textContent).toContain('原图已校验并保存到本机')
    );
    r.streams[0].next([local]);
    expect(r.text()).not.toContain('本机无原图');

    await r.component.deleteWork({ ...local, url: null, viewKey: remote.jobId, previewStatus: 'idle' });

    expect(r.card(remote.jobId).textContent).toContain('本机无原图');
    expect(r.card(remote.jobId).querySelector('[role=status], [role=alert]')).toBeNull();
    expect(r.component.imageDownloadState(remote)).toBeNull();
    r.session.close();
  });
});

describe('library ownership presentation', () => {
  it('平台账号可取回已同步原图，无需先同意上传本机图片', () => {
    const r = rig();
    r.streams[0].next([]);
    r.component.targetKind.set('platform');
    r.component.authUser.set({ id: 'fixture-account', email: null });
    r.component.syncInitialized.set(true);
    expect(r.component.imageSyncEnabled()).toBe(false);
    r.text();
    const retrieve = [...r.element.querySelectorAll<HTMLButtonElement>('button')].find(
      button => button.textContent?.trim() === '取回并保存原图'
    );
    expect(retrieve).toBeDefined();
    expect(retrieve!.disabled).toBe(false);
    r.session.close();
  });
  it('本机备份说明 ZIP 内容，并接受 ZIP 和旧版 JSON 导入', () => {
    const r = rig();
    r.component.view.set('providers');
    r.component.settingsTab.set('data');
    expect(r.text()).toContain('backup.json');
    const input = r.element.querySelector<HTMLInputElement>('.backup-import input');
    expect(input?.accept.split(',')).toEqual(
      expect.arrayContaining(['application/zip', '.zip', 'application/json', '.json'])
    );
    r.session.close();
  });
  it('本机数据打开后仍等待身份就绪才允许首次启用同步', () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = true;
      }
    });
    const r = rig();
    try {
      r.component.view.set('providers');
      r.component.authConfigured.set(true);
      r.component.authStatus.set('signed-in');
      r.component.authUser.set({ id: 'fixture-account', email: null });
      r.component.authOpen.set(true);
      r.text();
      const button = [...r.element.querySelectorAll<HTMLButtonElement>('button')].find(
        element => element.textContent?.trim() === '启用同步'
      );
      expect(button).toBeDefined();
      expect(button!.disabled).toBe(true);
      r.component.syncReady.set(true);
      r.text();
      expect(button!.disabled).toBe(false);
    } finally {
      r.session.close();
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', descriptor);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    }
  });
  it.each([true, false])('自动同步为 %s 时仍可手动同步已有图片，忙碌时禁用操作', enabled => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = true;
      }
    });
    const r = rig();
    const enable = vi.spyOn(r.component, 'enableImageSync').mockResolvedValue(undefined);
    const button = (label: string) => {
      r.text();
      return [...r.element.querySelectorAll<HTMLButtonElement>('dialog button')].find(
        element => element.textContent?.trim() === label
      );
    };
    try {
      r.component.view.set('providers');
      r.component.targetKind.set('platform');
      r.component.authStatus.set('signed-in');
      r.component.authUser.set({ id: 'fixture-account', email: null });
      r.component.syncInitialized.set(true);
      r.component.imageSyncEnabled.set(enabled);
      r.component.authOpen.set(true);

      expect(button(enabled ? '停止图片自动同步' : '只同步以后保存的图片')).toBeDefined();
      const existing = button('同步已有及以后图片');
      expect(existing).toBeDefined();
      expect(existing!.disabled).toBe(false);
      existing!.click();
      expect(enable).toHaveBeenCalledExactlyOnceWith('existing');

      r.component.imageSyncBusy.set(true);
      expect(button('同步已有及以后图片')?.disabled).toBe(true);
      expect(button(enabled ? '停止图片自动同步' : '只同步以后保存的图片')?.disabled).toBe(true);
      r.component.imageSyncBusy.set(false);
      r.component.dataBusy.set(true);
      expect(button('同步已有及以后图片')?.disabled).toBe(true);
    } finally {
      r.session.close();
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', descriptor);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    }
  });
  it('does not infer missing originals, empty libraries or absent task copies before the first successful read', () => {
    const r = rig();
    r.streams[0].error(new Error('metadata failed'));
    expect(r.text()).toContain('尚未确认');
    expect(r.element.querySelector('.count-badge')?.textContent).toContain('…');
    expect(r.text()).not.toContain('本机无原图');
    expect(r.text()).not.toContain('本机无副本');
    expect(r.text()).not.toContain('这里，还差你的第一张作品');
    expect(r.text()).not.toContain('没有匹配的作品');
    expect(r.element.querySelector('.task-history')?.textContent).toContain('尚未确认');
    expect(r.component.remoteOnlyWorks()).toEqual([]);
    r.session.start();
    r.streams[1].next([]);
    expect(r.text()).toContain('本机无原图');
    expect(r.element.querySelector('.count-badge')?.textContent).toContain('0');
    expect(r.element.querySelector('.task-history')?.textContent).toContain('本机无副本');
    r.session.close();
  });

  it('retains known ownership after a later error and clears the dedicated error on recovery', () => {
    const r = rig();
    r.streams[0].next([
      { jobId: remote.jobId, prompt: remote.prompt, modelId: remote.modelId, bytes: 10, status: 'saved' }
    ]);
    r.streams[0].error(new Error('metadata failed'));
    expect(r.text()).toContain('作品记录暂时无法读取');
    expect(r.element.querySelector('.task-history')?.textContent).toContain('有本机保存记录');
    expect(r.component.remoteOnlyWorks()).toEqual([]);
    expect(r.component.storageMessage()).toBe('');
    r.session.start();
    r.streams[1].next([]);
    expect(r.text()).not.toContain('作品记录暂时无法读取');
    expect(r.element.querySelector('.task-history')?.textContent).toContain('本机无副本');
    r.session.close();
  });

  it('keeps an opening workspace out of the empty-library presentation', () => {
    const r = rig();
    r.component.localStatus.set('opening');
    r.component.syncedWorks.set([]);
    expect(r.text()).toContain('正在读取作品');
    expect(r.text()).not.toContain('这里，还差你的第一张作品');
    r.session.close();
  });
});
