import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { LocalImageMvp } from './local-image-mvp';
import { PromptInput } from './prompts/prompt-input';

function rig() {
  vi.spyOn(LocalImageMvp.prototype, 'ngOnInit').mockImplementation(() => undefined);
  vi.spyOn(PromptInput.prototype, 'ngAfterViewInit').mockImplementation(() => undefined);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  const focus = vi.spyOn(PromptInput.prototype, 'focus').mockImplementation(() => undefined);
  TestBed.overrideComponent(PromptInput, { set: { template: '' } });
  TestBed.overrideComponent(LocalImageMvp, {
    set: {
      imports: [PromptInput],
      template: `@if (view() === 'studio') {
        <app-prompt-input [state]="promptState()" [disabled]="sending() || workspaceSwitching()" />
      }`
    }
  });
  const fixture = TestBed.createComponent(LocalImageMvp);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, focus };
}

afterEach(() => {
  TestBed.resetTestingModule();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it.each(['workspace', 'identity', 'disabled'] as const)('导航等待 %s 就绪后只请求一次正文焦点', async blocked => {
  const { fixture, component, focus } = rig();
  const pending = {
    workspace: component.workspaceSwitching,
    identity: component.identityBlocked,
    disabled: component.sending
  }[blocked];
  pending.set(true);
  component.navigate('studio');
  fixture.detectChanges();
  await fixture.whenStable();
  expect(focus).not.toHaveBeenCalled();

  pending.set(false);
  fixture.detectChanges();
  await fixture.whenStable();
  expect(focus).toHaveBeenCalledOnce();

  pending.set(true);
  fixture.detectChanges();
  pending.set(false);
  fixture.detectChanges();
  await fixture.whenStable();
  expect(focus).toHaveBeenCalledOnce();
});

it.each(['link', 'history'] as const)('%s：就绪前离开创作页会取消焦点请求，不在后续渲染中抢焦点', async navigation => {
  const { fixture, component, focus } = rig();
  component.workspaceSwitching.set(true);
  component.navigate('studio');
  fixture.detectChanges();
  await fixture.whenStable();
  if (navigation === 'link') component.navigate('discover');
  else component.view.set('discover');
  fixture.detectChanges();
  component.workspaceSwitching.set(false);
  fixture.detectChanges();
  await fixture.whenStable();
  expect(focus).not.toHaveBeenCalled();

  component.navigate('studio');
  fixture.detectChanges();
  await fixture.whenStable();
  expect(focus).toHaveBeenCalledOnce();
});
