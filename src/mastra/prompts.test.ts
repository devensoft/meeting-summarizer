import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { findPromptInTree, loadPrompt, renderTemplate } from './prompts';

describe('renderTemplate', () => {
  it('substitutes a single variable', () => {
    expect(renderTemplate('Hello {{name}}!', { name: 'World' })).toBe('Hello World!');
  });

  it('substitutes multiple variables and repeated occurrences', () => {
    expect(renderTemplate('{{a}} and {{b}} and {{a}} again', { a: 'x', b: 'y' })).toBe('x and y and x again');
  });

  it('tolerates whitespace inside braces', () => {
    expect(renderTemplate('Hello {{  name  }}!', { name: 'World' })).toBe('Hello World!');
  });

  it('throws naming every missing variable', () => {
    expect(() => renderTemplate('{{a}} {{b}} {{c}}', { a: 'x' })).toThrow(/missing variable\(s\): \{\{b\}\}, \{\{c\}\}/);
  });

  it('returns templates without placeholders unchanged', () => {
    expect(renderTemplate('No variables here.', {})).toBe('No variables here.');
  });

  it('ignores variables the template never mentions', () => {
    expect(renderTemplate('Only {{a}}.', { a: 'x', unused: 'y' })).toBe('Only x.');
  });

  it('does not re-scan injected values as templates', () => {
    expect(renderTemplate('Value: {{a}}', { a: '{{a}}' })).toBe('Value: {{a}}');
  });

  it('throws on malformed placeholders instead of leaking them into the prompt', () => {
    expect(() => renderTemplate('Hello {{transcript-content}}!', {})).toThrow(
      /malformed placeholder\(s\): \{\{transcript-content\}\}/,
    );
  });

  it('still reports missing variables for whitespace-padded valid placeholders', () => {
    expect(() => renderTemplate('{{ name }}', {})).toThrow(/missing variable\(s\): \{\{name\}\}/);
  });
});

describe('loadPrompt', () => {
  let tempRoot: string;
  let callerUrl: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'mastra-prompt-'));
    callerUrl = pathToFileURL(path.join(tempRoot, 'meeting-step.ts')).href;
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('loads the file stacked next to the calling module', () => {
    writeFileSync(path.join(tempRoot, 'meeting-step.prompt.md'), 'Say {{greeting}} now.', 'utf8');

    expect(loadPrompt(callerUrl, 'meeting-step.prompt.md')()).toBe('Say {{greeting}} now.');
  });

  it('normalizes CRLF line endings and strips the trailing newline', () => {
    writeFileSync(path.join(tempRoot, 'meeting-step.prompt.md'), 'First\r\nSecond: {{x}}\r\n', 'utf8');

    expect(loadPrompt(callerUrl, 'meeting-step.prompt.md')()).toBe('First\nSecond: {{x}}');
  });

  it('re-reads the file on every call so edits apply without reloading the module', () => {
    const promptPath = path.join(tempRoot, 'meeting-step.prompt.md');
    writeFileSync(promptPath, 'First draft.', 'utf8');
    const getPrompt = loadPrompt(callerUrl, 'meeting-step.prompt.md');

    expect(getPrompt()).toBe('First draft.');

    writeFileSync(promptPath, 'Second draft.', 'utf8');
    expect(getPrompt()).toBe('Second draft.');
  });

  it('resolves through the src/mastra tree when no sibling exists, anchoring on the caller location', () => {
    const fakeRepoRoot = path.join(tempRoot, 'repo');
    const buildDir = path.join(fakeRepoRoot, '.mastra', 'output');
    const mastraDir = path.join(fakeRepoRoot, 'src', 'mastra', 'workflows');
    mkdirSync(buildDir, { recursive: true });
    mkdirSync(mastraDir, { recursive: true });
    const buildCallerUrl = pathToFileURL(path.join(buildDir, 'mastra.mjs')).href;
    writeFileSync(path.join(mastraDir, 'target.prompt.md'), 'Tree content.', 'utf8');

    expect(loadPrompt(buildCallerUrl, 'target.prompt.md')()).toBe('Tree content.');
  });

  it('throws with a clear message when the file exists nowhere', () => {
    expect(() => loadPrompt(callerUrl, 'zz-nowhere-42.prompt.md')).toThrow(
      /zz-nowhere-42\.prompt\.md.*not found next to/,
    );
  });

  it('rejects file names that escape the calling module directory', () => {
    expect(() => loadPrompt(callerUrl, '..\\escape.prompt.md')).toThrow(
      'Path must remain within the allowed directory.',
    );
  });
});

describe('findPromptInTree', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'mastra-tree-'));
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('finds a file in a nested directory', () => {
    const nested = path.join(tempRoot, 'workflows', 'deep');
    mkdirSync(nested, { recursive: true });
    const target = path.join(nested, 'target.prompt.md');
    writeFileSync(target, 'found', 'utf8');

    expect(findPromptInTree(tempRoot, 'target.prompt.md')).toBe(path.resolve(target));
  });

  it('returns null when no file matches', () => {
    expect(findPromptInTree(tempRoot, 'absent.prompt.md')).toBeNull();
  });

  it('does not descend into node_modules', () => {
    const modules = path.join(tempRoot, 'node_modules', 'pkg');
    mkdirSync(modules, { recursive: true });
    writeFileSync(path.join(modules, 'target.prompt.md'), 'found', 'utf8');

    expect(findPromptInTree(tempRoot, 'target.prompt.md')).toBeNull();
  });

  it('returns null when the root does not exist', () => {
    expect(findPromptInTree(path.join(tempRoot, 'missing'), 'target.prompt.md')).toBeNull();
  });
});
