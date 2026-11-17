import { tx } from './translate.js';
export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = '',
  className = '',
  literal = false
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = literal || tag === 'td' || tag === 'option' ? text : tx(text);
  node.className = className;
  return node;
}
export function button(text: string, action: () => void | Promise<unknown>, disabled = false) {
  const node = element('button', text, 'btn btn-sm btn-outline');
  node.type = 'button';
  node.disabled = disabled;
  node.addEventListener('click', async () => {
    node.disabled = true;
    try {
      await action();
    } finally {
      node.disabled = disabled;
    }
  });
  return node;
}
export function input(label: string, value = '', type = 'text') {
  const wrapper = element('label', '', 'flex flex-col gap-1 text-sm');
  wrapper.append(element('span', label));
  const control = element('input', '', 'input input-bordered input-sm w-full');
  control.type = type;
  control.value = value;
  control.dataset['formKey'] = label;
  control.setAttribute('aria-label', tx(label));
  wrapper.append(control);
  return { wrapper, control };
}
export function select(label: string, choices: { value: string; label: string }[], value = '') {
  const wrapper = element('label', '', 'flex flex-col gap-1 text-sm');
  wrapper.append(element('span', label));
  const control = element('select', '', 'select select-bordered select-sm w-full');
  control.dataset['formKey'] = label;
  control.setAttribute('aria-label', tx(label));
  for (const choice of choices) {
    const option = element('option', choice.label);
    option.value = choice.value;
    control.append(option);
  }
  control.value = value;
  wrapper.append(control);
  return { wrapper, control };
}
export function checkbox(label: string, checked = false) {
  const wrapper = element('label', '', 'flex items-center gap-2 text-sm');
  const control = element('input', '', 'checkbox checkbox-sm');
  control.type = 'checkbox';
  control.checked = checked;
  control.dataset['formKey'] = label;
  wrapper.append(control, document.createTextNode(tx(label)));
  return { wrapper, control };
}
export function section(title: string) {
  const node = element('section', '', 'rounded-lg border border-base-300 p-4 space-y-3');
  node.append(element('h2', title, 'text-lg font-semibold'));
  return node;
}
export const row = () => element('div', '', 'flex flex-wrap items-end gap-3');
/** 内容正在按需加载时的占位；加载完成后控制器触发重绘，由真实内容替换。 */
export function loading() {
  const node = element('p', '正在加载…', 'text-sm opacity-70');
  node.setAttribute('role', 'status');
  node.dataset['loading'] = 'true';
  return node;
}
export function valueText(value: unknown): string {
  return (
    value === undefined ? tx('（不存在）')
    : value === null ? tx('（空）')
    : typeof value === 'object' ? JSON.stringify(value)
    : String(value)
  );
}
export type Perform = (work: () => Promise<unknown>) => Promise<void>;
