import { createFakeAlipay, FAKE_USER_DATA_PATH, type FakeAlipayOptions } from '../__tests__/fake-alipay.js';
import type { AlipayRawFileSystem } from '../alipay-api.js';
import { wrapAlipayFileSystem } from '../alipay-fs.js';
import { createAlipayMiniProgramHost } from '../official-host.js';
import { OVER_SINGLE_FILE_BYTES, OVER_SINGLE_FILE_OP, runFileSystemExperiment } from './fs-errors.js';

const DIRECTORY = `${FAKE_USER_DATA_PATH}/fs`;

/** 超过它的 base64 串算大写入：探测里只有超限写入有这么大。 */
const LARGE_WRITE_CHARS = 1024 * 1024;

type RawWrite = AlipayRawFileSystem['writeFileSync'];

/** 把平台对大写入的返回换成 `respond` 给的；`write` 是平台原本的写法。 */
function onLargeWrite(
  raw: AlipayRawFileSystem,
  respond: (write: RawWrite, path: string, base64: string) => unknown
): void {
  const write: RawWrite = raw.writeFileSync.bind(raw);
  raw.writeFileSync = (path, data, encoding) =>
    typeof data === 'string' && data.length > LARGE_WRITE_CHARS ?
      respond(write, path, data)
    : write(path, data, encoding);
}

const idleWorker = { postMessage: () => undefined, onMessage: () => undefined };

/** 经正式 host 的 FS（交给 adapter 的那一层）跑全部探测，取超限写入那条；逻辑大小 = 落盘大小 − 1 字节帧头。 */
function runOverLimit(options: FakeAlipayOptions, patch?: (raw: AlipayRawFileSystem) => void) {
  const fake = createFakeAlipay(options);
  const raw = fake.my.getFileSystemManager();
  patch?.(raw);
  // 假 `my` 每次返回同一个原始 FS，patch 对正式 host 同样生效
  const host = createAlipayMiniProgramHost(fake.my, { randomWorker: idleWorker, webAssembly: undefined });
  const framed = host.getFileSystemManager();
  if (framed === undefined) throw new Error('正式 host 没给出 FS');
  const unframed = wrapAlipayFileSystem(raw, fake.my);
  framed.mkdirSync(DIRECTORY, true);
  const logicalSize = (path: string) => unframed.statSync(path).size - 1;
  const probe = runFileSystemExperiment(framed, DIRECTORY, logicalSize).probes.find(
    item => item.op === OVER_SINGLE_FILE_OP
  );
  const leftoverFiles = [...fake.files.keys()].filter(path => path.startsWith(`${DIRECTORY}/`));
  return { probe, leftoverFiles };
}

describe(`fileSystem 探测 ${OVER_SINGLE_FILE_OP}：按 adapter VFS 的视角判`, () => {
  it('平台按文档拦下（10028）：抛错且 VFS 认成撞配额，符合预期', () => {
    const { probe } = runOverLimit({});
    expect(probe).toMatchObject({ asExpected: true, vfsSaysQuota: true, outcome: { ok: false } });
  });

  it('平台没拦（iOS 真机调试实测单文件 12 MiB 都写得进）：落盘足 11 MiB，符合预期，写完即删', () => {
    const { probe, leftoverFiles } = runOverLimit({ fileLimitBytes: Number.POSITIVE_INFINITY });
    expect(probe).toMatchObject({
      asExpected: true,
      outcome: { ok: true, value: { written: OVER_SINGLE_FILE_BYTES } }
    });
    expect(leftoverFiles).toEqual([]);
  });

  it('平台拦了，但错误 VFS 认不出是配额：不符合预期', () => {
    const { probe } = runOverLimit({}, raw =>
      onLargeWrite(raw, () => ({ errorCode: '90000', errorMessage: '内部错误' }))
    );
    expect(probe).toMatchObject({ asExpected: false, vfsSaysQuota: false, outcome: { ok: false } });
  });

  it('平台返回成功却只落盘一截：不符合预期，那一截照样删掉', () => {
    const { probe, leftoverFiles } = runOverLimit({ fileLimitBytes: Number.POSITIVE_INFINITY }, raw =>
      onLargeWrite(raw, (write, path, base64) => write(path, base64.slice(0, 1024), 'base64'))
    );
    expect(probe).toMatchObject({ asExpected: false, vfsSaysQuota: false, outcome: { ok: false } });
    expect(leftoverFiles).toEqual([]);
  });
});
