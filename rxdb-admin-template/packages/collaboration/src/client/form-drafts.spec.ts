import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { button, checkbox, element, input, section, select, valueText } from './elements.js';
import { FormDrafts } from './form-drafts.js';
import { tx, useTranslation } from './translate.js';
beforeEach(() => {
  const window = new Window();
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('HTMLInputElement', window.HTMLInputElement);
  vi.stubGlobal('HTMLSelectElement', window.HTMLSelectElement);
  vi.stubGlobal('Event', window.Event);
});
afterEach(() => { useTranslation(undefined); vi.unstubAllGlobals(); });
describe('pending form inputs across asynchronous refresh', () => {
  it('retains typed input and permissions through refresh but clears them for another account or task', () => {
    const host = document.createElement('div');
    const state = new FormDrafts(host);
    host.addEventListener('input', state.remember);
    const name = input('另存任务名称', 'Default'); const grant = checkbox('查看', false);
    host.append(name.wrapper, grant.wrapper); state.restore('alice/task');
    name.control.value = 'Keep my name'; name.control.dispatchEvent(new Event('input', { bubbles: true }));
    grant.control.checked = true; grant.control.dispatchEvent(new Event('input', { bubbles: true }));
    const fresh = input('另存任务名称', 'Default'); const freshGrant = checkbox('查看', false);
    host.replaceChildren(fresh.wrapper, freshGrant.wrapper); state.restore('alice/task');
    expect(fresh.control.value).toBe('Keep my name'); expect(freshGrant.control.checked).toBe(true);
    const other = input('另存任务名称', 'Other task'); host.replaceChildren(other.wrapper); state.restore('bob/task');
    expect(other.control.value).toBe('Other task');
  });
  it('never replaces current record buffers, readonly outputs, or a removed select choice', () => {
    const host = document.createElement('div'); const state = new FormDrafts(host);
    host.addEventListener('input', state.remember); state.restore('alice');
    const name = input('名称', 'Old'); name.control.dataset['recordId'] = 'record';
    const choice = select('阶段', [{ value: 'old', label: 'Old' }], 'old');
    const link = input('邀请链接', 'secret'); host.append(name.wrapper, choice.wrapper, link.wrapper);
    [name.control, choice.control, link.control].forEach(control => control.dispatchEvent(new Event('input', { bubbles: true })));
    name.control.value = 'New'; link.control.value = 'New link'; link.control.readOnly = true;
    const updated = select('阶段', [{ value: 'new', label: 'New' }], 'new'); choice.wrapper.replaceWith(updated.wrapper);
    state.restore('alice');
    expect(name.control.value).toBe('New'); expect(link.control.value).toBe('New link'); expect(updated.control.value).toBe('new');
  });
  it('translates product labels and parameters without translating user content', async () => {
    useTranslation((key, values) => `${key.replace('collaboration.', 'translated:')}:${Object.values(values).join(',')}`);
    expect(input('名称').control.getAttribute('aria-label')).toBe('translated:名称:');
    expect(section('团队协作').textContent).toBe('translated:团队协作:');
    expect(tx('任务：{v0}', { v0: 'User task' })).toBe('translated:任务：{v0}:User task');
    expect(element('h3', '保存全部', '', true).textContent).toBe('保存全部');
    expect(element('td', '保存全部').textContent).toBe('保存全部');
    expect(valueText(null)).toBe('translated:（空）:'); expect(valueText(undefined)).toBe('translated:（不存在）:');
    expect(valueText({ price: 1 })).toBe('{"price":1}'); expect(valueText(42)).toBe('42');
    useTranslation(undefined); expect(tx('任务：{v0}', { v0: 'Local' })).toBe('任务：Local');
    let done: () => void = () => undefined;
    const control = button('保存全部', () => new Promise<void>(resolve => { done = resolve; }));
    control.click(); expect(control.disabled).toBe(true); done(); await Promise.resolve(); await Promise.resolve(); expect(control.disabled).toBe(false);
  });
});
