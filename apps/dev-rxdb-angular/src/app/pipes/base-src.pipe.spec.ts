import { APP_BASE_HREF } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { BaseSrcPipe } from './base-src.pipe';

describe('BaseSrcPipe', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: APP_BASE_HREF, useValue: '/demo/' }, BaseSrcPipe]
    });
  });

  /**
   * 管道的 `transform()` 由变更检测调用，**那不是注入上下文**。
   * 这里刻意在 TestBed 之外调用，复现模板里的真实调用时机。
   */
  it('以 / 开头的值在注入上下文之外也必须能拼出 baseHref', () => {
    const pipe = TestBed.inject(BaseSrcPipe);

    expect(pipe.transform('/angular.svg')).toBe('/demo/angular.svg');
  });

  it('非 / 开头的值原样返回', () => {
    const pipe = TestBed.inject(BaseSrcPipe);

    expect(pipe.transform('angular.svg')).toBe('angular.svg');
    expect(pipe.transform('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
  });

  it('空值返回空串', () => {
    const pipe = TestBed.inject(BaseSrcPipe);

    expect(pipe.transform('')).toBe('');
  });
});
