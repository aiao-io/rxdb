import { getEntityMetadata, type RuleGroup, type RxDB } from '@aiao/rxdb';
import {
  buildFormFields,
  createSchemaFromEntity,
  deriveEntityCapabilities,
  entityToFormData,
  getDefaultOperatorRegistry,
  getDefaultValueForType,
  getInputType,
  modelText,
  type DetailTab,
  type EntityFormData,
  type EntityInstance,
  type EntityListControllerOptions,
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

/** 本页只渲染单值 / 无值操作符；区间、数组、子查询操作符交给有需要的消费方自己的控件。 */
export const operatorsFor = (field: FieldMetadata | undefined): OperatorDefinition[] =>
  field ?
    getDefaultOperatorRegistry()
      .getForField(field)
      .filter(operator => operator.valueType === 'single' || operator.valueType === 'none')
  : [];
/** 操作符的展示文案：内置操作符带目录键，随应用语言翻译；自定义操作符用自带的 label。 */
export const operatorLabel = (operator: OperatorDefinition, i18n?: ModelI18n): string =>
  operator.labelKey ? modelText(operator.labelKey, undefined, i18n) : operator.label;
/** 换字段或换操作符后，规则值回到该输入类型的缺省值（文本为 ''，数值为 null）。 */
export const defaultRuleValue = (field: FieldMetadata | undefined, operator: string): unknown =>
  getDefaultValueForType(getInputType(field?.type ?? 'string', operator, field?.enum));
/** 把输入框文本还原成规则值：数值输入转 number（空文本为 null），其余保持文本。 */
export const ruleValueFromText = (inputType: string, raw: string): unknown => {
  if (inputType !== 'number') return raw;
  return raw.trim() === '' ? null : Number(raw);
};

/** 把任意拒绝原因转成可展示的文本。 */
export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** 列表行：仓储返回的实体实例，按 headless 列表的实体契约使用。 */
export type ArticleRecord = EntityInstance & { title: string; category: string; viewCount: number | null };

/** 详情弹窗的关闭结果：保存成功 / 主动取消；按 Esc 关闭按取消处理。 */
export type DetailResult = 'saved' | 'cancelled';

/** 详情弹窗打开时的数据：新建没有记录，编辑带着被点击的那一行。 */
export type DetailData = { readonly mode: 'create' } | { readonly mode: 'edit'; readonly record: ArticleRecord };

/** 详情保存时交给持久化回调的合法草稿：完整数据与相对基线的变更集。 */
export interface DetailSaveResult {
  readonly data: Record<string, unknown>;
  readonly changes: Record<string, unknown>;
}

const EMPTY_QUERY: RuleGroup = { combinator: 'and', rules: [] };

/** 创建绑定到 RxDB 实例的 Article 数据源；键名与列表控制器的选项一致，页面直接展开传入。 */
export function createArticleSource(rxdb: RxDB): EntityListControllerOptions<ArticleRecord> {
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
    async onCreate(data) {
      const article = rxdb.entityManager.instantiate(Article, data as Partial<Article>);
      return (await repository.create(article)) as unknown as ArticleRecord;
    },
    async onUpdate(record, changes) {
      return (await repository.update(record as unknown as Article, changes)) as unknown as ArticleRecord;
    },
    async onDelete(record) {
      await repository.remove(record as unknown as Article);
    }
  };
}
