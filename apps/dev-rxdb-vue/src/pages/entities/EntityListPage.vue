<script lang="ts" setup>
/**
 * rxdb-model 实体列表页（`/entities/:namespace/:name` 子路由）。
 *
 * 可选查询参数 `fixedQuery`（`FixedQuery` 的 JSON）作为列表的固定查询，例如钉住分组排序实体的一组后
 * 才能拖拽排序（US-028 阶段 B，三端 e2e 经它进入）。
 *
 * 演示实体 `TenantNote`（声明了 `access.scope`）的列表上方出授权快照演示面板（US-029）。
 */
import { useRxDB } from '@aiao/rxdb-vue';
import { EntityList } from '@aiao/rxdb-model-vue';
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { findGrantDemoTarget } from './grant-demo';
import GrantDemoPanel from './GrantDemoPanel.vue';

/** 列表固定查询的结构（与 `EntityList` 的 `fixedQuery` 输入一致） */
type FixedQuery = { combinator: 'and' | 'or'; rules: unknown[] };

// 注入 RxDB 以初始化本地数据库（首次查询经适配器 ready() 自动 connect）
const rxdb = useRxDB();

/** 路由参数 :namespace / :name */
const route = useRoute();
const namespace = computed(() => String(route.params.namespace ?? ''));
const name = computed(() => String(route.params.name ?? ''));
/** 查询参数 `fixedQuery`（`FixedQuery` 的 JSON）：列表的固定查询，JSON 非法时直接抛错 */
const fixedQuery = computed(() => {
  const raw = route.query['fixedQuery'];
  return typeof raw === 'string' ? (JSON.parse(raw) as FixedQuery) : undefined;
});
/** 演示实体 `TenantNote`：列表上方出授权快照演示面板 */
const grantDemo = computed(() => findGrantDemoTarget(rxdb.config.entities, namespace.value, name.value));
</script>

<template>
  <div class="page-host bg-base-100 flex h-full flex-col">
    <GrantDemoPanel
      v-if="grantDemo"
      :target="grantDemo"
    />
    <EntityList
      class="min-h-0 flex-1"
      :fixed-query="fixedQuery"
      :name="name"
      :namespace="namespace"
    />
  </div>
</template>
