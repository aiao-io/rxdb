import '@angular/compiler';

import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { beforeEach } from 'vitest';

// zoneless 由各 spec 的 `TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] })`
// 提供——`initTestEnvironment` 的第三个参数是 `TestEnvironmentOptions`，没有 `providers` 键，
// 此前写在那里的 `provideZonelessChangeDetection()` 被静默忽略
const testBed = getTestBed();

if (!testBed.platform) {
  testBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), {
    teardown: { destroyAfterEach: true }
  });
}

beforeEach(() => testBed.resetTestingModule());
