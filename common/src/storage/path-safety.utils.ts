export function containsPathTraversal(segment: string): boolean {
  if (segment.includes('..') || segment.includes('\0') || segment.includes('/') || segment.includes('\\')) {
    return true;
  }
  try {
    const decoded = decodeURIComponent(segment);
    if (decoded.includes('..') || decoded.includes('\0') || decoded.includes('/') || decoded.includes('\\')) {
      return true;
    }
  } catch {
    return true;
  }
  return false;
}
