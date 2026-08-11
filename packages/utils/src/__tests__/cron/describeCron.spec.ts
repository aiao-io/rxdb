import { describe, expect, it } from 'vitest';
import { describeCron, describeCronParts, parseCron } from '../../cron/describeCron.js';

describe('parseCron', () => {
  it('should parse 5-part expression', () => {
    expect(parseCron('0 9 * * 1-5')).toEqual({
      minute: '0',
      hour: '9',
      day: '*',
      month: '*',
      dow: '1-5'
    });
  });

  it('should parse 6-part expression (seconds prefix)', () => {
    expect(parseCron('*/10 * * * * *')).toEqual({
      second: '*/10',
      minute: '*',
      hour: '*',
      day: '*',
      month: '*',
      dow: '*'
    });
  });

  it('should throw on invalid part count', () => {
    expect(() => parseCron('* * *')).toThrow('无效的 cron 表达式：需要 5 或 6 段，实际为 3 段');
  });

  it('should trim whitespace', () => {
    expect(parseCron('  0 9 * * 1-5  ')).toEqual({
      minute: '0',
      hour: '9',
      day: '*',
      month: '*',
      dow: '1-5'
    });
  });

  it('5-part should not have second key', () => {
    const result = parseCron('* * * * *');
    expect(result).not.toHaveProperty('second');
  });
});

describe('describeCron', () => {
  it('每分钟: * * * * *', () => {
    expect(describeCron('* * * * *')).toBe('每天 每分钟 执行');
  });

  it('每 5 分钟: */5 * * * *', () => {
    expect(describeCron('*/5 * * * *')).toBe('每天 每 5 分钟 执行');
  });

  it('每小时整点: 0 * * * *', () => {
    expect(describeCron('0 * * * *')).toBe('每天 每小时整点 执行');
  });

  it('工作日 9 点: 0 9 * * 1-5', () => {
    expect(describeCron('0 9 * * 1-5')).toBe('每个工作日 09:00 执行');
  });

  it('周五 18:30: 30 18 * * 5', () => {
    expect(describeCron('30 18 * * 5')).toBe('每周五 18:30 执行');
  });

  it('周日 0 点: 0 0 * * 0', () => {
    expect(describeCron('0 0 * * 0')).toBe('每周日 00:00 执行');
  });

  it('每月 1 号 0 点: 0 0 1 * *', () => {
    expect(describeCron('0 0 1 * *')).toBe('每月 1 号 00:00 执行');
  });

  it('元旦 0 点: 0 0 1 1 *', () => {
    expect(describeCron('0 0 1 1 *')).toBe('1月1 号 00:00 执行');
  });

  it('多个小时: 0 8,12,18 * * *', () => {
    expect(describeCron('0 8,12,18 * * *')).toBe('每天 8、12、18 时 整点 执行');
  });

  it('工作日 9-17 点每 15 分钟: */15 9-17 * * 1-5', () => {
    expect(describeCron('*/15 9-17 * * 1-5')).toBe('每个工作日 9 到 17 点之间每小时 每 15 分钟 执行');
  });

  it('凌晨 2 点: 0 2 * * *', () => {
    expect(describeCron('0 2 * * *')).toBe('每天 02:00 执行');
  });

  it('每隔 2 天: 0 0 */2 * *', () => {
    expect(describeCron('0 0 */2 * *')).toBe('每月 每隔 2 天 00:00 执行');
  });

  it('周末: 0 10 * * 0,6', () => {
    expect(describeCron('0 10 * * 0,6')).toBe('每个周末 10:00 执行');
  });

  it('周六: 0 10 * * 6', () => {
    expect(describeCron('0 10 * * 6')).toBe('每周六 10:00 执行');
  });

  it('6-part: 每 10 秒', () => {
    expect(describeCron('*/10 * * * * *')).toBe('每天 每 10 秒 执行');
  });

  it('6-part: 每 5 分钟的第 0 秒', () => {
    expect(describeCron('0 */5 * * * *')).toBe('每天 每 5 分钟 执行');
  });

  it('6-part: 工作日 9 点每 30 秒', () => {
    expect(describeCron('*/30 * 9 * * 1-5')).toBe('每个工作日 9 点 每 30 秒 执行');
  });

  it('每隔 2 小时整点: 0 */2 * * *', () => {
    expect(describeCron('0 */2 * * *')).toBe('每天 每 2 小时整点 执行');
  });

  it('多个月份: 0 0 1 3,6,9,12 *', () => {
    expect(describeCron('0 0 1 3,6,9,12 *')).toBe('3月、6月、9月、12月1 号 00:00 执行');
  });

  it('covers step/list/range variants across fields', () => {
    expect(describeCron('5/10 * * * * *')).toBe('每天 从第 5 秒起每 10 秒 执行');
    expect(describeCron('5/10 * * * *')).toBe('每天 从第 5 分钟起每 10 分钟 执行');
    expect(describeCron('0 1/3 * * *')).toBe('每天 从 1 时起每 3 小时整点 执行');
    expect(describeCron('0 0 1/4 * *')).toBe('每月 从 1 号起每隔 4 天 00:00 执行');
    expect(describeCron('0 0 1 1/2 *')).toBe('从1月起每隔 2 个月1 号 00:00 执行');
    expect(describeCron('0 0 * * */2')).toBe('每 2 周 00:00 执行');
    expect(describeCron('1,2,3 * * * * *')).toBe('每天 1、2、3 秒 执行');
    expect(describeCron('1,5 * * * *')).toBe('每天 1、5 分 执行');
    expect(describeCron('0 * * 1,11 *')).toBe('每年1月、11月 每小时整点 执行');
    expect(describeCron('0 0 * * 1,3')).toBe('每周一、周三 00:00 执行');
    expect(describeCron('10-20 * * * * *')).toBe('每天 10 到 20 秒之间每秒 执行');
    expect(describeCron('10-20 * * * *')).toBe('每天 10 到 20 分之间每分钟 执行');
    expect(describeCron('0 0 5-10 * *')).toBe('每月 5 至 10 号 00:00 执行');
    expect(describeCron('0 0 1 3-5 *')).toBe('3月到5月1 号 00:00 执行');
    expect(describeCron('0 0 * * 1-3')).toBe('每周一到周三 00:00 执行');
    expect(describeCron('15 0 * * * *')).toBe('每天 每小时整点 第 15 秒 执行');
    expect(describeCron('30 9 * * 1 *')).toBe('每年1月 第 9 分钟 第 30 秒 执行');
    expect(describeCron('0 30 */2 * * *')).toBe('每天 每 2 小时的第 30 分钟 执行');
    expect(describeCron('0 0 1 * 1-5')).toBe('1 号 或 周一到周五 00:00 执行');
    expect(describeCron('0 0 * 6 *')).toBe('每年6月 00:00 执行');
  });
});

