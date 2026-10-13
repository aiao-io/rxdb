/**
 * @fileoverview FR-038 两条用例线共用的「带加密列的实体」夹具。
 *
 * @remarks
 * 两条线验的是同一道边界的两端：`commit-codec.spec.ts` 验断言本身判得对不对，
 * `commit-encrypted-at-rest-wiring.spec.ts` 验写路径到底有没有调用它。各自抄一份
 * `encryptedPropertyMap` 的话，「加了加密列却忘了同步另一份」会让其中一条线永远绿——
 * 而那条线恰好是负责证明检查真的在跑的那条。
 *
 * 这里造的是**元数据**而不是 `@Entity` 类：`@aiao/rxdb-adapter-encrypted` 的
 * `@Encrypted()` 装饰器住在加密包里，而本包不依赖它（依赖方向见 `commit-codec.ts`
 * 的 fileoverview）。手写元数据是本包能表达「这一列是加密列」的唯一形态。
 */

import type { EntityMetadata, EntityPropertyMetadata } from '@aiao/rxdb';
import { PropertyType } from '@aiao/rxdb';
import type { CommitEncryptedAtRestRecognizer, CommitPatchCodecContext } from '../../../commit/commit-codec.js';

/** 只应存在于**加密前**那个值里的串；它出现在库里、错误里、日志里都是泄漏。 */
export const SENTINEL = 'PLAINTEXT-SENTINEL-7b1e4d';

/** 一段形如 `v|alg|kid|iv|ct|tag` 的信封串——加密列落库就长这样。 */
export const ENVELOPE = 'v1|A256GCM|kid-1|3q2-7w|3q2-78A|f39_AA';

/** 裸密文字节：codec 不碰加密列，所以它能一路走到落库那一步而不报任何错。 */
export const RAW_CIPHERTEXT = Uint8Array.of(0xde, 0xad, 0xbe, 0xef);

/**
 * `@aiao/rxdb-adapter-encrypted` 的 `isEnvelope` 在本包内的替身。
 *
 * @remarks
 * 判定口径刻意写得比真品松（只看分段数与版本前缀）：用例要证明的是
 * 「判定器被调用、结论被采纳」，不是「判定器判得准」——后者是加密包自己的单测。
 */
export const isEnvelopeLike: CommitEncryptedAtRestRecognizer = value =>
  typeof value === 'string' && value.startsWith('v1|') && value.split('|').length === 6;

/** {@link createMetadata} 的一项属性声明。 */
export interface PropertyInit {
  readonly name: string;
  readonly type: PropertyType;
  readonly encrypted?: boolean;
  readonly primary?: boolean;
}

/**
 * 造一份最小可用的实体元数据。
 *
 * @remarks
 * `encryptedPropertyMap` 由 `propertyMap` 现推，而不是两处各写一份——真实元数据里它也是
 * `entity/metadata-transition.ts` 推出来的派生值，fixture 手写两份就会在「加了加密列却忘了
 * 同步那张表」时给出一个真实代码不可能出现的组合。
 */
export const createMetadata = (name: string, properties: readonly PropertyInit[]): EntityMetadata => {
  const propertyMap = new Map<string, EntityPropertyMetadata>();
  const encryptedPropertyMap = new Map<string, EntityPropertyMetadata>();
  for (const init of properties) {
    const property = { columnName: init.name, ...init } as unknown as EntityPropertyMetadata;
    propertyMap.set(init.name, property);
    if (init.encrypted === true) encryptedPropertyMap.set(init.name, property);
  }
  return { namespace: 'app', name, propertyMap, encryptedPropertyMap } as unknown as EntityMetadata;
};

/** 带两个加密列（一个 binary、一个 string）、一个普通 binary 列与一个普通 string 列。 */
export const secretMetadata = createMetadata('Secret', [
  { name: 'id', type: PropertyType.string, primary: true },
  { name: 'title', type: PropertyType.string },
  { name: 'blob', type: PropertyType.binary },
  { name: 'secret', type: PropertyType.binary, encrypted: true },
  { name: 'note', type: PropertyType.string, encrypted: true }
]);

/** 一个加密列都没有的实体。 */
export const plainMetadata = createMetadata('Plain', [
  { name: 'id', type: PropertyType.string, primary: true },
  { name: 'title', type: PropertyType.string },
  { name: 'amount', type: PropertyType.bigint }
]);

const registry = new Map<string, EntityMetadata>([
  ['app.Secret', secretMetadata],
  ['app.Plain', plainMetadata]
]);

/** 与 `SchemaManager.getEntityMetadata()` 同签名；`app.Ghost` 一律解析不到。 */
export const resolveTargetMetadata = (entity: string, namespace: string): EntityMetadata | undefined =>
  registry.get(`${namespace}.${entity}`);

/**
 * 造一份 codec 上下文。
 *
 * @param isEncryptedAtRest - at-rest 判定器；**省略即模拟「适配器没有这个能力」**
 * @returns 见 {@link CommitPatchCodecContext}
 *
 * @remarks
 * 省略时刻意不写 `isEncryptedAtRest: undefined` 而是整个键都不出现：真实缺席来自
 * `createCommitWriteContext` 对一个没实现该槽位的适配器求值，两种形态在
 * `assertColumnEncryptedAtRest` 眼里等价，但只有「键不存在」能同时证明断言没有偷偷
 * 依赖键的存在性。
 */
export const codecWith = (isEncryptedAtRest?: CommitEncryptedAtRestRecognizer): CommitPatchCodecContext =>
  isEncryptedAtRest ? { resolveTargetMetadata, isEncryptedAtRest } : { resolveTargetMetadata };
