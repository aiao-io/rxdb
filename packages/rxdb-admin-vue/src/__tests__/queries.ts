import { vi } from 'vitest';
import { nextTick } from 'vue';

/**
 * 测试用的 DOM 查询与事件触发。
 *
 * @remarks
 * 工作区只给 React 链接了 `@testing-library/dom`，Vue 包没有对应依赖；这里按它的语义实现用例里用到的那部分：
 * `ByTestId` / `ByText` / `ByRole`（含可访问名称与 `level`）与 `within`，`getBy*` 在零个或多个命中时抛错、
 * `queryBy*` 在多个命中时抛错，与原版一致。事件触发改成异步：派发之后等一个 `nextTick`，让 Vue 的批量更新落到 DOM。
 */

type Matcher = string | RegExp;
type EventInit = Record<string, unknown>;

const normalize = (text: string): string => text.replace(/\s+/g, ' ').trim();

const matches = (text: string, matcher: Matcher): boolean =>
  typeof matcher === 'string' ? text === matcher : matcher.test(text);

const ownText = (element: Element): string =>
  [...element.childNodes]
    .filter(node => node.nodeType === Node.TEXT_NODE)
    .map(node => node.textContent ?? '')
    .join('');

const INPUT_ROLES: Readonly<Record<string, string>> = {
  checkbox: 'checkbox',
  radio: 'radio',
  button: 'button',
  submit: 'button',
  reset: 'button',
  range: 'slider',
  number: 'spinbutton'
};

const TAG_ROLES: Readonly<Record<string, string>> = {
  button: 'button',
  select: 'combobox',
  textarea: 'textbox',
  nav: 'navigation',
  ul: 'list',
  ol: 'list',
  li: 'listitem',
  dialog: 'dialog',
  main: 'main'
};

function implicitRole(element: Element): string | undefined {
  const tag = element.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) return 'heading';
  if (tag === 'a') return element.hasAttribute('href') ? 'link' : undefined;
  if (tag === 'input') return INPUT_ROLES[(element.getAttribute('type') ?? 'text').toLowerCase()] ?? 'textbox';
  return TAG_ROLES[tag];
}

const roleOf = (element: Element): string | undefined =>
  element.getAttribute('role')?.trim().split(/\s+/)[0] || implicitRole(element);

/** 可以由内容命名的角色。 */
const NAME_FROM_CONTENT = new Set([
  'button',
  'checkbox',
  'heading',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'radio',
  'switch',
  'tab'
]);

const BLOCK_TAGS = new Set([
  'div',
  'p',
  'li',
  'ul',
  'ol',
  'section',
  'nav',
  'header',
  'footer',
  'main',
  'form',
  'dialog'
]);

/** 可访问名称计算（accname 的子集）：aria-labelledby → aria-label → 内容 → title。 */
function textAlternative(node: Node, root: boolean): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!(node instanceof Element)) return '';
  if (!root && (node.getAttribute('aria-hidden') === 'true' || node.hasAttribute('hidden'))) return '';
  const labelledBy = root ? node.getAttribute('aria-labelledby') : null;
  if (labelledBy) {
    return labelledBy
      .split(/\s+/)
      .map(id => document.getElementById(id))
      .map(target => (target ? textAlternative(target, false) : ''))
      .join(' ');
  }
  const label = node.getAttribute('aria-label')?.trim();
  if (label) return label;
  const title = node.getAttribute('title') ?? '';
  if (root && !NAME_FROM_CONTENT.has(roleOf(node) ?? '')) return title;
  const content = [...node.childNodes].map(child => textAlternative(child, false)).join('');
  const text = BLOCK_TAGS.has(node.tagName.toLowerCase()) ? ` ${content} ` : content;
  return root && normalize(text) === '' ? title : text;
}

const accessibleName = (element: Element): string => normalize(textAlternative(element, true));

function inaccessible(element: Element): boolean {
  for (let current: Element | null = element; current; current = current.parentElement) {
    if (current.hasAttribute('hidden') || current.getAttribute('aria-hidden') === 'true') return true;
    const style = getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden') return true;
  }
  return false;
}

