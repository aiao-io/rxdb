import '@angular/compiler';

import { DOCUMENT } from '@angular/common';
import { Provider, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterEach } from 'vitest';

/** 假的 CSS 声明块：只实现服务读写根元素样式用到的方法，内容存在 Map 里便于断言。 */
export class FakeStyle {
  readonly values = new Map<string, string>();

  getPropertyValue(name: string): string {
    return this.values.get(name) ?? '';
  }

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }

  removeProperty(name: string): string {
    const previous = this.getPropertyValue(name);
    this.values.delete(name);
    return previous;
  }
}

/** 假的根元素（`<html>`）：`dataset` 与 `style` 是服务会写的两处。 */
export interface FakeRoot {
  readonly dataset: Record<string, string>;
  readonly style: FakeStyle;
}

/** 假的 `location`：只带会话服务读取的查询串与锚点。 */
export interface FakeLocation {
  search: string;
  hash: string;
}

/** Node 里没有真实文档；服务只碰根元素和 `location`，这里给出同形状的替身。 */
export interface FakeDom {
  readonly document: Document;
  readonly root: FakeRoot;
  readonly location: FakeLocation;
}

export function createFakeDom(location: Partial<FakeLocation> = {}): FakeDom {
  const root: FakeRoot = { dataset: {}, style: new FakeStyle() };
  const fakeLocation: FakeLocation = { search: '', hash: '', ...location };
  const document = { documentElement: root, location: fakeLocation } as unknown as Document;
  return { document, root, location: fakeLocation };
}

let environmentReady = false;

/** vitest 没有 TestBed 的自动清理钩子：每个用例结束销毁测试模块，服务登记的 `onDestroy`（定时器、监听）随之释放。 */
afterEach(() => {
  TestBed.resetTestingModule();
});

/** 整个测试进程只初始化一次 TestBed 环境；`@angular/compiler` 已在文件顶部载入，装饰器走 JIT。 */
function ensureTestEnvironment(): void {
  if (environmentReady) return;
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), {
    teardown: { destroyAfterEach: true }
  });
  environmentReady = true;
}

/**
 * 为一个用例搭 Angular 注入环境：无区域的变更检测、替身文档，加上传入的提供者。
 * `@Service({ autoProvided: false })` 的类必须在这里显式提供；返回替身文档，供用例读写根元素与 `location`。
 * 每次调用都会重置上一个用例留下的 TestBed 模块，所以可以放在 `beforeEach` 里，也可以在用例里直接调用。
 *
 * @example
 * ```ts
 * const dom = configureServices(Toast, { provide: DESKTOP_APPS, useValue: testApps() });
 * const toast = TestBed.inject(Toast);
 * ```
 */
export function configureServices(providers: readonly Provider[], location: Partial<FakeLocation> = {}): FakeDom {
  ensureTestEnvironment();
  const dom = createFakeDom(location);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: DOCUMENT, useValue: dom.document }, ...providers]
  });
  return dom;
}
