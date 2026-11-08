import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as assets from './prompt-assets';
import * as runtime from './prompt-editor-runtime';
import { PromptInput } from './prompt-input';
import { plainPrompt, serializePrompt, type PromptState } from './prompt-state';

const fields: PromptState = {
  document: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '画一张' },
          { type: 'templateField', attrs: { fieldId: 'subject' } }
        ]
      }
    ]
  },
  fields: [{ id: 'subject', label: '主体', defaultValue: '', required: true }],
  values: { subject: '猫' }
};
async function rig(state = plainPrompt('初始正文'), disabled = false) {
  const fixture = TestBed.createComponent(PromptInput);
  fixture.componentRef.setInput('state', structuredClone(state));
  fixture.componentRef.setInput('disabled', disabled);
  const changed = vi.fn();
  fixture.componentInstance.changed.subscribe(changed);
  const readiness = vi.fn();
  fixture.componentInstance.readiness.subscribe(readiness);
  fixture.detectChanges();
  await vi.waitFor(() => expect(fixture.componentInstance.ready()).toBe(true));
  const component = fixture.componentInstance;
  const editor = Reflect.get(component, 'editor') as Editor;
  return { fixture, component, editor, changed, readiness, element: fixture.nativeElement as HTMLElement };
}
function paste(element: HTMLElement, text: string) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
  element.querySelector('.ProseMirror')!.dispatchEvent(event);
  return event;
}
function loadingRig(state = plainPrompt('加载后聚焦')) {
  let resolve!: (value: typeof runtime) => void;
  vi.mocked(assets.loadPromptEditor).mockReturnValueOnce(
    new Promise(yes => {
      resolve = yes;
    })
  );
  const fixture = TestBed.createComponent(PromptInput);
  fixture.componentRef.setInput('state', state);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, resolve: () => resolve(runtime) };
}
function captureFrames() {
  const callbacks: FrameRequestCallback[] = [];
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => {
    callbacks.push(callback);
    return callbacks.length;
  });
  return () => callbacks.splice(0).forEach(callback => callback(0));
}
beforeEach(() => {
  vi.spyOn(assets, 'loadPromptEditor').mockResolvedValue(runtime);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(async () => undefined) },
    configurable: true
  });
});
afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});

