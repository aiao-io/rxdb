import type { CompiledProject, CompileProjectInput } from '../compiler/compiler-types.js';

export interface PreviewIdentity {
  sessionId: string;
  projectId: string;
  revision: string | number;
}

/** 预览 iframe 内转发给工作台的快捷键事件；键集由 {@link WORKBENCH_PREVIEW_SHORTCUT_KEYS} 限定。 */
export interface PreviewKeydownEvent {
  type: 'keydown';
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export type PreviewEvent = PreviewIdentity &
  (
    | { type: 'ready' }
    | { type: 'console'; level: 'log' | 'info' | 'warn' | 'error' | 'debug'; values: string[] }
    | { type: 'error'; message: string; stack: string }
    | PreviewKeydownEvent
  );

/**
 * 工作台拥有的 VS Code 快捷键（event.key 小写）。焦点在预览里时同样拦截并转发给宿主，
 * 避免浏览器默认动作（如 ⌘/Ctrl+W 关闭整个页面）吞掉工作台行为。
 */
export const WORKBENCH_PREVIEW_SHORTCUT_KEYS: readonly string[] = ['w', 's', 'p', 'b', 'j', '\\', 'tab'];

export interface PreviewDocumentOptions extends PreviewIdentity, CompiledProject {
  html?: string;
  imports?: Record<string, string>;
  allowEval?: boolean;
}

export interface PreparedProjectHTML {
  html: string;
  styles: string[];
  inlineCSS: string;
}

function localPath(value: string): string {
  if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value) || /[\\\0?#]/.test(value))
    throw new Error(`HTML 只支持本地快照资源：${value}`);
  const parts: string[] = [];
  for (const segment of value.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment.toLowerCase() === '.git') throw new Error('HTML 不允许读取 .git');
    if (segment !== '..') parts.push(segment);
    else if (parts.length) parts.pop();
    else throw new Error(`HTML 资源越界：${value}`);
  }
  return parts.join('/');
}

