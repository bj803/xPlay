import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { CONFIG_PATH } from '@/server/constants';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';
const SHARE_RECORDS_FILE = path.join(CONFIG_PATH, 'share-records.json');

type ShareRecord = {
  id: string; fileName: string; filePath: string; url: string;
  createdAt: number; expiresAt: number | null; password?: string; note?: string;
};

async function loadRecords(): Promise<ShareRecord[]> {
  try { return JSON.parse(await fs.readFile(SHARE_RECORDS_FILE, 'utf-8')); }
  catch { return []; }
}
async function saveRecords(records: ShareRecord[]) {
  await fs.mkdir(CONFIG_PATH, { recursive: true });
  await fs.writeFile(SHARE_RECORDS_FILE, JSON.stringify(records, null, 2), 'utf-8');
}

export async function GET() {
  const records = await loadRecords();
  // 不暴露密码明文，只返回是否有密码
  return NextResponse.json({ records: records.map(r => ({
    ...r, password: undefined, hasPassword: !!r.password
  }))});
}

export async function POST(request: Request) {
  try {
    const { fileName, filePath, expiresAt, password, note } = await request.json();
    if (!fileName || !filePath)
      return NextResponse.json({ success: false, error: 'Missing fields' }, { status: 400 });
    const id = randomUUID();
    const record: ShareRecord = {
      id, fileName, filePath, url: `/share/${id}`,
      createdAt: Date.now(), expiresAt: expiresAt || null,
      password: password || undefined, note: note || undefined,
    };
    const records = await loadRecords();
    records.unshift(record);
    await saveRecords(records);
    return NextResponse.json({ success: true, record: { ...record, password: undefined, hasPassword: !!record.password }});
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 });
    await saveRecords((await loadRecords()).filter(r => r.id !== id));
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}