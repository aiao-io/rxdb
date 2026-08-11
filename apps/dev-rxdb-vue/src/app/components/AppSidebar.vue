<script lang="ts" setup>
import {
  Cloud,
  Code,
  Database,
  Factory,
  FolderOpen,
  FolderTree,
  GitMerge,
  Grid3X3,
  House,
  Layers,
  ListTodo,
  ListTree,
  Lock,
  PanelLeftClose,
  PanelLeftDashed,
  Search
} from '@lucide/vue';
import type { Component } from 'vue';
import { RouterLink } from 'vue-router';
import { useAppService } from '../composables/useAppService';
import AppBranchManager from './AppBranchManager.vue';
import AppThemeBtn from './AppThemeBtn.vue';

interface MenuItem {
  type: 'link' | 'divider';
  title: string;
  path?: string;
  icon?: Component;
}

const menus: MenuItem[] = [
  {
    type: 'link',
    title: 'Home',
    path: '/home',
    icon: House
  },
  {
    type: 'divider',
    title: 'Todo Examples'
  },
  {
    type: 'link',
    title: 'Todo (findAll)',
    path: '/todo',
    icon: ListTodo
  },
  {
    type: 'link',
    title: 'Todo (cursor)',
    path: '/todo-cursor',
    icon: ListTodo
  },
  {
    type: 'divider',
    title: 'Workspace'
  },
  {
    type: 'link',
    title: 'Draft Recovery',
    path: '/workspace',
    icon: Layers
  },
  {
    type: 'divider',
    title: 'Tree Menu'
  },
  {
    type: 'link',
    title: 'Simple',
    path: '/menu-simple',
    icon: ListTree
  },
  {
    type: 'link',
    title: 'Virtual Scroll',
    path: '/menu-virtual',
    icon: ListTree
  },
  {
    type: 'link',
    title: 'Lazy Load',
    path: '/menu-lazy',
    icon: ListTree
  },
  {
    type: 'divider',
    title: 'File Manager'
  },
  {
    type: 'link',
    title: 'Simple',
    path: '/file-manager-simple',
    icon: FolderTree
  },
  {
    type: 'link',
    title: 'Virtual Scroll',
    path: '/file-manager-virtual',
    icon: FolderTree
  },
  {
    type: 'link',
    title: 'Lazy Load',
    path: '/file-manager-lazy',
    icon: FolderTree
  },
  {
    type: 'divider',
    title: 'Entity query'
  },
  {
    type: 'link',
    title: 'Global Search',
    path: '/search',
    icon: Search
  },
  {
    type: 'divider',
    title: 'Branch'
  },
  {
    type: 'link',
    title: 'Branch Manager',
    path: '/branch-manager',
    icon: GitMerge
  },
  {
    type: 'divider',
    title: 'Advanced'
  },
  {
    type: 'link',
    title: 'AG Grid',
    path: '/ag-grid',
    icon: Grid3X3
  },
  {
    type: 'link',
    title: 'Code Editor',
    path: '/code-editor',
    icon: Code
  },
  {
    type: 'link',
    title: 'Generator',
    path: '/generator',
    icon: Factory
  },
  {
    type: 'link',
    title: 'OPFS Manager',
    path: '/opfs',
    icon: FolderOpen
  },
  {
    type: 'link',
    title: 'Storage',
    path: '/storage',
    icon: Database
  },
  {
    type: 'link',
    title: 'Remote Cache',
    path: '/remote-cache',
    icon: Cloud
  },
  {
    type: 'divider',
    title: '安全'
  },
  {
    type: 'link',
    title: '字段加密',
    path: '/encrypted',
    icon: Lock
  }
];

const { sidebarPinned, toggleSidebar } = useAppService();
</script>

<template>
  <aside
    class="flex shrink-0 flex-col overflow-hidden transition-all duration-300 ease-in-out"
    :style="{
      width: sidebarPinned ? '240px' : '48px',
      borderRight: sidebarPinned ? 'none' : '1px solid color-mix(in oklch, var(--color-base-content), transparent 90%)'
    }"
  >
    <!-- Logo 区域 -->
    <div class="bg-base-300 flex items-center justify-between p-1">
      <div id="logo">
        <button
          class="btn btn-ghost btn-sm hover:border-transparent hover:bg-transparent"
          @click="toggleSidebar"
          aria-label="sidebar toggle"
        >
          <Database :size="16" />
          <span
            id="logo-name"
            v-if="sidebarPinned"
          >
            RxDB
          </span>
        </button>
      </div>
      <button
        class="btn btn-ghost btn-sm"
        @click="toggleSidebar"
        aria-label="sidebar toggle"
      >
        <PanelLeftClose
          v-if="sidebarPinned"
          :size="16"
        />
        <PanelLeftDashed
          v-else
          :size="16"
        />
      </button>
    </div>

    <!-- 菜单区域 -->
    <div :class="['bg-base-200 flex-1 overflow-y-auto', !sidebarPinned ? 'hide-scrollbar' : '']">
      <ul class="menu bg-base-200 rounded-box w-full p-1">
        <template
          v-for="(item, index) in menus"
          :key="index"
        >
          <li
            class="menu-title"
            v-if="item.type === 'divider'"
          >
            <span class="rxdb-menu-item">{{ item.title }}</span>
          </li>
          <li v-else>
            <RouterLink
              :to="item.path!"
              active-class="menu-active"
            >
              <component
                v-if="item.icon"
                :is="item.icon"
                :size="16"
              />
              <span class="rxdb-menu-item">{{ item.title }}</span>
            </RouterLink>
          </li>
        </template>
      </ul>
    </div>

    <!-- 底部按钮区域 -->
    <div class="bg-base-300 flex flex-col p-1">
      <div class="flex flex-row">
        <AppBranchManager v-if="sidebarPinned" />
        <div class="ml-auto flex gap-1">
          <AppThemeBtn />
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}

.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
