import { Component } from '@angular/core';

import {
  EXTERNAL_CONTENT,
  EXTERNAL_CONTENT_NOTICE,
  EXTERNAL_TRIGGERS,
  LINK_ONLY_HOSTS,
  SAFARI_ENTERED_SITES
} from '../../shared/external-content';

/**
 * 「关于本机 ▸ External Content」：外网内容的说明页（ADESK-US-007）。
 * 内容全部来自 `shared/external-content.ts` 的清单，页面自己不请求任何外网资源，所以拦截外网时照样打得开。
 *
 * 稳定的钩子供冒烟定位：容器 `data-external-content`（`data-external-count` 是清单的条数），
 * 每行 `data-external-host` 加 `data-external-trigger`，行内的 `data-external-purpose`、`data-external-sends`、
 * `data-external-apps`，统一说明 `data-external-notice`，只是链接的主机 `data-link-host`。
 */
@Component({
  selector: 'app-external-content',
  host: { style: 'display: contents' },
  template: `
    <div class="ec selectable" [attr.data-external-count]="entries.length" data-external-content>
      <h2>Where this desktop gets its content</h2>
      @for (note of notice; track note) {
        <p data-external-notice>{{ note }}</p>
      }
      <dl class="ec-legend">
        @for (trigger of triggers; track trigger.label) {
          <dt>{{ trigger.label }}</dt>
          <dd>{{ trigger.meaning }}</dd>
        }
      </dl>
      <ul class="ec-list">
        @for (entry of entries; track entry.host) {
          <li class="ec-row" [attr.data-external-host]="entry.host" [attr.data-external-trigger]="entry.trigger">
            <div class="ec-head">
              <b>{{ entry.host }}</b>
              <span class="ec-tag" [class.open]="entry.trigger === 'on-open'">{{
                triggerInfo[entry.trigger].label
              }}</span>
            </div>
            <p data-external-purpose>{{ entry.purpose }}</p>
            <p class="ec-line">
              <span class="ec-k">Sends</span>
              <span data-external-sends>{{ entry.sends }}</span>
            </p>
            <p class="ec-line">
              <span class="ec-k">When</span>
              <span>{{ entry.when }}</span>
            </p>
            <p class="ec-line">
              <span class="ec-k">Used by</span>
              <span data-external-apps>{{ entry.apps.join(', ') }}</span>
            </p>
          </li>
        }
      </ul>
      <h3>Sites you open in Safari</h3>
      <p data-external-safari-sites>{{ safariSites }}</p>
      <h3>Links only</h3>
      <p>
        These addresses appear as links or plain text. Nothing is requested unless you click, and then your browser
        opens them in a new tab.
      </p>
      <ul class="ec-links">
        @for (link of linkOnly; track link.host) {
          <li [attr.data-link-host]="link.host">
            <b>{{ link.host }}</b>
            <span>{{ link.reason }}</span>
          </li>
        }
      </ul>
    </div>
  `
})
export class ExternalContentPage {
  protected readonly entries = EXTERNAL_CONTENT;
  protected readonly notice = EXTERNAL_CONTENT_NOTICE;
  protected readonly triggerInfo = EXTERNAL_TRIGGERS;
  protected readonly triggers = Object.values(EXTERNAL_TRIGGERS);
  protected readonly safariSites = SAFARI_ENTERED_SITES;
  protected readonly linkOnly = LINK_ONLY_HOSTS;
}
