<script lang="ts" setup>
import { useI18nRuntime } from '@aiao/rxdb-i18n-vue';
import { useEntityForm } from '@aiao/rxdb-model-vue/headless';
import { injectRxDB } from '@aiao/rxdb-vue';
import { ref } from 'vue';
import { createBlankArticle, createFields, errorMessage } from './article-model';
import FieldRow from './FieldRow.vue';
import { fieldId, useFieldInputs } from './field-inputs';

const props = defineProps<{ onCreate: (data: Record<string, unknown>) => Promise<unknown> }>();

/** 新建文章表单：字段、校验与提交都来自 `useEntityForm`，控件与布局是本页自己的；校验文案用应用的 i18n 运行时。 */
const options = {
  fields: createFields,
  data: createBlankArticle(injectRxDB()!),
  mode: 'create' as const,
  i18n: useI18nRuntime()
};
const { controller, snapshot } = useEntityForm(options);
const inputs = useFieldInputs(controller);
const failure = ref<string | null>(null);

const submit = async (): Promise<void> => {
  inputs.markAttempted();
  const result = controller.submit();
  if (!result.valid) {
    const [first] = result.result.errors;
    if (first) document.getElementById(fieldId('hl-form', first.field))?.focus();
    return;
  }
  try {
    await props.onCreate(result.data);
    failure.value = null;
    controller.cancel();
  } catch (error) {
    failure.value = errorMessage(error);
  }
};
</script>

<template>
  <section
    class="hl-section"
    aria-labelledby="hl-form-title"
    data-testid="headless-form"
  >
    <h2 id="hl-form-title">新建文章</h2>
    <form
      novalidate
      aria-labelledby="hl-form-title"
      @submit.prevent="submit"
    >
      <FieldRow
        v-for="state in snapshot.fieldStates"
        :key="state.config.field"
        id-prefix="hl-form"
        :state="state"
        :inputs="inputs"
      />
      <div class="hl-actions">
        <button type="submit">提交</button>
        <button
          type="button"
          @click="controller.cancel()"
          >取消</button
        >
      </div>
      <p
        role="status"
        data-testid="form-state"
        >{{ snapshot.dirty ? '有未提交的修改' : '没有修改' }}</p
      >
      <p
        v-if="failure"
        class="hl-error"
        role="alert"
        data-testid="form-failure"
        >{{ failure }}</p
      >
    </form>
  </section>
</template>
