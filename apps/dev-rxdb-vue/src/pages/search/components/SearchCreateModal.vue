<script lang="ts" setup>
import { useI18n } from '@aiao/rxdb-i18n-vue';
import type { ArticleCreateDraft, CommentCreateDraft, SearchDemoCollection } from '../types';

const { t } = useI18n();

defineProps<{
  open: boolean;
  type: SearchDemoCollection;
  articleDraft: ArticleCreateDraft;
  commentDraft: CommentCreateDraft;
  mutationBusy: boolean;
  canSubmit: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'update:articleDraft', draft: ArticleCreateDraft): void;
  (e: 'update:commentDraft', draft: CommentCreateDraft): void;
  (e: 'submit'): void;
}>();
</script>

<template>
  <div
    class="modal modal-open"
    v-if="open"
    @keydown.ctrl.enter="emit('submit')"
    @keydown.esc="emit('update:open', false)"
    @keydown.meta.enter="emit('submit')"
    data-testid="search-create-modal"
    tabindex="-1"
  >
    <div
      class="modal-box max-w-2xl"
      aria-labelledby="search-create-title"
      aria-modal="true"
      role="dialog"
    >
      <div class="flex items-start justify-between gap-3">
        <h2
          class="text-lg font-semibold"
          id="search-create-title"
        >
          {{ type === 'article' ? t('page.search.createArticle') : t('page.search.createComment') }}
        </h2>
        <button
          class="btn btn-ghost btn-sm btn-circle"
          @click="emit('update:open', false)"
          :aria-label="t('common.close')"
          type="button"
        >
          <svg
            fill="none"
            height="14"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            viewBox="0 0 24 24"
            width="14"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      <template v-if="type === 'article'">
        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <label class="floating-label sm:col-span-2">
            <input
              class="input input-bordered w-full"
              :value="articleDraft.title"
              @input="
                emit('update:articleDraft', { ...articleDraft, title: ($event.target as HTMLInputElement).value })
              "
              autofocus
              :placeholder="t('page.search.titleField')"
              type="text"
            />
            <span>{{ t('page.search.titleField') }}</span>
          </label>
          <label class="floating-label sm:col-span-2">
            <textarea
              class="textarea textarea-bordered min-h-28 w-full"
              :value="articleDraft.body"
              @input="
                emit('update:articleDraft', { ...articleDraft, body: ($event.target as HTMLTextAreaElement).value })
              "
              :placeholder="t('page.search.bodyField')"
            />
            <span>{{ t('page.search.bodyField') }}</span>
          </label>
          <label class="floating-label">
            <select
              class="select select-bordered w-full"
              :value="articleDraft.category"
              @change="
                emit('update:articleDraft', {
                  ...articleDraft,
                  category: ($event.target as HTMLSelectElement).value as ArticleCreateDraft['category']
                })
              "
            >
              <option value="tech">tech</option>
              <option value="life">life</option>
              <option value="travel">travel</option>
            </select>
            <span>{{ t('page.search.categoryField') }}</span>
          </label>
          <label class="floating-label">
            <input
              class="input input-bordered w-full"
              :value="articleDraft.viewCount"
              @input="
                emit('update:articleDraft', {
                  ...articleDraft,
                  viewCount: Number(($event.target as HTMLInputElement).value) || 0
                })
              "
              :placeholder="t('page.search.viewsField')"
              type="number"
            />
            <span>{{ t('page.search.viewsField') }}</span>
          </label>
          <label class="floating-label">
            <input
              class="input input-bordered w-full"
              :value="articleDraft.authorId"
              @input="
                emit('update:articleDraft', { ...articleDraft, authorId: ($event.target as HTMLInputElement).value })
              "
              :placeholder="t('page.search.authorIdField')"
              type="text"
            />
            <span>{{ t('page.search.authorIdField') }}</span>
          </label>
          <label class="floating-label">
            <input
              class="input input-bordered w-full"
              :value="articleDraft.tagsText"
              @input="
                emit('update:articleDraft', { ...articleDraft, tagsText: ($event.target as HTMLInputElement).value })
              "
              :placeholder="t('page.search.tagsPlaceholder')"
              type="text"
            />
            <span>{{ t('page.search.tagsField') }}</span>
          </label>
        </div>
      </template>
      <template v-else>
        <div class="mt-4 grid gap-3">
          <label class="floating-label">
            <input
              class="input input-bordered w-full"
              :value="commentDraft.articleId"
              @input="
                emit('update:commentDraft', { ...commentDraft, articleId: ($event.target as HTMLInputElement).value })
              "
              autofocus
              :placeholder="t('page.search.articleIdField')"
              type="text"
            />
            <span>{{ t('page.search.articleIdField') }}</span>
          </label>
          <label class="floating-label">
            <input
              class="input input-bordered w-full"
              :value="commentDraft.authorName"
              @input="
                emit('update:commentDraft', { ...commentDraft, authorName: ($event.target as HTMLInputElement).value })
              "
              :placeholder="t('page.search.authorField')"
              type="text"
            />
            <span>{{ t('page.search.authorField') }}</span>
          </label>
          <label class="floating-label">
            <textarea
              class="textarea textarea-bordered min-h-28 w-full"
              :value="commentDraft.content"
              @input="
                emit('update:commentDraft', { ...commentDraft, content: ($event.target as HTMLTextAreaElement).value })
              "
              :placeholder="t('page.search.contentField')"
            />
            <span>{{ t('page.search.contentField') }}</span>
          </label>
        </div>
      </template>

      <div class="modal-action">
        <button
          class="btn btn-ghost"
          @click="emit('update:open', false)"
          type="button"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          class="btn btn-primary"
          :disabled="mutationBusy || !canSubmit"
          @click="emit('submit')"
          data-testid="search-create-submit"
          type="button"
        >
          {{ t('common.create') }}
        </button>
      </div>
    </div>
    <button
      class="modal-backdrop"
      @click="emit('update:open', false)"
      :aria-label="t('common.close')"
      type="button"
    />
  </div>
</template>
