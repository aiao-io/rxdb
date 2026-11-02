import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { BrowserWorkbench } from './BrowserWorkbench';

const mocks = vi.hoisted(() => ({ mount: vi.fn(), dispose: vi.fn(), change: vi.fn(), cursor: vi.fn() }));
vi.mock('@aiao/browser-workbench', () => ({ mountWorkbench: mocks.mount }));
let editor: { update(value: string, language: string): void; dispose(): void };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mount.mockImplementation((host, _options, mountEditor) => {
    const element = document.createElement('div');
    host.append(element);
    editor = mountEditor(element, {
      value: 'initial',
      language: 'plaintext',
      onChange: mocks.change,
      onCursor: mocks.cursor
    });
    return {
      dispose: () => {
        editor.dispose();
        mocks.dispose();
      }
    };
  });
});

describe('BrowserWorkbench Vue binding', () => {
  it('mounts the existing editor, updates values and disposes the workbench', async () => {
    const view = mount(BrowserWorkbench, {
      props: { options: { initialProjectId: 'fixture' } },
      attachTo: document.body
    });
    await nextTick();
    expect(view.element.querySelector('.cm-content')?.textContent).toBe('initial');
    editor.update('changed', 'plaintext');
    await nextTick();
    expect(view.element.querySelector('.cm-content')?.textContent).toBe('changed');
    view.element.querySelector('.cm-content')?.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    expect(mocks.cursor).toHaveBeenCalledWith(1, 1);
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { getData: () => 'pasted', files: [] } });
    view.element.querySelector('.cm-content')?.dispatchEvent(paste);
    expect(mocks.change).toHaveBeenCalledWith(expect.stringContaining('pasted'));
    expect(mocks.mount.mock.calls[0][1]).toEqual({ initialProjectId: 'fixture' });
    view.unmount();
    expect(mocks.dispose).toHaveBeenCalledOnce();
  });

  it('provides the same default options as the other framework bindings', async () => {
    const view = mount(BrowserWorkbench, { attachTo: document.body });
    await nextTick();
    expect(mocks.mount.mock.calls[0][1]).toEqual({});
    view.unmount();
  });
});
