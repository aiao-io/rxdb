<script lang="ts" setup>
import type { RuleGroup } from '@aiao/rxdb';
import { useI18nRuntime } from '@aiao/rxdb-i18n-vue';
import { useQueryBuilder } from '@aiao/rxdb-model-vue/headless';
import { computed } from 'vue';
import { queryFields } from './article-model';
import QueryGroup from './QueryGroup.vue';

const emit = defineEmits<{ apply: [query: RuleGroup] }>();

/** 筛选面板：自有的分组 / 规则行 / 控件，状态与动作来自 `useQueryBuilder`；文案用应用的 i18n 运行时。 */
const { controller, snapshot } = useQueryBuilder({ fields: queryFields, i18n: useI18nRuntime() });
const errors = computed(() => snapshot.value.validation.errors ?? []);

const clear = (): void => {
  controller.clear();
  emit('apply', controller.toRxDBQuery());
};
</script>

<template>
  <section class="hl-section" aria-labelledby="hl-query-title" data-testid="headless-query">
    <h2 id="hl-query-title">筛选</h2>
    <QueryGroup
      :group="snapshot.state.rootGroup"
      :controller="controller"
      :fields="snapshot.fields"
      :is-root="true"
    />
    <ul v-if="errors.length > 0" class="hl-error" role="alert" data-testid="qb-errors">
      <li v-for="(error, index) in errors" :key="`${error.field}-${index}`">{{ error.message }}</li>
    </ul>
    <div class="hl-actions">
      <button type="button" :disabled="!snapshot.valid" @click="emit('apply', controller.toRxDBQuery())">
        应用筛选
      </button>
      <button type="button" @click="clear">清空筛选</button>
    </div>
    <pre class="hl-output" aria-label="查询输出" data-testid="qb-query">{{ JSON.stringify(snapshot.query) }}</pre>
  </section>
</template>
