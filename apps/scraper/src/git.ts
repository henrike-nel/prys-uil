import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

export function commitPrices(dataDir: string, message: string): boolean {
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: join(dataDir, '..'), encoding: 'utf8' });
  const prices = join(dataDir, 'prices');
  // `git add` fails if prices/ has never existed, so check status first.
  if (!git('status', '--porcelain', '--', prices)) return false;
  git('add', '-A', '--', prices);
  git('commit', '-m', message);
  try {
    git('push');
  } catch (error) {
    const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
    console.log(`push failed, retrying after pull --rebase: ${reason}`);
    git('pull', '--rebase');
    git('push');
  }
  return true;
}
