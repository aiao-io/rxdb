import '@angular/compiler';

import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { beforeEach } from 'vitest';

const testBed = getTestBed();

// CI 中 worker 不隔离（isolate: false）时，同一进程会顺序执行多个 spec 文件，
// getTestBed() 单例状态会跨文件泄漏。用平台守卫避免 initTestEnvironment 二次调用抛
// "Cannot set base providers"，并在每个测试前 reset 清除上个文件遗留的已实例化 TestBed。
if (!testBed.platform) {
  testBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), {
    teardown: { destroyAfterEach: true }
  });
}

beforeEach(() => {
  testBed.resetTestingModule();
});
