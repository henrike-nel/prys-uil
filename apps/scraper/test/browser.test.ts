import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHtml } from '../src/browser';

const page = { goto: vi.fn(), content: vi.fn(async () => '<html>rendered</html>') };
const browser = { newPage: vi.fn(async () => page), close: vi.fn() };

vi.mock('playwright', () => ({ chromium: { launch: vi.fn(async () => browser) } }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('renderHtml', () => {
  it('returns the rendered page once the DOM is loaded and closes the browser', async () => {
    await expect(renderHtml('https://shop.example/item')).resolves.toBe('<html>rendered</html>');
    expect(page.goto).toHaveBeenCalledWith('https://shop.example/item', {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    });
    expect(browser.close).toHaveBeenCalled();
  });

  it('closes the browser when the page fails to load', async () => {
    page.goto.mockRejectedValueOnce(new Error('Timeout 20000ms exceeded'));

    await expect(renderHtml('https://shop.example/item')).rejects.toThrow('Timeout');
    expect(browser.close).toHaveBeenCalled();
  });
});
