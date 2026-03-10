import { describe, it, expect, vi } from 'vitest';
import { chooseNextChunkId, pruneDecrypted, createPump } from '../../web/mse-pump.js';

describe('MSE pump helpers', () => {
  it('chooseNextChunkId picks smallest key > lastAppended', () => {
    const m = new Map([
      [5, new Uint8Array([5])],
      [2, new Uint8Array([2])],
      [9, new Uint8Array([9])],
    ]);
    expect(chooseNextChunkId(m, -1)).toBe(2);
    expect(chooseNextChunkId(m, 2)).toBe(5);
    expect(chooseNextChunkId(m, 9)).toBe(null);
  });

  it('pruneDecrypted keeps roughly a sliding window behind lastAppended', () => {
    const m = new Map();
    for (let i = 0; i < 200; i++) m.set(i, new Uint8Array([i % 256]));
    pruneDecrypted(m, 150, { max: 80, keepBehind: 60 });
    // Oldest should be pruned below 90
    expect(m.has(0)).toBe(false);
    expect(m.has(89)).toBe(false);
    expect(m.has(90)).toBe(true);
  });

  it('createPump appends and updates lastAppended, but not while updating', () => {
    const decrypted = new Map([
      [1, new Uint8Array([1, 1])],
      [3, new Uint8Array([3, 3])],
    ]);

    let last = -1;
    const appendBuffer = vi.fn();
    const sourceBuffer = {
      updating: false,
      appendBuffer: (buf) => {
        appendBuffer(buf);
        // simulate MSE transitioning to updating
        sourceBuffer.updating = true;
      },
    };

    const pump = createPump({
      sourceBuffer,
      decrypted,
      getLastAppended: () => last,
      setLastAppended: (n) => (last = n),
    });

    pump();
    expect(appendBuffer).toHaveBeenCalledTimes(1);
    expect(last).toBe(1);

    // while updating, no append
    pump();
    expect(appendBuffer).toHaveBeenCalledTimes(1);

    // mark not updating; should append next (3)
    sourceBuffer.updating = false;
    pump();
    expect(appendBuffer).toHaveBeenCalledTimes(2);
    expect(last).toBe(3);
  });
});
