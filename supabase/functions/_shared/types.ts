export interface PLRFile {
  id: string;
  name: string;
  path: string;
  size: number;
  type: string;
  userId: string;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  syncStatus?: 'synced' | 'syncing' | 'error' | 'conflict';
  isDeleted?: boolean;
}