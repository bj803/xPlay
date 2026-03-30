import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { CacheHelper } from '@/server/helpers/CacheHelper';
import { VIDEO_LIST_FILE } from '@/server/constants';
import type { VideoInfo } from '@/types/video';

export const dynamic = 'force-dynamic';

// 容器内路径映射
const DOWNLOADS_CONTAINER = '/downloads';          // = /volume1/ShortVideo/00ShortVideo
const FAVORITES_CONTAINER = '/additional-browse';  // = /volume1/ShortVideo/00Keep
const ROOT_CONTAINER = '/shortvideo-root';         // = /volume1/ShortVideo（整个根目录）
const DOWNLOADS_SUBDIR = '00ShortVideo';           // 在根目录下的子目录名
const FAVORITES_SUBDIR = '00Keep';                 // 在根目录下的子目录名

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { uuid, targetSubdir } = body;

    if (!uuid) {
      return NextResponse.json({ success: false, error: 'Missing uuid' }, { status: 400 });
    }

    const videoInfo = await CacheHelper.get<VideoInfo>(uuid);
    if (!videoInfo) {
      return NextResponse.json({ success: false, error: 'Video not found in cache' }, { status: 404 });
    }

    const srcPath = videoInfo.file?.path;
    if (!srcPath) {
      return NextResponse.json({ success: false, error: 'File path not found' }, { status: 404 });
    }

    if (!srcPath.startsWith(DOWNLOADS_CONTAINER + '/')) {
      return NextResponse.json({ success: false, error: 'File is not in downloads directory' }, { status: 400 });
    }

    // 确定目标目录（容器内路径）
    let destDir = FAVORITES_CONTAINER;
    if (targetSubdir) {
      const normalized = path.normalize(path.join(FAVORITES_CONTAINER, targetSubdir));
      if (!normalized.startsWith(FAVORITES_CONTAINER)) {
        return NextResponse.json({ success: false, error: 'Invalid target directory' }, { status: 400 });
      }
      destDir = normalized;
    }

    const fileName = path.basename(srcPath);
    let destPath = path.join(destDir, fileName);

    // 如果目标文件已存在，加时间戳后缀
    try {
      await fs.access(destPath);
      const ext = path.extname(fileName);
      const base = path.basename(fileName, ext);
      destPath = path.join(destDir, `${base}_${Date.now()}${ext}`);
    } catch {
      // 目标不存在，正常继续
    }

    // 方案A：通过 /shortvideo-root 的真实路径用 rename（同一文件系统）
    // /downloads/xxx.mp4  → /shortvideo-root/00ShortVideo/xxx.mp4
    // /additional-browse/subdir/xxx.mp4 → /shortvideo-root/00Keep/subdir/xxx.mp4
    const srcReal = srcPath.replace(
      DOWNLOADS_CONTAINER,
      `${ROOT_CONTAINER}/${DOWNLOADS_SUBDIR}`
    );
    const destReal = destPath.replace(
      FAVORITES_CONTAINER,
      `${ROOT_CONTAINER}/${FAVORITES_SUBDIR}`
    );

    // 检查 /shortvideo-root 是否已挂载
    let useRoot = false;
    try {
      await fs.access(ROOT_CONTAINER);
      useRoot = true;
    } catch {
      // /shortvideo-root 未挂载，降级为 copyFile+unlink
    }

    if (useRoot) {
      // 确保目标目录存在
      await fs.mkdir(path.dirname(destReal), { recursive: true });
      try {
        await fs.rename(srcReal, destReal);
      } catch (renameErr: any) {
        if (renameErr?.code === 'EXDEV') {
          // 仍然跨设备（不应发生），降级为复制
          await fs.copyFile(srcPath, destPath);
          await fs.unlink(srcPath);
        } else {
          throw renameErr;
        }
      }
    } else {
      // 降级方案：复制 + 删除
      await fs.mkdir(destDir, { recursive: true });
      await fs.copyFile(srcPath, destPath);
      await fs.unlink(srcPath);
    }

    // 从 yt-dlp 列表缓存中移除
    const videoList: string[] = (await CacheHelper.get<string[]>(VIDEO_LIST_FILE)) || [];
    const newList = videoList.filter((id) => id !== uuid);
    await CacheHelper.set(VIDEO_LIST_FILE, newList);
    await CacheHelper.delete(uuid);

    return NextResponse.json({ success: true, destPath });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
