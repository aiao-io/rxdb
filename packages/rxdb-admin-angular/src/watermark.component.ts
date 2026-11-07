import { ChangeDetectionStrategy, Component } from '@angular/core';
import { injectAdminShell, injectAdminStore } from './context';

/**
 * 水印：平铺的旋转文字覆盖层，不拦截任何交互。偏好关闭或文案为空时不渲染。
 */
@Component({
  selector: 'rxdb-admin-watermark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @if (background() !== '') {
      <div
        class="admin-watermark"
        [style.background-image]="background()"
        aria-hidden="true"
        data-testid="admin-watermark"
      ></div>
    }
  `
})
export class AdminWatermarkComponent {
  protected readonly background = injectAdminStore(injectAdminShell().watermark);
}
