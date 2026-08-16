<script lang="ts" setup>
import type { Article, Comment } from '@aiao/rxdb-test/entities';
import type { SearchDemoCollection } from '../types';

defineProps<{
  collapsed: boolean;
  activeTab: SearchDemoCollection;
  articleRecords: readonly Article[];
  commentRecords: readonly Comment[];
  mutationBusy: boolean;
  mutationMessage: string | null;
}>();

const emit = defineEmits<{
  (e: 'update:collapsed', value: boolean): void;
  (e: 'update:activeTab', tab: SearchDemoCollection): void;
  (e: 'open-create', type: SearchDemoCollection): void;
  (e: 'remove-article', id: string): void;
  (e: 'remove-comment', id: string): void;
}>();
</script>

<template>
  <section
    class="card bg-base-200/60"
    data-testid="search-records-panel"
  >
    <button
      class="flex w-full items-center justify-between gap-2 p-3 text-left"
      :aria-expanded="!collapsed"
      @click="emit('update:collapsed', !collapsed)"
      data-testid="search-records-toggle"
      type="button"
    >
      <span class="flex items-center gap-2 text-sm font-medium">
        <svg
          :class="`transition-transform${!collapsed ? 'rotate-90' : ''}`"
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
          <path d="m9 18 6-6-6-6" />
        </svg>
        数据记录
        <span class="text-base-content/60 text-xs font-normal">
          文章 {{ articleRecords.length }} · 评论 {{ commentRecords.length }}
        </span>
      </span>
    </button>

    <div
      class="px-3 pb-3"
      v-if="!collapsed"
    >
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          class="tabs tabs-border w-full sm:w-auto"
          role="tablist"
        >
          <button
            v-for="tab in ['article', 'comment'] as const"
            :aria-selected="activeTab === tab"
            :class="`tab text-base-content${activeTab === tab ? 'tab-active' : ''}`"
            :data-testid="`search-tab-${tab}`"
            :key="tab"
            @click="emit('update:activeTab', tab)"
            role="tab"
            type="button"
          >
            {{ tab === 'article' ? '文章' : '评论' }}
            ({{ tab === 'article' ? articleRecords.length : commentRecords.length }})
          </button>
        </div>
        <button
          class="btn btn-sm btn-primary gap-1 self-start sm:self-center"
          :aria-label="`新建${activeTab === 'article' ? '文章' : '评论'}`"
          :data-testid="activeTab === 'article' ? 'search-create-article' : 'search-create-comment'"
          :disabled="mutationBusy"
          @click="emit('open-create', activeTab)"
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
            <path d="M5 12h14" />
            <path d="M12 5v14" />
          </svg>
          新建{{ activeTab === 'article' ? '文章' : '评论' }}
        </button>
      </div>

      <template v-if="activeTab === 'article'">
        <p
          class="text-base-content/60 mt-3 text-sm italic"
          v-if="articleRecords.length === 0"
        >
          暂无文章
        </p>
        <ul
          class="divide-base-300 rounded-box bg-base-100 mt-3 max-h-96 divide-y overflow-y-auto"
          v-else
        >
          <li
            class="flex items-start justify-between gap-3 px-4 py-3"
            v-for="article in articleRecords"
            :data-testid="`search-record-article-${article.id}`"
            :key="article.id"
          >
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-medium">{{ article.title }}</span>
                <span class="badge badge-primary badge-sm">{{ article.category }}</span>
                <span class="text-base-content/80 text-xs">#{{ article.id }}</span>
              </div>
              <p class="text-base-content/80 mt-1 text-sm">{{ article.body }}</p>
              <div class="mt-2 flex flex-wrap gap-1">
                <span
                  class="badge badge-outline badge-xs"
                  v-for="tag in article.tags"
                  :key="tag"
                  >{{ tag }}</span
                >
              </div>
              <p class="text-base-content/80 mt-2 text-xs">{{ article.authorId }} · {{ article.viewCount }} 次浏览</p>
            </div>
            <button
              class="btn btn-xs btn-ghost text-error"
              :data-testid="`search-delete-article-${article.id}`"
              :disabled="mutationBusy"
              @click="emit('remove-article', String(article.id))"
              type="button"
            >
              删除
            </button>
          </li>
        </ul>
      </template>
      <template v-else>
        <p
          class="text-base-content/60 mt-3 text-sm italic"
          v-if="commentRecords.length === 0"
        >
          暂无评论
        </p>
        <ul
          class="divide-base-300 rounded-box bg-base-100 mt-3 max-h-96 divide-y overflow-y-auto"
          v-else
        >
          <li
            class="flex items-start justify-between gap-3 px-4 py-3"
            v-for="comment in commentRecords"
            :data-testid="`search-record-comment-${comment.id}`"
            :key="comment.id"
          >
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-medium">{{ comment.authorName }}</span>
                <span class="text-base-content/80 text-xs">文章 {{ comment.articleId }}</span>
                <span class="text-base-content/80 text-xs">#{{ comment.id }}</span>
              </div>
              <p class="text-base-content/80 mt-1 text-sm">{{ comment.content }}</p>
            </div>
            <button
              class="btn btn-xs btn-ghost text-error"
              :data-testid="`search-delete-comment-${comment.id}`"
              :disabled="mutationBusy"
              @click="emit('remove-comment', String(comment.id))"
              type="button"
            >
              删除
            </button>
          </li>
        </ul>
      </template>

      <p
        class="text-base-content/70 mt-3 text-xs"
        v-if="mutationMessage"
        data-testid="search-mutation-message"
        role="status"
      >
        {{ mutationMessage }}
      </p>
    </div>
  </section>
</template>
