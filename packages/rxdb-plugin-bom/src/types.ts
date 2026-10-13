/**
 * @fileoverview BOM 插件错误家族
 *
 * `name` 必须是字面量：`new.target.name` 会被压缩器改成单字母，判别只能靠字面量。
 * 消息前缀约定 `[rxdb-plugin-bom]`；存储层触发器的违约消息走 `rxdb:<kind>:` 前缀
 * （与 US-030 的归一约定同构），由 {@link normalizeBomError} 归一为下列类。
 */

/** BOM 插件错误基类。 */
export class BomError extends Error {
  constructor(
    message: string,
    name: string = 'BomError'
  ) {
    super(`[rxdb-plugin-bom] ${message}`);
    this.name = name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * 已发布头的写入协议违约（US-507 AC#10 / #13 / #14）。
 *
 * @remarks
 * 首轮没有 `ecn` 实体，已发布头的成员写入与已发布修订的改写全部拒绝；
 * 结构归属列（修订→物料、头→修订/类型/组织、行→头、发生项→行）创建后不可改。
 */
export class BomWriteProtocolError extends BomError {
  constructor(
    /** 违约点：列名或成员表名。 */
    readonly subject: string,
    readonly detail: string
  ) {
    super(`写入协议违约：${subject} ${detail}`, 'BomWriteProtocolError');
  }
}

/**
 * 发布转移的聚合校验失败（US-507 AC#5）。
 *
 * @remarks
 * `draft → released` 是原子的存储层校验点；首轮校验 `effective_from` 非空，
 * 位号计数等跨行聚合随 US-507 阶段 C 接入。
 */
export class BomPublishValidationError extends BomError {
  constructor(
    /** 校验点（如 `item_revision` / `bom_header`）。 */
    readonly subject: string,
    readonly detail: string
  ) {
    super(`发布校验失败：${subject} ${detail}`, 'BomPublishValidationError');
  }
}

/**
 * 十进制值合同违约（US-511 AC#23）。
 *
 * @remarks
 * 入口规范化与存储层格式触发器共用：非规范串（`1.5E-3`、`01`、`1.50`、`-0`）直连 SQL
 * 也被拒；35 位有效数字、非有限值、负值（首期）在入口拒绝，不截断、不舍入。
 */
export class BomDecimalFormatError extends BomError {
  constructor(
    /** 违约字段名。 */
    readonly field: string,
    readonly detail: string
  ) {
    super(`十进制格式违约：${field} ${detail}`, 'BomDecimalFormatError');
  }
}

/**
 * 本地适配器没有可用的 BOM 存储后端（US-030 AC#6 的插件侧口径）。
 */
export class BomBackendCapabilityError extends BomError {
  constructor(
    /** 适配器名。 */
    readonly adapterName: string,
    /** 能力缺席的具体说明（如「无写入期环约束」）。 */
    reason?: string
  ) {
    super(
      `适配器 ${adapterName} 没有可用的 BOM 存储后端${reason ? `：${reason}` : ''}（支持 sqlite 家族与 pglite）`,
      'BomBackendCapabilityError'
    );
  }
}

/**
 * 环违约（US-509）：写入期被存储层判环拒绝。
 *
 * @remarks
 * 路径是**物料级**并集图上的路径（item id 序列，首尾可能为同一物料）；自环是
 * 路径长度 0 的退化环（路径 = 单个物料）。`unionOnly` 是插件 API 层的补充标记：
 * 路径上不存在所有边同时生效的时点（保守政策的跨时段误拒），直连 SQL 被拒时
 * 只有错误码与路径，没有这个标记（有意的）。
 */
export class BomCycleError extends BomError {
  constructor(
    /** 环路径（物料 id 序列）。 */
    readonly path: string[],
    /** 是否只是并集环（路径上无边同时生效）。 */
    readonly unionOnly: boolean = false
  ) {
    super(`检测到环：${path.join(' → ')}`, 'BomCycleError');
  }
}

/**
 * BOM 实体声明同步配置（US-509 AC#12）：首轮不参与同步，配置校验即拒绝。
 */
export class BomSyncUnsupportedError extends BomError {
  constructor(
    /** 实体名。 */
    readonly entity: string
  ) {
    super(`实体 ${entity} 声明了同步配置：BOM 实体首轮不参与同步（多写入端的环约束由 US-509 的本地触发器保证）`, 'BomSyncUnsupportedError');
  }
}

/**
 * 展开 / 反查的截断原因（US-510 AC#1/#10）：深度、展开数、返回路径数任一触顶，或调用方取消。
 */
export type TruncationReason = 'depth' | 'expansions' | 'paths' | 'cancelled';

const TRUNCATION_REASON_TEXT: Record<TruncationReason, string> = {
  depth: '深度触顶',
  expansions: '展开数触顶',
  paths: '返回路径数触顶',
  cancelled: '调用方取消'
};

/**
 * 展开 / 反查结果被截断（US-510 AC#11）：截断结果不是完整结果，
 * 数量 / 成本 / 导出等消费方必须拒绝，不得把部分结果当完整结构。
 */
export class BomTruncationError extends BomError {
  constructor(
    /** 触顶的预算项。 */
    readonly reason: TruncationReason
  ) {
    super(
      `结果被截断（${reason}：${TRUNCATION_REASON_TEXT[reason]}）；截断结果不是完整结果，数量 / 成本 / 导出不得消费`,
      'BomTruncationError'
    );
  }
}

/** SQLite 触发器消息前缀：写入协议。 */
export const BOM_WRITE_PROTOCOL_PREFIX = 'rxdb:bom_write_protocol:';
/** SQLite 触发器消息前缀：发布校验。 */
export const BOM_PUBLISH_VALIDATION_PREFIX = 'rxdb:bom_publish_validation:';
/** SQLite 触发器消息前缀：十进制格式。 */
export const BOM_DECIMAL_FORMAT_PREFIX = 'rxdb:bom_decimal_format:';
/** SQLite 触发器消息前缀：判环（路径以 `>` 串起物料 id；深度上限消息无路径段）。 */
export const BOM_CYCLE_PREFIX = 'rxdb:bom_cycle:';

/**
 * 沿 `cause` 链收集消息文本（适配器包装错误把原生消息藏在内层）。
 */
const causeChainMessages = (cause: unknown): string =>
  (() => {
    const messages: string[] = [];
    let current = cause;
    while (current) {
      messages.push(current instanceof Error ? current.message : String(current));
      current = (current as { cause?: unknown }).cause;
    }
    return messages.join('\n');
  })();

/**
 * 把底层适配器错误归一为 BOM 错误类
 *
 * @param cause - 底层错误（适配器抛出的包装错误）
 * @returns 归一后的错误类；不是 BOM 触发器消息时返回 `undefined`（原样上抛）
 */
export const normalizeBomError = (cause: unknown): BomError | undefined => {
  const message = causeChainMessages(cause);
  if (message.includes(BOM_CYCLE_PREFIX)) {
    const payload = message.split(BOM_CYCLE_PREFIX)[1]?.split(/[\n']/)[0]?.trim() ?? '';
    // 深度上限消息不带路径段；真环路径以 `>` 分隔
    const path = payload.length > 0 && payload !== 'depth_limit' ? payload.split('>') : [];
    return new BomCycleError(path);
  }
  if (message.includes(BOM_DECIMAL_FORMAT_PREFIX)) {
    const field = message.split(BOM_DECIMAL_FORMAT_PREFIX)[1]?.split(/[:']/)[0] ?? 'qty';
    return new BomDecimalFormatError(field, '存储层拒绝非规范十进制串');
  }
  if (message.includes(BOM_PUBLISH_VALIDATION_PREFIX)) {
    const detail = message.split(BOM_PUBLISH_VALIDATION_PREFIX)[1]?.trim() ?? '';
    return new BomPublishValidationError('bom', detail);
  }
  if (message.includes(BOM_WRITE_PROTOCOL_PREFIX)) {
    const detail = message.split(BOM_WRITE_PROTOCOL_PREFIX)[1]?.trim() ?? '';
    return new BomWriteProtocolError('bom', detail);
  }
  return undefined;
};
