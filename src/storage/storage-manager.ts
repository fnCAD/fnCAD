import { StorageProvider } from './storage-provider';
import { AppState } from '../state';
import { GistProvider } from './gist-provider';
import { GDriveProvider } from './gdrive-provider';

export class StorageManager {
  private providers: Map<string, StorageProvider> = new Map();
  private updateAuthStatusIcons: () => void;

  constructor(updateAuthStatusIcons: () => void) {
    // Register default providers
    this.registerProvider(new GistProvider());
    this.registerProvider(new GDriveProvider());

    // Store the callback
    this.updateAuthStatusIcons = updateAuthStatusIcons;
  }

  registerProvider(provider: StorageProvider) {
    this.providers.set(provider.name, provider);
  }

  getProvider(name: string): StorageProvider | undefined {
    return this.providers.get(name);
  }

  async saveDocument(
    appState: AppState,
    providerName?: string
  ): Promise<{ url: string; filename: string } | null> {
    const activeDoc = appState.getActiveDocument();
    const content = activeDoc.content;

    // Use existing provider if available
    let provider: StorageProvider | undefined;
    let existingId: string | undefined;

    console.log('Starting save document:', {
      providedName: providerName,
      hasStorage: !!activeDoc.storage,
      currentProvider: activeDoc.storage?.provider,
      currentId: activeDoc.storage?.externalId,
    });

    if (activeDoc.storage) {
      if (!providerName) {
        // Use existing provider if not specified
        providerName = activeDoc.storage.provider as string;
        existingId = activeDoc.storage.externalId;
      } else if (providerName === activeDoc.storage.provider) {
        // If explicitly saving to the same provider, use the existing ID
        existingId = activeDoc.storage.externalId;
      }
    }

    console.log('After provider selection:', {
      selectedProvider: providerName,
      existingId,
      willCreateNew: !existingId,
    });

    // If no provider specified or found, prompt user
    if (!providerName) {
      return null; // User must explicitly choose a provider
    }

    provider = this.getProvider(providerName);
    if (!provider) {
      throw new Error(`Provider ${providerName} not found`);
    }

    // Check authentication
    if (!(await provider.isAuthenticated())) {
      const authenticated = await provider.authenticate();
      if (!authenticated) {
        throw new Error(`Authentication failed for ${providerName}`);
      }

      // Update authentication status icons after successful authentication
      this.updateAuthStatusIcons();
    }

    try {
      // Save the document
      const result = await provider.save(content, activeDoc.name, existingId);

      // Update document storage info
      if (!activeDoc.storage) {
        activeDoc.storage = {
          provider: provider.name as 'gist' | 'gdrive',
          externalId: result.id,
          writable: true,
          filename: result.filename,
        };
      } else {
        activeDoc.storage.provider = provider.name as 'gist' | 'gdrive';
        activeDoc.storage.externalId = result.id;
        activeDoc.storage.writable = true;
        activeDoc.storage.filename = result.filename;
      }

      // Update URL
      const shareUrl = provider.getShareUrl(result.id);
      history.replaceState({}, '', shareUrl);

      // Save updated document info to localStorage
      appState.saveDocumentsToLocalStorage();

      // Update authentication icons
      this.updateAuthStatusIcons();

      return { url: shareUrl, filename: result.filename };
    } catch (error) {
      console.error('Error saving document:', error);
      throw error;
    }
  }

  async loadFromUrl(appState: AppState, url: string): Promise<boolean> {
    const urlObj = new URL(url);
    let providerName: string | null = null;
    let id: string | null = null;

    // Check for gist parameter
    if (urlObj.searchParams.has('gist')) {
      providerName = 'gist';
      id = urlObj.searchParams.get('gist');
    }
    // Check for gdrive parameter
    else if (urlObj.searchParams.has('gdrive')) {
      providerName = 'gdrive';
      id = urlObj.searchParams.get('gdrive');
    }

    if (!providerName || !id) {
      return false;
    }

    // Check if we already have a document with this external ID
    const existingDocument = appState
      .getDocuments()
      .find((doc) => doc.storage?.provider === providerName && doc.storage?.externalId === id);

    if (existingDocument) {
      // If we already have this document, just set it as active
      appState.setActiveDocument(existingDocument.id);
      return true;
    }

    const provider = this.getProvider(providerName);
    if (!provider) {
      throw new Error(`Provider ${providerName} not found`);
    }

    try {
      // Load content
      const { content, filename } = await provider.load(id);

      // Create new document
      const docId = appState.createNewDocument();
      appState.setActiveDocument(docId);

      // Update content and name
      // Strip .fncad extension for display name
      const displayName = filename.endsWith('.fncad')
        ? filename.substring(0, filename.length - 6)
        : filename;

      appState.renameDocument(docId, displayName);
      appState.updateEditorContent(content);

      // Set storage info
      const doc = appState.getActiveDocument();
      doc.storage = {
        provider: provider.name as 'gist' | 'gdrive',
        externalId: id,
        writable: false, // We start by assuming we can't write to it
        filename,
      };

      // Save updated document info to localStorage
      appState.saveDocumentsToLocalStorage();

      return true;
    } catch (error) {
      console.error('Error loading document:', error);
      throw error;
    }
  }

  async checkUrlParameters(appState: AppState): Promise<boolean> {
    try {
      return await this.loadFromUrl(appState, window.location.href);
    } catch (error) {
      console.error('Error loading from URL:', error);
      return false;
    }
  }
}
