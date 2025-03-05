import { StorageProvider } from './storage-provider';

export class GistProvider implements StorageProvider {
  private readonly TOKEN_KEY = 'fncad-gist-token';

  name = 'gist';

  async isAuthenticated(): Promise<boolean> {
    return !!localStorage.getItem(this.TOKEN_KEY);
  }

  async authenticate(): Promise<boolean> {
    // If already authenticated, return true
    if (await this.isAuthenticated()) {
      return true;
    }

    // Import dynamically to avoid circular dependency
    const { showGistAuthDialog } = await import('./auth-dialogs');

    // Show dialog and get token
    const token = await showGistAuthDialog();

    if (token) {
      localStorage.setItem(this.TOKEN_KEY, token);
      return true;
    }

    return false;
  }

  private getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  async save(
    content: string,
    filename: string,
    existingId?: string
  ): Promise<{ id: string; filename: string }> {
    const token = this.getToken();

    if (!token) {
      throw new Error('GitHub token not configured');
    }

    if (!filename.endsWith('.fncad')) {
      filename = `${filename}.fncad`;
    }

    // Create or update the gist
    const description = 'fnCAD Model';
    const files = {
      [filename]: { content },
    };

    // Decide whether to create or update
    const url = existingId
      ? `https://api.github.com/gists/${existingId}`
      : 'https://api.github.com/gists';

    const method = existingId ? 'PATCH' : 'POST';

    const response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `token ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description,
        public: true,
        files,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create gist: ${error.message || response.statusText}`);
    }

    const data = await response.json();
    return { id: data.id, filename };
  }

  async load(id: string): Promise<{ content: string; filename: string }> {
    const response = await fetch(`https://api.github.com/gists/${id}`);

    if (!response.ok) {
      throw new Error(`Failed to load gist: ${response.statusText}`);
    }

    const data = await response.json();

    // Get the first file
    const files = Object.values(data.files);

    if (files.length === 0) {
      throw new Error('Gist contains no files');
    }

    const file = files[0] as any;

    return {
      content: file.content,
      filename: file.filename,
    };
  }

  getShareUrl(id: string): string {
    return `${window.location.origin}${window.location.pathname}?gist=${id}`;
  }
}
