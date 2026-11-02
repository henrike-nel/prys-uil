import { TIMEOUT_MS } from './fetch';

// Chromium is only installed in CI when a product needs it, so load Playwright lazily.
export async function renderHtml(url: string): Promise<string> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: TIMEOUT_MS });
    return await page.content();
  } finally {
    await browser.close();
  }
}