const headingLevel = (element: Element): number =>
  Number(element.getAttribute('aria-level') ?? /^h([1-6])$/i.exec(element.tagName)?.[1]);

/** `ByRole` 的选项。 */
export interface RoleOptions {
  /** 可访问名称。 */
  readonly name?: Matcher;
  /** 标题级别。 */
  readonly level?: number;
}

/** 绑定到一个容器的查询集合。 */
export interface Queries {
  queryAllByTestId(id: Matcher): HTMLElement[];
  queryByTestId(id: Matcher): HTMLElement | null;
  getAllByTestId(id: Matcher): HTMLElement[];
  getByTestId(id: Matcher): HTMLElement;
  queryAllByText(text: Matcher): HTMLElement[];
  queryByText(text: Matcher): HTMLElement | null;
  getAllByText(text: Matcher): HTMLElement[];
  getByText(text: Matcher): HTMLElement;
  queryAllByRole(role: string, options?: RoleOptions): HTMLElement[];
  queryByRole(role: string, options?: RoleOptions): HTMLElement | null;
  getAllByRole(role: string, options?: RoleOptions): HTMLElement[];
  getByRole(role: string, options?: RoleOptions): HTMLElement;
}

const describeQuery = (kind: string, args: readonly unknown[]): string => `${kind}: ${args.map(String).join(', ')}`;

function queryOne<A extends unknown[]>(all: (...args: A) => HTMLElement[], kind: string) {
  return (...args: A): HTMLElement | null => {
    const found = all(...args);
    if (found.length > 1) throw new Error(`Found multiple elements by ${describeQuery(kind, args)}`);
    return found[0] ?? null;
  };
}

function getOne<A extends unknown[]>(all: (...args: A) => HTMLElement[], kind: string) {
  return (...args: A): HTMLElement => {
    const found = queryOne(all, kind)(...args);
    if (!found) throw new Error(`Unable to find an element by ${describeQuery(kind, args)}`);
    return found;
  };
}

function getMany<A extends unknown[]>(all: (...args: A) => HTMLElement[], kind: string) {
  return (...args: A): HTMLElement[] => {
    const found = all(...args);
    if (found.length === 0) throw new Error(`Unable to find an element by ${describeQuery(kind, args)}`);
    return found;
  };
}

function bind(container: () => Element): Queries {
  const queryAllByTestId = (id: Matcher): HTMLElement[] =>
    [...container().querySelectorAll<HTMLElement>('[data-testid]')].filter(element =>
      matches(normalize(element.getAttribute('data-testid') ?? ''), id)
    );
  const queryAllByText = (text: Matcher): HTMLElement[] =>
    [container(), ...container().querySelectorAll('*')]
      .filter((element): element is HTMLElement => element instanceof HTMLElement && !element.matches('script, style'))
      .filter(element => matches(normalize(ownText(element)), text));
  const queryAllByRole = (role: string, options: RoleOptions = {}): HTMLElement[] =>
    [...container().querySelectorAll<HTMLElement>('*')].filter(
      element =>
        roleOf(element) === role &&
        (options.level === undefined || headingLevel(element) === options.level) &&
        (options.name === undefined || matches(accessibleName(element), options.name)) &&
        !inaccessible(element)
    );
  return {
    queryAllByTestId,
    queryByTestId: queryOne(queryAllByTestId, 'data-testid'),
    getAllByTestId: getMany(queryAllByTestId, 'data-testid'),
    getByTestId: getOne(queryAllByTestId, 'data-testid'),
    queryAllByText,
    queryByText: queryOne(queryAllByText, 'text'),
    getAllByText: getMany(queryAllByText, 'text'),
    getByText: getOne(queryAllByText, 'text'),
    queryAllByRole,
    queryByRole: queryOne(queryAllByRole, 'role'),
    getAllByRole: getMany(queryAllByRole, 'role'),
    getByRole: getOne(queryAllByRole, 'role')
  };
}

/**
 * 在容器内查询。
 * @param container - 容器元素。
 * @returns 绑定到容器的查询集合。
 */
