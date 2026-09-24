/* 阿美中會工地紀錄平台 Demo：桌機版（辦公室用，負責檢視與細節管理；也能拖拉上傳 PDF） */
(function () {
  'use strict';

  const PR = window.PR;
  if (!PR || PR.bootFailed) return;

  const { useState } = window.preactHooks;
  const {
    html, D, APP_NAME, DEFAULT_FILTERS, STATUS, uid, toggle, roc, rocDT, userById, catById, subName, roleName,
    isAdmin, canUpload, canManageLists, canEdit, canDelete, canEditFiles, editNote, countText, byLine, zipText,
    byDateDesc, filterRecords, keywordOptions, groupFor, groupByPeriod, Icon, Photo, StatusBlock, DocList, DateRange,
    Fields, EditFiles, editFormOf, buildEditPatch, useUploadDraft, blockedCatHints, SelectedFiles, UploadProgress
  } = PR;

  const rowKeys = onSelect => e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } };

  // ---------- 外框：頂端列＋左側選單（上傳鈕在最上面，管理功能放底部） ----------
  function DesktopShell({ user, route, actions, children }) {
    const onRecords = ['home', 'record', 'edit'].includes(route.name);
    const nav = [
      { label: '全部紀錄', hash: '#/', on: onRecords },
      { label: '請款紀錄', hash: '#/billing', on: route.name === 'billing' }
    ];
    const manage = [
      { id: 'keywords', label: '常用關鍵字' },
      { id: 'subcats', label: '子分類' }
    ];
    const link = (hash, label, on) => html`<a class=${'d-nav-item' + (on ? ' on' : '')} href=${hash}
      onClick=${e => { e.preventDefault(); actions.nav(hash); }}>${label}</a>`;
    return html`<div class="d-shell">
      <header class="d-head">
        <div class="d-brand">${APP_NAME}</div>
        <div class="d-user">${user.name}｜${roleName(user.role)}</div>
      </header>
      <div class="d-body">
        <nav class="d-nav" aria-label="主選單">
          ${canUpload(user) && html`<button class=${'btn btn-primary btn-block d-upload' + (route.name === 'upload' ? ' on' : '')}
            aria-current=${route.name === 'upload' ? 'page' : undefined} onClick=${actions.startUpload}><${Icon} name="upload" />上傳</button>`}
          ${nav.map(n => link(n.hash, n.label, n.on))}
          ${canManageLists(user) && html`<div class="d-nav-manage">
            <div class="d-nav-group">管理</div>
            ${manage.map(n => link('#/settings/' + n.id, n.label, route.name === 'settings' && route.id === n.id))}
          </div>`}
        </nav>
        <main class="d-main">${children}</main>
      </div>
    </div>`;
  }

  // ---------- 全部紀錄 ----------
  function RecordTable({ recs, groups, data, selId, onSelect, checked, setChecked }) {
    const allIds = recs.map(r => r.id);
    const allOn = allIds.length > 0 && allIds.every(id => checked.includes(id));
    const row = r => {
      const cat = catById(r.cat);
      const sub = r.sub && subName(data.subcats, r.sub);
      const subLine = [sub ? `子分類：${sub}` : '', r.tags.length ? `關鍵字：${r.tags.join('、')}` : ''].filter(Boolean).join('｜');
      return html`<tr key=${r.id} class=${'d-row' + (selId === r.id ? ' on' : '')} tabIndex="0" aria-selected=${selId === r.id}
        onClick=${() => onSelect(r.id)} onKeyDown=${rowKeys(() => onSelect(r.id))}>
        <td class="c-check" onClick=${e => e.stopPropagation()}>
          <input type="checkbox" aria-label=${'選取 ' + r.title} checked=${checked.includes(r.id)} onChange=${() => setChecked(toggle(checked, r.id))} />
        </td>
        <td class="c-nowrap">${roc(r.date)}</td>
        <td class="c-name">
          <div class="c-name-line">
            <span class="chip">${cat.short}</span>
            <span class="c-title">${r.title}</span>
            ${cat.status && html`<span class=${'st ' + STATUS[r.status].cls}>${STATUS[r.status].label}</span>`}
          </div>
          ${subLine && html`<div class="c-sub">${subLine}</div>`}
        </td>
        <td>${byLine(r)}</td>
        <td>${countText(r)}</td>
      </tr>`;
    };
    return html`<table class="d-table fixed">
      <thead><tr>
        <th class="c-check"><input type="checkbox" aria-label="全選" checked=${allOn} onChange=${() => setChecked(allOn ? [] : allIds)} /></th>
        <th class="w-date">資料日期</th><th>名稱</th><th class="w-by">上傳者</th><th class="w-count">內容</th>
      </tr></thead>
      <tbody>
        ${groups
          ? groups.map(g => [
            html`<tr class="d-group-row" key=${'g' + g.key}><td colspan="5">${g.label}<span class="d-group-n">${g.recs.length} 筆</span></td></tr>`,
            ...g.recs.map(row)
          ])
          : recs.map(row)}
      </tbody>
    </table>`;
  }

  function PhotoWall({ recs, groups, selId, onSelect, onOpen }) {
    const sections = (groups || [{ key: 'all', label: '', recs }])
      .map(g => ({ ...g, recs: g.recs.filter(r => r.photos.length) }))
      .filter(g => g.recs.length);
    if (!sections.length) return html`<div class="empty"><p>這些條件下沒有照片</p></div>`;
    return html`<div class="d-wall">
      ${sections.map(g => html`<section key=${g.key} class="d-wall-group">
        ${g.label && html`<h2 class="d-wall-title">${g.label}</h2>`}
        ${g.recs.map(r => html`<div class=${'d-wall-rec' + (selId === r.id ? ' on' : '')} key=${r.id}>
          <button class="d-wall-head" onClick=${() => onSelect(r.id)}>
            <span class="date">${roc(r.date)}</span><span>${r.title}</span><span class="meta">${r.photos.length} 張</span>
          </button>
          <div class="d-wall-grid">
            ${r.photos.map((p, i) => html`<button class="thumb" aria-label=${`${r.title} 第 ${i + 1} 張`} onClick=${() => { onSelect(r.id); onOpen(r.id, i); }}>
              <${Photo} p=${p} bare />
            </button>`)}
          </div>
        </div>`)}
      </section>`)}
    </div>`;
  }

  function RecordsPage({ user, data, filters, setFilters, route, actions }) {
    const [view, setView] = useState('table');
    const [checked, setChecked] = useState([]);
    const setF = patch => { setFilters({ ...filters, ...patch }); setChecked([]); };
    const recs = filterRecords(data.records, filters, data.subcats);
    const groups = groupFor(filters.cat, recs, data.subcats);
    const selId = route.name === 'record' || route.name === 'edit' ? route.id : null;
    const sel = selId && data.records.find(r => r.id === selId);
    const active = filters.cat !== 'all' || filters.q.trim() !== '' || filters.from !== '' || filters.to !== '' || filters.tags.length > 0;
    const select = id => actions.replace('#/record/' + id);
    const checkedRecs = data.records.filter(r => checked.includes(r.id));
    const checkedFiles = checkedRecs.reduce((n, r) => n + r.photos.length + r.pdfs.length, 0);

    return html`<div class="d-page d-split">
      <section class="d-list-col">
        <div class="d-toolbar">
          <div class="d-tabs" role="group" aria-label="分類">
            ${[{ id: 'all', short: '全部' }, ...D.categories].map(c => html`<button class=${'d-tab' + (filters.cat === c.id ? ' on' : '')}
              aria-pressed=${filters.cat === c.id} onClick=${() => setF({ cat: c.id })}>${c.short}</button>`)}
          </div>
          <div class="d-filter-row">
            <div class="search d-search">
              <${Icon} name="search" />
              <input type="search" aria-label="關鍵字搜尋" placeholder="搜尋名稱、關鍵字、備註、上傳者" value=${filters.q}
                onInput=${e => setF({ q: e.target.value })} />
            </div>
            <${DateRange} compact from=${filters.from} to=${filters.to} onChange=${setF} />
            <select class="select sm" aria-label="加入關鍵字條件" value="" onChange=${e => { if (e.target.value) setF({ tags: [...filters.tags, e.target.value] }); }}>
              <option value="">加入關鍵字條件</option>
              ${keywordOptions(data).filter(t => !filters.tags.includes(t)).map(t => html`<option value=${t}>${t}</option>`)}
            </select>
          </div>
          ${filters.tags.length > 0 && html`<div class="d-filter-tags" role="group" aria-label="已加入的關鍵字條件">
            <span class="d-filter-label">關鍵字條件</span>
            ${filters.tags.map(t => html`<button class="tag on sm" aria-label=${'移除關鍵字條件 ' + t}
              onClick=${() => setF({ tags: filters.tags.filter(x => x !== t) })}>${t}<${Icon} name="close" size=${16} /></button>`)}
          </div>`}
          <div class="d-result-row">
            <span>找到 ${recs.length} 筆</span>
            ${active && html`<button class="link-btn" onClick=${() => { setFilters(DEFAULT_FILTERS); setChecked([]); }}>清除條件</button>`}
            ${checked.length > 0 && html`<span class="d-batch">
              已選 ${checked.length} 筆
              <button class="btn btn-outline sm" onClick=${() => actions.toast(`（Demo）會把 ${checked.length} 筆紀錄的 ${checkedFiles} 個檔案打包下載，照片每包最多 100 張`)}>
                <${Icon} name="download" size=${20} />打包下載
              </button>
              <button class="link-btn" onClick=${() => setChecked([])}>取消選取</button>
            </span>`}
            <div class="seg d-seg" role="group" aria-label="顯示方式">
              <button class=${view === 'table' ? 'on' : ''} aria-pressed=${view === 'table'} onClick=${() => setView('table')}>列表</button>
              <button class=${view === 'photos' ? 'on' : ''} aria-pressed=${view === 'photos'} onClick=${() => setView('photos')}>照片</button>
            </div>
          </div>
        </div>
        <div class="d-scroll">
          ${recs.length === 0
            ? html`<div class="empty"><p>沒有符合的紀錄</p>${active && html`<button class="btn btn-outline" onClick=${() => setFilters(DEFAULT_FILTERS)}>清除條件</button>`}</div>`
            : view === 'table'
              ? html`<${RecordTable} recs=${recs} groups=${groups} data=${data} selId=${selId} onSelect=${select} checked=${checked} setChecked=${setChecked} />`
              : html`<${PhotoWall} recs=${recs} groups=${groups} selId=${selId} onSelect=${select} onOpen=${actions.openLightbox} />`}
        </div>
      </section>
      ${sel && html`<aside class="d-detail-col" aria-label="詳細資料">
        <${RecordDetail} key=${sel.id} rec=${sel} user=${user} data=${data} actions=${actions}
          startEditing=${route.name === 'edit'} onClose=${() => actions.replace('#/')} />
      </aside>`}
    </div>`;
  }

  function DetailClose({ onClose }) {
    return onClose ? html`<button class="icon-btn d-close" aria-label="關閉詳細資料" onClick=${onClose}><${Icon} name="close" size=${28} /></button>` : null;
  }

  function RecordDetail({ rec, user, data, actions, startEditing, onClose }) {
    const editable = canEdit(user, rec);
    const deletable = canDelete(user, rec);
    const [editing, setEditing] = useState(!!startEditing && editable);
    const [form, setForm] = useState(() => editFormOf(rec));
    const [err, setErr] = useState('');
    const cat = catById(rec.cat);
    const sub = rec.sub && subName(data.subcats, rec.sub);
    const up = userById(rec.uploaderId);
    const note = editNote(user, rec);

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
      const files = canEditFiles(user, rec);
      return html`<div class="d-detail">
        <h2 class="d-detail-title">修改資料</h2>
        <div class="notice info">${files
          ? '可以改下面的資料，也可以移除或補傳照片、文件。每次修改都會留下紀錄。'
          : '書審文件不能在這裡增刪，要換新檔請按文件旁的「更新」。每次修改都會留下紀錄。'}</div>
        <${Fields} form=${form} setForm=${setForm} catId=${rec.cat} user=${user} data=${data} />
        ${files && html`<${EditFiles} form=${form} setForm=${setForm} toast=${actions.toast} />`}
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
          <span class="date">${roc(rec.date)}</span>
        </div>
        <${DetailClose} onClose=${onClose} />
      </div>
      <h2 class="d-detail-title">${rec.title}</h2>
      <div>
        <div class="meta">${byLine(rec)}${up.disabled ? '（帳號已停用）' : ''}</div>
        <div class="meta">上傳於 ${rocDT(rec.uploadedAt)}</div>
        ${rec.editedAt && html`<div class="meta">最後修改：${userById(rec.editedBy).name} ${rocDT(rec.editedAt)}</div>`}
      </div>

      ${cat.status && html`<${StatusBlock} rec=${rec} user=${user} actions=${actions} />`}

      <div class="d-actions">
        ${editable && html`<button class="btn btn-outline sm" onClick=${() => { setForm(editFormOf(rec)); setEditing(true); }}>修改</button>`}
        ${deletable && html`<button class="btn btn-outline sm danger" onClick=${() => actions.askDelete(rec.id)}>刪除</button>`}
        <button class="btn btn-outline sm" onClick=${() => actions.copyLink(rec.id)}>複製連結</button>
        ${rec.photos.length > 0 && html`<button class="btn btn-outline sm" onClick=${() => actions.toast(zipText(rec))}><${Icon} name="download" size=${20} />整本下載</button>`}
      </div>
      ${note && !isAdmin(user) && html`<div class="hint">${note}</div>`}

      ${rec.period && html`<div class="kv"><span>請款期別</span><span>第 ${rec.period} 期</span></div>`}
      ${rec.tags.length > 0 && html`<div class="kv"><span>關鍵字</span><span>${rec.tags.join('、')}</span></div>`}
      ${rec.note && html`<div class="kv"><span>備註</span><span>${rec.note}</span></div>`}

      ${rec.photos.length > 0 && html`<section class="sec">
        <h3 class="d-sec-title">照片 ${rec.photos.length} 張</h3>
        <div class="grid4">
          ${rec.photos.map((p, i) => html`<button class="thumb" aria-label=${`看第 ${i + 1} 張`} onClick=${() => actions.openLightbox(rec.id, i)}>
            <${Photo} p=${p} bare />
          </button>`)}
        </div>
      </section>`}

      ${rec.pdfs.length > 0 && html`<section class="sec">
        <h3 class="d-sec-title">文件 ${rec.pdfs.length} 份</h3>
        <${DocList} rec=${rec} user=${user} actions=${actions} />
      </section>`}
    </div>`;
  }

  // ---------- 請款紀錄 ----------
  function BillingPage({ user, data, actions }) {
    const [selId, setSelId] = useState(null);
    const recs = data.records.filter(r => r.cat === 'billing').sort(byDateDesc);
    const groups = groupByPeriod(recs);
    const sel = selId && data.records.find(r => r.id === selId);
    return html`<div class="d-page d-split">
      <section class="d-list-col">
        <div class="d-toolbar">
          <h1 class="d-h1">請款紀錄</h1>
          <p class="muted">依請款期別整理，點一筆看內容。</p>
        </div>
        <div class="d-scroll">
          ${groups.map(g => {
            const photoN = g.recs.reduce((n, r) => n + r.photos.length, 0);
            const pdfN = g.recs.reduce((n, r) => n + r.pdfs.length, 0);
            const period = data.periods.find(p => p.no === g.no);
            return html`<section class="d-period" key=${g.key}>
              <div class="d-period-head">
                <h2>${g.label}</h2>
                <span class="meta">${period ? `${roc(period.date)}｜` : ''}文件 ${pdfN} 份、照片 ${photoN} 張</span>
              </div>
              <table class="d-table">
                <thead><tr><th>資料日期</th><th>名稱</th><th>上傳者</th><th>內容</th></tr></thead>
                <tbody>
                  ${g.recs.map(r => html`<tr key=${r.id} class=${'d-row' + (selId === r.id ? ' on' : '')} tabIndex="0" aria-selected=${selId === r.id}
                    onClick=${() => setSelId(r.id)} onKeyDown=${rowKeys(() => setSelId(r.id))}>
                    <td class="c-nowrap">${roc(r.date)}</td>
                    <td class="c-title">${r.title}</td>
                    <td>${byLine(r)}</td>
                    <td class="c-nowrap">${countText(r)}</td>
                  </tr>`)}
                </tbody>
              </table>
            </section>`;
          })}
        </div>
      </section>
      ${sel && html`<aside class="d-detail-col" aria-label="詳細資料">
        <${RecordDetail} key=${sel.id} rec=${sel} user=${user} data=${data} actions=${actions} onClose=${() => setSelId(null)} />
      </aside>`}
    </div>`;
  }

  // ---------- 管理：常用關鍵字、子分類（管理者、建築師事務所） ----------
  function KeywordsPage({ data, actions }) {
    const [name, setName] = useState('');
    const tags = data.tags;
    const add = () => {
      const t = name.trim();
      if (!t) return;
      if (tags.includes(t)) { actions.toast('這個關鍵字已經有了'); return; }
      actions.setTags([...tags, t], `新增「${t}」`);
      setName('');
    };
    const move = (i, dir) => {
      const j = i + dir;
      if (j < 0 || j >= tags.length) return;
      const next = [...tags];
      [next[i], next[j]] = [next[j], next[i]];
      actions.setTags(next);
    };
    return html`<div class="d-page">
      <div class="d-page-head">
        <div>
          <h1 class="d-h1">常用關鍵字</h1>
          <p class="muted">這裡的關鍵字會出現在上傳和篩選的按鈕裡，順序也照這裡排。只有管理者和建築師事務所能設定。</p>
        </div>
      </div>
      <div class="d-card d-narrow-card">
        <ul class="tag-admin">
          ${tags.map((t, i) => html`<li key=${t}>
            <span class="tag-name">${t}</span>
            <button class="icon-btn sm" aria-label=${t + ' 往上移'} disabled=${i === 0} onClick=${() => move(i, -1)}><${Icon} name="up" /></button>
            <button class="icon-btn sm" aria-label=${t + ' 往下移'} disabled=${i === tags.length - 1} onClick=${() => move(i, 1)}><${Icon} name="down" /></button>
            <button class="btn btn-outline sm danger" onClick=${() => actions.setTags(tags.filter(x => x !== t), `移除「${t}」`)}>移除</button>
          </li>`)}
        </ul>
        <div class="inline-add">
          <input class="input" aria-label="新關鍵字" placeholder="新關鍵字" value=${name}
            onInput=${e => setName(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') add(); }} />
          <button class="btn btn-primary" onClick=${add}>新增</button>
        </div>
      </div>
    </div>`;
  }

  function SubcatsPage({ data, actions }) {
    const [name, setName] = useState('');
    const list = data.subcats;
    const usage = id => {
      const rs = data.records.filter(r => r.sub === id);
      return { review: rs.filter(r => r.cat === 'review').length, test: rs.filter(r => r.cat === 'test').length, total: rs.length };
    };
    const add = () => {
      const t = name.trim();
      if (!t) return;
      if (list.some(s => s.name === t)) { actions.toast('這個子分類已經有了'); return; }
      actions.setSubcats([...list, { id: uid('sc'), name: t }], `新增「${t}」`);
      setName('');
    };
    const move = (i, dir) => {
      const j = i + dir;
      if (j < 0 || j >= list.length) return;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      actions.setSubcats(next);
    };
    return html`<div class="d-page">
      <div class="d-page-head">
        <div>
          <h1 class="d-h1">子分類</h1>
          <p class="muted">文件書審和材料測試報告共用這份子分類，列表會依這裡的順序分段；沒有紀錄的子分類不會出現在列表。只有管理者和建築師事務所能設定。</p>
        </div>
      </div>
      <div class="d-card d-narrow-card">
        <ul class="tag-admin">
          ${list.map((s, i) => {
            const u = usage(s.id);
            return html`<li key=${s.id}>
              <span class="tag-name">${s.name}
                <span class="tag-use">${u.total ? `文件書審 ${u.review} 筆、材料測試報告 ${u.test} 筆` : '還沒有紀錄，列表不會顯示這一段'}</span>
              </span>
              <button class="icon-btn sm" aria-label=${s.name + ' 往上移'} disabled=${i === 0} onClick=${() => move(i, -1)}><${Icon} name="up" /></button>
              <button class="icon-btn sm" aria-label=${s.name + ' 往下移'} disabled=${i === list.length - 1} onClick=${() => move(i, 1)}><${Icon} name="down" /></button>
              <button class="btn btn-outline sm danger" disabled=${u.total > 0} title=${u.total ? '還有紀錄用這個子分類，不能移除' : ''}
                onClick=${() => actions.setSubcats(list.filter(x => x.id !== s.id), `移除「${s.name}」`)}>移除</button>
            </li>`;
          })}
        </ul>
        <div class="inline-add">
          <input class="input" aria-label="新子分類" placeholder="新子分類，例如：外牆磁磚" value=${name}
            onInput=${e => setName(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') add(); }} />
          <button class="btn btn-primary" onClick=${add}>新增</button>
        </div>
        <p class="hint">還有紀錄在用的子分類不能移除，要先把那些紀錄改到別的子分類。</p>
      </div>
    </div>`;
  }

  // ---------- 上傳（桌機版：拖拉檔案，一頁填完） ----------
  function DesktopUpload({ user, data, preset, simDrop, actions }) {
    const d = useUploadDraft({ user, data, preset, simDrop, actions });
    const [drag, setDrag] = useState(false);

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
          <button class="btn btn-primary" onClick=${() => actions.replace('#/record/' + d.createdId)}>查看這筆紀錄</button>
          <button class="btn btn-outline" onClick=${() => actions.copyLink(d.createdId)}>複製分享連結</button>
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
          <h1 class="d-h1">上傳照片或文件</h1>
          <p class="muted">電腦裡的 PDF（契約、施工日誌、送審文件）適合在這裡傳；現場照片建議直接用手機傳。</p>
        </div>
        <button class="btn btn-outline" onClick=${actions.back}>取消</button>
      </div>
      <div class="d-upload-grid">
        <section class="d-card">
          <label class=${'dropzone' + (drag ? ' on' : '')}
            onDragOver=${e => { e.preventDefault(); setDrag(true); }}
            onDragLeave=${() => setDrag(false)}
            onDrop=${onDrop}>
            <input type="file" multiple accept="image/*,application/pdf,.pdf" onChange=${e => { d.addFiles(e.target.files, 'auto'); e.target.value = ''; }} />
            <${Icon} name="upload" size=${40} />
            <strong>把照片或 PDF 拖到這裡</strong>
            <span class="muted">或按這裡選檔；照片一次最多 100 張，PDF 每份 50MB 以內</span>
          </label>
          ${!d.items.length && html`<button class="btn btn-outline btn-block" onClick=${d.addSamples}>（Demo）加入 15 張範例照片</button>`}
          ${d.reading > 0 && html`<div class="notice info">正在讀取照片的拍攝時間與 PDF 頁數…</div>`}
          <${SelectedFiles} d=${d} />
        </section>
        <section class="d-card">
          <div class="field">
            <div class="field-label">要傳到哪一類<span class="req">必填</span></div>
            <div class="chips">
              ${d.cats.map(c => html`<button class=${'tag' + (d.catId === c.id ? ' on' : '')} aria-pressed=${d.catId === c.id}
                onClick=${() => d.setCatId(c.id)}>${c.name}</button>`)}
            </div>
            ${blockedCatHints(user).map(t => html`<div class="hint">${t}</div>`)}
          </div>
          <${Fields} form=${d.form} setForm=${d.setForm} catId=${d.catId} user=${user} data=${data} />
          ${d.err && html`<div class="notice error">${d.err}</div>`}
          <button class="btn btn-primary btn-block btn-lg" disabled=${!d.items.length || d.reading > 0} onClick=${d.submit}>
            開始上傳${d.summary ? `（${d.summary}）` : ''}
          </button>
        </section>
      </div>
    </div>`;
  }

  function DesktopBlocked({ message }) {
    return html`<div class="d-page"><div class="empty"><p>${message}</p></div></div>`;
  }

  Object.assign(PR, {
    DesktopShell, RecordsPage, RecordDetail, BillingPage, KeywordsPage, SubcatsPage, DesktopUpload, DesktopBlocked
  });
})();
