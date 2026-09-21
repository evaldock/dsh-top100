import { describe, expect, it } from 'vitest';
import { collectionConcurrency, runPool } from '../src/pool.js';
describe('collection concurrency configuration', () => {
  it.each(['1', '10', '50'])('accepts bounded concurrency %s', value => {
    expect(collectionConcurrency(value)).toBe(Number(value));
  });
  it.each(['', '0', '-1', '51', '1.5', 'NaN', 'Infinity'])('rejects %s before it can silently skip collection', value => {
    expect(() => collectionConcurrency(value)).toThrow('DSH_COLLECTION_CONCURRENCY');
  });
  it('completes every item without exceeding configured parallel workers', async () => {
    let active = 0, maximum = 0;
    const completed: number[] = [];
    await runPool(Array.from({length: 12}, (_, n) => n), async item => {
      active++; maximum = Math.max(maximum, active);
      await new Promise(resolve => setTimeout(resolve, 1));
      completed.push(item); active--;
    }, collectionConcurrency('3'));
    expect(maximum).toBe(3);
    expect(completed.sort((a, b) => a - b)).toEqual(Array.from({length: 12}, (_, n) => n));
  });
  it('stops assigning work on a fatal error and drains workers before rejecting', async () => {
    const started: number[] = [], finished: number[] = [];
    const fatal = new Error('authentication failed');
    await expect(runPool([0, 1, 2, 3, 4], async item => {
      started.push(item);
      if (item === 0) throw fatal;
      await new Promise(resolve => setTimeout(resolve, 2)); finished.push(item);
    }, 2, error => error === fatal)).rejects.toBe(fatal);
    expect(started).toEqual([0, 1]); expect(finished).toEqual([1]);
  });
});
