/** 卷算违约（缺成本、缺费率、币种不符、环、unresolved/truncated）。 */
export class BomCostError extends Error {
  constructor(
    /** 违约的头/发生项/工序标识。 */
    readonly subject: string,
    message: string
  ) {
    super(`[rxdb-plugin-bom] 成本卷算违约（${subject}）：${message}`);
    this.name = 'BomCostError';
    Object.setPrototypeOf(this, BomCostError.prototype);
  }
}
