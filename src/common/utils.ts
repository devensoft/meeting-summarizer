import path from 'node:path';

export function resolveFromRoot(rootDirectory: string, inputPath: string) {
  const trimmedPath = inputPath.trim();
  const unquotedPath =
    trimmedPath.length >= 2 &&
    ((trimmedPath.startsWith('"') && trimmedPath.endsWith('"')) ||
      (trimmedPath.startsWith("'") && trimmedPath.endsWith("'")))
      ? trimmedPath.slice(1, -1)
      : trimmedPath;

  return path.resolve(rootDirectory, unquotedPath);
}

export function resolveWithinDirectory(directory: string, relativePath: string) {
  const resolvedDirectory = path.resolve(directory);
  const resolvedPath = path.resolve(resolvedDirectory, relativePath);
  const relativeResolvedPath = path.relative(resolvedDirectory, resolvedPath);

  if (
    relativeResolvedPath === '' ||
    relativeResolvedPath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeResolvedPath)
  ) {
    throw new Error('Path must remain within the allowed directory.');
  }

  return resolvedPath;
}
