import { RxDB } from '@aiao/rxdb';
import { EntityListComponent } from '@aiao/rxdb-model-angular';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { findGrantDemoTarget } from './grant-demo';
import { GrantDemoPanelComponent } from './grant-demo-panel.component';

/** 列表固定查询的结构（与 `EntityList` 的 `fixedQuery` 输入一致） */
type FixedQuery = { combinator: 'and' | 'or'; rules: unknown[] };

/**
 * 解析 `fixedQuery` 查询参数
 *
 * @param raw - 查询参数原文（`FixedQuery` 的 JSON）；未带参数时为 `undefined`
 * @returns 固定查询；未带参数时为 `undefined`，JSON 非法时直接抛错
 */
export function parseFixedQuery(raw: string | undefined): FixedQuery | undefined {
  return raw === undefined ? undefined : (JSON.parse(raw) as FixedQuery);
}

/**
 * rxdb-model 实体列表页（`/entities/:namespace/:name` 子路由）：按 namespace + name 定位实体元数据，
 * 提供无限滚动、行内编辑、撤销/重做与筛选。
 *
 * 「查看」行 → 组件内置打开 edit 详情对话框（关系 Tab 内同理可无限下钻，editChain 防环）；
 * `/entities/:namespace/:name/:entityId` 路由是深链编辑入口。
 *
 * 可选查询参数 `fixedQuery`（`FixedQuery` 的 JSON）作为列表的固定查询，例如钉住分组排序实体的一组后
 * 才能拖拽排序（US-028 阶段 B，三端 e2e 经它进入）。
 *
 * 演示实体 `TenantNote`（声明了 `access.scope`）的列表上方出授权快照演示面板（US-029）。
 */
@Component({
  selector: 'app-entity-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EntityListComponent, GrantDemoPanelComponent],
  template: `@if (grantDemo(); as target) {
      <app-grant-demo-panel [target]="target" />
    }
    <rxdb-entity-list class="min-h-0 flex-1" [fixedQuery]="fixedQuery()" [name]="name()" [namespace]="namespace()" />`,
  host: { class: 'page-host flex h-full flex-col bg-base-100' }
})
export default class EntityListPage {
  // 注入 RxDB 以初始化本地数据库（首次查询经适配器 ready() 自动 connect）
  rxdb = inject(RxDB);

  /** 路由参数 :namespace / :name（withComponentInputBinding 自动绑定） */
  readonly namespace = input.required<string>();
  readonly name = input.required<string>();
  /** 查询参数 `fixedQuery`：列表的固定查询 */
  readonly fixedQuery = input<FixedQuery | undefined, string | undefined>(undefined, { transform: parseFixedQuery });
  /** 演示实体 `TenantNote`：列表上方出授权快照演示面板 */
  readonly grantDemo = computed(() => findGrantDemoTarget(this.rxdb.config.entities, this.namespace(), this.name()));
}
