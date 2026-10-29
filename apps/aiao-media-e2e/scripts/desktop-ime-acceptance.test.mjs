import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compositionSummary,
  hasPinyinResidue,
  imeOrigin,
  keyScript,
  PINYIN_INPUT_SOURCE,
  pinyinKeys
} from './desktop-ime-acceptance.mjs';

test('只接受本机正式产物服务或正式 origin', () => {
  assert.equal(imeOrigin({}), 'http://127.0.0.1:4399');
  assert.equal(imeOrigin({ AIAO_MEDIA_IME_ORIGIN: 'https://media.aiao.io' }), 'https://media.aiao.io');
  assert.equal(imeOrigin({ AIAO_MEDIA_IME_ORIGIN: 'http://127.0.0.1:4398' }), 'http://127.0.0.1:4398');
  for (const value of [
    'http://localhost:4399',
    'https://media.aiao.io.example',
    'http://media.aiao.io',
    'https://media.aiao.io/'
  ])
    assert.throws(() => imeOrigin({ AIAO_MEDIA_IME_ORIGIN: value }), /IME_ORIGIN_INVALID/);
});

test('拼音只映射为物理键码，不把文字直接发给系统', () => {
  assert.equal(PINYIN_INPUT_SOURCE, 'com.apple.inputmethod.SCIM.ITABC');
  assert.deepEqual(
    pinyinKeys('nihao').map(key => key.code),
    [45, 34, 4, 0, 31]
  );
  for (const value of ['', 'Ni', '你好', 'ni hao', 'nihao1'])
    assert.throws(() => pinyinKeys(value), /IME_PINYIN_INVALID/);
});

test('每批按键先核对受测浏览器在前台，修饰键按声明组合', () => {
  const script = keyScript(4321, [{ code: 6, modifiers: ['command', 'shift'], pause: 0.5 }, { code: 49 }]);
  assert.match(
    script,
    /^tell application "System Events"\n {2}if \(unix id of first application process whose frontmost is true\) is not 4321 then error "IME_FOCUS_LOST"/
  );
  assert.match(script, /key code 6 using \{command down, shift down\}\n {2}delay 0\.5/);
  assert.match(script, /key code 49\n {2}delay 0\.08\nend tell$/);
  assert.doesNotMatch(script, /keystroke/);
  assert.throws(() => keyScript(0, [{ code: 49 }]), /IME_BROWSER_PID_INVALID/);
  assert.throws(() => keyScript(4321, [{ code: 128 }]), /IME_KEY_INVALID/);
  assert.throws(() => keyScript(4321, [{ code: 1.5 }]), /IME_KEY_INVALID/);
});

test('输入法提交内容只从 compositionend 统计', () => {
  const summary = compositionSummary([
    { type: 'compositionstart', data: '' },
    { type: 'compositionupdate', data: 'ni' },
    { type: 'beforeinput', inputType: 'insertCompositionText' },
    { type: 'compositionend', data: '你好' },
    { type: 'compositionstart', data: '' },
    { type: 'compositionend', data: '世界' }
  ]);
  assert.deepEqual(summary, { sessions: 2, commits: ['你好', '世界'], committed: '你好世界' });
  assert.deepEqual(compositionSummary([]), { sessions: 0, commits: [], committed: '' });
});

test('连续拉丁字母视为拼音残留，单个字母不误报', () => {
  assert.equal(hasPinyinResidue('你好zhong'), true);
  assert.equal(hasPinyinResidue('Ni'), true);
  assert.equal(hasPinyinResidue('粘贴：{{产品}} <b>不是标签'), false);
  assert.equal(hasPinyinResidue('你好世界中国'), false);
});
