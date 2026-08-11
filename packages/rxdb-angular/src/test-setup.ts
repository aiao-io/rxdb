import '@angular/compiler';

import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { beforeEach } from 'vitest';

// 注意：此文件不能包含装饰器。setup 文件在 analog 插件的 TS program 就绪前由
// Vite 原生 oxc 转换处理，装饰器会引入未安装的 @oxc-project/runtime helper。
// zoneless change detection 由各 spec 自行通过 provideZonelessChangeDetection() 提供。
const testBed = getTestBed();

// setupFiles 会在每个 spec 文件执行一次；CI 中 worker 不隔离（isolate: false）时，
// 同一进程会顺序执行多个 spec 文件，getTestBed() 单例状态会跨文件泄漏：
//   1. initTestEnvironment 二次调用会抛 "Cannot set base providers" —— 用平台守卫使其幂等。
//   2. 上个文件遗留的已实例化 TestBed 会让下个文件首个 configureTestingModule 抛
//      "Cannot configure the test module when the test module has already been instantiated"（测试模块已实例化时无法配置）。
//      —— 在每个测试前主动 reset，保证起点干净。
if (!testBed.platform) {
  testBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), {
    teardown: { destroyAfterEach: true }
  });
}

beforeEach(() => {
  testBed.resetTestingModule();
});
