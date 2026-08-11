import { describe, expect, it } from 'vitest';
import { nextMicroTask } from '../../async/nextMicroTask.js';

describe('scheduler', () => {
  it('nextMicroTask', async () => {
    const calls: string[] = [];
    const dummyThen = Promise.resolve().then();
    const job1 = () => {
      calls.push('job1');
    };
    const job2 = () => {
      calls.push('job2');
    };
    nextMicroTask(job1);
    job2();
    expect(calls.length).toBe(1);
    await dummyThen;
    expect(calls.length).toBe(2);
    expect(calls).toMatchObject(['job2', 'job1']);
  });
});
