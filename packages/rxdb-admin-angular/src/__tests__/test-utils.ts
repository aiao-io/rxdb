import type { AdminShellOptions, MenuNode, PasswordHasher } from '@aiao/rxdb-admin';
import { createTestShell, type FakeWindowOptions, type TestShell } from '@aiao/rxdb-admin/testing';
import { ChangeDetectionStrategy, Component, input, type Type } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideAdminShell, type AdminIcon } from '../context';
import { AdminLayoutComponent } from '../layout/admin-layout.component';
import { AdminPageDirective } from '../layout/admin-page.directive';

export const fakeHasher: PasswordHasher = { hash: async (password, salt) => `${salt}:${password}` };

export const menu: MenuNode<AdminIcon>[] = [
  {
    id: 'entities',
    label: '实体',
    expanded: true,
    children: [
      { id: 'asset', label: '资产', route: '/entities/assets/Asset', testId: 'nav-asset' },
      { id: 'category', label: '资产分类', route: '/entities/assets/AssetCategory', testId: 'nav-category' }
    ]
  },
  {
    id: 'data',
    label: '数据',
    expanded: true,
    children: [{ id: 'search', label: '搜索', route: '/search', testId: 'nav-search' }]
  }
];

// ───────────────────────── 宿主与挂载 ─────────────────────────

/** {@link mount} 默认挂载的宿主：`AdminLayout` + `*rxdbAdminPage` 页面内容（刷新时重建）。 */
@Component({
  selector: 'rxdb-admin-test-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AdminLayoutComponent, AdminPageDirective],
  template: `
    <ng-template #extra let-node>
      <b [attr.data-testid]="'badge-' + node.id">3</b>
    </ng-template>
    <rxdb-admin-layout
      [menu]="menu()"
      [menuExtra]="withMenuExtra() ? extra : undefined"
      [navigating]="navigating()"
      [url]="url()"
    >
      <p *rxdbAdminPage data-testid="page">页面内容</p>
    </rxdb-admin-layout>
  `
})
export class TestHostComponent {
  readonly menu = input<readonly MenuNode<AdminIcon>[]>(menu);
  readonly url = input('/entities/assets/Asset');
  readonly navigating = input(false);
  readonly withMenuExtra = input(false);
}

/** 宿主输入（对应 React 的 `AdminLayoutProps`；`withMenuExtra` 对应 `renderMenuExtra`）。 */
export interface HostProps {
  readonly menu: readonly MenuNode<AdminIcon>[];
  readonly url: string;
  readonly navigating: boolean;
  readonly withMenuExtra: boolean;
}

export interface MountedComponent<T> extends TestShell<AdminIcon> {
  readonly fixture: ComponentFixture<T>;
}

export interface Mounted extends MountedComponent<TestHostComponent> {
  rerender(props: Partial<HostProps>): Promise<void>;
}

let current: ComponentFixture<unknown> | undefined;

/**
 * 等待零 zone 的变更检测落定：先同步跑一轮（假计时器下也成立），再等应用稳定。
 */
export async function settle(): Promise<void> {
  current?.detectChanges();
  await current?.whenStable();
}

/**
 * 用假宿主创建外壳并挂载任意组件。
 * @param component - 要挂载的组件。
 * @param options - 外壳选项。
 * @param windowOptions - 假窗口选项。
 * @param setup - 在首次渲染前设置输入。
 * @returns 外壳、假宿主与夹具。
 */
export async function mountComponent<T>(
  component: Type<T>,
  options: Partial<AdminShellOptions<AdminIcon>> = {},
  windowOptions: FakeWindowOptions = {},
  setup: (fixture: ComponentFixture<T>) => void = () => undefined
): Promise<MountedComponent<T>> {
  const test = createTestShell<AdminIcon>(
    { brand: { title: '工作台' }, lockHasher: fakeHasher, ...options },
    windowOptions
  );
  TestBed.configureTestingModule({ providers: [provideAdminShell(test.shell)] });
  const fixture = TestBed.createComponent(component);
  current = fixture;
  setup(fixture);
  await settle();
  return { ...test, fixture };
}

/**
 * 挂载 `AdminLayout` 宿主。
 * @param options - 外壳选项。
 * @param props - 宿主输入。
 * @param windowOptions - 假窗口选项。
 * @returns 外壳、假宿主、夹具与 `rerender`。
 */
export async function mount(
  options: Partial<AdminShellOptions<AdminIcon>> = {},
  props: Partial<HostProps> = {},
  windowOptions: FakeWindowOptions = {}
): Promise<Mounted> {
  const mounted = await mountComponent(TestHostComponent, options, windowOptions, fixture => {
    for (const [name, value] of Object.entries(props)) fixture.componentRef.setInput(name, value);
  });
  return {
    ...mounted,
    rerender: async extra => {
      for (const [name, value] of Object.entries(extra)) mounted.fixture.componentRef.setInput(name, value);
      await settle();
    }
  };
}

