import { useI18n } from '@aiao/rxdb-i18n-angular';
import { DatePipe } from '@angular/common';
import { Component, inject, input } from '@angular/core';

import { WeatherStore } from '../services/weather-store';

/** 天气应用与小组件共用真实请求状态与时间；刷新按钮都显示——桌面小组件也保留一个键盘可到达的刷新/重试入口。 */
@Component({
  selector: 'app-weather-status',
  imports: [DatePipe],
  template: `
    <div class="weather-status" aria-live="polite">
      @if (weather.loading()) {
        <p role="status">{{ i18n.t('apps.weather.updating') }}</p>
      }
      @if (weather.error(); as error) {
        <p role="alert">{{ error }}</p>
      }
      @if (weather.stale()) {
        <p>{{ i18n.t('apps.weather.stale') }}</p>
      }
      @if (weather.sourceTime(); as time) {
        <p>{{ i18n.t('apps.weather.sourceTime', { time: time.replace('T', ' ') }) }}</p>
        <p>{{ i18n.t('apps.weather.retrieved', { time: weather.receivedAt() | date: 'medium' }) }}</p>
      }
    </div>
    @if (showRefresh()) {
      <button class="btn" [disabled]="weather.loading()" (click)="weather.refresh()" tabindex="0">
        {{ weather.error() ? i18n.t('apps.weather.retry') : i18n.t('apps.weather.refresh') }}
      </button>
    }
  `,
  styles: `
    :host {
      display: block;
      margin-top: 12px;
      font-size: 11px;
      line-height: 1.4;
    }
    p {
      margin: 3px 0;
    }
    button {
      color: var(--txt);
      margin-top: 6px;
    }
  `
})
export class WeatherStatus {
  protected readonly weather = inject(WeatherStore);
  protected readonly i18n = useI18n();
  /** 是否显示刷新/重试按钮；桌面小组件与天气应用都开（键盘用户需要可到达的重试入口）。 */
  readonly showRefresh = input(false);
}
