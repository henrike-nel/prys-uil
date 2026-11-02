import { describe, expect, it } from 'vitest';
import { sharedUrl } from '../src/lib/share';

describe('sharedUrl', () => {
  it('reads the url param', () => {
    expect(sharedUrl('?url=https://www.takealot.com/item')).toBe('https://www.takealot.com/item');
  });

  it('finds the URL inside shared text', () => {
    expect(sharedUrl('?text=Look at this https://www.takealot.com/item it is cheap')).toBe(
      'https://www.takealot.com/item',
    );
  });

  it('reads the add param from the iOS Shortcut', () => {
    expect(sharedUrl('?add=http://shop.co.za/p/1')).toBe('http://shop.co.za/p/1');
  });

  it('checks url, then text, then add', () => {
    expect(sharedUrl('?add=https://c.co&text=https://b.co&url=https://a.co')).toBe('https://a.co');
    expect(sharedUrl('?add=https://c.co&text=https://b.co')).toBe('https://b.co');
    expect(sharedUrl('?url=&text=Title+https://b.co')).toBe('https://b.co');
  });

  it('decodes encoded values', () => {
    expect(sharedUrl('?text=Nice%20mug%0Ahttps%3A%2F%2Fshop.co.za%2Fmug%3Fid%3D7')).toBe(
      'https://shop.co.za/mug?id=7',
    );
  });

  it('returns undefined when nothing was shared', () => {
    expect(sharedUrl('')).toBeUndefined();
    expect(sharedUrl('?foo=https://a.co')).toBeUndefined();
  });

  it('returns undefined when the params hold no URL', () => {
    expect(sharedUrl('?text=just some words&url=not-a-link&add=www.a.co')).toBeUndefined();
  });
});
