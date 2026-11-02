import { getEntityMetadata, type RuleGroup, type RxDB } from '@aiao/rxdb';
import {
  buildFormFields,
  createSchemaFromEntity,
  deriveEntityCapabilities,
  entityToFormData,
  modelText,
  type DetailTab,
  type EntityCapabilities,
  type EntityFormData,
  type EntityInstance,
  type EntityListLoadContext,
  type EntityListLoadResult,
  type FieldMetadata,
  type FormFieldConfig,
  type ModelI18n,
  type OperatorDefinition
} from '@aiao/rxdb-model/headless';
import { Article } from '@aiao/rxdb-test/entities';
import { firstValueFrom, fromEvent, takeUntil } from 'rxjs';

/** 列表每页条数：取小值，几条数据就能走完翻页。 */
export const PAGE_SIZE = 3;

/** 筛选器只暴露这几个字段，系统字段不进入示例。 */
const QUERY_FIELD_NAMES: readonly string[] = ['title', 'category', 'viewCount', 'authorId'];

const metadata = getEntityMetadata(Article);

/** 新建表单的字段（不含系统字段）。 */
export const createFields: FormFieldConfig[] = buildFormFields(metadata, 'create');
/** 编辑表单的字段（追加只读系统字段）；系统字段名随传入的运行时翻译。 */
export const buildEditFields = (i18n?: ModelI18n): FormFieldConfig[] => buildFormFields(metadata, 'edit', i18n);
/** 操作符的展示文案：内置操作符带目录键，随应用语言翻译；自定义操作符用自带的 label。 */
export const operatorLabel = (operator: OperatorDefinition, i18n?: ModelI18n): string =>
  operator.labelKey ? modelText(operator.labelKey, undefined, i18n) : operator.label;
/** 查询构建器可选字段。 */
export const queryFields: FieldMetadata[] = createSchemaFromEntity(metadata, {
  fieldFilter: field => QUERY_FIELD_NAMES.includes(field.name)
});
/**
 * 新建表单的基线：用实体构造函数实例化的草稿（与默认组件同一做法），保留实体默认值（如 `viewCount` 的 0）。
 * 控制器缺省的 `createDefaultFormData` 把未填字段置 null，直接拿去建实体会覆盖默认值并触发 NOT NULL 约束。
 */
export const createBlankArticle = (rxdb: RxDB): EntityFormData =>
  entityToFormData(rxdb.entityManager.instantiate(Article) as unknown as Record<string, unknown>, createFields);
/** 详情的两个 Tab：可编辑字段与只读系统字段。 */
export const detailTabs: DetailTab[] = [
  { key: 'basic', label: '基本信息', type: 'form' },
  { key: 'system', label: '系统字段', type: 'form' }
];

/** 列表行：仓储返回的实体实例，按 headless 列表的实体契约使用。 */
export type ArticleRecord = EntityInstance & { title: string; category: string; viewCount: number | null };

/** 详情弹窗的关闭结果：保存成功 / 主动取消；按 Esc 关闭按取消处理。 */
export type DetailResult = 'saved' | 'cancelled';

/** 详情弹窗打开时的数据：新建没有记录，编辑带着被点击的那一行。 */
export interface DetailData {
  readonly mode: 'create' | 'edit';
  readonly record?: ArticleRecord;
}

/** 详情保存时交给持久化回调的合法草稿：完整数据与相对基线的变更集。 */
export interface DetailSaveResult {
  readonly data: Record<string, unknown>;
  readonly changes: Record<string, unknown>;
}

const EMPTY_QUERY: RuleGroup = { combinator: 'and', rules: [] };

/** 示例数据源：把 headless 列表的 load / 写入回调接到 Article 仓储。 */
export interface ArticleSource {
  readonly capabilities: EntityCapabilities;
  load(context: EntityListLoadContext): Promise<EntityListLoadResult<ArticleRecord>>;
  create(data: Record<string, unknown>): Promise<ArticleRecord>;
  update(record: ArticleRecord, changes: Record<string, unknown>): Promise<ArticleRecord>;
  remove(record: ArticleRecord): Promise<void>;
}

/** 创建绑定到 RxDB 实例的 Article 数据源。 */
export function createArticleSource(rxdb: RxDB): ArticleSource {
  const repository = rxdb.entityManager.getRepository(Article);
  return {
    capabilities: deriveEntityCapabilities(metadata, { readOnly: rxdb.readOnly }),
    async load({ query, sorts, page, pageSize, signal }) {
      const where = (query ?? EMPTY_QUERY) as RuleGroup<Article>;
      const aborted = fromEvent(signal, 'abort');
      // id 兜底保证翻页时同序号的行稳定
      const orderBy = [
        ...(sorts.length > 0 ? sorts : [{ field: 'title', sort: 'asc' as const }]),
        { field: 'id', sort: 'asc' as const }
      ];
      const [records, total] = await Promise.all([
        firstValueFrom(
          repository.find({ where, orderBy, limit: pageSize, offset: page * pageSize }).pipe(takeUntil(aborted))
        ),
        firstValueFrom(repository.count({ where }).pipe(takeUntil(aborted)))
      ]);
      return { records: records as unknown as ArticleRecord[], total };
    },
    async create(data) {
      const article = rxdb.entityManager.instantiate(Article, data as Partial<Article>);
      return (await repository.create(article)) as unknown as ArticleRecord;
    },
    async update(record, changes) {
      return (await repository.update(record as unknown as Article, changes)) as unknown as ArticleRecord;
    },
    async remove(record) {
      await repository.remove(record as unknown as Article);
    }
  };
}
