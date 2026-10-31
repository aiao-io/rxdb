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

describe('library ownership presentation', () => {
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
