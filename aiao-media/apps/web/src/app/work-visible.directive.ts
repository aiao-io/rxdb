import {
  type AfterViewInit,
  Directive,
  effect,
  type EffectRef,
  ElementRef,
  inject,
  Injector,
  input,
  type OnDestroy,
  output
} from '@angular/core';

/** 仅报告作品卡片进入或离开真实视口。 */
@Directive({ selector: '[appWorkVisible]' })
export class WorkVisibleDirective implements AfterViewInit, OnDestroy {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private observation?: EffectRef;
  private visible = false;
  private destroyed = false;
  readonly visibilityScope = input('');
  readonly visibleChange = output<boolean>();

  ngAfterViewInit(): void {
    this.observation = effect(
      onCleanup => {
        this.visibilityScope();
        this.visible = false;
        let active = true;
        const observer = new IntersectionObserver(entries => this.report(entries, active), { rootMargin: '0px' });
        observer.observe(this.element);
        onCleanup(() => {
          active = false;
          observer.unobserve(this.element);
          observer.disconnect();
        });
      },
      { injector: this.injector }
    );
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.observation?.destroy();
  }

  private report(entries: IntersectionObserverEntry[], active: boolean): void {
    if (!active || this.destroyed) return;
    for (const entry of entries) this.change(entry);
  }

  private change(entry: IntersectionObserverEntry): void {
    if (entry.target !== this.element || entry.isIntersecting === this.visible) return;
    this.visible = entry.isIntersecting;
    this.visibleChange.emit(this.visible);
  }
}
