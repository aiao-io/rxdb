<script lang="ts" setup>
import { MoonStar, Palette, Sun } from '@lucide/vue';
import { useTheme } from '../composables/useTheme';

const { currentTheme, setTheme } = useTheme();

const toggleTheme = () => {
  const next =
    currentTheme.value === 'auto' ? 'dark'
    : currentTheme.value === 'dark' ? 'light'
    : 'auto';
  setTheme(next);
};
</script>

<template>
  <button
    class="btn btn-ghost btn-sm px-2"
    @click="toggleTheme"
    aria-label="theme"
  >
    <Sun
      v-if="currentTheme === 'light'"
      :size="16"
    />
    <MoonStar
      v-else-if="currentTheme === 'dark'"
      :size="16"
    />
    <Palette
      v-else
      :size="16"
    />
  </button>
</template>
