import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { RemoteSecurityNotice } from './remote-security-notice';
import { RemoteSyncState } from './remote-sync-state';

describe('RemoteSecurityNotice', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [RemoteSecurityNotice] }));

  it('只在未认证的远端同步启用时显示安全告警', () => {
    const fixture = TestBed.createComponent(RemoteSecurityNotice);
    const state = TestBed.inject(RemoteSyncState);

    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();

    state.markConnected(true);
    fixture.detectChanges();

    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement | null;
    expect(alert?.textContent).toContain('未启用身份认证');
    expect(alert?.textContent).toContain('createdBy');
  });
});
