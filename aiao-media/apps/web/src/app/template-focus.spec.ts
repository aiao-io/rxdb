import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { transitionImage } from './image-view-transition';
import { LocalImageMvp } from './local-image-mvp';

vi.mock('./image-view-transition', () => ({ transitionImage: vi.fn() }));

afterEach(() => {
  TestBed.resetTestingModule();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it.each([
  { title: '关闭模板的图片过渡结束后恢复原卡片焦点', renderBeforeOpening: false },
  { title: '打开图片过渡等待渲染时不丢失原卡片，关闭后仍能恢复焦点', renderBeforeOpening: true }
])('$title', async ({ renderBeforeOpening }) => {
  vi.spyOn(LocalImageMvp.prototype, 'ngOnInit').mockImplementation(() => undefined);
  TestBed.overrideComponent(LocalImageMvp, { set: { template: '' } });
  const fixture = TestBed.createComponent(LocalImageMvp);
  const component = fixture.componentInstance;
  const trigger = document.createElement('button');
  const another = document.createElement('button');
  document.body.append(trigger, another);
  let update!: () => Promise<HTMLImageElement | null>;
  vi.mocked(transitionImage).mockImplementation((_source, change) => {
    update = change;
    return Promise.resolve();
  });
  trigger.addEventListener('click', event => component.openTemplate(component.templates()[0], event));
  trigger.click();
  if (renderBeforeOpening) fixture.detectChanges();
  const shown = update();
  fixture.detectChanges();
  await shown;
  let finish!: () => void;
  vi.mocked(transitionImage).mockImplementation((_source, change) => {
    update = change;
    return new Promise(resolve => (finish = resolve));
  });

  component.closeTemplate();
  const hidden = update();
  fixture.detectChanges();
  await hidden;
  another.focus();
  expect(document.activeElement).toBe(another);
  finish();

  await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
});
