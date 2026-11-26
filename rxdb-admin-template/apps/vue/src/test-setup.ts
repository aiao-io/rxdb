// 单测环境钉死宿主语言：CI 的 happy-dom 默认 en-US，产品文案断言以 zh-CN 为准。
Object.defineProperty(navigator, 'language', { value: 'zh-CN', configurable: true });
