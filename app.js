/* 阿美中會工地記錄平台 Demo：主程式（狀態、路由、手機版與桌機版切換） */
(function () {
  'use strict';

  const root = document.getElementById('app');
  const PR = window.PR;
  if (!PR || PR.bootFailed || !PR.MobileHome || !PR.RecordsPage || !PR.BillingPage || !PR.BackstageShell || !PR.readFiles) {
    root.innerHTML = '<p class="boot-msg">需要網路連線才能開啟這個 demo，請確認網路後重新整理。</p>';
    return;
  }

  const { render } = window.preact;
  const { useState, useEffect, useRef } = window.preactHooks;
  const {
    html, DEFAULT_FILTERS, GUEST, STATUS, uid, nowIso, syncUsers, catById, roleName, countText, recordLink,
    siteSubName, billingName, isAdmin, canUpload, canEdit, canManageSubcats, parseHash, logEntry, initialData, initialUsers,
    DemoBar, DisabledScreen, LoginScreen, Lightbox, PdfViewer,
    ShareSheet, DeleteSheet, PurgeSheet, AddAccountSheet, DemoSheet,
    MobileHome, MobileUploadBar, MobileRecord, MobileUpload, MobileEdit, MobileBlocked,
    DesktopShell, RecordsPage, SubcatsPage, DesktopUpload, DesktopBlocked, BillingPage,
    BackstageShell, AccountsPage, RecyclePage, LogPage
  } = PR;

  const DESKTOP_MIN = 1024;
  const EDIT_FIELDS = [['date', '日期'], ['title', '名稱'], ['sub', '子分類'], ['tags', '關鍵字'], ['note', '備註'], ['photos', '照片'], ['pdfs', '文件']];
  // 照片、文件比對有哪幾個檔案，以及哪些勾了施工日誌
  const fieldValue = (key, v) => (key === 'photos' || key === 'pdfs' ? (v || []).map(x => `${x.id}${x.diary ? '*' : ''}`) : v ?? '');
  // 手機版有自己畫面的路由；其他（包含桌機才有的頁面）都顯示首頁，底部上傳鈕照常出現
  const MOBILE_SCREENS = ['record', 'edit', 'upload', 'backstage'];
  const isMobileHome = route => !MOBILE_SCREENS.includes(route.name);

  function App() {
    const [users, setUsers] = useState(initialUsers);
    const [userId, setUserId] = useState('u1');
    const [data, setData] = useState(initialData);
    const [route, setRoute] = useState(parseHash);
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [toastMsg, setToastMsg] = useState(null);
    const [sheet, setSheet] = useState(null);
    const [lightbox, setLightbox] = useState(null);
    const [pdf, setPdf] = useState(null);
    const [simDrop, setSimDrop] = useState(false);
    const [uploadRound, setUploadRound] = useState(0);
    const [viewMode, setViewMode] = useState('auto');
    const wideQuery = useRef(window.matchMedia(`(min-width: ${DESKTOP_MIN}px)`));
    const [wide, setWide] = useState(() => wideQuery.current.matches);
    const depth = useRef(0);
    const homeScroll = useRef(0);
    const routeRef = useRef(route);
    routeRef.current = route;

    syncUsers(users);
    const user = userId === GUEST ? null : users.find(u => u.id === userId) || users[0];
    const mode = viewMode === 'auto' ? (wide ? 'desktop' : 'mobile') : viewMode;

    useEffect(() => {
      const onHash = () => {
        const r = parseHash();
        if (isMobileHome(r)) depth.current = 0;
        setRoute(r);
      };
      // 螢幕寬度跨過 1024px 就自動切換手機版／桌機版（媒體查詢比 resize 事件可靠）
      const mq = wideQuery.current;
      const onWidth = () => setWide(mq.matches);
      window.addEventListener('hashchange', onHash);
      window.addEventListener('resize', onWidth);
      if (mq.addEventListener) mq.addEventListener('change', onWidth);
      else mq.addListener(onWidth);
      return () => {
        window.removeEventListener('hashchange', onHash);
        window.removeEventListener('resize', onWidth);
        if (mq.removeEventListener) mq.removeEventListener('change', onWidth);
        else mq.removeListener(onWidth);
      };
    }, []);

    // 手機版：回到首頁時還原捲動位置，進其他頁從頂端開始
    useEffect(() => {
      if (mode !== 'mobile') return;
      const y = isMobileHome(route) ? homeScroll.current : 0;
      requestAnimationFrame(() => window.scrollTo(0, y));
    }, [route.name, route.id, mode]);

    useEffect(() => {
      if (!toastMsg) return undefined;
      const t = setTimeout(() => setToastMsg(null), 3200);
      return () => clearTimeout(t);
    }, [toastMsg]);

    const toast = msg => setToastMsg({ msg, at: Date.now() });
    const closeSheet = () => setSheet(null);
    const addLog = (action, target, detail) => setData(d => ({ ...d, log: [logEntry(user.id, action, target, detail), ...d.log] }));

    const actions = {
      toast,
      go(hash) {
        if (isMobileHome(routeRef.current)) homeScroll.current = window.scrollY;
        depth.current += 1;
        location.hash = hash;
      },
      nav(hash) { location.hash = hash; },
      back() {
        if (depth.current > 0) { depth.current -= 1; history.back(); }
        else location.hash = '#/';
      },
      replace(hash) {
        history.replaceState(null, '', hash);
        setRoute(parseHash());
      },
      again() { setUploadRound(n => n + 1); },
      // 已經在上傳頁（例如上傳完成的畫面）再按「上傳」：網址沒變、不會觸發 hashchange，所以直接重開一批
      startUpload() {
        if (location.hash === '#/upload') setUploadRound(n => n + 1);
        else location.hash = '#/upload';
      },
      openLightbox: (recId, index) => setLightbox({ recId, index }),
      openGallery: (gallery, index) => setLightbox({ gallery, index }),
      openPdf: file => setPdf(file),
      openShare: recId => setSheet({ type: 'share', recId }),
      askDelete: recId => setSheet({ type: 'delete', recId }),
      askPurge: recId => setSheet({ type: 'purge', recId }),
      openAddAccount: () => setSheet({ type: 'addAccount' }),
      copyLink(recId) {
        const link = recordLink(recId);
        const done = () => toast('已複製連結，可以貼到 LINE 群組');
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, () => toast(`請手動複製：${link}`));
        else toast(`請手動複製：${link}`);
      },
      // 一筆記錄的所有照片與文件打包成 zip
      async zipRecord(rec) {
        const items = [...rec.photos.map(file => ({ file, kind: 'photo' })), ...rec.pdfs.map(file => ({ file, kind: 'pdf' }))];
        toast(`正在打包 ${items.length} 個檔案…`);
        try {
          await PR.downloadZip(items, `${rec.date}_${rec.title}.zip`);
          toast(`已打包 ${items.length} 個檔案`);
        } catch (e) {
          toast(e.message || '打包失敗，請再試一次');
        }
      },
      addRecord(rec, extra) {
        const detail = `${catById(rec.cat).name}，${countText(rec)}`;
        setData(d => ({
          ...d,
          records: [rec, ...d.records],
          subcats: extra.newSub ? { ...d.subcats, [rec.cat]: [...d.subcats[rec.cat], extra.newSub] } : d.subcats,
          log: [
            logEntry(user.id, '上傳', rec.title, detail),
            ...(extra.newSub ? [logEntry(user.id, '設定', `${catById(rec.cat).name}子分類`, `新增「${extra.newSub.name}」`)] : []),
            ...d.log
          ]
        }));
      },
      updateRecord(id, patch, extra = {}) {
        setData(d => {
          const old = d.records.find(r => r.id === id);
          if (!old) return d;
          const changed = EDIT_FIELDS
            .filter(([k]) => JSON.stringify(fieldValue(k, old[k])) !== JSON.stringify(fieldValue(k, k in patch ? patch[k] : old[k])))
            .map(([, label]) => label);
          return {
            ...d,
            records: d.records.map(r => (r.id === id ? { ...r, ...patch } : r)),
            subcats: extra.newSub ? { ...d.subcats, [old.cat]: [...d.subcats[old.cat], extra.newSub] } : d.subcats,
            log: [
              logEntry(user.id, '修改', patch.title || old.title, changed.length ? `改了：${changed.join('、')}` : '沒有改動'),
              ...(extra.newSub ? [logEntry(user.id, '設定', `${catById(old.cat).name}子分類`, `新增「${extra.newSub.name}」`)] : []),
              ...d.log
            ]
          };
        });
      },
      setStatus(recId, to) {
        const rec = data.records.find(r => r.id === recId);
        if (!rec || rec.status === to) return;
        setData(d => ({
          ...d,
          records: d.records.map(r => (r.id === recId ? { ...r, status: to, statusBy: user.id, statusAt: nowIso() } : r)),
          log: [logEntry(user.id, '書審狀態', rec.title, `${STATUS[rec.status].label} 改成 ${STATUS[to].label}`), ...d.log]
        }));
        toast(`「${rec.title}」已改成${STATUS[to].label}`);
      },
      // 書審文件「更新」：新檔直接取代舊檔，更新的人和時間記在文件上，也進操作記錄
      async updateDoc(recId, pdfId, file) {
        if (!file) return;
        const rec = data.records.find(r => r.id === recId);
        const old = rec && rec.pdfs.find(p => p.id === pdfId);
        if (!old) return;
        const [it] = await PR.readFiles([file], 'pdf', { room: 0, toast });
        if (!it) return;
        const next = { name: it.name, size: it.size, pages: it.pages, url: it.url, uploaderId: user.id, uploadedAt: nowIso() };
        setData(d => ({
          ...d,
          records: d.records.map(r => (r.id === recId ? { ...r, pdfs: r.pdfs.map(p => (p.id === pdfId ? { ...p, ...next } : p)) } : r)),
          log: [logEntry(user.id, '更新文件', rec.title, `${old.name} 換成 ${it.name}`), ...d.log]
        }));
        toast(`已更新「${it.name}」`);
      },
      // 工地記錄日期子分類的備註：清空就是刪掉備註
      setSiteNote(date, text) {
        setData(d => {
          const notes = { ...d.siteNotes };
          if (text) notes[date] = { text, by: user.id, at: nowIso() };
          else delete notes[date];
          return { ...d, siteNotes: notes, log: [logEntry(user.id, '子分類備註', siteSubName(date), text || '清除備註'), ...d.log] };
        });
        toast(text ? '已儲存子分類備註' : '已清除子分類備註');
      },
      setSubcats(catId, list, detail) {
        setData(d => ({
          ...d,
          subcats: { ...d.subcats, [catId]: list },
          log: detail ? [logEntry(user.id, '設定', `${catById(catId).name}子分類`, detail), ...d.log] : d.log
        }));
      },
      deleteRecord(id) {
        setData(d => {
          const r = d.records.find(x => x.id === id);
          if (!r) return d;
          return {
            ...d,
            records: d.records.filter(x => x.id !== id),
            deleted: [{ ...r, deletedBy: user.id, deletedAt: nowIso(), deleteNote: '' }, ...d.deleted],
            log: [logEntry(user.id, '刪除', r.title, catById(r.cat).name), ...d.log]
          };
        });
      },
      restoreRecord(id) {
        setData(d => {
          const r = d.deleted.find(x => x.id === id);
          if (!r) return d;
          const { deletedBy, deletedAt, deleteNote, ...rest } = r;
          return {
            ...d,
            deleted: d.deleted.filter(x => x.id !== id),
            records: [rest, ...d.records],
            log: [logEntry(user.id, '救回', r.title, catById(r.cat).name), ...d.log]
          };
        });
        toast('已救回，回到原本的位置');
      },
      purgeRecord(id) {
        setData(d => {
          const r = d.deleted.find(x => x.id === id);
          if (!r) return d;
          return {
            ...d,
            deleted: d.deleted.filter(x => x.id !== id),
            log: [logEntry(user.id, '永久刪除', r.title, catById(r.cat).name), ...d.log]
          };
        });
      },
      // ---------- 請款 ----------
      addBilling(info) {
        const b = { id: uid('b'), ...info, createdBy: user.id, createdAt: nowIso(), merged: null, photos: [], docs: [], quotes: [] };
        setData(d => ({ ...d, billing: [...d.billing, b], log: [logEntry(user.id, '請款', billingName(b), '建立請款項目'), ...d.log] }));
        toast(`已建立「${billingName(b)}」`);
        return b.id;
      },
      updateBilling(id, patch, detail) {
        setData(d => {
          const old = d.billing.find(b => b.id === id);
          if (!old) return d;
          const next = { ...old, ...patch };
          return {
            ...d,
            billing: d.billing.map(b => (b.id === id ? next : b)),
            log: detail ? [logEntry(user.id, '請款', billingName(next), detail), ...d.log] : d.log
          };
        });
      },
      // ---------- 帳號 ----------
      updateUser(id, patch) {
        const target = users.find(u => u.id === id);
        if (!target) return;
        setUsers(list => list.map(u => (u.id === id ? { ...u, ...patch } : u)));
        let detail = '';
        if ('disabled' in patch) detail = patch.disabled ? '停用帳號' : '重新啟用帳號';
        if ('role' in patch) detail = `身分改成${roleName(patch.role)}`;
        addLog('帳號', target.name, detail);
        toast(`${target.name}：${detail}`);
      },
      addUser(info) {
        const u = { id: uid('u'), ...info, disabled: false };
        setUsers(list => [...list, u]);
        addLog('帳號', u.name, `新增帳號：${roleName(u.role)}`);
        toast(`已新增 ${u.name}，對方用 ${u.email} 登入就能使用`);
      }
    };

    function renderSheet() {
      if (!sheet) return null;
      if (sheet.type === 'demo') {
        return html`<${DemoSheet} userId=${userId} users=${users} viewMode=${viewMode} setViewMode=${setViewMode}
          simDrop=${simDrop} setSimDrop=${setSimDrop} onClose=${closeSheet}
          onPick=${id => {
            setUserId(id);
            closeSheet();
            const u = users.find(x => x.id === id);
            toast(u ? `已切換為 ${u.name}（${roleName(u.role)}）` : '已切換為未登入');
          }}
          onSampleUpload=${() => { closeSheet(); actions.go('#/upload?sample=1'); }}
          onBackstage=${() => { closeSheet(); actions.nav('#/backstage'); }}
          onReset=${() => {
            setUsers(initialUsers()); setUserId('u1'); setData(initialData()); setFilters(DEFAULT_FILTERS);
            closeSheet(); depth.current = 0; location.hash = '#/'; toast('已重置 demo 資料');
          }} />`;
      }
      if (!user) return null;
      if (sheet.type === 'share') {
        const rec = data.records.find(r => r.id === sheet.recId);
        return rec ? html`<${ShareSheet} rec=${rec} onClose=${closeSheet} />` : null;
      }
      if (sheet.type === 'delete') {
        const rec = data.records.find(r => r.id === sheet.recId);
        if (!rec) return null;
        return html`<${DeleteSheet} rec=${rec} user=${user} onClose=${closeSheet} onConfirm=${() => {
          closeSheet();
          actions.deleteRecord(rec.id);
          if (mode === 'mobile') actions.back();
          else if (route.name === 'record' || route.name === 'edit') actions.replace('#/');
          toast(`已刪除「${rec.title}」`);
        }} />`;
      }
      if (sheet.type === 'purge') {
        const rec = data.deleted.find(r => r.id === sheet.recId);
        if (!rec) return null;
        return html`<${PurgeSheet} rec=${rec} onClose=${closeSheet} onConfirm=${() => {
          closeSheet();
          actions.purgeRecord(rec.id);
          toast(`已永久刪除「${rec.title}」`);
        }} />`;
      }
      if (sheet.type === 'addAccount') {
        return html`<${AddAccountSheet} onClose=${closeSheet} onSave=${info => { closeSheet(); actions.addUser(info); }} />`;
      }
      return null;
    }

    const demoBar = html`<${DemoBar} user=${user} mode=${mode} onOpen=${() => setSheet({ type: 'demo' })}
      onToggleMode=${() => setViewMode(mode === 'desktop' ? 'mobile' : 'desktop')} />`;
    const gallery = user && lightbox && (lightbox.gallery || data.records.find(r => r.id === lightbox.recId));
    const overlays = html`
      ${gallery && html`<${Lightbox} gallery=${gallery} index=${lightbox.index} toast=${toast}
        onIndex=${i => setLightbox(lb => (lb ? { ...lb, index: i } : lb))} onClose=${() => setLightbox(null)} />`}
      ${user && pdf && html`<${PdfViewer} pdf=${pdf} toast=${toast} onClose=${() => setPdf(null)} />`}
      ${renderSheet()}
      ${toastMsg && html`<div class="toast" role="status" key=${toastMsg.at}>${toastMsg.msg}</div>`}`;
    const shellClass = mode === 'desktop' ? 'd-app' : 'app';

    if (!user) {
      return html`<div class=${shellClass}>${demoBar}<${LoginScreen} toast=${toast} />${overlays}</div>`;
    }
    if (user.disabled) {
      return html`<div class=${shellClass}>${demoBar}<${DisabledScreen} user=${user} />${overlays}</div>`;
    }

    const common = { user, data, actions };
    const q = route.query || {};
    const uploadKey = [uploadRound, userId, q.cat || '', q.sample || ''].join('|');

    // ---------- 後台（管理者、桌機） ----------
    if (route.name === 'backstage' && isAdmin(user) && mode === 'desktop') {
      let page;
      if (route.id === 'accounts') page = html`<${AccountsPage} user=${user} users=${users} actions=${actions} />`;
      else if (route.id === 'recycle') page = html`<${RecyclePage} data=${data} actions=${actions} />`;
      else if (route.id === 'log') page = html`<${LogPage} data=${data} users=${users} />`;
      else page = html`<${DesktopBlocked} message="找不到這個頁面。" />`;
      return html`<div class="d-app">
        ${demoBar}
        <${BackstageShell} user=${user} route=${route} data=${data} actions=${actions}>${page}<//>
        ${overlays}
      </div>`;
    }

    // ---------- 桌機版 ----------
    if (mode === 'desktop') {
      let page;
      if (route.name === 'upload') {
        page = canUpload(user)
          ? html`<${DesktopUpload} key=${uploadKey} ...${common} preset=${q} simDrop=${simDrop} />`
          : html`<${DesktopBlocked} message="這個帳號不能上傳。" />`;
      } else if (route.name === 'billing') {
        page = html`<${BillingPage} ...${common} route=${route} />`;
      } else if (route.name === 'settings') {
        if (!canManageSubcats(user)) page = html`<${DesktopBlocked} message="這個頁面只有管理者和建築師事務所能使用。" />`;
        else if (route.id === 'review' || route.id === 'event') page = html`<${SubcatsPage} key=${route.id} catId=${route.id} data=${data} actions=${actions} />`;
        else page = html`<${DesktopBlocked} message="找不到這個頁面。" />`;
      } else if (route.name === 'backstage') {
        // 不是管理者：當作沒有這個網址，不透露後台存在
        page = html`<${DesktopBlocked} message="找不到這個頁面。" />`;
      } else {
        page = html`<${RecordsPage} ...${common} filters=${filters} setFilters=${setFilters} route=${route} />`;
      }
      return html`<div class="d-app">
        ${demoBar}
        <${DesktopShell} user=${user} route=${route} actions=${actions}>${page}<//>
        ${overlays}
      </div>`;
    }

    // ---------- 手機版 ----------
    let screen;
    if (route.name === 'record') {
      const rec = data.records.find(r => r.id === route.id);
      screen = rec
        ? html`<${MobileRecord} ...${common} rec=${rec} />`
        : html`<${MobileBlocked} title="記錄內容" message="這筆記錄已經刪除或不存在。" onBack=${actions.back} />`;
    } else if (route.name === 'edit') {
      const rec = data.records.find(r => r.id === route.id);
      if (!rec) screen = html`<${MobileBlocked} title="修改資料" message="這筆記錄已經刪除或不存在。" onBack=${actions.back} />`;
      else if (!canEdit(user, rec)) screen = html`<${MobileBlocked} title="修改資料" message="你沒有權限修改這筆記錄。" onBack=${actions.back} />`;
      else screen = html`<${MobileEdit} key=${rec.id + userId} ...${common} rec=${rec} />`;
    } else if (route.name === 'upload') {
      screen = canUpload(user)
        ? html`<${MobileUpload} key=${uploadKey} ...${common} preset=${q} simDrop=${simDrop} />`
        : html`<${MobileBlocked} title="上傳" message="這個帳號不能上傳。" onBack=${actions.back} />`;
    } else if (route.name === 'backstage') {
      screen = html`<${MobileBlocked} title="" message=${isAdmin(user) ? '後台請用電腦開啟。' : '找不到這個頁面。'} onBack=${actions.back} />`;
    } else {
      screen = html`<${MobileHome} ...${common} filters=${filters} setFilters=${setFilters} />`;
    }

    const onHome = isMobileHome(route);
    const showBar = onHome && canUpload(user);
    const appClass = ['app', onHome && 'is-home', showBar && 'has-bar'].filter(Boolean).join(' ');
    return html`<div class=${appClass}>
      ${demoBar}
      ${screen}
      ${showBar && html`<${MobileUploadBar} user=${user} actions=${actions} />`}
      ${overlays}
    </div>`;
  }

  root.textContent = ''; // 清掉「載入中…」
  render(html`<${App} />`, root);
})();
