export function getRootElement(document: Document): HTMLElement {
  const root = document.getElementById('root');
  if (!root) {
    throw new Error('Missing #root mount element');
  }
  return root;
}
