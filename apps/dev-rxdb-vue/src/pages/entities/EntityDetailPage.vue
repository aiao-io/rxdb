<script lang="ts" setup>
import { injectRxDB } from '@aiao/rxdb-vue';
import { EntityDetail, type EntityFormData } from '@aiao/rxdb-model-vue';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

// 注入 RxDB 以初始化本地数据库
injectRxDB();

/** 路由参数 :namespace / :name / :entityId */
const route = useRoute();
const router = useRouter();
const namespace = computed(() => String(route.params.namespace ?? ''));
const name = computed(() => String(route.params.name ?? ''));
const entityId = computed(() => String(route.params.entityId ?? ''));

/**
 * 回到所在实体的列表。vue-router 的相对路径按「目录」解析：在 `/entities/public/Todo/abc` 上 push('..')
 * 得到 `/entities/public/`，没有路由匹配、被兜底重定向到首页；改走命名路由，与壳页的重定向同一写法。
 */
function backToList(): void {
  void router.push({ name: 'entity-list', params: { namespace: namespace.value, name: name.value } });
}

function onSaved(data: EntityFormData): void {
  console.info('[entity-detail] saved', data);
  backToList();
}

function onCancelled(): void {
  console.info('[entity-detail] cancelled');
  backToList();
}
</script>

<template>
  <div class="page-host bg-base-100 flex h-full flex-col">
    <EntityDetail
      class="block h-full"
      :entity-id="entityId"
      :name="name"
      :namespace="namespace"
      @form-cancelled="onCancelled"
      @form-submitted="onSaved"
    />
  </div>
</template>
