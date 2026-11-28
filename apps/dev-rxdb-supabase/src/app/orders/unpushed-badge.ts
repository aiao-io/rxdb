import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { PendingKind } from './orders-interactions';

const TITLES: Readonly<Record<PendingKind, string>> = {
  INSERT: '本机新建，还没推送',
  UPDATE: '本机改过，还没推送'
};

/**
 * 一行还没推送时的标记（US-235）：推送之后消失
 *
 * @remarks
 * 订单页按待推送清单（`versionManager.pushableHistories$`）给每一行标；只存本地的访客与本地模式没有推送，也就没有标记。
 */
@Component({
  selector: 'app-unpushed-badge',
  host: { class: 'contents' },
  template: `
    @if (kind(); as kind) {
      <span class="badge badge-warning badge-xs" [attr.data-kind]="kind" [title]="titles[kind]" data-testid="unpushed">
        未推送
      </span>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UnpushedBadge {
  /** 这一行还没推送的是什么修改；推过了为 `undefined` */
  readonly kind = input<PendingKind | undefined>();
  readonly titles = TITLES;
}
