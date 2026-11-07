<script setup lang="ts">
import { computed } from 'vue';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';

/**
 * 页脚：版权信息与备案号；布局不显示页脚时不渲染。
 */
const shell = useAdminShell();
const t = useAdminText();
const layout = useAdminStore(shell.layout);
const prefs = useAdminStore(shell.preferences);

const copyright = computed(() => {
  const { date, companyName } = prefs.value.copyright;
  return t('layout.copyright', { year: date, company: companyName || shell.brandTitle });
});
</script>

<template>
  <footer
    v-if="layout.showFooter"
    class="admin-footer"
    :data-fixed="layout.footerFixed"
    data-testid="admin-footer"
  >
    <span v-if="prefs.copyright.enable">
      <a
        v-if="prefs.copyright.companySiteLink"
        class="link link-hover"
        :href="prefs.copyright.companySiteLink"
        target="_blank"
        rel="noopener noreferrer"
        >{{ copyright }}</a
      >
      <template v-else>{{ copyright }}</template>
    </span>
    <a
      v-if="prefs.copyright.enable && prefs.copyright.icp"
      class="link link-hover"
      :href="prefs.copyright.icpLink || prefs.copyright.companySiteLink || undefined"
      target="_blank"
      rel="noopener noreferrer"
      >{{ prefs.copyright.icp }}</a
    >
  </footer>
</template>
