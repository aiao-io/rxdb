<script lang="ts" setup>
import { injectRxDB } from '@aiao/rxdb-vue';
import { EntityList } from '@aiao/rxdb-model-vue';
import { computed } from 'vue';
import { useRoute } from 'vue-router';

// 注入 RxDB 以初始化本地数据库（首次查询经适配器 ready() 自动 connect）
injectRxDB();

/** 路由参数 :namespace / :name */
const route = useRoute();
const namespace = computed(() => String(route.params.namespace ?? ''));
const name = computed(() => String(route.params.name ?? ''));
</script>

<template>
  <div class="page-host bg-base-100 flex h-full flex-col">
    <EntityList
      class="block h-full"
      :name="name"
      :namespace="namespace"
    />
  </div>
</template>
