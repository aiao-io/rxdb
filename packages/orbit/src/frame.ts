import { OrbitError } from './errors.js';

const TAG = 'aiao-orbit';

/** 所有宿主共用的最小沙箱基线；宿主可经 {@link OrbitAppOptions.sandbox} 追加令牌。 */
const SANDBOX_BASELINE = 'allow-scripts allow-same-origin allow-forms allow-downloads';

export function createFrame(
  document: Document,
  onDisconnect: () => void,
  extraSandbox?: string
): { host: HTMLElement; frame: HTMLIFrameElement } {
  const view = document.defaultView;
  if (!view?.customElements) throw new OrbitError('UNSUPPORTED', '当前环境不支持 Web Components');
  if (!view.customElements.get(TAG)) {
    view.customElements.define(
      TAG,
      class extends HTMLElement {
        disconnectedCallback(): void {
          this.dispatchEvent(new Event('orbit-disconnect'));
        }
      }
    );
  }
  const host = document.createElement(TAG);
  host.addEventListener('orbit-disconnect', onDisconnect, { once: true });
  host.style.cssText = 'display:block;width:100%;height:100%;min-height:0';
  const shadow = host.attachShadow({ mode: 'open' });
  const frame = document.createElement('iframe');
  frame.style.cssText = 'display:block;width:100%;height:100%;border:0';
  frame.setAttribute('sandbox', extraSandbox ? `${SANDBOX_BASELINE} ${extraSandbox}` : SANDBOX_BASELINE);
  shadow.append(frame);
  return { host, frame };
}
