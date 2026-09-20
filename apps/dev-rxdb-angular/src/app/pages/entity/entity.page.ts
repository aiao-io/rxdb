import { getEntityMetadata, RxDB } from '@aiao/rxdb';
import { useCount } from '@aiao/rxdb-angular';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, Signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

/** 左侧目录里的实体条目。 */
export interface EntityOption {
  namespace: string;
  name: string;
  /** `${namespace}:${name}` */
  key: string;
  displayName: string;
}

/** 非 public namespace 的实体分组。 */
export interface EntityGroup {
  namespace: string;
  entities: EntityOption[];
}

/**
 * rxdb-model 实体浏览壳页（/entities，dashboard 同款两栏布局）：
 * 左侧为按 namespace 分组的实体目录（含计数），点击切换右侧列表；
 * 无子路由时自动重定向到首个实体。右侧由 `:namespace/:name` 子路由渲染实体列表。
 */
@Component({
  selector: 'app-entity',
  templateUrl: './entity.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  host: { class: 'page-host flex h-full bg-base-100' }
})
export default class EntityPage {
  readonly #rxdb = inject(RxDB);
  readonly #router = inject(Router);
  readonly #activatedRoute = inject(ActivatedRoute);
  readonly #destroyRef = inject(DestroyRef);

  /** 每个实体独立的计数 Signal，模板按需读取，避免任一计数变化触发全量重渲染 */
  readonly entityCountSignals = new Map<string, Signal<number>>(
    this.#rxdb.config.entities.map(cls => {
      const meta = getEntityMetadata(cls);
      return [`${meta.namespace}:${meta.name}`, useCount(cls, { where: { combinator: 'and', rules: [] } }).value];
    })
  );

  readonly entityList: EntityOption[] = this.#rxdb.config.entities.map(cls => {
    const meta = getEntityMetadata(cls);
    return {
      namespace: meta.namespace,
      name: meta.name,
      key: `${meta.namespace}:${meta.name}`,
      displayName: meta.displayName ?? meta.name
    };
  });

  /** public namespace 的实体直接展示在顶部，其余按 namespace 分组 */
  readonly publicEntities: EntityOption[] = this.entityList.filter(e => e.namespace === 'public');
  readonly entityGroups: EntityGroup[] = (() => {
    const map = new Map<string, EntityOption[]>();
    for (const e of this.entityList) {
      if (e.namespace === 'public') continue;
      const arr = map.get(e.namespace) ?? [];
      arr.push(e);
      map.set(e.namespace, arr);
    }
    return [...map.entries()].map(([namespace, entities]) => ({ namespace, entities }));
  })();

  constructor() {
    this.#router.events
      .pipe(
        filter(e => e instanceof NavigationEnd),
        takeUntilDestroyed(this.#destroyRef)
      )
      .subscribe(() => {
        if (!this.entityList.length || this.#activatedRoute.children.length > 0) return;
        const first = this.entityList[0];
        void this.#router.navigate([first.namespace, first.name], { relativeTo: this.#activatedRoute });
      });
  }
}
