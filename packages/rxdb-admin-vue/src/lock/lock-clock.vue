<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef } from 'vue';
import { useAdminShell } from '../context.js';

/**
 * 锁屏上的时钟：按所选时区与语言格式化，每秒刷新。
 */
const shell = useAdminShell();
const now = shallowRef(new Date());
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  timer = setInterval(() => {
    now.value = new Date();
  }, 1000);
});

onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <p class="admin-lock-clock">{{ shell.formatDate(now, { timeStyle: 'medium' }) }}</p>
</template>