describe('prompt editor behavior', () => {
  it('loads the real editor and emits validated document updates', async () => {
    const r = await rig();
    expect(r.readiness.mock.calls.map(([ready]) => ready)).toEqual([false, true]);
    expect(r.element.querySelector('[role="textbox"]')?.textContent).toBe('初始正文');
    r.editor.commands.insertContentAt(r.editor.state.doc.content.size - 1, '补充');
    expect(r.changed).toHaveBeenCalledWith(expect.objectContaining({ fields: [], values: {} }));
    expect(r.editor.getText()).toContain('补充');
    r.component.undo();
    expect(r.editor.getText()).toBe('初始正文');
    r.component.redo();
    expect(r.editor.getText()).toContain('补充');
  });

  it('treats pasted HTML as plain text and blocks oversized text', async () => {
    const r = await rig(plainPrompt(''));
    const event = paste(r.element, '<script>example</script>');
    expect(event.defaultPrevented).toBe(true);
    expect(r.editor.getText()).toBe('<script>example</script>');
    expect(r.element.querySelector('script')).toBeNull();
    paste(r.element, 'a'.repeat(30001));
    expect(r.editor.getText()).toBe('<script>example</script>');
    expect(r.component.message()).toContain('安全上限');
  });

  it('keeps native fields and editor content disabled while a generation is active', async () => {
    const r = await rig(fields);
    r.fixture.componentRef.setInput('disabled', true);
    r.fixture.detectChanges();
    const input = r.element.querySelector<HTMLInputElement>('.prompt-field input')!;
    expect(input.disabled).toBe(true);
    expect(r.editor.isEditable).toBe(false);
    input.value = '不应保存';
    input.dispatchEvent(new Event('input'));
    paste(r.element, '不应粘贴');
    r.component.undo();
    r.component.redo();
    expect(r.changed).not.toHaveBeenCalled();
    expect(r.editor.getText()).toBe('画一张');
  });

  it('commits parameter input only at composition end and includes the value in the emitted state', async () => {
    const r = await rig(fields);
    const input = r.element.querySelector<HTMLInputElement>('[aria-label="模板参数：主体"]')!;
    expect(input.value).toBe('猫');
    expect(input.placeholder).toBe('必填');
    input.dispatchEvent(new Event('compositionstart'));
    input.value = '新的主体';
    input.dispatchEvent(new Event('input'));
    expect(r.changed).not.toHaveBeenCalled();
    input.dispatchEvent(new Event('compositionend'));
    expect(r.changed).toHaveBeenLastCalledWith(expect.objectContaining({ values: { subject: '新的主体' } }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(input.value).toBe('猫');
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true, bubbles: true, cancelable: true })
    );
    expect(input.value).toBe('新的主体');
  });

  it('resets undo history when an external template replaces the document', async () => {
    const r = await rig();
    r.editor.commands.insertContent('旧草稿');
    r.fixture.componentRef.setInput('state', plainPrompt('新的模板'));
    r.fixture.detectChanges();
    r.component.undo();
    expect(r.editor.getText()).toBe('新的模板');
    expect(r.component.serialized().text).toBe('新的模板');
  });

  it('turns the current expanded template into editable plain text without losing line breaks', async () => {
    const state = structuredClone(fields);
    state.values['subject'] = '猫\n窗边的自然光';
    const r = await rig(state);
    r.component.changed.subscribe(next => r.fixture.componentRef.setInput('state', next));
    r.fixture.detectChanges();
    const button = Array.from(r.element.querySelectorAll('button')).find(
      item => item.textContent?.trim() === '转为普通提示词'
    );
    expect(button).toBeDefined();
    button!.click();
    r.fixture.detectChanges();
    expect(r.component.serialized()).toEqual({ text: '画一张猫\n窗边的自然光', valid: true, issues: [] });
    expect(r.component.state().fields).toEqual([]);
    expect(r.component.state().values).toEqual({});
    expect(r.element.querySelector('.prompt-field')).toBeNull();
    expect(Array.from(r.element.querySelectorAll('.prompt-editor p')).map(item => item.textContent)).toEqual([
      '画一张猫',
      '窗边的自然光'
    ]);
    r.component.undo();
    expect(r.element.querySelector('.prompt-field')).toBeNull();
    expect(button!.isConnected).toBe(false);
  });

  it('allows a rewritten template with removed required fields to recover as a plain prompt', async () => {
    const r = await rig({ ...fields, document: plainPrompt('重新写过的普通描述').document });
    r.component.changed.subscribe(next => r.fixture.componentRef.setInput('state', next));
    r.fixture.detectChanges();
    expect(r.component.serialized().valid).toBe(false);
    const button = Array.from(r.element.querySelectorAll('button')).find(
      item => item.textContent?.trim() === '转为普通提示词'
    );
    expect(button).toBeDefined();
    button!.click();
    r.fixture.detectChanges();
    expect(serializePrompt(r.changed.mock.lastCall![0])).toEqual({
      text: '重新写过的普通描述',
      valid: true,
      issues: []
    });
    expect(r.component.serialized().valid).toBe(true);
  });

  it('disables template conversion with the editor and hides it for an ordinary prompt', async () => {
    const r = await rig(fields, true);
    r.fixture.detectChanges();
    const button = Array.from(r.element.querySelectorAll('button')).find(
      item => item.textContent?.trim() === '转为普通提示词'
    );
    expect(button).toBeDefined();
    expect(button!.disabled).toBe(true);
    button!.click();
    expect(r.changed).not.toHaveBeenCalled();
    r.fixture.componentRef.setInput('state', plainPrompt('普通正文'));
    r.fixture.detectChanges();
    expect(button!.isConnected).toBe(false);
  });

  it('copies only the final valid text and offers a visible preview if clipboard access fails', async () => {
    const r = await rig(fields);
    await r.component.copyFinal();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('画一张猫');
    expect(r.component.message()).toBe('最终提示词已复制');
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error('denied'));
    await r.component.copyFinal();
    expect(r.component.preview()).toBe(true);
    expect(r.component.message()).toContain('手动选择');
    r.fixture.componentRef.setInput('state', { ...fields, values: { subject: '' } });
    r.fixture.detectChanges();
    vi.mocked(navigator.clipboard.writeText).mockClear();
    await r.component.copyFinal();
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it('retains the draft and allows an explicit retry when editor loading fails', async () => {
    vi.mocked(assets.loadPromptEditor).mockRejectedValueOnce(new Error('missing runtime'));
    const fixture = TestBed.createComponent(PromptInput);
    fixture.componentRef.setInput('state', fields);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.error()).toContain('正文与参数已保留'));
    expect(fixture.componentInstance.ready()).toBe(false);
    expect(fixture.componentInstance.serialized().text).toBe('画一张猫');
    await fixture.componentInstance.copyFinal();
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    await fixture.componentInstance.initialize();
    expect(fixture.componentInstance.ready()).toBe(true);
    expect(fixture.componentInstance.error()).toBe('');
  });

  it('honors focus requested before the editor runtime finishes loading', async () => {
    const runFrames = captureFrames();
    const r = loadingRig();
    r.component.focus();
    r.resolve();
    await vi.waitFor(() => expect(r.component.ready()).toBe(true));
    const editor = Reflect.get(r.component, 'editor') as Editor;
    const focus = vi.spyOn(editor.view, 'focus');
    runFrames();
    expect(focus).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(editor.view.dom);
  });

  it('keeps a native parameter focused while an early focus request waits for its animation frame', async () => {
    const runFrames = captureFrames();
    const r = loadingRig(fields);
    r.component.focus();
    r.resolve();
    await vi.waitFor(() => expect(r.component.ready()).toBe(true));
    const editor = Reflect.get(r.component, 'editor') as Editor;
    const focus = vi.spyOn(editor.view, 'focus');
    const input = r.fixture.nativeElement.querySelector('.prompt-field input') as HTMLInputElement;
    input.focus();
    runFrames();
    expect(focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
  });

  it('drops early focus when the editor becomes disabled before initialization completes', async () => {
    const runFrames = captureFrames();
    const r = loadingRig();
    r.component.focus();
    r.fixture.componentRef.setInput('disabled', true);
    r.fixture.detectChanges();
    r.resolve();
    await vi.waitFor(() => expect(r.component.ready()).toBe(true));
    const editor = Reflect.get(r.component, 'editor') as Editor;
    const focus = vi.spyOn(editor.view, 'focus');
    runFrames();
    expect(focus).not.toHaveBeenCalled();
  });

  it('does not create an editor after the component is destroyed while loading', async () => {
    let resolve!: (value: typeof runtime) => void;
    vi.mocked(assets.loadPromptEditor).mockReturnValue(
      new Promise(yes => {
        resolve = yes;
      })
    );
    const fixture = TestBed.createComponent(PromptInput);
    fixture.componentRef.setInput('state', plainPrompt('保留正文'));
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.focus();
    await component.initialize();
    expect(assets.loadPromptEditor).toHaveBeenCalledTimes(1);
    fixture.destroy();
    resolve(runtime);
    await Promise.resolve();
    expect(component.ready()).toBe(false);
    expect(Reflect.get(component, 'editor')).toBeUndefined();
    await component.initialize();
    expect(assets.loadPromptEditor).toHaveBeenCalledTimes(1);
  });

  it('does not load browser assets during server rendering', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }] });
    const fixture = TestBed.createComponent(PromptInput);
    fixture.componentRef.setInput('state', plainPrompt('服务端正文'));
    fixture.detectChanges();
    await fixture.componentInstance.initialize();
    fixture.componentInstance.focus();
    expect(assets.loadPromptEditor).not.toHaveBeenCalled();
    expect(fixture.componentInstance.ready()).toBe(false);
  });
});