/**
 * 在动作之后等待渲染落定（对应 React 的 `act`）。
 * @param action - 同步或异步动作。
 */
export async function act(action: () => unknown): Promise<void> {
  await action();
  await settle();
}

/**
 * 轮询直到断言通过（对应 RTL 的 `waitFor`），仅用于真实计时器。
 * @param assertion - 断言。
 * @param timeoutMs - 超时毫秒数。
 */
export async function waitFor(assertion: () => void, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  for (;;) {
    await settle();
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() - start > timeoutMs) throw error;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
}

// ───────────────────────── 查询（对应 RTL 的 screen / within） ─────────────────────────

type Matcher = string | RegExp;

const normalize = (text: string): string => text.replace(/\s+/g, ' ').trim();

const matches = (text: string, matcher: Matcher): boolean =>
  typeof matcher === 'string' ? normalize(text) === matcher : matcher.test(normalize(text));

const NAME_FROM_CONTENT = new Set(['button', 'link', 'heading', 'tab', 'menuitem', 'menuitemradio', 'option']);

function roleOf(element: Element): string | undefined {
  const explicit = element.getAttribute('role');
  if (explicit) return explicit.split(' ')[0];
  const tag = element.tagName.toLowerCase();
  if (tag === 'a' && element.hasAttribute('href')) return 'link';
  if (tag === 'button') return 'button';
  if (/^h[1-6]$/.test(tag)) return 'heading';
  return undefined;
}

function contentOf(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!(node instanceof Element)) return '';
  if (node.getAttribute('aria-hidden') === 'true' || node.hasAttribute('hidden')) return '';
  return node.getAttribute('aria-label') ?? [...node.childNodes].map(contentOf).join('');
}

function nameOf(element: Element): string {
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const targets = labelledBy.split(' ').flatMap(id => document.getElementById(id) ?? []);
    return normalize(targets.map(contentOf).join(' '));
  }
  const label = element.getAttribute('aria-label');
  if (label) return normalize(label);
  const role = roleOf(element);
  const content = role && NAME_FROM_CONTENT.has(role) ? normalize([...element.childNodes].map(contentOf).join('')) : '';
  return content || normalize(element.getAttribute('title') ?? '');
}

function inaccessible(element: Element): boolean {
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node.getAttribute('aria-hidden') === 'true' || node.hasAttribute('hidden')) return true;
    if (node.tagName === 'DIALOG' && !node.hasAttribute('open')) return true;
  }
  return false;
}

function levelOf(element: Element): number {
  return Number(element.getAttribute('aria-level') ?? element.tagName.slice(1));
}

function onlyOne(found: HTMLElement[], description: string): HTMLElement {
  if (found.length === 0) throw new Error(`Unable to find an element ${description}`);
  if (found.length > 1) throw new Error(`Found multiple elements ${description}`);
  return found[0];
}

function everything(root: ParentNode): HTMLElement[] {
  const self = root instanceof HTMLElement ? [root] : [];
  return [...self, ...root.querySelectorAll<HTMLElement>('*')];
}

export interface RoleOptions {
  readonly name?: Matcher;
  readonly level?: number;
}

export interface Queries {
  getByTestId(id: Matcher): HTMLElement;
  queryByTestId(id: Matcher): HTMLElement | null;
  getAllByTestId(id: Matcher): HTMLElement[];
  queryAllByTestId(id: Matcher): HTMLElement[];
  getByText(text: Matcher): HTMLElement;
  queryByText(text: Matcher): HTMLElement | null;
  getAllByText(text: Matcher): HTMLElement[];
  getByRole(role: string, options?: RoleOptions): HTMLElement;
  queryByRole(role: string, options?: RoleOptions): HTMLElement | null;
  getAllByRole(role: string, options?: RoleOptions): HTMLElement[];
}

