import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { CONFIG_PATH } from '@/server/constants';

export const dynamic = 'force-dynamic';

const SHARE_RECORDS_FILE = path.join(CONFIG_PATH, 'share-records.json');

// DELETE /api/share-records/all - clear all records
export async function DELETE() {
  try {
    await fs.mkdir(CONFIG_PATH, { recursive: true });
    await fs.writeFile(SHARE_RECORDS_FILE, '[]', 'utf-8');
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}