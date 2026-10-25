import { type AfterViewInit, Directive, ElementRef, inject, type OnDestroy, output } from '@angular/core';

/** 仅报告作品卡片进入或离开真实视口。 */
@Directive({ selector: '[appWorkVisible]' })
export class WorkVisibleDirective implements AfterViewInit, OnDestroy {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private observer?: IntersectionObserver;
  private visible = false;
  private destroyed = false;
  readonly visibleChange = output<boolean>();

  ngAfterViewInit(): void {
    this.observer = new IntersectionObserver(
      entries => {
        if (this.destroyed) return;
        for (const entry of entries) this.change(entry);
      },
      { rootMargin: '0px' }
    );
    this.observer.observe(this.element);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.observer?.unobserve(this.element);
    this.observer?.disconnect();
  }

  private change(entry: IntersectionObserverEntry): void {
    if (entry.target !== this.element || entry.isIntersecting === this.visible) return;
    this.visible = entry.isIntersecting;
    this.visibleChange.emit(this.visible);
  }
}
