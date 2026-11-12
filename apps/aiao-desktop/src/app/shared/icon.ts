import { Directive, ElementRef, Renderer2, effect, inject, input } from '@angular/core';

/** 在 `<svg>` 上引用图标精灵里的 symbol：`<svg appIcon="g-search">`。 */
@Directive({
  selector: '[appIcon]',
  host: { 'aria-hidden': 'true' }
})
export class Icon {
  readonly appIcon = input.required<string>();

  constructor() {
    const renderer = inject(Renderer2);
    const use = renderer.createElement('use', 'svg') as SVGUseElement;
    renderer.appendChild(inject<ElementRef<SVGSVGElement>>(ElementRef).nativeElement, use);
    effect(() => renderer.setAttribute(use, 'href', `#${this.appIcon()}`));
  }
}
