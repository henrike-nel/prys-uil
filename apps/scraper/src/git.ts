import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

// Commits and pushes data/prices. Returns false when there was nothing to commit.
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
  } catch {
    git('pull', '--rebase');
    git('push');
  }
  return true;
}
