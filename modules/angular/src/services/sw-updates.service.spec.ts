import { ApplicationRef, PLATFORM_ID, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SwUpdate, VersionEvent, VersionReadyEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SwUpdatesService } from './sw-updates.service';

describe('SwUpdatesService', () => {
  const isStable = new Subject<boolean>();
  const unrecoverable = new Subject<{ reason: string; type: 'UNRECOVERABLE_STATE' }>();
  const versionUpdates = new Subject<VersionEvent>();
  const checkForUpdate = vi.fn(async () => false);

  beforeEach(() => {
    checkForUpdate.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        SwUpdatesService,
        { provide: ApplicationRef, useValue: { isStable } },
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: SwUpdate, useValue: { checkForUpdate, isEnabled: true, unrecoverable, versionUpdates } }
      ]
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('unsubscribes every stream on disable and supports re-enabling', () => {
    const service = TestBed.inject(SwUpdatesService);

    service.enable();
    expect(unrecoverable.observed).toBe(true);
    expect(versionUpdates.observed).toBe(true);

    service.disable();
    expect(unrecoverable.observed).toBe(false);
    expect(versionUpdates.observed).toBe(false);

    service.enable();
    expect(unrecoverable.observed).toBe(true);
    expect(versionUpdates.observed).toBe(true);
  });

  it('checks for updates only after the application becomes stable', async () => {
    const service = TestBed.inject(SwUpdatesService);
    service.enable();

    expect(checkForUpdate).not.toHaveBeenCalled();
    isStable.next(true);
    await Promise.resolve();

    expect(checkForUpdate).toHaveBeenCalledOnce();
  });

  it('forwards ready events and completes on destroy', () => {
    const service = TestBed.inject(SwUpdatesService);
    const ready = vi.fn();
    const complete = vi.fn();
    service.updateActivated$.subscribe({ next: ready, complete });
    service.enable();

    const event: VersionReadyEvent = {
      type: 'VERSION_READY',
      currentVersion: { hash: 'current' },
      latestVersion: { hash: 'latest' }
    };
    versionUpdates.next(event);
    service.ngOnDestroy();

    expect(ready).toHaveBeenCalledWith(event);
    expect(complete).toHaveBeenCalledOnce();
  });
});
