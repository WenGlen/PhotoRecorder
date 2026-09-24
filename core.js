/* 阿美中會工地紀錄平台 Demo：共用的工具、權限、篩選與元件（手機版、桌機版、後台都用） */
(function () {
  'use strict';

  const PR = (window.PR = window.PR || {});
  if (!window.preact || !window.preactHooks || !window.htm || !window.DEMO) {
    PR.bootFailed = true;
    return;
  }

  const { h } = window.preact;
  const { useState, useEffect, useRef } = window.preactHooks;
  const html = window.htm.bind(h);
  const D = window.DEMO;

  const APP_NAME = '阿美中會工地紀錄平台';
  const NOW = new Date(D.NOW);
  const LOADED_AT = Date.now();
  const nowIso = () => new Date(NOW.getTime() + (Date.now() - LOADED_AT)).toISOString();
  const EDIT_HOURS = 168; // 上傳後一週內，上傳者可以修改、刪除
  const MAX_PHOTOS = 100;
  const MAX_PDF_BYTES = 50 * 1024 * 1024;
  const MAX_PAGE_SCAN_BYTES = 30 * 1024 * 1024; // 超過就不數頁數，避免手機記憶體吃緊
  const TZ = 'Asia/Taipei';
  const GUEST = 'guest';
  const DEFAULT_FILTERS = { cat: 'all', from: '', to: '', tags: [], q: '' };
  const LOG_ACTIONS = ['上傳', '修改', '更新文件', '書審狀態', '刪除', '救回', '永久刪除', '帳號', '設定'];

  const ROLES = {
    admin: { name: '管理者', desc: '全部都能看、能傳，可以修改或刪除所有紀錄；後台要知道網址才進得去' },
    architect: { name: '建築師事務所', desc: '可以傳基本資料和一般分類、切換書審狀態、設定常用關鍵字與子分類' },
    contractor: { name: '承包商', desc: '可以傳工地、活動、請款等一般分類；一週內可以改或刪自己傳的' },
    submitter: { name: '送審員', desc: '可以傳文件書審和一般分類；書審文件隨時都能更新' },
    viewer: { name: '一般檢視者', desc: '只能查看與下載，不能上傳' }
  };
  const ROLE_IDS = Object.keys(ROLES);
  const roleName = id => (ROLES[id] ? ROLES[id].name : '');

  // 書審狀態只有兩種，只有建築師事務所能切換
  const STATUS = {
    pending: { label: '處理中', cls: 'st-pending' },
    pass: { label: '通過', cls: 'st-pass' }
  };

  // ---------- 小工具 ----------
  const pad = n => String(n).padStart(2, '0');
  let seq = 0;
  const uid = prefix => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;
  const toggle = (arr, v) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  const fmtSize = b => (b >= 1048576 ? `${(b / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`);

  const tzFormat = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  function tp(v) {
    const o = {};
    tzFormat.formatToParts(v instanceof Date ? v : new Date(v)).forEach(p => { o[p.type] = p.value; });
    return o;
  }
  const rocYear = y => Number(y) - 1911;
  function roc(d) { const [y, m, dd] = d.split('-'); return `${rocYear(y)}/${m}/${dd}`; }
  function rocShort(d) { const [, m, dd] = d.split('-'); return `${m}/${dd}`; }
  function rocLong(d) { const [y, m, dd] = d.split('-'); return `${rocYear(y)} 年 ${Number(m)} 月 ${Number(dd)} 日`; }
  function rocDT(v) { const o = tp(v); return `${rocYear(o.year)}/${o.month}/${o.day} ${o.hour}:${o.minute}`; }
  function isoDate(v) { const o = tp(v); return `${o.year}-${o.month}-${o.day}`; }
  function toRocInput(d) { const [y, m, dd] = d.split('-'); return `${rocYear(y)}${m}${dd}`; }
  function fromRocInput(s) {
    const t = String(s || '').replace(/\D/g, '');
    if (t.length !== 7) return null;
    const y = Number(t.slice(0, 3)) + 1911;
    const m = Number(t.slice(3, 5));
    const d = Number(t.slice(5, 7));
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (m < 1 || m > 12 || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return `${y}-${pad(m)}-${pad(d)}`;
  }
  /**
   * 檢查 7 位數民國日期，分開「位數不對」和「沒有這一天」兩種錯誤。
   * @param {string} s 使用者輸入，例如 1150918 或 115/09/18
   * @returns {string} 錯誤訊息；日期正確時回傳空字串
   */
  function rocDateError(s) {
    const digits = String(s || '').replace(/\D/g, '');
    if (digits.length !== 7) return '請輸入 7 位數，例如 1150918';
    return fromRocInput(digits) ? '' : '沒有這一天，請再確認月份和日期';
  }

  // ---------- 帳號（帳號管理會改動，由 App 每次繪製時同步進來） ----------
  let USERS = D.users.map(u => ({ ...u }));
  const syncUsers = list => { USERS = list; };
  const userById = id => USERS.find(u => u.id === id) || { id, name: '（不明）', role: 'viewer' };
  const catById = id => D.categories.find(c => c.id === id);
  const subName = (subcats, id) => {
    const s = subcats.find(x => x.id === id);
    return s ? s.name : '';
  };

  // ---------- 權限（正式版要在資料庫層檢查，這裡只控制畫面） ----------
  const isAdmin = u => u.role === 'admin';
  const canUpload = u => u.role !== 'viewer';
  const canUploadCat = (u, c) => canUpload(u) && (!c.roles || c.roles.includes(u.role));
  const canToggleStatus = u => u.role === 'architect';
  const canManageLists = u => u.role === 'admin' || u.role === 'architect';
  const editLeftHours = rec => (new Date(rec.uploadedAt).getTime() + EDIT_HOURS * 3600000 - NOW.getTime()) / 3600000;
  /**
   * 能不能修改紀錄的資料（日期、名稱、關鍵字…）：管理者不限時間，上傳者本人一週內。
   * @param {Object} u 目前的使用者
   * @param {Object} rec 紀錄
   * @returns {boolean}
   */
  const canEdit = (u, rec) => isAdmin(u) || (canUpload(u) && rec.uploaderId === u.id && editLeftHours(rec) > 0);
  /** 能不能刪整筆：一般紀錄跟修改一樣；文件書審不能刪，只剩管理者能刪 */
  const canDelete = (u, rec) => (rec.cat === 'review' ? isAdmin(u) : canEdit(u, rec));
  /** 能不能增刪照片、文件：一般紀錄跟修改一樣；文件書審的文件只能用「更新」換新檔 */
  const canEditFiles = (u, rec) => rec.cat !== 'review' && canEdit(u, rec);
  /** 文件書審的文件：能上傳的人都能更新，不限時間、不限上傳者 */
  const canUpdateDoc = (u, rec) => rec.cat === 'review' && canUpload(u);
  const leftText = hours => (hours >= 24 ? `${Math.floor(hours / 24)} 天` : `${Math.max(1, Math.floor(hours))} 小時`);

  /**
   * 紀錄頁上「還能不能改」的說明。
   * @param {Object} u 目前的使用者
   * @param {Object} rec 紀錄
   * @returns {string} 沒有要說明的時候回傳空字串
   */
  function editNote(u, rec) {
    if (isAdmin(u)) return '管理者可以修改或刪除所有紀錄，不限時間';
    if (!canUpload(u) || rec.uploaderId !== u.id) return '';
    const left = editLeftHours(rec);
    const review = rec.cat === 'review';
    if (left > 0) {
      return review
        ? `你上傳的紀錄，還可以修改資料 ${leftText(left)}；書審文件只能更新、不能刪除`
        : `你上傳的紀錄，還可以修改或刪除 ${leftText(left)}`;
    }
    return review
      ? '已超過一週，不能修改資料；文件還是可以按「更新」換成新檔'
      : '已超過一週，不能修改或刪除。需要更正請找管理者';
  }

  // ---------- 文字 ----------
  function countText(rec) {
    const parts = [];
    if (rec.photos.length) parts.push(`照片 ${rec.photos.length} 張`);
    if (rec.pdfs.length) parts.push(`文件 ${rec.pdfs.length} 份`);
    return parts.join('、');
  }
  // 「王建宏｜承包商」：上傳時綁定登入帳號，不用另外選單位
  const byLine = rec => `${userById(rec.uploaderId).name}｜${roleName(rec.role || userById(rec.uploaderId).role)}`;
  /** PDF 列上直接顯示頁數、上傳日期、上傳者 */
  const docMeta = f => [f.pages ? `${f.pages} 頁` : '頁數未知', `${roc(isoDate(f.uploadedAt))} ${userById(f.uploaderId).name} 上傳`, f.size]
    .filter(Boolean).join('｜');
  const zipText = rec => (rec.photos.length > MAX_PHOTOS
    ? `（Demo）會分成 ${Math.ceil(rec.photos.length / MAX_PHOTOS)} 包下載，每包最多 100 張`
    : `（Demo）會下載一個壓縮檔：${toRocInput(rec.date)}_${rec.title}.zip`);
  function recordLink(id) {
    const base = location.protocol.startsWith('http') ? location.origin + location.pathname : 'https://平台網址/';
    return `${base}?openExternalBrowser=1#/record/${id}`;
  }

  // ---------- 檔案 ----------
  async function readShotAt(file) {
    try {
      if (!window.exifr) return null;
      const tags = await window.exifr.parse(file, ['DateTimeOriginal', 'CreateDate']);
      const v = tags && (tags.DateTimeOriginal || tags.CreateDate);
      return v instanceof Date && !isNaN(v.getTime()) ? v.toISOString() : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * 粗估 PDF 頁數：數檔案裡的頁面物件。物件表有壓縮的 PDF 可能數不到，會回傳 null。
   * 正式版改用 PDF.js 讀，就沒有這個限制。
   * @param {File} file
   * @returns {Promise<number|null>}
   */
  async function countPdfPages(file) {
    if (file.size > MAX_PAGE_SCAN_BYTES) return null;
    try {
      const text = await file.text();
      const pages = (text.match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length;
      if (pages) return pages;
      const counts = (text.match(/\/Count\s+\d+/g) || []).map(s => Number(s.replace(/\D/g, '')));
      return counts.length ? Math.max(...counts) : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * 讀取選到的檔案：分出照片與 PDF、擋掉不支援的格式與太大的 PDF，
   * 並讀出照片的拍攝時間和 PDF 的頁數。
   * @param {FileList|File[]} fileList 選到的檔案
   * @param {'photo'|'pdf'|'auto'} kind 從哪個選檔按鈕進來；auto 表示兩種都收
   * @param {{ room: number, toast: (msg: string) => void }} opts room 是還能再加幾張照片
   * @returns {Promise<Object[]>} 可以加進清單的項目
   */
  async function readFiles(fileList, kind, { room, toast }) {
    const files = Array.from(fileList || []);
    let wrongType = 0;
    let tooBig = 0;
    const photoFiles = [];
    const pdfFiles = [];
    files.forEach(f => {
      const isImg = f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png)$/i.test(f.name);
      const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
      if (isPdf && kind !== 'photo') { if (f.size > MAX_PDF_BYTES) tooBig += 1; else pdfFiles.push(f); return; }
      if (isImg && kind !== 'pdf') { photoFiles.push(f); return; }
      wrongType += 1;
    });
    if (wrongType) toast('只能傳照片或 PDF，Word／Excel 請先轉成 PDF');
    if (tooBig) toast('PDF 單檔上限 50MB，請先壓縮或分冊');
    let keep = photoFiles;
    if (keep.length > room) {
      keep = keep.slice(0, Math.max(0, room));
      toast(`一次最多 ${MAX_PHOTOS} 張，已先加入前 ${keep.length} 張`);
    }
    return Promise.all([
      ...keep.map(async f => ({
        id: uid('f'), kind: 'photo', name: f.name, label: f.name, url: URL.createObjectURL(f), shotAt: await readShotAt(f), tone: '#e5e5e5'
      })),
      ...pdfFiles.map(async f => ({
        id: uid('f'), kind: 'pdf', name: f.name, size: fmtSize(f.size), pages: await countPdfPages(f), url: URL.createObjectURL(f)
      }))
    ]);
  }

  /**
   * 下載單一檔案。這次選進來的檔案有實際內容，直接下載；Demo 的假資料只顯示提示。
   * @param {{ url?: string, name: string }} file
   * @param {(msg: string) => void} toast
   */
  function downloadFile(file, toast) {
    if (!file.url) {
      toast(`（Demo）會下載「${file.name}」`);
      return;
    }
    const a = document.createElement('a');
    a.href = file.url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  const photoFile = p => ({ url: p.url, name: p.name || `${p.label}.jpg` });
  const toPhoto = i => ({ id: i.id, label: i.label, name: i.name, url: i.url, shotAt: i.shotAt, tone: i.tone });
  const toPdf = (i, userId, at) => ({ id: i.id, name: i.name, size: i.size, pages: i.pages, url: i.url, uploaderId: userId, uploadedAt: at });

  // ---------- 篩選 ----------
  const byDateDesc = (a, b) => b.date.localeCompare(a.date) || (new Date(b.uploadedAt) - new Date(a.uploadedAt));

  /**
   * 依篩選條件過濾紀錄，並依資料日期由新到舊排序。
   * @param {Object[]} records
   * @param {Object} f 篩選條件，格式同 DEFAULT_FILTERS；from／to 是 YYYY-MM-DD，前後都含
   * @param {Object[]} subcats 子分類（搜尋時也比對子分類名稱）
   * @returns {Object[]}
   */
  function filterRecords(records, f, subcats) {
    const q = f.q.trim().toLowerCase();
    const [lo, hi] = f.from && f.to && f.from > f.to ? [f.to, f.from] : [f.from, f.to];
    return records.filter(r => {
      if (f.cat !== 'all' && r.cat !== f.cat) return false;
      if (lo && r.date < lo) return false;
      if (hi && r.date > hi) return false;
      if (f.tags.length && !f.tags.some(t => r.tags.includes(t))) return false;
      if (q) {
        const hay = [r.title, r.note, r.tags.join(' '), userById(r.uploaderId).name, subName(subcats, r.sub), r.pdfs.map(p => p.name).join(' ')]
          .join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort(byDateDesc);
  }

  /** 篩選用的關鍵字選項：常用關鍵字照設定的順序排前面，其他紀錄上用到的接在後面 */
  function keywordOptions(data) {
    const used = new Set();
    data.records.forEach(r => r.tags.forEach(t => used.add(t)));
    const rest = [...used].filter(t => !data.tags.includes(t)).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    return [...data.tags, ...rest];
  }

  /** 依子分類分段，順序照子分類的設定；沒有紀錄的子分類不顯示 */
  function groupBySub(recs, subcats) {
    const groups = subcats
      .map(s => ({ key: 's-' + s.id, label: s.name, recs: recs.filter(r => r.sub === s.id) }))
      .filter(g => g.recs.length);
    const rest = recs.filter(r => !subcats.some(s => s.id === r.sub));
    if (rest.length) groups.push({ key: 's-none', label: '未分子分類', recs: rest });
    return groups;
  }

  function groupByPeriod(recs) {
    const nos = [...new Set(recs.map(r => r.period))].sort((a, b) => b - a);
    return nos.map(no => ({ key: `p${no}`, no, label: `第 ${no} 期`, recs: recs.filter(r => r.period === no) }));
  }

  /**
   * 列表怎麼分段：文件書審、材料測試報告依子分類，請款依期別，其他不分段。
   * @param {string} catId 目前選的分類（all 表示全部）
   * @param {Object[]} recs 已經篩選、排序好的紀錄
   * @param {Object[]} subcats 子分類
   * @returns {Object[]|null} 不分段時回傳 null
   */
  function groupFor(catId, recs, subcats) {
    const c = catById(catId);
    if (c && c.sub) return groupBySub(recs, subcats);
    if (catId === 'billing') return groupByPeriod(recs);
    return null;
  }

  // ---------- 路由（固定網址） ----------
  function parseHash() {
    const raw = location.hash.replace(/^#/, '') || '/';
    const [path, qs] = raw.split('?');
    const [a, b] = path.split('/').filter(Boolean);
    const query = Object.fromEntries(new URLSearchParams(qs || ''));
    if (a === 'record' && b) return { name: 'record', id: b };
    if (a === 'edit' && b) return { name: 'edit', id: b };
    if (a === 'billing') return { name: 'billing' };
    if (a === 'settings' && b) return { name: 'settings', id: b };
    // 後台：平台裡沒有任何入口，要知道網址才進得來
    if (a === 'backstage') return { name: 'backstage', id: b || 'accounts' };
    if (a === 'upload') return { name: 'upload', query };
    return { name: 'home' };
  }

  // ---------- 初始資料與操作紀錄 ----------
  const logEntry = (userId, action, target, detail) => ({ id: uid('l'), at: nowIso(), userId, action, target, detail: detail || '' });

  function seedLog(records, deleted) {
    const log = [];
    const push = (at, userId, action, target, detail) => log.push({ id: uid('l'), at, userId, action, target, detail: detail || '' });
    const uploadDetail = r => `${catById(r.cat).name}，${countText(r)}`;
    records.forEach(r => {
      push(r.uploadedAt, r.uploaderId, '上傳', r.title, uploadDetail(r));
      if (r.editedAt) push(r.editedAt, r.editedBy, '修改', r.title, '改了：備註');
      r.pdfs.filter(p => p.uploadedAt !== r.uploadedAt).forEach(p => push(p.uploadedAt, p.uploaderId, '更新文件', r.title, `換成 ${p.name}`));
      if (r.statusAt) push(r.statusAt, r.statusBy, '書審狀態', r.title, `${STATUS.pending.label} 改成 ${STATUS[r.status].label}`);
    });
    deleted.forEach(r => {
      push(r.uploadedAt, r.uploaderId, '上傳', r.title, uploadDetail(r));
      push(r.deletedAt, r.deletedBy, '刪除', r.title, r.deleteNote || catById(r.cat).name);
    });
    D.accountEvents.forEach(e => push(e.at, e.userId, e.action, e.target, e.detail));
    return log.sort((a, b) => new Date(b.at) - new Date(a.at));
  }

  function initialData() {
    const records = D.records.map(r => ({ ...r }));
    const deleted = D.deletedRecords.map(r => ({ ...r }));
    return {
      records,
      deleted,
      periods: D.periods.map(p => ({ ...p })),
      tags: [...D.tags],
      subcats: D.subcats.map(s => ({ ...s })),
      log: seedLog(records, deleted)
    };
  }
  const initialUsers = () => D.users.map(u => ({ ...u }));

  // ---------- 圖示 ----------
  const ICONS = {
    back: () => html`<path d="M15 18l-6-6 6-6" />`,
    close: () => html`<path d="M18 6L6 18M6 6l12 12" />`,
    search: () => html`<circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />`,
    camera: () => html`<path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" />`,
    image: () => html`<rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-8 9" />`,
    file: () => html`<path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4" />`,
    check: () => html`<path d="M5 12.5l4.5 4.5L19 7.5" />`,
    left: () => html`<path d="M15 18l-6-6 6-6" />`,
    right: () => html`<path d="M9 18l6-6-6-6" />`,
    up: () => html`<path d="M6 15l6-6 6 6" />`,
    down: () => html`<path d="M6 9l6 6 6-6" />`,
    plus: () => html`<path d="M12 5v14M5 12h14" />`,
    download: () => html`<path d="M12 4v11M7 10l5 5 5-5M5 20h14" />`,
    upload: () => html`<path d="M12 20V9M7 14l5-5 5 5M5 4h14" />`,
    calendar: () => html`<rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />`,
    refresh: () => html`<path d="M21 4v6h-6" /><path d="M19.5 15a8 8 0 1 1-1.9-8.3L21 10" />`
  };
  function Icon({ name, size = 24, stroke = 2 }) {
    return html`<svg class="icon" width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width=${stroke} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]()}</svg>`;
  }

  // ---------- 共用元件 ----------
  /**
   * 照片：有實際檔案就顯示圖片，否則用底色示意。
   * big 用在預覽彈窗，示意圖畫成 4:3、依彈窗大小縮放；bare 用在小格子（上面已疊了其他資訊，不印文字）。
   */
  function Photo({ p, big, bare }) {
    const [broken, setBroken] = useState(false);
    if (p.url && !broken) {
      return html`<img class=${big ? 'lb-img' : 'ph-img'} src=${p.url} alt=${p.label} loading="lazy" onError=${() => setBroken(true)} />`;
    }
    const label = broken ? '這張無法預覽' : p.label;
    if (big) {
      return html`<svg class="ph-svg" viewBox="0 0 400 300" role="img" aria-label=${label}>
        <rect width="400" height="300" fill=${p.tone || '#e5e5e5'} />
        <text x="200" y="158" text-anchor="middle" font-size="22" fill="#475569">${label}</text>
      </svg>`;
    }
    return html`<div class="ph" style=${{ background: p.tone || '#e5e5e5' }}>
      ${!bare && html`<span>${label}</span>`}
    </div>`;
  }

  function TopBar({ title, onBack, backLabel = '返回', right }) {
    return html`<header class="topbar">
      ${onBack && html`<button class="back-btn" onClick=${onBack}><${Icon} name="back" size=${28} /><span>${backLabel}</span></button>`}
      <div class="topbar-title">${title}</div>
      ${right}
    </header>`;
  }

  function useBodyLock() {
    useEffect(() => {
      document.body.classList.add('no-scroll');
      return () => document.body.classList.remove('no-scroll');
    }, []);
  }

  function useEscape(onClose) {
    useEffect(() => {
      const onKey = e => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
  }

  function Sheet({ title, onClose, children }) {
    useBodyLock();
    useEscape(onClose);
    return html`
      <div class="overlay" onClick=${onClose}></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-label=${title}>
        <div class="sheet-head">
          <h2>${title}</h2>
          <button class="icon-btn" aria-label="關閉" onClick=${onClose}><${Icon} name="close" size=${28} /></button>
        </div>
        <div class="sheet-body">${children}</div>
      </div>`;
  }

  function DemoBar({ user, mode, onToggleMode, onOpen }) {
    return html`<div class="demo-bar">
      <span class="demo-who">Demo｜${user ? user.name : '未登入'}</span>
      <div class="demo-actions">
        <button onClick=${onToggleMode}>${mode === 'desktop' ? '看手機版' : '看桌機版'}</button>
        <button onClick=${onOpen}>切換身分</button>
      </div>
    </div>`;
  }

  function DisabledScreen({ user }) {
    return html`<main class="empty disabled-screen">
      <p class="page-title">這個帳號已經停用</p>
      <p>${user.email} 沒辦法進入平台。如果需要，請聯絡管理者。</p>
      <p class="muted">（Demo）按上方「切換身分」換成其他人。</p>
    </main>`;
  }

  // 未登入：不管開哪個網址（包含 LINE 分享的紀錄連結）都先看到這一頁
  function LoginScreen({ toast }) {
    return html`<main class="login">
      <h1 class="login-title">${APP_NAME}</h1>
      <p class="muted">只有管理者加入名單的 Google 帳號能登入。</p>
      <button class="btn btn-primary btn-block btn-lg" onClick=${() => toast('（Demo）正式版會跳到 Google 登入；請按上方「切換身分」選一個身分')}>
        用 Google 帳號登入
      </button>
      <p class="hint">收到 LINE 分享的連結，也要先登入才看得到內容。</p>
    </main>`;
  }

  // ---------- 預覽彈窗（照片、PDF） ----------
  function Lightbox({ rec, index, onIndex, onClose, toast }) {
    useBodyLock();
    const startX = useRef(null);
    const total = rec.photos.length;
    const p = rec.photos[Math.min(index, total - 1)];
    // 方向鍵連按時要從最新的那張往下算，所以 index 放在 ref；鍵盤監聽只掛一次，透過 ref 拿最新的函式
    const idx = useRef(index);
    idx.current = index;
    const go = d => {
      const n = idx.current + d;
      if (n < 0 || n >= total) return;
      idx.current = n;
      onIndex(n);
    };
    const latest = useRef(null);
    latest.current = { go, onClose };
    useEffect(() => {
      const onKey = e => {
        if (e.key === 'Escape') latest.current.onClose();
        if (e.key === 'ArrowRight') latest.current.go(1);
        if (e.key === 'ArrowLeft') latest.current.go(-1);
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, []);
    if (!p) return null;
    // 觸控事件用小寫 ontouchstart：Preact 會直接當成 touchstart，不靠瀏覽器有沒有 ontouchstart 屬性來猜大小寫
    return html`
      <div class="overlay modal-mask" onClick=${onClose}></div>
      <div class="modal lb" role="dialog" aria-modal="true" aria-label="照片預覽">
        <div class="modal-head">
          <div class="modal-title">
            <span class="modal-name">${rec.title}</span>
            <span class="modal-sub">第 ${index + 1} / ${total} 張</span>
          </div>
          <button class="icon-btn" aria-label="關閉" onClick=${onClose}><${Icon} name="close" size=${28} /></button>
        </div>
        <div class="lb-stage"
          ontouchstart=${e => { startX.current = e.touches[0].clientX; }}
          ontouchend=${e => {
            if (startX.current == null) return;
            const dx = e.changedTouches[0].clientX - startX.current;
            if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
            startX.current = null;
          }}>
          <${Photo} key=${p.id} p=${p} big />
          ${index > 0 && html`<button class="lb-nav prev" aria-label="上一張" onClick=${() => go(-1)}><${Icon} name="left" size=${32} /></button>`}
          ${index < total - 1 && html`<button class="lb-nav next" aria-label="下一張" onClick=${() => go(1)}><${Icon} name="right" size=${32} /></button>`}
        </div>
        <div class="modal-foot">
          <div class="lb-info">
            <div>拍攝時間：${p.shotAt ? rocDT(p.shotAt) : '讀不到'}</div>
            <div>上傳：${userById(rec.uploaderId).name}｜${rocDT(rec.uploadedAt)}</div>
          </div>
          <button class="btn btn-outline" onClick=${() => downloadFile(photoFile(p), toast)}><${Icon} name="download" />下載這張</button>
        </div>
      </div>`;
  }

  function PdfViewer({ pdf, onClose, toast }) {
    useBodyLock();
    useEscape(onClose);
    const pages = pdf.pages || 1;
    const shown = Math.min(pages, 3);
    return html`
      <div class="overlay modal-mask" onClick=${onClose}></div>
      <div class="modal pdfv" role="dialog" aria-modal="true" aria-label="文件預覽">
        <div class="modal-head">
          <div class="modal-title">
            <span class="modal-name">${pdf.name}</span>
            <span class="modal-sub">${docMeta(pdf)}</span>
          </div>
          <button class="btn btn-outline sm" onClick=${() => downloadFile(pdf, toast)}><${Icon} name="download" size=${20} />下載</button>
          <button class="icon-btn" aria-label="關閉" onClick=${onClose}><${Icon} name="close" size=${28} /></button>
        </div>
        ${pdf.url
          ? html`<div class="pdfv-body real">
              <iframe class="pdfv-frame" src=${pdf.url} title=${pdf.name}></iframe>
              <a class="link-btn pdfv-open" href=${pdf.url} target="_blank" rel="noopener">看不到內容？用瀏覽器開啟</a>
            </div>`
          : html`<div class="pdfv-body">
              <div class="pdfv-note">Demo 示意：正式版用 PDF.js 顯示真實內容，可以放大、往下捲${pdf.pages ? `，這份共 ${pdf.pages} 頁` : ''}</div>
              <div class="pdfv-inner">
                ${Array.from({ length: shown }, (_, i) => html`<div class="page-sheet">
                  <div class="page-no">第 ${i + 1} / ${pages} 頁</div>
                  <div class="page-h">${pdf.name.replace(/\.pdf$/i, '')}</div>
                  ${[92, 78, 85, 64, 90, 72, 48, 81, 67].map(w => html`<div class="page-line" style=${{ width: w + '%' }}></div>`)}
                </div>`)}
                ${pages > shown && html`<div class="pdfv-more">其餘 ${pages - shown} 頁往下捲時才載入（示意）</div>`}
              </div>
            </div>`}
      </div>`;
  }

  // ---------- 書審狀態、文件列表 ----------
  /** 書審狀態：建築師事務所直接點選切換，其他人只看得到目前狀態 */
  function StatusBlock({ rec, user, actions }) {
    const can = canToggleStatus(user);
    const cur = STATUS[rec.status] || STATUS.pending;
    return html`<div class="status-block">
      <div class="status-row">
        <span class="status-label">書審狀態</span>
        ${can
          ? html`<div class="seg status-seg" role="group" aria-label="書審狀態">
              ${Object.entries(STATUS).map(([k, s]) => html`<button data-st=${k} class=${rec.status === k ? 'on' : ''}
                aria-pressed=${rec.status === k} onClick=${() => actions.setStatus(rec.id, k)}>${s.label}</button>`)}
            </div>`
          : html`<span class=${'st lg ' + cur.cls}>${cur.label}</span>`}
      </div>
      <div class="meta">${rec.statusAt ? `最後更新：${userById(rec.statusBy).name}｜${rocDT(rec.statusAt)}` : '送出後還沒有更新過狀態'}</div>
      ${!can && html`<div class="meta">狀態由建築師事務所更新</div>`}
    </div>`;
  }

  /** 紀錄裡的 PDF：點一下預覽，每份都能單獨下載；文件書審另有「更新」換新檔（直接覆蓋） */
  function DocList({ rec, user, actions }) {
    const canUpdate = canUpdateDoc(user, rec);
    return html`<ul class="file-list">
      ${rec.pdfs.map(f => html`<li class="doc" key=${f.id}>
        <button class="file-row" onClick=${() => actions.openPdf(rec.id, f.id)}>
          <${Icon} name="file" />
          <span class="file-name">${f.name}</span>
          <span class="file-meta">${docMeta(f)}</span>
        </button>
        <div class="doc-actions">
          <button class="btn btn-outline sm" onClick=${() => downloadFile(f, actions.toast)}><${Icon} name="download" size=${20} />下載</button>
          ${canUpdate && html`<label class="btn btn-outline sm pick-inline">
            <input type="file" accept="application/pdf,.pdf"
              onChange=${e => { actions.updateDoc(rec.id, f.id, e.target.files[0]); e.target.value = ''; }} />
            <${Icon} name="refresh" size=${20} />更新
          </label>`}
        </div>
      </li>`)}
    </ul>
    ${canUpdate && html`<p class="hint">書審文件不能刪除；要換成新檔請按「更新」，新檔會直接取代舊檔，更新紀錄會留在操作紀錄。</p>`}`;
  }

  // ---------- 日期欄 ----------
  /**
   * 民國年日期欄：可以直接打 7 位數，也可以按日曆鈕叫出系統的日期選單。
   * @param {{ value: string, onChange: (v: string) => void, id?: string, ariaLabel?: string,
   *   placeholder?: string, invalid?: boolean, compact?: boolean }} props value 是欄位裡的文字，例如 1150918
   */
  function DateInput({ value, onChange, id, ariaLabel, placeholder, invalid, compact }) {
    const iso = fromRocInput(value);
    // 桌機瀏覽器點到透明的日期欄不一定會打開選單，要主動叫 showPicker；手機點下去本來就會打開
    const openPicker = e => {
      try { e.currentTarget.showPicker(); } catch (err) { /* 不支援就交給瀏覽器預設行為 */ }
    };
    return html`<div class=${'date-input' + (compact ? ' sm' : '')}>
      <input id=${id} class="input" inputmode="numeric" maxlength="9" autocomplete="off" aria-label=${ariaLabel}
        aria-invalid=${invalid ? 'true' : undefined} placeholder=${placeholder} value=${value} onInput=${e => onChange(e.target.value)} />
      <label class="date-pick" title="用日曆選日期">
        <${Icon} name="calendar" size=${compact ? 20 : 24} />
        <span class="sr-only">用日曆選日期</span>
        <input type="date" tabIndex="-1" value=${iso || ''} onClick=${openPicker}
          onChange=${e => { if (e.target.value) onChange(toRocInput(e.target.value)); }} />
      </label>
    </div>`;
  }

  // 日期區間的一端：自己保留打到一半的文字，打完 7 位數（或清空）才更新篩選條件
  function RangeEnd({ label, placeholder, value, onChange, compact }) {
    const [text, setText] = useState(value ? toRocInput(value) : '');
    useEffect(() => {
      if (fromRocInput(text) !== (value || null)) setText(value ? toRocInput(value) : '');
    }, [value]);
    const bad = text.trim() !== '' && !fromRocInput(text);
    return html`<div class="dr-end">
      <span class="dr-label">${label}</span>
      <${DateInput} value=${text} invalid=${bad} ariaLabel=${'日期區間：' + (placeholder || label)} placeholder=${placeholder} compact=${compact}
        onChange=${v => {
          setText(v);
          const iso = fromRocInput(v);
          if (iso || v.trim() === '') onChange(iso || '');
        }} />
    </div>`;
  }

  /**
   * 搜尋用的日期區間。
   * @param {{ from: string, to: string, onChange: (patch: {from: string, to: string}) => void, compact?: boolean }} props
   *   from／to 是 YYYY-MM-DD 或空字串
   */
  function DateRange({ from, to, onChange, compact }) {
    // 桌機欄位窄，提示字寫「開始日／結束日」；手機欄位上方已經有「從／到」，提示字放格式範例
    return html`<div class=${'date-range' + (compact ? ' sm' : '')} role="group" aria-label="日期區間">
      <${RangeEnd} label=${compact ? '日期' : '從'} placeholder=${compact ? '開始日' : '1150901'} value=${from} compact=${compact}
        onChange=${v => onChange({ from: v, to })} />
      <span class="dr-sep" aria-hidden="true">～</span>
      <${RangeEnd} label=${compact ? '' : '到'} placeholder=${compact ? '結束日' : '1150930'} value=${to} compact=${compact}
        onChange=${v => onChange({ from, to: v })} />
    </div>`;
  }

  // ---------- 表單欄位（上傳與修改共用） ----------
  function validate(form, catId) {
    const dateErr = rocDateError(form.dateInput);
    if (dateErr) return `資料日期：${dateErr}`;
    if (!form.title.trim()) return '請填寫項目名稱';
    const c = catById(catId);
    if (c && c.sub) {
      if (!form.sub) return '請選擇子分類';
      if (form.sub === '__new' && !form.newSubName.trim()) return '請填寫新子分類的名稱';
    }
    if (catId === 'billing' && !form.period) return '請選擇請款期別';
    return '';
  }

  function Fields({ form, setForm, catId, user, data }) {
    const set = patch => setForm(prev => ({ ...prev, ...patch }));
    const iso = fromRocInput(form.dateInput);
    const cat = catId ? catById(catId) : null;
    const allTags = [...data.tags, ...form.tags.filter(t => !data.tags.includes(t))];
    const maxPeriod = Math.max(0, ...data.periods.map(p => p.no));
    const addCustom = () => {
      const t = form.customTag.trim();
      if (!t) return;
      setForm(prev => ({ ...prev, tags: prev.tags.includes(t) ? prev.tags : [...prev.tags, t], customTag: '' }));
    };
    return html`
      <div class="field">
        <label class="field-label" for="f-date">資料日期<span class="req">必填</span></label>
        <${DateInput} id="f-date" value=${form.dateInput} invalid=${!iso} onChange=${v => set({ dateInput: v, dateNote: null })} />
        <div class=${iso ? 'hint' : 'hint err'}>${iso ? rocLong(iso) : rocDateError(form.dateInput)}</div>
        ${form.dateNote && html`<div class=${'notice ' + form.dateNote.kind}>${form.dateNote.text}</div>`}
      </div>

      ${cat && cat.sub && html`<div class="field">
        <label class="field-label" for="f-sub">子分類<span class="req">必填</span></label>
        <select id="f-sub" class="select" value=${form.sub} onChange=${e => set({ sub: e.target.value })}>
          <option value="">請選擇</option>
          ${data.subcats.map(s => html`<option value=${s.id}>${s.name}</option>`)}
          ${canManageLists(user) && html`<option value="__new">＋新增子分類</option>`}
        </select>
        ${form.sub === '__new' && html`<input class="input" aria-label="新子分類名稱" placeholder="例如：外牆磁磚"
          value=${form.newSubName} onInput=${e => set({ newSubName: e.target.value })} />`}
        <div class="hint">文件書審和材料測試報告共用同一份子分類${canManageLists(user) ? '' : '；要新增子分類請找建築師事務所'}</div>
      </div>`}

      ${catId === 'billing' && html`<div class="field">
        <label class="field-label" for="f-period">請款期別<span class="req">必填</span></label>
        <select id="f-period" class="select" value=${form.period} onChange=${e => set({ period: e.target.value })}>
          <option value="">請選擇</option>
          ${[...data.periods].sort((a, b) => b.no - a.no).map(p => html`<option value=${String(p.no)}>第 ${p.no} 期</option>`)}
          <option value="__new">＋新增第 ${maxPeriod + 1} 期</option>
        </select>
      </div>`}

      <div class="field">
        <label class="field-label" for="f-title">項目名稱<span class="req">必填</span></label>
        <input id="f-title" class="input" placeholder="例如：三樓版灌漿" value=${form.title} onInput=${e => set({ title: e.target.value })} />
        ${(D.recentNames[catId] || []).length > 0 && html`
          <div class="hint">點下面的字可以直接帶入</div>
          <div class="chips">
            ${D.recentNames[catId].map(n => html`<button type="button" class="tag" onClick=${() => set({ title: n })}>${n}</button>`)}
          </div>`}
      </div>

      <div class="field">
        <div class="field-label">關鍵字<span class="opt-tag">可不選，可以選好幾個</span></div>
        <div class="chips">
          ${allTags.map(t => html`<button type="button" class=${'tag' + (form.tags.includes(t) ? ' on' : '')}
            aria-pressed=${form.tags.includes(t)} onClick=${() => setForm(prev => ({ ...prev, tags: toggle(prev.tags, t) }))}>${t}</button>`)}
        </div>
        <div class="inline-add">
          <input class="input" aria-label="自訂關鍵字" placeholder="其他關鍵字" value=${form.customTag}
            onInput=${e => set({ customTag: e.target.value })} onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }} />
          <button type="button" class="btn btn-outline" onClick=${addCustom}>加入</button>
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="f-note">備註說明<span class="opt-tag">可不填</span></label>
        <textarea id="f-note" class="textarea" rows="3" placeholder="可以按鍵盤上的麥克風用說的"
          value=${form.note} onInput=${e => set({ note: e.target.value })}></textarea>
      </div>`;
  }

  /**
   * 表單選的子分類。選「＋新增子分類」時，同名的就沿用，沒有才建新的。
   * @returns {{ id: string, created: Object|null }} created 是這次新建的子分類
   */
  function resolveSub(form, data) {
    if (form.sub !== '__new') return { id: form.sub, created: null };
    const name = form.newSubName.trim();
    const same = data.subcats.find(s => s.name === name);
    if (same) return { id: same.id, created: null };
    const created = { id: uid('sc'), name };
    return { id: created.id, created };
  }

  const editFormOf = rec => ({
    dateInput: toRocInput(rec.date), dateNote: null, title: rec.title, tags: [...rec.tags], customTag: '', note: rec.note || '',
    period: rec.period ? String(rec.period) : '', sub: rec.sub || '', newSubName: '',
    photos: [...rec.photos], pdfs: [...rec.pdfs], added: []
  });

  /**
   * 把修改表單轉成要套用到紀錄上的欄位。
   * @returns {{ error: string } | { patch: Object, newPeriod: Object|null, newSub: Object|null }}
   */
  function buildEditPatch(rec, form, user, data) {
    const fileCount = form.photos.length + form.pdfs.length + form.added.length;
    const error = validate(form, rec.cat) || (fileCount ? '' : '至少要留一張照片或一份文件；要整筆刪除請按「刪除」');
    if (error) return { error };
    const at = nowIso();
    const patch = {
      date: fromRocInput(form.dateInput), title: form.title.trim(), tags: form.tags, note: form.note.trim(),
      photos: [...form.photos, ...form.added.filter(i => i.kind === 'photo').map(toPhoto)],
      pdfs: [...form.pdfs, ...form.added.filter(i => i.kind === 'pdf').map(i => toPdf(i, user.id, at))],
      editedBy: user.id, editedAt: at
    };
    let newPeriod = null;
    let newSub = null;
    if (rec.cat === 'billing') {
      if (form.period === '__new') {
        patch.period = Math.max(0, ...data.periods.map(p => p.no)) + 1;
        newPeriod = { no: patch.period, date: patch.date };
      } else {
        patch.period = Number(form.period);
      }
    }
    if (catById(rec.cat).sub) {
      const s = resolveSub(form, data);
      patch.sub = s.id;
      newSub = s.created;
    }
    return { patch, newPeriod, newSub };
  }

  // 修改時增刪照片與文件（文件書審不用這個，文件改用「更新」）
  function EditFiles({ form, setForm, toast }) {
    const [reading, setReading] = useState(false);
    const photos = [...form.photos, ...form.added.filter(i => i.kind === 'photo')];
    const pdfs = [...form.pdfs, ...form.added.filter(i => i.kind === 'pdf')];
    const remove = id => setForm(prev => ({
      ...prev,
      photos: prev.photos.filter(x => x.id !== id),
      pdfs: prev.pdfs.filter(x => x.id !== id),
      added: prev.added.filter(x => x.id !== id)
    }));
    const add = async files => {
      setReading(true);
      const items = await readFiles(files, 'auto', { room: MAX_PHOTOS - photos.length, toast });
      setForm(prev => ({ ...prev, added: [...prev.added, ...items] }));
      setReading(false);
    };
    return html`<div class="field">
      <div class="field-label">照片 ${photos.length} 張、文件 ${pdfs.length} 份</div>
      ${photos.length > 0 && html`<div class="sel-grid">
        ${photos.map(p => html`<div class="sel-item" key=${p.id}>
          <${Photo} p=${p} bare />
          <button class="sel-remove" aria-label=${'移除 ' + p.label} onClick=${() => remove(p.id)}><${Icon} name="close" size=${20} /></button>
        </div>`)}
      </div>`}
      ${pdfs.length > 0 && html`<ul class="file-list">
        ${pdfs.map(f => html`<li key=${f.id}><div class="file-row">
          <${Icon} name="file" />
          <span class="file-name">${f.name}</span>
          <span class="file-meta">${f.size}</span>
          <button class="icon-btn file-remove" aria-label=${'移除 ' + f.name} onClick=${() => remove(f.id)}><${Icon} name="close" /></button>
        </div></li>`)}
      </ul>`}
      <label class="btn btn-outline btn-block pick-inline">
        <input type="file" multiple accept="image/*,application/pdf,.pdf" onChange=${e => { add(e.target.files); e.target.value = ''; }} />
        <${Icon} name="plus" />加入照片或文件
      </label>
      ${reading && html`<div class="notice info">正在讀取檔案…</div>`}
      <div class="hint">移除或加入的照片、文件，按「儲存」後才會生效</div>
    </div>`;
  }

  // ---------- 上傳 ----------
  // 模擬逐張上傳：同時傳 3 張；dropAt > 0 時，傳到第幾張會模擬斷線一次
  function createUploader(total, { dropAt, onUpdate, onDone }) {
    const st = Array(total).fill('wait');
    const queue = [...Array(total).keys()];
    const active = new Map();
    let paused = false;
    let stopped = false;
    let dropped = false;
    let done = 0;

    function pump() {
      if (paused || stopped) return;
      while (active.size < 3 && queue.length) {
        const i = queue.shift();
        st[i] = 'up';
        const timer = setTimeout(() => {
          active.delete(i);
          st[i] = 'done';
          done += 1;
          if (dropAt && !dropped && done >= dropAt && done < total) {
            dropped = true;
            pause();
            onUpdate([...st], true);
            return;
          }
          onUpdate([...st], false);
          if (done === total) onDone();
          else pump();
        }, 520 + (i % 3) * 170);
        active.set(i, timer);
      }
      onUpdate([...st], false);
    }
    function pause() {
      paused = true;
      [...active.keys()].reverse().forEach(i => { clearTimeout(active.get(i)); st[i] = 'wait'; queue.unshift(i); });
      active.clear();
    }
    return {
      start: pump,
      resume() { paused = false; pump(); },
      stop() { stopped = true; active.forEach(t => clearTimeout(t)); active.clear(); }
    };
  }

  function dateFromItems(items) {
    const photos = items.filter(i => i.kind === 'photo');
    const dated = photos.filter(p => p.shotAt).map(p => isoDate(p.shotAt)).sort();
    let date = isoDate(NOW);
    let dateNote = null;
    if (dated.length) {
      date = dated[0];
      const lastDay = dated[dated.length - 1];
      if (lastDay !== date) dateNote = { kind: 'info', text: `這批照片拍攝於 ${rocShort(date)}～${rocShort(lastDay)}，已帶入最早的一天` };
      if (dated.length < photos.length) dateNote = { kind: 'warn', text: `有 ${photos.length - dated.length} 張讀不到拍攝日期，已帶入其他照片最早的一天，請確認` };
    } else if (photos.length) {
      dateNote = { kind: 'warn', text: '讀不到拍攝日期，已先填今天，請確認' };
    }
    return { dateInput: toRocInput(date), dateNote };
  }
  const defaultTitle = (catId, onlyPdf) => (catId === 'site' ? (onlyPdf ? '施工日誌' : '施工照片') : '');

  // 上傳草稿：手機版（分步驟）和桌機版（一頁完成）共用同一套邏輯
  function useUploadDraft({ user, data, preset, simDrop, actions }) {
    const cats = D.categories.filter(c => canUploadCat(user, c));
    const presetCat = preset.cat && cats.some(c => c.id === preset.cat) ? preset.cat : null;
    const [catId, setCatIdState] = useState(presetCat);
    const [items, setItems] = useState([]);
    const [reading, setReading] = useState(0);
    const [form, setFormState] = useState(() => ({
      dateInput: toRocInput(isoDate(NOW)), dateNote: null, title: defaultTitle(presetCat, false),
      tags: [], customTag: '', note: '', sub: '', newSubName: '', period: ''
    }));
    const touched = useRef({ date: false, title: false });
    const [err, setErr] = useState('');
    const [phase, setPhase] = useState('edit'); // edit → progress → done
    const [statuses, setStatuses] = useState([]);
    const [paused, setPaused] = useState(false);
    const [createdId, setCreatedId] = useState(null);
    const uploader = useRef(null);

    const photoN = items.filter(i => i.kind === 'photo').length;
    const pdfN = items.length - photoN;
    const onlyPdf = items.length > 0 && photoN === 0;
    const summary = [photoN ? `${photoN} 張照片` : '', pdfN ? `${pdfN} 份 PDF` : ''].filter(Boolean).join('、');

    // 使用者自己改過日期或名稱後，就不再自動覆蓋
    const setForm = fn => setFormState(prev => {
      const next = typeof fn === 'function' ? fn(prev) : fn;
      if (next.dateInput !== prev.dateInput) touched.current.date = true;
      if (next.title !== prev.title) touched.current.title = true;
      return next;
    });

    useEffect(() => {
      if (touched.current.date) return;
      const d = dateFromItems(items);
      setFormState(f => ({ ...f, ...d }));
    }, [items]);

    useEffect(() => {
      if (touched.current.title) return;
      setFormState(f => ({ ...f, title: defaultTitle(catId, onlyPdf) }));
    }, [catId, onlyPdf]);

    function setCatId(id) {
      const c = catById(id);
      setCatIdState(id);
      setFormState(f => ({
        ...f,
        sub: c.sub ? f.sub : '',
        newSubName: c.sub ? f.newSubName : '',
        period: id === 'billing' ? f.period : ''
      }));
    }

    async function addFiles(fileList, kind) {
      const files = Array.from(fileList || []);
      if (!files.length) return;
      setReading(n => n + 1);
      const added = await readFiles(files, kind, { room: MAX_PHOTOS - photoN, toast: actions.toast });
      setItems(prev => [...prev, ...added]);
      setReading(n => n - 1);
    }

    function addSamples() {
      const base = new Date('2026-09-23T09:10:00+08:00').getTime();
      const sample = Array.from({ length: 15 }, (_, i) => ({
        id: uid('s'), kind: 'photo', name: `範例照片 ${pad(i + 1)}.jpg`, label: `範例 ${pad(i + 1)}`,
        shotAt: new Date(base + i * 29 * 60000).toISOString(), tone: D.TONES[(i * 3) % D.TONES.length]
      }));
      setItems(prev => [...prev, ...sample].slice(0, MAX_PHOTOS));
    }

    function removeItem(id) {
      setItems(prev => {
        const it = prev.find(x => x.id === id);
        if (it && it.url) URL.revokeObjectURL(it.url);
        return prev.filter(x => x.id !== id);
      });
    }

    // Demo：從設定面板「用範例照片走一次上傳」進來時，先放好範例照片
    useEffect(() => { if (preset.sample) addSamples(); }, []);

    function submit() {
      let e = '';
      if (!items.length) e = '請先選照片或文件';
      else if (!catId) e = '請選擇要傳到哪一類';
      else e = validate(form, catId);
      if (e) { setErr(e); actions.toast(e); return false; }
      setErr('');
      setStatuses(items.map(() => 'wait'));
      setPhase('progress');
      return true;
    }

    function finish() {
      const at = nowIso();
      const cat = catById(catId);
      const date = fromRocInput(form.dateInput);
      const id = uid('n');
      let sub;
      let newSub = null;
      let period;
      let newPeriod = null;
      if (cat.sub) {
        const s = resolveSub(form, data);
        sub = s.id;
        newSub = s.created;
      }
      if (catId === 'billing') {
        if (form.period === '__new') { period = Math.max(0, ...data.periods.map(p => p.no)) + 1; newPeriod = { no: period, date }; }
        else period = Number(form.period);
      }
      actions.addRecord({
        id, cat: catId, date, title: form.title.trim(), uploaderId: user.id, role: user.role,
        uploadedAt: at, tags: form.tags, note: form.note.trim(),
        photos: items.filter(i => i.kind === 'photo').map(toPhoto),
        pdfs: items.filter(i => i.kind === 'pdf').map(i => toPdf(i, user.id, at)),
        sub, period, status: cat.status ? 'pending' : undefined
      }, { newSub, newPeriod });
      setCreatedId(id);
      setPhase('done');
    }

    useEffect(() => {
      if (phase !== 'progress') return undefined;
      const up = createUploader(items.length, {
        dropAt: simDrop ? Math.min(7, items.length - 1) : 0,
        onUpdate: (st, isPaused) => { setStatuses(st); setPaused(isPaused); },
        onDone: finish
      });
      uploader.current = up;
      up.start();
      return () => up.stop();
    }, [phase]);

    const resume = () => { setPaused(false); if (uploader.current) uploader.current.resume(); };

    return {
      cats, presetCat, catId, setCatId, items, reading, addFiles, addSamples, removeItem,
      form, setForm, err, submit, phase, statuses, paused, resume, createdId, photoN, pdfN, summary
    };
  }

  /** 這個身分不能選的分類，說明誰才能傳 */
  const blockedCatHints = user => D.categories
    .filter(c => c.roles && !c.roles.includes(user.role))
    .map(c => `「${c.name}」只有${c.roles.map(roleName).join('、')}能上傳`);

  function SelectedFiles({ d }) {
    if (!d.items.length) return null;
    const photos = d.items.filter(i => i.kind === 'photo');
    const pdfs = d.items.filter(i => i.kind === 'pdf');
    return html`<div class="field">
      <div class="field-label">已選 ${d.summary}</div>
      ${photos.length > 0 && html`<div class="sel-grid">
        ${photos.map(p => html`<div class="sel-item" key=${p.id}>
          <${Photo} p=${p} bare />
          <div class="sel-date">${p.shotAt ? rocDT(p.shotAt).slice(4, 9) : '沒有日期'}</div>
          <button class="sel-remove" aria-label=${'移除 ' + p.label} onClick=${() => d.removeItem(p.id)}><${Icon} name="close" size=${20} /></button>
        </div>`)}
      </div>`}
      ${pdfs.length > 0 && html`<ul class="file-list">
        ${pdfs.map(f => html`<li key=${f.id}><div class="file-row">
          <${Icon} name="file" />
          <span class="file-name">${f.name}</span>
          <span class="file-meta">${f.pages ? `${f.pages} 頁｜` : ''}${f.size}</span>
          <button class="icon-btn file-remove" aria-label=${'移除 ' + f.name} onClick=${() => d.removeItem(f.id)}><${Icon} name="close" /></button>
        </div></li>`)}
      </ul>`}
    </div>`;
  }

  function UploadProgress({ d }) {
    const doneN = d.statuses.filter(s => s === 'done').length;
    const total = d.items.length;
    const unitWord = d.pdfN ? '個檔案' : '張';
    const label = d.paused ? `已傳好 ${doneN} / ${total} ${unitWord}` : `第 ${Math.min(doneN + 1, total)} / ${total} ${unitWord}上傳中`;
    return html`
      <div class="progress-num" role="status">${label}</div>
      <div class="bar"><div style=${{ width: `${Math.round((doneN / total) * 100)}%` }}></div></div>
      ${d.paused
        ? html`<div class="notice error">網路斷了，已經傳好的 ${doneN} ${unitWord}會保留，網路恢復後會自動繼續。</div>
          <button class="btn btn-outline btn-block" onClick=${d.resume}>（Demo）恢復網路</button>`
        : html`<div class="notice warn">上傳完成前請不要關閉畫面</div>`}
      <div class="up-grid">
        ${d.items.map((it, i) => html`<div class=${'up-item ' + (d.statuses[i] || 'wait')} key=${it.id}>
          ${it.kind === 'photo' ? html`<${Photo} p=${it} bare />` : html`<div class="pdf-tile"><${Icon} name="file" />PDF</div>`}
          <div class="veil"></div>
          ${d.statuses[i] === 'done' && html`<div class="ok"><${Icon} name="check" size=${18} stroke=${3} /></div>`}
        </div>`)}
      </div>`;
  }

  // ---------- 面板 ----------
  function ShareSheet({ rec, onClose }) {
    const cat = catById(rec.cat);
    const text = `[${cat.short}] ${roc(rec.date)} ${rec.title}（${countText(rec)}）\n${recordLink(rec.id)}`;
    return html`<${Sheet} title="分享到 LINE 群組" onClose=${onClose}>
      <div class="share-preview">${text}</div>
      <p class="muted">按下後會打開 LINE，選要傳的群組。收到的人點連結要先登入，才看得到內容。</p>
      <a class="btn btn-line btn-block btn-lg" href=${'https://line.me/R/share?text=' + encodeURIComponent(text)} target="_blank" rel="noopener">打開 LINE</a>
    <//>`;
  }

  function DeleteSheet({ rec, user, onClose, onConfirm }) {
    return html`<${Sheet} title="確定刪除這筆紀錄？" onClose=${onClose}>
      <p>「${rec.title}」刪除後，所有人都看不到。</p>
      <p class="muted">${isAdmin(user) ? '刪除後會移到回收區，之後還可以從後台救回。' : '刪除後只有管理者能救回。'}</p>
      <button class="btn btn-danger btn-block btn-lg" onClick=${onConfirm}>確定刪除</button>
      <button class="btn btn-outline btn-block" onClick=${onClose}>取消</button>
    <//>`;
  }

  function PurgeSheet({ rec, onClose, onConfirm }) {
    return html`<${Sheet} title="確定永久刪除？" onClose=${onClose}>
      <p>「${rec.title}」永久刪除後就救不回來了。</p>
      <p class="muted">一般只用在誤傳私人照片這類情況；這個動作會記在操作紀錄。</p>
      <button class="btn btn-danger btn-block btn-lg" onClick=${onConfirm}>永久刪除</button>
      <button class="btn btn-outline btn-block" onClick=${onClose}>取消</button>
    <//>`;
  }

  function AddAccountSheet({ onClose, onSave }) {
    const [f, setF] = useState({ name: '', email: '', role: 'contractor' });
    const [err, setErr] = useState('');
    const set = patch => setF(prev => ({ ...prev, ...patch }));
    const save = () => {
      if (!f.name.trim()) { setErr('請填姓名'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) { setErr('Gmail 格式不對，例如 name@gmail.com'); return; }
      onSave({ name: f.name.trim(), email: f.email.trim(), role: f.role });
    };
    return html`<${Sheet} title="新增帳號" onClose=${onClose}>
      <div class="field">
        <label class="field-label" for="a-name">姓名<span class="req">必填</span></label>
        <input id="a-name" class="input" value=${f.name} onInput=${e => set({ name: e.target.value })} />
      </div>
      <div class="field">
        <label class="field-label" for="a-email">Gmail<span class="req">必填</span></label>
        <input id="a-email" class="input" type="email" placeholder="例如 name@gmail.com" value=${f.email} onInput=${e => set({ email: e.target.value })} />
        <div class="hint">對方要用這個 Google 帳號登入</div>
      </div>
      <div class="field">
        <label class="field-label" for="a-role">身分</label>
        <select id="a-role" class="select" value=${f.role} onChange=${e => set({ role: e.target.value })}>
          ${ROLE_IDS.map(r => html`<option value=${r}>${roleName(r)}</option>`)}
        </select>
        <div class="hint">${ROLES[f.role].desc}</div>
      </div>
      ${err && html`<div class="notice error">${err}</div>`}
      <button class="btn btn-primary btn-block btn-lg" onClick=${save}>新增帳號</button>
    <//>`;
  }

  function userDesc(u) {
    if (u.guest) return '沒有登入：不管開哪個網址都只會看到登入畫面';
    if (u.disabled) return '已停用：切換過去會看到停用的畫面';
    return ROLES[u.role].desc;
  }

  function DemoSheet({ userId, users, viewMode, setViewMode, simDrop, setSimDrop, onPick, onSampleUpload, onBackstage, onReset, onClose }) {
    const people = [...users, { id: GUEST, guest: true }];
    return html`<${Sheet} title="Demo 設定" onClose=${onClose}>
      <p class="demo-desc">這是給業主與使用者試用的示意版：資料都是假的，照片不會真的上傳。系統時間固定為 115/09/24 18:00。</p>
      <div class="field-label">畫面</div>
      <div class="seg seg-3" role="group" aria-label="畫面">
        ${[['auto', '依螢幕寬度'], ['mobile', '手機版'], ['desktop', '桌機版']].map(([k, label]) => html`<button
          class=${viewMode === k ? 'on' : ''} aria-pressed=${viewMode === k} onClick=${() => setViewMode(k)}>${label}</button>`)}
      </div>
      <div class="field-label">切換身分</div>
      <div class="opt-list">
        ${people.map(u => html`<button class=${'opt' + (u.id === userId ? ' on' : '')} aria-pressed=${u.id === userId} onClick=${() => onPick(u.id)}>
          <span class="opt-name">${u.guest ? '未登入者' : `${u.name}｜${roleName(u.role)}${u.disabled ? '（已停用）' : ''}`}</span>
          <span class="opt-desc">${userDesc(u)}</span>
        </button>`)}
      </div>
      <button class="btn btn-outline btn-block" onClick=${onSampleUpload}>用 15 張範例照片走一次上傳</button>
      <label class="switch-row">
        <input type="checkbox" checked=${simDrop} onChange=${e => setSimDrop(e.target.checked)} />
        <span>上傳時模擬斷線一次</span>
      </label>
      <div class="notice info">後台（帳號管理、回收區、操作紀錄）在平台裡沒有入口，只有管理者、而且知道網址才進得去。</div>
      <button class="btn btn-outline btn-block" onClick=${onBackstage}>（Demo）開啟後台網址 #/backstage</button>
      <button class="btn btn-outline btn-block" onClick=${onReset}>重置 demo 資料</button>
    <//>`;
  }

  Object.assign(PR, {
    html, D, APP_NAME, NOW, nowIso, MAX_PHOTOS, MAX_PDF_BYTES, GUEST, DEFAULT_FILTERS, LOG_ACTIONS, ROLES, ROLE_IDS, STATUS,
    pad, uid, toggle, fmtSize, roc, rocShort, rocLong, rocDT, isoDate, toRocInput, fromRocInput, rocDateError,
    syncUsers, userById, catById, subName, roleName,
    isAdmin, canUpload, canUploadCat, canToggleStatus, canManageLists, editLeftHours, canEdit, canDelete, canEditFiles, canUpdateDoc,
    leftText, editNote, countText, byLine, docMeta, zipText, recordLink,
    countPdfPages, readFiles, downloadFile,
    byDateDesc, filterRecords, keywordOptions, groupBySub, groupByPeriod, groupFor,
    parseHash, logEntry, initialData, initialUsers,
    Icon, Photo, TopBar, useBodyLock, Sheet, DemoBar, DisabledScreen, LoginScreen, Lightbox, PdfViewer,
    StatusBlock, DocList, DateInput, DateRange,
    validate, Fields, editFormOf, buildEditPatch, EditFiles,
    useUploadDraft, blockedCatHints, SelectedFiles, UploadProgress,
    ShareSheet, DeleteSheet, PurgeSheet, AddAccountSheet, DemoSheet
  });
})();
