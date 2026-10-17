import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dbConnectionError } from '../rxdb/db-connection';
import { DbConnectionAlert } from './db-connection-alert';

/**
 * @fileoverview 应用壳的数据库连接失败提示（US-221；React / Vue 端同名 spec 的移植）。
 */

beforeEach(async () => {
  await TestBed.configureTestingModule({ imports: [DbConnectionAlert] }).compileComponents();
});

afterEach(() => {
  dbConnectionError.set(null);
  TestBed.resetTestingModule();
});

describe('DbConnectionAlert', () => {
  it('连接正常时不渲染', () => {
    const fixture = TestBed.createComponent(DbConnectionAlert);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="app-db-error"]')).toBeNull();
  });

  it('登记了连接失败：role=alert 显示错误信息，带重新加载按钮', async () => {
    const fixture = TestBed.createComponent(DbConnectionAlert);
    fixture.detectChanges();
    dbConnectionError.set('OPFS database file "x.sqlite" is held by another context');
    fixture.detectChanges();
    await fixture.whenStable();

    const alert = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[data-testid="app-db-error"]');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent).toContain('数据库打不开');
    expect(alert?.textContent).toContain('is held by another context');
    const button = alert?.querySelector('button');
    expect(button?.getAttribute('type')).toBe('button');
    expect(button?.textContent?.trim()).toBe('重新加载');
  });
});
