import { StorageProvider } from './storage-provider';
// Types will be provided by @types/gapi and @types/gapi.auth2

export class GDriveProvider implements StorageProvider {
  private readonly TOKEN_KEY = 'fncad-gdrive-token';
  private readonly API_KEY = 'AIzaSyD7iU1ap7YuXwpCI3PqbTTJYZrES-Amg_E'; // From gdrive-test.html
  private readonly CLIENT_ID =
    '1099028218898-1ha0r6mvemlgfm9aj0o6b1b7ce73teqn.apps.googleusercontent.com'; // From gdrive-test.html

  name = 'gdrive';

  // Don't load anything in constructor
  constructor() {}

  /**
   * Loads the Google API client if it's not already loaded
   */
  private async loadGapiIfNeeded(): Promise<void> {
    // Check if already loaded in window
    if (window.gapi?.client) {
      return;
    }

    if (typeof window.gapi === 'undefined') {
      await this.loadScript('https://apis.google.com/js/api.js');
    }

    // Convert callback-based API to Promise
    await new Promise<void>((resolve) => {
      window.gapi.load('client', () => resolve());
    });

    // Initialize the client
    await window.gapi.client.init({
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
    });
  }

  /**
   * Loads the Google Identity Services if not already loaded
   */
  private async loadGisIfNeeded(): Promise<void> {
    // Check if already loaded
    if (window.google?.accounts) {
      return;
    }

    await this.loadScript('https://accounts.google.com/gsi/client');
  }

