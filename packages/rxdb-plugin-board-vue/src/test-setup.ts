// 看板绑定测试固定 zh 宿主语言：核心运行时按 navigator.language 解析文案，
// 绑定测试的断言以 zh 为准（happy-dom 缺省 en-US）。
Object.defineProperty(globalThis.navigator, 'language', { value: 'zh-CN', configurable: true });
