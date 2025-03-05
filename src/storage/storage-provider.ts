export interface StorageProvider {
  name: string;
  isAuthenticated(): Promise<boolean>;
  authenticate(): Promise<boolean>;
  save(
    content: string,
    filename: string,
    existingId?: string
  ): Promise<{ id: string; filename: string }>;
  load(id: string): Promise<{ content: string; filename: string }>;
  getShareUrl(id: string): string;
}
