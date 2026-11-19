import { Directive, computed, input } from '@angular/core';

/** 在 `<svg>` 上显示 `public/icons/desktop` 中的同名资源。`g-` 是单色 SVG，其余是彩色 PNG。 */
@Directive({
  selector: '[appIcon]',
  host: {
    'aria-hidden': 'true',
    '[attr.data-icon]': 'appIcon()',
    '[style.--desktop-icon-image]': 'image()'
  }
})
export class Icon {
  protected readonly image = computed(() => {
    const name = this.appIcon();
    const extension = name.startsWith('g-') ? 'svg' : 'png';
    return `url("icons/desktop/${encodeURIComponent(name)}.${extension}")`;
  });
  readonly appIcon = input.required<string>();
}
