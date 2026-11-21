import { afterEach, describe, expect, it, vi } from 'vitest';
import * as catalog from './catalog-data';
import { loadPromptCatalog, loadPromptEditor } from './prompt-assets';
import * as editor from './prompt-editor-runtime';

afterEach(() => {
  Reflect.deleteProperty(window, 'AiaoPromptEditor');
  Reflect.deleteProperty(window, 'AiaoPromptCatalog');
  document.querySelectorAll('script[src^="/prompt-runtime/"]').forEach(script => script.remove());
  vi.useRealTimers();
});
describe('retryable local prompt assets', () => {
  it('reuses an already loaded runtime without creating a script', async () => {
    Object.assign(window, { AiaoPromptEditor: editor, AiaoPromptCatalog: catalog });
    expect(await loadPromptEditor()).toBe(editor);
    expect(await loadPromptCatalog()).toBe(catalog);
    expect(document.querySelector('script[src^="/prompt-runtime/"]')).toBeNull();
  });

  it('deduplicates simultaneous loads and uses only the fixed same-origin path', async () => {
    const first = loadPromptEditor();
    const second = loadPromptEditor();
    const scripts = document.querySelectorAll<HTMLScriptElement>('script[src="/prompt-runtime/editor.js"]');
    expect(scripts).toHaveLength(1);
    Object.assign(window, { AiaoPromptEditor: editor });
    scripts[0].dispatchEvent(new Event('load'));
    expect(await first).toBe(editor);
    expect(await second).toBe(editor);
  });

  it('removes a failed script and permits an explicit retry', async () => {
    const first = loadPromptCatalog();
    const assertion = expect(first).rejects.toThrow('unavailable');
    document.querySelector('script[src="/prompt-runtime/catalog.js"]')!.dispatchEvent(new Event('error'));
    await assertion;
    expect(document.querySelector('script[src="/prompt-runtime/catalog.js"]')).toBeNull();
    const retry = loadPromptCatalog();
    Object.assign(window, { AiaoPromptCatalog: catalog });
    document.querySelector('script[src="/prompt-runtime/catalog.js"]')!.dispatchEvent(new Event('load'));
    expect(await retry).toBe(catalog);
  });

  it('rejects a successful script load that did not export the required runtime', async () => {
    const loading = loadPromptEditor();
    const assertion = expect(loading).rejects.toThrow('Invalid prompt runtime');
    document.querySelector('script[src="/prompt-runtime/editor.js"]')!.dispatchEvent(new Event('load'));
    await assertion;
    expect(document.querySelector('script[src="/prompt-runtime/editor.js"]')).toBeNull();
  });

  it('times out a stalled runtime and allows a later attempt', async () => {
    vi.useFakeTimers();
    const loading = loadPromptEditor();
    const assertion = expect(loading).rejects.toThrow('timeout');
    await vi.advanceTimersByTimeAsync(10000);
    await assertion;
    expect(document.querySelector('script[src="/prompt-runtime/editor.js"]')).toBeNull();
  });
});
