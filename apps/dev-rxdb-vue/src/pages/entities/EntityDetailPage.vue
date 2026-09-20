<script lang="ts" setup>
import { injectRxDB } from '@aiao/rxdb-vue';
import { EntityDetail, type EntityFormData } from '@aiao/rxdb-model-vue';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

// 注入 RxDB 以初始化本地数据库
const rxdb = injectRxDB()!;

/** 路由参数 :namespace / :name / :entityId */
const route = useRoute();
const router = useRouter();
const namespace = computed(() => String(route.params.namespace ?? ''));
const name = computed(() => String(route.params.name ?? ''));
const entityId = computed(() => String(route.params.entityId ?? ''));

function onSaved(data: EntityFormData): void {
  console.info('[entity-detail] saved', data);
  // URL 相对导航返回实体列表（Angular '..' 同款语义：扁平四段 URL 的上一段即列表页）
  void router.push('..');
}

function onCancelled(): void {
  console.info('[entity-detail] cancelled');
  void router.push('..');
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
