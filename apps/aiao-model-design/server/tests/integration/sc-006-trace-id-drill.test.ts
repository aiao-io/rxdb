// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootTestServer, type TestServer } from '../fixtures/test-server';
import { writeValidationReport } from './validation-report';

/**
 * SC-006 — 5 分钟内通过 trace id 定位问题
 *
 * 对应：[validation/sc-006-trace-id-drill.md](../../../specs/006-model-gateway/validation/sc-006-trace-id-drill.md)
 *
 * 自动化模拟"非开发岗 QA"通过 x-trace-id 定位日志的流程：
 * 1. 触发一个 422（提交 unsupported 字段）
 * 2. 读响应 header x-trace-id
 * 3. 在捕获的 stderr / console.error 中 grep 该 trace_id
 * 4. 断言能直接看到 path / entry / type / status / msg
 * 5. 记录端到端耗时，写入验收文档
 */

let ts: TestServer;
const capturedLogs: string[] = [];
const originalError = console.error;

beforeAll(async () => {
  ts = await bootTestServer();
  console.error = ((...args: unknown[]) => {
    capturedLogs.push(args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    // 不再 forward 到真实 stderr，避免污染 vitest 输出
  }) as typeof console.error;
});

afterAll(() => {
  console.error = originalError;
});

interface DrillReport {
  traceId: string;
  durationMs: number;
  logLine: string | null;
  containsPath: boolean;
  containsEntry: boolean;
  containsType: boolean;
  containsStatus: boolean;
  containsMessage: boolean;
}

describe('SC-006 trace_id drill', () => {
  it('non-developer can locate provider / modality / type via x-trace-id', async () => {
    const t0 = performance.now();

    // 步骤 1: 触发 422 注入 — 用 unsupported 字段
    const res = await ts.app.handle(
      new Request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${ts.token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'mock-echo-1',
          messages: [{ role: 'user', content: 'hi' }],
          seed: 42
        })
      })
    );

    expect(res.status).toBe(422);

    // 步骤 2: 读 x-trace-id header
    const traceId = res.headers.get('x-trace-id');
    expect(traceId).toBeTruthy();
    expect(traceId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);

    // 步骤 3: 在 console.error 输出中 grep trace_id
    const matched = capturedLogs.filter(line => line.includes(traceId!));
    expect(matched.length).toBeGreaterThan(0);

    // 步骤 4: 断言日志含必要字段
    const logLine = matched[0]!;
    const report: DrillReport = {
      traceId: traceId!,
      durationMs: performance.now() - t0,
      logLine,
      containsPath: logLine.includes('path=/v1/chat/completions'),
      containsEntry: logLine.includes('entry='),
      containsType: logLine.includes('type=validation'),
      containsStatus: logLine.includes('status=422'),
      containsMessage: logLine.includes('msg=')
    };

    expect(report.containsPath).toBe(true);
    expect(report.containsEntry).toBe(true);
    expect(report.containsType).toBe(true);
    expect(report.containsStatus).toBe(true);
    expect(report.containsMessage).toBe(true);

    // 步骤 5: 5 分钟阈值（in-process 必然瞬完成）
    expect(report.durationMs).toBeLessThan(5 * 60 * 1000);

    writeDrillReport(report);
  });
});

function writeDrillReport(report: DrillReport): void {
  const lines: string[] = [
    '# SC-006 自动化排障演练结果（vitest）',
    '',
    `**执行人**：Claude Code (auto mode, ${new Date().toISOString()})`,
    `**执行环境**：vitest in-process（替代非开发岗 QA 的网络层人工流程）`,
    `**完成时长**：${report.durationMs.toFixed(2)} ms（阈值 5 分钟 / 300000 ms）`,
    `**trace_id 示例**：\`${report.traceId}\``,
    '',
    '### 日志命中行',
    '',
    '```',
    report.logLine ?? '(未命中)',
    '```',
    '',
    '### 验收项',
    '',
    `- [${report.logLine ? 'x' : ' '}] 1. 响应 header 含 \`x-trace-id\`（FR-040 + ADR D-014）`,
    `- [${report.logLine ? 'x' : ' '}] 2. 日志中 grep 到 trace_id`,
    `- [${report.containsPath && report.containsEntry && report.containsType && report.containsStatus && report.containsMessage ? 'x' : ' '}] 3. 日志含 path / entry / error type / status / message`,
    `- [${report.durationMs < 5 * 60 * 1000 ? 'x' : ' '}] 4. 端到端 ≤ 5 分钟`,
    '',
    '### 结论',
    '',
    `**SC-006**：${
      (
        report.logLine &&
        report.containsPath &&
        report.containsEntry &&
        report.containsType &&
        report.containsStatus &&
        report.containsMessage
      ) ?
        '✅ 通过'
      : '❌ 不通过'
    }`,
    '',
    '> **注**：自动化演练以 in-process 测试 server + console.error 捕获代替',
    '> "非开发岗在 stdout 中 grep" 的人工动作；网络层 + 真实 stderr',
    '> 仍建议 QA 在 staging 环境复跑一次，确认 `nx serve api 2>&1 | grep <trace>` 同样命中。',
    ''
  ];
  writeValidationReport('sc-006-trace-id-drill.md', lines.join('\n'));
}
