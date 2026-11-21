import { icon, type IconName } from './icons.js';
import { tx } from './translate.js';

/**
 * 创建元素并写入文本：产品文案经词条表翻译，`literal` 为 true 时原样显示（用户数据一律原样）。
 * `td` 与 `option` 总是原样显示，调用方需要时自己先经 `tx` 翻译。
 */
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

/** 按钮的外观：主操作、默认、幽灵（次要或图标）、成功、警告、危险。语义色一律用实心底色配对应的前景色，保证文字对比度。 */
export type ButtonTone = 'primary' | 'default' | 'ghost' | 'success' | 'warning' | 'danger';
const buttonTones: Record<ButtonTone, string> = {
  primary: 'btn-primary',
  default: '',
  ghost: 'btn-ghost',
  success: 'btn-success',
  warning: 'btn-warning',
  danger: 'btn-error'
};
const buttonSizes = { xs: 'btn-xs', sm: 'btn-sm text-sm', md: 'text-sm' } as const;

/** {@link button} 的可选外观。 */
export interface ButtonOptions {
  /** 外观，默认 `default`。 */
  tone?: ButtonTone;
  /** 文字前的图标。 */
  icon?: IconName;
  /** 只显示图标：文字改作可访问名称与悬停提示。 */
  iconOnly?: boolean;
  /** 尺寸，默认 `sm`。 */
  size?: keyof typeof buttonSizes;
  /** 追加的样式类。 */
  className?: string;
  /** 文字是用户数据（团队名、任务名等），原样显示，不经词条表。 */
  literal?: boolean;
}

/**
 * 按钮：点击后执行动作，执行期间禁用并显示加载标记，结束后恢复成 `disabled` 给定的状态。
 * @param text 文字（产品文案经词条表翻译，`options.literal` 时原样）。
 * @param action 点击时执行的动作。
 * @param disabled 是否不可用。
 * @param options 外观。
 */
export function button(
  text: string,
  action: () => void | Promise<unknown>,
  disabled = false,
  options: ButtonOptions = {}
): HTMLButtonElement {
  const { tone = 'default', size = 'sm', iconOnly = false } = options;
  const classes = ['btn gap-1.5 font-medium', buttonSizes[size], buttonTones[tone], iconOnly ? 'btn-square' : ''];
  const node = element('button', '', [...classes, options.className ?? ''].filter(Boolean).join(' '));
  const label = options.literal ? text : tx(text);
  node.type = 'button';
  node.disabled = disabled;
  if (options.icon) node.append(icon(options.icon, size === 'xs' ? 'size-3.5' : 'size-4'));
  if (iconOnly) {
    node.setAttribute('aria-label', label);
    node.title = label;
  } else node.append(document.createTextNode(label));
  node.addEventListener('click', async () => {
    const spinner = element('span', '', 'loading loading-spinner loading-xs');
    node.disabled = true;
    node.prepend(spinner);
    try {
      await action();
    } finally {
      spinner.remove();
      node.disabled = disabled;
    }
  });
  return node;
}

/** 输入类控件的可选项。 */
export interface FieldOptions {
  /** 占位提示（产品文案）。 */
  placeholder?: string;
  /** 输入框下方的说明（产品文案）。 */
  hint?: string;
  /** 尺寸：`sm` 用于面板里的紧凑表单（默认），`md` 用于登录与对话框。 */
  size?: 'sm' | 'md';
}
const controlSizes = { sm: 'input-sm text-sm', md: '' } as const;

/** 标签 + 输入框。`aria-label` 与标签一致，重绘后据此把焦点还给同名输入框；`data-form-key` 供表单草稿在重绘之间保留输入。 */
export function input(label: string, value = '', type = 'text', options: FieldOptions = {}) {
  const wrapper = fieldWrapper(label);
  const control = element('input', '', `input w-full ${controlSizes[options.size ?? 'sm']}`);
  control.type = type;
  control.value = value;
  if (options.placeholder) control.placeholder = tx(options.placeholder);
  control.dataset['formKey'] = label;
  control.setAttribute('aria-label', tx(label));
  wrapper.append(control);
  if (options.hint) wrapper.append(element('span', options.hint, 'text-xs text-base-content/70'));
  return { wrapper, control };
}

