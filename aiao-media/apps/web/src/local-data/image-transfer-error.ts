/** 保留 HTTP 状态供设备队列区分临时故障、撤权和容量暂停。 */
export class ImageTransferError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}
