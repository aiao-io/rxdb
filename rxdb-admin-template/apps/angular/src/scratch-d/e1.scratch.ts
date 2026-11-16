import { Component, ElementRef, afterNextRender, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

@Component({ selector: 'probe-host', template: '<div #host></div>' })
class Probe {
  readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  constructor() {
    afterNextRender(() => {
      this.host().nativeElement.setAttribute('data-mounted', 'yes');
    });
  }
}

describe('e1 proposal config', () => {
  it('signal viewChild works with analog jit', async () => {
    const fixture = TestBed.createComponent(Probe);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('div')?.getAttribute('data-mounted')).toBe('yes');
  });
});
