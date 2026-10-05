# 2026-10-05：追加10个有界收尾任务

用户要求当天完成，采用一包一任务，避免上一轮大组只扩发现、没有对象闭环。当前起点 `465f9078e9844af2cbef9936c7321a5576333a01`；新盘点全范围为50有效包 +22应用 +1desktop残留，共73对象，旧70对象/19应用清单已发现漏项并补独立文档。本文仅登记本轮追加10任务，不把73对象全部称为完成。

## 调度

同时可用子代理名额6，已滚动启动全部10个，按先完成先补位保持最多6个同时运行；10个逻辑任务都有独立scope/write set。主控做打包消费者、统一重验证和最终核销，子代理不自行启动大测试/GUI/容器。

| 任务  | 唯一对象                                                                         | 初始受控文件数 | 状态                                 |
| ----- | -------------------------------------------------------------------------------- | -------------- | ------------------------------------ |
| R2-01 | [code-editor](packages/code-editor.md)                                           | 21             | agent-delivered-validation-followups |
| R2-02 | [rxdb-plugin-tree-angular](packages/rxdb-plugin-tree-angular.md)                 | 16             | active                               |
| R2-03 | [rxdb-plugin-tree-react](packages/rxdb-plugin-tree-react.md)                     | 13             | active                               |
| R2-04 | [rxdb-plugin-tree-vue](packages/rxdb-plugin-tree-vue.md)                         | 13             | active                               |
| R2-05 | [rxdb-plugin-search-angular](packages/rxdb-plugin-search-angular.md)             | 17             | active                               |
| R2-06 | [rxdb-plugin-search-react](packages/rxdb-plugin-search-react.md)                 | 14             | agent-delivered-validation-followups |
| R2-07 | [rxdb-plugin-search-vue](packages/rxdb-plugin-search-vue.md)                     | 15             | agent-delivered-validation-followups |
| R2-08 | [rxdb-plugin-working-tree-angular](packages/rxdb-plugin-working-tree-angular.md) | 15             | active                               |
| R2-09 | [rxdb-plugin-working-tree-vue](packages/rxdb-plugin-working-tree-vue.md)         | 14             | active                               |
| R2-10 | [rxdb-plugin-replay-angular](packages/rxdb-plugin-replay-angular.md)             | 15             | active                               |

[机器调度与写范围](evidence/2026-10-05/parallel-round2/dispatch.json) · [共同任务约束](evidence/2026-10-05/parallel-round2/instructions.md) · [本轮验证](evidence/2026-10-05/parallel-round2/validation/)

## 完成口径

实际读完各自来源；每个原C有证据结论/风险/待验证所属；完整专项核销与局部子面分开，评审收尾与发布/平台能力验证分开。单测/覆盖率/入口解析不是全部场景完成，不能因日期要求抹掉设备、IME、typed consumer或生命周期缺口。已有证据复用以输入指纹/测试范围为准，不反复盲目全仓构建。

主控正在独立目录安装真实published tarball与精确现有第三方peer，补严格声明、正/负输入及运行时模块消费。离线mirror缺metadata时保留失败日志，不改workspace依赖或下载不明确新版本。发布行为从未执行，脚本全部禁用。

## 当日主控结算：十任务已全部交付，验证与发布状态分开

- 十个真实子任务均已执行、回收并关闭，scope无重叠；原153文件全文审阅，50个原C都有结论/源锚点/剩余owner。
- 当前十包fresh build退出0；真实published tar独立工作区外消费，十个根运行时导入全部退出0。严格类型消费8个正例及相应纯消费反例正确，环境明确node＋@types/ms；不含Vue tree NodeNext/readonly输入及rrweb/rrdom声明未闭合，不补历史绿。
- 九个新增probe-owner独立spec TS strict最终通过；十包当前ESLint max-warnings=0最终退出0。首次成员排序/fixture推导错误日志保留，主控仅修本轮新增tests，不改原tests/业务/依赖/index。
- Code-editor原C2及C5有完整证据，树React C4/C5、搜索React C1按其限定测量与风险分流保留；其他子面/最低真实仓储、三端/UI/设备场景未核销，不把每个phase done算成整包全部场景通过。

[机器交付汇总](evidence/2026-10-05/parallel-round2/delivery-summary.json) · [逐对象C状态](evidence/2026-10-05/parallel-round2/object-progress.json) · [十包当轮单位/覆盖率](evidence/2026-10-05/parallel-round2/validation/ten-package-unit-stdout-counts.json) · [新增spec严格类型](evidence/2026-10-05/parallel-round2/validation/new-spec-types.json)

### 环境、夹具和真实产品失败去重

搜索三端源目录实际peer core0.0.25，而当前库/插件0.0.26；原unit的getPlugins/destroy等错误不是已证明0.0.26实现故障。主控已在全0.0.26真实tar环境重做框架测试，不用tsconfig source aliases或手工修改软链。核心默认80ms刷新审计影响initial query和新句柄状态时点；ownership测试接缝明确audit0，原80ms失败与初版Root StrictMode假设保留，避免把注入接缝错误当产品问题。

修正控制条件的独立tar场景：Vue搜索6例通过；React13例12通过、1真实options presence失败；Angular13例12通过、1真实README required-input失败。Angular构建工具的npm alias在新consumer扁平覆盖中曾有magic-string工具错误，原工具链复验后真正产品断言分开。录制器新增probe边界/跨文件mock、工作树Angular输入绑定和树Angular初版required TestBed尚有未证，不注册20个“产品缺陷”。

当轮确认新增：RV-076、RV-077、RV-078，均P2。第三方rrweb/rrdom声明错误、Vue NodeNext及readonly规则型输入另记能力/环境限制，不靠skipLibCheck/any伪造consumer通过。

**今天的十任务源码评审及风险交接完成，不等于原全仓73对象全部验证/发布就绪。** 所有未证已有具体场景与主控责任，本台账未承诺未来设备/GUI结果；用户/外部正在修复别的业务代码，助手不修改这些实现或暂存区。
