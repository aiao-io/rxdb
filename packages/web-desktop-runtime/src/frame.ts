import { WujieError } from './errors.js';

const TAG = 'aiao-wujie';

export function createFrame(
  document: Document,
  onDisconnect: () => void
): { host: HTMLElement; frame: HTMLIFrameElement } {
  const view = document.defaultView;
  if (!view?.customElements) throw new WujieError('UNSUPPORTED', '当前环境不支持 Web Components');
  if (!view.customElements.get(TAG)) {
    view.customElements.define(
      TAG,
      class extends HTMLElement {
        disconnectedCallback(): void {
          this.dispatchEvent(new Event('wujie-disconnect'));
        }
      }
    );
  }
  const host = document.createElement(TAG);
  host.addEventListener('wujie-disconnect', onDisconnect, { once: true });
  host.style.cssText = 'display:block;width:100%;height:100%;min-height:0';
  const shadow = host.attachShadow({ mode: 'open' });
  const frame = document.createElement('iframe');
  frame.style.cssText = 'display:block;width:100%;height:100%;border:0';
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-downloads');
  shadow.append(frame);
  return { host, frame };
}
