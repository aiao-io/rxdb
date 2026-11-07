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
