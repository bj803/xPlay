'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useVideoListStore } from '@/store/videoList';
import { VscRefresh } from 'react-icons/vsc';
import { AiOutlineSearch } from 'react-icons/ai';
import {
  MdCreateNewFolder, MdDriveFileMove, MdEdit, MdDelete, MdCheck, MdClose,
  MdKeyboardArrowRight, MdKeyboardArrowDown,
} from 'react-icons/md';

// ── Types ──────────────────────────────────────────────────────────────────
type FBFile = {
  name: string; path: string; size: number; mtime: string | number;
  isDir: boolean; isVideo: boolean; isImage: boolean; isAudio: boolean; ext: string;
  apiPath?: string;
};

type NavFolder = { name: string; path: string };
type NavLevel  = { selected: NavFolder; siblings: NavFolder[]; children: NavFolder[] };

// ── Style tokens (mirrors DownloadContainer / favorites) ───────────────────
const FAVORITES_ROOT = '/additional-browse';

const pillA: React.CSSProperties = {
  height:26,padding:'0 10px',borderRadius:999,
  border:'1.5px solid hsl(var(--primary))',background:'hsl(var(--primary) / 0.12)',
  color:'hsl(var(--primary))',fontSize:12,fontWeight:500,cursor:'pointer',
  display:'inline-flex',alignItems:'center',gap:5,whiteSpace:'nowrap',flexShrink:0,
};
const pillI: React.CSSProperties = {
  height:26,padding:'0 10px',borderRadius:999,
  border:'1px solid hsl(var(--border))',background:'hsl(var(--muted) / 0.5)',
  color:'hsl(var(--muted-foreground))',fontSize:12,fontWeight:500,cursor:'pointer',
  display:'inline-flex',alignItems:'center',gap:5,whiteSpace:'nowrap',flexShrink:0,
};
const pillS: React.CSSProperties = { ...pillI, opacity:0.5 };
const sepSt: React.CSSProperties = {
  fontSize:13,color:'hsl(var(--muted-foreground))',flexShrink:0,userSelect:'none',padding:'0 1px',
};
const dotSt: React.CSSProperties = {
  fontSize:16,color:'hsl(var(--muted-foreground))',flexShrink:0,userSelect:'none',
  padding:'0 3px',lineHeight:1,
};
const iBtn = (active=false): React.CSSProperties => ({
  width:28,height:28,borderRadius:6,
  border:active?'1.5px solid hsl(var(--primary))':'1px solid hsl(var(--border))',
  background:active?'hsl(var(--primary) / 0.1)':'transparent',
  display:'flex',alignItems:'center',justifyContent:'center',
  flexShrink:0,cursor:'pointer',position:'relative',
});
const actionBtn = (danger=false, disabled=false): React.CSSProperties => ({
  height:28,padding:'0 9px',borderRadius:6,
  border:`1px solid ${danger?'hsl(var(--destructive) / 0.4)':'hsl(var(--border))'}`,
  background:'transparent',
  color: disabled ? 'hsl(var(--muted-foreground) / 0.35)'
       : danger   ? 'hsl(var(--destructive))'
       :            'hsl(var(--foreground))',
  fontSize:12,fontWeight:500,cursor:disabled?'not-allowed':'pointer',
  display:'inline-flex',alignItems:'center',gap:4,
  whiteSpace:'nowrap',flexShrink:0,opacity:disabled?0.5:1,
});

