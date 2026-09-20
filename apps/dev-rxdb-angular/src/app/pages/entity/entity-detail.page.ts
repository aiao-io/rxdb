import { RxDB } from '@aiao/rxdb';
import { EntityDetailComponent, EntityFormData } from '@aiao/rxdb-model-angular';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

/**
 * rxdb-model 实体详情演示页：`/entities/:namespace/:name/:entityId` 路由进入编辑模式，
 * 按 id 从 Repository 加载实体；保存由 EntityDetailComponent 内部完成（edit 模式实例路径），
 * 本页只负责保存/取消后返回实体列表（`../..` 相对导航，dashboard 同款）。
 *
 * 交互式编辑走列表页「查看」的内置编辑对话框；本路由是深链入口。
 */
@Component({
  selector: 'app-entity-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EntityDetailComponent],
  template: `<rxdb-entity-detail
    class="block h-full"
    [entityId]="entityId()"
    [name]="name()"
    [namespace]="namespace()"
    (formCancelled)="onCancelled()"
    (formSubmitted)="onSaved($event)"
  />`,
  host: { class: 'page-host flex h-full flex-col bg-base-100' }
})
export default class EntityDetailPage {
  readonly #router = inject(Router);
  readonly #route = inject(ActivatedRoute);

  // 注入 RxDB 以初始化本地数据库
  rxdb = inject(RxDB);

  /** 路由参数 :namespace / :name / :entityId（withComponentInputBinding 自动绑定） */
  readonly namespace = input.required<string>();
  readonly name = input.required<string>();
  readonly entityId = input.required<string>();

  onSaved(data: EntityFormData): void {
    console.info('[entity-detail] saved', data);
    void this.#router.navigate(['../..'], { relativeTo: this.#route });
  }

  onCancelled(): void {
    console.info('[entity-detail] cancelled');
    void this.#router.navigate(['../..'], { relativeTo: this.#route });
  }
}
