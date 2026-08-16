<script lang="ts" setup>
import { useToast } from '../composables/useToast';

const { toasts, dismiss } = useToast();
</script>

<template>
  <div
    class="toast toast-top toast-end z-50"
    v-if="toasts.length > 0"
  >
    <div
      class="alert cursor-pointer"
      v-for="t in toasts"
      :class="{
        'alert-error': t.type === 'error',
        'alert-success': t.type === 'success',
        'alert-info': t.type === 'info'
      }"
      :key="t.id"
      @click="dismiss(t.id)"
      role="alert"
    >
      <span>{{ t.message }}</span>
    </div>
  </div>
</template>
