import { runDevToolsControlPlaneSuite } from '../../testing/control-plane.suite.js';
import { runDevToolsDataPlaneSuite } from '../../testing/data-plane.suite.js';
import { createFakeEndpointFactory } from '../../testing/fake-endpoints.js';
import { createJsonConformanceDriver } from '../../testing/json-driver.js';

// 内存 driver 是 US-904 阶段 C / D 与 US-905 的对照组：同一份 suite 先在这里跑绿，
// 下游再用薄 driver 在真实 Port / IPC / invoke 上复跑，判据一字不改。
const driver = createJsonConformanceDriver(createFakeEndpointFactory());

runDevToolsControlPlaneSuite(driver);
runDevToolsDataPlaneSuite(driver);
