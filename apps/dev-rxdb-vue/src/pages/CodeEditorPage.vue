<script lang="ts" setup>
import { CodeEditor } from '@aiao/code-editor-vue';
import { ref } from 'vue';
import { useTheme } from '../app/composables/useTheme';

const { currentThemeLightDark: editorTheme } = useTheme();

const DEFAULT_SQL = `CREATE TABLE IF NOT EXISTS user(
    id INTEGER PRIMARY KEY   AUTOINCREMENT,
    name           TEXT      NOT NULL
);

INSERT INTO user (name) VALUES ('Paul');
INSERT INTO user (name) VALUES ('Jimmy');

select * from user;`;

const code = ref(DEFAULT_SQL);
</script>

<template>
  <div class="h-full w-full">
    <CodeEditor
      v-model:value="code"
      :theme="editorTheme"
      data-testid="code-editor"
      language="sql"
    />
  </div>
</template>
