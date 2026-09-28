import { describe, expect, it } from 'vitest';
import { parentPath } from './router.js';

describe('parentPath (gerarchia del bottone Indietro)', () => {
  it.each([
    ['/giochi/memory', '/giochi'],
    ['/giochi/acchiappa', '/giochi'],
    ['/giochi', '/'],
    ['/menu', '/'],
    ['/profilo', '/'],
    ['/', null],
  ])('%s → %s', (path, parent) => {
    expect(parentPath(path)).toBe(parent);
  });
});
