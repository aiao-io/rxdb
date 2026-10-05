# 官方 Angular 规范核对（2026-10-05）

工具边界：此前 get_best_practices 两次接口错误，本轮 Angular MCP 搜索 searchedVersion=22、results=[]；web.run 返回空结果。未将仅发现的 examples/angular-todo v21 当成 Nx 根。实际消费 Angular/Compiler CLI 均 22.2.1，TS 6.0.3；直接读取官方 angular.dev 页面 HTTP 200，并保存正文与摘要 SHA。

- inputs 文档：required signal input 必须由使用该组件的模板提供；缺输入由 Angular 编译器拒绝。标准 input() authoring 需要 Angular 的静态编译识别，不用手工伪造元数据。
- NG0950 文档：构造期间读未提供的 required input 会失败；ngOnInit 及之后才能保证输入已可用；响应式计算/模板/effect 可延后读取。正确父模板不能把输入供应提前到子构造器内部。
- template-typecheck 文档：strictTemplates 检查输入赋值与事件值的类型；只有正例编译通过不能证明错误模板会被拒绝。本轮因此保留 `.mts` 意外接收并用 `.ts` 实测闭合正反对照。
- components-scenarios 文档：宿主父模板绑定与直接 fixture.setInput 的测试角色不同；本轮真正编译父/子模板并通过父 signal 更新驱动四个真实 tree helper，不用 setter 替代 input.required。

来源 URL/HTTP 状态/原正文 SHA 见同目录 official-docs.json；实际原文文件见 official-*.html/.txt。
