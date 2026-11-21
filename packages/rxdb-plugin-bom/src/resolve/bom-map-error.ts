/** 映射保存违约。 */
export class BomMapError extends Error {
  constructor(
    readonly subject: string,
    message: string
  ) {
    super(`[rxdb-plugin-bom] 映射违约（${subject}）：${message}`);
    this.name = 'BomMapError';
    Object.setPrototypeOf(this, BomMapError.prototype);
  }
}
