export function getRuntimeBasePath(): string {
  // Get the last directory from the current script's path
  const scriptPath = document.currentScript?.getAttribute('src') || '';
  const basePathMatch = scriptPath.match(/^(.+?)\/[^/]+$/);

  if (basePathMatch) {
    return basePathMatch[1] + '/';
  }

  // Fallback: get from current path
  const pathParts = window.location.pathname.split('/');
  // Remove empty parts and the last part (likely index.html)
  const cleanParts = pathParts.filter(Boolean).slice(0, -1);

  return cleanParts.length ? '/' + cleanParts.join('/') + '/' : '/';
}
