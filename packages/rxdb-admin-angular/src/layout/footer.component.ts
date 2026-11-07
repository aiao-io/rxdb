import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { injectAdminShell, injectAdminStore, injectAdminText } from '../context';

/**
 * 页脚：版权信息与备案号。布局不显示页脚时不渲染。
 */
@Component({
  selector: 'rxdb-admin-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  templateUrl: './footer.component.html'
})
export class AdminFooterComponent {
  readonly #shell = injectAdminShell();

  protected readonly t = injectAdminText();
  protected readonly layout = injectAdminStore(this.#shell.layout);
  protected readonly prefs = injectAdminStore(this.#shell.preferences);
  protected readonly copyright = computed(() => this.prefs().copyright);
  protected readonly copyrightText = computed(() => {
    const { date, companyName } = this.copyright();
    return this.t('layout.copyright', { year: date, company: companyName || this.#shell.brandTitle });
  });
  protected readonly icpHref = computed(() => {
    const { icpLink, companySiteLink } = this.copyright();
    return icpLink || companySiteLink || undefined;
  });
}
