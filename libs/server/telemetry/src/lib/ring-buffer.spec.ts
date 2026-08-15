import { RingBuffer } from './ring-buffer';

describe('RingBuffer', () => {
  it('starts empty', () => {
    const buffer = new RingBuffer<number>(3);

    expect(buffer.toArray()).toEqual([]);
  });

  it('holds pushes in chronological order', () => {
    const buffer = new RingBuffer<number>(3);

    buffer.push(1);
    buffer.push(2);

    expect(buffer.toArray()).toEqual([1, 2]);
  });

  it('evicts the oldest entry once a push exceeds capacity', () => {
    const buffer = new RingBuffer<number>(3);

    buffer.push(1);
    buffer.push(2);
    buffer.push(3);
    buffer.push(4);

    expect(buffer.toArray()).toEqual([2, 3, 4]);
  });

  it('holds exactly the most recent 300 after 1000 pushes, in order', () => {
    const buffer = new RingBuffer<number>(300);

    for (let i = 0; i < 1000; i++) {
      buffer.push(i);
    }

    expect(buffer.toArray()).toEqual(
      Array.from({ length: 300 }, (_, i) => 700 + i),
    );
  });

  describe('peekLast', () => {
    it('returns undefined when empty', () => {
      const buffer = new RingBuffer<number>(3);

      expect(buffer.peekLast()).toBeUndefined();
    });

    it('returns the most recently pushed item, without copying the buffer', () => {
      const buffer = new RingBuffer<number>(3);

      buffer.push(1);
      buffer.push(2);

      expect(buffer.peekLast()).toBe(2);
    });
  });
});
