import { RxDB, RxDBIdentityMismatchError } from '@aiao/rxdb';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { DemoSession } from './demo-session';
import { PageWorkbench } from './page-workbench';
import { RemoteSyncState } from './remote-sync-state';
import { SyncCommands } from './sync-commands';
import { WorkbenchStatus } from './workbench-status';

function render(pull: () => Promise<unknown>) {
  const reload = vi.fn();
  TestBed.configureTestingModule({
    imports: [WorkbenchStatus],
    providers: [
      {
        provide: RxDB,
        useValue: {
          syncManager: { pull: vi.fn(pull), push: vi.fn() },
          versionManager: { pushableCount$: of(0), pullableCount$: of(0) }
        }
      },
      { provide: DemoSession, useValue: { reload, $switching: signal(false) } }
    ]
  });
  TestBed.inject(RemoteSyncState).markConnected(true);
  const fixture = TestBed.createComponent(WorkbenchStatus);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const byTestId = (id: string) => element.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  return { fixture, byTestId, reload, commands: TestBed.inject(SyncCommands) };
}

describe('WorkbenchStatus', () => {
  it('一轮推拉结束后显示结果，关掉之后到下一轮之前不再显示', async () => {
    const { fixture, byTestId, commands } = render(() => Promise.resolve({ pulled: 2, applied: 1, failures: [] }));

    await commands.pull.run();
    fixture.detectChanges();
    expect(byTestId('sync-result')?.textContent).toContain('拉取完成：拉到 2 条，落库 1 条');

    (byTestId('sync-result')!.querySelector('button[aria-label="关掉这条结果"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(byTestId('sync-result')).toBeNull();

    await commands.pull.run();
    fixture.detectChanges();
    expect(byTestId('sync-result')).not.toBeNull();
  });

  it('身份不匹配时给「重新加载」', async () => {
    const { fixture, byTestId, reload, commands } = render(() =>
      Promise.reject(new RxDBIdentityMismatchError('remote', 'client-key', ['other-key']))
    );

    await commands.pull.run();
    fixture.detectChanges();
    byTestId('sync-result-reload')!.click();

    expect(byTestId('sync-result')?.getAttribute('role')).toBe('alert');
    expect(reload).toHaveBeenCalled();
  });

  it('经顶栏执行的撤销、重做失败时显示原因', async () => {
    const { fixture, byTestId } = render(() => Promise.resolve({ pulled: 0, applied: 0, failures: [] }));

    await TestBed.inject(PageWorkbench).run({
      run: () => Promise.reject(new Error('FOREIGN KEY constraint failed')),
      count: signal(1),
      pending: signal(false),
      disabledReason: signal(null)
    });
    fixture.detectChanges();

    expect(byTestId('workbench-error')?.textContent).toContain('FOREIGN KEY constraint failed');
  });
});
