<script lang="ts" setup>
import { Menu } from '@lucide/vue';
import { useAppService } from '../composables/useAppService';

const { toggleSidebar } = useAppService();
</script>

<template>
  <div
    class="flex items-center justify-between"
    id="layout-topbar"
    aria-label="Navbar"
    role="navigation"
    style="pointer-events: none"
  >
    <div class="inline-flex items-center gap-3">
      <button
        class="btn btn-ghost btn-sm pointer-events-auto md:hidden"
        @click="toggleSidebar"
        aria-label="Toggle menu"
      >
        <Menu :size="20" />
      </button>
    </div>
    <div class="hidden items-center gap-1 2xl:inline-flex">
      <!-- <AppThemeBtn class="pointer-events-auto" />
      <button
        class="btn btn-ghost btn-sm pointer-events-auto px-2"
        aria-label="devtools"
        @click="openRxdbDevtools('light')"
      >
        <Settings2 :size="16" />
      </button> -->
    </div>
  </div>
</template>
