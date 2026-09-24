/* 阿美中會工地紀錄平台 Demo：手機版（現場用，主要負責上傳；保留簡單的查看） */
(function () {
  'use strict';

  const PR = window.PR;
  if (!PR || PR.bootFailed) return;

  const { useState, useEffect } = window.preactHooks;
  const {
    html, D, APP_NAME, DEFAULT_FILTERS, STATUS, roc, rocDT, userById, catById, subName, roleName,
    isAdmin, canUpload, canEdit, canDelete, canEditFiles, editLeftHours, leftText, editNote, countText, byLine, zipText,
    filterRecords, groupFor, Icon, Photo, TopBar, Sheet, StatusBlock, DocList, DateRange,
    Fields, EditFiles, editFormOf, buildEditPatch, useUploadDraft, blockedCatHints, SelectedFiles, UploadProgress
  } = PR;

  // ---------- 首頁 ----------
  function RecordCard({ rec, data, onOpen }) {
    const cat = catById(rec.cat);
    const sub = rec.sub && subName(data.subcats, rec.sub);
    const shown = rec.photos.slice(0, 4);
    const more = rec.photos.length - shown.length;
    return html`<a class="card" href=${'#/record/' + rec.id} onClick=${onOpen}>
      <div class="card-top">
        <span class="chip">${cat.short}</span>
        ${sub && html`<span class="chip">${sub}</span>`}
        <span class="date">${roc(rec.date)}</span>
        ${cat.status && html`<span class=${'st ' + STATUS[rec.status].cls}>${STATUS[rec.status].label}</span>`}
      </div>
      <div class="card-title">${rec.title}</div>
      <div class="meta">${byLine(rec)}</div>
      ${shown.length > 0 && html`<div class="thumbs">
        ${shown.map((p, i) => html`<div class="thumb">
          <${Photo} p=${p} bare />
          ${i === shown.length - 1 && more > 0 && html`<div class="thumb-more">+${more}</div>`}
        </div>`)}
      </div>`}
      ${rec.pdfs.length > 0 && html`<ul class="card-files">
        ${rec.pdfs.map(f => html`<li><${Icon} name="file" size=${20} /><span>${f.name}</span></li>`)}
      </ul>`}
      <div class="meta">${countText(rec)}${rec.tags.length ? `｜關鍵字：${rec.tags.join('、')}` : ''}</div>
    </a>`;
  }

  function MobileHome({ user, data, filters, setFilters, actions }) {
    const { records } = data;
    const [limit, setLimit] = useState(12);
    const setF = patch => { setFilters({ ...filters, ...patch }); setLimit(12); };
    const open = hash => e => { e.preventDefault(); actions.go(hash); };
    const mine = canUpload(user)
      ? records.filter(r => r.uploaderId === user.id && editLeftHours(r) > 0)
        .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
      : [];
    // 手機版只用「分類、日期區間、搜尋」三個條件，其他篩選在電腦版
    const recs = filterRecords(records, { ...DEFAULT_FILTERS, cat: filters.cat, from: filters.from, to: filters.to, q: filters.q }, data.subcats);
    const shown = recs.slice(0, limit);
    const groups = groupFor(filters.cat, shown, data.subcats);
    const card = r => html`<${RecordCard} key=${r.id} rec=${r} data=${data} onOpen=${open('#/record/' + r.id)} />`;

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
              <div class="meta">${roc(r.date)}｜${catById(r.cat).short}｜${countText(r)}</div>
            </div>
            ${!isAdmin(user) && html`<span class="mine-left">可改 ${leftText(editLeftHours(r))}</span>`}
          </a>`)}
        </div>
      </section>`}

      <section class="m-sec">
        <h2 class="m-sec-title">最新紀錄</h2>
        <select class="select" aria-label="分類" value=${filters.cat} onChange=${e => setF({ cat: e.target.value })}>
          <option value="all">全部分類</option>
          ${D.categories.map(c => html`<option value=${c.id}>${c.name}</option>`)}
        </select>
        <${DateRange} from=${filters.from} to=${filters.to} onChange=${setF} />
        <div class="search">
          <${Icon} name="search" />
          <input type="search" aria-label="搜尋" placeholder="搜尋名稱、關鍵字、備註、上傳者"
            value=${filters.q} onInput=${e => setF({ q: e.target.value })} />
        </div>
      </section>

      ${recs.length === 0
        ? html`<div class="empty"><p>沒有符合的紀錄</p></div>`
        : groups
          ? groups.map(g => html`<section key=${g.key}>
              <h2 class="group-title">${g.label}</h2>
              <div class="list">${g.recs.map(card)}</div>
            </section>`)
          : html`<div class="list">${shown.map(card)}</div>`}
      ${recs.length > limit && html`<div class="pad-x">
        <button class="btn btn-outline btn-block" onClick=${() => setLimit(limit + 12)}>顯示更多（還有 ${recs.length - limit} 筆）</button>
      </div>`}
      <p class="m-foot muted">要依身分、關鍵字篩選，或管理資料，請用電腦開啟。</p>`;
  }

  // 底部固定：一顆明確的「上傳」大按鈕，按下去進上傳流程
  function MobileUploadBar({ actions }) {
    return html`<div class="upload-bar">
      <button class="btn btn-primary btn-block upload-main" onClick=${() => actions.go('#/upload')}>
        <${Icon} name="upload" size=${28} />上傳照片或文件
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

  // ---------- 紀錄內容 ----------
  function MobileRecord({ rec, user, data, actions }) {
    const cat = catById(rec.cat);
    const sub = rec.sub && subName(data.subcats, rec.sub);
    const up = userById(rec.uploaderId);
    const editable = canEdit(user, rec);
    const deletable = canDelete(user, rec);
    const note = editNote(user, rec);

    return html`
      <${TopBar} title="紀錄內容" onBack=${actions.back} />
      <main class="page">
        <div class="card-top">
          <span class="chip">${cat.name}</span>
          ${sub && html`<span class="chip">${sub}</span>`}
          <span class="date">${roc(rec.date)}</span>
        </div>
        <h1 class="page-title">${rec.title}</h1>
        <div>
          <div class="meta">${byLine(rec)}${up.disabled ? '（帳號已停用）' : ''}</div>
          <div class="meta">上傳於 ${rocDT(rec.uploadedAt)}</div>
          ${rec.editedAt && html`<div class="meta">最後修改：${userById(rec.editedBy).name} ${rocDT(rec.editedAt)}</div>`}
        </div>

        ${cat.status && html`<${StatusBlock} rec=${rec} user=${user} actions=${actions} />`}

        ${note && html`<div class="edit-box">
          <div>${note}</div>
          ${(editable || deletable) && html`<div class="btn-row">
            ${editable && html`<button class="btn btn-outline" onClick=${() => actions.go('#/edit/' + rec.id)}>修改</button>`}
            ${deletable && html`<button class="btn btn-outline danger" onClick=${() => actions.askDelete(rec.id)}>刪除</button>`}
          </div>`}
        </div>`}

        ${rec.period && html`<div class="kv"><span>請款期別</span><span>第 ${rec.period} 期</span></div>`}
        ${rec.tags.length > 0 && html`<div class="kv"><span>關鍵字</span><span>${rec.tags.join('、')}</span></div>`}
        ${rec.note && html`<div class="kv"><span>備註</span><span>${rec.note}</span></div>`}

        ${rec.photos.length > 0 && html`<section class="sec">
          <div class="sec-head">
            <h2>照片 ${rec.photos.length} 張</h2>
            <button class="btn btn-outline" onClick=${() => actions.toast(zipText(rec))}><${Icon} name="download" />整本下載</button>
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
    const [step, setStep] = useState('files');
    const [askLeave, setAskLeave] = useState(false);
    const cat = d.catId ? catById(d.catId) : null;
    // 網址帶了分類進來時分類已經定好，只剩兩步
    const stepLabels = d.presetCat ? ['選照片', '確認資料'] : ['選照片', '選分類', '確認資料'];
    const stepIndex = step === 'files' ? 0 : step === 'cat' ? 1 : stepLabels.length - 1;
    const stepper = html`<${Stepper} steps=${stepLabels} current=${stepIndex} />`;

    useEffect(() => { window.scrollTo(0, 0); }, [step, d.phase]);

    const leave = () => { if (d.items.length && d.phase !== 'done') setAskLeave(true); else actions.back(); };
    const prev = () => {
      if (step === 'form') setStep(d.presetCat ? 'files' : 'cat');
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
          <button class="btn btn-outline btn-block" onClick=${() => actions.replace('#/record/' + d.createdId)}>查看這筆紀錄</button>
          <button class="btn btn-outline btn-block" onClick=${actions.again}>再傳一批</button>
          <button class="link-btn" onClick=${actions.back}>回首頁</button>
        </div>`;
    } else if (step === 'files') {
      top = html`<${TopBar} title="上傳" onBack=${prev} right=${closeBtn} />`;
      content = html`
        <div class="step">
          ${stepper}
          <div>
            <h1 class="step-title">選照片或文件</h1>
            <p class="step-sub">可以直接拍照、從手機相簿選，或選 PDF；可以選好幾張</p>
          </div>
          <div class="pick-grid">
            <label class="pick-btn">
              <input type="file" accept="image/*" capture="environment" onChange=${e => { d.addFiles(e.target.files, 'photo'); e.target.value = ''; }} />
              <${Icon} name="camera" size=${32} />${d.items.length ? '再拍一張' : '拍照'}
            </label>
            <label class="pick-btn">
              <input type="file" accept="image/*" multiple onChange=${e => { d.addFiles(e.target.files, 'photo'); e.target.value = ''; }} />
              <${Icon} name="image" size=${32} />${d.items.length ? '再選照片' : '從相簿選'}
            </label>
            <label class="pick-btn">
              <input type="file" accept="application/pdf,.pdf" multiple onChange=${e => { d.addFiles(e.target.files, 'pdf'); e.target.value = ''; }} />
              <${Icon} name="file" size=${32} />選 PDF
            </label>
          </div>
          ${!d.items.length && html`<button class="btn btn-outline btn-block" onClick=${d.addSamples}>（Demo）加入 15 張範例照片</button>`}
          ${d.reading > 0 && html`<div class="notice info">正在讀取照片的拍攝時間與 PDF 頁數…</div>`}
          <${SelectedFiles} d=${d} />
        </div>
        <div class="step-actions">
          <button class="btn btn-primary btn-block btn-lg" disabled=${!d.items.length || d.reading > 0}
            onClick=${() => setStep(d.presetCat ? 'form' : 'cat')}>下一步</button>
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
        ${blockedCatHints(user).map(t => html`<p class="muted">${t}。</p>`)}
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
    const files = canEditFiles(user, rec);
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
        <div class="notice info">${files
          ? '可以改下面的資料，也可以移除或補傳照片、文件。每次修改都會留下紀錄。'
          : '書審文件不能在這裡增刪，要換新檔請回紀錄頁按「更新」。每次修改都會留下紀錄。'}</div>
        <${Fields} form=${form} setForm=${setForm} catId=${rec.cat} user=${user} data=${data} />
        ${files && html`<${EditFiles} form=${form} setForm=${setForm} toast=${actions.toast} />`}
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