export const within = (container: Element): Queries => bind(() => container);

/** 在整个文档（`document.body`）内查询。 */
export const screen: Queries = bind(() => document.body);

/**
 * 派发事件并等待一次 `nextTick`，让 Vue 的批量更新落到 DOM。
 * 事件预置 `_vts`：Vue 的事件调用器拿它和监听器挂载时间比较，假定时器下 `Date.now()` 冻结，
 * 冒泡到第二层监听器时会被误判为「挂载之前派发的事件」而丢弃（`@vue/test-utils` 的 `trigger` 做了同样的处理）。
 * @param element - 事件目标。
 * @param event - 事件。
 * @returns 与 `dispatchEvent` 一致：没有被 `preventDefault` 为 `true`。
 */
async function dispatch(element: EventTarget, event: Event): Promise<boolean> {
  (event as Event & { _vts?: number })._vts = Date.now() + 1;
  const proceed = element.dispatchEvent(event);
  await nextTick();
  return proceed;
}

/** `dataTransfer` 不能经事件初始化字典传入（只认真正的 `DataTransfer`），单独挂到事件上。 */
function withDataTransfer<E extends Event>(event: E, dataTransfer: unknown): E {
  if (dataTransfer !== undefined) Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  return event;
}

const mouse =
  (type: string, bubbles = true) =>
  (element: EventTarget, init: EventInit = {}) =>
    dispatch(element, new MouseEvent(type, { bubbles, cancelable: true, ...init }));
const pointer =
  (type: string) =>
  (element: EventTarget, init: EventInit = {}) =>
    dispatch(element, new PointerEvent(type, { bubbles: true, cancelable: true, ...init }));
const drag =
  (type: string) =>
  (element: EventTarget, { dataTransfer, ...init }: EventInit = {}) =>
    dispatch(
      element,
      withDataTransfer(new DragEvent(type, { bubbles: true, cancelable: true, ...init }), dataTransfer)
    );

/**
 * 写入值并触发对应事件：文本框 / 文本域触发 `input`，下拉触发 `change`（Vue 的 `@input` / `@change` 监听的就是它们）。
 * @param element - 表单控件。
 * @param init - `target` 里的属性（通常是 `value`）会先写到元素上。
 */
function change(element: HTMLElement, init: { target?: Record<string, unknown> }): Promise<boolean> {
  Object.assign(element, init.target);
  return dispatch(element, new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}

/** 事件触发，写法与 `@testing-library/react` 的 `fireEvent` 对应，但每个方法都返回 Promise。 */
export const fireEvent = Object.assign(dispatch, {
  click: mouse('click'),
  contextMenu: mouse('contextmenu'),
  mouseDown: mouse('mousedown'),
  mouseEnter: mouse('mouseenter', false),
  mouseLeave: mouse('mouseleave', false),
  mouseMove: mouse('mousemove'),
  pointerDown: pointer('pointerdown'),
  pointerMove: pointer('pointermove'),
  pointerUp: pointer('pointerup'),
  pointerCancel: pointer('pointercancel'),
  dragStart: drag('dragstart'),
  dragOver: drag('dragover'),
  dragEnd: drag('dragend'),
  drop: drag('drop'),
  keyDown: (element: EventTarget, init: EventInit = {}) =>
    dispatch(element, new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })),
  wheel: (element: EventTarget, init: EventInit = {}) =>
    dispatch(element, new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init })),
  blur: (element: EventTarget) => dispatch(element, new FocusEvent('blur')),
  change
});

/**
 * 等价于 React 的 `act`：执行回调（可以是异步的），再等一次 `nextTick` 让更新落到 DOM。
 * @param callback - 触发状态变化的回调。
 */
export async function act(callback: () => unknown): Promise<void> {
  await callback();
  await nextTick();
}

/**
 * 轮询断言直到通过（异步状态，如密码哈希、语言切换）；每次先等 `nextTick`，让更新落到 DOM。
 * @param assertion - 断言回调。
 */
export function waitFor(assertion: () => void): Promise<void> {
  return vi.waitFor(async () => {
    await nextTick();
    assertion();
  });
}
