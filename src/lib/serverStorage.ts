/**
 * serverStorage — 自定义 storage，把 Zustand 设置存到 NAS 服务器
 * (/config/ui-settings.json) 而不是 localStorage。
 * 所有设备共享同一份设置，不需要每台单独配置。
 *
 * 用法：storage: createJSONStorage(() => serverStorageDriver)
 * 失败时自动降级到 localStorage。
 */

const API = '/api/settings';

/**
 * 底层 storage driver（操作字符串），传给 createJSONStorage 包装。
 * createJSONStorage 负责 JSON.stringify / JSON.parse。
 */
export const serverStorageDriver = {
  async getItem(key: string): Promise<string | null> {
    try {
      const res = await fetch(`${API}?key=${encodeURIComponent(key)}`, {
        cache: 'no-store',
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch {
      // 降级到 localStorage
      try { return localStorage.getItem(key); } catch { return null; }
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
    } catch {
      try { localStorage.setItem(key, value); } catch {}
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      await fetch(`${API}?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
    } catch {
      try { localStorage.removeItem(key); } catch {}
    }
  },
};
