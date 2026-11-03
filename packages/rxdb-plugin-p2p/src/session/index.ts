/** 会话层：一对设备一条会话，多个协议在会话上复用；不认识文件、清单这些上层概念。 */

export { P2PRequestError, P2PSessionClosedError, type P2PSessionCloseCode } from './errors.js';
export * from './frame.js';
export * from './identity.js';
export * from './registry.js';
export * from './session.js';
export * from './tcp-transport.js';
export * from './webrtc-transport.js';
