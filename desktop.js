/* 阿美中會工地記錄平台 Demo：桌機版（辦公室用，負責檢視與細節管理；也能拖拉上傳 PDF） */
(function () {
  'use strict';

  const PR = window.PR;
  if (!PR || PR.bootFailed) return;

  const { useState, useRef } = window.preactHooks;
  const {
    html, D, APP_NAME, DEFAULT_FILTERS, STATUS, uid, ymd, dt, userById, catById, subList, subLabel, roleName,
    canUpload, canUploadPdf, canManageSubcats, canEdit, canDelete, canEditFiles,
    countText, byLine, filtersActive, filterRecords, recentKeywords, groupFor, groupCount, useGroupOpen,
    Icon, Photo, BrandLogo, Sheet, StatusBlock, DocList, DateRange, SiteNote,
    Fields, EditFiles, editFormOf, buildEditPatch, useUploadDraft, SelectedFiles, UploadProgress
  } = PR;

  const rowKeys = onSelect => e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } };

  // ---------- 外框：頂端列＋左側選單（分三段：上傳、記錄、子分類管理） ----------
  function DesktopShell({ user, route, actions, children }) {
    const onRecords = ['home', 'record', 'edit'].includes(route.name);
    const nav = [
      { label: '檔案夾', hash: '#/', on: onRecords },
      { label: '請款', hash: '#/billing', on: route.name === 'billing' }
    ];
    const manage = [
      { id: 'review', label: '書審及材料測試' },
      { id: 'event', label: '活動記錄' }
    ];
    const link = (hash, label, on) => html`<a class=${'d-nav-item' + (on ? ' on' : '')} href=${hash}
      onClick=${e => { e.preventDefault(); actions.nav(hash); }}>${label}</a>`;
    return html`<div class="d-shell">
      <header class="d-head">
        <div class="d-brand"><${BrandLogo} />${APP_NAME}</div>
        <div class="d-user">${user.name}｜${roleName(user.role)}</div>
      </header>
      <div class="d-body">
        <nav class="d-nav" aria-label="主選單">
          ${canUpload(user) && html`<div class="d-nav-sec">
            <button class=${'btn btn-primary btn-block d-upload' + (route.name === 'upload' ? ' on' : '')}
              aria-current=${route.name === 'upload' ? 'page' : undefined} onClick=${actions.startUpload}><${Icon} name="upload" />上傳</button>
          </div>`}
          <div class="d-nav-sec">
            <div class="d-nav-group">記錄</div>
            ${nav.map(n => link(n.hash, n.label, n.on))}
          </div>
          ${canManageSubcats(user) && html`<div class="d-nav-sec">
            <div class="d-nav-group">子分類管理</div>
            ${manage.map(n => link('#/settings/' + n.id, n.label, route.name === 'settings' && route.id === n.id))}
          </div>`}
        </nav>
        <main class="d-main">${children}</main>
      </div>
    </div>`;
  }

  // ---------- 檔案夾：可收合的分段 ----------
  // 分段列：月份深色底、子分類淺灰底（kind 由分組時決定）；工地記錄的日期子分類，備註排同一行，按鉛筆直接在這裡改
  function GroupRow({ g, level, cols, open, onToggle, user, note }) {
    return html`<tr class=${`d-group-row lv${level} kind-${g.kind}`}>
      <td colspan=${cols}>
        <div class="grp-line">
          <button class="grp-toggle" aria-expanded=${open} onClick=${onToggle}>
            <${Icon} name=${open ? 'down' : 'right'} size=${18} />
            <span class="grp-label">${g.label}</span>
            <span class="d-group-n">${groupCount(g)} 筆</span>
          </button>
          <${SiteNote} g=${g} user=${user} note=${note} size=${18} />
        </div>
      </td>
    </tr>`;
  }

  /**
   * 列表的一筆：最前面是檔案夾建檔日期。上方分頁已經選了大分類時不再顯示大分類；
   * 書審狀態只標「通過」，處理中的不標。關鍵字用小標籤排在名稱後面。
   */
  function RecRow({ r, depth, selId, onSelect, compact, showCat, dl }) {
    const cat = catById(r.cat);
    const picked = dl.on ? dl.countFor(r.id) : 0;
    return html`<tr class=${'d-row depth-' + depth + (selId === r.id ? ' on' : '')} tabIndex="0" aria-selected=${selId === r.id}
      onClick=${() => onSelect(r.id)} onKeyDown=${rowKeys(() => onSelect(r.id))}>
      <td class="c-nowrap c-date">${ymd(r.date)}</td>
      <td class="c-name">
        <div class="c-name-line">
          ${showCat && html`<span class="chip">${cat.short}</span>`}
          <span class="c-title">${r.title}</span>
          ${r.status === 'pass' && html`<span class=${'st ' + STATUS.pass.cls}>${STATUS.pass.label}</span>`}
          ${r.tags.map(t => html`<span class="kw">${t}</span>`)}
          ${picked > 0 && html`<span class="badge-picked">已選 ${picked}</span>`}
        </div>
        ${r.note && html`<div class="c-note">${r.note}</div>`}
        ${compact && html`<div class="c-sub">${byLine(r)}｜${countText(r)}</div>`}
      </td>
      ${!compact && html`<td>${byLine(r)}</td><td>${countText(r)}</td>`}
    </tr>`;
  }

  function RecordTable({ recs, groups, isOpen, flip, user, selId, onSelect, compact, showCat, dl, note }) {
    const cols = compact ? 2 : 4;
    const rows = [];
    const rec = (r, depth) => rows.push(html`<${RecRow} key=${r.id} r=${r} depth=${depth} selId=${selId}
      onSelect=${onSelect} compact=${compact} showCat=${showCat} dl=${dl} />`);
    const head = (g, level) => rows.push(html`<${GroupRow} key=${'g' + g.key} g=${g} level=${level} cols=${cols}
      open=${isOpen(g.key)} onToggle=${() => flip(g.key)} user=${user} note=${note} />`);
    if (!groups) recs.forEach(r => rec(r, 0));
    else {
      groups.forEach(g => {
        head(g, 0);
        if (!isOpen(g.key)) return;
        if (g.children) {
          g.children.forEach(c => {
            head(c, 1);
            if (isOpen(c.key)) c.recs.forEach(r => rec(r, 2));
          });
        } else if (g.recs.length) g.recs.forEach(r => rec(r, 1));
        else rows.push(html`<tr key=${'e' + g.key} class="d-empty-row"><td colspan=${cols}>沒有檔案夾</td></tr>`);
      });
    }
    const depth = groups ? (groups.some(g => g.children) ? 2 : 1) : 0;
    return html`<table class=${`d-table fixed depth${depth}` + (compact ? ' compact' : '')}>
      <thead><tr>
        <th class="w-date">檔案夾建檔日期</th><th>檔案夾名稱</th>
        ${!compact && html`<th class="w-by">上傳者</th><th class="w-count">內容</th>`}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  // 照片牆：跟列表同樣的分段（只列有照片的）；一次下載多個檔案時點照片是勾選
  function PhotoWall({ recs, groups, isOpen, flip, selId, onSelect, actions, dl, user, note }) {
    const withPhotos = list => list.filter(r => r.photos.length);
    const block = r => html`<div class=${'d-wall-rec' + (selId === r.id ? ' on' : '')} key=${r.id}>
      <button class="d-wall-head" onClick=${() => onSelect(r.id)}>
        <span class="date">${ymd(r.date)}</span><span>${r.title}</span><span class="meta">${r.photos.length} 張</span>
      </button>
      <div class="d-wall-grid">
        ${r.photos.map((p, i) => {
          const picked = dl.on && dl.isPicked(r.id, p.id);
          return html`<button class=${'thumb' + (picked ? ' picked' : '')} aria-label=${`${r.title} 第 ${i + 1} 張`} aria-pressed=${dl.on ? picked : undefined}
            onClick=${() => { onSelect(r.id); if (dl.on) dl.toggle(r, p, 'photo'); else actions.openLightbox(r.id, i); }}>
            <${Photo} p=${p} bare />
            ${dl.on && html`<span class="pick-mark" aria-hidden="true">${picked && html`<${Icon} name="check" size=${18} stroke=${3} />`}</span>`}
          </button>`;
        })}
      </div>
    </div>`;
    const head = (g, level) => html`<div class=${`d-wall-title lv${level} kind-${g.kind}`}>
      <button class="grp-toggle" aria-expanded=${isOpen(g.key)} onClick=${() => flip(g.key)}>
        <${Icon} name=${isOpen(g.key) ? 'down' : 'right'} size=${18} /><span class="grp-label">${g.label}</span>
      </button>
      <${SiteNote} g=${g} user=${user} note=${note} size=${18} />
    </div>`;
    if (!groups) {
      const list = withPhotos(recs);
      return list.length ? html`<div class="d-wall">${list.map(block)}</div>` : html`<div class="empty"><p>這些條件下沒有照片</p></div>`;
    }
    const sections = groups
      .map(g => (g.children
        ? { ...g, children: g.children.map(c => ({ ...c, recs: withPhotos(c.recs) })).filter(c => c.recs.length) }
        : { ...g, recs: withPhotos(g.recs) }))
      .filter(g => (g.children ? g.children.length : g.recs.length));
    if (!sections.length) return html`<div class="empty"><p>這些條件下沒有照片</p></div>`;
    return html`<div class="d-wall">
      ${sections.map(g => html`<section key=${g.key} class="d-wall-group">
        ${head(g, 0)}
        ${isOpen(g.key) && (g.children
          ? g.children.map(c => html`<div key=${c.key} class="d-wall-sub">${head(c, 1)}${isOpen(c.key) && c.recs.map(block)}</div>`)
          : g.recs.map(block))}
      </section>`)}
    </div>`;
  }

  function RecordsPage({ user, data, filters, setFilters, route, actions }) {
    const [view, setView] = useState('table');
    const [dlMode, setDlMode] = useState(false);
    const [picked, setPicked] = useState({});
    const [zipping, setZipping] = useState(null);
    const [noteDate, setNoteDate] = useState(null);
    const note = { date: noteDate, edit: setNoteDate, save: (date, text) => { actions.setSiteNote(date, text); setNoteDate(null); } };
    const setF = patch => setFilters({ ...filters, ...patch });
    const recs = filterRecords(data.records, filters, data);
    const groups = groupFor(filters.cat, recs, data, !filtersActive(filters));
    const { isOpen, flip } = useGroupOpen(groups, filtersActive(filters));
    // 清除條件只清搜尋、日期、關鍵字，留在當下的大分類；只切了大分類時不算有條件
    const active = filtersActive(filters);
    const clearFilters = () => setFilters({ ...DEFAULT_FILTERS, cat: filters.cat });
    const selId = route.name === 'record' || route.name === 'edit' ? route.id : null;
    const sel = selId && data.records.find(r => r.id === selId);
    // 網址指到已刪除或不存在的檔案夾（例如舊的分享連結）：側窗說明，跟手機版一樣
    const missing = !!selId && !sel;
    const select = id => actions.replace('#/record/' + id);

    // 一次下載多個檔案：跨檔案夾、跨分類勾選檔案，最後打包成一個 zip；結束時回到按下之前的畫面
    const before = useRef(null);
    const keyOf = (recId, fileId) => `${recId}:${fileId}`;
    const dl = {
      on: dlMode,
      isPicked: (recId, fileId) => !!picked[keyOf(recId, fileId)],
      toggle: (rec, file, kind) => setPicked(p => {
        const k = keyOf(rec.id, file.id);
        const next = { ...p };
        if (next[k]) delete next[k];
        else next[k] = { recId: rec.id, fileId: file.id, kind };
        return next;
      }),
      setAll: (rec, on) => setPicked(p => {
        const next = { ...p };
        [...rec.photos.map(f => [f, 'photo']), ...rec.pdfs.map(f => [f, 'pdf'])].forEach(([f, kind]) => {
          const k = keyOf(rec.id, f.id);
          if (on) next[k] = { recId: rec.id, fileId: f.id, kind };
          else delete next[k];
        });
        return next;
      }),
      countFor: recId => Object.values(picked).filter(x => x.recId === recId).length
    };
    const pickedN = Object.keys(picked).length;
    const download = async () => {
      const items = Object.values(picked).map(x => {
        const rec = data.records.find(r => r.id === x.recId);
        const file = rec && (x.kind === 'photo' ? rec.photos : rec.pdfs).find(f => f.id === x.fileId);
        return file && { folder: `${rec.date}_${rec.title}`, file, kind: x.kind };
      }).filter(Boolean);
      setZipping({ done: 0, total: items.length });
      try {
        await PR.downloadZip(items, `阿美中會工地記錄_${items.length}個檔案.zip`, (done, total) => setZipping({ done, total }));
        actions.toast(`已打包 ${items.length} 個檔案`);
        setZipping(null);
        endDl();
      } catch (e) {
        actions.toast(e.message || '打包失敗，請再試一次');
        setZipping(null);
      }
    };
    const startDl = () => { before.current = { selId, filters, view }; setDlMode(true); };
    /** 結束一次下載多個檔案（按「結束多檔下載」或下載完成）：分類、篩選、顯示方式和側窗都回到開始之前的樣子 */
    const endDl = () => {
      setDlMode(false);
      setPicked({});
      const b = before.current;
      before.current = null;
      if (!b) return;
      setFilters(b.filters);
      setView(b.view);
      const hash = b.selId ? '#/record/' + b.selId : '#/';
      if (location.hash !== hash) actions.replace(hash);
    };
    const kwOptions = recentKeywords(data).filter(t => !filters.tags.includes(t));

    return html`<div class=${'d-page d-split' + (sel || missing ? ' has-detail' : '')}>
      <section class="d-list-col">
        <div class="d-toolbar">
          <div class="d-tabs" role="group" aria-label="分類">
            ${[{ id: 'all', short: '全部' }, ...D.categories].map(c => html`<button class=${'d-tab' + (filters.cat === c.id ? ' on' : '')}
              aria-pressed=${filters.cat === c.id} onClick=${() => setF({ cat: c.id })}>${c.short}</button>`)}
          </div>
          <div class="d-filter-box">
            <div class="d-filter-row">
              <div class="search d-search">
                <${Icon} name="search" />
                <input type="search" aria-label="關鍵字搜尋" placeholder="搜尋檔案夾、關鍵字、備註、上傳者" value=${filters.q}
                  onInput=${e => setF({ q: e.target.value })} />
              </div>
              <${DateRange} compact from=${filters.from} to=${filters.to} onChange=${setF} />
              <select class="select sm" aria-label="加入關鍵字篩選" value="" onChange=${e => { if (e.target.value) setF({ tags: [...filters.tags, e.target.value] }); }}>
                <option value="">加入關鍵字篩選</option>
                ${kwOptions.map(t => html`<option value=${t}>${t}</option>`)}
              </select>
            </div>
            ${filters.tags.length > 0 && html`<div class="d-filter-tags" role="group" aria-label="已加入的關鍵字篩選">
              <span class="d-filter-label">關鍵字篩選</span>
              ${filters.tags.map(t => html`<button class="tag on sm" aria-label=${'移除關鍵字篩選 ' + t}
                onClick=${() => setF({ tags: filters.tags.filter(x => x !== t) })}>${t}<${Icon} name="close" size=${16} /></button>`)}
            </div>`}
            <div class="d-result-row">
              <div class="seg d-seg" role="group" aria-label="顯示方式">
                <button class=${view === 'table' ? 'on' : ''} aria-pressed=${view === 'table'} onClick=${() => setView('table')}>列表</button>
                <button class=${view === 'photos' ? 'on' : ''} aria-pressed=${view === 'photos'} onClick=${() => setView('photos')}>照片</button>
              </div>
              <span>找到 ${recs.length} 筆</span>
              ${active && html`<button class="link-btn" onClick=${clearFilters}>清除條件</button>`}
              <div class="d-result-tools">
                <button class=${'btn btn-outline sm' + (dlMode ? ' on' : '')} aria-pressed=${dlMode}
                  onClick=${() => (dlMode ? endDl() : startDl())}><${Icon} name="download" size=${20} />${dlMode ? '結束多檔下載' : '一次下載多個檔案'}</button>
              </div>
            </div>
            ${dlMode && html`<div class="d-dlbar" role="status">
              <span>${zipping
                ? `正在打包 ${zipping.done} / ${zipping.total} 個檔案…`
                : pickedN ? `已選 ${pickedN} 個檔案` : '點任一筆檔案夾，再勾選右邊的照片或文件；可以跨不同檔案夾、分類一起選'}</span>
              <div class="d-dlbar-actions">
                ${pickedN > 0 && !zipping && html`<button class="link-btn" onClick=${() => setPicked({})}>清除</button>`}
                <button class="btn btn-primary sm" disabled=${!pickedN || !!zipping} onClick=${download}>
                  <${Icon} name="download" size=${20} />下載${pickedN ? ` ${pickedN} 個` : ''}檔案
                </button>
              </div>
            </div>`}
          </div>
        </div>
        <div class="d-scroll">
          ${recs.length === 0 && !(groups && groups.length)
            ? html`<div class="empty"><p>沒有符合的檔案夾</p>${active && html`<button class="btn btn-outline" onClick=${clearFilters}>清除條件</button>`}</div>`
            : view === 'table'
              ? html`<${RecordTable} recs=${recs} groups=${groups} isOpen=${isOpen} flip=${flip} user=${user}
                  selId=${selId} onSelect=${select} compact=${!!sel || missing} showCat=${filters.cat === 'all'} dl=${dl} note=${note} />`
              : html`<${PhotoWall} recs=${recs} groups=${groups} isOpen=${isOpen} flip=${flip} selId=${selId} onSelect=${select}
                  actions=${actions} dl=${dl} user=${user} note=${note} />`}
        </div>
      </section>
      ${sel && html`<aside class="d-detail-col" aria-label="詳細資料">
        <${RecordDetail} key=${sel.id} rec=${sel} user=${user} data=${data} actions=${actions} dl=${dl}
          startEditing=${route.name === 'edit'} onClose=${() => actions.replace('#/')} />
      </aside>`}
      ${missing && html`<aside class="d-detail-col" aria-label="詳細資料">
        <div class="d-detail">
          <div class="d-detail-head"><span></span><${DetailClose} onClose=${() => actions.replace('#/')} /></div>
          <div class="empty"><p>這個檔案夾已經刪除或不存在。</p></div>
        </div>
      </aside>`}
    </div>`;
  }

  function DetailClose({ onClose }) {
    return onClose ? html`<button class="icon-btn d-close" aria-label="關閉詳細資料" onClick=${onClose}><${Icon} name="close" size=${28} /></button>` : null;
  }

  function RecordDetail({ rec, user, data, actions, dl, startEditing, onClose }) {
    const editable = canEdit(user, rec);
    const deletable = canDelete(user, rec);
    const [editing, setEditing] = useState(!!startEditing && editable);
    const [form, setForm] = useState(() => editFormOf(rec));
    const [err, setErr] = useState('');
    const cat = catById(rec.cat);
    const sub = subLabel(data, rec);
    const up = userById(rec.uploaderId);
    const picking = !!(dl && dl.on);
    const fileN = rec.photos.length + rec.pdfs.length;
    const pickedHere = picking ? dl.countFor(rec.id) : 0;

    const closeEdit = () => {
      setEditing(false);
      setErr('');
      if (location.hash.startsWith('#/edit/')) actions.replace('#/record/' + rec.id);
    };
    const save = () => {
      const result = buildEditPatch(rec, form, user, data);
      if (result.error) { setErr(result.error); return; }
      actions.updateRecord(rec.id, result.patch, result);
      actions.toast('已儲存');
      closeEdit();
    };

    if (editing) {
      return html`<div class="d-detail">
        <h2 class="d-detail-title">修改檔案夾</h2>
        <${Fields} form=${form} setForm=${setForm} catId=${rec.cat} user=${user} data=${data} extraDay=${rec.cat === 'site' ? rec.date : ''} />
        <${EditFiles} form=${form} setForm=${setForm} rec=${rec} user=${user} toast=${actions.toast} renameOnly=${!canEditFiles(user, rec)} />
        ${err && html`<div class="notice error">${err}</div>`}
        <div class="btn-row">
          <button class="btn btn-primary" onClick=${save}>儲存</button>
          <button class="btn btn-outline" onClick=${() => { setForm(editFormOf(rec)); closeEdit(); }}>取消</button>
        </div>
      </div>`;
    }

    return html`<div class="d-detail">
      <div class="d-detail-head">
        <div class="card-top">
          <span class="chip">${cat.name}</span>
          ${sub && html`<span class="chip">${sub}</span>`}
          <span class="date">${ymd(rec.date)}</span>
        </div>
        <${DetailClose} onClose=${onClose} />
      </div>
      <h2 class="d-detail-title">${rec.title}</h2>
      <div>
        <div class="meta">${byLine(rec)}${up.disabled ? '（帳號已停用）' : ''}</div>
        <div class="meta">上傳於 ${dt(rec.uploadedAt)}</div>
        ${rec.editedAt && html`<div class="meta">最後修改：${userById(rec.editedBy).name} ${dt(rec.editedAt)}</div>`}
      </div>

      ${cat.status && html`<${StatusBlock} rec=${rec} user=${user} actions=${actions} />`}

      ${picking
        ? html`<div class="d-actions">
            <button class="btn btn-outline sm" onClick=${() => dl.setAll(rec, pickedHere < fileN)}>
              ${pickedHere < fileN ? `全選這個檔案夾（${fileN} 個檔案）` : '取消這個檔案夾的勾選'}
            </button>
          </div>`
        : html`<div class="d-actions">
            ${editable && html`<button class="btn btn-outline sm" onClick=${() => { setForm(editFormOf(rec)); setEditing(true); }}>修改</button>`}
            ${deletable && html`<button class="btn btn-outline sm danger" onClick=${() => actions.askDelete(rec.id)}>刪除</button>`}
            <button class="btn btn-outline sm" onClick=${() => actions.copyLink(rec.id)}>複製連結</button>
            ${fileN > 1 && html`<button class="btn btn-outline sm" onClick=${() => actions.zipRecord(rec)}><${Icon} name="download" size=${20} />整本下載</button>`}
          </div>`}

      ${rec.tags.length > 0 && html`<div class="kv"><span>關鍵字</span><span>${rec.tags.join('、')}</span></div>`}
      ${rec.note && html`<div class="kv"><span>備註</span><span>${rec.note}</span></div>`}

      ${rec.photos.length > 0 && html`<section class="sec">
        <h3 class="d-sec-title">照片 ${rec.photos.length} 張</h3>
        <div class="grid4">
          ${rec.photos.map((p, i) => {
            const picked = picking && dl.isPicked(rec.id, p.id);
            return html`<button class=${'thumb' + (picked ? ' picked' : '')} aria-label=${`看第 ${i + 1} 張`} aria-pressed=${picking ? picked : undefined}
              onClick=${() => (picking ? dl.toggle(rec, p, 'photo') : actions.openLightbox(rec.id, i))}>
              <${Photo} p=${p} bare />
              ${picking && html`<span class="pick-mark" aria-hidden="true">${picked && html`<${Icon} name="check" size=${18} stroke=${3} />`}</span>`}
            </button>`;
          })}
        </div>
      </section>`}

      ${rec.pdfs.length > 0 && html`<section class="sec">
        <h3 class="d-sec-title">文件 ${rec.pdfs.length} 份</h3>
        <${DocList} rec=${rec} user=${user} actions=${actions} dl=${dl} />
      </section>`}
    </div>`;
  }

  // ---------- 管理：子分類（管理者、建築師事務所；可以新增、改名、排序、移除沒用到的） ----------
  function SubcatsPage({ catId, data, actions }) {
    const cat = catById(catId);
    const list = subList(data, catId);
    const [name, setName] = useState('');
    const [editing, setEditing] = useState(null);
    const usage = id => data.records.filter(r => r.cat === catId && r.sub === id).length;
    const add = () => {
      const t = name.trim();
      if (!t) return;
      if (list.some(s => s.name === t)) { actions.toast('這個子分類已經有了'); return; }
      actions.setSubcats(catId, [...list, { id: uid('sc'), name: t }], `新增「${t}」`);
      setName('');
    };
    const rename = () => {
      const t = editing.name.trim();
      const old = list.find(s => s.id === editing.id);
      if (!t || t === old.name) { setEditing(null); return; }
      if (list.some(s => s.name === t)) { actions.toast('這個名稱已經有了'); return; }
      actions.setSubcats(catId, list.map(s => (s.id === editing.id ? { ...s, name: t } : s)), `「${old.name}」改名為「${t}」`);
      setEditing(null);
    };
    const move = (i, dir) => {
      const j = i + dir;
      if (j < 0 || j >= list.length) return;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      actions.setSubcats(catId, next);
    };
    return html`<div class="d-page">
      <div class="d-page-head">
        <h1 class="d-h1">${cat.name}的子分類</h1>
      </div>
      <div class="d-card d-narrow-card">
        <ul class="tag-admin">
          ${list.map((s, i) => {
            const n = usage(s.id);
            const isEditing = editing && editing.id === s.id;
            return html`<li key=${s.id}>
              ${isEditing
                ? html`<input class="input sub-rename" aria-label=${s.name + ' 的新名稱'} value=${editing.name}
                    onInput=${e => setEditing({ ...editing, name: e.target.value })}
                    onKeyDown=${e => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') setEditing(null); }} />`
                : html`<span class="tag-name">${s.name}<span class="tag-use">${n ? `${n} 個檔案夾` : '還沒有檔案夾'}</span></span>`}
              ${isEditing
                ? html`<button class="btn btn-primary sm" onClick=${rename}>儲存</button>
                    <button class="btn btn-outline sm" onClick=${() => setEditing(null)}>取消</button>`
                : html`<button class="btn btn-outline sm" onClick=${() => setEditing({ id: s.id, name: s.name })}>改名</button>
                    <button class="icon-btn sm" aria-label=${s.name + ' 往上移'} disabled=${i === 0} onClick=${() => move(i, -1)}><${Icon} name="up" /></button>
                    <button class="icon-btn sm" aria-label=${s.name + ' 往下移'} disabled=${i === list.length - 1} onClick=${() => move(i, 1)}><${Icon} name="down" /></button>
                    ${n > 0
                      ? html`<span class="tip" tabIndex="0" data-tip="有檔案夾在用這個子分類，不能移除" aria-label="有檔案夾在用這個子分類，不能移除">
                          <button class="btn btn-outline sm danger" disabled>移除</button>
                        </span>`
                      : html`<button class="btn btn-outline sm danger"
                          onClick=${() => actions.setSubcats(catId, list.filter(x => x.id !== s.id), `移除「${s.name}」`)}>移除</button>`}`}
            </li>`;
          })}
        </ul>
        <div class="inline-add">
          <input class="input" aria-label="新子分類" placeholder="新子分類名稱" value=${name}
            onInput=${e => setName(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') add(); }} />
          <button class="btn btn-primary" onClick=${add}>新增</button>
        </div>
      </div>
    </div>`;
  }

  // ---------- 上傳（桌機版：拖拉檔案，一頁填完） ----------
  function DesktopUpload({ user, data, preset, simDrop, actions }) {
    const d = useUploadDraft({ user, data, preset, simDrop, actions });
    const [drag, setDrag] = useState(false);
    const [askLeave, setAskLeave] = useState(false);
    const allowPdf = canUploadPdf(user);
    // 跟手機版一樣：已經選了檔案、還沒上傳就離開，先問一次
    const leave = () => { if (d.items.length) setAskLeave(true); else actions.back(); };

    if (d.phase === 'progress') {
      return html`<div class="d-page"><div class="d-narrow">
        <h1 class="d-h1">上傳中</h1>
        <${UploadProgress} d=${d} />
      </div></div>`;
    }
    if (d.phase === 'done') {
      return html`<div class="d-page"><div class="d-narrow">
        <div class="done-mark"><${Icon} name="check" size=${60} stroke=${3} /></div>
        <div class="done-title">上傳完成</div>
        <p class="done-sub">已存到「${catById(d.catId).name}」，共 ${d.summary}</p>
        <div class="btn-row">
          <button class="btn btn-primary" onClick=${() => actions.replace('#/record/' + d.createdId)}>查看這個檔案夾</button>
          <button class="btn btn-outline" onClick=${() => actions.copyLink(d.createdId)}>複製連結</button>
          <button class="btn btn-outline" onClick=${actions.again}>再傳一批</button>
        </div>
      </div></div>`;
    }

    const onDrop = e => {
      e.preventDefault();
      setDrag(false);
      d.addFiles(e.dataTransfer.files, 'auto');
    };

    return html`<div class="d-page">
      <div class="d-page-head">
        <div>
          <h1 class="d-h1">${allowPdf ? '上傳照片或文件' : '上傳工地照片'}</h1>
          <p class="muted">${allowPdf ? '電腦裡的 PDF（契約、施工日誌、送審文件）適合在這裡傳；現場照片建議直接用手機傳。' : '阿美中會帳號可以上傳工地記錄的照片。'}</p>
        </div>
        <button class="btn btn-outline" onClick=${leave}>取消</button>
      </div>
      <div class="d-upload-grid">
        <section class="d-card">
          <label class=${'dropzone' + (drag ? ' on' : '')}
            onDragOver=${e => { e.preventDefault(); setDrag(true); }}
            onDragLeave=${() => setDrag(false)}
            onDrop=${onDrop}>
            <input type="file" multiple accept=${allowPdf ? 'image/*,application/pdf,.pdf' : 'image/*'}
              onChange=${e => { d.addFiles(e.target.files, 'auto'); e.target.value = ''; }} />
            <${Icon} name="upload" size=${40} />
            <strong>${allowPdf ? '把照片或 PDF 拖到這裡' : '把照片拖到這裡'}</strong>
            <span class="muted">或按這裡選檔；照片一次最多 100 張${allowPdf ? '，PDF 每份 50MB 以內' : ''}</span>
          </label>
          ${!d.items.length && html`<button class="btn btn-outline btn-block" onClick=${d.addSamples}>（Demo）加入 15 張範例照片</button>`}
          ${d.reading > 0 && html`<div class="notice info">正在讀取、壓縮檔案…</div>`}
          <${SelectedFiles} d=${d} />
        </section>
        <section class="d-card">
          <div class="field">
            <div class="field-label">要傳到哪一類<span class="req">必填</span></div>
            <div class="chips">
              ${d.cats.map(c => html`<button class=${'tag' + (d.catId === c.id ? ' on' : '')} aria-pressed=${d.catId === c.id}
                onClick=${() => d.setCatId(c.id)}>${c.name}</button>`)}
            </div>
          </div>
          <${Fields} form=${d.form} setForm=${d.setForm} catId=${d.catId} user=${user} data=${data} />
          ${d.err && html`<div class="notice error">${d.err}</div>`}
          <button class="btn btn-primary btn-block btn-lg" disabled=${!d.items.length || d.reading > 0} onClick=${d.submit}>
            開始上傳${d.summary ? `（${d.summary}）` : ''}
          </button>
        </section>
      </div>
      ${askLeave && html`<${Sheet} title="要放棄這次上傳嗎？" onClose=${() => setAskLeave(false)}>
        <p>這次選的檔案（${d.summary}）不會保留。</p>
        <button class="btn btn-danger btn-block" onClick=${() => { setAskLeave(false); actions.back(); }}>放棄上傳</button>
        <button class="btn btn-outline btn-block" onClick=${() => setAskLeave(false)}>繼續上傳</button>
      <//>`}
    </div>`;
  }

  function DesktopBlocked({ message }) {
    return html`<div class="d-page"><div class="empty"><p>${message}</p></div></div>`;
  }

  Object.assign(PR, { DesktopShell, RecordsPage, RecordDetail, SubcatsPage, DesktopUpload, DesktopBlocked });
})();