/** 标签 + 多行文本框（评论、回复），其余约定同 {@link input}。 */
export function textarea(label: string, value = '', options: FieldOptions = {}) {
  const wrapper = fieldWrapper(label);
  const control = element('textarea', '', 'textarea textarea-sm min-h-16 w-full text-sm');
  control.value = value;
  control.rows = 2;
  if (options.placeholder) control.placeholder = tx(options.placeholder);
  control.dataset['formKey'] = label;
  control.setAttribute('aria-label', tx(label));
  wrapper.append(control);
  return { wrapper, control };
}

/** 标签 + 下拉选择，其余约定同 {@link input}；选项的文字由调用方决定是否翻译。 */
export function select(
  label: string,
  choices: { value: string; label: string }[],
  value = '',
  size: 'sm' | 'md' = 'sm'
) {
  const wrapper = fieldWrapper(label);
  const control = element('select', '', size === 'sm' ? 'select select-sm w-full text-sm' : 'select w-full');
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

/** 复选框（`toggle` 为 true 时是开关样式），标签文字包在 label 里。 */
export function checkbox(label: string, checked = false, toggle = false) {
  const wrapper = element('label', '', 'flex cursor-pointer items-center gap-2 text-sm');
  const control = element('input', '', toggle ? 'toggle toggle-sm toggle-primary' : 'checkbox checkbox-sm');
  control.type = 'checkbox';
  control.checked = checked;
  control.dataset['formKey'] = label;
  wrapper.append(control, document.createTextNode(tx(label)));
  return { wrapper, control };
}

function fieldWrapper(label: string): HTMLLabelElement {
  const wrapper = element('label', '', 'flex min-w-0 flex-col gap-1.5 text-sm');
  wrapper.append(element('span', label, 'font-medium'));
  return wrapper;
}

/** {@link section} 的可选项。 */
export interface SectionOptions {
  /** 标题前的图标。 */
  icon?: IconName;
  /** 标题下方的说明（产品文案）。 */
  description?: string;
  /** 标题级别，默认 2；面板里的子分组用 3。 */
  level?: 2 | 3;
  /** 标题右侧的动作。 */
  actions?: HTMLElement[];
  /** 追加的样式类。 */
  className?: string;
}

/** 卡片式分区：边框、圆角与统一的标题栏；之后追加的内容排在标题栏下方。 */
export function section(title: string, options: SectionOptions = {}): HTMLElement {
  const node = element(
    'section',
    '',
    `space-y-4 rounded-box border border-base-300 bg-base-100 p-4 sm:p-5 ${options.className ?? ''}`.trim()
  );
  node.append(sectionHeader(title, options));
  return node;
}

/** 分区的标题栏：图标、标题、说明与右侧动作。 */
export function sectionHeader(title: string, options: SectionOptions = {}): HTMLElement {
  const header = element('header', '', 'flex flex-wrap items-start justify-between gap-3');
  const heading = element('div', '', 'flex min-w-0 items-center gap-3');
  if (options.icon) heading.append(iconTile(options.icon));
  const text = element('div', '', 'min-w-0');
  text.append(
    options.level === 3 ?
      element('h3', title, 'text-sm font-semibold')
    : element('h2', title, 'text-base font-semibold')
  );
  if (options.description) text.append(element('p', options.description, 'text-sm text-base-content/70'));
  heading.append(text);
  header.append(heading);
  if (options.actions?.length) {
    const actions = element('div', '', 'flex flex-wrap items-center gap-2');
    actions.append(...options.actions);
    header.append(actions);
  }
  return header;
}

/** 带浅底色的方形图标块，用在分区标题、空状态与对话框标题前。 */
export function iconTile(name: IconName, size: 'sm' | 'lg' = 'sm'): HTMLElement {
  const tile = element(
    'span',
    '',
    size === 'lg' ?
      'grid size-12 shrink-0 place-items-center rounded-2xl bg-base-200 text-base-content'
    : 'grid size-8 shrink-0 place-items-center rounded-field bg-base-200 text-base-content'
  );
  tile.append(icon(name, size === 'lg' ? 'size-6' : 'size-4'));
  return tile;
}

export const row = () => element('div', '', 'flex flex-wrap items-end gap-3');

/** 徽标的外观：语义色都是实心底色配对应前景色。 */
export type BadgeTone = 'ghost' | 'neutral' | 'primary' | 'success' | 'warning' | 'error' | 'info';
const badgeTones: Record<BadgeTone, string> = {
  ghost: 'badge-ghost',
  neutral: 'badge-neutral',
  primary: 'badge-primary',
  success: 'badge-success',
  warning: 'badge-warning',
  error: 'badge-error',
  info: 'badge-info'
};

/** 小徽标（状态、计数、权限）；`literal` 时文字原样显示。 */
export function badge(text: string, tone: BadgeTone = 'ghost', literal = false): HTMLElement {
  return element('span', text, `badge badge-sm shrink-0 whitespace-nowrap ${badgeTones[tone]}`, literal);
}

/** 状态圆点（装饰，对辅助技术隐藏；含义由旁边的文字给出）。 */
const dotTones = {
  success: 'status-success',
  warning: 'status-warning',
  error: 'status-error',
  info: 'status-info',
  neutral: 'status-neutral'
} as const;
export function statusDot(tone: keyof typeof dotTones): HTMLElement {
  const dot = element('span', '', `status ${dotTones[tone]}`);
  dot.setAttribute('aria-hidden', 'true');
  return dot;
}

/** 下拉面板与 summary 的对齐：左对齐向右展开，或右对齐向左展开。 */
const dropdownAlign = { start: 'start-0', end: 'end-0' } as const;
/** {@link dropdown} 的三个部件，调用方往 summary 与 panel 里填内容。 */
export interface Dropdown<K extends 'div' | 'ul'> {
  details: HTMLDetailsElement;
  summary: HTMLElement;
  panel: HTMLElementTagNameMap[K];
}
/**
 * 下拉菜单：`details.dropdown` 里一个 summary 加一块浮层面板。
 *
 * 面板不用 daisyUI 的 `dropdown-content`：它常驻 0.2s 的入场动画与过渡，收起的 details 不渲染内容，
 * Chromium 里这些动画到时也不结束（`finished` 永不落定），等页面动画结束的逻辑（例如无障碍扫描前）会一直挂着。
 * 这里改为显式定位，淡入（daisyUI 的 `dropdown` 关键帧）只在展开时挂上。
 */
export function dropdown<K extends 'div' | 'ul'>(
  summaryClass: string,
  panelTag: K,
  panelClass: string,
  align: keyof typeof dropdownAlign = 'start'
): Dropdown<K> {
  const details = element('details', '', 'dropdown group/dropdown');
  const summary = element('summary', '', summaryClass);
  const panel = element(
    panelTag,
    '',
    `absolute top-full ${dropdownAlign[align]} mt-2 group-open/dropdown:motion-safe:animate-[dropdown_0.2s] ${panelClass}`
  );
  details.append(summary, panel);
  return { details, summary, panel };
}

const avatarPalette = [
  'bg-primary text-primary-content',
  'bg-secondary text-secondary-content',
  'bg-accent text-accent-content',
  'bg-info text-info-content',
  'bg-success text-success-content',
  'bg-warning text-warning-content',
  'bg-neutral text-neutral-content'
];
const avatarSizes = { xs: 'size-6 text-[0.65rem]', sm: 'size-8 text-xs', md: 'size-10 text-sm' } as const;

/**
 * 头像：取名字（邮箱、团队名）的首字母，颜色由名字稳定散列决定；成员用圆形，团队用圆角方形。装饰性，对辅助技术隐藏。
 */
export function avatar(
  name: string,
  size: keyof typeof avatarSizes = 'sm',
  shape: 'circle' | 'square' = 'circle'
): HTMLElement {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  const node = element(
    'span',
    [...name][0]?.toUpperCase() ?? '?',
    [
      'inline-grid shrink-0 select-none place-items-center font-semibold leading-none',
      shape === 'circle' ? 'rounded-full' : 'rounded-field',
      avatarSizes[size],
      avatarPalette[hash % avatarPalette.length]
    ].join(' '),
    true
  );
  node.setAttribute('aria-hidden', 'true');
  return node;
}

/** 空状态：图标、标题、说明与可选的动作。 */
export function emptyState(name: IconName, title: string, description = '', actions: HTMLElement[] = []): HTMLElement {
  const node = element(
    'div',
    '',
    'flex flex-col items-center gap-3 rounded-box border border-dashed border-base-300 px-6 py-10 text-center'
  );
  node.append(iconTile(name, 'lg'), element('p', title, 'font-medium'));
  if (description) node.append(element('p', description, 'max-w-md text-sm text-base-content/70'));
  if (actions.length) {
    const bar = element('div', '', 'flex flex-wrap justify-center gap-2');
    bar.append(...actions);
    node.append(bar);
  }
  return node;
}

/** 提示条的语气。 */
export type AlertTone = 'info' | 'success' | 'warning' | 'error';
const alertTones: Record<AlertTone, { box: string; icon: IconName; color: string }> = {
  info: { box: 'border-info/40 bg-info/10', icon: 'info', color: 'text-info' },
  success: { box: 'border-success/40 bg-success/10', icon: 'circle-check', color: 'text-success' },
  warning: { box: 'border-warning/60 bg-warning/10', icon: 'triangle-alert', color: 'text-warning' },
  error: { box: 'border-error/40 bg-error/10', icon: 'circle-alert', color: 'text-error' }
};

/**
 * 提示条：语气只体现在边框、底色与图标上，文字保持正文颜色（对比度不随主题变差）。默认 `role="status"`，出现与变化时读屏器会读出。
 * @param content 提示内容：字符串按产品文案翻译；传元素则原样放入。
 * @param tone 语气。
 * @param dismiss 传入时右侧显示关闭按钮。
 */
export function alert(content: string | HTMLElement, tone: AlertTone = 'info', dismiss?: () => void): HTMLElement {
  const style = alertTones[tone];
  const node = element('div', '', `flex items-start gap-3 rounded-box border px-4 py-3 text-sm ${style.box}`);
  node.setAttribute('role', 'status');
  node.append(icon(style.icon, `mt-0.5 size-4 ${style.color}`));
  const body = typeof content === 'string' ? element('p', content, 'min-w-0 flex-1 break-words') : content;
  body.classList.add('min-w-0', 'flex-1');
  node.append(body);
  if (dismiss)
    node.append(button('关闭提示', dismiss, false, { tone: 'ghost', icon: 'x', iconOnly: true, size: 'xs' }));
  return node;
}

/** 内容正在按需加载时的占位；加载完成后控制器触发重绘，由真实内容替换。 */
export function loading() {
  const node = element('p', '', 'flex items-center gap-2 text-sm text-base-content/70');
  node.setAttribute('role', 'status');
  node.dataset['loading'] = 'true';
  node.append(element('span', '', 'loading loading-spinner loading-xs'), element('span', '正在加载…'));
  return node;
}

/** 页签组的一项。 */
export interface TabItem<T extends string> {
  id: T;
  /** 页签文字（产品文案）。 */
  label: string;
  icon?: IconName;
  /** 计数徽标；0 或不传则不显示。 */
  count?: number;
  /** 计数徽标的外观，默认 `ghost`。 */
  tone?: BadgeTone;
  /** 计数只作视觉提示、不进可访问名称（页签名称保持稳定时用）。 */
  quietCount?: boolean;
}

/** 页签组的键盘移动：左右方向键首尾相接，Home / End 到首尾；其余按键返回 -1，不处理。 */
function movedPosition(key: string, position: number, count: number): number {
  if (key === 'ArrowRight') return (position + 1) % count;
  if (key === 'ArrowLeft') return (position + count - 1) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return -1;
}

/**
 * WAI-ARIA 页签组：只有选中的页签在 Tab 序列里，左右方向键与 Home / End 在页签间移动。
 * 页签 ID 为 `<prefix>-tab-<id>`，面板 ID 为 `<prefix>-panel`（见 {@link tabPanel}）。
 * @param label 页签组的可访问名称（产品文案）。
 * @param prefix 页签与面板的 ID 前缀，同一页面里唯一。
 * @param items 页签。
 * @param current 选中的页签。
 * @param choose 选中页签：`focus` 为 true 表示由键盘移动触发，调用方重绘后把焦点移到新页签上。
 */
export function tabList<T extends string>(
  label: string,
  prefix: string,
  items: readonly TabItem<T>[],
  current: T,
  choose: (id: T, focus: boolean) => void
): HTMLElement {
  const list = element('div', '', 'tabs tabs-border flex-nowrap overflow-x-auto');
  list.setAttribute('role', 'tablist');
  list.setAttribute('aria-label', tx(label));
  items.forEach((item, index) => {
    const selected = item.id === current;
    const tab = element(
      'button',
      '',
      selected ?
        'tab shrink-0 gap-2 whitespace-nowrap text-base-content'
      : 'tab shrink-0 gap-2 whitespace-nowrap text-base-content/70'
    );
    tab.type = 'button';
    tab.id = `${prefix}-tab-${item.id}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(selected));
    tab.setAttribute('aria-controls', `${prefix}-panel`);
    tab.tabIndex = selected ? 0 : -1;
    if (item.icon) tab.append(icon(item.icon));
    tab.append(element('span', item.label));
    if (item.count) {
      const count = badge(String(item.count), item.tone ?? 'ghost', true);
      if (item.quietCount) count.setAttribute('aria-hidden', 'true');
      tab.append(document.createTextNode(' '), count);
    }
    tab.addEventListener('click', () => choose(item.id, false));
    tab.addEventListener('keydown', event => {
      const next = movedPosition(event.key, index, items.length);
      if (next < 0) return;
      event.preventDefault();
      choose(items[next].id, true);
    });
    list.append(tab);
  });
  return list;
}

/** 与 {@link tabList} 配对的面板：由当前页签命名。 */
export function tabPanel(prefix: string, current: string, className = 'space-y-4'): HTMLElement {
  const panel = element('div', '', className);
  panel.id = `${prefix}-panel`;
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', `${prefix}-tab-${current}`);
  return panel;
}

let dialogs = 0;
/** {@link modal} 返回的句柄。 */
export interface Modal {
  dialog: HTMLDialogElement;
  /** 对话框内容区：标题之后追加正文与 {@link modalActions}。 */
  box: HTMLElement;
  /** 关闭并移除对话框。 */
  close: () => void;
}

/**
 * 模态对话框：挂在 `document.body` 上（协作面板整块重绘不会冲掉它），标题即对话框的可访问名称；
 * Esc 关闭时一并移除。调用方填好内容后调用 `dialog.showModal()`。
 */
export function modal(title: string, options: { icon?: IconName; description?: string; wide?: boolean } = {}): Modal {
  const id = `collaboration-dialog-${++dialogs}`;
  const dialog = element('dialog', '', 'modal');
  dialog.setAttribute('aria-labelledby', id);
  const box = element('div', '', options.wide ? 'modal-box max-w-4xl space-y-4' : 'modal-box max-w-lg space-y-4');
  const header = element('header', '', 'flex items-start gap-3');
  if (options.icon) header.append(iconTile(options.icon));
  const text = element('div', '', 'min-w-0 space-y-1');
  const heading = element('h2', title, 'text-lg font-semibold');
  heading.id = id;
  text.append(heading);
  if (options.description) text.append(element('p', options.description, 'text-sm text-base-content/70'));
  header.append(text);
  box.append(header);
  dialog.append(box);
  dialog.addEventListener('cancel', () => dialog.remove());
  document.body.append(dialog);
  return {
    dialog,
    box,
    close: () => {
      dialog.close();
      dialog.remove();
    }
  };
}

/** 对话框底部的动作行：次要动作在左、主动作在右。 */
export function modalActions(...buttons: HTMLElement[]): HTMLElement {
  const bar = element('div', '', 'modal-action mt-2');
  bar.append(...buttons);
  return bar;
}

/** 等宽小字的标识（提交 ID 等），完整取值放在悬停提示里。 */
export function code(text: string, title = text): HTMLElement {
  const node = element('code', text, 'rounded bg-base-200 px-1.5 py-0.5 font-mono text-xs', true);
  node.title = title;
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
