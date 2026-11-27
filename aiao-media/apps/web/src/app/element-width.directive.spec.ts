import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ElementWidthDirective } from './element-width.directive';

class Observer implements ResizeObserver {
  static instances: Observer[] = [];
  readonly observe = vi.fn<(target: Element) => void>();
  readonly unobserve = vi.fn<(target: Element) => void>();
  readonly disconnect = vi.fn<() => void>();

  constructor(private readonly callback: ResizeObserverCallback) {
    Observer.instances.push(this);
  }

  emit(width: number): void {
    this.callback([{ contentRect: { width } } as ResizeObserverEntry], this);
  }
}

@Component({
  imports: [ElementWidthDirective],
  template: '<div appElementWidth (widthChange)="widths.push($event)"></div>'
})
class Host {
  readonly widths: number[] = [];
}

describe('元素宽度观察', () => {
  beforeEach(() => {
    Observer.instances = [];
    vi.stubGlobal('ResizeObserver', Observer);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('观察宿主元素，并在尺寸变化时报告内容区宽度', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const [observer] = Observer.instances;
    expect(observer.observe).toHaveBeenCalledWith(fixture.nativeElement.querySelector('div'));
    observer.emit(1168);
    observer.emit(429);
    expect(fixture.componentInstance.widths).toEqual([1168, 429]);
  });

  it('销毁时断开观察，不再报告', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const [observer] = Observer.instances;
    fixture.destroy();
    expect(observer.disconnect).toHaveBeenCalledOnce();
  });
});
