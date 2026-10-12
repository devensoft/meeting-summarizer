import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveWithinDirectory } from './utils';

const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
const MALFORMED_PLACEHOLDER_PATTERN = /\{\{([^{}]*)\}\}/g;
const VALID_NAME_PATTERN = /^[A-Za-z0-9_]+$/;

/**
 * Agentic prompts live in `.prompt.md` files stacked next to the module that
 * uses them (e.g. `ingestion-wf.02-classify-topics-step.prompt.md` beside
 * `ingestion-wf.02-classify-topics-step.ts`). Variable injection uses
 * `{{variableName}}` placeholders filled by `renderTemplate`.
 */

/** Fills `{{variableName}}` placeholders from `variables`. Missing variables and
 * malformed placeholders (anything in `{{...}}` that is not a bare identifier)
 * throw instead of silently sending an unfilled prompt. Injected values are
 * never re-scanned as templates. */
export function renderTemplate(template: string, variables: Record<string, string>): string {
  const missing = new Set<string>();
  const malformed = new Set<string>();
  const rendered = template.replace(PLACEHOLDER_PATTERN, (placeholder, name: string) => {
    const value = variables[name];
    if (value === undefined) {
      missing.add(name);
      return placeholder;
    }
    return value;
  });

  for (const token of template.matchAll(MALFORMED_PLACEHOLDER_PATTERN)) {
    if (!VALID_NAME_PATTERN.test(token[1].trim())) {
      malformed.add(token[0]);
    }
  }

  if (malformed.size > 0) {
    const names = [...malformed].join(', ');
    throw new Error(`Prompt template has malformed placeholder(s): ${names}. Use {{identifier}} names.`);
  }

  if (missing.size > 0) {
    const names = [...missing].map((name) => `{{${name}}}`).join(', ');
    throw new Error(`Prompt template is missing variable(s): ${names}`);
  }

  return rendered;
}

const promptPathCache = new Map<string, string>();

/** Resolves a prompt file stacked next to the calling module and returns a
 * zero-arg getter that re-reads its content from disk on every call, so edits
 * to the `.prompt.md` file apply on the next render without a restart. Pass
 * the calling module's `import.meta.url` so the sibling is resolved relative
 * to it. Resolution happens once per caller/file pair and is cached; an
 * initial read makes a missing or unreadable file fail at boot rather than on
 * the first render. In a `mastra build` bundle every module shares the chunk's
 * URL inside `.mastra/output`, so resolution walks up from the caller's
 * directory to the nearest ancestor containing `src/mastra` and searches that
 * tree. CRLF is normalized to LF and trailing whitespace stripped so the
 * file's line-ending style never leaks into the prompt. */
export function loadPrompt(callerModuleUrl: string, promptFileName: string): () => string {
  const cacheKey = `${callerModuleUrl}::${promptFileName}`;
  let promptPath = promptPathCache.get(cacheKey);
  if (promptPath === undefined) {
    promptPath = resolvePromptPath(callerModuleUrl, promptFileName);
    readPromptFile(promptPath);
    promptPathCache.set(cacheKey, promptPath);
  }
  const resolvedPath = promptPath;

  return () => readPromptFile(resolvedPath);
}

function readPromptFile(promptPath: string): string {
  return readFileSync(promptPath, 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '');
}

function resolvePromptPath(callerModuleUrl: string, promptFileName: string): string {
  const callerDirectory = path.dirname(fileURLToPath(callerModuleUrl));
  const siblingPath = resolveWithinDirectory(callerDirectory, promptFileName);

  if (existsSync(siblingPath)) {
    return siblingPath;
  }

  const searchRoot = findMastraSourceRoot(callerDirectory);
  const foundPath = searchRoot ? findPromptInTree(path.join(searchRoot, 'src', 'mastra'), promptFileName) : null;
  if (!foundPath) {
    throw new Error(
      `Prompt file "${promptFileName}" was not found next to ${callerModuleUrl} or under a src/mastra tree above ${callerDirectory}.`,
    );
  }
  return foundPath;
}

/** Walks up from `startDirectory` to the first ancestor containing `src/mastra`,
 * or null. `mastra start` runs the built bundle from inside `.mastra/output`,
 * whose build-generated package.json defeats `resolveProjectRoot(process.cwd())`,
 * so the caller's own location anchors the search instead of the cwd. */
function findMastraSourceRoot(startDirectory: string): string | null {
  let currentDirectory = path.resolve(startDirectory);

  while (true) {
    if (existsSync(path.join(currentDirectory, 'src', 'mastra'))) {
      return currentDirectory;
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      return null;
    }

    currentDirectory = parentDirectory;
  }
}

/** Depth-first search for `promptFileName` under `rootDirectory`, skipping
 * `node_modules`. Returns the resolved path, or null when absent. Step prompt
 * file names are unique by convention (`<calling-file-name>.prompt.md`), so
 * the first match is unambiguous. */
export function findPromptInTree(rootDirectory: string, promptFileName: string): string | null {
  if (!existsSync(rootDirectory)) {
    return null;
  }

  const entries = readdirSync(rootDirectory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name === 'node_modules') {
      continue;
    }
    const entryPath = path.join(rootDirectory, entry.name);
    if (entry.isFile() && entry.name === promptFileName) {
      return path.resolve(entryPath);
    }
    if (entry.isDirectory()) {
      const foundPath = findPromptInTree(entryPath, promptFileName);
      if (foundPath) {
        return foundPath;
      }
    }
  }
  return null;
}
