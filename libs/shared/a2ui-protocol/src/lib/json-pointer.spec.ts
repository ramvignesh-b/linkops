import { readPointer, writePointer } from './json-pointer';

/**
 * The only unit tests in the assistant slice. Everything else it builds is
 * asserted through a seam — the endpoint over HTTP, and later the rendered
 * DOM. These two functions are the exception on purpose: they are the
 * prototype-pollution guard, and no seam reaches them yet at all,
 * because the Server authors Surfaces with literal values and only the
 * renderer resolves a binding. Shipping a security guard with no coverage
 * until the renderer exists is the worse trade.
 */
describe('readPointer', () => {
  it('reads the whole document for the two spellings of root', () => {
    const document = { linkId: 'lnk_0003' };

    expect(readPointer(document, '')).toBe(document);
    // A2UI writes the root as `/`, which RFC 6901 would read as the key `""`.
    // Its spelling wins here, and the divergence is in the README's
    // conformance table.
    expect(readPointer(document, '/')).toBe(document);
  });

  it('reads a top-level and a nested value', () => {
    const document = { linkId: 'lnk_0003', chosen: { remediation: 'narrow' } };

    expect(readPointer(document, '/linkId')).toBe('lnk_0003');
    expect(readPointer(document, '/chosen/remediation')).toBe('narrow');
  });

  it('refuses a segment that reaches the prototype chain, at any depth', () => {
    const document = { chosen: { remediation: 'narrow' } };

    expect(readPointer(document, '/__proto__')).toBeUndefined();
    // A read through `constructor` is how a payload gets hold of the
    // prototype in the first place, so the guard is not write-only.
    expect(readPointer(document, '/constructor/prototype')).toBeUndefined();
    expect(readPointer(document, '/chosen/prototype')).toBeUndefined();
  });

  it('does not reach an inherited property, only an own one', () => {
    expect(readPointer({ linkId: 'lnk_0003' }, '/toString')).toBeUndefined();
  });

  it('unescapes ~1 as a slash and ~0 as a tilde, per RFC 6901', () => {
    const document = { 'a/b': 'slash', 'c~d': 'tilde' };

    expect(readPointer(document, '/a~1b')).toBe('slash');
    expect(readPointer(document, '/c~0d')).toBe('tilde');
  });
});

describe('writePointer', () => {
  it('writes a top-level value, leaving the document it was given alone', () => {
    const before = { linkId: 'lnk_0001' };

    const after = writePointer(before, '/linkId', 'lnk_0002');

    expect(after).toEqual({ linkId: 'lnk_0002' });
    // The Data Model is held in a signal, so a mutation in place would be a
    // change no renderer could see.
    expect(before).toEqual({ linkId: 'lnk_0001' });
  });

  it('writes a nested value, building the missing object on the way', () => {
    expect(writePointer({}, '/chosen/remediation', 'raise-power')).toEqual({
      chosen: { remediation: 'raise-power' },
    });
  });

  it('refuses to write through a prototype segment, polluting nothing', () => {
    const before = { linkId: 'lnk_0001' };

    // Refused means exactly this: no throw, no partial write, and the
    // document handed back as it was.
    expect(writePointer(before, '/__proto__/polluted', true)).toEqual(before);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('replaces the whole document at root, which is updateDataModel default', () => {
    expect(
      writePointer({ linkId: 'lnk_0001' }, '/', { linkId: 'lnk_0002' }),
    ).toEqual({
      linkId: 'lnk_0002',
    });
  });

  it('writes through an array index without turning the array into an object', () => {
    const after = writePointer({ picked: ['a', 'b'] }, '/picked/1', 'c');

    expect(after).toEqual({ picked: ['a', 'c'] });
    expect(Array.isArray(after.picked)).toBe(true);
  });
});
