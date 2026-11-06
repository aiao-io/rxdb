/** 临时 DOM 对拍工具：把 React / Angular 的渲染结果规范化成逐行文本，便于 diff。 */

const SKIP_ATTRS = new Set(['ng-version', 'checked', 'selected']);

function isAngularHost(element: Element): boolean {
  return element.tagName.toLowerCase().startsWith('rxdb-admin-');
}

function attributesOf(element: Element): string {
  const names = [...element.attributes]
    .map(attr => attr.name)
    .filter(name => !SKIP_ATTRS.has(name) && !name.startsWith('ng-') && !name.startsWith('_ng'))
    .sort();
  return names
    .map(name => {
      let value = element.getAttribute(name) ?? '';
      if (name === 'class') {
        value = value.split(/\s+/).filter(Boolean).sort().join(' ');
        if (value === '') return '';
      }
      if (name === 'value' && element.tagName === 'INPUT') return '';
      return ` ${name}="${value}"`;
    })
    .join('');
}

function svgSummary(element: Element): string {
  const cls = element.getAttribute('class') ?? '';
  const match = /lucide-([a-z0-9-]+)/.exec(cls);
  const name = match ? match[1].replace(/-icon$/, '') : '?';
  const extra = (cls.split(/\s+/).filter(token => token && token !== 'lucide' && !token.startsWith('lucide-'))).sort().join(' ');
  return `<svg icon="${name}" size="${element.getAttribute('width')}" aria-hidden="${element.getAttribute('aria-hidden')}"${extra ? ` class="${extra}"` : ''}/>`;
}

export function dump(node: Node, depth = 0, lines: string[] = []): string[] {
  const pad = '  '.repeat(depth);
  if (node.nodeType === Node.COMMENT_NODE) return lines;
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text) lines.push(`${pad}"${text}"`);
    return lines;
  }
  if (node === document.body) {
    // 测试容器（React 的 <div>、Angular 的 <div id=root0>）不属于被测 DOM
    for (const container of node.children) dumpChildren(container, depth, lines);
    return lines;
  }
  if (!(node instanceof Element)) return lines;
  if (node.tagName.toLowerCase() === 'svg') {
    lines.push(pad + svgSummary(node));
    return lines;
  }
  if (isAngularHost(node)) {
    dumpChildren(node, depth, lines);
    return lines;
  }
  const tag = node.tagName.toLowerCase();
  lines.push(`${pad}<${tag}${attributesOf(node)}>`);
  dumpChildren(node, depth + 1, lines);
  return lines;
}

/** 相邻文本节点合并后再输出（React 把插值拆成多个文本节点，Angular 合成一个）。 */
export function dumpChildren(parent: Node, depth: number, lines: string[]): void {
  let pending = '';
  const flush = (): void => {
    const text = pending.replace(/\s+/g, ' ').trim();
    if (text) lines.push(`${'  '.repeat(depth)}"${text}"`);
    pending = '';
  };
  for (const child of parent.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) pending += child.textContent ?? '';
    else if (child.nodeType !== Node.COMMENT_NODE) {
      flush();
      dump(child, depth, lines);
    }
  }
  flush();
}
