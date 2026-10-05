# sqliteai 源码评审意见

**🟡，35/35文件2017行正文与C1–C5意见已交付；新增确认产品缺陷0。**

- **扩展承诺不能从包名推导**：src/index.ts只给通用SQL/adapter/client/loader；README与backup harness把vector/dbmem/FTS seed作为engine初始状态。真实capability缺失/版本差异仍须探针，不把构造成功叫AI功能齐全。
- **测试类型判别力**：execute_helper.spec.ts的bindings as never、public-api.spec.ts的RepoConstructor<never>绕过正常消费。public-contract严格NodeNext/checkJs/paths={}有价值，但仍workspace self-reference、少反例，不能称冷pack闭合。
- **发布消费边界**：testing eager glob避开lib测试import边；package.files排除__tests__且有source条件，Vite外部化comlink/rxjs/utils等。默认dist根/testing和额外source档位需要各自独立安装证据，不贸然登记缺依赖运行bug。
- **日志/模式证据边界**：测试factory默认silentPrintErr；单元用WAL命令字符串assert，而backup harness实际声明delete。保持两类证据名称，不能把mock字符串当真实VFS模式或崩溃安全证明。
- **小型文档改进**：sqliteaiLoad TSDoc40–41仍只描述OPFS patch重载，当前实现按wasmPath/opfsProxyPath/locateFile fingerprint变化重载；宜补全，功能实现不按此重写。
- **关闭拒绝清理风险**：working-tree调用点disconnectAll后才cleanup非finally；与既有共享清理判别力问题合并归属，不推断业务泄漏。
