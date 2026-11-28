import { element } from './elements.js';

/**
 * 展开状态的读取与「首次展开」通知，由挂载层提供：展开状态取自上一次重绘前各 details 的实际状态
 * （也含重绘后恢复为展开的），通知用来触发一次重绘。
 */
export interface Disclosures {
  /** 该键的 details 是否处于展开状态。 */
  isOpen(key: string): boolean;
  /** 用户展开了一个尚未生成内容的 details，需要重绘以生成并加载它的内容。 */
  reveal(): void;
}

/**
 * 创建内容较大的 `<details>`：只有它处于展开状态（含重绘后恢复为展开）时 `open` 才为 true，
 * 调用方此时才生成并加载内容；折叠时只放 summary 等轻量内容。
 * 用户首次展开一个折叠项时通知 `reveal` 重绘一次，重绘时按展开状态生成内容；
 * 重绘后的元素若已带着内容展开，不会再重复通知。
 */
export function lazyDetails(key: string, disclosures: Disclosures): { details: HTMLDetailsElement; open: boolean } {
  const details = element('details');
  details.dataset['disclosureKey'] = key;
  const open = disclosures.isOpen(key);
  let built = open;
  details.addEventListener('toggle', () => {
    if (!details.open || built) return;
    built = true;
    disclosures.reveal();
  });
  return { details, open };
}
