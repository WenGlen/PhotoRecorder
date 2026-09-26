/* 阿美中會工地記錄平台 Demo：手機版（現場用，主要負責上傳；保留簡單的查看） */
(function () {
  'use strict';

  const PR = window.PR;
  if (!PR || PR.bootFailed) return;

  const { useState, useEffect } = window.preactHooks;
  const {
    html, D, APP_NAME, DEFAULT_FILTERS, STATUS, ymd, dt, userById, catById, subLabel, roleName,
    isAdmin, canUpload, canUploadPdf, canEdit, canDelete, canEditFiles, editLeftHours, leftText, editNote,
    countText, byLine, filtersActive, filterRecords, groupFor, groupCount, useGroupOpen,
    Icon, Photo, TopBar, Sheet, StatusBlock, DocList, DateRange, SiteNote,
    Fields, EditFiles, editFormOf, buildEditPatch, useUploadDraft, SelectedFiles, UploadProgress
  } = PR;

  // ---------- 首頁 ----------
  /** showCat：選「全部」時才顯示大分類；showDate：工地記錄已經依日期分段，卡片不再印日期 */
  function RecordCard({ rec, onOpen, showCat, showDate }) {
    const cat = catById(rec.cat);
    const shown = rec.photos.slice(0, 4);
    const more = rec.photos.length - shown.length;
    return html`<a class="card" href=${'#/record/' + rec.id} onClick=${onOpen}>
      ${(showCat || showDate || cat.status) && html`<div class="card-top">
        ${showCat && html`<span class="chip">${cat.short}</span>`}
        ${showDate && html`<span class="date">${ymd(rec.date)}</span>`}
        ${cat.status && html`<span class=${'st ' + STATUS[rec.status].cls}>${STATUS[rec.status].label}</span>`}
      </div>`}
      <div class="card-title">${rec.title}</div>
      <div class="meta">${byLine(rec)}</div>
      ${shown.length > 0 && html`<div class="thumbs">
        ${shown.map((p, i) => html`<div class="thumb">
          <${Photo} p=${p} bare />
          ${i === shown.length - 1 && more > 0 && html`<div class="thumb-more">+${more}</div>`}
        </div>`)}
      </div>`}
      ${rec.pdfs.length > 0 && html`<ul class="card-files">
        ${rec.pdfs.map(f => html`<li><${Icon} name="file" size=${20} /><span>${f.name}</span>${f.diary && html`<span class="badge-diary">施工日誌</span>`}</li>`)}
      </ul>`}
      ${rec.note && html`<div class="card-note">${rec.note}</div>`}
      <div class="meta">${countText(rec)}${rec.tags.length ? `｜關鍵字：${rec.tags.join('、')}` : ''}</div>
    </a>`;
  }

  // 可收合的分段標題：月份深色底、子分類淺灰底；工地記錄的日期子分類，備註排同一行，按鉛筆直接在這裡改
  function GroupHead({ g, level, open, onToggle, user, note }) {
    return html`<div class=${`group-head lv${level} kind-${g.kind}`}>
      <div class="grp-line">
        <button class="grp-toggle" aria-expanded=${open} onClick=${onToggle}>
          <${Icon} name=${open ? 'down' : 'right'} size=${20} />
          <span class="grp-label">${g.label}</span>
          <span class="grp-n">${groupCount(g)} 筆</span>
        </button>
        <${SiteNote} g=${g} user=${user} note=${note} />
      </div>
    </div>`;
  }

  function MobileHome({ user, data, filters, setFilters, actions }) {
    const { records } = data;
    const [limit, setLimit] = useState(12);
    const [noteDate, setNoteDate] = useState(null);
    const note = { date: noteDate, edit: setNoteDate, save: (date, text) => { actions.setSiteNote(date, text); setNoteDate(null); } };
    const setF = patch => { setFilters({ ...filters, ...patch }); setLimit(12); };
    const open = hash => e => { e.preventDefault(); actions.go(hash); };
    const mine = canUpload(user)
      ? records.filter(r => r.uploaderId === user.id && editLeftHours(r) > 0)
        .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
      : [];
    // 手機版只用「分類、日期區間、搜尋」三個條件，關鍵字篩選在電腦版
    const f = { ...DEFAULT_FILTERS, cat: filters.cat, from: filters.from, to: filters.to, q: filters.q };
    const recs = filterRecords(records, f, data);
    const groups = groupFor(filters.cat, recs, data);
    const { isOpen, flip } = useGroupOpen(groups, filtersActive(f));
    const card = r => html`<${RecordCard} key=${r.id} rec=${r} onOpen=${open('#/record/' + r.id)}
      showCat=${filters.cat === 'all'} showDate=${filters.cat !== 'site'} />`;
    const head = (g, level) => html`<${GroupHead} g=${g} level=${level} open=${isOpen(g.key)} onToggle=${() => flip(g.key)}
      user=${user} note=${note} />`;

    return html`
      <header class="home-head">
        <h1 class="app-name">${APP_NAME}</h1>
        <div class="who">${user.name}｜${roleName(user.role)}</div>
      </header>

      ${mine.length > 0 && html`<section class="m-sec">
        <div>
          <h2 class="m-sec-title">我最近上傳的</h2>
          <p class="muted">${isAdmin(user) ? '最近一週內你上傳的資料' : '上傳後一週內可以自己修改或刪除'}</p>
        </div>
        <div class="mine-list">
          ${mine.map(r => html`<a class="mine-row" key=${r.id} href=${'#/record/' + r.id} onClick=${open('#/record/' + r.id)}>
            <div class="mine-thumb">
              ${r.photos[0] ? html`<${Photo} p=${r.photos[0]} bare />` : html`<div class="pdf-tile"><${Icon} name="file" /></div>`}
            </div>
            <div>
              <div class="mine-title">${r.title}</div>
              <div class="meta">${ymd(r.date)}｜${catById(r.cat).short}｜${countText(r)}</div>
            </div>
            ${!isAdmin(user) && html`<span class="mine-left">可改 ${leftText(editLeftHours(r))}</span>`}
          </a>`)}
        </div>
      </section>`}

      <section class="m-sec">
        <div class="m-tabs" role="group" aria-label="分類">
          ${[{ id: 'all', short: '全部' }, ...D.categories].map(c => html`<button class=${'m-tab' + (filters.cat === c.id ? ' on' : '')}
            aria-pressed=${filters.cat === c.id}
            onClick=${e => { setF({ cat: c.id }); e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' }); }}>${c.short}</button>`)}
        </div>
        <${DateRange} from=${filters.from} to=${filters.to} onChange=${setF} />
        <div class="search">
          <${Icon} name="search" />
          <input type="search" aria-label="搜尋" placeholder="搜尋名稱、關鍵字、備註、上傳者"
            value=${filters.q} onInput=${e => setF({ q: e.target.value })} />
        </div>
      </section>

      ${recs.length === 0
        ? html`<div class="empty"><p>沒有符合的記錄</p></div>`
        : groups
          ? groups.map(g => html`<section key=${g.key} class="m-group">
              ${head(g, 0)}
              ${isOpen(g.key) && (g.children
                ? g.children.map(c => html`<div key=${c.key} class="m-subgroup">
                    ${head(c, 1)}
                    ${isOpen(c.key) && html`<div class="list">${c.recs.map(card)}</div>`}
                  </div>`)
                : html`<div class="list">${g.recs.map(card)}</div>`)}
            </section>`)
          : html`<div class="list">${recs.slice(0, limit).map(card)}</div>`}
      ${!groups && recs.length > limit && html`<div class="pad-x">
        <button class="btn btn-outline btn-block" onClick=${() => setLimit(limit + 12)}>顯示更多（還有 ${recs.length - limit} 筆）</button>
      </div>`}
      <p class="m-foot muted">要用關鍵字篩選、看請款或管理資料，請用電腦開啟。</p>`;
  }

  // 底部固定：一顆明確的「上傳」大按鈕，按下去進上傳流程
  function MobileUploadBar({ user, actions }) {
    return html`<div class="upload-bar">
      <button class="btn btn-primary btn-block upload-main" onClick=${() => actions.go('#/upload')}>
        <${Icon} name="upload" size=${28} />${canUploadPdf(user) ? '上傳照片或文件' : '上傳工地照片'}
      </button>
    </div>`;
  }

  // 上傳流程的步驟進度：讓人知道現在在第幾步、後面還有什麼
  function Stepper({ steps, current }) {
    return html`<ol class="stepper" aria-label="上傳步驟">
      ${steps.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'now' : 'todo';
        return html`<li class=${'stepper-item ' + state} aria-current=${state === 'now' ? 'step' : undefined}>
          <span class="stepper-dot">${state === 'done' ? html`<${Icon} name="check" size=${16} stroke=${3} />` : i + 1}</span>
          <span class="stepper-label">${label}</span>
        </li>`;
      })}
    </ol>`;
  }

  // ---------- 記錄內容 ----------
  function MobileRecord({ rec, user, data, actions }) {
    const cat = catById(rec.cat);
    const sub = subLabel(data, rec);
    const up = userById(rec.uploaderId);
    const editable = canEdit(user, rec);
    const deletable = canDelete(user, rec);
    const note = editNote(user, rec);
    const zipAll = () => actions.zipRecord(rec);

    return html`
      <${TopBar} title="記錄內容" onBack=${actions.back} />
      <main class="page">
        <div class="card-top">
          <span class="chip">${cat.name}</span>
          ${sub && html`<span class="chip">${sub}</span>`}
          <span class="date">${ymd(rec.date)}</span>
        </div>
        <h1 class="page-title">${rec.title}</h1>
        <div>
          <div class="meta">${byLine(rec)}${up.disabled ? '（帳號已停用）' : ''}</div>
          <div class="meta">上傳於 ${dt(rec.uploadedAt)}</div>
          ${rec.editedAt && html`<div class="meta">最後修改：${userById(rec.editedBy).name} ${dt(rec.editedAt)}</div>`}
        </div>

        ${cat.status && html`<${StatusBlock} rec=${rec} user=${user} actions=${actions} />`}

        ${note && html`<div class="edit-box">
          <div>${note}</div>
          ${(editable || deletable) && html`<div class="btn-row">
            ${editable && html`<button class="btn btn-outline" onClick=${() => actions.go('#/edit/' + rec.id)}>修改</button>`}
            ${deletable && html`<button class="btn btn-outline danger" onClick=${() => actions.askDelete(rec.id)}>刪除</button>`}
          </div>`}
        </div>`}

        ${rec.tags.length > 0 && html`<div class="kv"><span>關鍵字</span><span>${rec.tags.join('、')}</span></div>`}
        ${rec.note && html`<div class="kv"><span>備註</span><span>${rec.note}</span></div>`}

        ${rec.photos.length > 0 && html`<section class="sec">
          <div class="sec-head">
            <h2>照片 ${rec.photos.length} 張</h2>
            <button class="btn btn-outline" onClick=${zipAll}><${Icon} name="download" />整本下載</button>
          </div>
          <div class="grid3">
            ${rec.photos.map((p, i) => html`<button class="thumb" aria-label=${`看第 ${i + 1} 張`} onClick=${() => actions.openLightbox(rec.id, i)}>
              <${Photo} p=${p} bare />
            </button>`)}
          </div>
        </section>`}

        ${rec.pdfs.length > 0 && html`<section class="sec">
          <h2>文件 ${rec.pdfs.length} 份</h2>
          <${DocList} rec=${rec} user=${user} actions=${actions} />
        </section>`}

        <button class="btn btn-line btn-block btn-lg" onClick=${() => actions.openShare(rec.id)}>分享到 LINE 群組</button>
      </main>`;
  }

  // ---------- 上傳：選檔 → 選分類 → 確認資料 → 上傳 ----------
  function MobileUpload({ user, data, preset, simDrop, actions }) {
    const d = useUploadDraft({ user, data, preset, simDrop, actions });
    const allowPdf = canUploadPdf(user);
    const [step, setStep] = useState('files');
    const [askLeave, setAskLeave] = useState(false);
    const cat = d.catId ? catById(d.catId) : null;
    // 網址帶了分類進來、或這個身分只能傳一類時，分類已經定好，只剩兩步
    const fixedCat = d.presetCat;
    const stepLabels = fixedCat ? ['選照片', '確認資料'] : ['選照片', '選分類', '確認資料'];
    const stepIndex = step === 'files' ? 0 : step === 'cat' ? 1 : stepLabels.length - 1;
    const stepper = html`<${Stepper} steps=${stepLabels} current=${stepIndex} />`;

    useEffect(() => { window.scrollTo(0, 0); }, [step, d.phase]);

    const leave = () => { if (d.items.length && d.phase !== 'done') setAskLeave(true); else actions.back(); };
    const prev = () => {
      if (step === 'form') setStep(fixedCat ? 'files' : 'cat');
      else if (step === 'cat') setStep('files');
      else leave();
    };
    const closeBtn = html`<button class="icon-btn" aria-label="取消上傳" onClick=${leave}><${Icon} name="close" size=${28} /></button>`;

    let top;
    let content;

    if (d.phase === 'progress') {
      top = html`<${TopBar} title="上傳中" />`;
      content = html`<div class="step"><${UploadProgress} d=${d} /></div>`;
    } else if (d.phase === 'done') {
      top = html`<${TopBar} title="上傳完成" />`;
      content = html`
        <div class="step">
          <div class="done-mark"><${Icon} name="check" size=${60} stroke=${3} /></div>
          <div class="done-title">上傳完成</div>
          <p class="done-sub">已存到「${cat.name}」，共 ${d.summary}</p>
        </div>
        <div class="step" style=${{ paddingTop: 0 }}>
          <button class="btn btn-line btn-block btn-lg" onClick=${() => actions.openShare(d.createdId)}>分享到 LINE 群組</button>
          <button class="btn btn-outline btn-block" onClick=${() => actions.replace('#/record/' + d.createdId)}>查看這筆記錄</button>
          <button class="btn btn-outline btn-block" onClick=${actions.again}>再傳一批</button>
          <button class="link-btn" onClick=${actions.back}>回首頁</button>
        </div>`;
    } else if (step === 'files') {
      top = html`<${TopBar} title="上傳" onBack=${prev} right=${closeBtn} />`;
      content = html`
        <div class="step">
          ${stepper}
          <div>
            <h1 class="step-title">${allowPdf ? '選照片或文件' : '選照片'}</h1>
            <p class="step-sub">${allowPdf ? '可以直接拍照、從手機相簿選，或選 PDF；可以選好幾張' : '可以直接拍照或從手機相簿選，可以選好幾張'}</p>
          </div>
          <div class=${'pick-grid' + (allowPdf ? '' : ' two')}>
            <label class="pick-btn">
              <input type="file" accept="image/*" capture="environment" onChange=${e => { d.addFiles(e.target.files, 'photo'); e.target.value = ''; }} />
              <${Icon} name="camera" size=${32} />${d.items.length ? '再拍一張' : '拍照'}
            </label>
            <label class="pick-btn">
              <input type="file" accept="image/*" multiple onChange=${e => { d.addFiles(e.target.files, 'photo'); e.target.value = ''; }} />
              <${Icon} name="image" size=${32} />${d.items.length ? '再選照片' : '從相簿選'}
            </label>
            ${allowPdf && html`<label class="pick-btn">
              <input type="file" accept="application/pdf,.pdf" multiple onChange=${e => { d.addFiles(e.target.files, 'pdf'); e.target.value = ''; }} />
              <${Icon} name="file" size=${32} />選 PDF
            </label>`}
          </div>
          ${!d.items.length && html`<button class="btn btn-outline btn-block" onClick=${d.addSamples}>（Demo）加入 15 張範例照片</button>`}
          ${d.reading > 0 && html`<div class="notice info">正在處理照片…</div>`}
          <${SelectedFiles} d=${d} />
        </div>
        <div class="step-actions">
          <button class="btn btn-primary btn-block btn-lg" disabled=${!d.items.length || d.reading > 0}
            onClick=${() => setStep(fixedCat ? 'form' : 'cat')}>下一步</button>
        </div>`;
    } else if (step === 'cat') {
      top = html`<${TopBar} title="上傳" onBack=${prev} backLabel="上一步" right=${closeBtn} />`;
      content = html`<div class="step">
        ${stepper}
        <div>
          <h1 class="step-title">要傳到哪一類？</h1>
          <p class="step-sub">已選 ${d.summary}</p>
        </div>
        <div class="opt-list">
          ${d.cats.map(c => html`<button class=${'cat-choice' + (d.catId === c.id ? ' on' : '')} onClick=${() => { d.setCatId(c.id); setStep('form'); }}>
            <strong>${c.name}</strong><span class="muted">${c.desc}</span>
          </button>`)}
        </div>
      </div>`;
    } else {
      top = html`<${TopBar} title="上傳" onBack=${prev} backLabel="上一步" right=${closeBtn} />`;
      content = html`
        <div class="step">
          ${stepper}
          <div>
            <h1 class="step-title">確認資料</h1>
            <p class="step-sub">${d.summary}，傳到「${cat.name}」</p>
          </div>
          <${Fields} form=${d.form} setForm=${d.setForm} catId=${d.catId} user=${user} data=${data} />
          ${d.err && html`<div class="notice error">${d.err}</div>`}
        </div>
        <div class="step-actions">
          <button class="btn btn-primary btn-block btn-lg" onClick=${d.submit}>開始上傳（${d.summary}）</button>
        </div>`;
    }

    return html`
      ${top}
      ${content}
      ${askLeave && html`<${Sheet} title="要放棄這次上傳嗎？" onClose=${() => setAskLeave(false)}>
        <p>這次選的檔案（${d.summary}）不會保留。</p>
        <button class="btn btn-danger btn-block" onClick=${() => { setAskLeave(false); actions.back(); }}>放棄上傳</button>
        <button class="btn btn-outline btn-block" onClick=${() => setAskLeave(false)}>繼續上傳</button>
      <//>`}`;
  }

  // ---------- 修改 ----------
  function MobileEdit({ rec, user, data, actions }) {
    const [form, setForm] = useState(() => editFormOf(rec));
    const [err, setErr] = useState('');
    function save() {
      const result = buildEditPatch(rec, form, user, data);
      if (result.error) { setErr(result.error); actions.toast(result.error); return; }
      actions.updateRecord(rec.id, result.patch, result);
      actions.toast('已儲存');
      actions.back();
    }
    return html`
      <${TopBar} title="修改資料" onBack=${actions.back} />
      <main class="step">
        <${Fields} form=${form} setForm=${setForm} catId=${rec.cat} user=${user} data=${data} extraDay=${rec.cat === 'site' ? rec.date : ''} />
        ${canEditFiles(user, rec) && html`<${EditFiles} form=${form} setForm=${setForm} rec=${rec} user=${user} toast=${actions.toast} />`}
        ${err && html`<div class="notice error">${err}</div>`}
      </main>
      <div class="step-actions">
        <button class="btn btn-primary btn-block btn-lg" onClick=${save}>儲存</button>
      </div>`;
  }

  function MobileBlocked({ title, message, onBack }) {
    return html`
      <${TopBar} title=${title} onBack=${onBack} />
      <main class="empty"><p>${message}</p><button class="btn btn-outline" onClick=${onBack}>回上一頁</button></main>`;
  }

  Object.assign(PR, { MobileHome, MobileUploadBar, MobileRecord, MobileUpload, MobileEdit, MobileBlocked });
})();
