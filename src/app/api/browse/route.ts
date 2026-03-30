/**
 * src/app/api/browse/route.ts
 *
 * 浏览其他文件夹的 API。
 * 支持浏览 /downloads（当前下载目录）和 /additional-browse（附加只读目录）。
 *
 * compose.yaml 需要额外挂载（只读）：
 *   - /volume1/ShortVideo:/additional-browse:ro
 *
 * GET /api/browse?path=/additional-browse
 * → 返回目录内的视频文件列表（文件名、大小、修改时间）
 */
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// 只允许浏览这两个目录，防止路径穿越攻击
const ALLOWED_BASE_PATHS = ['/downloads', '/additional-browse'];

// 支持浏览的视频文件扩展名
const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.webm', '.mov', '.avi', '.flv', '.m4v', '.ts']);

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const urlObject = new URL(request.url);
    const reqPath = urlObject.searchParams.get('path') || '/downloads';

    // 安全检查：路径必须以允许的基础路径开头
    const isAllowed = ALLOWED_BASE_PATHS.some(
      (base) => reqPath === base || reqPath.startsWith(base + '/')
    );
    if (!isAllowed) {
      return NextResponse.json({ error: 'Path not allowed' }, { status: 403 });
    }

    // 防止路径穿越
    const normalized = path.normalize(reqPath);
    if (!ALLOWED_BASE_PATHS.some((base) => normalized.startsWith(base))) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
    }

    const entries = await fs.readdir(normalized, { withFileTypes: true });

    const files = await Promise.all(
      entries
        .filter((e) => {
          if (e.isDirectory()) return true;
          const ext = path.extname(e.name).toLowerCase();
          return VIDEO_EXTS.has(ext);
        })
        .map(async (e) => {
          const fullPath = path.join(normalized, e.name);
          try {
            const stat = await fs.stat(fullPath);
            return {
              name: e.name,
              path: fullPath,
              isDirectory: e.isDirectory(),
              size: e.isDirectory() ? null : stat.size,
              mtime: stat.mtime.toISOString()
            };
          } catch {
            return {
              name: e.name,
              path: fullPath,
              isDirectory: e.isDirectory(),
              size: null,
              mtime: null
            };
          }
        })
    );

    // 排序：目录优先，然后按修改时间降序
    files.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      if (a.mtime && b.mtime) return b.mtime.localeCompare(a.mtime);
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      currentPath: normalized,
      parentPath: normalized !== '/downloads' && normalized !== '/additional-browse'
        ? path.dirname(normalized)
        : null,
      availablePaths: ALLOWED_BASE_PATHS,
      files
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}