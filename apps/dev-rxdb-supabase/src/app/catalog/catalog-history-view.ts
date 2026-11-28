import type { SupabaseEntityHistoryItem } from '@aiao/rxdb-adapter-supabase';

/** 一条历史里的一个字段：改之前、改之后 */
export interface HistoryFieldChange {
  readonly label: string;
  readonly before: string;
  readonly after: string;
}

/** 一条历史在界面上的样子 */
export interface HistoryEntryView {
  readonly id: number;
  readonly time: string;
  readonly who: string;
  readonly what: string;
  readonly changes: readonly HistoryFieldChange[];
}

/** 列出来给人看的商品字段，按这个顺序；簿记列（时间、创建者、分区）不列 */
const FIELD_LABELS: readonly (readonly [string, string])[] = [
  ['name', '名称'],
  ['category', '分类'],
  ['price', '售价'],
  ['cost', '成本价'],
  ['visibility', '可见范围'],
  ['tenantId', '所属租户']
];

const TYPE_LABELS: Readonly<Record<SupabaseEntityHistoryItem['type'], string>> = {
  INSERT: '新建',
  UPDATE: '修改',
  DELETE: '删除'
};

const SOURCE_LABELS: Readonly<Record<SupabaseEntityHistoryItem['source'], string>> = {
  trigger: '直接写远端',
  push: '本机推送',
  cascade: '随父行级联删除'
};

const VISIBILITY_LABELS: Readonly<Record<string, string>> = { public: '公开', tenant: '仅租户内部' };

/** 改动前的值调用者看不到：服务端只交回修改后的一侧（这件商品是从别的租户换进来的） */
const HIDDEN_BEFORE = '（看不到）';

function display(field: string, value: unknown): string {
  if (value === undefined || value === null) return '—';
  if (field === 'visibility') return VISIBILITY_LABELS[String(value)] ?? String(value);
  return String(value);
}

/**
 * 一条历史改了哪些字段：新建列出建成的值，删除列出删掉前的值，修改只列前后不一样的
 *
 * @param entry - 读取 RPC 交回的一条历史
 * @returns 按商品字段顺序排列的变化；值相同的字段不列
 *
 * @remarks
 * 修改的前像不归调用者时（`beforeData` 为 `null`），改了哪些字段看 `patch`，改之前一律显示看不到。
 */
export function historyChanges(entry: SupabaseEntityHistoryItem): HistoryFieldChange[] {
  const after = entry.afterData ?? {};
  if (entry.type === 'UPDATE' && entry.beforeData === null) {
    const patch = entry.patch ?? {};
    return FIELD_LABELS.filter(([field]) => field in patch).map(([field, label]) => ({
      label,
      before: HIDDEN_BEFORE,
      after: display(field, after[field])
    }));
  }
  const before = entry.beforeData ?? {};
  return FIELD_LABELS.flatMap(([field, label]) => {
    const previous = display(field, before[field]);
    const next = display(field, after[field]);
    return previous === next ? [] : [{ label, before: previous, after: next }];
  });
}

/**
 * 把一条历史变成界面上的一行
 *
 * @param entry - 读取 RPC 交回的一条历史
 * @param me - 当前登录身份的用户 id：是自己改的就显示「我」
 * @returns 时间、谁改的、怎么改的与改了什么
 */
export function describeHistoryEntry(entry: SupabaseEntityHistoryItem, me: string | null): HistoryEntryView {
  const who =
    entry.actor === null ? '服务端（service_role）'
    : entry.actor === me ? '我'
    : `用户 ${entry.actor.slice(0, 8)}`;
  return {
    id: entry.id,
    time: entry.createdAt.toLocaleString('zh-CN', { hour12: false }),
    who,
    what: `${TYPE_LABELS[entry.type]} · ${SOURCE_LABELS[entry.source]}`,
    changes: historyChanges(entry)
  };
}
