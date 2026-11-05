<script lang="ts" setup>
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

const addRule = (): void => {
  const [first] = props.fields;
  props.controller.addRule(props.group.id, { field: first?.name, operator: operatorsFor(first)[0]?.key });
};
</script>

<template>
  <div
    class="hl-group"
    role="group"
    :aria-label="isRoot ? '筛选条件' : '子分组'"
    data-testid="qb-group"
  >
    <div class="hl-group-head">
      <select
        aria-label="组合方式"
        :value="group.combinator"
        @change="controller.updateGroupCombinator(group.id, ($event.target as HTMLSelectElement).value as 'and' | 'or')"
      >
        <option value="and">全部满足 (AND)</option>
        <option value="or">任一满足 (OR)</option>
      </select>
      <button
        type="button"
        @click="addRule"
        >添加规则</button
      >
      <button
        type="button"
        @click="controller.addGroup(group.id)"
        >添加分组</button
      >
      <button
        v-if="!isRoot"
        type="button"
        aria-label="删除分组"
        @click="controller.remove(group.id)"
        >删除分组</button
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
