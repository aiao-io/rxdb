import { RxDB } from '@aiao/rxdb';
import { EntityDetailComponent, EntityFormData } from '@aiao/rxdb-model-angular';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

/**
 * rxdb-model 实体详情演示页：create 模式——组件内部生成内存草稿实体，
 * 校验通过保存时才落库（详情 Tab 结构含基础表单；Todo 无关系故只有表单 Tab）。
 */
@Component({
  selector: 'app-entity-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EntityDetailComponent],
  template: `<rxdb-entity-detail
    class="block h-full"
    (formCancelled)="onCancelled()"
    (formSubmitted)="onSaved($event)"
    name="Todo"
    namespace="public"
  />`,
  host: { class: 'page-host flex h-full flex-col bg-base-100' }
})
export default class EntityDetailPage {
  // 注入 RxDB 以初始化本地数据库
  rxdb = inject(RxDB);

  onSaved(data: EntityFormData): void {
    console.info('[entity-detail] saved', data);
  }

  onCancelled(): void {
    console.info('[entity-detail] cancelled');
  }
}
