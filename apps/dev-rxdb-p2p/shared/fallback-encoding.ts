/** 密文回退（POOL-US-101）的线上契约：客户端取密文副本时携带，服务端据此拒绝旧客户端。 */

/** 客户端 GET / HEAD `/api/files/enc/:hash` 时携带的编码头。 */
export const FALLBACK_ENCODING_HEADER = 'x-pool-fallback-encoding';
/** 当前编码版本；服务端只认这一个值。 */
export const FALLBACK_ENCODING_VERSION = '1';
