import { getEntityStatus } from '@aiao/rxdb';
import { useRxDB } from '@aiao/rxdb-react';
import { Todo } from '@aiao/rxdb-test/entities';
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
  themeQuartz,
  ValidationModule
} from 'ag-grid-enterprise';
import { AgGridReact } from 'ag-grid-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildColDefs } from '../ag-grid/buildColDefs';
import { applyIncrementalGridUpdate } from '../ag-grid/grid-data.util';
import { useTheme } from '../hooks/useTheme';

// 注册 AG Grid 模块
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

const ag_grid_dark = themeQuartz.withParams({
  backgroundColor: 'var(--color-base-200)',
  foregroundColor: 'initial',
  browserColorScheme: 'dark'
});

export function AgGridPage() {
  const rxdb = useRxDB();
  const { currentThemeIsDark } = useTheme();
  const gridApiRef = useRef<GridApi | null>(null);
  const fingerprintMapRef = useRef(new Map<string, string>());
  const [rowData, setRowData] = useState<Todo[]>([]);

  const theme = useMemo(() => {
    return currentThemeIsDark ? ag_grid_dark : themeQuartz;
  }, [currentThemeIsDark]);

  const columnDefs = useMemo(
    () =>
      buildColDefs(Todo, {
        locale: 'zh-CN',
        formatDate: date => new Date(date).toLocaleString()
      }).map(col => {
        const field = col.field as string;
        return {
          ...col,
          editable: field !== 'id' && field !== 'createdAt' && field !== 'updatedAt'
        } as ColDef<Todo>;
      }),
    []
  );

  const defaultColDef = useMemo<ColDef>(
    () => ({
      flex: 1,
      filter: true,
      sortable: true,
      enableCellChangeFlash: true
    }),
    []
  );

  // ag-grid 需要 getRowId 来识别行，实现增量更新
  const getRowId = (params: GetRowIdParams) => String(params.data.id);

  useEffect(() => {
    const subscription = Todo.findAll({
      where: { combinator: 'and', rules: [] },
      orderBy: [
        { field: 'completed', sort: 'asc' },
        { field: 'id', sort: 'desc' }
      ]
    }).subscribe(result => {
      const gridApi = gridApiRef.current;

      // 首次加载或 gridApi 未就绪，直接设置数据
      if (!gridApi || fingerprintMapRef.current.size === 0) {
        result.forEach(r => {
          fingerprintMapRef.current.set(r.id, getEntityStatus(r).fingerprint);
        });
        setRowData(result);
        return;
      }

      // 增量更新：使用工具函数处理差异对比和事务应用
      applyIncrementalGridUpdate(gridApi, result, fingerprintMapRef.current, todo => getEntityStatus(todo).fingerprint);
    });

    return () => subscription.unsubscribe();
  }, []);

  const gridOptions = useMemo<GridOptions>(
    () => ({
      onCellValueChanged: event => {
        const updatedData = event.data as Todo;
        // 保存修改（RxDB 会自动检测变化并更新数据库）
        rxdb.entityManager.save(updatedData).catch(err => {
          console.error('Failed to save todo:', err);
        });
      }
    }),
    [rxdb]
  );

  const onGridReady = (params: GridReadyEvent<Todo>) => {
    gridApiRef.current = params.api;
  };

  return (
    <div className='flex h-full flex-col'>
      <div className='flex-1' data-testid='ag-grid'>
        <AgGridReact<Todo>
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          getRowId={getRowId}
          gridOptions={gridOptions}
          theme={theme}
          rowData={rowData}
          onGridReady={onGridReady}
        />
      </div>
    </div>
  );
}

export default AgGridPage;
