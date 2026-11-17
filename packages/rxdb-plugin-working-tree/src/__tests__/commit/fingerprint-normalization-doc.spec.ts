/**
 * @fileoverview US-316：插件文档「内容指纹的规范化规则」一节的示例，与实现算出的逐字相同。
 *
 * @remarks
 * 导入远端提交时，首个使用方的服务端要按文档写下的规则**自己**复算指纹，不调用本包——它跑在另一种语言、另一个进程里。
 * 于是文档里的那段规则就是契约本身：规则写错一个字（长度按字节还是按 UTF-16 码元、键怎么排、数字怎么写），
 * 服务端算出的指纹就与客户端的对不上，每一次导入都落在 `fingerprint_mismatch` 上，而两边各自的单测都是绿的。
 *
 * 所以这里做两件事：照文档的规则**手拼**规范串、用 Web Crypto 直接算 SHA-256（不经实现），得到的就是文档里写着的那两个摘要；
 * 实现必须算出同一个值。文档（`website/docs/plugins/rxdb-plugin-working-tree/README.md`「内容指纹的规范化规则」）
 * 逐字抄着本文件的两段规范串与两个摘要：改规则或示例时两处一起改。不在这里 `?raw` 读那份文档——
 * 那会让本包在项目图上依赖 website，TypeScript 项目引用的同步检查随即要求本包引用 website 的 tsconfig。
 */

import { describe, expect, it } from 'vitest';
import type { CommitChangeUnitContent } from '../../commit/change-unit.js';
import { computeChangeUnitFingerprint, computeCommitContentFingerprint } from '../../commit/change-unit.js';

/** 文档示例里那一个单元。 */
const UNIT: CommitChangeUnitContent = {
  unitId: 'u1',
  transactionId: null,
  namespace: 'public',
  entity: 'Task',
  entityId: 't1',
  operation: 'insert',
  patch: { title: '草稿', done: false, n: 1.5 },
  inversePatch: null,
  origin: 'local'
};

/** 照文档规则手拼的单元规范串。 */
const UNIT_PAYLOAD = 's2:u1zs6:publics4:Tasks2:t1s6:inserto3:k4:doneb0k1:nd3:1.5k5:titles2:草稿zs5:local';

/** 文档里写着的单元摘要。 */
const UNIT_FINGERPRINT = '613a8d5cca23db9957f32007b498b1f864ef8d840fd14e0d5e60f95e4a5132a2';

/** 照文档规则手拼的提交规范串。 */
const COMMIT_PAYLOAD = `s6:normalp1:s2:p1s4:新建任务s5:aliceu1:f64:${UNIT_FINGERPRINT}`;

/** 文档里写着的提交摘要。 */
const COMMIT_FINGERPRINT = 'b70f7d4cd7d8bf73ee6853947958f79dedf7501be7c6b152777239710bd4bf54';

/** 不经实现，直接用 Web Crypto 算「域串 + 空格 + 规范串」的 UTF-8 字节的 SHA-256。 */
const digestOf = async (domain: string, payload: string): Promise<string> => {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${domain} ${payload}`)));
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
};

describe('内容指纹的规范化规则（插件文档）', () => {
  it('文档示例：手拼规范串直接算出的摘要，就是文档写着的那两个', async () => {
    expect(await digestOf('rxdb.commit.change-unit.v1', UNIT_PAYLOAD)).toBe(UNIT_FINGERPRINT);
    expect(await digestOf('rxdb.commit.content.v1', COMMIT_PAYLOAD)).toBe(COMMIT_FINGERPRINT);
  });

  it('实现算出的单元指纹与提交指纹，与文档示例逐字相同', () => {
    expect(computeChangeUnitFingerprint(UNIT)).toBe(UNIT_FINGERPRINT);
    expect(
      computeCommitContentFingerprint({
        kind: 'normal',
        parentIds: ['p1'],
        message: '新建任务',
        author: 'alice',
        units: [UNIT]
      })
    ).toBe(COMMIT_FINGERPRINT);
  });

  it('长度前缀数的是 UTF-16 码元：一个表情是两个码元，不是 4 个字节也不是 1 个码点', async () => {
    const unit = { ...UNIT, patch: { title: '🙂' } };
    const payload = 's2:u1zs6:publics4:Tasks2:t1s6:inserto1:k5:titles2:🙂zs5:local';

    expect(computeChangeUnitFingerprint(unit)).toBe(await digestOf('rxdb.commit.change-unit.v1', payload));
  });

  it('键序不进指纹、值为 undefined 的键等于不存在，-0 写成 0', () => {
    const reordered = { ...UNIT, patch: { n: 1.5, done: false, title: '草稿', dropped: undefined } };
    expect(computeChangeUnitFingerprint(reordered)).toBe(UNIT_FINGERPRINT);
    expect(computeChangeUnitFingerprint({ ...UNIT, patch: { ...UNIT.patch, n: -0 } })).toBe(
      computeChangeUnitFingerprint({ ...UNIT, patch: { ...UNIT.patch, n: 0 } })
    );
  });
});
