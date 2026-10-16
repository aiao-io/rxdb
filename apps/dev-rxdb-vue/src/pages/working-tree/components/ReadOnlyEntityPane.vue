<script lang="ts" setup>
import type { RxDB } from '@aiao/rxdb';
import { EntityList } from '@aiao/rxdb-model-vue';
import { provideRxDB } from '@aiao/rxdb-vue';
import { toRef } from 'vue';

/**
 * 只读检出位查看器的右栏：把视图的只读实例交给子树，里面的实体列表照常查询（US-313）。
 *
 * @remarks
 * 交出去的是 ref：刷新换了实例，查看器按视图 id 重建本组件，旧实例上的订阅随之退场。
 */
const props = defineProps<{
  /** 视图的只读实例 */
  rxdb: RxDB;
  namespace: string;
  name: string;
}>();

provideRxDB(toRef(props, 'rxdb'));
</script>

<template>
  <EntityList
    class="block h-full"
    :key="`${namespace}:${name}`"
    :name="name"
    :namespace="namespace"
  />
</template>
