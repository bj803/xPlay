'use client';
import { useState, useEffect, useCallback } from 'react';
import { MdShare, MdDelete, MdAdd, MdEdit, MdFolder, MdLink, MdDeleteSweep, MdNotifications } from 'react-icons/md';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'react-toastify';

export type ShareRecord = {
  id: string; fileName: string; filePath: string; url: string;
  createdAt: number; expiresAt: number | null; hasPassword?: boolean;
};

type SharedFolder = { name: string; hasPassword: boolean; title: string; };

export function ShareManager() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'folders'|'links'>('folders');
  const [folders, setFolders] = useState<SharedFolder[]>([]);
  const [records, setRecords] = useState<ShareRecord[]>([]);
  const [loading, setLoading] = useState(false);
  // 新建文件夹
  const [newName, setNewName] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [creating, setCreating] = useState(false);
  // 编辑密码
  const [editingFolder, setEditingFolder] = useState('');
  const [editPwd, setEditPwd] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [r1, r2] = await Promise.all([
      fetch('/api/share-folder').then(r => r.json()).catch(() => ({ folders: [] })),
      fetch('/api/share-records').then(r => r.json()).catch(() => ({ records: [] })),
    ]);
    setFolders(r1.folders || []);
    setRecords(r2.records || []);
    setLoading(false);
  }, []);

  useEffect(() => { if (open) fetchAll(); }, [open, fetchAll]);

  const createFolder = async () => {
    if (!newName) return;
    setCreating(true);
    const r = await fetch('/api/share-folder', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, password: newPwd || undefined, title: newName }),
    });
    const d = await r.json();
    if (d.success) { toast.success('已创建 ' + newName); setNewName(''); setNewPwd(''); fetchAll(); }
    else toast.error(d.error || '创建失败');
    setCreating(false);
  };

  const updatePwd = async (name: string, pwd: string) => {
    await fetch('/api/share-folder', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password: pwd || undefined, title: name }),
    });
    toast.success('密码已更新'); setEditingFolder(''); fetchAll();
  };

  const deleteFolder = async (name: string) => {
    if (!confirm('删除共享文件夹 "' + name + '"？文件夹内容将移到 Recycle。')) return;
    const r = await fetch('/api/share-folder', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const d = await r.json();
    if (d.success) { toast.success('已删除'); fetchAll(); }
    else toast.error(d.error);
  };

  const deleteRecord = async (id: string) => {
    await fetch('/api/share-records?id=' + id, { method: 'DELETE' });
    setRecords(p => p.filter(r => r.id !== id));
    toast.success('已删除');
  };

  const deleteAllRecords = async () => {
    if (!confirm('清空全部分享链接？')) return;
    await Promise.all(records.map(r => fetch('/api/share-records?id=' + r.id, { method: 'DELETE' })));
    setRecords([]); toast.success('已清空');
  };

  const now = Date.now();
  const expiringSoon = records.filter(r => r.expiresAt && r.expiresAt > now && r.expiresAt - now < 86400000);
  const expired = records.filter(r => r.expiresAt && r.expiresAt < now);
  const badge = expiringSoon.length + expired.length;

  const fmtExpiry = (r: ShareRecord) => {
    if (!r.expiresAt) return '永久';
    if (r.expiresAt < now) return '已过期';
    const h = Math.floor((r.expiresAt - now) / 3600000);
    if (h < 1) return '即将过期';
    if (h < 24) return h + '小时后';
    return Math.floor(h/24) + '天后';
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <>
      <Button type='button' variant='outline' size='sm'
        className='w-full h-8 gap-x-1 text-sm text-muted-foreground border-dashed relative'
        onClick={() => setOpen(true)}>
        <MdShare className='text-base' />
        文件管理
        {badge > 0 && (
          <span className='absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] text-[10px] font-bold bg-error text-foreground rounded-full flex items-center justify-center px-1'>
            {badge}
          </span>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='min-w-[340px] max-w-2xl max-h-[80vh] flex flex-col bg-card overflow-hidden'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2 text-base'>
              <MdShare /> 文件管理
            </DialogTitle>
          </DialogHeader>

          {/* 标签切换 */}
          <div className='flex border-b border-border'>
            <button className={'px-4 py-2 text-sm font-medium border-b-2 transition-colors ' + (tab==='folders' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground')}
              onClick={() => setTab('folders')}>
              <MdFolder className='inline mr-1' />共享文件夹
            </button>
            <button className={'px-4 py-2 text-sm font-medium border-b-2 transition-colors relative ' + (tab==='links' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground')}
              onClick={() => setTab('links')}>
              <MdLink className='inline mr-1' />分享链接
              {badge > 0 && <span className='ml-1 text-xs text-warning-foreground'>({badge})</span>}
            </button>
          </div>

          <div className='flex-1 overflow-y-auto min-h-0 space-y-3 pt-2'>
            {loading && <div className='text-center text-sm text-muted-foreground py-8'>加载中...</div>}

            {/* 共享文件夹 tab */}
            {!loading && tab === 'folders' && (
              <div className='space-y-3'>
                {/* 新建 */}
                <div className='flex gap-2 items-end p-3 rounded-lg border border-dashed border-border'>
                  <div className='flex-1 space-y-1.5'>
                    <input placeholder='文件夹名（字母/数字/-/_）' value={newName}
                      onChange={e => setNewName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                      className='w-full text-sm bg-muted px-2 py-1 rounded border border-border outline-none' />
                    <input placeholder='访问密码（留空则无需密码）' value={newPwd}
                      onChange={e => setNewPwd(e.target.value)} type='text'
                      className='w-full text-sm bg-muted px-2 py-1 rounded border border-border outline-none' />
                  </div>
                  <Button size='sm' className='h-[58px] gap-1' onClick={createFolder} disabled={creating || !newName}>
                    <MdAdd />新建
                  </Button>
                </div>

                {folders.length === 0 && !loading && (
                  <div className='text-center text-sm text-muted-foreground py-6'>暂无共享文件夹</div>
                )}

                {folders.map(f => (
                  <div key={f.name} className='p-3 rounded-lg border border-border bg-card-nested space-y-2'>
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center gap-2'>
                        <MdFolder className='text-primary' />
                        <span className='font-medium text-sm'>{f.name}</span>
                        {f.hasPassword && <span className='text-xs text-warning-foreground'>🔒 有密码</span>}
                      </div>
                      <Button variant='ghost' size='icon' className='h-6 w-6 text-error-foreground'
                        onClick={() => deleteFolder(f.name)}>
                        <MdDelete />
                      </Button>
                    </div>
                    {/* 链接 */}
                    <div className='flex gap-2 items-center'>
                      <input readOnly value={origin + '/share/' + f.name}
                        className='flex-1 text-xs bg-muted px-2 py-1 rounded border border-border truncate' />
                      <Button size='sm' className='h-7 text-xs shrink-0'
                        onClick={() => { navigator.clipboard.writeText(origin + '/share/' + f.name); toast.success('已复制！'); }}>
                        复制
                      </Button>
                    </div>
                    {/* 密码编辑 */}
                    {editingFolder === f.name ? (
                      <div className='flex gap-2'>
                        <input placeholder='新密码（留空则移除密码）' value={editPwd}
                          onChange={e => setEditPwd(e.target.value)} type='text'
                          className='flex-1 text-xs bg-muted px-2 py-1 rounded border border-border outline-none' />
                        <Button size='sm' className='h-7 text-xs' onClick={() => updatePwd(f.name, editPwd)}>保存</Button>
                        <Button size='sm' variant='ghost' className='h-7 text-xs' onClick={() => setEditingFolder('')}>取消</Button>
                      </div>
                    ) : (
                      <button className='text-xs text-muted-foreground hover:text-foreground flex items-center gap-1'
                        onClick={() => { setEditingFolder(f.name); setEditPwd(''); }}>
                        <MdEdit className='text-xs' />{f.hasPassword ? '修改密码' : '设置密码'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 分享链接 tab */}
            {!loading && tab === 'links' && (
              <div className='space-y-2'>
                {records.length > 0 && (
                  <div className='flex justify-end'>
                    <Button variant='ghost' size='sm' className='h-7 text-xs text-error-foreground gap-1' onClick={deleteAllRecords}>
                      <MdDeleteSweep className='text-base' />清空全部
                    </Button>
                  </div>
                )}
                {records.length === 0 && <div className='text-center text-sm text-muted-foreground py-8'>暂无分享链接</div>}
                {records.map(r => (
                  <div key={r.id} className={'flex flex-col gap-1.5 p-3 rounded-lg border ' + (r.expiresAt && r.expiresAt < now ? 'border-error/30 bg-error/5' : 'border-border bg-card-nested')}>
                    <div className='flex items-start justify-between gap-2'>
                      <p className='text-sm font-medium truncate flex-1'>{r.fileName}</p>
                      <Button variant='ghost' size='icon' className='h-6 w-6 shrink-0 text-error-foreground' onClick={() => deleteRecord(r.id)}>
                        <MdDelete className='text-base' />
                      </Button>
                    </div>
                    <div className='flex gap-2'>
                      <input readOnly value={origin + r.url} className='flex-1 text-xs bg-muted px-2 py-1 rounded border border-border truncate'
                        onClick={e => (e.target as HTMLInputElement).select()} />
                      <Button size='sm' className='h-7 text-xs shrink-0'
                        onClick={() => { navigator.clipboard.writeText(origin + r.url); toast.success('已复制！'); }}>
                        复制
                      </Button>
                    </div>
                    <div className='flex justify-between text-xs text-muted-foreground'>
                      <span>创建于 {new Date(r.createdAt).toLocaleString('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
                      <span className={r.expiresAt && r.expiresAt < now ? 'text-error-foreground' : r.expiresAt && r.expiresAt - now < 86400000 ? 'text-warning-foreground' : ''}>
                        {fmtExpiry(r)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}