import { useI18n } from '@aiao/rxdb-i18n-angular';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { I18nPipe } from '../../pipes/i18n.pipe';
import { DEMO_DATE_OPTIONS, DEMO_FORMAT_DATE, DEMO_FORMAT_NUMBER } from '../../rxdb/i18n';

@Component({
  selector: 'app-i18n-page',
  templateUrl: './i18n.page.html',
  host: { class: 'page-host overflow-auto bg-base-100' },
  imports: [FormsModule, RouterLink, I18nPipe],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class I18nPage {
  readonly i18n = useI18n();
  readonly formatDate = DEMO_FORMAT_DATE;
  readonly formatNumber = DEMO_FORMAT_NUMBER;
  readonly dateOptions = DEMO_DATE_OPTIONS;
  readonly relativeValue = -3;
  sampleName = 'Ada';
  sampleCount = 3;
  sampleRole = 'developer';

  protected changeLocale(event: Event): void {
    void this.i18n.setLocale((event.target as HTMLSelectElement).value);
  }
}
