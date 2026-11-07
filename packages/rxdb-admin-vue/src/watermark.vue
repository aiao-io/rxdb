<script setup lang="ts">
import { useAdminShell, useAdminStore } from './context.js';

/**
 * 水印：平铺的旋转文字覆盖层，不拦截任何交互；偏好关闭或文案为空时不渲染。
 */
const shell = useAdminShell();
const background = useAdminStore(shell.watermark);
</script>

<template>
  <div
    v-if="background !== ''"
    class="admin-watermark"
    aria-hidden="true"
    data-testid="admin-watermark"
    :style="{ backgroundImage: background }"
  />
</template>
