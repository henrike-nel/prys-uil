import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commitPrices } from '../src/git';

let root: string;
let remote: string;

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
}

function clone(name: string): string {
  const dir = join(root, name);
  git(root, 'clone', '-q', remote, dir);
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'commit.gpgsign', 'false');
  return dir;
}

function commitFile(repo: string, file: string, message: string) {
  writeFileSync(join(repo, file), `${message}\n`);
  git(repo, 'add', file);
  git(repo, 'commit', '-q', '-m', message);
  git(repo, 'push', '-q', 'origin', 'HEAD:main');
}

function writePrice(repo: string) {
  mkdirSync(join(repo, 'data', 'prices'), { recursive: true });
  writeFileSync(join(repo, 'data', 'prices', 'p1.json'), '{}\n');
}

function remoteLog(): string[] {
  return git(remote, 'log', '--format=%s', 'main').trim().split('\n');
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'prysuil-git-'));
  remote = join(root, 'remote.git');
  git(root, 'init', '-q', '--bare', '-b', 'main', remote);
  commitFile(clone('seed'), 'README.md', 'init');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('commitPrices', () => {
  it('commits and pushes changed price files', () => {
    const repo = clone('work');
    writePrice(repo);

    expect(commitPrices(join(repo, 'data'), 'chore(prices): check 1 products (1 changed)')).toBe(
      true,
    );

    expect(remoteLog()).toEqual(['chore(prices): check 1 products (1 changed)', 'init']);
  });

  it('does nothing when no price file changed', () => {
    const repo = clone('work');

    expect(commitPrices(join(repo, 'data'), 'no prices yet')).toBe(false);
    writePrice(repo);
    expect(commitPrices(join(repo, 'data'), 'first')).toBe(true);
    expect(commitPrices(join(repo, 'data'), 'unchanged')).toBe(false);

    expect(remoteLog()).toEqual(['first', 'init']);
  });

  it('rebases and pushes again when the remote has moved on', () => {
    const repo = clone('work');
    commitFile(clone('other'), 'other.txt', 'from elsewhere');
    writePrice(repo);

    expect(commitPrices(join(repo, 'data'), 'prices')).toBe(true);

    expect(remoteLog()).toEqual(['prices', 'from elsewhere', 'init']);
  });
});
