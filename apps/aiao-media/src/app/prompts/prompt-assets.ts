import type * as CatalogRuntime from './catalog-data';
import type * as EditorRuntime from './prompt-editor-runtime';

type RuntimeWindow = Window & {
  AiaoPromptEditor?: typeof EditorRuntime;
  AiaoPromptCatalog?: typeof CatalogRuntime;
};
const pending = new Map<string, Promise<unknown>>();

/** Classic script loads can be retried without a poisoned ES module map.
 * Only two fixed, locally bundled paths are accepted, under script-src 'self'.
 * Non-fingerprinted files use no-store online and the integrity-checked offline
 * manifest in installed Web / Desktop shells. No credentials or personal data.
 */
async function loadAsset<T>(name: 'editor' | 'catalog', read: () => T | undefined): Promise<T> {
  const loaded = read();
  if (loaded) return loaded;
  const waiting = pending.get(name);
  if (waiting) return waiting as Promise<T>;
  const attempt = new Promise<T>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `/prompt-runtime/${name}.js`;
    script.async = true;
    const finish = (error?: Error) => {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      if (error) {
        script.remove();
        reject(error);
      } else {
        const value = read();
        if (value) resolve(value);
        else {
          script.remove();
          reject(new Error('Invalid prompt runtime.'));
        }
      }
    };
    const timer = setTimeout(() => finish(new Error('Prompt runtime timeout.')), 10000);
    script.onload = () => finish();
    script.onerror = () => finish(new Error('Prompt runtime unavailable.'));
    document.head.append(script);
  });
  pending.set(name, attempt);
  try {
    return await attempt;
  } finally {
    if (pending.get(name) === attempt) pending.delete(name);
  }
}
export function loadPromptEditor() {
  return loadAsset('editor', () => (window as RuntimeWindow).AiaoPromptEditor);
}
export function loadPromptCatalog() {
  return loadAsset('catalog', () => (window as RuntimeWindow).AiaoPromptCatalog);
}
