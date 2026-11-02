<script lang="ts" setup>
import { useI18nRuntime } from '@aiao/rxdb-i18n-vue';
import { useEntityDetail } from '@aiao/rxdb-model-vue/headless';
import { injectRxDB } from '@aiao/rxdb-vue';
import { computed, markRaw, onBeforeUnmount, onMounted, reactive, useTemplateRef } from 'vue';
import {
  buildEditFields,
  createBlankArticle,
  createFields,
  detailTabs,
  type DetailData,
  type DetailResult,
  type DetailSaveResult
} from './article-model';
import FieldRow from './FieldRow.vue';
import { useFieldInputs } from './field-inputs';

const props = defineProps<{
  data: DetailData;
  onSave: (result: DetailSaveResult) => Promise<void>;
}>();
const emit = defineEmits<{ close: [result: DetailResult] }>();

/**
 * 自有弹窗外壳 + 详情控制器：草稿、Tab、保存与取消来自 `useEntityDetail`，
 * 焦点约束交给原生 `<dialog>.showModal()`，关闭后的焦点恢复由本组件自己接线。
 */
const creating = props.data.mode === 'create';
// 弹窗每次打开都是新实例：系统字段名按打开时的应用语言翻译，新建的基线来自实例化的草稿；
// 运行时是带私有状态的类实例，放进 reactive 前要 markRaw
const i18n = useI18nRuntime();
const options = reactive({
  fields: creating ? createFields : buildEditFields(i18n),
  mode: props.data.mode,
  tabs: creating ? detailTabs.slice(0, 1) : detailTabs,
  i18n: i18n && markRaw(i18n),
  ...(creating ? { data: createBlankArticle(injectRxDB()!) } : { entity: props.data.record })
});
const { controller, snapshot } = useEntityDetail(options);
const inputs = useFieldInputs(controller.form);
const dialogRef = useTemplateRef<HTMLDialogElement>('dialog');

let opener: HTMLElement | null = null;
onMounted(() => {
  // 弹窗随组件卸载，浏览器不会替我们把焦点还给打开它的元素：自己记下并在关闭时恢复
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dialogRef.value?.showModal();
});
onBeforeUnmount(() => {
  dialogRef.value?.close();
  opener?.focus();
});

const basicStates = computed(() => snapshot.value.form.fieldStates.filter(state => !state.readonly));
const systemStates = computed(() => snapshot.value.form.fieldStates.filter(state => state.readonly));
const errorText = computed(() => {
  const error = snapshot.value.error;
  if (error === null) return null;
  return error instanceof Error ? error.message : String(error);
});

const save = async (): Promise<void> => {
  inputs.markAttempted();
  try {
    const result = await controller.save(props.onSave);
    if (result.valid) emit('close', 'saved');
  } catch {
    // 失败原因已在 snapshot.error 暴露，弹窗保持打开让用户修正
  }
};

const cancel = (): void => {
  controller.cancel();
  emit('close', 'cancelled');
};
</script>

<template>
  <dialog ref="dialog" class="hl-dialog" aria-labelledby="hl-dialog-title" data-testid="detail-dialog" @cancel.prevent="cancel">
    <form novalidate @submit.prevent="save">
      <h2 id="hl-dialog-title">{{ creating ? '新建文章' : '编辑文章' }}</h2>
      <div role="tablist" aria-label="详情分区" class="hl-tabs">
        <button
          v-for="tab in snapshot.tabs"
          :id="`hl-tab-${tab.key}`"
          :key="tab.key"
          type="button"
          role="tab"
          :aria-selected="tab.key === snapshot.activeTab"
          :aria-controls="`hl-panel-${tab.key}`"
          @click="controller.selectTab(tab.key)"
        >
          {{ tab.label }}
        </button>
      </div>
      <div role="tabpanel" :id="`hl-panel-${snapshot.activeTab}`" :aria-labelledby="`hl-tab-${snapshot.activeTab}`">
        <template v-if="snapshot.activeTab === 'basic'">
          <FieldRow
            v-for="state in basicStates"
            :key="state.config.field"
            id-prefix="hl-detail"
            :state="state"
            :inputs="inputs"
          />
        </template>
        <dl v-if="snapshot.activeTab === 'system'" class="hl-system">
          <div v-for="state in systemStates" :key="state.config.field">
            <dt>{{ state.config.displayName }}</dt>
            <dd :data-testid="`system-${state.config.field}`">{{ state.displayValue }}</dd>
          </div>
        </dl>
      </div>
      <p v-if="errorText !== null" class="hl-error" role="alert" data-testid="detail-error">{{ errorText }}</p>
      <div class="hl-actions">
        <button type="submit" :disabled="snapshot.saving">保存</button>
        <button type="button" @click="cancel">取消</button>
      </div>
    </form>
  </dialog>
</template>
