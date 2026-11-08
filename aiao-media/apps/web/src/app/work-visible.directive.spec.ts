import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkVisibleDirective } from './work-visible.directive';

class Observer implements IntersectionObserver {
  static instances: Observer[] = [];
  readonly root = null;
  readonly rootMargin: string;
  readonly scrollMargin = '0px';
  readonly thresholds = [0];
  readonly observe = vi.fn<(target: Element) => void>();
  readonly unobserve = vi.fn<(target: Element) => void>();
  readonly disconnect = vi.fn<() => void>();

  constructor(
    private readonly callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit
  ) {
    this.rootMargin = options?.rootMargin ?? '0px';
    Observer.instances.push(this);
  }

  readonly takeRecords = () => [];

  emit(target: Element, isIntersecting: boolean): void {
    this.callback(
      [
        {
          target,
          isIntersecting,
          boundingClientRect: target.getBoundingClientRect(),
          intersectionRect: target.getBoundingClientRect(),
          rootBounds: null,
          intersectionRatio: isIntersecting ? 1 : 0,
          time: 0
        }
      ],
      this
    );
  }
}

@Component({
  imports: [WorkVisibleDirective],
  template: '<article appWorkVisible (visibleChange)="changes.push($event)"></article>'
})
class Host {
  readonly changes: boolean[] = [];
}

describe('work card visibility', () => {
  beforeEach(() => {
    Observer.instances = [];
    vi.stubGlobal('IntersectionObserver', Observer);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('observes the real viewport and emits only changes for its own element', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = fixture.nativeElement.querySelector('article') as HTMLElement;
    const observer = Observer.instances[0];
    expect(observer.rootMargin).toBe('0px');
    expect(observer.observe).toHaveBeenCalledExactlyOnceWith(element);
    observer.emit(element, false);
    observer.emit(element, true);
    observer.emit(element, true);
    observer.emit(document.createElement('article'), false);
    observer.emit(element, false);
    expect(fixture.componentInstance.changes).toEqual([true, false]);
  });

  it('disconnects and ignores queued callbacks after destruction', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = fixture.nativeElement.querySelector('article') as HTMLElement;
    const observer = Observer.instances[0];
    observer.emit(element, true);
    fixture.destroy();
    expect(observer.unobserve).toHaveBeenCalledExactlyOnceWith(element);
    expect(observer.disconnect).toHaveBeenCalledOnce();
    observer.emit(element, false);
    expect(fixture.componentInstance.changes).toEqual([true]);
  });
});