function dataURL(path: string, value: string | Uint8Array): string {
  const media: Record<string, string> = {
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    ico: 'image/x-icon',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    mp4: 'video/mp4'
  };
  const type = media[path.slice(path.lastIndexOf('.') + 1).toLowerCase()];
  if (!type) throw new Error(`HTML 不支持此资源类型：${path}`);
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${type};base64,${btoa(binary)}`;
}

/** 保留入口文档的 DOM，只允许当前快照里的脚本、样式和媒体。 */
export function prepareProjectHTML(input: Pick<CompileProjectInput, 'files' | 'entry'>): PreparedProjectHTML {
  const source = input.files['index.html'];
  if (source === undefined) return { html: '<div id="app"></div>', styles: [], inlineCSS: '' };
  const template = document.createElement('template');
  template.innerHTML = typeof source === 'string' ? source : new TextDecoder().decode(source);
  const fragment = template.content;
  const entry = localPath(input.entry);
  let scripts = 0;
  for (const script of fragment.querySelectorAll('script')) {
    if (
      script.type !== 'module' ||
      !script.hasAttribute('src') ||
      localPath(script.getAttribute('src') ?? '') !== entry ||
      scripts++
    )
      throw new Error('HTML 只允许一个受控 module 入口');
    script.remove();
  }
  const styles: string[] = [];
  for (const link of fragment.querySelectorAll('link')) {
    if (link.rel !== 'stylesheet') throw new Error('HTML 只允许本地 stylesheet 链接');
    const path = localPath(link.getAttribute('href') ?? '');
    if (input.files[path] === undefined) throw new Error(`HTML 样式缺失：${path}`);
    styles.push(path);
    link.remove();
  }
  if (fragment.querySelector('iframe, frame, object, embed, base, form, meta[http-equiv], template'))
    throw new Error('HTML 包含不支持的嵌入、导航或表单能力');
  const inlineCSS = [...fragment.querySelectorAll('style')]
    .map(style => {
      const value = style.textContent;
      style.remove();
      return value;
    })
    .join('\n');
  for (const element of fragment.querySelectorAll('meta, title')) element.remove();
  for (const element of fragment.querySelectorAll('*')) {
    for (const attribute of [...element.attributes]) {
      if (/^on/i.test(attribute.name) || ['srcdoc', 'srcset', 'nonce'].includes(attribute.name))
        throw new Error(`HTML 不支持属性：${attribute.name}`);
      if (attribute.name === 'href' && element.localName === 'a') {
        if (!attribute.value.startsWith('#')) throw new Error('HTML 链接只允许当前文档的片段导航');
        continue;
      }
      if (['href', 'xlink:href'].includes(attribute.name) && attribute.value.startsWith('#')) continue;
      if (!['src', 'poster', 'href', 'xlink:href'].includes(attribute.name)) continue;
      const path = localPath(attribute.value);
      const content = input.files[path];
      if (content === undefined) throw new Error(`HTML 资源缺失：${path}`);
      element.setAttribute(attribute.name, dataURL(path, content));
    }
  }
  return { html: template.innerHTML, styles, inlineCSS };
}

function scriptJSON(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** 为 opaque origin 的 iframe 生成带会话握手的预览文档。 */
export function buildPreviewDocument(options: PreviewDocumentOptions): string {
  const nonce = crypto.randomUUID().replaceAll('-', '');
  const imports = options.imports ?? {};
  const sources = [
    ...new Set(
      Object.values(imports).map(value => {
        const url = new URL(value);
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          /[;'\s]/.test(url.pathname)
        )
          throw new Error('预览依赖必须使用固定的自托管 HTTP(S) 资源');
        const directory = url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1);
        if (directory === '/') throw new Error('预览运行时必须位于独立静态资源目录');
        return `${url.origin}${directory}`;
      })
    )
  ];
  const policy = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' blob: ${sources.join(' ')}${options.allowEval ? " 'unsafe-eval'" : ''}`,
    "script-src-attr 'none'",
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'font-src data:',
    'media-src data: blob:',
    "connect-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join('; ');
  const identity = { sessionId: options.sessionId, projectId: options.projectId, revision: options.revision };
  const bootstrap = `(() => {
    const identity = ${scriptJSON(identity)};
    let port;
    const send = event => port && port.postMessage({...identity, ...event});
    const shortcuts = new Set(${scriptJSON(WORKBENCH_PREVIEW_SHORTCUT_KEYS)});
    addEventListener('keydown', event => {
      if (event.defaultPrevented || event.isComposing || event.altKey) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (!shortcuts.has(key) || (event.shiftKey && key === 'w')) return;
      event.preventDefault();
      send({type:'keydown', key, ctrlKey:event.ctrlKey, metaKey:event.metaKey, shiftKey:event.shiftKey});
    }, true);
    const stringify = value => { try { return typeof value === 'string' ? value : JSON.stringify(value) ?? String(value); } catch { return String(value); } };
    for (const level of ['log','info','warn','error','debug']) {
      const original = console[level].bind(console);
      console[level] = (...values) => { original(...values); send({type:'console',level,values:values.map(stringify)}); };
    }
    addEventListener('error', event => send({type:'error',message:event.message,stack:String(event.error?.stack ?? event.filename + ':' + event.lineno + ':' + event.colno)}));
    addEventListener('unhandledrejection', event => send({type:'error',message:stringify(event.reason),stack:String(event.reason?.stack ?? '')}));
    const accept = async event => {
      if (event.source !== parent || event.data?.type !== 'workbench-connect' || event.data?.sessionId !== identity.sessionId || event.ports.length !== 1) return;
      removeEventListener('message', accept);
      port = event.ports[0]; port.start();
      const style = document.createElement('style'); style.textContent = ${scriptJSON(options.css)}; document.head.append(style);
      const blob = URL.createObjectURL(new Blob([${scriptJSON(options.js)}], {type:'text/javascript'}));
      try { await import(blob); send({type:'ready'}); }
      catch(error) { send({type:'error',message:stringify(error?.message ?? error),stack:String(error?.stack ?? '')}); }
      finally { URL.revokeObjectURL(blob); }
    };
    addEventListener('message', accept);
    parent.postMessage({...identity, type:'workbench-awaiting-port'}, '*');
  })();`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><script type="importmap" nonce="${nonce}">${scriptJSON({ imports })}</script></head><body>${options.html ?? '<div id="app"></div>'}<script nonce="${nonce}">${bootstrap}</script></body></html>`;
}

/** 只接收属于当前预览会话的诊断消息。 */
export function isPreviewEvent(value: unknown, identity: PreviewIdentity): value is PreviewEvent {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  if (
    message['sessionId'] !== identity.sessionId ||
    message['projectId'] !== identity.projectId ||
    message['revision'] !== identity.revision
  )
    return false;
  if (message['type'] === 'ready') return true;
  if (message['type'] === 'error')
    return typeof message['message'] === 'string' && typeof message['stack'] === 'string';
  if (message['type'] === 'keydown')
    return (
      WORKBENCH_PREVIEW_SHORTCUT_KEYS.includes(String(message['key'])) &&
      typeof message['ctrlKey'] === 'boolean' &&
      typeof message['metaKey'] === 'boolean' &&
      typeof message['shiftKey'] === 'boolean'
    );
  return (
    message['type'] === 'console' &&
    ['log', 'info', 'warn', 'error', 'debug'].includes(String(message['level'])) &&
    Array.isArray(message['values']) &&
    message['values'].every(value => typeof value === 'string')
  );
}

/** 挂载仅允许脚本的预览，并在释放时切断消息与 DOM。 */
export function mountPreview(
  container: HTMLElement,
  options: PreviewDocumentOptions,
  onEvent: (event: PreviewEvent) => void
): { iframe: HTMLIFrameElement; dispose: () => void } {
  const iframe = document.createElement('iframe');
  if (!('credentialless' in iframe)) throw new Error('浏览器缺少无凭据预览能力');
  iframe.title = '项目隔离预览';
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.setAttribute('credentialless', '');
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  iframe.srcdoc = buildPreviewDocument(options);
  let channel: MessageChannel | undefined;
  const connect = (event: MessageEvent<unknown>) => {
    if (event.source !== iframe.contentWindow || !event.data || typeof event.data !== 'object') return;
    const message = event.data as Record<string, unknown>;
    if (
      message['type'] !== 'workbench-awaiting-port' ||
      message['sessionId'] !== options.sessionId ||
      message['projectId'] !== options.projectId ||
      message['revision'] !== options.revision ||
      channel
    )
      return;
    channel = new MessageChannel();
    channel.port1.onmessage = event => {
      if (isPreviewEvent(event.data, options)) onEvent(event.data);
    };
    channel.port1.start();
    iframe.contentWindow?.postMessage({ type: 'workbench-connect', sessionId: options.sessionId }, '*', [
      channel.port2
    ]);
  };
  window.addEventListener('message', connect);
  container.replaceChildren(iframe);
  return {
    iframe,
    dispose: () => {
      window.removeEventListener('message', connect);
      channel?.port1.close();
      channel?.port2.close();
      iframe.remove();
    }
  };
}
