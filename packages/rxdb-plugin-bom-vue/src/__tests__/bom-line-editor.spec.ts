/** @fileoverview 真实行编辑器的输入合同、只读边界与加载/错误状态。 */

import type { BomLineEditorState, BomLineEditorValue, BomOccurrencePatch } from '@aiao/rxdb-plugin-bom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { h, nextTick, shallowRef } from 'vue';
import BomLineEditor from '../BomLineEditor.vue';
import { cleanupMounted, editorState, fillInput, labeledInput, mountRender } from './fixtures.js';

const value = (patch: Partial<BomLineEditorValue> = {}): BomLineEditorValue => ({
  occurrenceId: 'occurrence-one',
  qty: '1.234567890123456789012345678901234',
  componentScrap: '0.02',
  operationSeq: 10,
  effectiveFrom: new Date('2099-01-01T00:00:00.000Z'),
  effectiveTo: null,
  editable: true,
  readOnlyReason: null,
  ...patch
});

const mountEditor = (initial: BomLineEditorState) => {
  const state = shallowRef(initial);
  const save = vi.fn<(patch: BomOccurrencePatch) => void>();
  const host = mountRender(() => h(BomLineEditor, { state: state.value, onSave: save }));
  const update = async (next: BomLineEditorState): Promise<void> => {
    state.value = next;
    await nextTick();
  };
  const submit = async (): Promise<void> => {
    const form = host.querySelector('form');
    if (!form) throw new Error('缺少原生编辑表单');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await nextTick();
  };
  return { host, save, update, submit };
};

const saveButton = (host: HTMLElement): HTMLButtonElement => {
  const button = [...host.querySelectorAll('button')].find(value => value.textContent?.trim() === '保存');
  if (!button) throw new Error('缺少保存按钮');
  return button;
};

afterEach(cleanupMounted);

describe('BomLineEditor（Vue）', () => {
  it('五个字段都有标签并显示高精度原值；输入后不失焦即可保存统一 patch', async () => {
    const editor = mountEditor(editorState({ phase: 'success', value: value() }));
    expect(labeledInput(editor.host, '用量').value).toBe('1.234567890123456789012345678901234');
    expect(labeledInput(editor.host, '组件损耗').value).toBe('0.02');
    expect(labeledInput(editor.host, '工序').value).toBe('10');
    expect(labeledInput(editor.host, '生效日期').value).toBe('2099-01-01');
    expect(labeledInput(editor.host, '失效日期').value).toBe('');
    await fillInput(labeledInput(editor.host, '用量'), '2.345678901234567890123456789012345');
    await fillInput(labeledInput(editor.host, '组件损耗'), '0.05');
    await fillInput(labeledInput(editor.host, '工序'), '20');
    await fillInput(labeledInput(editor.host, '生效日期'), '2099-02-01');
    await fillInput(labeledInput(editor.host, '失效日期'), '2099-03-01');
    await editor.submit();
    expect(editor.save).toHaveBeenCalledExactlyOnceWith({
      qty: '2.345678901234567890123456789012345',
      componentScrap: '0.05',
      operationSeq: 20,
      effectiveFrom: new Date('2099-02-01T00:00:00.000Z'),
      effectiveTo: new Date('2099-03-01T00:00:00.000Z')
    });
  });

  it('同一编辑值的外部状态重绘不会清空尚未失焦的输入', async () => {
    const record = value({ qty: '1' });
    const initial = editorState({ phase: 'success', value: record });
    const editor = mountEditor(initial);
    await fillInput(labeledInput(editor.host, '用量'), '2.5');
    await editor.update({ ...initial, error: new Error('上次保存失败') });
    expect(labeledInput(editor.host, '用量').value).toBe('2.5');
    await editor.submit();
    expect(editor.save).toHaveBeenCalledWith(expect.objectContaining({ qty: '2.5' }));
  });

  it('清空工序与失效日期发出 null，切换发生项后不残留上一个目标的输入', async () => {
    const editor = mountEditor(
      editorState({ phase: 'success', value: value({ effectiveTo: new Date('2099-04-01T00:00:00.000Z') }) })
    );
    await fillInput(labeledInput(editor.host, '工序'), '');
    await fillInput(labeledInput(editor.host, '失效日期'), '');
    await editor.submit();
    expect(editor.save).toHaveBeenCalledWith(expect.objectContaining({ operationSeq: null, effectiveTo: null }));
    await fillInput(labeledInput(editor.host, '用量'), '9');
    await editor.update(
      editorState({ phase: 'success', value: value({ occurrenceId: 'occurrence-two', qty: '3', operationSeq: 30 }) })
    );
    expect(labeledInput(editor.host, '用量').value).toBe('3');
    expect(labeledInput(editor.host, '工序').value).toBe('30');
  });

  it('已发布发生项显示原始只读原因，字段和保存入口不可编辑', () => {
    const reason = '已发布发生项只读，请通过 draft ECN 新发生项编辑';
    const editor = mountEditor(
      editorState({ phase: 'success', value: value({ editable: false, readOnlyReason: reason }) })
    );
    expect(editor.host.textContent).toContain(reason);
    for (const label of ['用量', '组件损耗', '工序', '生效日期', '失效日期']) {
      const input = labeledInput(editor.host, label);
      expect(input.matches(':disabled') || input.readOnly).toBe(true);
    }
    expect(saveButton(editor.host).matches(':disabled')).toBe(true);
    saveButton(editor.host).click();
    expect(editor.save).not.toHaveBeenCalled();
  });

  it('保存期间可见进度并禁用重复保存，完成后恢复入口', async () => {
    const record = value();
    const editor = mountEditor(editorState({ phase: 'success', value: record, saving: true }));
    expect(editor.host.textContent).toMatch(/保存/);
    const buttons = [...editor.host.querySelectorAll('button')];
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every(button => button.matches(':disabled'))).toBe(true);
    expect(labeledInput(editor.host, '用量').matches(':disabled')).toBe(true);
    await editor.update(editorState({ phase: 'success', value: record }));
    expect(saveButton(editor.host).matches(':disabled')).toBe(false);
  });

  it('初始、加载和带原值的错误都有可读状态，错误不改写业务消息', async () => {
    const editor = mountEditor(editorState());
    expect(editor.host.textContent).toMatch(/选择|尚未|暂无/);
    await editor.update(editorState({ phase: 'loading' }));
    expect(editor.host.textContent).toMatch(/加载/);
    expect(editor.host.querySelector('[role="status"],[aria-live]')).not.toBeNull();
    await editor.update(editorState({ phase: 'error', value: value(), error: new Error('检测到环：A → B → A') }));
    expect(editor.host.textContent).toContain('检测到环：A → B → A');
    expect(editor.host.querySelector('[role="alert"]')).not.toBeNull();
    expect(labeledInput(editor.host, '用量').value).toBe('1.234567890123456789012345678901234');
    expect(saveButton(editor.host).matches(':disabled')).toBe(false);
  });
});
