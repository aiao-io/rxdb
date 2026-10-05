# R3-01 预注册补证边界

- 真实消费：R2 安装的公开 tar 入口；不写 consumer、manifest、lock、node_modules，不使用 workspace source aliases。
- 编译：consumer 的 Angular 22.2.1 `performCompilation`（ngc 同一编译引擎），strict=true、strictTemplates=true、skipLibCheck=false；CompilerHost 只把 evidence fixture 映射为 consumer 内的虚拟 TS 文件，裸导入仍按普通 NodeNext 公开包入口解析，物理源/输出均落在本证据目录。
- 同一份 consumer.ts 做 ngc/AOT 与仅 TS emit/JIT 对照；绝不手工给 `input.required` 伪造 inputs/isSignal 元数据。
- tree 正断言：父模板 rootId=0 真正传到 required signal；四个真实 helper 得到相同 root/level；父 signal 快切 1→2，旧 promise 不覆盖；输出事件 numeric；销毁释放 primary$ 订阅。backend 是明确的可控仓储协议接缝，不声称 move/delete/SQL 对照。
- tree 红断言：无 Angular transform 的原式 TestBed/JIT `setInput` 不识别 required signal 元数据，保留 NG0303/NG0950；此红不能证明正确模板/AOT 产品失败。
- search 红断言：AOT 父模板正确绑定 required source / required options，字段调用 useSearch 仍在绑定前 NG0950；只引用 RV-077，不重新编号。
- search 绿对照：同一真实 required source/options，在 ngOnInit 之后明确 runInInjectionContext 调用实际 useSearch；父 options 更新、真实 createSearchHandle 的受控 executor 结果、DOM Event 输入、清空、销毁释放。只是生命周期调用对照，不是业务修复，也不冲销 RV-077。
- ngc 反例：tree 缺输入/错输入/错事件分别 NG8008、TS2322、TS2345；search 缺输入/错输入/错事件每组 2 条对应诊断，退出码按真实编译结果保留。
- 不运行全量 build/test、GUI、容器；主控另外完成 PGlite 三端同 fixture 数据验证；本任务不变更 C 状态、评级或 RV/index。

## 实测后的夹具收束

初版 `.ts` 输出在 Node 运行时有 MODULE_TYPELESS_PACKAGE_JSON 警告；警告原日志保留。尝试原生 `.mts` 输出后，本 harness 的 ngc 意外接收错输入/错事件（并非 strict 参数被关闭，缺 required input 仍被 NG8008 拒绝）。因此 `.mts` 只保留为编译接缝负证据，不拿来核销模板类型。最终统一 `.ts` 严格 ngc；为不修改 manifest，将输出 JS 字节原样复制成 `.mjs`，同时登记 byteIdentical 与 SHA。这是模块格式声明，不是另一轮 transform，不改实际 required signal 元数据。ngc 与 TS-only 使用同一个 consumer.ts，对照保持同源。
