import { RxDB } from '@aiao/rxdb';
import { EntityListComponent } from '@aiao/rxdb-model-angular';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

/**
 * rxdb-model 实体列表演示页：`EntityListComponent` 以 namespace + name 定位实体元数据，
 * 提供无限滚动、行内编辑、撤销/重做与筛选（数据源为 @aiao/rxdb-test 的 Todo）。
 */
@Component({
  selector: 'app-entity-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EntityListComponent],
  template: `<rxdb-entity-list class="block h-full" name="Todo" namespace="public" />`,
  host: { class: 'page-host flex h-full flex-col bg-base-100' }
})
export default class EntityListPage {
  // 注入 RxDB 以初始化本地数据库（首次查询经适配器 ready() 自动 connect）
  rxdb = inject(RxDB);
}