  /**
   * Loads an external script
   * @param src URL of the script to load
   */
  private async loadScript(src: string): Promise<void> {
    // For script loading, we still need to use a Promise because
    // there's no built-in async/await equivalent for script loading
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = (e) => reject(e);
      document.body.appendChild(script);
    });
  }

  /**
   * Checks if user is authenticated with Google Drive
   */
  async isAuthenticated(): Promise<boolean> {
    const tokenStr = localStorage.getItem(this.TOKEN_KEY);
    if (!tokenStr) return false;

    try {
      // Only initialize GAPI if we have a token
      await this.loadGapiIfNeeded();

      const token = JSON.parse(tokenStr);
      window.gapi.client.setToken(token);
      return true;
    } catch (e) {
      localStorage.removeItem(this.TOKEN_KEY);
      return false;
    }
  }

  /**
   * Authenticates with Google Drive
   */
  async authenticate(): Promise<boolean> {
    // If already authenticated, return true
    if (await this.isAuthenticated()) {
      return true;
    }

    try {
      // Load both APIs only when authenticating
      await this.loadGapiIfNeeded();
      await this.loadGisIfNeeded();

      // For OAuth flow, we need to use a Promise because the flow uses callbacks
      return new Promise<boolean>((resolve) => {
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: this.CLIENT_ID,
          scope: 'https://www.googleapis.com/auth/drive.file',
          callback: (response) => {
            if (response.error !== undefined) {
              resolve(false);
              return;
            }

            const token = window.gapi.client.getToken();
            localStorage.setItem(this.TOKEN_KEY, JSON.stringify(token));
            resolve(true);
          },
        });

        tokenClient.requestAccessToken({ prompt: 'consent' });

        // Try to update authentication icons if window function exists
        setTimeout(() => {
          if (typeof window.updateAuthStatusIcons === 'function') {
            window.updateAuthStatusIcons();
          }
        }, 500); // Small delay to ensure token is saved before checking
      });
    } catch (error) {
      console.error('Failed to load Google APIs:', error);
      return false;
    }
  }

  async save(
    content: string,
    filename: string,
    existingId?: string
  ): Promise<{ id: string; filename: string }> {
    if (!(await this.isAuthenticated())) {
      throw new Error('Not authenticated with Google Drive');
    }

    if (!filename.endsWith('.fncad')) {
      filename = `${filename}.fncad`;
    }

    const fileBlob = new Blob([content], { type: 'text/plain' });

    if (existingId) {
      // Update existing file
      const form = new FormData();
      form.append(
        'metadata',
        new Blob([JSON.stringify({ name: filename })], { type: 'application/json' })
      );
      form.append('file', fileBlob);

      const response = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${window.gapi.client.getToken().access_token}`,
          },
          body: form,
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error.message || 'Failed to update file');
      }

      // Make file publicly accessible
      await this.setFilePubliclyAccessible(existingId);

      return { id: existingId, filename };
    } else {
      // Create new file
      // Find or create the fnCAD folder
      const folderId = await this.findOrCreateFolder();

      const form = new FormData();
      form.append(
        'metadata',
        new Blob(
          [
            JSON.stringify({
              name: filename,
              parents: [folderId],
            }),
          ],
          { type: 'application/json' }
        )
      );
      form.append('file', fileBlob);

      const response = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${window.gapi.client.getToken().access_token}`,
          },
          body: form,
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error.message || 'Failed to create file');
      }

      const fileInfo = await response.json();

      // Make the file publicly accessible
      await this.setFilePubliclyAccessible(fileInfo.id);

      return { id: fileInfo.id, filename };
    }
  }

  async load(id: string): Promise<{ content: string; filename: string }> {
    // Try to fetch with API key first for public files
    try {
      // Get file metadata
      const metadataUrl = `https://www.googleapis.com/drive/v3/files/${id}?key=${this.API_KEY}`;
      const metadataResponse = await fetch(metadataUrl);

      if (!metadataResponse.ok) {
        throw new Error('Failed to fetch file metadata');
      }

      const metadata = await metadataResponse.json();
      const filename = metadata.name;

      // Get file content
      const contentUrl = `https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${this.API_KEY}`;
      const contentResponse = await fetch(contentUrl);

      if (!contentResponse.ok) {
        throw new Error('Failed to fetch file content');
      }

      const content = await contentResponse.text();

      return { content, filename };
    } catch (error) {
      // If public access fails, try with authentication
      if (await this.isAuthenticated()) {
        try {
          const response = await window.gapi.client.drive.files.get({
            fileId: id,
            alt: 'media',
          });

          const metadataResponse = await window.gapi.client.drive.files.get({
            fileId: id,
            fields: 'name',
          });

          // Use fallback name if name is undefined for any reason
          const filename = metadataResponse.result.name || `file_${id}.fncad`;

          return {
            content: response.body,
            filename: filename,
          };
        } catch (driveError) {
          throw new Error(
            `Failed to load file from Google Drive: ${(driveError as Error).message}`
          );
        }
      } else {
        throw new Error('File requires authentication. Please authenticate with Google Drive.');
      }
    }
  }

  getShareUrl(id: string): string {
    return `${window.location.origin}${window.location.pathname}?gdrive=${id}`;
  }

  /**
   * Revokes the Google Drive access token
   * This properly removes permission from Google's side
   */
  async revokeAccess(): Promise<boolean> {
    const tokenStr = localStorage.getItem(this.TOKEN_KEY);
    if (!tokenStr) return false;

    try {
      // Parse the token JSON
      const token = JSON.parse(tokenStr);
      const accessToken = token.access_token;

      if (!accessToken) return false;

      // Call Google's revocation endpoint
      const response = await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      // Remove from localStorage regardless of response
      localStorage.removeItem(this.TOKEN_KEY);

      // Try to also sign out with gapi if available
      if (window.gapi?.auth2) {
        try {
          const auth2 = window.gapi.auth2.getAuthInstance();
          if (auth2) {
            await auth2.signOut();
          }
        } catch (error) {
          console.warn('Could not sign out with gapi.auth2', error);
        }
      }

      return response.ok;
    } catch (error) {
      console.error('Error revoking access token:', error);

      // Still remove from localStorage
      localStorage.removeItem(this.TOKEN_KEY);

      return false;
    }
  }

  private async findOrCreateFolder(): Promise<string> {
    // First check if the folder already exists
    const folderResponse = await window.gapi.client.drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and name='fnCAD' and trashed=false",
      fields: 'files(id, name)',
    });

    if (folderResponse.result.files && folderResponse.result.files.length > 0) {
      const folderId = folderResponse.result.files[0].id;
      if (!folderId) {
        throw new Error('Found folder but ID is undefined');
      }
      return folderId;
    }

    // If not found, create the folder
    const folderMetadata = {
      name: 'fnCAD',
      mimeType: 'application/vnd.google-apps.folder',
    };

    const createResponse = await window.gapi.client.drive.files.create({
      resource: folderMetadata,
      fields: 'id',
    });

    const folderId = createResponse.result.id;
    if (!folderId) {
      throw new Error('Created folder but ID is undefined');
    }
    return folderId;
  }

  private async setFilePubliclyAccessible(fileId: string): Promise<boolean> {
    try {
      const permission = {
        type: 'anyone',
        role: 'reader',
      };

      await window.gapi.client.drive.permissions.create({
        fileId: fileId,
        resource: permission,
      });

      return true;
    } catch (error) {
      console.error('Error setting file permissions:', error);
      // Don't throw - we still want the file save to succeed even if permission setting fails
      return false;
    }
  }
}
