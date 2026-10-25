import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as assets from './prompt-assets';
import * as runtime from './prompt-editor-runtime';
import { PromptInput } from './prompt-input';
import { plainPrompt, type PromptState } from './prompt-state';

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
