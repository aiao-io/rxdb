/**
 * `@aiao/rxdb-plugin-replay/testing`：只给三个框架封装包的组件测试用。
 *
 * @remarks
 * `replayerParityCases`（contracts/replayer-component.md §4）让三端 `Replayer` 组件跑同一份用例。
 *
 * @packageDocumentation
 */
export {
  MountReplayerSpy,
  replayerParityCases,
  type ReplayerHandleCall,
  type ReplayerParityCase,
  type ReplayerParityDriver,
  type ReplayerParityInputs,
  type ReplayerParityOutputs
} from './replayer-parity.js';
