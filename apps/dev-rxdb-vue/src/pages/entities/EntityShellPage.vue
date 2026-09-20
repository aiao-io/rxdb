<script lang="ts" setup>
import { getEntityMetadata, type Entity } from '@aiao/rxdb';
import { injectRxDB, useCount } from '@aiao/rxdb-vue';
import { computed, watch } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';

/** 左侧目录里的实体条目。 */
interface EntityOption {
  namespace: string;
  name: string;
  /** `${namespace}:${name}` */
  key: string;
  displayName: string;
  cls: Entity;
}

/** 非 public namespace 的实体分组。 */
interface EntityGroup {
  namespace: string;
  entities: EntityOption[];
}

const rxdb = injectRxDB()!;
const route = useRoute();
const router = useRouter();

const entityList: EntityOption[] = rxdb.config.entities.map(cls => {
  const meta = getEntityMetadata(cls);
  return {
    namespace: meta.namespace,
    name: meta.name,
    key: `${meta.namespace}:${meta.name}`,
    displayName: meta.displayName ?? meta.name,
    cls
  };
});

/** 每个实体独立的计数资源，目录行按需读取，避免任一计数变化触发全量重渲染 */
const entityCounts = new Map(
  entityList.map(entry => [entry.key, useCount(entry.cls, { where: { combinator: 'and', rules: [] } })])
);

const publicEntities = computed(() => entityList.filter(e => e.namespace === 'public'));
const entityGroups = computed<EntityGroup[]>(() => {
  const map = new Map<string, EntityOption[]>();
  for (const e of entityList) {
    if (e.namespace === 'public') continue;
    const arr = map.get(e.namespace) ?? [];
    arr.push(e);
    map.set(e.namespace, arr);
  }
  return [...map.entries()].map(([namespace, entities]) => ({ namespace, entities }));
});

// 无子路由参数时自动重定向到首个实体（Angular 壳页 NavigationEnd 订阅的 Vue 对应物；
// :namespace/:name 子路由没吃到参数时壳页右栏是空 outlet，补一次导航）
watch(
  () => route.fullPath,
  () => {
    if (!entityList.length) return;
    if (route.params.namespace && route.params.name) return;
    const first = entityList[0];
    void router.push({ name: 'entity-list', params: { namespace: first.namespace, name: first.name } });
  },
  { immediate: true }
);
</script>

<template>
  <div
    class="page-host bg-base-100 flex h-full"
    data-testid="entity-shell"
  >
    <!-- 左侧：实体目录（public 平铺，其余按 namespace 分组） -->
    <div class="border-base-300 bg-base-100 flex h-full w-56 shrink-0 flex-col border-r">
      <div
        class="border-base-300 text-base-content/70 flex h-10 min-h-10 items-center border-b px-3 text-xs font-medium"
      >
        实体类型
      </div>
      <div class="flex-1 overflow-y-auto">
        <ul class="menu menu-sm w-full">
          <li
            v-for="entity in publicEntities"
            :key="entity.key"
          >
            <RouterLink
              :to="{ name: 'entity-list', params: { namespace: entity.namespace, name: entity.name } }"
              active-class="menu-active"
            >
              <span class="truncate">{{ entity.displayName }}</span>
              <span class="badge badge-ghost badge-xs">{{ entityCounts.get(entity.key)?.value ?? 0 }}</span>
            </RouterLink>
          </li>
          <li
            v-for="group in entityGroups"
            :key="group.namespace"
          >
            <details open>
              <summary class="text-base-content/50 text-xs font-semibold tracking-wide uppercase">
                {{ group.namespace }}
              </summary>
              <ul>
                <li
                  v-for="entity in group.entities"
                  :key="entity.key"
                >
                  <RouterLink
                    :to="{ name: 'entity-list', params: { namespace: entity.namespace, name: entity.name } }"
                    active-class="menu-active"
                  >
                    <span class="truncate">{{ entity.displayName }}</span>
                    <span class="badge badge-ghost badge-xs">{{ entityCounts.get(entity.key)?.value ?? 0 }}</span>
                  </RouterLink>
                </li>
              </ul>
            </details>
          </li>
        </ul>
      </div>
      <div class="border-base-300 text-base-content/40 flex items-center border-t px-3 py-1.5 text-xs">
        <span>共 {{ entityList.length }} 个实体</span>
      </div>
    </div>

    <!-- 右侧：所选实体的列表（relative 把表格的加载/空态遮罩限制在面板内，不遮左侧目录） -->
    <div class="relative flex flex-1 flex-col overflow-hidden">
      <RouterView />
    </div>
  </div>
</template>
