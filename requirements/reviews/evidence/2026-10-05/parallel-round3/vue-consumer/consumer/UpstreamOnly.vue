<script setup lang="ts">
import * as rxdbVue from '@aiao/rxdb-vue';
const exportNames = Object.keys(rxdbVue);
</script>

<template>
  <p>{{ exportNames.length }}</p>
</template>
