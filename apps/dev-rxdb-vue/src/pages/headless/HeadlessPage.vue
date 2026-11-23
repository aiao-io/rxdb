<script lang="ts" setup>
/**
 * Headless 实体示例页（`/headless`）。
 *
 * 只经 `@aiao/rxdb-model/headless` 与 `@aiao/rxdb-model-vue/headless` 取状态和动作：
 * 表单、筛选、列表、详情与弹窗的 DOM、控件和样式都是本页自己的，不渲染任何默认组件，也不使用 Tailwind / daisyUI 类名。
 */
import type { RuleGroup } from '@aiao/rxdb';
import { useI18n } from '@aiao/rxdb-i18n-vue';
import { useEntityDialog, useEntityList } from '@aiao/rxdb-model-vue/headless';
import { injectRxDB } from '@aiao/rxdb-vue';
import { computed, reactive, watch } from 'vue';
import ArticleForm from './ArticleForm.vue';
import ArticleList from './ArticleList.vue';
import {
  PAGE_SIZE,
  createArticleSource,
  type ArticleRecord,
  type DetailData,
  type DetailResult,
  type DetailSaveResult
} from './article-model';
import DetailDialog from './DetailDialog.vue';
import QueryPanel from './QueryPanel.vue';
import './headless.css';

const rxdb = injectRxDB()!;
const { t } = useI18n();
const source = createArticleSource(rxdb);

const options = reactive({ ...source, query: undefined as RuleGroup | undefined, pageSize: PAGE_SIZE });
const { controller: list, snapshot } = useEntityList<ArticleRecord>(options);
const { controller: dialog, snapshot: dialogState } = useEntityDialog<DetailResult, DetailData>();

// 查询 / 排序 / 分页任一变化就重新取数。快照里的 sorts 每次发布都是新数组，所以用序列化后的请求键做依赖
const requestKey = computed(() =>
  JSON.stringify([snapshot.value.query, snapshot.value.sorts, snapshot.value.page, snapshot.value.pageSize])
);
watch(
  requestKey,
  () => {
    // 失败已经写入 snapshot.error 并由列表展示，这里只防未处理的拒绝
    void list.refresh().catch(() => undefined);
  },
  { immediate: true }
);

const apply = (query: RuleGroup): void => {
  options.query = query;
};

const save = async ({ data, changes }: DetailSaveResult): Promise<void> => {
  const current = dialogState.value.data;
  if (current?.mode === 'edit') await list.update(current.record.id, changes);
  else await list.create(data);
};

const close = (result: DetailResult): void => {
  if (result === 'saved') dialog.resolve(result);
  else dialog.close(result);
};
</script>

<template>
  <main
    class="hl-page"
    data-testid="headless-page"
  >
    <h1>{{ t('page.headless.title') }}</h1>
    <p class="hl-lead">{{ t('page.headless.subtitle') }}</p>
    <div class="hl-grid">
      <ArticleForm :on-create="data => list.create(data)" />
      <QueryPanel @apply="apply" />
      <div class="hl-wide">
        <div class="hl-actions">
          <button
            type="button"
            @click="dialog.open({ mode: 'create' })"
            >{{ t('page.headless.newArticle') }}</button
          >
          <span
            role="status"
            data-testid="dialog-result"
          >
            {{ dialogState.result === undefined ? '' : t('page.headless.dialogResult', { result: dialogState.result }) }}
          </span>
        </div>
        <ArticleList
          :controller="list"
          :snapshot="snapshot"
          @edit="record => dialog.open({ mode: 'edit', record })"
        />
      </div>
    </div>
    <DetailDialog
      v-if="dialogState.open && dialogState.data"
      :data="dialogState.data"
      :on-save="save"
      @close="close"
    />
  </main>
</template>
