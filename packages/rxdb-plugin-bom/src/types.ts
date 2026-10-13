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
    readonly adapterName: string
  ) {
    super(`适配器 ${adapterName} 没有可用的 BOM 存储后端（支持 sqlite 家族与 pglite）`, 'BomBackendCapabilityError');
  }
}

/** SQLite 触发器消息前缀：写入协议。 */
export const BOM_WRITE_PROTOCOL_PREFIX = 'rxdb:bom_write_protocol:';
/** SQLite 触发器消息前缀：发布校验。 */
export const BOM_PUBLISH_VALIDATION_PREFIX = 'rxdb:bom_publish_validation:';
/** SQLite 触发器消息前缀：十进制格式。 */
export const BOM_DECIMAL_FORMAT_PREFIX = 'rxdb:bom_decimal_format:';

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
