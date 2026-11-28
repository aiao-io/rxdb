import '@angular/compiler';

import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { beforeEach } from 'vitest';

// 页面单测需要 JIT 编译器与浏览器测试平台；zoneless 由各 spec 的 TestBed 提供者声明。
const testBed = getTestBed();

if (!testBed.platform) {
  testBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), {
    teardown: { destroyAfterEach: true }
  });
}

beforeEach(() => testBed.resetTestingModule());

// 单测环境钉死宿主语言：CI 的 happy-dom 默认 en-US，产品文案断言以 zh-CN 为准。
Object.defineProperty(navigator, 'language', { value: 'zh-CN', configurable: true });

// Node 26 自带实验性的全局 localStorage：没给 --localstorage-file 时读出来是 undefined，还挡住了 happy-dom 的同名全局。
// 产品代码（全局会话按本机缓存给出身份，ADMIN-US-222）用的是浏览器的 localStorage，单测里补一个内存里的 Storage。
if (typeof window !== 'undefined' && globalThis.localStorage === undefined)
  Object.defineProperty(globalThis, 'localStorage', { value: new Storage(), configurable: true, writable: true });
