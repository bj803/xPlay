import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { CONFIG_PATH } from '@/server/constants';

export const dynamic = 'force-dynamic';

// Allow deleting from both directories
const DELETABLE_PATHS = ['/downloads', '/additional-browse'];
const FAVORITES_CACHE_FILE = path.join(CONFIG_PATH, 'favorites-cache.json');

export async function DELETE(request: Request) {
  try {
    const urlObject = new URL(request.url);
    const filePath = urlObject.searchParams.get('path');

    if (!filePath) {
      return NextResponse.json({ success: false, error: 'Missing path' }, { status: 400 });
    }

    const normalized = path.normalize(filePath);
    const isAllowed = DELETABLE_PATHS.some(
      (base) => normalized === base || normalized.startsWith(base + '/')
    );
    if (!isAllowed) {
      return NextResponse.json({ success: false, error: 'Path not allowed' }, { status: 403 });
    }

    await fs.unlink(normalized);

    // Also remove from favorites cache if present
    try {
      const raw = await fs.readFile(FAVORITES_CACHE_FILE, 'utf-8');
      const cache = JSON.parse(raw);
      if (cache[normalized]) {
        delete cache[normalized];
        await fs.writeFile(FAVORITES_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
      }
    } catch {}

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}