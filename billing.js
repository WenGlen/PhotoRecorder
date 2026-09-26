/* 阿美中會工地記錄平台 Demo：請款（獨立的資料，不跟其他記錄共用；只有項目，沒有大分類、子分類）
   每一期包含：估價單、整合施工日誌、請款照片、書審及材料測試、其他文件 */
(function () {
  'use strict';

  const PR = window.PR;
  if (!PR || PR.bootFailed) return;

  const { useState } = window.preactHooks;
  const {
    html, uid, fmtSize, nowIso, ymd, dt, addDays, today, userById, catById, billingName, isAdmin, canBilling, docMeta, byDateDesc,
    toPhoto, toPdf, fromLabel, Icon, Photo, Sheet
  } = PR;

  /**
   * 日期區間內、勾了「施工日誌」的工地記錄文件，依日期排好（整合時照這個順序）。
   * @returns {Array<{ rec: Object, pdf: Object }>}
   */
  function diaryDocs(records, from, to) {
    const out = [];
    records
      .filter(r => r.cat === 'site' && (!from || r.date >= from) && (!to || r.date <= to))
      .sort((a, b) => a.date.localeCompare(b.date) || new Date(a.uploadedAt) - new Date(b.uploadedAt))
      .forEach(r => r.pdfs.filter(p => p.diary).forEach(p => out.push({ rec: r, pdf: p })));
    return out;
  }

  /**
   * 照片名稱：開頭是日期時，日期跟項目分開排，放不下同一行就整段項目換到下一行，不會從字中間斷開。
   * @param {{ text: string }} props
   */
  const Caption = ({ text }) => {
    const m = /^(\d{4}\/\d{2}\/\d{2}) (.+)$/.exec(text);
    return m ? html`<span class="cap-date">${m[1]}</span> <span class="cap-item">${m[2]}</span>` : text;
  };

  /** 請款照片給燈箱用：照片說明是請款裡取的名稱 */
  const galleryOf = bill => ({
    title: billingName(bill),
    photos: bill.photos.map(e => ({ ...e.file, id: e.id, label: e.name, from: e.from }))
  });
  /** 書審及材料測試的文件：檔案本身，加上請款裡取的名稱和出處 */
  const docFileOf = e => ({ ...e.file, id: e.id, name: e.name, from: e.from });

  /**
   * 把請款照片排成 A4 一頁兩張的 PDF，當成一份檔案（可以預覽、下載、列印）。
   * @param {Object} bill 這一期請款
   * @param {Object} user 目前的使用者
   * @returns {Promise<Object>}
   */
  async function photosPdfFile(bill, user) {
    const { blob, pages } = await PR.photosPdf(billingName(bill), bill.photos);
    return {
      id: uid('pp'), name: `第${bill.no}期請款照片.pdf`, pages, size: fmtSize(blob.size), url: URL.createObjectURL(blob),
      uploaderId: user.id, uploadedAt: nowIso()
    };
  }

  /**
   * 請款項目底下的檔案：一個檔案一顆小按鈕，排成一串（不分種類換行），點了直接預覽。
   * 順序：估價單 → 整合施工日誌 → 請款照片（整份 PDF，點了才產生）→ 書審及材料測試 → 其他文件。
   * 按鈕在可點選的列裡面，點按鈕只預覽，不會順便打開側窗。
   * @param {{ bill: Object, user: Object, actions: Object }} props
   */
  function BillFiles({ bill, user, actions }) {
    const [making, setMaking] = useState(false);
    const openPhotos = async () => {
      setMaking(true);
      try {
        actions.openPdf(await photosPdfFile(bill, user));
      } catch (e) {
        actions.toast(e.message || '產生 PDF 失敗，請再試一次');
      }
      setMaking(false);
    };
    const pdfItem = f => ({ key: f.id, name: f.name, open: () => actions.openPdf(f) });
    const items = [
      ...bill.quotes.map(pdfItem),
      ...(bill.merged ? [pdfItem(bill.merged)] : []),
      ...(bill.photos.length ? [{ key: 'photos', name: making ? '正在產生請款照片…' : `第${bill.no}期請款照片.pdf`, open: openPhotos, busy: making }] : []),
      ...bill.docs.map(e => pdfItem(docFileOf(e))),
      ...bill.others.map(pdfItem)
    ];
    if (!items.length) return html`<div class="bill-files-empty">還沒有檔案</div>`;
    return html`<div class="bill-chips">
      ${items.map(it => html`<button key=${it.key} class="file-chip" title=${it.name} disabled=${!!it.busy}
        onClick=${e => { e.stopPropagation(); it.open(); }}><${Icon} name="file" size=${16} /><span>${it.name}</span></button>`)}
    </div>`;
  }

  // ---------- 列表 ----------
  function BillingPage({ user, data, route, actions }) {
    const [adding, setAdding] = useState(false);
    const list = [...data.billing].sort((a, b) => b.no - a.no);
    const sel = route.id && data.billing.find(b => b.id === route.id);
    const select = id => actions.replace('#/billing/' + id);
    // 列裡面的檔案按鈕自己處理鍵盤，列只接自己身上的 Enter／空白鍵
    const keys = id => e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(id); } };
    return html`<div class=${'d-page d-split' + (sel ? ' has-detail' : '')}>
      <section class="d-list-col">
        <div class="d-toolbar">
          <div class="d-page-head flush">
            <h1 class="d-h1">請款</h1>
            ${canBilling(user) && html`<button class="btn btn-primary" onClick=${() => setAdding(true)}><${Icon} name="plus" />新增請款項目</button>`}
          </div>
        </div>
        <div class="d-scroll">
          ${list.length === 0
            ? html`<div class="empty"><p>還沒有請款項目</p></div>`
            : html`<table class="d-table">
              <thead><tr><th>請款項目</th></tr></thead>
              <tbody>
                ${list.map(b => html`<tr key=${b.id} class=${'d-row' + (sel && sel.id === b.id ? ' on' : '')} tabIndex="0"
                  aria-selected=${!!sel && sel.id === b.id} onClick=${() => select(b.id)} onKeyDown=${keys(b.id)}>
                  <td>
                    <div class="bill-name">${billingName(b)}${b.done && html`<span class="st st-pass sm">請款完成</span>`}</div>
                    <${BillFiles} bill=${b} user=${user} actions=${actions} />
                  </td>
                </tr>`)}
              </tbody>
            </table>`}
        </div>
      </section>
      ${sel && html`<aside class="d-detail-col" aria-label="請款內容">
        <${BillingDetail} key=${sel.id} bill=${sel} user=${user} data=${data} actions=${actions} onClose=${() => actions.replace('#/billing')} />
      </aside>`}
      ${adding && html`<${BillingFormSheet} data=${data} onClose=${() => setAdding(false)}
        onSave=${info => { setAdding(false); select(actions.addBilling(info)); }} />`}
    </div>`;
  }

  // ---------- 新增／修改期別：只填第幾期和日期區間，名稱自動產生 ----------
  function BillingFormSheet({ data, bill, onClose, onSave }) {
    const last = [...data.billing].sort((a, b) => b.no - a.no)[0];
    const [no, setNo] = useState(String(bill ? bill.no : (last ? last.no + 1 : 1)));
    const [from, setFrom] = useState(bill ? bill.from : (last ? addDays(last.to, 1) : today()));
    const [to, setTo] = useState(bill ? bill.to : today());
    const [err, setErr] = useState('');
    const n = Number(no);
    const preview = n > 0 && from && to ? billingName({ no: n, from, to }) : '';
    const save = () => {
      if (!Number.isInteger(n) || n < 1) { setErr('期數請填正整數'); return; }
      if (data.billing.some(b => b.no === n && (!bill || b.id !== bill.id))) { setErr(`第${n}期已經有了`); return; }
      if (!from || !to) { setErr('請選擇日期區間'); return; }
      if (from > to) { setErr('開始日期不能晚於結束日期'); return; }
      onSave({ no: n, from, to });
    };
    return html`<${Sheet} title=${bill ? '修改期別與日期' : '新增請款項目'} onClose=${onClose}>
      <div class="field">
        <label class="field-label" for="b-no">期數<span class="req">必填</span></label>
        <div class="inline-period">
          <span>第</span>
          <input id="b-no" class="input" type="number" min="1" inputmode="numeric" value=${no} onInput=${e => setNo(e.target.value)} />
          <span>期</span>
        </div>
      </div>
      <div class="field">
        <div class="field-label">日期區間<span class="req">必填</span></div>
        <div class="date-range">
          <label class="dr-end"><span class="dr-label">從</span>
            <input type="date" class="input" aria-label="開始日期" value=${from} onInput=${e => setFrom(e.target.value)} onChange=${e => setFrom(e.target.value)} />
          </label>
          <span class="dr-sep" aria-hidden="true">～</span>
          <label class="dr-end"><span class="dr-label">到</span>
            <input type="date" class="input" aria-label="結束日期" value=${to} onInput=${e => setTo(e.target.value)} onChange=${e => setTo(e.target.value)} />
          </label>
        </div>
      </div>
      <div class="field">
        <div class="field-label">項目名稱<span class="opt-tag">自動產生</span></div>
        <div class="readonly">${preview || '—'}</div>
      </div>
      ${err && html`<div class="notice error">${err}</div>`}
      <button class="btn btn-primary btn-block btn-lg" onClick=${save}>${bill ? '儲存' : '建立'}</button>
    <//>`;
  }

  // PDF 清單：點一下預覽，可以下載；估價單、其他文件可以移除
  function FileRows({ files, actions, onRemove }) {
    return html`<ul class="file-list">
      ${files.map(f => html`<li class="doc" key=${f.id}>
        <button class="file-row" onClick=${() => actions.openPdf(f)}>
          <${Icon} name="file" />
          <span class="file-name">${f.name}</span>
          <span class="file-meta">${f.from ? `來自：${fromLabel(f.from)}｜` : ''}${docMeta(f)}</span>
        </button>
        <div class="doc-actions">
          <button class="btn btn-outline sm" onClick=${() => PR.downloadFile(f, 'pdf', actions.toast)}><${Icon} name="download" size=${20} />下載</button>
          ${onRemove && html`<button class="btn btn-outline sm danger" onClick=${() => onRemove(f)}>移除</button>`}
        </div>
      </li>`)}
    </ul>`;
  }

  // ---------- 一期請款的內容 ----------
  function BillingDetail({ bill, user, data, actions, onClose }) {
    const locked = !!bill.done;
    // 請款完成後鎖定：不能再整合、選擇、上傳或修改，只有管理者可以解鎖
    const can = canBilling(user) && !locked;
    const [sheet, setSheet] = useState(null);
    const [printing, setPrinting] = useState(false);
    const gallery = galleryOf(bill);
    const printPhotos = async () => {
      setPrinting(true);
      try {
        actions.openPdf(await photosPdfFile(bill, user));
      } catch (e) {
        actions.toast(e.message || '產生 PDF 失敗，請再試一次');
      }
      setPrinting(false);
    };
    /** 直接上傳的 PDF（估價單、其他文件），可以一次選好幾份 */
    const addFiles = async (key, label, files) => {
      const items = await PR.readFiles(files, 'pdf', { room: 0, toast: actions.toast });
      if (!items.length) return;
      const at = nowIso();
      actions.updateBilling(bill.id, { [key]: [...bill[key], ...items.map(i => toPdf(i, user.id, at))] },
        `上傳${label}：${items.map(i => i.name).join('、')}`);
      actions.toast(`已上傳 ${items.length} 份${label}`);
    };
    const complete = () => {
      actions.updateBilling(bill.id, { done: { by: user.id, at: nowIso() } }, '請款完成（鎖定）');
      actions.toast('已標記請款完成，這期已鎖定');
      setSheet(null);
    };
    const unlock = () => {
      actions.updateBilling(bill.id, { done: null }, '解鎖');
      actions.toast('已解鎖，可以再修改');
    };
    const removeFile = (key, label) => f => actions.updateBilling(bill.id, { [key]: bill[key].filter(q => q.id !== f.id) }, `移除${label}「${f.name}」`);
    /** 估價單、其他文件：標題旁邊是「上傳」，每份可以移除 */
    const uploadSec = (key, label) => html`<section class="sec bill-sec">
      <div class="sec-head">
        <h3 class="d-sec-title">${label} ${bill[key].length} 份</h3>
        ${can && html`<label class="btn btn-outline sm pick-inline">
          <input type="file" multiple accept="application/pdf,.pdf" onChange=${e => { addFiles(key, label, e.target.files); e.target.value = ''; }} />
          <${Icon} name="upload" size=${20} />上傳
        </label>`}
      </div>
      ${bill[key].length
        ? html`<${FileRows} files=${bill[key]} actions=${actions} onRemove=${can ? removeFile(key, label) : null} />`
        : html`<p class="muted">還沒有${label}</p>`}
    </section>`;

    return html`<div class="d-detail">
      <div class="d-detail-head">
        <div class="card-top"><span class="chip">請款</span><span class="date">建立：${userById(bill.createdBy).name}｜${dt(bill.createdAt)}</span></div>
        <button class="icon-btn d-close" aria-label="關閉請款內容" onClick=${onClose}><${Icon} name="close" size=${28} /></button>
      </div>
      <h2 class="d-detail-title">${billingName(bill)}</h2>
      ${locked
        ? html`<div class="bill-lock">
            <span class="st st-pass"><${Icon} name="lock" size=${16} />請款完成</span>
            <span class="bill-lock-note">${userById(bill.done.by).name}｜${dt(bill.done.at)} 完成，已鎖定</span>
            ${isAdmin(user) && html`<button class="btn btn-outline sm" onClick=${unlock}><${Icon} name="unlock" size=${20} />解鎖</button>`}
          </div>`
        : can && html`<div class="d-actions">
            <button class="btn btn-outline sm" onClick=${() => setSheet('edit')}><${Icon} name="pencil" size=${20} />修改期別與日期</button>
            <button class="btn btn-primary sm" onClick=${() => setSheet('done')}><${Icon} name="check" size=${20} />請款完成</button>
          </div>`}

      ${uploadSec('quotes', '估價單')}

      <section class="sec bill-sec">
        <div class="sec-head">
          <h3 class="d-sec-title">整合施工日誌</h3>
          ${can && html`<button class="btn btn-outline sm" onClick=${() => setSheet('merge')}>${bill.merged ? '重新整合' : '整合施工日誌'}</button>`}
        </div>
        ${bill.merged
          ? html`<${FileRows} files=${[bill.merged]} actions=${actions} />`
          : html`<p class="muted">還沒有整合</p>`}
      </section>

      <section class="sec bill-sec">
        <div class="sec-head">
          <h3 class="d-sec-title">請款照片 ${bill.photos.length} 張</h3>
          <div class="sec-tools">
            ${bill.photos.length > 0 && html`<button class="btn btn-outline sm" disabled=${printing} onClick=${printPhotos}>
              <${Icon} name="printer" size=${20} />${printing ? '產生中…' : '列印'}</button>`}
            ${can && html`<button class="btn btn-outline sm" onClick=${() => setSheet('photo')}>選擇照片</button>`}
          </div>
        </div>
        ${bill.photos.length
          ? html`<div class="bill-photos">
              ${bill.photos.map((e, i) => html`<figure class="bill-photo" key=${e.id}>
                <button class="thumb" aria-label=${'看 ' + e.name} onClick=${() => actions.openGallery(gallery, i)}><${Photo} p=${e.file} bare /></button>
                <figcaption><${Caption} text=${e.name} /></figcaption>
              </figure>`)}
            </div>`
          : html`<p class="muted">還沒有照片</p>`}
      </section>

      <section class="sec bill-sec">
        <div class="sec-head">
          <h3 class="d-sec-title">書審及材料測試 ${bill.docs.length} 份</h3>
          ${can && html`<button class="btn btn-outline sm" onClick=${() => setSheet('pdf')}>編輯文件</button>`}
        </div>
        ${bill.docs.length
          ? html`<${FileRows} files=${bill.docs.map(docFileOf)} actions=${actions} />`
          : html`<p class="muted">還沒有文件</p>`}
      </section>

      ${uploadSec('others', '其他文件')}

      ${sheet === 'edit' && html`<${BillingFormSheet} data=${data} bill=${bill} onClose=${() => setSheet(null)}
        onSave=${info => { actions.updateBilling(bill.id, info, `期別與日期改成「${billingName(info)}」`); setSheet(null); }} />`}
      ${sheet === 'merge' && html`<${MergeSheet} bill=${bill} data=${data} user=${user} actions=${actions} onClose=${() => setSheet(null)} />`}
      ${sheet === 'done' && html`<${Sheet} title="確定請款完成？" onClose=${() => setSheet(null)}>
        <p>「${billingName(bill)}」標記完成後會鎖定不能修改</p>
        <button class="btn btn-primary btn-block btn-lg" onClick=${complete}>確定請款完成</button>
      <//>`}
      ${(sheet === 'photo' || sheet === 'pdf') && html`<${EntrySheet} kind=${sheet} bill=${bill} data=${data} user=${user} actions=${actions}
        onClose=${() => setSheet(null)} />`}
    </div>`;
  }

  // ---------- 整合施工日誌 ----------
  function MergeSheet({ bill, data, user, actions, onClose }) {
    const [from, setFrom] = useState(bill.from);
    const [to, setTo] = useState(bill.to);
    const [progress, setProgress] = useState(null);
    const docs = diaryDocs(data.records, from, to);
    const pages = docs.reduce((n, d) => n + (d.pdf.pages || 1), 0);
    const run = async () => {
      setProgress({ done: 0, total: docs.length });
      try {
        const { blob, pages: n } = await PR.mergePdfs(docs.map(d => d.pdf), (done, total) => setProgress({ done, total }));
        const merged = {
          id: uid('m'), name: `第${bill.no}期整合施工日誌.pdf`, size: fmtSize(blob.size), pages: n, url: URL.createObjectURL(blob),
          sources: docs.map(d => d.pdf.id), uploaderId: user.id, uploadedAt: nowIso()
        };
        actions.updateBilling(bill.id, { merged }, `整合施工日誌（${docs.length} 份、${n} 頁）`);
        actions.toast(`已整合成一份 PDF，共 ${n} 頁`);
        onClose();
      } catch (e) {
        actions.toast(e.message || '整合失敗，請再試一次');
        setProgress(null);
      }
    };
    return html`<${Sheet} title="整合施工日誌" wide onClose=${progress ? () => {} : onClose}>
      <p class="muted">日期區間內勾了「施工日誌」的文件會依日期順序合成一份新的 PDF，日期可以在這裡微調。</p>
      <div class="date-range">
        <label class="dr-end"><span class="dr-label">從</span>
          <input type="date" class="input" aria-label="開始日期" value=${from} onInput=${e => setFrom(e.target.value)} onChange=${e => setFrom(e.target.value)} />
        </label>
        <span class="dr-sep" aria-hidden="true">～</span>
        <label class="dr-end"><span class="dr-label">到</span>
          <input type="date" class="input" aria-label="結束日期" value=${to} onInput=${e => setTo(e.target.value)} onChange=${e => setTo(e.target.value)} />
        </label>
      </div>
      ${docs.length === 0
        ? html`<div class="notice info">這段期間沒有勾選施工日誌的文件</div>`
        : html`<table class="d-table d-static merge-table">
            <thead><tr><th>順序</th><th>日期</th><th>項目</th><th>檔案</th><th>頁數</th></tr></thead>
            <tbody>
              ${docs.map((d, i) => html`<tr key=${d.pdf.id}>
                <td>${i + 1}</td><td class="c-nowrap">${ymd(d.rec.date)}</td><td>${d.rec.title}</td><td>${d.pdf.name}</td>
                <td class="c-nowrap">${d.pdf.pages || '—'}</td>
              </tr>`)}
            </tbody>
          </table>
          <div class="merge-sum">共 ${docs.length} 份、約 ${pages} 頁</div>`}
      ${progress && html`<div class="progress-num" role="status">整合中 ${progress.done} / ${progress.total}…</div>
        <div class="bar"><div style=${{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }}></div></div>`}
      <button class="btn btn-primary btn-block btn-lg" disabled=${!docs.length || !!progress} onClick=${run}>整合</button>
    <//>`;
  }

  // ---------- 從已上傳的記錄挑照片或文件 ----------
  function Picker({ kind, bill, data, onPick }) {
    const isPhoto = kind === 'photo';
    const [inRange, setInRange] = useState(true);
    const [q, setQ] = useState('');
    const word = q.trim();
    // 照片和文件都可以從工地記錄、書審及材料測試挑
    const recs = data.records
      .filter(r => (r.cat === 'site' || r.cat === 'review') && (isPhoto ? r.photos.length : r.pdfs.length))
      .filter(r => !inRange || (r.date >= bill.from && r.date <= bill.to))
      .filter(r => !word || `${r.title} ${r.tags.join(' ')}`.includes(word))
      .sort(byDateDesc);
    return html`<div class="picker">
      <div class="picker-bar">
        <label class="switch-row">
          <input type="checkbox" checked=${inRange} onChange=${e => setInRange(e.target.checked)} />
          <span>只看這期的日期（${ymd(bill.from)}~${ymd(bill.to)}）</span>
        </label>
        <div class="search">
          <${Icon} name="search" />
          <input type="search" aria-label="搜尋項目" placeholder="搜尋項目名稱、關鍵字" value=${q} onInput=${e => setQ(e.target.value)} />
        </div>
      </div>
      ${recs.length === 0
        ? html`<div class="empty"><p>沒有符合的${isPhoto ? '照片' : '文件'}</p></div>`
        : recs.map(r => html`<section class="picker-rec" key=${r.id}>
            <div class="picker-head"><span class="chip">${catById(r.cat).short}</span><span class="date">${ymd(r.date)}</span><strong>${r.title}</strong></div>
            ${isPhoto
              ? html`<div class="picker-grid">
                  ${r.photos.map(p => html`<button class="thumb" key=${p.id} aria-label=${`挑 ${r.title} 的 ${p.label}`} onClick=${() => onPick(r, p)}>
                    <${Photo} p=${p} bare />
                  </button>`)}
                </div>`
              : html`<ul class="file-list">
                  ${r.pdfs.map(f => html`<li key=${f.id}><button class="file-row" onClick=${() => onPick(r, f)}>
                    <${Icon} name="file" /><span class="file-name">${f.name}</span><span class="file-meta">${docMeta(f)}</span>
                  </button></li>`)}
                </ul>`}
          </section>`)}
    </div>`;
  }

  // ---------- 請款照片／書審及材料測試：一筆一筆加 ----------
  function EntrySheet({ kind, bill, data, user, actions, onClose }) {
    const isPhoto = kind === 'photo';
    const [rows, setRows] = useState(() => (isPhoto ? bill.photos : bill.docs).map(e => ({ ...e })));
    const [picking, setPicking] = useState(null);
    const [err, setErr] = useState('');
    const set = (id, patch) => setRows(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)));
    const addRow = () => setRows(rs => [...rs, { id: uid(isPhoto ? 'bp' : 'bd'), name: '', file: null, from: null }]);
    /**
     * 這一筆目前的預設名稱：從記錄挑的照片是「日期 項目」（例如「2026/07/08 一樓版灌漿」），文件是檔名。
     * @param {{ file: ?Object, from: ?{ date: string, title: string } }} row
     * @returns {string}
     */
    const autoName = row => (isPhoto ? (row.from ? fromLabel(row.from) : '') : (row.file ? row.file.name : ''));
    /** 換照片或文件時的名稱：自己打的保留；空白或還是預設值，才換成新的預設值 */
    const nameFor = (row, next) => (row.name && row.name !== autoName(row) ? row.name : next);
    const upload = async (row, files) => {
      const [it] = await PR.readFiles(files, kind, { room: 1, toast: actions.toast });
      if (!it) return;
      set(row.id, { file: isPhoto ? toPhoto(it) : toPdf(it, user.id, nowIso()), from: null, name: nameFor(row, isPhoto ? '' : it.name) });
    };
    const pick = (row, rec, file) => {
      const from = { recId: rec.id, title: rec.title, date: rec.date };
      set(row.id, { file: { ...file }, from, name: nameFor(row, isPhoto ? fromLabel(from) : file.name) });
      setPicking(null);
    };
    const save = () => {
      if (rows.some(r => !r.file || !r.name.trim())) { setErr(isPhoto ? '每一筆都要有照片和照片名稱' : '每一筆都要有文件和名稱'); return; }
      actions.updateBilling(bill.id, { [isPhoto ? 'photos' : 'docs']: rows.map(r => ({ ...r, name: r.name.trim() })) },
        `${isPhoto ? '請款照片' : '書審及材料測試文件'}更新為 ${rows.length} ${isPhoto ? '張' : '份'}`);
      onClose();
    };

    // 照片先挑再上傳（按鈕排在「上傳」前面），文件是「上傳」在前
    const pickBtn = r => html`<button class="btn btn-outline sm" onClick=${() => setPicking(r.id)}>${isPhoto ? '從已上傳的照片挑' : '從已上傳的文件挑'}</button>`;

    if (picking) {
      const row = rows.find(r => r.id === picking);
      return html`<${Sheet} title=${isPhoto ? '從已上傳的照片挑一張' : '從已上傳的文件挑一份'} wide onClose=${() => setPicking(null)}>
        <${Picker} kind=${kind} bill=${bill} data=${data} onPick=${(rec, file) => pick(row, rec, file)} />
        <button class="btn btn-outline btn-block" onClick=${() => setPicking(null)}>回上一步</button>
      <//>`;
    }
    return html`<${Sheet} title=${isPhoto ? '選擇請款照片' : '編輯書審及材料測試文件'} wide onClose=${onClose}>
      ${!isPhoto && html`<p class="muted">一筆是一份文件。可以直接上傳 PDF，也可以從書審及材料測試、工地記錄挑。</p>`}
      ${rows.length === 0 && html`<div class="notice info">還沒有任何一筆，按下面的「新增一筆」開始</div>`}
      <ol class="entry-list">
        ${rows.map((r, i) => html`<li class="entry" key=${r.id}>
          <span class="entry-no">${i + 1}</span>
          <div class="entry-file">
            ${isPhoto
              ? html`<div class="entry-thumb">${r.file ? html`<${Photo} p=${r.file} bare />` : html`<span>未選照片</span>`}</div>`
              : html`<div class="entry-doc"><${Icon} name="file" /><span>${r.file ? r.file.name : '未選文件'}</span></div>`}
          </div>
          <div class="entry-main">
            <input class="input" aria-label=${`第 ${i + 1} 筆的名稱`} placeholder=${isPhoto ? '照片名稱，例如：2026/07/08 一樓版灌漿' : '文件名稱'}
              value=${r.name} onInput=${e => set(r.id, { name: e.target.value })} />
            <div class="entry-src">${r.from ? `來自：${fromLabel(r.from)}` : r.file ? '直接上傳' : ''}</div>
            <div class="entry-actions">
              ${isPhoto && pickBtn(r)}
              <label class="btn btn-outline sm pick-inline">
                <input type="file" accept=${isPhoto ? 'image/*' : 'application/pdf,.pdf'} onChange=${e => { upload(r, e.target.files); e.target.value = ''; }} />
                <${Icon} name="upload" size=${20} />上傳
              </label>
              ${!isPhoto && pickBtn(r)}
              <button class="btn btn-outline sm danger" onClick=${() => setRows(rs => rs.filter(x => x.id !== r.id))}>移除</button>
            </div>
          </div>
        </li>`)}
      </ol>
      <button class="btn btn-outline btn-block" onClick=${addRow}><${Icon} name="plus" />新增一筆</button>
      ${err && html`<div class="notice error">${err}</div>`}
      <button class="btn btn-primary btn-block btn-lg" onClick=${save}>儲存</button>
    <//>`;
  }

  Object.assign(PR, { BillingPage });
})();
