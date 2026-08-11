<script lang="ts" setup>
import { useToast } from '../composables/useToast';

const { toasts, dismiss } = useToast();
</script>

<template>
  <div
    v-if="toasts.length > 0"
    class="toast toast-top toast-end z-50"
  >
    <div
      v-for="t in toasts"
      :key="t.id"
      class="alert cursor-pointer"
      :class="{
        'alert-error': t.type === 'error',
        'alert-success': t.type === 'success',
        'alert-info': t.type === 'info'
      }"
      role="alert"
      @click="dismiss(t.id)"
    >
      <span>{{ t.message }}</span>
    </div>
  </div>
</template>
