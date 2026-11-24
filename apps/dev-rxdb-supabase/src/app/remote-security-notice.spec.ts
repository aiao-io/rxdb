import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { RemoteSecurityNotice } from './remote-security-notice';
import { RemoteSyncState } from './remote-sync-state';

describe('RemoteSecurityNotice', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [RemoteSecurityNotice] }));

  it('只在远端同步启用时显示安全告警：分清两种同步模型的可见范围', () => {
    const fixture = TestBed.createComponent(RemoteSecurityNotice);
    const state = TestBed.inject(RemoteSyncState);

    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();

    state.markConnected(true);
    fixture.detectChanges();

    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement | null;
    expect(alert?.textContent).toContain('未分区的日志同步');
    expect(alert?.textContent).toContain('按身份分区同步');
    expect(alert?.textContent).toContain('createdBy');
  });

  // 连接自检不再查 todos（见 DEMO_RLS_CHECK），这条事实改由页面说清楚
  it('写明本地栈的 todos 表没开 RLS', () => {
    const fixture = TestBed.createComponent(RemoteSecurityNotice);
    TestBed.inject(RemoteSyncState).markConnected(true);
    fixture.detectChanges();

    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement | null;
    expect(alert?.textContent).toContain('todos 表没开 RLS');
  });
});
