import { describe, expect, it } from 'vitest';
import { errorMessage } from '../src/errors';

describe('errorMessage', () => {
  it('stringifies a non-Error value', () => {
    expect(errorMessage('oops')).toBe('oops');
  });

  it('takes only the first line of an Error message', () => {
    expect(errorMessage(new Error('HTTP 403\nfull body here'))).toBe('HTTP 403');
  });

  it('reports a TimeoutError as "timeout"', () => {
    const error = new Error('aborted');
    error.name = 'TimeoutError';
    expect(errorMessage(error)).toBe('timeout');
  });
});
