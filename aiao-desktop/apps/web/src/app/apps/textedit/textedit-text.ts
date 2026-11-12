const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, char => ESCAPES[char]);

/** 转义后把裸网址变成可点的链接（`data-openext` 交给窗口统一用真实浏览器打开），和 TextEdit 一样。 */
export function autolink(text: string): string {
  return escapeHtml(text).replace(
    /https?:\/\/[^\s<]+[^\s<.,)]/g,
    url => `<a href="${url}" data-openext="${url}">${url}</a>`
  );
}
