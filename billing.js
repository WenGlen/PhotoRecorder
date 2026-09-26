/* 阿美中會工地記錄平台 Demo：請款（獨立的資料，不跟其他記錄共用；只有項目，沒有大分類、子分類）
   每一期包含：整合施工日誌、記錄照片、記錄文件、估價單及其他文件 */
(function () {
  'use strict';

  const PR = window.PR;
  if (!PR || PR.bootFailed) return;

  const { useState } = window.preactHooks;
  const {
    html, uid, fmtSize, nowIso, ymd, dt, addDays, today, userById, catById, billingName, canBilling, docMeta, byDateDesc,
    toPhoto, toPdf, Icon, Photo, Sheet
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

  const summaryOf = b => [
    b.merged ? `施工日誌 ${b.merged.pages} 頁` : '施工日誌還沒整合',
    `照片 ${b.photos.length} 張`, `文件 ${b.docs.length} 份`, `估價單及其他 ${b.quotes.length} 份`
  ].join('｜');

  // ---------- 列表 ----------
  function BillingPage({ user, data, route, actions }) {
    const [adding, setAdding] = useState(false);
    const list = [...data.billing].sort((a, b) => b.no - a.no);
    const sel = route.id && data.billing.find(b => b.id === route.id);
    const select = id => actions.replace('#/billing/' + id);
    const keys = id => e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(id); } };
    return html`<div class=${'d-page d-split' + (sel ? ' has-detail' : '')}>
      <section class="d-list-col">
        <div class="d-toolbar">
          <div class="d-page-head flush">
            <h1 class="d-h1">請款記錄</h1>
            ${canBilling(user) && html`<button class="btn btn-primary" onClick=${() => setAdding(true)}><${Icon} name="plus" />新增請款項目</button>`}
          </div>
        </div>
        <div class="d-scroll">
          ${list.length === 0
            ? html`<div class="empty"><p>還沒有請款項目</p></div>`
            : html`<table class="d-table">
              <thead><tr><th>項目名稱</th>${sel ? html`<th>內容</th>` : html`<th>整合施工日誌</th><th>記錄照片</th><th>記錄文件</th><th>估價單及其他</th>`}</tr></thead>
              <tbody>
                ${list.map(b => html`<tr key=${b.id} class=${'d-row' + (sel && sel.id === b.id ? ' on' : '')} tabIndex="0"
                  aria-selected=${!!sel && sel.id === b.id} onClick=${() => select(b.id)} onKeyDown=${keys(b.id)}>
                  <td class="c-title">${billingName(b)}</td>
                  ${sel
                    ? html`<td class="c-sub">${summaryOf(b)}</td>`
                    : html`<td class="c-nowrap">${b.merged ? `${b.merged.pages} 頁` : html`<span class="c-muted">還沒整合</span>`}</td>
                      <td class="c-nowrap">${b.photos.length} 張</td>
                      <td class="c-nowrap">${b.docs.length} 份</td>
                      <td class="c-nowrap">${b.quotes.length} 份</td>`}
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

  // PDF 清單：點一下預覽，可以下載；估價單可以移除
  function FileRows({ files, actions, onRemove }) {
    return html`<ul class="file-list">
      ${files.map(f => html`<li class="doc" key=${f.id}>
        <button class="file-row" onClick=${() => actions.openPdf(f)}>
          <${Icon} name="file" />
          <span class="file-name">${f.name}</span>
          <span class="file-meta">${f.from ? `來自：${ymd(f.from.date)} ${f.from.title}｜` : ''}${docMeta(f)}</span>
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
    const can = canBilling(user);
    const [sheet, setSheet] = useState(null);
    const [printing, setPrinting] = useState(false);
    const gallery = {
      title: billingName(bill),
      photos: bill.photos.map(e => ({ ...e.file, id: e.id, label: e.name, from: e.from }))
    };
    const printPhotos = async () => {
      setPrinting(true);
      try {
        const { blob, pages } = await PR.photosPdf(billingName(bill), bill.photos);
        actions.openPdf({
          id: uid('pp'), name: `第${bill.no}期記錄照片.pdf`, pages, size: fmtSize(blob.size), url: URL.createObjectURL(blob),
          uploaderId: user.id, uploadedAt: nowIso()
        });
      } catch (e) {
        actions.toast(e.message || '產生 PDF 失敗，請再試一次');
      }
      setPrinting(false);
    };
    const addQuotes = async files => {
      const items = await PR.readFiles(files, 'pdf', { room: 0, toast: actions.toast });
      if (!items.length) return;
      const at = nowIso();
      actions.updateBilling(bill.id, { quotes: [...bill.quotes, ...items.map(i => toPdf(i, user.id, at))] },
        `上傳估價單及其他文件：${items.map(i => i.name).join('、')}`);
      actions.toast(`已上傳 ${items.length} 份文件`);
    };
    const removeQuote = f => actions.updateBilling(bill.id, { quotes: bill.quotes.filter(q => q.id !== f.id) }, `移除「${f.name}」`);

    return html`<div class="d-detail">
      <div class="d-detail-head">
        <div class="card-top"><span class="chip">請款</span><span class="date">建立：${userById(bill.createdBy).name}｜${dt(bill.createdAt)}</span></div>
        <button class="icon-btn d-close" aria-label="關閉請款內容" onClick=${onClose}><${Icon} name="close" size=${28} /></button>
      </div>
      <h2 class="d-detail-title">${billingName(bill)}</h2>
      ${can && html`<div class="d-actions"><button class="btn btn-outline sm" onClick=${() => setSheet('edit')}><${Icon} name="pencil" size=${20} />修改期別與日期</button></div>`}

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
          <h3 class="d-sec-title">記錄照片 ${bill.photos.length} 張</h3>
          <div class="sec-tools">
            ${bill.photos.length > 0 && html`<button class="btn btn-outline sm" disabled=${printing} onClick=${printPhotos}>
              <${Icon} name="printer" size=${20} />${printing ? '產生中…' : '列印'}</button>`}
            ${can && html`<button class="btn btn-outline sm" onClick=${() => setSheet('photo')}>編輯照片</button>`}
          </div>
        </div>
        ${bill.photos.length
          ? html`<div class="bill-photos">
              ${bill.photos.map((e, i) => html`<figure class="bill-photo" key=${e.id}>
                <button class="thumb" aria-label=${'看 ' + e.name} onClick=${() => actions.openGallery(gallery, i)}><${Photo} p=${e.file} bare /></button>
                <figcaption>${e.name}</figcaption>
              </figure>`)}
            </div>`
          : html`<p class="muted">還沒有照片</p>`}
      </section>

      <section class="sec bill-sec">
        <div class="sec-head">
          <h3 class="d-sec-title">記錄文件 ${bill.docs.length} 份</h3>
          ${can && html`<button class="btn btn-outline sm" onClick=${() => setSheet('pdf')}>編輯文件</button>`}
        </div>
        ${bill.docs.length
          ? html`<${FileRows} files=${bill.docs.map(e => ({ ...e.file, id: e.id, name: e.name, from: e.from }))} actions=${actions} />`
          : html`<p class="muted">還沒有文件</p>`}
      </section>

      <section class="sec bill-sec">
        <div class="sec-head">
          <h3 class="d-sec-title">估價單及其他文件 ${bill.quotes.length} 份</h3>
          ${can && html`<label class="btn btn-outline sm pick-inline">
            <input type="file" multiple accept="application/pdf,.pdf" onChange=${e => { addQuotes(e.target.files); e.target.value = ''; }} />
            <${Icon} name="upload" size=${20} />上傳
          </label>`}
        </div>
        ${bill.quotes.length
          ? html`<${FileRows} files=${bill.quotes} actions=${actions} onRemove=${can ? removeQuote : null} />`
          : html`<p class="muted">還沒有文件</p>`}
      </section>

      ${sheet === 'edit' && html`<${BillingFormSheet} data=${data} bill=${bill} onClose=${() => setSheet(null)}
        onSave=${info => { actions.updateBilling(bill.id, info, `期別與日期改成「${billingName(info)}」`); setSheet(null); }} />`}
      ${sheet === 'merge' && html`<${MergeSheet} bill=${bill} data=${data} user=${user} actions=${actions} onClose=${() => setSheet(null)} />`}
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
    const cats = isPhoto ? ['site', 'review'] : ['review'];
    const word = q.trim();
    const recs = data.records
      .filter(r => cats.includes(r.cat) && (isPhoto ? r.photos.length : r.pdfs.length))
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

  // ---------- 記錄照片／記錄文件：一筆一筆加 ----------
  function EntrySheet({ kind, bill, data, user, actions, onClose }) {
    const isPhoto = kind === 'photo';
    const [rows, setRows] = useState(() => (isPhoto ? bill.photos : bill.docs).map(e => ({ ...e })));
    const [picking, setPicking] = useState(null);
    const [err, setErr] = useState('');
    const set = (id, patch) => setRows(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)));
    const addRow = () => setRows(rs => [...rs, { id: uid(isPhoto ? 'bp' : 'bd'), name: '', file: null, from: null }]);
    const upload = async (row, files) => {
      const [it] = await PR.readFiles(files, kind, { room: 1, toast: actions.toast });
      if (!it) return;
      set(row.id, { file: isPhoto ? toPhoto(it) : toPdf(it, user.id, nowIso()), from: null, name: row.name || (isPhoto ? '' : it.name) });
    };
    const pick = (row, rec, file) => {
      set(row.id, { file: { ...file }, from: { recId: rec.id, title: rec.title, date: rec.date }, name: row.name || (isPhoto ? rec.title : file.name) });
      setPicking(null);
    };
    const save = () => {
      if (rows.some(r => !r.file || !r.name.trim())) { setErr(isPhoto ? '每一筆都要有照片和照片名稱' : '每一筆都要有文件和名稱'); return; }
      actions.updateBilling(bill.id, { [isPhoto ? 'photos' : 'docs']: rows.map(r => ({ ...r, name: r.name.trim() })) },
        `${isPhoto ? '記錄照片' : '記錄文件'}更新為 ${rows.length} ${isPhoto ? '張' : '份'}`);
      onClose();
    };

    if (picking) {
      const row = rows.find(r => r.id === picking);
      return html`<${Sheet} title=${isPhoto ? '從已上傳的照片挑一張' : '從書審及材料測試挑一份文件'} wide onClose=${() => setPicking(null)}>
        <${Picker} kind=${kind} bill=${bill} data=${data} onPick=${(rec, file) => pick(row, rec, file)} />
        <button class="btn btn-outline btn-block" onClick=${() => setPicking(null)}>回上一步</button>
      <//>`;
    }
    return html`<${Sheet} title=${isPhoto ? '編輯記錄照片' : '編輯記錄文件'} wide onClose=${onClose}>
      <p class="muted">${isPhoto
        ? '一筆是一張照片加一個名稱。照片可以直接上傳，也可以從工地記錄、書審及材料測試挑。'
        : '一筆是一份文件。可以直接上傳 PDF，也可以從書審及材料測試挑。'}</p>
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
            <input class="input" aria-label=${`第 ${i + 1} 筆的名稱`} placeholder=${isPhoto ? '照片名稱，例如：一樓版灌漿' : '文件名稱'}
              value=${r.name} onInput=${e => set(r.id, { name: e.target.value })} />
            <div class="entry-src">${r.from ? `來自：${ymd(r.from.date)} ${r.from.title}` : r.file ? '直接上傳' : ''}</div>
            <div class="entry-actions">
              <label class="btn btn-outline sm pick-inline">
                <input type="file" accept=${isPhoto ? 'image/*' : 'application/pdf,.pdf'} onChange=${e => { upload(r, e.target.files); e.target.value = ''; }} />
                <${Icon} name="upload" size=${20} />上傳
              </label>
              <button class="btn btn-outline sm" onClick=${() => setPicking(r.id)}>${isPhoto ? '從已上傳的照片挑' : '從書審及材料測試挑'}</button>
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