// ── Icons ─────────────────────────────────────────────────────────────────
function FolderIcon({ color,size=13 }:{ color:string;size?:number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill={color} style={{flexShrink:0}}>
    <path d="M2 4a1 1 0 011-1h4l1.5 2H13a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V4z"/>
  </svg>;
}
function FileIcon({ color,size=13 }:{ color:string;size?:number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill={color} style={{flexShrink:0}}>
    <path d="M4 1a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V5.5L9.5 1H4zm5 1.5L12.5 5H9.5V2.5z"/>
  </svg>;
}
function fmtSize(b:number) {
  if (!b) return '';
  if (b<1048576) return `${(b/1024).toFixed(1)}KB`;
  if (b<1073741824) return `${(b/1048576).toFixed(1)}MB`;
  return `${(b/1073741824).toFixed(2)}GB`;
}

// ── Main component ─────────────────────────────────────────────────────────
export function FileBrowser() {
  const { setTabMode } = useVideoListStore();

  // ── Nav state (same logic as DC favorites) ────────────────────────────
  const [rootFolders, setRootFolders] = useState<NavFolder[]>([]);
  const [navStack,    setNavStack]    = useState<NavLevel[]>([]);

  // ── File listing ──────────────────────────────────────────────────────
  const [allFiles,   setAllFiles]   = useState<FBFile[]>([]);
  const [subMap,     setSubMap]     = useState<Record<string,FBFile[]>>({});
  const [openDirs,   setOpenDirs]   = useState<Set<string>>(new Set());
  const [loading,    setLoading]    = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Selection ─────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<FBFile|null>(null);
  const selectedRowRef = useRef<HTMLDivElement|null>(null);

  // ── Actions ───────────────────────────────────────────────────────────
  const [renameMode,    setRenameMode]    = useState(false);
  const [renameVal,     setRenameVal]     = useState('');
  const [renameExt,     setRenameExt]     = useState('');
  const [mkdirMode,     setMkdirMode]     = useState(false);
  const [mkdirVal,      setMkdirVal]      = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [openMove,      setOpenMove]      = useState(false);
  const [busy,          setBusy]          = useState(false);

  // ── Sort / Search ─────────────────────────────────────────────────────
  const [search,    setSearch]    = useState('');
  const [showSearch,setShowSearch]= useState(false);
  const [sortOrder, setSortOrder] = useState<'newest'|'oldest'|'name'|'nameDesc'|'sizeAsc'|'sizeDesc'>('newest');
  const [showSort,  setShowSort]  = useState(false);

  const curPath = navStack.length > 0 ? navStack[navStack.length-1].selected.path : FAVORITES_ROOT;

  // ── API helpers ───────────────────────────────────────────────────────
  const fetchSubdirs = useCallback(async (path:string): Promise<NavFolder[]> => {
    try {
      const r = await fetch(`/api/local-files?path=${encodeURIComponent(path)}&listDirs=true`);
      const d = await r.json();
      return (d.subdirs||[]) as NavFolder[];
    } catch { return []; }
  },[]);

  const loadFiles = useCallback(async (path:string) => {
    setLoading(true);
    setSelected(null);
    setRenameMode(false); setMkdirMode(false); setDeleteConfirm(false);
    try {
      const r = await fetch(`/api/local-files?path=${encodeURIComponent(path)}`);
      const d = await r.json();
      setAllFiles([...(d.subdirs||[]).map((sd:NavFolder)=>({
        name:sd.name,path:sd.path,size:0,mtime:'',
        isDir:true,isVideo:false,isImage:false,isAudio:false,ext:'',
      })), ...(d.files||[])]);
    } catch { setAllFiles([]); }
    finally { setLoading(false); }
  },[]);

  const loadSubFiles = async (key:string, path:string) => {
    const r = await fetch(`/api/local-files?path=${encodeURIComponent(path)}`);
    const d = await r.json();
    setSubMap(prev=>({ ...prev, [key]:[
      ...(d.subdirs||[]).map((sd:NavFolder)=>({
        name:sd.name,path:sd.path,size:0,mtime:'',
        isDir:true,isVideo:false,isImage:false,isAudio:false,ext:'',
      })),
      ...(d.files||[]),
    ]}));
  };

  // ── Init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchSubdirs(FAVORITES_ROOT).then(setRootFolders);
    loadFiles(FAVORITES_ROOT);
  },[fetchSubdirs,loadFiles]);

  useEffect(() => { loadFiles(curPath); },[curPath,refreshKey,loadFiles]);

  // ── Nav handlers ──────────────────────────────────────────────────────
  const handleRootClick = async (f:NavFolder) => {
    const children = await fetchSubdirs(f.path);
    setNavStack([{selected:f,siblings:rootFolders,children}]);
  };
  const handleChildClick = async (f:NavFolder) => {
    const top = navStack[navStack.length-1];
    const children = await fetchSubdirs(f.path);
    setNavStack(prev=>[...prev,{selected:f,siblings:top.children,children}]);
  };
  const handleSiblingClick = async (f:NavFolder,idx:number) => {
    const children = await fetchSubdirs(f.path);
    const stack = navStack.slice(0,idx);
    stack.push({selected:f,siblings:navStack[idx].siblings,children});
    setNavStack(stack);
  };
  const handleAncestorClick = async (f:NavFolder,idx:number) => {
    const children = await fetchSubdirs(f.path);
    setNavStack(navStack.slice(0,idx+1).map((l,i)=>
      i===idx?{selected:f,siblings:l.siblings,children}:l
    ));
  };
  const handleGoBack = () => {
    if (navStack.length<=1){setNavStack([]);return;}
    const pi=navStack.length-2;
    handleAncestorClick(navStack[pi].selected,pi);
  };
  const handleReset = () => setNavStack([]);

  // ── Row 1 render ──────────────────────────────────────────────────────
  const renderRow1 = () => {
    const n=navStack.length;
    const chainEnd=Math.max(1,n-1);
    const chain=navStack.slice(0,chainEnd);
    const selectedRootPath=chain.length>0?chain[0].selected.path:null;
    if(chain.length>=3) return (<>
      {chain.map((level,i)=>(
        <span key={level.selected.path} style={{display:'inline-flex',alignItems:'center',gap:5,flexShrink:0}}>
          {i>0&&<span style={sepSt}>/</span>}
          <button type='button' style={pillA} onClick={()=>handleAncestorClick(level.selected,i)}>
            <FolderIcon color='hsl(var(--primary))'/>{level.selected.name}
          </button>
        </span>
      ))}
    </>);
    return (<>
      {rootFolders.map(f=>{
        if(f.path===selectedRootPath) return (
          <span key={f.path} style={{display:'inline-flex',alignItems:'center',gap:5,flexShrink:0}}>
            {chain.map((level,i)=>(
              <span key={level.selected.path} style={{display:'inline-flex',alignItems:'center',gap:5,flexShrink:0}}>
                {i>0&&<span style={sepSt}>/</span>}
                <button type='button' style={pillA} onClick={()=>handleAncestorClick(level.selected,i)}>
                  <FolderIcon color='hsl(var(--primary))'/>{level.selected.name}
                </button>
              </span>
            ))}
          </span>
        );
        return (
          <button key={f.path} type='button'
            style={{...pillI,opacity:selectedRootPath?0.5:1}}
            onClick={()=>handleRootClick(f)}>
            <FolderIcon color='hsl(var(--muted-foreground))'/>{f.name}
          </button>
        );
      })}
    </>);
  };

  // ── Row 2 render ──────────────────────────────────────────────────────
  const renderRow2 = () => {
    const n=navStack.length;
    if(n===0) return null;
    if(n===1) return navStack[0].children.map(c=>(
      <button key={c.path} type='button' style={pillI} onClick={()=>handleChildClick(c)}>
        <FolderIcon color='hsl(var(--muted-foreground))'/>{c.name}
      </button>
    ));
    const deepest=navStack[n-1];
    const siblings=deepest.siblings.filter(s=>s.path!==deepest.selected.path);
    return (<>
      <button type='button' style={pillA} onClick={handleGoBack} title='返回上一层'>
        <FolderIcon color='hsl(var(--primary))'/>{deepest.selected.name}
      </button>
      {deepest.children.map(c=>(
        <button key={c.path} type='button' style={pillI} onClick={()=>handleChildClick(c)}>
          <FolderIcon color='hsl(var(--muted-foreground))'/>{c.name}
        </button>
      ))}
      {siblings.length>0&&(<>
        <span style={dotSt}>·</span>
        {siblings.map(sib=>(
          <button key={sib.path} type='button' style={pillS}
            onClick={()=>handleSiblingClick(sib,n-1)}>
            <FolderIcon color='hsl(var(--muted-foreground))'/>{sib.name}
          </button>
        ))}
      </>)}
    </>);
  };

  // ── File operations ───────────────────────────────────────────────────
  const doRename = async () => {
    if(!selected||!(renameVal.trim()+renameExt).trim()) return;
    setBusy(true);
    try {
      const newName=(renameVal.trim()+renameExt).trim();
      const r=await fetch('/api/move-local-file',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({srcPath:selected.path,destDir:curPath,newName}),
      });
      const d=await r.json();
      if(d.success||d.ok){ setRenameMode(false); setRefreshKey(k=>k+1); }
      else alert(d.error||'改名失败');
    } finally { setBusy(false); }
  };

  const doDelete = async () => {
    if(!selected) return;
    setBusy(true);
    try {
      const r=await fetch(`/api/local-delete?path=${encodeURIComponent(selected.path)}`,{method:'DELETE'});
      const d=await r.json();
      if(d.success||d.ok){ setDeleteConfirm(false); setRefreshKey(k=>k+1); }
      else alert(d.error||'删除失败');
    } finally { setBusy(false); }
  };

  const doMkdir = async () => {
    if(!mkdirVal.trim()) return;
    setBusy(true);
    try {
      const newPath=`${curPath}/${mkdirVal.trim()}`;
      const r=await fetch(`/api/local-files`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'mkdir',path:newPath}),
      });
      const d=await r.json();
      if(d.success||d.ok){ setMkdirMode(false); setMkdirVal(''); setRefreshKey(k=>k+1); }
      else alert(d.error||'新建失败');
    } finally { setBusy(false); }
  };

  const doMove = async (destPath:string) => {
    if(!selected) return;
    setBusy(true);
    try {
      const r=await fetch('/api/move-local-file',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({srcPath:selected.path,destDir:destPath}),
      });
      const d=await r.json();
      if(d.success||d.ok){ setOpenMove(false); setRefreshKey(k=>k+1); }
      else alert(d.error||'移动失败');
    } finally { setBusy(false); }
  };

  // ── Toggle dir expand ─────────────────────────────────────────────────
  const toggleDir = async (f:FBFile) => {
    const key=f.path;
    const next=new Set(openDirs);
    if(next.has(key)){ next.delete(key); setOpenDirs(next); return; }
    next.add(key); setOpenDirs(next);
    if(!subMap[key]) await loadSubFiles(key,f.path);
  };

  // ── Sorted visible list ───────────────────────────────────────────────
  const sorted = [...allFiles]
    .filter(f=>!search||f.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=>{
      if(a.isDir!==b.isDir) return a.isDir?-1:1;
      if(sortOrder==='name')    return a.name.localeCompare(b.name);
      if(sortOrder==='nameDesc') return b.name.localeCompare(a.name);
      if(sortOrder==='newest')  return String(b.mtime).localeCompare(String(a.mtime));
      if(sortOrder==='oldest')  return String(a.mtime).localeCompare(String(b.mtime));
      if(sortOrder==='sizeAsc') return (a.size||0)-(b.size||0);
      if(sortOrder==='sizeDesc') return (b.size||0)-(a.size||0);
      return 0;
    });

  const hasSelected=!!selected;
  const row: React.CSSProperties={ display:'flex',alignItems:'center',gap:0,padding:'7px 12px',minHeight:38 };
  const leftScroll: React.CSSProperties={ display:'flex',alignItems:'center',gap:6,flex:1,minWidth:0,overflowX:'auto',scrollbarWidth:'none',paddingRight:8 };
  const rightSide: React.CSSProperties={ display:'flex',alignItems:'center',gap:6,flexShrink:0,paddingLeft:8,borderLeft:'1px solid hsl(var(--border) / 0.4)',marginLeft:6 };

  const SORT_OPTS=[
    {key:'newest',label:'最新优先'},{key:'oldest',label:'最旧优先'},
    {key:'name',label:'名称 A→Z'},{key:'nameDesc',label:'名称 Z→A'},
    {key:'sizeAsc',label:'大小 ↑'},{key:'sizeDesc',label:'大小 ↓'},
  ] as const;

  // ── File row renderer (recursive for expanded dirs) ───────────────────
  const renderFile = (f:FBFile, depth=0): React.ReactNode => {
    const isSel=selected?.path===f.path;
    const isOpen=openDirs.has(f.path);
    return (
      <div key={f.path}>
        <div
          ref={isSel?(el)=>{selectedRowRef.current=el;}:undefined}
          onClick={()=>{
            if(isSel&&!f.isDir){ setSelected(null); return; }
            setSelected(f);
            setRenameMode(false); setDeleteConfirm(false); setMkdirMode(false);
            if(f.isDir) toggleDir(f);
          }}
          style={{
            display:'flex',alignItems:'center',gap:8,
            padding:`5px 10px 5px ${10+depth*18}px`,
            borderRadius:7,cursor:'pointer',
            background:isSel?'hsl(var(--primary) / 0.1)':'transparent',
            border:isSel?'1px solid hsl(var(--primary) / 0.3)':'1px solid transparent',
          }}
          onMouseEnter={e=>{if(!isSel)(e.currentTarget as HTMLElement).style.background='hsl(var(--muted) / 0.5)';}}
          onMouseLeave={e=>{if(!isSel)(e.currentTarget as HTMLElement).style.background='transparent';}}
        >
          {f.isDir
            ? <span style={{color:'hsl(var(--muted-foreground))',fontSize:12,width:12,flexShrink:0,display:'flex',alignItems:'center'}}>
                {isOpen?<MdKeyboardArrowDown/>:<MdKeyboardArrowRight/>}
              </span>
            : <span style={{width:12,flexShrink:0}}/>
          }
          {f.isDir
            ? <FolderIcon color={isSel?'hsl(var(--primary))':'hsl(38 95% 55%)'} size={14}/>
            : <FileIcon   color={isSel?'hsl(var(--primary))':'hsl(var(--muted-foreground))'} size={14}/>
          }
          <span style={{flex:1,minWidth:0,fontSize:13,
            color:isSel?'hsl(var(--primary))':'hsl(var(--foreground))',
            overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
            {f.name}
          </span>
          {!f.isDir&&f.size>0&&(
            <span style={{fontSize:11,color:'hsl(var(--muted-foreground))',flexShrink:0}}>
              {fmtSize(f.size)}
            </span>
          )}
        </div>
        {f.isDir&&isOpen&&(subMap[f.path]||[]).map(child=>renderFile(child,depth+1))}
      </div>
    );
  };

  return (
    <div style={{display:'flex',flexDirection:'column'}}>

      {/* ── Row 1 ── */}
      <div style={{...row,borderBottom:'1px solid hsl(var(--border) / 0.4)'}}>
        <div style={leftScroll}>
          {/* Three tab buttons */}
          <button type='button'
            style={{height:28,padding:'0 12px',borderRadius:999,border:'1px solid hsl(var(--border))',background:'transparent',color:'hsl(var(--foreground))',fontSize:12,fontWeight:500,cursor:'pointer',whiteSpace:'nowrap',flexShrink:0}}
            onClick={()=>setTabMode('downloads')}>下载目录</button>
          <button type='button'
            style={{height:28,padding:'0 12px',borderRadius:999,border:'1px solid hsl(var(--border))',background:'transparent',color:'hsl(var(--foreground))',fontSize:12,fontWeight:500,cursor:'pointer',whiteSpace:'nowrap',flexShrink:0}}
            onClick={()=>setTabMode('favorites')}>收藏目录</button>
          <button type='button'
            style={{height:28,padding:'0 12px',borderRadius:999,border:'1.5px solid hsl(var(--primary))',background:'hsl(var(--primary))',color:'hsl(var(--primary-foreground))',fontSize:12,fontWeight:500,cursor:'pointer',whiteSpace:'nowrap',flexShrink:0}}
            onClick={()=>{}}>浏览</button>
          {/* Nav pills */}
          <span style={{opacity:navStack.length>0?1:0,...sepSt,padding:'0 2px'}}>|</span>
          {renderRow1()}
        </div>
        <div style={rightSide}>
          <span style={{fontSize:12,color:'hsl(var(--muted-foreground))',whiteSpace:'nowrap'}}>
            共 {sorted.length} 项
          </span>
          <div style={iBtn()}>
            <button type='button' style={{all:'unset',display:'flex',alignItems:'center',justifyContent:'center',width:'100%',height:'100%',cursor:'pointer'}}
              onClick={()=>setRefreshKey(k=>k+1)}>
              <VscRefresh style={{fontSize:14,color:'hsl(var(--muted-foreground))',animation:loading?'spin 1s linear infinite':'none'}}/>
            </button>
          </div>
        </div>
      </div>

      {/* ── Row 2 ── */}
      <div style={{...row,borderBottom:'1px solid hsl(var(--border) / 0.4)'}}>
        <div style={leftScroll}>
          {renderRow2()}
        </div>
        <div style={rightSide}>
          {/* 新建 */}
          <button type='button' style={actionBtn()} onClick={()=>{setMkdirMode(true);setMkdirVal('');setRenameMode(false);}}>
            <MdCreateNewFolder style={{fontSize:13}}/>新建
          </button>
          {/* 改名 */}
          <button type='button' style={actionBtn(false,!hasSelected)} disabled={!hasSelected}
            onClick={()=>{
              if(!selected) return;
              const dot=selected.name.lastIndexOf('.');
              if(!selected.isDir&&dot>0){setRenameVal(selected.name.slice(0,dot));setRenameExt(selected.name.slice(dot));}
              else{setRenameVal(selected.name);setRenameExt('');}
              setRenameMode(true);setDeleteConfirm(false);
            }}>
            <MdEdit style={{fontSize:13}}/>改名
          </button>
          {/* 移动 */}
          <button type='button' style={actionBtn(false,!hasSelected)} disabled={!hasSelected}
            onClick={()=>{if(selected)setOpenMove(true);}}>
            <MdDriveFileMove style={{fontSize:13}}/>移动
          </button>
          {/* 删除 */}
          <button type='button' style={actionBtn(true,!hasSelected)} disabled={!hasSelected}
            onClick={()=>{if(selected)setDeleteConfirm(true);setRenameMode(false);}}>
            <MdDelete style={{fontSize:13}}/>删除
          </button>
          {/* 搜索 */}
          <div style={iBtn(showSearch)}>
            <button type='button' style={{all:'unset',display:'flex',alignItems:'center',justifyContent:'center',width:'100%',height:'100%',cursor:'pointer'}}
              onClick={()=>{setShowSearch(v=>!v);if(showSearch)setSearch('');}}>
              <AiOutlineSearch style={{fontSize:14,color:showSearch?'hsl(var(--primary))':'hsl(var(--muted-foreground))'}}/>
            </button>
          </div>
          {/* 排序 */}
          <div style={iBtn(sortOrder!=='newest')}>
            <button type='button' style={{all:'unset',display:'flex',alignItems:'center',justifyContent:'center',width:'100%',height:'100%',cursor:'pointer'}}
              onClick={()=>setShowSort(v=>!v)}>
              <svg width='15' height='15' viewBox='0 0 16 16' fill='none'
                stroke={sortOrder!=='newest'?'hsl(var(--primary))':'hsl(var(--muted-foreground))'}
                strokeWidth='1.5'><path d='M2 4h12M4 8h8M6 12h4'/></svg>
            </button>
            {showSort&&(
              <>
                <div style={{position:'fixed',inset:0,zIndex:40}} onClick={()=>setShowSort(false)}/>
                <div style={{position:'absolute',right:0,top:32,zIndex:50,background:'hsl(var(--card))',border:'1px solid hsl(var(--border))',borderRadius:10,padding:4,boxShadow:'0 4px 12px rgba(0,0,0,.15)',minWidth:120}}>
                  {SORT_OPTS.map((opt,i)=>{
                    const active=sortOrder===opt.key;
                    return(
                      <div key={opt.key}>
                        {i===4&&<div style={{height:'0.5px',background:'hsl(var(--border))',margin:'4px 8px'}}/>}
                        <button type='button'
                          onClick={()=>{setSortOrder(opt.key as typeof sortOrder);setShowSort(false);}}
                          style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'6px 10px',borderRadius:6,border:'none',cursor:'pointer',fontSize:12,fontWeight:active?500:400,background:active?'hsl(var(--primary) / 0.08)':'transparent',color:active?'hsl(var(--primary))':'hsl(var(--foreground))',textAlign:'left' as const}}>
                          {opt.label}{active&&<span style={{marginLeft:'auto'}}>✓</span>}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Search bar ── */}
      {showSearch&&(
        <div style={{display:'flex',alignItems:'center',height:30,margin:'6px 12px 0',borderRadius:999,border:'1px solid hsl(var(--border))',background:'hsl(var(--muted) / 0.4)',padding:'0 10px',gap:6}}>
          <AiOutlineSearch style={{fontSize:13,color:'hsl(var(--muted-foreground))',flexShrink:0}}/>
          <input autoFocus type='text' value={search} onChange={e=>setSearch(e.target.value)}
            placeholder='搜索文件…'
            style={{background:'transparent',border:'none',outline:'none',fontSize:12,color:'hsl(var(--foreground))',flex:1,minWidth:0}}/>
          {search&&<button type='button' onClick={()=>setSearch('')}
            style={{background:'none',border:'none',cursor:'pointer',padding:0,color:'hsl(var(--muted-foreground))',fontSize:16}}>×</button>}
        </div>
      )}

      {/* ── Inline rename bar ── */}
      {renameMode&&selected&&(
        <div style={{display:'flex',alignItems:'center',gap:6,margin:'6px 12px 0',padding:'6px 10px',background:'hsl(var(--muted) / 0.3)',borderRadius:8,border:'1px solid hsl(var(--border))'}}>
          <span style={{fontSize:12,color:'hsl(var(--muted-foreground))',whiteSpace:'nowrap',flexShrink:0}}>改名：</span>
          <input autoFocus type='text' value={renameVal} onChange={e=>setRenameVal(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter')doRename();if(e.key==='Escape')setRenameMode(false);}}
            style={{flex:1,minWidth:0,background:'transparent',border:'none',outline:'none',fontSize:12,color:'hsl(var(--foreground))'}}/>
          {renameExt&&<span style={{fontSize:12,color:'hsl(var(--muted-foreground))',flexShrink:0}}>{renameExt}</span>}
          <div style={iBtn(true)}>
            <button type='button' disabled={busy} onClick={doRename} style={{all:'unset',display:'flex',alignItems:'center',justifyContent:'center',width:'100%',height:'100%',cursor:'pointer'}}>
              <MdCheck style={{fontSize:14,color:'hsl(var(--primary))'}}/>
            </button>
          </div>
          <div style={iBtn()}>
            <button type='button' onClick={()=>setRenameMode(false)} style={{all:'unset',display:'flex',alignItems:'center',justifyContent:'center',width:'100%',height:'100%',cursor:'pointer'}}>
              <MdClose style={{fontSize:14,color:'hsl(var(--muted-foreground))'}}/>
            </button>
          </div>
        </div>
      )}

      {/* ── Inline mkdir bar ── */}
      {mkdirMode&&(
        <div style={{display:'flex',alignItems:'center',gap:6,margin:'6px 12px 0',padding:'6px 10px',background:'hsl(var(--muted) / 0.3)',borderRadius:8,border:'1px solid hsl(var(--border))'}}>
          <span style={{fontSize:12,color:'hsl(var(--muted-foreground))',whiteSpace:'nowrap',flexShrink:0}}>新建文件夹：</span>
          <input autoFocus type='text' value={mkdirVal} onChange={e=>setMkdirVal(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter')doMkdir();if(e.key==='Escape')setMkdirMode(false);}}
            style={{flex:1,minWidth:0,background:'transparent',border:'none',outline:'none',fontSize:12,color:'hsl(var(--foreground))'}}/>
          <div style={iBtn(true)}>
            <button type='button' disabled={busy} onClick={doMkdir} style={{all:'unset',display:'flex',alignItems:'center',justifyContent:'center',width:'100%',height:'100%',cursor:'pointer'}}>
              <MdCheck style={{fontSize:14,color:'hsl(var(--primary))'}}/>
            </button>
          </div>
          <div style={iBtn()}>
            <button type='button' onClick={()=>setMkdirMode(false)} style={{all:'unset',display:'flex',alignItems:'center',justifyContent:'center',width:'100%',height:'100%',cursor:'pointer'}}>
              <MdClose style={{fontSize:14,color:'hsl(var(--muted-foreground))'}}/>
            </button>
          </div>
        </div>
      )}

      {/* ── Delete confirm bar ── */}
      {deleteConfirm&&selected&&(
        <div style={{display:'flex',alignItems:'center',gap:8,margin:'6px 12px 0',padding:'6px 10px',background:'hsl(var(--destructive) / 0.07)',borderRadius:8,border:'1px solid hsl(var(--destructive) / 0.25)'}}>
          <span style={{fontSize:12,color:'hsl(var(--destructive))',flex:1}}>
            确认删除「{selected.name}」？不可撤销
          </span>
          <button type='button' disabled={busy} onClick={doDelete}
            style={{height:26,padding:'0 10px',borderRadius:6,border:'none',background:'hsl(var(--destructive))',color:'#fff',fontSize:12,cursor:'pointer',flexShrink:0}}>
            确认删除
          </button>
          <div style={iBtn()}>
            <button type='button' onClick={()=>setDeleteConfirm(false)} style={{all:'unset',display:'flex',alignItems:'center',justifyContent:'center',width:'100%',height:'100%',cursor:'pointer'}}>
              <MdClose style={{fontSize:14,color:'hsl(var(--muted-foreground))'}}/>
            </button>
          </div>
        </div>
      )}

      {/* ── Move dialog ── */}
      {openMove&&selected&&(
        <MovePanel
          srcName={selected.name}
          rootFolders={rootFolders}
          fetchSubdirs={fetchSubdirs}
          onMove={doMove}
          onClose={()=>setOpenMove(false)}
        />
      )}

      {/* ── File list ── */}
      <div style={{padding:'8px 12px 12px',minHeight:200}}>
        {loading?(
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            {[1,2,3,4,5].map(i=>(
              <div key={i} style={{height:34,borderRadius:6,background:'hsl(var(--muted) / 0.4)',animation:'pulse 1.5s ease-in-out infinite'}}/>
            ))}
          </div>
        ):sorted.length===0?(
          <div style={{textAlign:'center',padding:'32px 0',color:'hsl(var(--muted-foreground))',fontSize:13}}>
            {search?'没有匹配的文件':'当前目录为空'}
          </div>
        ):(
          <div style={{display:'flex',flexDirection:'column',gap:2}}>
            {sorted.map(f=>renderFile(f))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
      `}</style>
    </div>
  );
}

// ── Move folder picker panel ───────────────────────────────────────────────
function MovePanel({srcName,rootFolders,fetchSubdirs,onMove,onClose}:{
  srcName:string;
  rootFolders:NavFolder[];
  fetchSubdirs:(p:string)=>Promise<NavFolder[]>;
  onMove:(dest:string)=>void;
  onClose:()=>void;
}) {
  const [dest, setDest] = useState(FAVORITES_ROOT);
  const [subDirs, setSubDirs] = useState<NavFolder[]>([]);
  const [curLabel, setCurLabel] = useState('根目录');

  const nav = async (f:NavFolder) => {
    setDest(f.path); setCurLabel(f.name);
    const children = await fetchSubdirs(f.path);
    setSubDirs(children);
  };

  useEffect(()=>{
    fetchSubdirs(FAVORITES_ROOT).then(setSubDirs);
  },[fetchSubdirs]);

  const pillI2: React.CSSProperties={...pillI,height:24,fontSize:11};

  return (
    <div style={{margin:'6px 12px 0',padding:'10px',background:'hsl(var(--muted) / 0.3)',borderRadius:8,border:'1px solid hsl(var(--border))'}}>
      <div style={{fontSize:12,color:'hsl(var(--muted-foreground))',marginBottom:6}}>
        移动「{srcName}」→ <span style={{color:'hsl(var(--foreground))',fontWeight:500}}>{curLabel}</span>
      </div>
      <div style={{display:'flex',flexWrap:'wrap',gap:5,marginBottom:8}}>
        <button type='button'
          style={{...pillI2,...(dest===FAVORITES_ROOT?{borderColor:'hsl(var(--primary))',color:'hsl(var(--primary))',background:'hsl(var(--primary) / 0.1)'}:{})}}
          onClick={()=>{setDest(FAVORITES_ROOT);setCurLabel('根目录');fetchSubdirs(FAVORITES_ROOT).then(setSubDirs);}}>
          <FolderIcon color={dest===FAVORITES_ROOT?'hsl(var(--primary))':'hsl(var(--muted-foreground))'}/>根目录
        </button>
        {subDirs.map(d=>(
          <button key={d.path} type='button'
            style={{...pillI2,...(dest===d.path?{borderColor:'hsl(var(--primary))',color:'hsl(var(--primary))',background:'hsl(var(--primary) / 0.1)'}:{})}}
            onClick={()=>nav(d)}>
            <FolderIcon color={dest===d.path?'hsl(var(--primary))':'hsl(var(--muted-foreground))'}/>
            {d.name}
          </button>
        ))}
      </div>
      <div style={{display:'flex',gap:6}}>
        <button type='button' onClick={()=>onMove(dest)}
          style={{height:26,padding:'0 12px',borderRadius:6,border:'none',background:'hsl(var(--primary))',color:'hsl(var(--primary-foreground))',fontSize:12,cursor:'pointer'}}>
          确认移动
        </button>
        <button type='button' onClick={onClose}
          style={{height:26,padding:'0 12px',borderRadius:6,border:'1px solid hsl(var(--border))',background:'transparent',color:'hsl(var(--muted-foreground))',fontSize:12,cursor:'pointer'}}>
          取消
        </button>
      </div>
    </div>
  );
}
