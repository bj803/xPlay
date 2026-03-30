'use client';

/**
 * src/components/RehydrateProvider.tsx
 *
 * 修改说明：
 * 原来调用 localStorage 的 rehydrate()，现在改为先从服务器拉取设置，
 * 再触发 rehydrate()，确保页面加载时即读取服务器端保存的设置。
 *
 * 流程：
 * 1. useEffect（页面首次加载）
 * 2. 调用 useDownloadFormStore.persist.rehydrate()
 *    → 这会触发 serverStorage.getItem()
 *    → serverStorage.getItem() 向 /api/settings 发 GET 请求
 *    → 返回值填充到 store
 * 3. setHydrated() 标记完成，UI 解除禁用状态
 */

import { useEffect } from 'react';
import { useVideoPlayerStore } from '@/store/videoPlayer';
import { useSiteSettingStore } from '@/store/siteSetting';
import { useDownloadFormStore } from '@/store/downloadForm';

export function RehydrateProvider() {
  useEffect(() => {
    // rehydrate() 会调用 serverStorage.getItem()，
    // serverStorage.getItem() 内部 fetch('/api/settings')，
    // 所以这里不需要额外手动 fetch，persist 中间件会处理。
    useDownloadFormStore.persist.rehydrate();
    useVideoPlayerStore.persist.rehydrate();
    useSiteSettingStore.persist.rehydrate();
  }, []);

  return null;
}
