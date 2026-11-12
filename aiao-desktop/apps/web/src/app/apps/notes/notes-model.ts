import { DAYS, MONS, time12Plain } from '../../shared/format';

/** 列表里的时间标签：今天显示时刻，一周内显示星期，更早的显示 dd/mm/yy。 */
export function noteWhen(date: Date, now: Date): string {
  if (date.toDateString() === now.toDateString()) return time12Plain(date);
  if ((now.getTime() - date.getTime()) / 864e5 < 7) return DAYS[date.getDay()];
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${String(date.getFullYear()).slice(2)}`;
}

/**
 * 列表里的摘要：去掉标题与日期行，取前 60 个字符。
 * 块级元素之间要补一个空格，否则 “Ship” 和 “Column view” 会连成一个词。
 * 用 DOMParser 解析：它产出的文档是惰性的，不会加载图片或触发事件属性。
 */
export function noteSnippet(body: string): string {
  const root = new DOMParser().parseFromString(body, 'text/html').body;
  root.querySelectorAll('h1,.date').forEach(node => node.remove());
  root.querySelectorAll('h2,h3,p,li,tr,div,br').forEach(node => node.insertAdjacentText('afterend', ' '));
  return (root.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'No additional text';
}

/** 保存时取标题：优先首个 h1，没有就取第一行文字。 */
export function noteTitle(doc: HTMLElement): string {
  const heading = doc.querySelector('h1');
  const text = heading ? heading.textContent : (doc.textContent ?? '').split('\n')[0];
  return (text ?? '').trim().slice(0, 60);
}

/** 新建笔记的初始内容：标题、日期行和一个空段落。 */
export function newNoteBody(date: Date): string {
  const stamp = `${date.getDate()} ${MONS[date.getMonth()]} ${date.getFullYear()} at ${time12Plain(date)}`;
  return `<h1>New Note</h1><div class="date">${stamp}</div><p><br></p>`;
}
