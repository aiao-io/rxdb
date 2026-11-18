import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { button, checkbox, element, input, section, select, valueText } from './elements.js';
import { FormDrafts } from './form-drafts.js';
import { tx, useTranslation } from './translate.js';
beforeEach(() => {
  const window = new Window();
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('sessionStorage', window.sessionStorage);
  vi.stubGlobal('HTMLInputElement', window.HTMLInputElement);
  vi.stubGlobal('HTMLSelectElement', window.HTMLSelectElement);
  vi.stubGlobal('Event', window.Event);
});
afterEach(() => {
  useTranslation(undefined);
  vi.unstubAllGlobals();
});
describe('pending form inputs across asynchronous refresh', () => {
  it('keeps expanded history stable through live refresh and clears disclosure state across contexts', () => {
    const host = document.createElement('div');
    const state = new FormDrafts(host);
    state.restore('alice/task');
    const original = element('details');
    original.dataset['disclosureKey'] = 'commit:original';
    host.append(original);
    original.open = true;
    state.rememberDisclosures();
    const refreshed = element('details');
    refreshed.dataset['disclosureKey'] = 'commit:original';
    host.replaceChildren(refreshed);
    state.restore('alice/task');
    expect(refreshed.open).toBe(true);
    const other = element('details');
    other.dataset['disclosureKey'] = 'commit:original';
    host.replaceChildren(other);
    state.restore('bob/task');
    expect(other.open).toBe(false);
  });
  it('reports whether a disclosure was open at the last render, and forgets that across contexts', () => {
    const host = document.createElement('div');
    const state = new FormDrafts(host);
    state.restore('alice/task');
    const details = element('details');
    details.dataset['disclosureKey'] = 'commit:a';
    host.append(details);
    expect(state.isOpen('commit:a')).toBe(false);
    details.open = true;
    expect(state.isOpen('commit:a')).toBe(false);
    state.rememberDisclosures();
    expect(state.isOpen('commit:a')).toBe(true);
    expect(state.isOpen('commit:unknown')).toBe(false);
    details.open = false;
    state.rememberDisclosures();
    expect(state.isOpen('commit:a')).toBe(false);
    details.open = true;
    state.rememberDisclosures();
    state.restore('bob/task');
    expect(state.isOpen('commit:a')).toBe(false);
  });
  it('hands keyboard focus on a disclosure summary back to the same disclosure after a redraw', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const state = new FormDrafts(host);
    const build = (...keys: string[]) =>
      keys.map(key => {
        const details = element('details');
        details.dataset['disclosureKey'] = key;
        const summary = element('summary', key, '', true);
        summary.tabIndex = 0;
        details.append(summary);
        return { details, summary };
      });
    const before = build('commit:a', 'commit:b');
    host.append(...before.map(item => item.details));
    expect(state.focusedDisclosure()).toBeUndefined();
    before[1].summary.focus();
    expect(state.focusedDisclosure()).toBe('commit:b');
    const outside = element('button', 'outside', '', true);
    document.body.append(outside);
    outside.focus();
    expect(state.focusedDisclosure()).toBeUndefined();
    before[1].summary.focus();
    const after = build('commit:a', 'commit:b');
    host.replaceChildren(...after.map(item => item.details));
    state.focusDisclosure('commit:b');
    expect(document.activeElement).toBe(after[1].summary);
    state.focusDisclosure('commit:missing');
    expect(document.activeElement).toBe(after[1].summary);
    host.remove();
    outside.remove();
  });
  it('retains typed input and permissions through refresh but clears them for another account or task', () => {
    const host = document.createElement('div');
    const state = new FormDrafts(host);
    host.addEventListener('input', state.remember);
    const name = input('另存任务名称', 'Default');
    const grant = checkbox('查看', false);
    host.append(name.wrapper, grant.wrapper);
    state.restore('alice/task');
    name.control.value = 'Keep my name';
    name.control.dispatchEvent(new Event('input', { bubbles: true }));
    grant.control.checked = true;
    grant.control.dispatchEvent(new Event('input', { bubbles: true }));
    const fresh = input('另存任务名称', 'Default');
    const freshGrant = checkbox('查看', false);
    host.replaceChildren(fresh.wrapper, freshGrant.wrapper);
    state.restore('alice/task');
    expect(fresh.control.value).toBe('Keep my name');
    expect(freshGrant.control.checked).toBe(true);
    const other = input('另存任务名称', 'Other task');
    host.replaceChildren(other.wrapper);
    state.restore('bob/task');
    expect(other.control.value).toBe('Other task');
  });
  it('never replaces readonly outputs or a removed select choice', () => {
    const host = document.createElement('div');
    const state = new FormDrafts(host);
    host.addEventListener('input', state.remember);
    state.restore('alice');
    const choice = select('阶段', [{ value: 'old', label: 'Old' }], 'old');
    const link = input('邀请链接', 'secret');
    host.append(choice.wrapper, link.wrapper);
    [choice.control, link.control].forEach(control => control.dispatchEvent(new Event('input', { bubbles: true })));
    link.control.value = 'New link';
    link.control.readOnly = true;
    const updated = select('阶段', [{ value: 'new', label: 'New' }], 'new');
    choice.wrapper.replaceWith(updated.wrapper);
    state.restore('alice');
    expect(link.control.value).toBe('New link');
    expect(updated.control.value).toBe('new');
  });
  it('translates product labels and parameters without translating user content', async () => {
    useTranslation(
      (key, values) => `${key.replace('collaboration.', 'translated:')}:${Object.values(values).join(',')}`
    );
    expect(input('名称').control.getAttribute('aria-label')).toBe('translated:名称:');
    expect(section('团队协作').textContent).toBe('translated:团队协作:');
    expect(tx('任务：{v0}', { v0: 'User task' })).toBe('translated:任务：{v0}:User task');
    expect(element('h3', '保存全部', '', true).textContent).toBe('保存全部');
    expect(element('td', '保存全部').textContent).toBe('保存全部');
    expect(valueText(null)).toBe('translated:（空）:');
    expect(valueText(undefined)).toBe('translated:（不存在）:');
    expect(valueText({ price: 1 })).toBe('{"price":1}');
    expect(valueText(42)).toBe('42');
    useTranslation(undefined);
    expect(tx('任务：{v0}', { v0: 'Local' })).toBe('任务：Local');
    let done: () => void = () => undefined;
    const control = button(
      '保存全部',
      () =>
        new Promise<void>(resolve => {
          done = resolve;
        })
    );
    control.click();
    expect(control.disabled).toBe(true);
    done();
    await Promise.resolve();
    await Promise.resolve();
    expect(control.disabled).toBe(false);
  });
  it('restores conflict decisions after reload only for the original verified context', () => {
    const host = document.createElement('div');
    const state = new FormDrafts(host);
    host.addEventListener('input', state.remember);
    state.restore('view', 'alice/team/task');
    const decision = input('自定义结果（JSON 值）');
    decision.control.dataset['persistentDraft'] = 'true';
    host.append(decision.wrapper);
    decision.control.value = '999';
    decision.control.dispatchEvent(new Event('input', { bubbles: true }));
    const restored = input('自定义结果（JSON 值）');
    restored.control.dataset['persistentDraft'] = 'true';
    host.replaceChildren(restored.wrapper);
    new FormDrafts(host).restore('view', 'alice/team/task');
    expect(restored.control.value).toBe('999');
    restored.control.value = '';
    new FormDrafts(host).restore('view', 'bob/team/task');
    expect(restored.control.value).toBe('');
  });
});
