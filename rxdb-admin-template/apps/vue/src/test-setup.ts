// 单测环境钉死宿主语言：CI 的 happy-dom 默认 en-US，产品文案断言以 zh-CN 为准。
Object.defineProperty(navigator, 'language', { value: 'zh-CN', configurable: true });

// Node 26 自带实验性的全局 localStorage：没给 --localstorage-file 时读出来是 undefined，还挡住了 happy-dom 的同名全局。
// 产品代码（全局会话按本机缓存给出身份，ADMIN-US-222）用的是浏览器的 localStorage，单测里补一个内存里的 Storage。
if (typeof window !== 'undefined' && globalThis.localStorage === undefined)
  Object.defineProperty(globalThis, 'localStorage', { value: new Storage(), configurable: true, writable: true });
