import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveFromRoot, resolveProjectRoot, resolveWithinDirectory } from './paths';

describe('resolveProjectRoot', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'mastra-msr-'));
    writeFileSync(path.join(tempRoot, 'package.json'), '{}');
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('returns the directory that directly contains package.json', () => {
    expect(resolveProjectRoot(tempRoot)).toBe(path.resolve(tempRoot));
  });

  it('walks up from a nested directory to find package.json', () => {
    const nested = path.join(tempRoot, 'src', 'mastra', 'workflows');
    mkdirSync(nested, { recursive: true });

    expect(resolveProjectRoot(nested)).toBe(path.resolve(tempRoot));
  });

  it('returns the project root when run from this repository', () => {
    const root = resolveProjectRoot(process.cwd());

    expect(existsSync(path.join(root, 'package.json'))).toBe(true);
  });

  it('throws when no package.json exists anywhere above', () => {
    const orphan = path.join(tempRoot, 'no-marker');
    mkdirSync(orphan, { recursive: true });
    rmSync(path.join(tempRoot, 'package.json'));

    expect(() => resolveProjectRoot(orphan)).toThrow(/Could not find a package.json/);
  });

  it('skips a directory whose path contains a .mastra segment even when it has a package.json', () => {
    // Mirrors `mastra start`: the build output directory carries a
    // build-generated package.json and lives under .mastra.
    const buildOutput = path.join(tempRoot, '.mastra', 'output');
    mkdirSync(buildOutput, { recursive: true });
    writeFileSync(path.join(buildOutput, 'package.json'), '{}');

    expect(resolveProjectRoot(buildOutput)).toBe(path.resolve(tempRoot));
  });

  describe('with PROJECT_ROOT set', () => {
    const originalOverride = process.env.PROJECT_ROOT;

    beforeEach(() => {
      process.env.PROJECT_ROOT = '';
    });

    afterEach(() => {
      if (originalOverride === undefined) {
        delete process.env.PROJECT_ROOT;
      } else {
        process.env.PROJECT_ROOT = originalOverride;
      }
    });

    it('honors a valid override without walking up', () => {
      const otherRoot = mkdtempSync(path.join(os.tmpdir(), 'mastra-msr-other-'));
      writeFileSync(path.join(otherRoot, 'package.json'), '{}');
      try {
        process.env.PROJECT_ROOT = otherRoot;
        expect(resolveProjectRoot(tempRoot)).toBe(path.resolve(otherRoot));
      } finally {
        rmSync(otherRoot, { recursive: true, force: true });
      }
    });

    it('fails fast when the override points at a missing directory', () => {
      process.env.PROJECT_ROOT = path.join(tempRoot, 'does-not-exist');

      expect(() => resolveProjectRoot(tempRoot)).toThrow(/PROJECT_ROOT/);
    });

    it('fails fast when the override has no package.json', () => {
      const noMarker = path.join(tempRoot, 'no-marker');
      mkdirSync(noMarker, { recursive: true });
      process.env.PROJECT_ROOT = noMarker;

      expect(() => resolveProjectRoot(tempRoot)).toThrow(/PROJECT_ROOT/);
    });

    it('falls back to the walk-up when the override is absent', () => {
      delete process.env.PROJECT_ROOT;

      expect(resolveProjectRoot(tempRoot)).toBe(path.resolve(tempRoot));
    });
  });
});

describe('resolveFromRoot', () => {
  it('resolves a relative path against the root', () => {
    expect(resolveFromRoot('C:\\repo', 'samples\\notes.txt')).toBe(path.resolve('C:\\repo', 'samples\\notes.txt'));
  });

  it('strips surrounding double quotes', () => {
    expect(resolveFromRoot('C:\\repo', '"my folder\\notes.txt"')).toBe(
      path.resolve('C:\\repo', 'my folder\\notes.txt'),
    );
  });

  it('strips surrounding single quotes', () => {
    expect(resolveFromRoot('C:\\repo', "'my folder'")).toBe(path.resolve('C:\\repo', 'my folder'));
  });

  it('trims surrounding whitespace before resolving', () => {
    expect(resolveFromRoot('C:\\repo', '  out.txt  ')).toBe(path.resolve('C:\\repo', 'out.txt'));
  });
});

describe('resolveWithinDirectory', () => {
  it('resolves a path that stays inside the directory', () => {
    expect(resolveWithinDirectory('C:\\repo', 'data\\file.txt')).toBe(path.resolve('C:\\repo', 'data\\file.txt'));
  });

  it('allows the exact directory path itself', () => {
    expect(resolveWithinDirectory('C:\\repo', 'data')).toBe(path.resolve('C:\\repo', 'data'));
  });

  it('throws on parent traversal', () => {
    expect(() => resolveWithinDirectory('C:\\repo', path.join('..', 'escape.txt'))).toThrow(
      'Path must remain within the allowed directory.',
    );
  });

  it('throws when the relative path escapes via nested traversal', () => {
    expect(() => resolveWithinDirectory('C:\\repo', path.join('data', '..', '..', 'escape.txt'))).toThrow(
      'Path must remain within the allowed directory.',
    );
  });

  it('throws on an absolute path outside the directory', () => {
    expect(() => resolveWithinDirectory('C:\\repo', path.resolve('C:\\elsewhere\\file.txt'))).toThrow(
      'Path must remain within the allowed directory.',
    );
  });
});
