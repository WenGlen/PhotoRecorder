/* 阿美中會工地記錄平台 Demo：共用的工具、權限、篩選與元件（手機版、桌機版、請款、後台都用） */
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

  const APP_NAME = '阿美中會工地記錄平台';
  const LOGO_SRC = 'logo.png';
  const NOW = new Date(D.NOW);
  const LOADED_AT = Date.now();
  const nowIso = () => new Date(NOW.getTime() + (Date.now() - LOADED_AT)).toISOString();
  const EDIT_HOURS = 168; // 上傳後一週內，上傳者可以修改、刪除
  const RECENT_DAYS = 7; // 工地記錄的日期子分類：今天往前 7 天
  const RECENT_KEYWORDS = 15; // 上傳時只列最近用過的 15 個關鍵字
  const MAX_PHOTOS = 100;
  const MAX_PDF_BYTES = 50 * 1024 * 1024;
  const TZ = 'Asia/Taipei';
  const GUEST = 'guest';
  const DEFAULT_FILTERS = { cat: 'all', from: '', to: '', tags: [], q: '' };
  const LOG_ACTIONS = ['上傳', '修改', '更新文件', '書審狀態', '子分類備註', '請款', '刪除', '救回', '永久刪除', '帳號', '設定'];

  const ROLES = {
    admin: { name: '管理者', desc: '全部都能看、能傳，可以修改或刪除所有檔案夾，也能審核請款、解鎖已全部審核完成的請款' },
    architect: { name: '建築師事務所', desc: '可以傳工地記錄、書審及材料測試、活動記錄、案件基本資料，切換書審狀態，管理子分類，審核請款' },
    contractor: { name: '承包商', desc: '可以傳工地記錄、書審及材料測試、活動記錄，建立請款；一週內可以改或刪自己傳的' },
    amis: { name: '阿美中會', desc: '全部都能看；只能傳工地記錄的照片，不能傳文件' }
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

  // ---------- 日期（一律西元） ----------
  const tzFormat = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  function tp(v) {
    const o = {};
    tzFormat.formatToParts(v instanceof Date ? v : new Date(v)).forEach(p => { o[p.type] = p.value; });
    return o;
  }
  const ymd = d => (d ? d.replace(/-/g, '/') : '');
  function dt(v) { const o = tp(v); return `${o.year}/${o.month}/${o.day} ${o.hour}:${o.minute}`; }
  function isoDate(v) { const o = tp(v); return `${o.year}-${o.month}-${o.day}`; }
  const monthLabel = ym => { const [y, m] = ym.split('-'); return `${y} 年 ${Number(m)} 月`; };
  function addDays(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  }
  const today = () => isoDate(NOW);
  const recentDays = () => Array.from({ length: RECENT_DAYS }, (_, i) => addDays(today(), -i));
  // 工地記錄的子分類名稱：「09/24 本日記錄」，不寫年份（列表上已經依月份分段）
  const siteSubName = d => `${d.slice(5, 7)}/${d.slice(8, 10)} 本日記錄`;
  // 請款的日期區間：「2026/08/01~2026/08/31」；還沒填結束日期時是「2026/10/01～」
  const billingRange = b => `${ymd(b.from)}${b.to ? `~${ymd(b.to)}` : '～'}`;
  // 請款名稱自動產生：「第3期請款：2026/08/01~2026/08/31」
  const billingName = b => `第${b.no}期請款：${billingRange(b)}`;
  /**
   * 請款裡從記錄挑來的照片或文件出自哪一筆：「日期 項目」，例如「2026/07/08 一樓版灌漿」。挑照片時也當預設名稱。
   * @param {{ date: string, title: string }} from
   * @returns {string}
   */
  const fromLabel = from => `${ymd(from.date)} ${from.title}`;

  // ---------- 帳號與分類 ----------
  let USERS = D.users.map(u => ({ ...u }));
  const syncUsers = list => { USERS = list; };
  const userById = id => USERS.find(u => u.id === id) || { id, name: '（不明）', role: 'amis' };
  const catById = id => D.categories.find(c => c.id === id);
  const subList = (data, catId) => data.subcats[catId] || [];
  /** 記錄的子分類名稱：工地記錄是日期，書審及材料測試、活動記錄是自訂子分類，基本資料沒有 */
  function subLabel(data, rec) {
    const c = catById(rec.cat);
    if (!c || !c.subKind) return '';
    if (c.subKind === 'day') return siteSubName(rec.date);
    const s = subList(data, rec.cat).find(x => x.id === rec.sub);
    return s ? s.name : '';
  }

  // ---------- 權限（正式版要在資料庫層檢查，這裡只控制畫面） ----------
  const isAdmin = u => u.role === 'admin';
  const canUploadCat = (u, c) => c.roles.includes(u.role);
  const canUpload = u => D.categories.some(c => canUploadCat(u, c));
  const canUploadPdf = u => u.role !== 'amis';
  const canToggleStatus = u => u.role === 'architect';
  const canManageSubcats = u => u.role === 'admin' || u.role === 'architect';
  const canEditSiteNote = u => ['admin', 'architect', 'contractor'].includes(u.role);
  const canBilling = u => u.role === 'admin' || u.role === 'contractor';
  /** 請款的「審核完成」和「全部審核完成」：管理者、建築師事務所 */
  const canApproveBilling = u => u.role === 'admin' || u.role === 'architect';
  const editLeftHours = rec => (new Date(rec.uploadedAt).getTime() + EDIT_HOURS * 3600000 - NOW.getTime()) / 3600000;
  /**
   * 能不能修改記錄的資料：管理者不限時間，上傳者本人一週內。
   * @param {Object} u 目前的使用者
   * @param {Object} rec 記錄
   * @returns {boolean}
   */
  const canEdit = (u, rec) => isAdmin(u) || (rec.uploaderId === u.id && editLeftHours(rec) > 0);
  /** 能不能刪整筆：一般記錄跟修改一樣；書審及材料測試不能刪，只剩管理者能刪 */
  const canDelete = (u, rec) => (rec.cat === 'review' ? isAdmin(u) : canEdit(u, rec));
  /** 能不能增刪照片、文件：一般記錄跟修改一樣；書審的文件只能用「更新」換新檔 */
  const canEditFiles = (u, rec) => rec.cat !== 'review' && canEdit(u, rec);
  /** 書審及材料測試的文件：能傳文件的人都能更新，不限時間、不限上傳者 */
  const canUpdateDoc = (u, rec) => rec.cat === 'review' && canUploadPdf(u);
  const leftText = hours => (hours >= 24 ? `${Math.floor(hours / 24)} 天` : `${Math.max(1, Math.floor(hours))} 小時`);

  /**
   * 手機版記錄頁上「還能不能改」的說明。
   * @returns {string} 沒有要說明的時候回傳空字串
   */
  function editNote(u, rec) {
    if (isAdmin(u)) return '管理者可以修改或刪除所有檔案夾，不限時間';
    if (rec.uploaderId !== u.id) return '';
    const left = editLeftHours(rec);
    const review = rec.cat === 'review';
    if (left > 0) return review ? `你上傳的檔案夾，還可以修改 ${leftText(left)}` : `你上傳的檔案夾，還可以修改或刪除 ${leftText(left)}`;
    return '已超過一週，不能修改或刪除。需要更正請找管理者';
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
  const docMeta = f => [f.pages ? `${f.pages} 頁` : '頁數未知', `${ymd(isoDate(f.uploadedAt))} ${userById(f.uploaderId).name} 上傳`, f.size]
    .filter(Boolean).join('｜');
  const photoName = p => p.name || `${p.label}.jpg`;
  function recordLink(id) {
    const base = location.protocol.startsWith('http') ? location.origin + location.pathname : 'https://平台網址/';
    return `${base}?openExternalBrowser=1#/record/${id}`;
  }

  // ---------- 篩選與分組 ----------
  const byDateDesc = (a, b) => b.date.localeCompare(a.date) || (new Date(b.uploadedAt) - new Date(a.uploadedAt));
  const filtersActive = f => f.q.trim() !== '' || f.from !== '' || f.to !== '' || f.tags.length > 0;

  /**
   * 依篩選條件過濾記錄，並依資料日期由新到舊排序。
   * @param {Object[]} records
   * @param {Object} f 篩選條件，格式同 DEFAULT_FILTERS；from／to 是 YYYY-MM-DD，前後都含
   * @param {Object} data 用來比對子分類名稱
   * @returns {Object[]}
   */
  function filterRecords(records, f, data) {
    const q = f.q.trim().toLowerCase();
    const [lo, hi] = f.from && f.to && f.from > f.to ? [f.to, f.from] : [f.from, f.to];
    return records.filter(r => {
      if (f.cat !== 'all' && r.cat !== f.cat) return false;
      if (lo && r.date < lo) return false;
      if (hi && r.date > hi) return false;
      if (f.tags.length && !f.tags.some(t => r.tags.includes(t))) return false;
      if (q) {
        const hay = [r.title, r.note, r.tags.join(' '), userById(r.uploaderId).name, subLabel(data, r), r.pdfs.map(p => `${p.name} ${p.origName || ''}`).join(' ')]
          .join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort(byDateDesc);
  }

  /**
   * 最近用過的關鍵字（依上傳時間由新到舊，不重複）。
   * @param {Object} data
   * @param {number} [limit] 最多幾個；不給就全部
   * @returns {string[]}
   */
  function recentKeywords(data, limit) {
    const out = [];
    [...data.records].sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
      .forEach(r => r.tags.forEach(t => { if (!out.includes(t)) out.push(t); }));
    return limit ? out.slice(0, limit) : out;
  }

  /** 工地記錄分兩層：月份 → 日期子分類（記錄要先依日期由新到舊排好）；kind 決定分段的底色 */
  function groupSite(recs, notes) {
    const months = [];
    recs.forEach(r => {
      const ym = r.date.slice(0, 7);
      let m = months[months.length - 1];
      if (!m || m.ym !== ym) { m = { key: 'm-' + ym, kind: 'month', ym, label: monthLabel(ym), children: [] }; months.push(m); }
      let d = m.children[m.children.length - 1];
      if (!d || d.date !== r.date) { d = { key: 'd-' + r.date, kind: 'sub', date: r.date, label: siteSubName(r.date), note: notes[r.date], recs: [] }; m.children.push(d); }
      d.recs.push(r);
    });
    return months;
  }

  /** 自訂子分類分段，順序照子分類的設定；keepEmpty 時沒有檔案夾的子分類也列出來 */
  function groupBySub(recs, subs, catId, keepEmpty) {
    const groups = subs
      .map(s => ({ key: `s-${catId}-${s.id}`, kind: 'sub', label: s.name, recs: recs.filter(r => r.sub === s.id) }))
      .filter(g => keepEmpty || g.recs.length);
    const rest = recs.filter(r => !subs.some(s => s.id === r.sub));
    if (rest.length) groups.push({ key: `s-${catId}-none`, kind: 'sub', label: '未分子分類', recs: rest });
    return groups;
  }

  /**
   * 列表怎麼分段：工地記錄是月份＋日期兩層，書審及材料測試、活動記錄依子分類，全部和基本資料不分段。
   * @param {string} catId
   * @param {Object[]} recs 已經篩選、排序好的檔案夾
   * @param {Object} data
   * @param {boolean} [keepEmpty] 書審及材料測試、活動記錄：設定了的子分類都列出來，沒有檔案夾的也列（沒有搜尋、篩選時）
   * @returns {Object[]|null} 不分段時回傳 null
   */
  function groupFor(catId, recs, data, keepEmpty) {
    const c = catById(catId);
    if (!c || !c.subKind) return null;
    if (c.subKind === 'day') return groupSite(recs, data.siteNotes);
    return groupBySub(recs, subList(data, catId), catId, keepEmpty);
  }
  const groupCount = g => (g.children ? g.children.reduce((n, c) => n + c.recs.length, 0) : g.recs.length);

  /** 預設展開：月份展開最近兩個；子分類展開最上面三個有檔案夾的，其餘收合 */
  function defaultOpenKeys(groups) {
    const open = new Set();
    if (!groups) return open;
    if (groups.some(g => g.children)) {
      groups.slice(0, 2).forEach(g => open.add(g.key));
      groups.flatMap(g => g.children).slice(0, 3).forEach(c => open.add(c.key));
    } else {
      groups.filter(g => g.recs.length).slice(0, 3).forEach(g => open.add(g.key));
    }
    return open;
  }

  /**
   * 群組的收合狀態：使用者點過的照使用者，沒點過的照預設；有搜尋或篩選時全部展開，免得結果藏在收合的群組裡。
   * @param {Object[]|null} groups
   * @param {boolean} forceOpen
   */
  function useGroupOpen(groups, forceOpen) {
    const [toggled, setToggled] = useState({});
    const defaults = defaultOpenKeys(groups);
    const isOpen = key => (key in toggled ? toggled[key] : forceOpen || defaults.has(key));
    const flip = key => setToggled(t => ({ ...t, [key]: !isOpen(key) }));
    return { isOpen, flip };
  }

  // ---------- 路由（固定網址） ----------
  function parseHash() {
    const raw = location.hash.replace(/^#/, '') || '/';
    const [path, qs] = raw.split('?');
    const [a, b] = path.split('/').filter(Boolean);
    const query = Object.fromEntries(new URLSearchParams(qs || ''));
    if (a === 'record' && b) return { name: 'record', id: b };
    if (a === 'edit' && b) return { name: 'edit', id: b };
    if (a === 'billing') return { name: 'billing', id: b || null };
    if (a === 'settings' && b) return { name: 'settings', id: b };
    // 後台：平台裡沒有任何入口，要知道網址才進得來
    if (a === 'backstage') return { name: 'backstage', id: b || 'accounts' };
    if (a === 'upload') return { name: 'upload', query };
    return { name: 'home' };
  }

  // ---------- 初始資料與操作記錄 ----------
  const logEntry = (userId, action, target, detail) => ({ id: uid('l'), at: nowIso(), userId, action, target, detail: detail || '' });
  /** 「更新文件」的內容：文件名稱不變，換成新檔的內容 */
  const updateDocDetail = (name, fileName) => `${name}：換成新檔 ${fileName}`;

  function seedLog(data) {
    const log = [];
    const push = (at, userId, action, target, detail) => log.push({ id: uid('l'), at, userId, action, target, detail: detail || '' });
    const uploadDetail = r => `${catById(r.cat).name}，${countText(r)}`;
    data.records.forEach(r => {
      push(r.uploadedAt, r.uploaderId, '上傳', r.title, uploadDetail(r));
      if (r.editedAt) push(r.editedAt, r.editedBy, '修改', r.title, '改了：備註');
      r.pdfs.filter(p => p.uploadedAt !== r.uploadedAt)
        .forEach(p => push(p.uploadedAt, p.uploaderId, '更新文件', r.title, updateDocDetail(p.name, p.origName || p.name)));
      if (r.statusAt) push(r.statusAt, r.statusBy, '書審狀態', r.title, `${STATUS.pending.label} 改成 ${STATUS[r.status].label}`);
    });
    Object.entries(data.siteNotes).forEach(([date, n]) => push(n.at, n.by, '子分類備註', siteSubName(date), n.text));
    data.billing.forEach(b => {
      push(b.createdAt, b.createdBy, '請款', billingName(b), '新增一期請款');
      if (b.merged) push(b.merged.uploadedAt, b.merged.uploaderId, '請款', billingName(b), `整合施工日誌（${b.merged.pages} 頁）`);
      [...b.quotes, ...(b.merged ? [b.merged] : []), ...b.docs, ...b.others]
        .filter(it => it.approved).forEach(it => push(it.approved.at, it.approved.by, '請款', billingName(b), `審核完成：${it.name}`));
      if (b.photosApproved) push(b.photosApproved.at, b.photosApproved.by, '請款', billingName(b), `審核完成：請款照片 ${b.photos.length} 張`);
      if (b.done) push(b.done.at, b.done.by, '請款', billingName(b), '全部審核完成');
    });
    data.deleted.forEach(r => {
      push(r.uploadedAt, r.uploaderId, '上傳', r.title, uploadDetail(r));
      push(r.deletedAt, r.deletedBy, '刪除', r.title, r.deleteNote || catById(r.cat).name);
    });
    D.accountEvents.forEach(e => push(e.at, e.userId, e.action, e.target, e.detail));
    return log.sort((a, b) => new Date(b.at) - new Date(a.at));
  }

  function initialData() {
    const data = {
      records: D.records.map(r => ({ ...r })),
      deleted: D.deletedRecords.map(r => ({ ...r })),
      subcats: { review: D.subcats.review.map(s => ({ ...s })), event: D.subcats.event.map(s => ({ ...s })) },
      siteNotes: { ...D.siteNotes },
      billing: JSON.parse(JSON.stringify(D.billing))
    };
    data.log = seedLog(data);
    return data;
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
    refresh: () => html`<path d="M21 4v6h-6" /><path d="M19.5 15a8 8 0 1 1-1.9-8.3L21 10" />`,
    pencil: () => html`<path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" />`,
    printer: () => html`<path d="M7 8V3h10v5" /><rect x="3" y="8" width="18" height="9" rx="2" /><path d="M7 14h10v7H7z" />`,
    lock: () => html`<rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />`,
    unlock: () => html`<rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-1.9" />`
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

  /** 平台 logo，排在平台名稱左邊。名稱已經是文字，圖不另外唸（alt 空白）；大小由 CSS 依位置決定 */
  const BrandLogo = () => html`<img class="brand-logo" src=${LOGO_SRC} alt="" width="40" height="40" />`;

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

  function Sheet({ title, onClose, wide, cls, children }) {
    useBodyLock();
    useEscape(onClose);
    return html`
      <div class="overlay" onClick=${onClose}></div>
      <div class=${'sheet' + (wide ? ' wide' : '') + (cls ? ' ' + cls : '')} role="dialog" aria-modal="true" aria-label=${title}>
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

  // 未登入：不管開哪個網址（包含 LINE 分享的記錄連結）都先看到這一頁
  function LoginScreen({ toast }) {
    return html`<main class="login">
      <h1 class="login-title"><${BrandLogo} />${APP_NAME}</h1>
      <p class="muted">只有管理者加入名單的 Google 帳號能登入。</p>
      <button class="btn btn-primary btn-block btn-lg" onClick=${() => toast('（Demo）正式版會跳到 Google 登入；請按上方「切換身分」選一個身分')}>
        用 Google 帳號登入
      </button>
      <p class="hint">收到 LINE 分享的連結，也要先登入才看得到內容。</p>
    </main>`;
  }

  // ---------- 預覽彈窗（照片、PDF） ----------
  /**
   * 照片預覽。gallery 是一筆記錄，或請款照片：{ title, photos, uploaderId?, uploadedAt? }
   */
  function Lightbox({ gallery, index, onIndex, onClose, toast }) {
    useBodyLock();
    const startX = useRef(null);
    const total = gallery.photos.length;
    const p = gallery.photos[Math.min(index, total - 1)];
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
    const source = p.from
      ? `來自：${ymd(p.from.date)} ${p.from.title}`
      : `上傳：${userById(gallery.uploaderId).name}｜${dt(gallery.uploadedAt)}`;
    const caption = `${gallery.title}｜${p.label}`;
    // 觸控事件用小寫 ontouchstart：Preact 會直接當成 touchstart，不靠瀏覽器有沒有 ontouchstart 屬性來猜大小寫
    return html`
      <div class="overlay modal-mask" onClick=${onClose}></div>
      <div class="modal lb" role="dialog" aria-modal="true" aria-label="照片預覽">
        <div class="modal-head">
          <div class="modal-title">
            <span class="modal-name">${gallery.title}</span>
            <span class="modal-sub">第 ${index + 1} / ${total} 張｜${p.label}</span>
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
          <div class="lb-info">${source}</div>
          <div class="btn-row modal-actions">
            <button class="btn btn-outline" onClick=${() => PR.downloadFile(p, 'photo', toast)}><${Icon} name="download" />下載這張</button>
            <button class="btn btn-outline" onClick=${() => PR.printFile(p, 'photo', caption, toast)}><${Icon} name="printer" />列印</button>
          </div>
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
          <button class="btn btn-outline sm" onClick=${() => PR.downloadFile(pdf, 'pdf', toast)}><${Icon} name="download" size=${20} />下載</button>
          <button class="btn btn-outline sm" onClick=${() => PR.printFile(pdf, 'pdf', pdf.name, toast)}><${Icon} name="printer" size=${20} />列印</button>
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

  /** 文件名稱改過、跟原檔名不同時，旁邊用小標籤顯示原檔名 */
  const OrigName = ({ f }) => (f.origName && f.origName !== (f.name || '').trim()
    ? html`<span class="orig-tag" title=${f.origName}>原檔名：${f.origName}</span>`
    : null);

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
      <div class="meta">${rec.statusAt ? `最後更新：${userById(rec.statusBy).name}｜${dt(rec.statusAt)}` : '送出後還沒有更新過狀態'}</div>
    </div>`;
  }

  /**
   * 記錄裡的 PDF：點一下預覽，每份都能單獨下載；書審另有「更新」換新檔（直接覆蓋）。
   * 下載模式（dl.on）時，點一下是勾選。
   */
  function DocList({ rec, user, actions, dl }) {
    const canUpdate = canUpdateDoc(user, rec);
    const picking = !!(dl && dl.on);
    return html`<ul class="file-list">
      ${rec.pdfs.map(f => {
        const picked = picking && dl.isPicked(rec.id, f.id);
        return html`<li class=${'doc' + (picked ? ' picked' : '')} key=${f.id}>
          <button class="file-row" aria-pressed=${picking ? picked : undefined}
            onClick=${() => (picking ? dl.toggle(rec, f, 'pdf') : actions.openPdf(f))}>
            ${picking
              ? html`<span class="pick-box" aria-hidden="true">${picked && html`<${Icon} name="check" size=${16} stroke=${3} />`}</span>`
              : html`<${Icon} name="file" />`}
            <span class="file-name">${f.name}${f.diary && html` <span class="badge-diary">施工日誌</span>`}<${OrigName} f=${f} /></span>
            <span class="file-meta">${docMeta(f)}</span>
          </button>
          ${!picking && html`<div class="doc-actions">
            <button class="btn btn-outline sm" onClick=${() => PR.downloadFile(f, 'pdf', actions.toast)}><${Icon} name="download" size=${20} />下載</button>
            ${canUpdate && html`<label class="btn btn-outline sm pick-inline">
              <input type="file" accept="application/pdf,.pdf"
                onChange=${e => { actions.updateDoc(rec.id, f.id, e.target.files[0]); e.target.value = ''; }} />
              <${Icon} name="refresh" size=${20} />更新
            </label>`}
          </div>`}
        </li>`;
      })}
    </ul>`;
  }

  // ---------- 日期區間（搜尋用） ----------
  /**
   * @param {{ from: string, to: string, onChange: (patch: {from: string, to: string}) => void, compact?: boolean }} props
   *   from／to 是 YYYY-MM-DD 或空字串；用瀏覽器內建的日期欄，點一下就有日期選單
   */
  function DateRange({ from, to, onChange, compact }) {
    const set = patch => onChange({ from, to, ...patch });
    return html`<div class=${'date-range' + (compact ? ' sm' : ' bare')} role="group" aria-label="日期區間">
      ${compact && html`<span class="dr-label">日期</span>`}
      <input type="date" class="input" aria-label="開始日期" value=${from} max=${to || undefined}
        onInput=${e => set({ from: e.target.value })} onChange=${e => set({ from: e.target.value })} />
      <span class="dr-sep" aria-hidden="true">～</span>
      <input type="date" class="input" aria-label="結束日期" value=${to} min=${from || undefined}
        onInput=${e => set({ to: e.target.value })} onChange=${e => set({ to: e.target.value })} />
    </div>`;
  }

  // ---------- 表單欄位（上傳與修改共用） ----------
  function validate(form, catId) {
    const c = catById(catId);
    if (c.subKind === 'day') { if (!form.day) return '請選擇日期子分類'; }
    else if (!form.date) return '請選擇檔案夾建檔日期';
    if (!form.title.trim()) return '請填寫檔案夾名稱';
    if (c.subKind === 'list') {
      if (!form.sub) return '請選擇子分類';
      if (form.sub === '__new' && !form.newSubName.trim()) return '請填寫新子分類的名稱';
    }
    return '';
  }

  /**
   * 上傳、修改共用的欄位。
   * @param {{ extraDay?: string }} props extraDay：修改舊的工地記錄時，把原本的日期也放進選單
   */
  function Fields({ form, setForm, catId, user, data, extraDay }) {
    const set = patch => setForm(prev => ({ ...prev, ...patch }));
    const cat = catId ? catById(catId) : null;
    const keywords = recentKeywords(data, RECENT_KEYWORDS);
    const allTags = [...keywords, ...form.tags.filter(t => !keywords.includes(t))];
    const days = recentDays();
    if (extraDay && !days.includes(extraDay)) days.push(extraDay);
    const addCustom = () => {
      const t = form.customTag.trim();
      if (!t) return;
      setForm(prev => ({ ...prev, tags: prev.tags.includes(t) ? prev.tags : [...prev.tags, t], customTag: '' }));
    };
    const onDate = e => set({ date: e.target.value });
    return html`
      ${cat && cat.subKind === 'day'
        ? html`<div class="field">
            <label class="field-label" for="f-day">日期子分類<span class="req">必填</span></label>
            <select id="f-day" class="select" value=${form.day} onChange=${e => set({ day: e.target.value })}>
              ${days.map(d => html`<option value=${d}>${siteSubName(d)}${d === today() ? '（今天）' : ''}</option>`)}
            </select>
            <div class="hint">可以選今天往前 7 天</div>
          </div>`
        : html`<div class="field">
            <label class="field-label" for="f-date">檔案夾建檔日期<span class="req">必填</span></label>
            <input id="f-date" type="date" class="input" value=${form.date} onInput=${onDate} onChange=${onDate} />
          </div>`}

      ${cat && cat.subKind === 'list' && html`<div class="field">
        <label class="field-label" for="f-sub">子分類<span class="req">必填</span></label>
        <select id="f-sub" class="select" value=${form.sub} onChange=${e => set({ sub: e.target.value })}>
          <option value="">請選擇</option>
          ${subList(data, catId).map(s => html`<option value=${s.id}>${s.name}</option>`)}
          ${canManageSubcats(user) && html`<option value="__new">＋新增子分類</option>`}
        </select>
        ${form.sub === '__new' && html`<input class="input" aria-label="新子分類名稱" placeholder="例如：外牆磁磚"
          value=${form.newSubName} onInput=${e => set({ newSubName: e.target.value })} />`}
      </div>`}

      <div class="field">
        <label class="field-label" for="f-title">檔案夾名稱<span class="req">必填</span></label>
        <input id="f-title" class="input" placeholder="例如：三樓版灌漿" value=${form.title} onInput=${e => set({ title: e.target.value })} />
      </div>

      <div class="field">
        <div class="field-label">關鍵字<span class="opt-tag">最近用過的 ${RECENT_KEYWORDS} 個，可以選好幾個</span></div>
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

  /** 工地記錄的文件列右邊的「施工日誌」勾選；勾了的文件，請款時會拿來整合 */
  const DiaryCheck = ({ file, onToggle }) => html`<label class="diary-inline">
    <input type="checkbox" checked=${!!file.diary} onChange=${e => onToggle(file.id, e.target.checked)} />施工日誌
  </label>`;

  /**
   * 上傳、修改時的文件列：第一行是名稱輸入框，清空後離開輸入框會變回原檔名；
   * 第二行是頁數、大小，改過名稱的接著用標籤顯示原檔名，工地記錄的「施工日誌」勾選也排在這一行。
   * @param {object} props
   * @param {object} props.f 文件：name 是目前的名稱，origName 是原檔名
   * @param {string} props.meta 頁數、大小
   * @param {(id: string, name: string) => void} props.onRename
   * @param {boolean} [props.diary] 要不要有「施工日誌」勾選
   * @param {(id: string, v: boolean) => void} [props.onDiary]
   * @param {(id: string) => void} [props.onRemove] 不給就沒有移除鈕
   */
  function PdfNameRow({ f, meta, onRename, diary, onDiary, onRemove }) {
    return html`<li><div class=${'file-row naming' + (onRemove ? '' : ' no-remove')}>
      <${Icon} name="file" />
      <input class="input name-input" aria-label="文件名稱" value=${f.name}
        onInput=${e => onRename(f.id, e.target.value)}
        onBlur=${e => { if (!e.target.value.trim()) onRename(f.id, f.origName); }} />
      ${onRemove && html`<button class="icon-btn file-remove" aria-label=${'移除 ' + (f.name || f.origName)} onClick=${() => onRemove(f.id)}><${Icon} name="close" /></button>`}
      <div class="name-sub">
        <span class="file-meta">${meta}</span>
        <${OrigName} f=${f} />
        ${diary && html`<${DiaryCheck} file=${f} onToggle=${onDiary} />`}
      </div>
    </div></li>`;
  }

  /**
   * 表單選的子分類。選「＋新增子分類」時，同名的就沿用，沒有才建新的。
   * @returns {{ id: string, created: Object|null }} created 是這次新建的子分類
   */
  function resolveSub(form, data, catId) {
    if (form.sub !== '__new') return { id: form.sub, created: null };
    const name = form.newSubName.trim();
    const same = subList(data, catId).find(s => s.name === name);
    if (same) return { id: same.id, created: null };
    const created = { id: uid('sc'), name };
    return { id: created.id, created };
  }

  const toPhoto = i => ({ id: i.id, label: i.label, name: i.name, url: i.url, shotAt: i.shotAt, tone: i.tone });
  const toPdf = (i, userId, at) => ({
    id: i.id, name: (i.name || '').trim() || i.origName, origName: i.origName || i.name, size: i.size, pages: i.pages, url: i.url,
    uploaderId: userId, uploadedAt: at, diary: !!i.diary
  });
  /** 文件名稱不能空白（清空的話用原檔名） */
  const pdfNamesOk = list => list.every(f => (f.name || '').trim() || f.origName);

  const editFormOf = rec => ({
    day: rec.cat === 'site' ? rec.date : '', date: rec.date, title: rec.title, tags: [...rec.tags], customTag: '',
    note: rec.note || '', sub: rec.sub || '', newSubName: '', photos: [...rec.photos],
    pdfs: rec.pdfs.map(f => ({ ...f, origName: f.origName || f.name })), added: []
  });

  /**
   * 把修改表單轉成要套用到記錄上的欄位。
   * @returns {{ error: string } | { patch: Object, newSub: Object|null }}
   */
  function buildEditPatch(rec, form, user, data) {
    const fileCount = form.photos.length + form.pdfs.length + form.added.length;
    const error = validate(form, rec.cat) || (fileCount ? '' : '至少要留一張照片或一份文件；要整筆刪除請按「刪除」')
      || (pdfNamesOk([...form.pdfs, ...form.added.filter(i => i.kind === 'pdf')]) ? '' : '文件名稱不能空白');
    if (error) return { error };
    const at = nowIso();
    const c = catById(rec.cat);
    const patch = {
      date: c.subKind === 'day' ? form.day : form.date, title: form.title.trim(), tags: form.tags, note: form.note.trim(),
      photos: [...form.photos, ...form.added.filter(i => i.kind === 'photo').map(toPhoto)],
      pdfs: [
        ...form.pdfs.map(f => ({ ...f, name: (f.name || '').trim() || f.origName })),
        ...form.added.filter(i => i.kind === 'pdf').map(i => toPdf(i, user.id, at))
      ],
      editedBy: user.id, editedAt: at
    };
    let newSub = null;
    if (c.subKind === 'list') {
      const s = resolveSub(form, data, rec.cat);
      patch.sub = s.id;
      newSub = s.created;
    }
    return { patch, newSub };
  }

  /**
   * 修改時增刪照片與文件、改文件名稱；阿美中會只能加照片。
   * renameOnly：書審及材料測試不能增刪檔案（文件用「更新」換新檔），只能改文件名稱。
   */
  function EditFiles({ form, setForm, rec, user, toast, renameOnly }) {
    const [reading, setReading] = useState(false);
    const allowPdf = canUploadPdf(user);
    const photos = [...form.photos, ...form.added.filter(i => i.kind === 'photo')];
    const pdfs = [...form.pdfs, ...form.added.filter(i => i.kind === 'pdf')];
    const remove = id => setForm(prev => ({
      ...prev,
      photos: prev.photos.filter(x => x.id !== id),
      pdfs: prev.pdfs.filter(x => x.id !== id),
      added: prev.added.filter(x => x.id !== id)
    }));
    const patchPdf = (id, patch) => setForm(prev => ({
      ...prev,
      pdfs: prev.pdfs.map(p => (p.id === id ? { ...p, ...patch } : p)),
      added: prev.added.map(p => (p.id === id ? { ...p, ...patch } : p))
    }));
    const setDiary = (id, v) => patchPdf(id, { diary: v });
    const rename = (id, name) => patchPdf(id, { name });
    const add = async files => {
      setReading(true);
      const items = await PR.readFiles(files, 'auto', { room: MAX_PHOTOS - photos.length, toast, allowPdf });
      setForm(prev => ({ ...prev, added: [...prev.added, ...items] }));
      setReading(false);
    };
    if (renameOnly) {
      return pdfs.length ? html`<div class="field">
        <div class="field-label">文件 ${pdfs.length} 份</div>
        <ul class="file-list">${pdfs.map(f => html`<${PdfNameRow} key=${f.id} f=${f} meta=${f.size} onRename=${rename} />`)}</ul>
      </div>` : null;
    }
    return html`<div class="field">
      <div class="field-label">照片 ${photos.length} 張、文件 ${pdfs.length} 份</div>
      ${photos.length > 0 && html`<div class="sel-grid">
        ${photos.map(p => html`<div class="sel-item" key=${p.id}>
          <${Photo} p=${p} bare />
          <button class="sel-remove" aria-label=${'移除 ' + p.label} onClick=${() => remove(p.id)}><${Icon} name="close" size=${20} /></button>
        </div>`)}
      </div>`}
      ${pdfs.length > 0 && html`<ul class="file-list">
        ${pdfs.map(f => html`<${PdfNameRow} key=${f.id} f=${f} meta=${f.size} onRename=${rename}
          diary=${rec.cat === 'site'} onDiary=${setDiary} onRemove=${remove} />`)}
      </ul>`}
      <label class="btn btn-outline btn-block pick-inline">
        <input type="file" multiple accept=${allowPdf ? 'image/*,application/pdf,.pdf' : 'image/*'}
          onChange=${e => { add(e.target.files); e.target.value = ''; }} />
        <${Icon} name="plus" />${allowPdf ? '加入照片或文件' : '加入照片'}
      </label>
      ${reading && html`<div class="notice info">正在讀取、壓縮檔案…</div>`}
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

  const defaultTitle = (catId, onlyPdf) => (catId === 'site' ? (onlyPdf ? '施工日誌' : '施工照片') : '');

  // 上傳草稿：手機版（分步驟）和桌機版（一頁完成）共用同一套邏輯
  function useUploadDraft({ user, data, preset, simDrop, actions }) {
    const cats = D.categories.filter(c => canUploadCat(user, c));
    // 網址帶了分類、或這個身分只能傳一類（阿美中會）時，分類直接定好
    const presetCat = (preset.cat && cats.some(c => c.id === preset.cat) ? preset.cat : null) || (cats.length === 1 ? cats[0].id : null);
    const [catId, setCatIdState] = useState(presetCat);
    const [items, setItems] = useState([]);
    const [reading, setReading] = useState(0);
    // 日期（工地記錄的日期子分類、其他分類的資料日期）一律預設今天
    const [form, setFormState] = useState(() => ({
      day: today(), date: today(), title: defaultTitle(presetCat, false),
      tags: [], customTag: '', note: '', sub: '', newSubName: ''
    }));
    const touched = useRef({ title: false });
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

    // 使用者自己改過名稱後，就不再自動覆蓋
    const setForm = fn => setFormState(prev => {
      const next = typeof fn === 'function' ? fn(prev) : fn;
      if (next.title !== prev.title) touched.current.title = true;
      return next;
    });

    useEffect(() => {
      if (touched.current.title) return;
      setFormState(f => ({ ...f, title: defaultTitle(catId, onlyPdf) }));
    }, [catId, onlyPdf]);

    function setCatId(id) {
      const c = catById(id);
      setCatIdState(id);
      setFormState(f => ({ ...f, sub: c.subKind === 'list' ? f.sub : '', newSubName: c.subKind === 'list' ? f.newSubName : '' }));
    }

    async function addFiles(fileList, kind) {
      const files = Array.from(fileList || []);
      if (!files.length) return;
      setReading(n => n + 1);
      const added = await PR.readFiles(files, kind, { room: MAX_PHOTOS - photoN, toast: actions.toast, allowPdf: canUploadPdf(user) });
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

    const setDiary = (id, v) => setItems(prev => prev.map(i => (i.id === id ? { ...i, diary: v } : i)));
    const renameItem = (id, name) => setItems(prev => prev.map(i => (i.id === id ? { ...i, name } : i)));

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
      const id = uid('n');
      let sub;
      let newSub = null;
      if (cat.subKind === 'list') {
        const s = resolveSub(form, data, catId);
        sub = s.id;
        newSub = s.created;
      }
      actions.addRecord({
        id, cat: catId, date: cat.subKind === 'day' ? form.day : form.date, title: form.title.trim(), uploaderId: user.id, role: user.role,
        uploadedAt: at, tags: form.tags, note: form.note.trim(),
        photos: items.filter(i => i.kind === 'photo').map(toPhoto),
        pdfs: items.filter(i => i.kind === 'pdf').map(i => toPdf({ ...i, diary: cat.subKind === 'day' && i.diary }, user.id, at)),
        sub, status: cat.status ? 'pending' : undefined
      }, { newSub });
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
      cats, presetCat, catId, setCatId, items, reading, addFiles, addSamples, removeItem, setDiary, renameItem,
      form, setForm, err, submit, phase, statuses, paused, resume, createdId, photoN, pdfN, summary
    };
  }

  /**
   * 已選的檔案；文件名稱可以改。能傳工地記錄的帳號，在還沒選分類或選了工地記錄時，PDF 列右邊有「施工日誌」勾選
   * （手機版選檔在選分類之前，所以先顯示；最後選了別的分類，勾選不會生效）。
   */
  function SelectedFiles({ d }) {
    if (!d.items.length) return null;
    const photos = d.items.filter(i => i.kind === 'photo');
    const pdfs = d.items.filter(i => i.kind === 'pdf');
    const diary = d.cats.some(c => c.id === 'site') && (!d.catId || d.catId === 'site');
    const shrunk = photos.filter(p => p.after && p.before && p.after < p.before);
    const before = shrunk.reduce((n, p) => n + p.before, 0);
    const after = shrunk.reduce((n, p) => n + p.after, 0);
    return html`<div class="field">
      <div class="field-label">已選 ${d.summary}</div>
      ${photos.length > 0 && html`<div class="sel-grid">
        ${photos.map(p => html`<div class="sel-item" key=${p.id}>
          <${Photo} p=${p} bare />
          <button class="sel-remove" aria-label=${'移除 ' + p.label} onClick=${() => d.removeItem(p.id)}><${Icon} name="close" size=${20} /></button>
        </div>`)}
      </div>`}
      ${shrunk.length > 0 && html`<div class="hint">照片已壓縮成長邊 2480px，A5 列印也清楚：${fmtSize(before)} → ${fmtSize(after)}</div>`}
      ${pdfs.length > 0 && html`<ul class="file-list">
        ${pdfs.map(f => html`<${PdfNameRow} key=${f.id} f=${f} meta=${`${f.pages ? `${f.pages} 頁｜` : ''}${f.size}`}
          onRename=${d.renameItem} diary=${diary} onDiary=${d.setDiary} onRemove=${d.removeItem} />`)}
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

  // ---------- 工地記錄日期子分類的備註 ----------
  /**
   * 備註的輸入框：改好按「儲存」或 Enter；按「取消」或 Esc 放棄。內容沒變就直接收起來，不留修改記錄。
   * @param {object} props
   * @param {string} props.text0 原本的備註（沒有就是空字串）
   * @param {(text: string) => void} props.onSave 儲存；空字串代表刪掉備註
   * @param {() => void} props.onCancel 放棄修改
   */
  function SiteNoteEditor({ text0, onSave, onCancel }) {
    const [text, setText] = useState(text0);
    const input = useRef(null);
    useEffect(() => {
      const el = input.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }, []);
    const submit = e => {
      e.preventDefault();
      const t = text.trim();
      if (t === text0) onCancel();
      else onSave(t);
    };
    return html`<form class="grp-note-edit" onSubmit=${submit}>
      <input ref=${input} class="input" aria-label="子分類備註" placeholder="例如：天氣、進場材料、當天的重點"
        value=${text} onInput=${e => setText(e.target.value)} onKeyDown=${e => { if (e.key === 'Escape') onCancel(); }} />
      <button type="submit" class="btn btn-primary">儲存</button>
      <button type="button" class="btn btn-outline" onClick=${onCancel}>取消</button>
    </form>`;
  }

  /**
   * 分段標題裡的備註（只有工地記錄的日期子分類有）：平常是鉛筆鈕加備註文字（鉛筆在備註左邊），
   * 按鉛筆後原地換成輸入框，「儲存」「取消」在輸入框右邊，不跳彈窗。
   * 管理者、建築師事務所、承包商都能改，不限時間。
   * @param {object} props
   * @param {object} props.g 分段
   * @param {object} props.user 目前的使用者
   * @param {{ date: ?string, edit: (date: ?string) => void, save: (date: string, text: string) => void }} props.note
   *   正在改哪一天（同一時間只改一個）、開始／結束編輯、儲存
   * @param {number} [props.size] 鉛筆圖示的大小
   */
  function SiteNote({ g, user, note, size = 20 }) {
    if (!g.date) return null;
    if (note.date === g.date) {
      return html`<${SiteNoteEditor} text0=${g.note ? g.note.text : ''}
        onSave=${text => note.save(g.date, text)} onCancel=${() => note.edit(null)} />`;
    }
    return html`
      ${canEditSiteNote(user) && html`<button class="icon-btn grp-edit" aria-label=${`編輯${g.label}的備註`}
        onClick=${() => note.edit(g.date)}><${Icon} name="pencil" size=${size} /></button>`}
      ${g.note && html`<span class="grp-note-inline" title=${g.note.text}>${g.note.text}</span>`}`;
  }

  // ---------- 面板 ----------

  function ShareSheet({ rec, onClose }) {
    const cat = catById(rec.cat);
    const text = `[${cat.short}] ${ymd(rec.date)} ${rec.title}（${countText(rec)}）\n${recordLink(rec.id)}`;
    return html`<${Sheet} title="分享到 LINE 群組" onClose=${onClose}>
      <div class="share-preview">${text}</div>
      <p class="muted">按下後會打開 LINE，選要傳的群組。收到的人點連結要先登入，才看得到內容。</p>
      <a class="btn btn-line btn-block btn-lg" href=${'https://line.me/R/share?text=' + encodeURIComponent(text)} target="_blank" rel="noopener">打開 LINE</a>
    <//>`;
  }

  function DeleteSheet({ rec, user, onClose, onConfirm }) {
    return html`<${Sheet} title="確認刪除這筆記錄" onClose=${onClose}>
      <button class="btn btn-danger btn-block btn-lg" onClick=${onConfirm}>確定刪除</button>
      <button class="btn btn-outline btn-block" onClick=${onClose}>取消</button>
    <//>`;
  }

  function PurgeSheet({ rec, onClose, onConfirm }) {
    return html`<${Sheet} title="確定永久刪除？" onClose=${onClose}>
      <p>「${rec.title}」永久刪除後就救不回來了。</p>
      <p class="muted">一般只用在誤傳私人照片這類情況；這個動作會記在操作記錄。</p>
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

  /** Demo 設定。後台不在這裡放入口，也不說明；管理者直接打 #/backstage 網址才進得去 */
  function DemoSheet({ userId, users, viewMode, setViewMode, simDrop, setSimDrop, onPick, onSampleUpload, onReset, onClose }) {
    const people = [...users, { id: GUEST, guest: true }];
    return html`<${Sheet} title="Demo 設定" onClose=${onClose}>
      <p class="demo-desc">這是給業主與使用者試用的示意版：資料都是假的，照片不會真的上傳。系統時間固定為 2026/09/24 18:00。</p>
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
      <button class="btn btn-outline btn-block" onClick=${onReset}>重置 demo 資料</button>
    <//>`;
  }

  Object.assign(PR, {
    html, D, APP_NAME, NOW, nowIso, MAX_PHOTOS, MAX_PDF_BYTES, RECENT_KEYWORDS, GUEST, DEFAULT_FILTERS, LOG_ACTIONS, ROLES, ROLE_IDS, STATUS,
    pad, uid, toggle, fmtSize, ymd, dt, isoDate, monthLabel, addDays, today, recentDays, siteSubName, billingRange, billingName, fromLabel,
    syncUsers, userById, catById, subList, subLabel, roleName,
    isAdmin, canUpload, canUploadCat, canUploadPdf, canToggleStatus, canManageSubcats, canEditSiteNote, canBilling, canApproveBilling,
    editLeftHours, canEdit, canDelete, canEditFiles, canUpdateDoc, leftText, editNote,
    countText, byLine, docMeta, photoName, recordLink,
    byDateDesc, filtersActive, filterRecords, recentKeywords, groupFor, groupCount, useGroupOpen,
    parseHash, logEntry, updateDocDetail, initialData, initialUsers,
    Icon, Photo, BrandLogo, TopBar, useBodyLock, useEscape, Sheet, DemoBar, DisabledScreen, LoginScreen, Lightbox, PdfViewer,
    StatusBlock, DocList, DateRange,
    validate, Fields, editFormOf, buildEditPatch, EditFiles, toPhoto, toPdf,
    useUploadDraft, SelectedFiles, UploadProgress,
    SiteNote, ShareSheet, DeleteSheet, PurgeSheet, AddAccountSheet, DemoSheet, OrigName
  });
})();
