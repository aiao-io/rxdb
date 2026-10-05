<script setup lang="ts">
import Valid from './Valid.vue';
const onSelected = (id: string): string => id;
</script>

<template>
  <Valid root-id="wrong" @selected="onSelected" />
</template>
