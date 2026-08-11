<script lang="ts" setup>
import { getEntityStatus } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { injectRxDB } from '@aiao/rxdb-vue';
import { formatErrorMessage, useToast } from '../app/composables/useToast';
import {
  CheckboxEditorModule,
  ClientSideRowModelApiModule,
  ClientSideRowModelModule,
  ColDef,
  CustomFilterModule,
  DateFilterModule,
  GetRowIdParams,
  GridApi,
  GridOptions,
  GridReadyEvent,
  GroupFilterModule,
  HighlightChangesModule,
  ModuleRegistry,
  MultiFilterModule,
  NumberFilterModule,
  SetFilterModule,
  TextEditorModule,
  TextFilterModule,
  ValidationModule
} from 'ag-grid-enterprise';
import { AgGridVue } from 'ag-grid-vue3';
import { onUnmounted, ref, shallowRef, watch } from 'vue';
import { useAgGridTheme } from '../app/composables/useAgGridTheme';
import { useTheme } from '../app/composables/useTheme';
import { applyIncrementalGridUpdate, buildColDefs } from '../utils/ag-grid';

ModuleRegistry.registerModules([
  TextFilterModule,
  NumberFilterModule,
  DateFilterModule,
  SetFilterModule,
  MultiFilterModule,
  ClientSideRowModelApiModule,
  GroupFilterModule,
  CustomFilterModule,
  ValidationModule,
  HighlightChangesModule,
  ClientSideRowModelModule,
  TextEditorModule,
  CheckboxEditorModule
]);

const rxdb = injectRxDB();
const { currentThemeIsDark } = useTheme();

const gridApi = shallowRef<GridApi | null>(null);
const fingerprintMap = new Map<string, string>();
const todosData = ref<Todo[]>([]);
const theme = useAgGridTheme(currentThemeIsDark, gridApi);

const columnDefs = ref<ColDef<Todo>[]>(
  buildColDefs(Todo, { locale: 'zh-CN' }).map(col => {
    const field = col.field as string;
    return {
      ...col,
      editable: field !== 'id' && field !== 'createdAt' && field !== 'updatedAt'
    } as ColDef<Todo>;
  })
);
const defaultColDef = ref<ColDef<Todo>>({
  flex: 1,
  filter: true,
  sortable: true,
  enableCellChangeFlash: true
});

const gridOptions = ref<GridOptions<Todo>>({
  onCellValueChanged: event => {
    const updatedData = event.data as Todo;
    // 保存修改（RxDB 会自动检测变化并更新数据库）
    rxdb?.entityManager.save(updatedData).catch(err => {
      useToast().error(formatErrorMessage('保存 Todo 失败', err));
    });
  }
});

const getRowId = (params: GetRowIdParams<Todo>) => String(params.data.id);

const onGridReady = (params: GridReadyEvent<Todo>) => {
  gridApi.value = params.api;
};

// Data subscription
const subscription = Todo.findAll({
  where: { combinator: 'and', rules: [] },
  orderBy: [{ field: 'createdAt', sort: 'desc' }]
}).subscribe(todos => {
  todosData.value = todos;
  if (gridApi.value) {
    applyIncrementalGridUpdate(gridApi.value, todos, fingerprintMap, todo => getEntityStatus(todo).fingerprint);
  }
});

watch(gridApi, api => {
  if (api && todosData.value.length > 0) {
    applyIncrementalGridUpdate(api, todosData.value, fingerprintMap, todo => getEntityStatus(todo).fingerprint);
  }
});

onUnmounted(() => {
  subscription.unsubscribe();
});
</script>

<template>
  <div class="flex h-full w-full flex-col">
    <AgGridVue
      class="flex-1"
      :column-defs="columnDefs"
      :default-col-def="defaultColDef"
      :get-row-id="getRowId"
      :grid-options="gridOptions"
      :row-data="todosData"
      :theme="theme"
      @grid-ready="onGridReady"
      data-testid="ag-grid"
    />
  </div>
</template>
