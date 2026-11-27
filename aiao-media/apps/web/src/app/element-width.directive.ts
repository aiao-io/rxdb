import { type AfterViewInit, Directive, ElementRef, inject, type OnDestroy, output } from '@angular/core';

/** 报告元素内容区宽度的变化；瀑布流据此决定列数。 */
@Directive({ selector: '[appElementWidth]' })
export class ElementWidthDirective implements AfterViewInit, OnDestroy {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private observer?: ResizeObserver;
  readonly widthChange = output<number>();

  ngAfterViewInit(): void {
    this.observer = new ResizeObserver(entries => this.widthChange.emit(entries[entries.length - 1].contentRect.width));
    this.observer.observe(this.element);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