function queries(root: () => ParentNode): Queries {
  const allByTestId = (id: Matcher): HTMLElement[] =>
    everything(root()).filter(element => {
      const value = element.getAttribute('data-testid');
      return value !== null && matches(value, id);
    });
  const allByText = (text: Matcher): HTMLElement[] =>
    everything(root()).filter(element => {
      if (element.matches('script, style')) return false;
      const own = [...element.childNodes]
        .filter(node => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent))
        .map(node => node.textContent)
        .join('');
      return matches(own, text);
    });
  const allByRole = (role: string, options: RoleOptions = {}): HTMLElement[] =>
    everything(root()).filter(element => {
      if (roleOf(element) !== role || inaccessible(element)) return false;
      if (options.level !== undefined && levelOf(element) !== options.level) return false;
      return options.name === undefined || matches(nameOf(element), options.name);
    });
  const queryOne = (found: HTMLElement[], description: string): HTMLElement | null =>
    found.length === 0 ? null : onlyOne(found, description);
  const required = (found: HTMLElement[], description: string): HTMLElement[] => {
    if (found.length === 0) throw new Error(`Unable to find an element ${description}`);
    return found;
  };
  return {
    getByTestId: id => onlyOne(allByTestId(id), `by [data-testid: ${String(id)}]`),
    queryByTestId: id => queryOne(allByTestId(id), `by [data-testid: ${String(id)}]`),
    getAllByTestId: id => required(allByTestId(id), `by [data-testid: ${String(id)}]`),
    queryAllByTestId: allByTestId,
    getByText: text => onlyOne(allByText(text), `with the text: ${String(text)}`),
    queryByText: text => queryOne(allByText(text), `with the text: ${String(text)}`),
    getAllByText: text => required(allByText(text), `with the text: ${String(text)}`),
    getByRole: (role, options) => onlyOne(allByRole(role, options), `with the role "${role}"`),
    queryByRole: (role, options) => queryOne(allByRole(role, options), `with the role "${role}"`),
    getAllByRole: (role, options) => required(allByRole(role, options), `with the role "${role}"`)
  };
}

/** 在整个文档里查询。 */
export const screen: Queries = queries(() => document.body);

/**
 * 在某个元素内部查询。
 * @param root - 查询范围。
 * @returns 查询集合。
 */
export function within(root: HTMLElement): Queries {
  return queries(() => root);
}

// ───────────────────────── 事件（对应 RTL 的 fireEvent，派发后等待渲染落定） ─────────────────────────

async function dispatch(target: EventTarget, event: Event): Promise<boolean> {
  const notPrevented = target.dispatchEvent(event);
  await settle();
  return notPrevented;
}

const mouse = (type: string, init: MouseEventInit, bubbles = true): MouseEvent =>
  new MouseEvent(type, { bubbles, cancelable: true, composed: true, ...init });

const keyboard = (type: string, init: KeyboardEventInit): KeyboardEvent =>
  new KeyboardEvent(type, { bubbles: true, cancelable: true, composed: true, ...init });

function plainEvent(type: string, properties: Record<string, unknown> = {}): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  for (const [name, value] of Object.entries(properties)) Object.defineProperty(event, name, { value });
  return event;
}

export interface DragInit {
  readonly dataTransfer?: { setData: (type: string, value: string) => void };
}

export const fire = {
  /** 派发任意事件。 */
  event: dispatch,
  click: (target: Element, init: MouseEventInit = {}) => dispatch(target, mouse('click', init)),
  mouseDown: (target: Element, init: MouseEventInit = {}) => dispatch(target, mouse('mousedown', init)),
  mouseMove: (target: Element, init: MouseEventInit = {}) => dispatch(target, mouse('mousemove', init)),
  mouseEnter: (target: Element, init: MouseEventInit = {}) => dispatch(target, mouse('mouseenter', init, false)),
  mouseLeave: (target: Element, init: MouseEventInit = {}) => dispatch(target, mouse('mouseleave', init, false)),
  contextMenu: (target: Element, init: MouseEventInit = {}) => dispatch(target, mouse('contextmenu', init)),
  pointerDown: (target: Element, init: PointerEventInit = {}) =>
    dispatch(target, new PointerEvent('pointerdown', { bubbles: true, cancelable: true, ...init })),
  pointerMove: (target: Element, init: PointerEventInit = {}) =>
    dispatch(target, new PointerEvent('pointermove', { bubbles: true, cancelable: true, ...init })),
  pointerUp: (target: Element, init: PointerEventInit = {}) =>
    dispatch(target, new PointerEvent('pointerup', { bubbles: true, cancelable: true, ...init })),
  keyDown: (target: Element, init: KeyboardEventInit) => dispatch(target, keyboard('keydown', init)),
  wheel: (target: Element, init: WheelEventInit = {}) =>
    dispatch(target, new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init })),
  blur: (target: Element) => dispatch(target, new FocusEvent('blur', { bubbles: false })),
  dragStart: (target: Element, init: DragInit = {}) => dispatch(target, plainEvent('dragstart', { ...init })),
  dragOver: (target: Element) => dispatch(target, plainEvent('dragover')),
  drop: (target: Element) => dispatch(target, plainEvent('drop')),
  dragEnd: (target: Element) => dispatch(target, plainEvent('dragend')),
  /** 写入控件的值并派发 `input` 与 `change`（对应 `fireEvent.change(el, { target: { value } })`）。 */
  change: async (target: Element, value: string): Promise<void> => {
    (target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = value;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    await dispatch(target, new Event('change', { bubbles: true }));
  }
};
