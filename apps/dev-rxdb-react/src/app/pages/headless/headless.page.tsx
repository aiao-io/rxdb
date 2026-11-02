import type { RuleGroup } from '@aiao/rxdb';
import { useEntityDialog, useEntityList } from '@aiao/rxdb-model-react/headless';
import { useRxDB } from '@aiao/rxdb-react';
import { useEffect, useMemo, useState } from 'react';
import { ArticleForm } from './article-form';
import { ArticleList } from './article-list';
import {
  PAGE_SIZE,
  createArticleSource,
  type ArticleRecord,
  type DetailData,
  type DetailResult,
  type DetailSaveResult
} from './article-model';
import { DetailDialog } from './detail-dialog';
import './headless.css';
import { QueryPanel } from './query-panel';

/**
 * Headless 实体示例页（`/headless`）。
 *
 * 只经 `@aiao/rxdb-model/headless` 与 `@aiao/rxdb-model-react/headless` 取状态和动作：
 * 表单、筛选、列表、详情与弹窗的 DOM、控件和样式都是本页自己的，不渲染任何默认组件，也不使用 Tailwind / daisyUI 类名。
 */
export default function HeadlessPage(): React.JSX.Element {
  const rxdb = useRxDB();
  const source = useMemo(() => createArticleSource(rxdb), [rxdb]);
  const [query, setQuery] = useState<RuleGroup>();

  const { controller: list, snapshot } = useEntityList<ArticleRecord>({ ...source, query, pageSize: PAGE_SIZE });
  const { controller: dialog, snapshot: dialogState } = useEntityDialog<DetailResult, DetailData>();

  // 查询 / 排序 / 分页任一变化就重新取数。快照里的 sorts 每次发布都是新数组，所以用序列化后的请求键做依赖
  const requestKey = JSON.stringify([snapshot.query, snapshot.sorts, snapshot.page, snapshot.pageSize]);
  useEffect(() => {
    // 失败已经写入 snapshot.error 并由列表展示，这里只防未处理的拒绝
    void list.refresh().catch(() => undefined);
  }, [list, requestKey]);

  const save = async ({ data, changes }: DetailSaveResult): Promise<void> => {
    const current = dialogState.data;
    if (current?.mode === 'edit') await list.update(current.record.id, changes);
    else await list.create(data);
  };
  const close = (result: DetailResult): void => {
    if (result === 'saved') dialog.resolve(result);
    else dialog.close(result);
  };

  return (
    <main className='hl-page' data-testid='headless-page'>
      <h1>Headless 实体</h1>
      <p className='hl-lead'>本页只使用 headless 入口提供的状态与动作；DOM、控件、布局和样式都是自己的。</p>
      <div className='hl-grid'>
        <ArticleForm onCreate={data => list.create(data)} />
        <QueryPanel onApply={setQuery} />
        <div className='hl-wide'>
          <div className='hl-actions'>
            <button type='button' onClick={() => dialog.open({ mode: 'create' })}>
              新建文章
            </button>
            <span role='status' data-testid='dialog-result'>
              {dialogState.result === undefined ? '' : `弹窗结果：${dialogState.result}`}
            </span>
          </div>
          <ArticleList controller={list} snapshot={snapshot} onEdit={record => dialog.open({ mode: 'edit', record })} />
        </div>
      </div>
      {dialogState.open && dialogState.data && <DetailDialog data={dialogState.data} onSave={save} onClose={close} />}
    </main>
  );
}
