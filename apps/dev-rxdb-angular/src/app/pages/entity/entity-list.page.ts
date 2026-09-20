import { RxDB } from '@aiao/rxdb';
import { EntityListComponent } from '@aiao/rxdb-model-angular';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';

/**
 * rxdb-model 实体列表页（`/entities/:namespace/:name` 子路由）：按 namespace + name 定位实体元数据，
 * 提供无限滚动、行内编辑、撤销/重做与筛选。
 *
 * 「查看」行 → 组件内置打开 edit 详情对话框（关系 Tab 内同理可无限下钻，editChain 防环）；
 * `/entities/:namespace/:name/:entityId` 路由是深链编辑入口。
 */
@Component({
  selector: 'app-entity-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EntityListComponent],
  template: `<rxdb-entity-list class="block h-full" [name]="name()" [namespace]="namespace()" />`,
  host: { class: 'page-host flex h-full flex-col bg-base-100' }
})
export default class EntityListPage {
  // 注入 RxDB 以初始化本地数据库（首次查询经适配器 ready() 自动 connect）
  rxdb = inject(RxDB);

  /** 路由参数 :namespace / :name（withComponentInputBinding 自动绑定） */
  readonly namespace = input.required<string>();
  readonly name = input.required<string>();
}
