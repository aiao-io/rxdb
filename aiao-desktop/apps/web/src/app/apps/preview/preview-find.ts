const HIGHLIGHT = 'background:#fff2a8;color:inherit;border-radius:2px';

/** 把一个文本节点里的每处匹配拆出来包进 `<mark>`，返回命中数。 */
function wrapMatches(node: Text, pattern: RegExp, query: string): number {
  let count = 0;
  const fragment = document.createDocumentFragment();
  for (const part of (node.nodeValue ?? '').split(pattern)) {
    if (part.toLowerCase() !== query) {
      fragment.append(document.createTextNode(part));
      continue;
    }
    const mark = document.createElement('mark');
    mark.setAttribute('style', HIGHLIGHT);
    mark.textContent = part;
    fragment.append(mark);
    count++;
  }
  node.replaceWith(fragment);
  return count;
}

/**
 * 在已渲染的内容里高亮查找词：先还原旧的高亮，再把匹配文字包进 `<mark>`。
 * `query` 须为小写；短于 2 个字符只清除高亮。返回命中次数。
 */
export function markMatches(root: HTMLElement, query: string): number {
  root.querySelectorAll('mark').forEach(mark => mark.replaceWith(document.createTextNode(mark.textContent ?? '')));
  root.normalize();
  if (query.length < 2) return 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const hits: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if ((node.nodeValue ?? '').toLowerCase().includes(query)) hits.push(node);
  }
  const pattern = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
  return hits.reduce((total, node) => total + wrapMatches(node, pattern, query), 0);
}
