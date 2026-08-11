import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ErrorHandler,
  provideZonelessChangeDetection,
  signal
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RxDBEntityChangeDirective } from '../rxdb-change-detector.directive';

const rxdbMocks = vi.hoisted(() => ({
  getEntityStatus: vi.fn()
}));

vi.mock('@aiao/rxdb', () => ({
  getEntityStatus: rxdbMocks.getEntityStatus
}));

const mockEntity = {
  id: 'test-1',
  name: 'Test Entity'
};

@Component({
  selector: 'rxdb-test-host',
  imports: [RxDBEntityChangeDirective],
  template: ` <div [auditTime]="audit" [debounceTime]="debounce" [rxdbChangeDetector]="entity()"></div> `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
class TestHostComponent {
  readonly entity = signal<typeof mockEntity | undefined>(mockEntity);
  debounce = 0;
  audit = 0;
}

describe('RxDBEntityChangeDirective', () => {
  let patches: Subject<void>;
  let errorHandler: { handleError: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();
    patches = new Subject<void>();
    errorHandler = { handleError: vi.fn() };
    rxdbMocks.getEntityStatus.mockReset();
    rxdbMocks.getEntityStatus.mockReturnValue({ patches$: patches.asObservable() });
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: ErrorHandler, useValue: errorHandler }]
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createDirective = (config: { debounce?: number; audit?: number } = {}) => {
    const fixture = TestBed.createComponent(TestHostComponent);
    if (config.debounce !== undefined) {
      fixture.componentInstance.debounce = config.debounce;
    }
    if (config.audit !== undefined) {
      fixture.componentInstance.audit = config.audit;
    }
    fixture.detectChanges();
    TestBed.flushEffects();
    const element = fixture.debugElement.query(By.directive(RxDBEntityChangeDirective));
    const changeDetectorRef = element.injector.get(ChangeDetectorRef);
    const markForCheck = vi.spyOn(Object.getPrototypeOf(changeDetectorRef), 'markForCheck');
    markForCheck.mockClear();
    return { fixture, markForCheck };
  };

  it('subscribes to the current entity patches', () => {
    createDirective();

    expect(rxdbMocks.getEntityStatus).toHaveBeenCalledWith(mockEntity);
    expect(patches.observed).toBe(true);
  });

  // RAN-011：这里原本要 `await vi.runAllTimersAsync()` 才看得到调用 ——
  // 把「默认配置下仍串联两层 scheduler」当成契约锁住了。默认即同步。
  it('marks the view for check when the entity emits a patch', () => {
    const { markForCheck } = createDirective();

    patches.next();

    expect(markForCheck).toHaveBeenCalledTimes(1);
  });

  it('debounces patch notifications', async () => {
    const { markForCheck } = createDirective({ debounce: 100 });

    patches.next();
    patches.next();
    await vi.advanceTimersByTimeAsync(99);
    expect(markForCheck).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(markForCheck).toHaveBeenCalledTimes(1);
  });

  it('audits patch notifications', async () => {
    const { markForCheck } = createDirective({ audit: 50 });

    patches.next();
    await vi.advanceTimersByTimeAsync(49);
    expect(markForCheck).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(markForCheck).toHaveBeenCalledTimes(1);
  });

  describe('时间窗为非正/非有限值时不挂入管道（RAN-011）', () => {
    it.each([
      ['debounceTime 为 0', { debounce: 0 }],
      ['auditTime 为 0', { audit: 0 }],
      ['debounceTime 为负', { debounce: -1 }],
      ['auditTime 为负', { audit: -1 }],
      ['debounceTime 为 NaN', { debounce: Number.NaN }],
      ['auditTime 为 NaN', { audit: Number.NaN }],
      ['debounceTime 为 Infinity', { debounce: Number.POSITIVE_INFINITY }],
      ['auditTime 为 Infinity', { audit: Number.POSITIVE_INFINITY }]
    ])('%s 时 patch 在当前变更周期内同步触发变更检测', (_label, config) => {
      const { markForCheck } = createDirective(config);

      patches.next();

      expect(markForCheck).toHaveBeenCalledTimes(1);
    });

    it('两者同时为正值时串联生效，顺序为 debounceTime → auditTime', async () => {
      const { markForCheck } = createDirective({ debounce: 100, audit: 50 });

      patches.next();
      await vi.advanceTimersByTimeAsync(99);
      expect(markForCheck).not.toHaveBeenCalled();

      // debounce 在 t=100 放行后 audit 才起窗，串联而非二选一
      await vi.advanceTimersByTimeAsync(1);
      expect(markForCheck).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(50);
      expect(markForCheck).toHaveBeenCalledTimes(1);
    });
  });

  it('forwards patch stream errors to Angular ErrorHandler', () => {
    createDirective();
    const error = new Error('Patch stream failed');

    patches.error(error);

    expect(errorHandler.handleError).toHaveBeenCalledWith(error);
  });

  it('unsubscribes when the entity input is cleared', () => {
    const { fixture } = createDirective();

    fixture.componentInstance.entity.set(undefined);
    fixture.detectChanges();
    TestBed.flushEffects();

    expect(patches.observed).toBe(false);
  });

  it('unsubscribes when the host is destroyed', () => {
    const { fixture } = createDirective();

    fixture.destroy();

    expect(patches.observed).toBe(false);
  });
});
