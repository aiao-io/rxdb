<script lang="ts" setup>
import { useI18n } from '@aiao/rxdb-i18n-vue';
import {
  isRuleGroup,
  type FieldMetadata,
  type QueryBuilderController,
  type QueryBuilderRuleGroup
} from '@aiao/rxdb-model/headless';
import { operatorsFor } from './article-model';
import QueryRule from './QueryRule.vue';

const props = defineProps<{
  group: QueryBuilderRuleGroup;
  controller: QueryBuilderController;
  fields: readonly FieldMetadata[];
  isRoot: boolean;
}>();

const { t } = useI18n();

const addRule = (): void => {
  const [first] = props.fields;
  props.controller.addRule(props.group.id, { field: first?.name, operator: operatorsFor(first)[0]?.key });
};
</script>

<template>
  <div
    class="hl-group"
    role="group"
    :aria-label="isRoot ? t('page.headless.filterRoot') : t('page.headless.filterGroup')"
    data-testid="qb-group"
  >
    <div class="hl-group-head">
      <select
        :aria-label="t('page.headless.combinator')"
        :value="group.combinator"
        @change="controller.updateGroupCombinator(group.id, ($event.target as HTMLSelectElement).value as 'and' | 'or')"
      >
        <option value="and">{{ t('page.headless.combinatorAnd') }}</option>
        <option value="or">{{ t('page.headless.combinatorOr') }}</option>
      </select>
      <button
        type="button"
        @click="addRule"
        >{{ t('page.headless.addRule') }}</button
      >
      <button
        type="button"
        @click="controller.addGroup(group.id)"
        >{{ t('page.headless.addGroup') }}</button
      >
      <button
        v-if="!isRoot"
        type="button"
        :aria-label="t('page.headless.deleteGroup')"
        @click="controller.remove(group.id)"
        >{{ t('page.headless.deleteGroup') }}</button
      >
    </div>
    <ul class="hl-group-body">
      <li
        v-for="item in group.rules"
        :key="item.id"
      >
        <QueryGroup
          v-if="isRuleGroup(item)"
          :group="item"
          :controller="controller"
          :fields="fields"
          :is-root="false"
        />
        <QueryRule
          v-else
          :rule="item"
          :controller="controller"
          :fields="fields"
        />
      </li>
    </ul>
  </div>
</template>
