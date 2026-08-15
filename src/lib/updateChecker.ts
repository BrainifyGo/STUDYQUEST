export const APP_VERSION = "1.0.0";

export interface VersionInfo {
  version: string;
  releaseNotes: string;
}

export const checkForUpdates = async (): Promise<VersionInfo | null> => {
  try {
    const response = await fetch('/version.json', {
      cache: 'no-store'
    });
    if (!response.ok) return null;
    
    const data: VersionInfo = await response.json();
    if (data.version !== APP_VERSION) {
      return data;
    }
    return null;
  } catch (err) {
    console.error('Update check failed:', err);
    return null;
  }
};

export const performUpdate = async () => {
  try {
    // Clear all caches
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    }
    // Force reload from server
    window.location.reload();
  } catch (err) {
    console.error('Update failed:', err);
    window.location.reload();
  }
};
