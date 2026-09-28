/* 阿美中會工地記錄平台 Demo：請款（獨立的資料，不跟檔案夾共用；一期一期的，沒有大分類、子分類）
   每一期包含：估價單、整合施工日誌、請款照片、書審及材料測試、其他文件。
   估價單、整合施工日誌、書審及材料測試、其他文件一份一份按「審核完成」，請款照片整區一次按（管理者、建築師事務所）；
   審核完成的才列在請款列表上。都審核完成後才能按「全部審核完成」，之後這期不能再上傳新檔案，也才能新增下一期 */
(function () {
  'use strict';

  const PR = window.PR;
  if (!PR || PR.bootFailed) return;

  const { useState } = window.preactHooks;
  const {
    html, uid, fmtSize, nowIso, ymd, dt, addDays, today, userById, catById, billingRange, billingName, isAdmin, canBilling,
    canApproveBilling, docMeta, byDateDesc, toPhoto, toPdf, fromLabel, Icon, Photo, Sheet
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
  /** 書審及材料測試的文件：檔案本身，加上請款裡取的名稱、出處和審核狀態 */
  const docFileOf = e => ({ ...e.file, id: e.id, name: e.name, from: e.from, approved: e.approved });

  /** 這一期所有的檔案：估價單、整合施工日誌、請款照片、書審及材料測試、其他文件 */
  const billItems = b => [...b.quotes, ...(b.merged ? [b.merged] : []), ...b.photos, ...b.docs, ...b.others];
  /** 要審核的單位：文件一份一份審，請款照片整區算一個（有照片才要審） */
  const reviewUnits = b => [
    ...b.quotes, ...(b.merged ? [b.merged] : []), ...b.docs, ...b.others,
    ...(b.photos.length ? [{ approved: b.photosApproved }] : [])
  ];
  /** 能不能按「全部審核完成」：至少有一個檔案，而且每個都審核完成 */
  const allApproved = b => reviewUnits(b).length > 0 && reviewUnits(b).every(it => it.approved);
  /** 期數最大的那一期；沒有就是 null */
  const latestBill = list => list.reduce((last, b) => (!last || b.no > last.no ? b : last), null);
  /** 能不能新增下一期：還沒有任何一期，或最新一期已經全部審核完成 */
  const canAddNext = list => { const last = latestBill(list); return !last || !!last.done; };
  /** 這期後面是不是已經有下一期 */
  const hasNextBill = (list, bill) => list.some(b => b.no > bill.no);

  /**
   * 把請款照片排成 A4 一頁兩張的 PDF，當成一份檔案（可以預覽、下載、列印）。
   * @param {Object} bill 這一期請款
   * @param {Object} user 目前的使用者
   * @param {Object[]} entries 要放進去的照片
   * @returns {Promise<Object>}
   */
  async function photosPdfFile(bill, user, entries) {
    const { blob, pages } = await PR.photosPdf(billingName(bill), entries);
    return {
      id: uid('pp'), name: `第${bill.no}期請款照片.pdf`, pages, size: fmtSize(blob.size), url: URL.createObjectURL(blob),
      uploaderId: user.id, uploadedAt: nowIso()
    };
  }

  /**
   * 審核完成的標示；withWho 時後面接審核的人和時間，不然放在滑鼠移上去的提示。
   * @param {{ stamp: { by: string, at: string }, withWho?: boolean }} props
   */
  const Approved = ({ stamp, withWho }) => {
    const who = `${userById(stamp.by).name}｜${dt(stamp.at)}`;
    return html`<span class="appr" title=${withWho ? undefined : who}>
      <span class="st st-pass sm">審核完成</span>${withWho && html`<span class="appr-by">${who}</span>`}
    </span>`;
  };

  /**
   * 請款列表上的檔案：只列審核完成的，一個檔案一顆小按鈕，排成一串（不分種類換行），點了直接預覽。
   * 順序：估價單 → 整合施工日誌 → 請款照片（整區審核完成後，全部照片合成一份 PDF，點了才產生）→ 書審及材料測試 → 其他文件。
   * 按鈕在可點選的列裡面，點按鈕只預覽，不會順便打開側窗。
   * @param {{ bill: Object, user: Object, actions: Object }} props
   */
  function BillFiles({ bill, user, actions }) {
    const [making, setMaking] = useState(false);
    const ok = list => list.filter(it => it.approved);
    const photosOk = !!bill.photosApproved && bill.photos.length > 0;
    const openPhotos = async () => {
      setMaking(true);
      try {
        actions.openPdf(await photosPdfFile(bill, user, bill.photos));
      } catch (e) {
        actions.toast(e.message || '產生 PDF 失敗，請再試一次');
      }
      setMaking(false);
    };
    const pdfItem = f => ({ key: f.id, name: f.name, open: () => actions.openPdf(f) });
    const items = [
      ...ok(bill.quotes).map(pdfItem),
      ...(bill.merged && bill.merged.approved ? [pdfItem(bill.merged)] : []),
      ...(photosOk ? [{ key: 'photos', name: making ? '正在產生請款照片…' : `第${bill.no}期請款照片.pdf`, open: openPhotos, busy: making }] : []),
      ...ok(bill.docs).map(e => pdfItem(docFileOf(e))),
      ...ok(bill.others).map(pdfItem)
    ];
    if (!items.length) return html`<div class="bill-files-empty">還沒有審核完成的檔案</div>`;
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
    // 上一期全部審核完成，才能開下一期
    const addable = canAddNext(data.billing);
    const addBtn = html`<button class="btn btn-primary" disabled=${!addable} onClick=${() => setAdding(true)}><${Icon} name="plus" />新增一期請款</button>`;
    return html`<div class=${'d-page d-split' + (sel ? ' has-detail' : '')}>
      <section class="d-list-col">
        <div class="d-toolbar">
          <div class="d-page-head flush">
            <h1 class="d-h1">請款</h1>
            ${canBilling(user) && (addable
              ? addBtn
              : html`<span class="tip tip-below" tabIndex="0" data-tip="上一期全部審核完成後才能新增" aria-label="上一期全部審核完成後才能新增">${addBtn}</span>`)}
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
                    <div class="bill-name">${billingName(b)}${b.done && html`<span class="st st-pass sm">全部審核完成</span>`}</div>
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

  // ---------- 新增一期請款／修改日期：期數自動接下去，開始日期接在前一期結束日期的隔天，名稱自動產生 ----------
  function BillingFormSheet({ data, bill, onClose, onSave }) {
    const prev = latestBill(bill ? data.billing.filter(b => b.no < bill.no) : data.billing);
    const no = bill ? bill.no : (prev ? prev.no + 1 : 1);
    // 第一期自己選開始日期；之後每期都接在前一期結束日期的隔天（前一期沒填結束日期，就用今天）
    const lockFrom = !!prev;
    // 已經有下一期時，結束日期不能改（下一期的開始日期接在它後面）
    const lockTo = !!bill && hasNextBill(data.billing, bill);
    const [from, setFrom] = useState(() => (bill ? bill.from : prev ? (prev.to ? addDays(prev.to, 1) : today()) : today()));
    // 結束日期可以不填；新增時預設今天，今天還沒到開始日期就先空著
    const [to, setTo] = useState(() => (bill ? bill.to || '' : today() >= from ? today() : ''));
    const [err, setErr] = useState('');
    const save = () => {
      if (!from) { setErr('請選擇開始日期'); return; }
      if (to && to < from) { setErr('結束日期不能早於開始日期'); return; }
      onSave(bill ? { from, to } : { no, from, to });
    };
    const onFrom = e => setFrom(e.target.value);
    const onTo = e => setTo(e.target.value);
    return html`<${Sheet} title=${bill ? '修改日期' : '新增一期請款'} onClose=${onClose}>
      <div class="field">
        <label class="field-label" for="b-from">開始日期${lockFrom
          ? html`<span class="opt-tag">接在第${prev.no}期之後</span>`
          : html`<span class="req">必填</span>`}</label>
        <input id="b-from" type="date" class="input" value=${from} disabled=${lockFrom} onInput=${onFrom} onChange=${onFrom} />
      </div>
      <div class="field">
        <label class="field-label" for="b-to">結束日期<span class="opt-tag">${lockTo ? `第${bill.no + 1}期接在後面` : '可以之後再填'}</span></label>
        <input id="b-to" type="date" class="input" value=${to} min=${from || undefined} disabled=${lockTo} onInput=${onTo} onChange=${onTo} />
      </div>
      <div class="field">
        <div class="field-label">請款名稱<span class="opt-tag">自動產生</span></div>
        <div class="readonly">${from ? billingName({ no, from, to }) : '—'}</div>
      </div>
      ${err && html`<div class="notice error">${err}</div>`}
      <button class="btn btn-primary btn-block btn-lg" onClick=${save}>${bill ? '儲存' : '建立'}</button>
    <//>`;
  }

  /**
   * PDF 清單：點一下預覽，可以下載。還沒審核完成的：給了 onRemove 就能移除，給了 onApprove 就有「審核完成」；
   * 審核完成的標出審核的人和時間，不能再移除。
   */
  function FileRows({ files, actions, onRemove, onApprove }) {
    return html`<ul class="file-list">
      ${files.map(f => html`<li class="doc" key=${f.id}>
        <button class="file-row" onClick=${() => actions.openPdf(f)}>
          <${Icon} name="file" />
          <span class="file-name">${f.name}</span>
          <span class="file-meta">${f.from ? `來自：${fromLabel(f.from)}｜` : ''}${docMeta(f)}</span>
        </button>
        <div class="doc-actions">
          ${f.approved && html`<${Approved} stamp=${f.approved} withWho />`}
          <button class="btn btn-outline sm" onClick=${() => PR.downloadFile(f, 'pdf', actions.toast)}><${Icon} name="download" size=${20} />下載</button>
          ${!f.approved && onRemove && html`<button class="btn btn-outline sm danger" onClick=${() => onRemove(f)}>移除</button>`}
          ${!f.approved && onApprove && html`<button class="btn btn-outline sm" onClick=${() => onApprove(f)}><${Icon} name="check" size=${20} />審核完成</button>`}
        </div>
      </li>`)}
    </ul>`;
  }

  // ---------- 一期請款的內容 ----------
  function BillingDetail({ bill, user, data, actions, onClose }) {
    const locked = !!bill.done;
    // 全部審核完成後鎖定：不能再上傳、整合、選擇檔案，也不能改日期；只有管理者可以解鎖
    const can = canBilling(user) && !locked;
    // 修改日期：第一期可以改開始日期；還沒有下一期時可以改結束日期；兩個都鎖住就不顯示按鈕
    const canEditDates = can && (!data.billing.some(b => b.no < bill.no) || !hasNextBill(data.billing, bill));
    // 審核：管理者、建築師事務所；按了「審核完成」的檔案就不能再改或移除
    const canApprove = canApproveBilling(user) && !locked;
    const [sheet, setSheet] = useState(null);
    const [printing, setPrinting] = useState(false);
    const gallery = galleryOf(bill);
    const itemN = billItems(bill).length;
    const printPhotos = async () => {
      setPrinting(true);
      try {
        actions.openPdf(await photosPdfFile(bill, user, bill.photos));
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
    /**
     * 一份文件按「審核完成」，按了就不能再改。
     * @param {'quotes'|'merged'|'docs'|'others'} key 哪一類
     * @param {{ id: string, name: string }} it 哪一份
     */
    const approve = (key, it) => {
      const stamp = { by: user.id, at: nowIso() };
      const patch = key === 'merged'
        ? { merged: { ...bill.merged, approved: stamp } }
        : { [key]: bill[key].map(x => (x.id === it.id ? { ...x, approved: stamp } : x)) };
      actions.updateBilling(bill.id, patch, `審核完成：${it.name}`);
    };
    /** 請款照片整區按一次「審核完成」，之後不能再選擇、移除或改名。按鈕排在照片下面，離「選擇照片」遠一點，免得誤按 */
    const approvePhotos = () => actions.updateBilling(bill.id, { photosApproved: { by: user.id, at: nowIso() } },
      `審核完成：請款照片 ${bill.photos.length} 張`);
    const complete = () => {
      actions.updateBilling(bill.id, { done: { by: user.id, at: nowIso() } }, '全部審核完成');
      actions.toast('已全部審核完成，這期已鎖定');
      setSheet(null);
    };
    const unlock = () => {
      actions.updateBilling(bill.id, { done: null }, '解鎖');
      actions.toast('已解鎖，可以再上傳新檔案');
    };
    const removeFile = (key, label) => f => actions.updateBilling(bill.id, { [key]: bill[key].filter(q => q.id !== f.id) }, `移除${label}「${f.name}」`);
    const approver = key => (canApprove ? f => approve(key, f) : null);
    /** 估價單、其他文件：標題旁邊是「上傳」，還沒審核完成的可以移除 */
    const uploadSec = (key, label) => html`<section class="sec bill-sec">
      <div class="sec-head">
        <h3 class="d-sec-title">${label} ${bill[key].length} 份</h3>
        ${can && html`<label class="btn btn-outline sm pick-inline">
          <input type="file" multiple accept="application/pdf,.pdf" onChange=${e => { addFiles(key, label, e.target.files); e.target.value = ''; }} />
          <${Icon} name="upload" size=${20} />上傳
        </label>`}
      </div>
      ${bill[key].length
        ? html`<${FileRows} files=${bill[key]} actions=${actions} onRemove=${can ? removeFile(key, label) : null} onApprove=${approver(key)} />`
        : html`<p class="muted">還沒有${label}</p>`}
    </section>`;
    // 「全部審核完成」：每個檔案都審核完成（而且至少有一個）才能按
    const doneBtn = html`<button class="btn btn-primary sm" disabled=${!allApproved(bill)} onClick=${() => setSheet('done')}>
      <${Icon} name="check" size=${20} />全部審核完成</button>`;
    const doneTip = itemN ? '每個檔案都審核完成後才能按' : '還沒有檔案';

    return html`<div class="d-detail">
      <div class="d-detail-head">
        <div class="card-top"><span class="chip">請款</span><span class="date">建立：${userById(bill.createdBy).name}｜${dt(bill.createdAt)}</span></div>
        <button class="icon-btn d-close" aria-label="關閉請款內容" onClick=${onClose}><${Icon} name="close" size=${28} /></button>
      </div>
      <h2 class="d-detail-title">${billingName(bill)}</h2>
      ${locked
        ? html`<div class="bill-lock">
            <span class="st st-pass"><${Icon} name="lock" size=${16} />全部審核完成</span>
            <span class="bill-lock-note">${userById(bill.done.by).name}｜${dt(bill.done.at)} 完成，已鎖定</span>
            ${isAdmin(user) && html`<button class="btn btn-outline sm" onClick=${unlock}><${Icon} name="unlock" size=${20} />解鎖</button>`}
          </div>`
        : (canEditDates || canApprove) && html`<div class="d-actions">
            ${canEditDates && html`<button class="btn btn-outline sm" onClick=${() => setSheet('edit')}><${Icon} name="pencil" size=${20} />修改日期</button>`}
            ${canApprove && (allApproved(bill)
              ? doneBtn
              : html`<span class="tip tip-start" tabIndex="0" data-tip=${doneTip} aria-label=${doneTip}>${doneBtn}</span>`)}
          </div>`}

      ${uploadSec('quotes', '估價單')}

      <section class="sec bill-sec">
        <div class="sec-head">
          <h3 class="d-sec-title">整合施工日誌</h3>
          ${can && !(bill.merged && bill.merged.approved) && html`<button class="btn btn-outline sm" onClick=${() => setSheet('merge')}>
            ${bill.merged ? '重新整合' : '整合施工日誌'}</button>`}
        </div>
        ${bill.merged
          ? html`<${FileRows} files=${[bill.merged]} actions=${actions} onApprove=${approver('merged')} />`
          : html`<p class="muted">還沒有整合</p>`}
      </section>

      <section class="sec bill-sec">
        <div class="sec-head">
          <h3 class="d-sec-title">請款照片 ${bill.photos.length} 張</h3>
          <div class="sec-tools">
            ${bill.photos.length > 0 && html`<button class="btn btn-outline sm" disabled=${printing} onClick=${printPhotos}>
              <${Icon} name="printer" size=${20} />${printing ? '產生中…' : '列印'}</button>`}
            ${can && !bill.photosApproved && html`<button class="btn btn-outline sm" onClick=${() => setSheet('photo')}>選擇照片</button>`}
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
        ${bill.photosApproved
          ? html`<div class="bill-photos-foot"><${Approved} stamp=${bill.photosApproved} withWho /></div>`
          : canApprove && bill.photos.length > 0 && html`<div class="bill-photos-foot">
              <button class="btn btn-outline sm" onClick=${approvePhotos}><${Icon} name="check" size=${20} />審核完成</button>
            </div>`}
      </section>

      <section class="sec bill-sec">
        <div class="sec-head">
          <h3 class="d-sec-title">書審及材料測試 ${bill.docs.length} 份</h3>
          ${can && html`<button class="btn btn-outline sm" onClick=${() => setSheet('pdf')}>編輯文件</button>`}
        </div>
        ${bill.docs.length
          ? html`<${FileRows} files=${bill.docs.map(docFileOf)} actions=${actions} onApprove=${approver('docs')} />`
          : html`<p class="muted">還沒有文件</p>`}
      </section>

      ${uploadSec('others', '其他文件')}

      ${sheet === 'edit' && html`<${BillingFormSheet} data=${data} bill=${bill} onClose=${() => setSheet(null)}
        onSave=${info => { actions.updateBilling(bill.id, info, `日期改成「${billingRange({ ...bill, ...info })}」`); setSheet(null); }} />`}
      ${sheet === 'merge' && html`<${MergeSheet} bill=${bill} data=${data} user=${user} actions=${actions} onClose=${() => setSheet(null)} />`}
      ${sheet === 'done' && html`<${Sheet} title="確定全部審核完成？" onClose=${() => setSheet(null)}>
        <p>「${billingName(bill)}」全部審核完成後就不能再上傳新檔案</p>
        <button class="btn btn-primary btn-block btn-lg" onClick=${complete}>確定全部審核完成</button>
      <//>`}
      ${(sheet === 'photo' || sheet === 'pdf') && html`<${EntrySheet} kind=${sheet} bill=${bill} data=${data} user=${user} actions=${actions}
        onClose=${() => setSheet(null)} />`}
    </div>`;
  }

  // ---------- 整合施工日誌 ----------
  function MergeSheet({ bill, data, user, actions, onClose }) {
    const [from, setFrom] = useState(bill.from);
    const [to, setTo] = useState(bill.to || today());
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
            <thead><tr><th>順序</th><th>日期</th><th>檔案夾</th><th>檔案</th><th>頁數</th></tr></thead>
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

  // ---------- 從已上傳的檔案夾挑照片或文件 ----------
  function Picker({ kind, bill, data, onPick }) {
    const isPhoto = kind === 'photo';
    const [inRange, setInRange] = useState(true);
    const [q, setQ] = useState('');
    const word = q.trim();
    // 照片和文件都可以從工地記錄、書審及材料測試挑；這期還沒填結束日期，就算到今天
    const to = bill.to || today();
    const recs = data.records
      .filter(r => (r.cat === 'site' || r.cat === 'review') && (isPhoto ? r.photos.length : r.pdfs.length))
      .filter(r => !inRange || (r.date >= bill.from && r.date <= to))
      .filter(r => !word || `${r.title} ${r.tags.join(' ')}`.includes(word))
      .sort(byDateDesc);
    return html`<div class="picker">
      <div class="picker-bar">
        <label class="switch-row">
          <input type="checkbox" checked=${inRange} onChange=${e => setInRange(e.target.checked)} />
          <span>只看這期的日期（${billingRange(bill)}）</span>
        </label>
        <div class="search">
          <${Icon} name="search" />
          <input type="search" aria-label="搜尋檔案夾" placeholder="搜尋檔案夾名稱、關鍵字" value=${q} onInput=${e => setQ(e.target.value)} />
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
  /**
   * 一筆是一張照片或一份文件，可以從檔案夾挑，也可以直接上傳。文件審核完成的那份不能再改或移除；
   * 照片是整區審核，審核完成後就打不開這裡。照片的預設名稱是「第6期請款照片-1」，照順序編號；文件的預設名稱是檔名。
   */
  function EntrySheet({ kind, bill, data, user, actions, onClose }) {
    const isPhoto = kind === 'photo';
    const autoPhoto = new RegExp(`^第${bill.no}期請款照片-\\d+$`);
    /** 還沒自己取名稱的照片（空白或還是預設名稱），名稱交給依順序編號 */
    const isAutoName = r => !r.name.trim() || autoPhoto.test(r.name.trim());
    /**
     * 照片的預設名稱照清單順序編號：第 2 筆就是「第N期請款照片-2」；自己取了名稱的不動。
     * @param {Object[]} list
     * @returns {Object[]}
     */
    const numbered = list => (isPhoto
      ? list.map((r, i) => (r.file && isAutoName(r) ? { ...r, name: `第${bill.no}期請款照片-${i + 1}` } : r))
      : list);
    const [rows, setRowsState] = useState(() => (isPhoto ? bill.photos : bill.docs).map(e => ({ ...e })));
    const [picking, setPicking] = useState(null);
    const [err, setErr] = useState('');
    // 換檔案、加減筆數時重新編號；打字改名稱時不編，免得清空重打時又被填回去
    const setRows = fn => setRowsState(rs => numbered(fn(rs)));
    const rename = (id, name) => setRowsState(rs => rs.map(r => (r.id === id ? { ...r, name } : r)));
    const setFile = (id, patch) => setRows(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)));
    const addRow = () => setRows(rs => [...rs, { id: uid(isPhoto ? 'bp' : 'bd'), name: '', file: null, from: null }]);
    /** 文件換檔案時的名稱：自己打的保留；空白或還是原本的檔名，才換成新的檔名（照片的名稱交給編號） */
    const nameFor = (row, file) => (isPhoto || (row.name && (!row.file || row.name !== row.file.name)) ? row.name : file.name);
    const upload = async (row, files) => {
      const [it] = await PR.readFiles(files, kind, { room: 1, toast: actions.toast });
      if (!it) return;
      const file = isPhoto ? toPhoto(it) : toPdf(it, user.id, nowIso());
      setFile(row.id, { file, from: null, name: nameFor(row, file) });
    };
    const pick = (row, rec, file) => {
      setFile(row.id, { file: { ...file }, from: { recId: rec.id, title: rec.title, date: rec.date }, name: nameFor(row, file) });
      setPicking(null);
    };
    const save = () => {
      if (rows.some(r => !r.file)) { setErr(isPhoto ? '每一筆都要選照片' : '每一筆都要選文件'); return; }
      const list = numbered(rows).map(r => ({ ...r, name: r.name.trim() || r.file.name }));
      actions.updateBilling(bill.id, { [isPhoto ? 'photos' : 'docs']: list },
        `${isPhoto ? '請款照片' : '書審及材料測試文件'}更新為 ${list.length} ${isPhoto ? '張' : '份'}`);
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
    return html`<${Sheet} title=${isPhoto ? '選擇請款照片' : '編輯書審及材料測試文件'} wide cls=${isPhoto ? 'two-thirds' : ''} onClose=${onClose}>
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
            ${r.approved
              ? html`<div class="entry-name">${r.name}</div>`
              : html`<input class="input" aria-label=${`第 ${i + 1} 筆的名稱`} placeholder=${isPhoto ? `第${bill.no}期請款照片-${i + 1}` : '文件名稱'}
                  value=${r.name} onInput=${e => rename(r.id, e.target.value)} />`}
            <div class="entry-src">${r.from ? `來自：${fromLabel(r.from)}` : r.file ? '直接上傳' : ''}</div>
            <div class="entry-actions">
              ${r.approved
                ? html`<${Approved} stamp=${r.approved} withWho />`
                : html`
                  ${isPhoto && pickBtn(r)}
                  <label class="btn btn-outline sm pick-inline">
                    <input type="file" accept=${isPhoto ? 'image/*' : 'application/pdf,.pdf'} onChange=${e => { upload(r, e.target.files); e.target.value = ''; }} />
                    <${Icon} name="upload" size=${20} />上傳
                  </label>
                  ${!isPhoto && pickBtn(r)}
                  <button class="btn btn-outline sm danger" onClick=${() => setRows(rs => rs.filter(x => x.id !== r.id))}>移除</button>`}
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
