<script lang="ts" setup>
/**
 * rxdb-model 实体列表页（`/entities/:namespace/:name` 子路由）。
 *
 * 可选查询参数 `fixedQuery`（`FixedQuery` 的 JSON）作为列表的固定查询，例如钉住分组排序实体的一组后
 * 才能拖拽排序（US-028 阶段 B，三端 e2e 经它进入）。
 */
import { injectRxDB } from '@aiao/rxdb-vue';
import { EntityList } from '@aiao/rxdb-model-vue';
import { computed } from 'vue';
import { useRoute } from 'vue-router';

/** 列表固定查询的结构（与 `EntityList` 的 `fixedQuery` 输入一致） */
type FixedQuery = { combinator: 'and' | 'or'; rules: unknown[] };

// 注入 RxDB 以初始化本地数据库（首次查询经适配器 ready() 自动 connect）
injectRxDB();

/** 路由参数 :namespace / :name */
const route = useRoute();
const namespace = computed(() => String(route.params.namespace ?? ''));
const name = computed(() => String(route.params.name ?? ''));
/** 查询参数 `fixedQuery`（`FixedQuery` 的 JSON）：列表的固定查询，JSON 非法时直接抛错 */
const fixedQuery = computed(() => {
  const raw = route.query['fixedQuery'];
  return typeof raw === 'string' ? (JSON.parse(raw) as FixedQuery) : undefined;
});
</script>

<template>
  <div class="page-host bg-base-100 flex h-full flex-col">
    <EntityList
      class="block h-full"
      :fixed-query="fixedQuery"
      :name="name"
      :namespace="namespace"
    />
  </div>
</template>
