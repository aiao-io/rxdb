<script setup lang="ts">
import Valid from './Valid.vue';
const onSelected = (id: number): number => id;
</script>

<template>
  <Valid :root-id="1" @selected="onSelected" />
</template>
