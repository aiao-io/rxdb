import { useI18n } from '@aiao/rxdb-i18n-angular';
import { Component, inject, signal } from '@angular/core';

import { WindowManager } from '../../services/window-manager';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { ExternalContentPage } from './external-content-page';

/** 「关于本机」窗口里的两个视图：本机概览，以及外网内容的说明页。 */
type AboutPage = 'overview' | 'external-content';

/**
 * 「关于本机」。标题栏右侧的 External Content 打开外网内容说明页（ADESK-US-007），
 * 说明页在同一个窗口里，点 Done 回到概览。
 */
@Component({
  selector: 'app-about',
  imports: [ExternalContentPage, Icon, TrafficLights],
  host: { style: 'display: contents' },
  template: `
    <div class="tb plain" data-drag>
      <div class="title">{{ page() === 'overview' ? '' : i18n.t('apps.about.externalContent') }}</div>
      <div class="tbz"><app-traffic-lights /></div>
      <div class="grow"></div>
      <div class="tbz">
        @if (page() === 'overview') {
          <button class="tbtn" (click)="page.set('external-content')" data-external-content-open>
            <svg appIcon="g-globe"></svg>
            {{ i18n.t('apps.about.externalContent') }}
          </button>
        } @else {
          <button class="tbtn" (click)="page.set('overview')" data-external-content-close>
            {{ i18n.t('apps.about.done') }}
          </button>
        }
      </div>
    </div>
    @if (page() === 'overview') {
      <div class="about">
        <svg class="mark" appIcon="g-apple"></svg>
        <h1>MacBook Pro</h1>
        <div class="ver">{{ i18n.t('apps.about.modelLine') }}</div>
        <dl>
          <dt>{{ i18n.t('apps.about.chip') }}</dt>
          <dd>Apple M4 Max</dd>
          <dt>{{ i18n.t('apps.about.memory') }}</dt>
          <dd>128 GB</dd>
          <dt>{{ i18n.t('apps.about.startupDisk') }}</dt>
          <dd>Macintosh HD</dd>
          <dt>{{ i18n.t('apps.about.serialNumber') }}</dt>
          <dd>C02PR4S3NX26</dd>
          <dt>macOS</dt>
          <dd>Tahoe 26.0 (26A5240b)</dd>
          <dt>{{ i18n.t('apps.about.display') }}</dt>
          <dd>{{ display }}</dd>
          <dt>{{ i18n.t('apps.about.renderedBy') }}</dt>
          <dd>{{ i18n.t('apps.about.oneHtmlFile') }}</dd>
        </dl>
        <div class="btns">
          <button class="btn" (click)="wm.open('settings', { section: 'general' })" data-more>
            {{ i18n.t('apps.about.moreInfo') }}
          </button>
          <button class="btn" (click)="wm.open('terminal')" data-rep>{{ i18n.t('apps.about.systemReport') }}</button>
        </div>
        <div
          style="margin-top: auto; padding-top: 16px; font-size: 10.5px; color: var(--txt-3); text-align: center; line-height: 1.5"
        >
          {{ i18n.t('apps.about.trademark') }}<br />{{ i18n.t('apps.about.allRightsReserved') }}
        </div>
      </div>
    } @else {
      <app-external-content />
    }
  `
})
export class AboutApp {
  protected readonly wm = inject(WindowManager);
  protected readonly i18n = useI18n();
  protected readonly display = `${innerWidth * 2} × ${innerHeight * 2} @ 120 Hz`;
  protected readonly page = signal<AboutPage>('overview');
}
