import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';

import { WeatherStore } from '../services/weather-store';

/** 天气应用与小组件共用真实请求状态、时间和重试入口。 */
@Component({
  selector: 'app-weather-status',
  imports: [DatePipe],
  template: `
    <div class="weather-status" aria-live="polite">
      @if (weather.loading()) {
        <p role="status">Updating weather…</p>
      }
      @if (weather.error(); as error) {
        <p role="alert">{{ error }}</p>
      }
      @if (weather.stale()) {
        <p>Showing an earlier forecast.</p>
      }
      @if (weather.sourceTime(); as time) {
        <p>Open-Meteo · {{ time.replace('T', ' ') }} (city time)</p>
        <p>Retrieved {{ weather.receivedAt() | date: 'medium' }}</p>
      }
    </div>
    <button class="btn" [disabled]="weather.loading()" (click)="weather.refresh()" tabindex="0">
      {{ weather.error() ? 'Retry weather' : 'Refresh weather' }}
    </button>
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
}
