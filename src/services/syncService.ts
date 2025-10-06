import { supabase } from '@/integrations/supabase/client';
import { PLRFile, SyncStatus } from '@/types';

export class SyncService {
  private autoSyncInterval: NodeJS.Timeout | null = null;
  private lastSyncTime: Date = new Date(0);
  
  // Event handlers for UI updates
  private onSyncStatusChange?: (status: 'syncing' | 'synced' | 'error') => void;
  private onConflictDetected?: (local: PLRFile, cloud: PLRFile) => Promise<'local' | 'cloud'>;

  constructor(
    onSyncStatusChange?: (status: 'syncing' | 'synced' | 'error') => void,
    onConflictDetected?: (local: PLRFile, cloud: PLRFile) => Promise<'local' | 'cloud'>
  ) {
    this.onSyncStatusChange = onSyncStatusChange;
    this.onConflictDetected = onConflictDetected;
  }

  /**
   * Upload file metadata to cloud storage
   */
  async syncMetadataToCloud(files: PLRFile[]): Promise<void> {
    try {
      this.updateSyncStatus('syncing');
      
      const { data, error } = await supabase
        .functions.invoke('desktop-sync', {
          body: { files }
        });

      if (error) throw error;

      // Handle any conflicts returned from the server
      if (data.conflicts) {
        for (const conflict of data.conflicts) {
          await this.resolveConflicts(conflict.local, conflict.cloud);
        }
      }

      this.lastSyncTime = new Date();
      this.updateSyncStatus('synced');
    } catch (error) {
      console.error('Failed to sync metadata:', error);
      this.updateSyncStatus('error');
      throw error;
    }
  }

  /**
   * Fetch changes from cloud since last sync
   */
  async getCloudChanges(lastSyncTime: Date): Promise<PLRFile[]> {
    try {
      const { data, error } = await supabase
        .functions.invoke('desktop-sync/changes', {
          queryParams: { lastSyncTime: lastSyncTime.toISOString() }
        });

      if (error) throw error;
      return data.files;
    } catch (error) {
      console.error('Failed to fetch cloud changes:', error);
      throw error;
    }
  }

  /**
   * Download all cloud library metadata to local storage
   */
  async syncFromCloud(): Promise<void> {
    try {
      this.updateSyncStatus('syncing');
      
      const changes = await this.getCloudChanges(this.lastSyncTime);
      const { data: localFiles } = await window.electron.invoke('getLocalFiles');
      
      for (const cloudFile of changes) {
        const localFile = localFiles.find(f => f.id === cloudFile.id);
        if (localFile) {
          await this.resolveConflicts(localFile, cloudFile);
        } else {
          // New file from cloud, add to local DB
          await window.electron.invoke('addLocalFile', cloudFile);
        }
      }

      this.lastSyncTime = new Date();
      this.updateSyncStatus('synced');
    } catch (error) {
      console.error('Failed to sync from cloud:', error);
      this.updateSyncStatus('error');
      throw error;
    }
  }

  /**
   * Resolve conflicts between local and cloud versions
   */
  async resolveConflicts(localFile: PLRFile, cloudFile: PLRFile): Promise<PLRFile> {
    // If no conflict handler provided, use last-write-wins
    if (!this.onConflictDetected) {
      return this.lastWriteWins(localFile, cloudFile);
    }

    // Let the UI handle complex conflicts
    const resolution = await this.onConflictDetected(localFile, cloudFile);
    return resolution === 'local' ? localFile : cloudFile;
  }

  /**
   * Simple last-write-wins conflict resolution
   */
  private lastWriteWins(localFile: PLRFile, cloudFile: PLRFile): PLRFile {
    const localUpdated = new Date(localFile.updatedAt);
    const cloudUpdated = new Date(cloudFile.updatedAt);
    return localUpdated > cloudUpdated ? localFile : cloudFile;
  }

  /**
   * Start automatic background sync
   */
  startAutoSync(intervalMinutes: number = 5): void {
    if (this.autoSyncInterval) {
      this.stopAutoSync();
    }

    this.autoSyncInterval = setInterval(async () => {
      // Only sync when app is idle
      if (document.hidden || (navigator as any).userActivation?.isActive === false) {
        await this.syncFromCloud();
        
        const { data: localFiles } = await window.electron.invoke('getLocalFiles');
        await this.syncMetadataToCloud(localFiles);
      }
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Stop automatic background sync
   */
  stopAutoSync(): void {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
    }
  }

  /**
   * Update sync status and trigger UI callback
   */
  private updateSyncStatus(status: 'syncing' | 'synced' | 'error'): void {
    if (this.onSyncStatusChange) {
      this.onSyncStatusChange(status);
    }
  }
}