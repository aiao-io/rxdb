<script lang="ts" setup>
import type { ArticleCreateDraft, CommentCreateDraft, SearchDemoCollection } from '../types';

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
          新建{{ type === 'article' ? '文章' : '评论' }}
        </h2>
        <button
          class="btn btn-ghost btn-sm btn-circle"
          @click="emit('update:open', false)"
          aria-label="关闭"
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
              placeholder="标题"
              type="text"
            />
            <span>标题</span>
          </label>
          <label class="floating-label sm:col-span-2">
            <textarea
              class="textarea textarea-bordered min-h-28 w-full"
              :value="articleDraft.body"
              @input="
                emit('update:articleDraft', { ...articleDraft, body: ($event.target as HTMLTextAreaElement).value })
              "
              placeholder="正文"
            />
            <span>正文</span>
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
            <span>分类</span>
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
              placeholder="浏览数"
              type="number"
            />
            <span>浏览数</span>
          </label>
          <label class="floating-label">
            <input
              class="input input-bordered w-full"
              :value="articleDraft.authorId"
              @input="
                emit('update:articleDraft', { ...articleDraft, authorId: ($event.target as HTMLInputElement).value })
              "
              placeholder="作者 ID"
              type="text"
            />
            <span>作者 ID</span>
          </label>
          <label class="floating-label">
            <input
              class="input input-bordered w-full"
              :value="articleDraft.tagsText"
              @input="
                emit('update:articleDraft', { ...articleDraft, tagsText: ($event.target as HTMLInputElement).value })
              "
              placeholder="标签1, 标签2"
              type="text"
            />
            <span>标签（逗号分隔）</span>
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
              placeholder="文章 ID"
              type="text"
            />
            <span>文章 ID</span>
          </label>
          <label class="floating-label">
            <input
              class="input input-bordered w-full"
              :value="commentDraft.authorName"
              @input="
                emit('update:commentDraft', { ...commentDraft, authorName: ($event.target as HTMLInputElement).value })
              "
              placeholder="作者"
              type="text"
            />
            <span>作者</span>
          </label>
          <label class="floating-label">
            <textarea
              class="textarea textarea-bordered min-h-28 w-full"
              :value="commentDraft.content"
              @input="
                emit('update:commentDraft', { ...commentDraft, content: ($event.target as HTMLTextAreaElement).value })
              "
              placeholder="内容"
            />
            <span>内容</span>
          </label>
        </div>
      </template>

      <div class="modal-action">
        <button
          class="btn btn-ghost"
          @click="emit('update:open', false)"
          type="button"
        >
          取消
        </button>
        <button
          class="btn btn-primary"
          :disabled="mutationBusy || !canSubmit"
          @click="emit('submit')"
          data-testid="search-create-submit"
          type="button"
        >
          创建
        </button>
      </div>
    </div>
    <button
      class="modal-backdrop"
      @click="emit('update:open', false)"
      aria-label="关闭"
      type="button"
    />
  </div>
</template>
