/** 会话层共用的协议上限；不从包入口导出。 */

/** 一帧负载的字节上限；files 协议的最大块与它相等。 */
export const MAX_P2P_FRAME_PAYLOAD = 1024 * 1024;

/** 帧元数据（JSON）的字节上限。 */
export const MAX_FRAME_METADATA = 8 * 1024;

/** 一帧的字节上限：元数据长度头 + 元数据 + 最大负载。 */
export const MAX_FRAME_SIZE = 4 + MAX_FRAME_METADATA + MAX_P2P_FRAME_PAYLOAD;

/** 协议名、方法名、拒绝原因与实例标识的字符上限。 */
export const MAX_NAME_LENGTH = 128;

/** 接收队列里至多积压的最大帧数，挡住只发不读的对端。 */
export const MAX_QUEUED_FRAMES = 8;

/**
 * WebRTC 单条消息的字节下限（含 1 字节分片头）。
 *
 * @remarks
 * 发送方的非末片总是装满一条消息，所以非末片短于它即违反协议；单帧的分片数因此不超过约一千片，
 * 对端不能用空片或碎片把重组状态撑大。
 */
export const MIN_WEBRTC_MESSAGE_SIZE = 1024;

/** 一条会话上一方至多挂着的未完成请求数；超出视为对端违反协议。 */
export const MAX_OUTSTANDING_REQUESTS = 32;

/** 每个协议同时处理的入站请求数缺省值，与 files 协议「至多缓冲 8 个块」一致。 */
export const DEFAULT_MAX_CONCURRENT_REQUESTS = 8;