describe('describeCronParts', () => {
  it('工作日 9 点', () => {
    const result = describeCronParts('0 9 * * 1-5');
    expect(result).toEqual({
      minute: '整点',
      hour: '9 点',
      day: null,
      month: null,
      dow: '周一到周五'
    });
  });

  it('每分钟（5 段不含 second key）', () => {
    const result = describeCronParts('* * * * *');
    expect(result).toEqual({
      minute: null,
      hour: null,
      day: null,
      month: null,
      dow: null
    });
    expect(result).not.toHaveProperty('second');
  });

  it('6-part 每 10 秒', () => {
    const result = describeCronParts('*/10 * * * * *');
    expect(result).toEqual({
      second: '每 10 秒',
      minute: null,
      hour: null,
      day: null,
      month: null,
      dow: null
    });
  });

  it('复杂表达式', () => {
    const result = describeCronParts('*/15 9-17 1 6 *');
    expect(result).toEqual({
      minute: '每 15 分钟',
      hour: '9 到 17 点之间每小时',
      day: '1 号',
      month: '6月',
      dow: null
    });
  });
});

// UTL-024：parseCron 曾只校验字段数量，非法值一路生成伪描述而不抛错。
describe('UTL-024 字段级校验', () => {
  it('月份 0 不再生成空月份的伪描述', () => {
    // 曾经：MONTHS[0] === '' 且 `??` 拦不住空串 → '1 号 00:00 执行'
    expect(() => describeCron('0 0 1 0 *')).toThrow('月字段 "0" 取值 0 超出范围 1-12');
  });

  it('非数字星期不再生成 周NaN', () => {
    // 曾经：DAYS[NaN] === undefined → '每周周NaN 00:00 执行'
    expect(() => describeCron('0 0 * * abc')).toThrow('星期字段 "abc" 含非法取值 "abc"');
  });

  it('全字段越界不再伪成功', () => {
    // 曾经：'99 号 或 周一 99:99 执行'
    expect(() => describeCron('99 99 99 99 99')).toThrow('无效的 cron 表达式');
  });

  it('各字段的取值上界都被拦截', () => {
    expect(() => parseCron('60 * * * * *')).toThrow('秒字段 "60" 取值 60 超出范围 0-59');
    expect(() => parseCron('60 * * * *')).toThrow('分钟字段 "60" 取值 60 超出范围 0-59');
    expect(() => parseCron('0 24 * * *')).toThrow('小时字段 "24" 取值 24 超出范围 0-23');
    expect(() => parseCron('0 0 32 * *')).toThrow('日字段 "32" 取值 32 超出范围 1-31');
    expect(() => parseCron('0 0 1 13 *')).toThrow('月字段 "13" 取值 13 超出范围 1-12');
    expect(() => parseCron('0 0 * * 8')).toThrow('星期字段 "8" 取值 8 超出范围 0-7');
  });

  it('各字段的取值边界仍然合法', () => {
    expect(() => parseCron('59 59 23 31 12 7')).not.toThrow();
    expect(() => parseCron('0 0 1 1 0')).not.toThrow();
  });

  it('日字段 0 越界（下界是 1 而非 0）', () => {
    expect(() => parseCron('0 0 0 * *')).toThrow('日字段 "0" 取值 0 超出范围 1-31');
  });

  it('步长必须是 ≥ 1 的整数', () => {
    expect(() => parseCron('*/0 * * * *')).toThrow('分钟字段 "*/0" 的步长必须 ≥ 1');
    expect(() => parseCron('*/x * * * *')).toThrow('分钟字段 "*/x" 含非法步长 "x"');
    expect(() => parseCron('*/1/2 * * * *')).toThrow('分钟字段 "*/1/2" 的分项 "*/1/2" 含多余的 "/"');
  });

  it('范围起点不得大于终点', () => {
    expect(() => parseCron('0 17-9 * * *')).toThrow('小时字段 "17-9" 的范围 17-9 起点大于终点');
  });

  it('多余的 - 与空分项都拒绝', () => {
    expect(() => parseCron('1-2-3 * * * *')).toThrow('的分项 "1-2-3" 含多余的 "-"');
    expect(() => parseCron('1,,2 * * * *')).toThrow('含非法取值 ""');
  });

  it('* 不能与其他分项并列', () => {
    expect(() => parseCron('1,* * * * *')).toThrow('分钟字段 "1,*" 中的 "*" 不能与其他分项并列');
  });

  it('range+step 不再被 / 分支吞掉 range', () => {
    // 曾经：'/' 分支先命中 → base '1-5' 被丢弃 → dow 描述为 '每 2 周'
    expect(describeCronParts('0 9 * * 1-5/2').dow).toBe('周一到周五每隔 2 天');
    expect(describeCronParts('0 9 1-10/3 * *').day).toBe('1 至 10 号之间每隔 3 天');
    expect(describeCronParts('0 9-17/2 * * *').hour).toBe('9 到 17 点之间每 2 小时');
    expect(describeCronParts('10-40/5 * * * *').minute).toBe('10 到 40 分之间每 5 分钟');
    expect(describeCronParts('10-40/5 * * * * *').second).toBe('10 到 40 秒之间每 5 秒');
    expect(describeCronParts('0 9 * 1-6/2 *').month).toBe('1月到6月每隔 2 个月');
  });

  it('list+range 混合按分项逐个描述', () => {
    expect(describeCronParts('0 9 1,3-5 * *').day).toBe('1 号、3 至 5 号');
    expect(describeCronParts('0 9 * * 1,3-5').dow).toBe('周一、周三到周五');
  });

  it('星期描述不再重复拼「周」', () => {
    // 曾经：describeField 已返回 '周一、周三'，渲染层又拼 `每周${...}`
    expect(describeCron('0 9 * * 1,3')).toBe('每周一、周三 09:00 执行');
    expect(describeCron('0 9 * * 5')).toBe('每周五 09:00 执行');
    expect(describeCron('0 9 * * 1-3')).toBe('每周一到周三 09:00 执行');
    expect(describeCron('0 9 * * */2')).toBe('每 2 周 09:00 执行');
    expect(describeCron('0 9 * * 0')).toBe('每周日 09:00 执行');
    expect(describeCron('0 9 * * 7')).toBe('每周日 09:00 执行');
  });
});
