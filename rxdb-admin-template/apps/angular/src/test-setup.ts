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
