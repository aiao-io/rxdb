import '@angular/compiler';
import { NgModule, provideZonelessChangeDetection } from '@angular/core';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { beforeEach } from 'vitest';

@NgModule({
  providers: [provideZonelessChangeDetection()]
})
class TestModule {}

const testBed = getTestBed();

if (!testBed.platform) {
  testBed.initTestEnvironment([BrowserTestingModule, TestModule], platformBrowserTesting(), {
    teardown: { destroyAfterEach: true }
  });
}

beforeEach(() => {
  testBed.resetTestingModule();
});

// 看板绑定测试固定 zh 宿主语言：核心运行时按 navigator.language 解析文案，
// 绑定测试的断言以 zh 为准（happy-dom 缺省 en-US）。
Object.defineProperty(globalThis.navigator, 'language', { value: 'zh-CN', configurable: true });
