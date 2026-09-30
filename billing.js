/* 阿美中會工地記錄平台 Demo：請款（獨立的資料，不跟檔案夾共用；一期一期的，沒有日期、大分類、子分類）
   每一期包含：估價單、整合施工日誌、請款照片、書審及材料測試、其他文件；名稱後面可以加備註。
   估價單、整合施工日誌、書審及材料測試、其他文件一份一份按「審核完成」，請款照片整區一次按（管理者、建築師事務所）；
   審核完成的才列在請款列表上，也不能再刪。都審核完成後才能按「全部審核完成」，之後這期不能再上傳或刪除，也才能新增下一期 */
(function () {
  'use strict';

  const PR = window.PR;
  if (!PR || PR.bootFailed) return;

  const { useState, useRef } = window.preactHooks;
  const {
    html, uid, fmtSize, nowIso, ymd, dt, userById, catById, billingName, isAdmin, canBilling, canApproveBilling,
    canDeleteBillingFile, canEditBillingNote, docMeta, byDateDesc, toPhoto, toPdf, fromLabel, mergeDetail, Icon, Photo, Sheet, NoteEditor
  } = PR;

  /**
   * 日期區間內、勾了「施工日誌」的工地記錄文件，依日期排好（整合時照這個順序）。
   * @param {Object[]} records
   * @param {string} from YYYY-MM-DD
   * @param {string} to YYYY-MM-DD
   * @returns {Array<{ rec: Object, pdf: Object }>}
   */
  function diaryDocs(records, from, to) {
    const out = [];
    records
      .filter(r => r.cat === 'site' && r.date >= from && r.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date) || new Date(a.uploadedAt) - new Date(b.uploadedAt))
      .forEach(r => r.pdfs.filter(p => p.diary).forEach(p => out.push({ rec: r, pdf: p })));
    return out;
  }

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

  /**
   * 請款照片的預設名稱照清單順序重新編號：「第6期請款照片-1」起；還沒自己取名稱的
   * （空白或還是「第N期請款照片-數字」）才編，自己取的不動。
   * @param {Object} bill
   * @param {Object[]} list
   * @returns {Object[]}
   */
  function numberPhotos(bill, list) {
    const auto = new RegExp(`^第${bill.no}期請款照片-\\d+$`);
    return list.map((e, i) => (!e.name.trim() || auto.test(e.name.trim()) ? { ...e, name: `第${bill.no}期請款照片-${i + 1}` } : e));
  }

  /**
   * 把請款照片排成 A4 一頁三張的 PDF，當成一份檔案（可以預覽、下載、列印）。
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
   * 審核完成的按鈕或標示：審核完成就顯示審核的人和時間；還沒審核而且有權限，就是「審核完成」按鈕；都不是就沒有。
   * @param {?{ by: string, at: string }} stamp
   * @param {?Function} onApprove
   * @returns {?Object}
   */
  const approvalOf = (stamp, onApprove) => {
    if (stamp) return html`<${Approved} stamp=${stamp} withWho />`;
    if (!onApprove) return null;
    return html`<button class="btn btn-outline sm" onClick=${onApprove}><${Icon} name="check" size=${20} />審核完成</button>`;
  };

  /**
   * 文件的最後一行：「審核完成」靠左、「下載」靠右。刪除是名稱那一行右邊的 X，離「審核完成」遠一點，免得誤按。
   * @param {{ stamp: ?Object, onApprove: ?Function, onDownload: Function }} props
   */
  const DocFoot = ({ stamp, onApprove, onDownload }) => html`<div class="doc-foot">
    ${approvalOf(stamp, onApprove)}
    <button class="btn btn-outline sm doc-dl" onClick=${onDownload}><${Icon} name="download" size=${20} />下載</button>
  </div>`;

  /**
   * 刪除一筆的 X：跟檔案夾修改時文件列的 X 一樣，排在名稱右邊。
   * @param {{ name: string, onClick: Function }} props
   */
  const RemoveBtn = ({ name, onClick }) => html`<button class="icon-btn file-remove" aria-label=${'刪除 ' + name} onClick=${onClick}>
    <${Icon} name="close" /></button>`;

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

  /**
   * 請款名稱後面的備註：跟工地記錄子分類的備註一樣，鉛筆在備註左邊，按了原地換成輸入框，「儲存」「取消」在右邊。
   * 管理者、建築師事務所、承包商都能改，全部審核完成後也能改。放在可點選的列裡面時，點這一塊不會順便打開側窗。
   * @param {object} props
   * @param {object} props.bill
   * @param {object} props.user
   * @param {object} props.actions
   * @param {boolean} props.editing 這一期的備註是不是正在改
   * @param {(on: boolean) => void} props.onEdit 開始／結束編輯
   */
  function BillingNote({ bill, user, actions, editing, onEdit }) {
    const stop = e => e.stopPropagation();
    if (editing) {
      return html`<div class="bill-note-edit" onClick=${stop}>
        <${NoteEditor} text0=${bill.note ? bill.note.text : ''} label="請款備註" placeholder="例如：這期的重點、還在等的文件"
          onSave=${text => { actions.setBillingNote(bill.id, text); onEdit(false); }} onCancel=${() => onEdit(false)} />
      </div>`;
    }
    const canEdit = canEditBillingNote(user);
    if (!bill.note && !canEdit) return null;
    return html`<span class="bill-note-line" onClick=${stop}>
      ${canEdit && html`<button class="icon-btn grp-edit" aria-label=${`編輯${billingName(bill)}的備註`}
        onClick=${() => onEdit(true)}><${Icon} name="pencil" size=${18} /></button>`}
      ${bill.note && html`<span class="bill-note" title=${bill.note.text}>${bill.note.text}</span>`}
    </span>`;
  }

  // ---------- 列表 ----------
  function BillingPage({ user, data, route, actions }) {
    const [adding, setAdding] = useState(false);
    // 正在改哪一期的備註、在列表還是側窗（同一時間只改一個）
    const [noteAt, setNoteAt] = useState(null);
    const noteProps = (id, where) => ({
      editing: !!noteAt && noteAt.id === id && noteAt.where === where,
      onEdit: on => setNoteAt(on ? { id, where } : null)
    });
    const list = [...data.billing].sort((a, b) => b.no - a.no);
    const sel = route.id && data.billing.find(b => b.id === route.id);
    const select = id => actions.replace('#/billing/' + id);
    // 列裡面的檔案按鈕、備註自己處理鍵盤，列只接自己身上的 Enter／空白鍵
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
                    <div class="bill-name">
                      <span class="bill-title">${billingName(b)}</span>
                      ${b.done && html`<span class="st st-pass sm">全部審核完成</span>`}
                      <${BillingNote} bill=${b} user=${user} actions=${actions} ...${noteProps(b.id, 'list')} />
                    </div>
                    <${BillFiles} bill=${b} user=${user} actions=${actions} />
                  </td>
                </tr>`)}
              </tbody>
            </table>`}
        </div>
      </section>
      ${sel && html`<aside class="d-detail-col" aria-label="請款內容">
        <${BillingDetail} key=${sel.id} bill=${sel} user=${user} data=${data} actions=${actions} note=${noteProps(sel.id, 'detail')}
          onClose=${() => actions.replace('#/billing')} />
      </aside>`}
      ${adding && html`<${NewBillingSheet} data=${data} onClose=${() => setAdding(false)}
        onSave=${info => { setAdding(false); select(actions.addBilling(info)); }} />`}
    </div>`;
  }

  // ---------- 新增一期請款：期數接著上一期，名稱自動產生（0929 起請款沒有日期） ----------
  function NewBillingSheet({ data, onClose, onSave }) {
    const last = latestBill(data.billing);
    const no = last ? last.no + 1 : 1;
    return html`<${Sheet} title="新增一期請款" onClose=${onClose}>
      <div class="field">
        <div class="field-label">請款名稱<span class="opt-tag">自動產生</span></div>
        <div class="readonly">${billingName({ no })}</div>
      </div>
      <button class="btn btn-primary btn-block btn-lg" onClick=${() => onSave({ no })}>建立</button>
    <//>`;
  }

  /**
   * 估價單、整合施工日誌、其他文件的清單：點檔名那一列預覽。還沒審核完成的：給了 onRemove，檔名右邊就有刪除的 X；
   * 給了 onApprove，最後一行左邊就有「審核完成」（右邊是「下載」）。審核完成後改成審核的人和時間，也不能再刪。
   * 這三種都是直接上傳（或整合出來）的檔案，沒有「來自哪個檔案夾」；整合施工日誌的 from／to 是整合用的日期區間，不是出處。
   */
  function FileRows({ files, actions, onRemove, onApprove }) {
    return html`<ul class="file-list">
      ${files.map(f => html`<li class="doc" key=${f.id}>
        <div class="doc-head">
          <button class="file-row" onClick=${() => actions.openPdf(f)}>
            <${Icon} name="file" />
            <span class="file-name">${f.name}</span>
            <span class="file-meta">${docMeta(f)}</span>
          </button>
          ${!f.approved && onRemove && html`<${RemoveBtn} name=${f.name} onClick=${() => onRemove(f)} />`}
        </div>
        <${DocFoot} stamp=${f.approved} onApprove=${onApprove ? () => onApprove(f) : null}
          onDownload=${() => PR.downloadFile(f, 'pdf', actions.toast)} />
      </li>`)}
    </ul>`;
  }

  /**
   * 名稱輸入框：離開輸入框或按 Enter 就存，按 Esc 放棄。清空時交給上層決定（照片變回預設名稱、文件變回檔名）。
   * @param {{ value: string, label: string, onCommit: (name: string) => void }} props
   */
  function NameInput({ value, label, onCommit }) {
    const [text, setText] = useState(value);
    const skip = useRef(false);
    const commit = () => {
      if (skip.current) { skip.current = false; setText(value); return; }
      if (text.trim() !== value) onCommit(text);
    };
    return html`<input class="input" aria-label=${label} value=${text} onInput=${e => setText(e.target.value)} onBlur=${commit}
      onKeyDown=${e => {
        if (e.key === 'Enter') e.target.blur();
        if (e.key === 'Escape') { skip.current = true; e.target.blur(); }
      }} />`;
  }

  /**
   * 請款照片、書審及材料測試的一筆：左邊是照片縮圖或文件圖示（點了預覽）。右邊第一行是名稱，刪除的 X 在名稱右邊
   * （跟檔案夾修改時的文件列一樣）；第二行是來源，文件的名稱跟檔案本身的名稱不一樣時，後面補上檔名；
   * 文件還有最後一行：「審核完成」靠左、「下載」靠右。沒給 onRename 時名稱只能看。
   */
  function EntryRow({ kind, entry, index, onOpen, onRename, onRemove, onDownload, stamp, onApprove }) {
    const isPhoto = kind === 'photo';
    const fileNote = !isPhoto && entry.file.name !== entry.name ? `｜檔案：${entry.file.name}` : '';
    return html`<li class=${'entry' + (isPhoto ? '' : ' doc-entry')}>
      <span class="entry-no">${index + 1}</span>
      <div class="entry-file">
        ${isPhoto
          ? html`<button class="entry-thumb" aria-label=${'看 ' + entry.name} onClick=${onOpen}><${Photo} p=${entry.file} bare /></button>`
          : html`<button class="entry-doc" aria-label=${'預覽 ' + entry.name} onClick=${onOpen}><${Icon} name="file" /></button>`}
      </div>
      <div class="entry-main">
        <div class="entry-name-line">
          ${onRename
            ? html`<${NameInput} key=${entry.id + ':' + entry.name} value=${entry.name} label=${`第 ${index + 1} 筆的名稱`} onCommit=${onRename} />`
            : html`<div class="entry-name">${entry.name}</div>`}
          ${onRemove && html`<${RemoveBtn} name=${entry.name} onClick=${onRemove} />`}
        </div>
        <div class="entry-src">${entry.from ? `來自：${fromLabel(entry.from)}` : '直接上傳'}${fileNote}</div>
        ${!isPhoto && html`<${DocFoot} stamp=${stamp} onApprove=${onApprove} onDownload=${onDownload} />`}
      </div>
    </li>`;
  }

  /** 按「新增一筆」後先出現的空白一筆：先「從已上傳的…挑」再「上傳」，選好檔案才真的加進去 */
  function PendingRow({ kind, index, onPick, onUpload, onCancel }) {
    const isPhoto = kind === 'photo';
    return html`<li class=${'entry pending' + (isPhoto ? '' : ' doc-entry')}>
      <span class="entry-no">${index + 1}</span>
      <div class="entry-file">
        ${isPhoto
          ? html`<div class="entry-thumb"><span>未選照片</span></div>`
          : html`<div class="entry-doc"><${Icon} name="file" /></div>`}
      </div>
      <div class="entry-main">
        <div class="entry-actions">
          <button class="btn btn-outline sm" onClick=${onPick}>${isPhoto ? '從已上傳的照片挑' : '從已上傳的文件挑'}</button>
          <label class="btn btn-outline sm pick-inline">
            <input type="file" accept=${isPhoto ? 'image/*' : 'application/pdf,.pdf'} onChange=${e => { onUpload(e.target.files); e.target.value = ''; }} />
            <${Icon} name="upload" size=${20} />上傳
          </label>
          <button class="btn btn-outline sm" onClick=${onCancel}>取消</button>
        </div>
      </div>
    </li>`;
  }

  // ---------- 一期請款的內容 ----------
  const ENTRY_LABEL = { photos: '請款照片', docs: '書審及材料測試文件' };

  function BillingDetail({ bill, user, data, actions, note, onClose }) {
    const locked = !!bill.done;
    // 全部審核完成後鎖定：不能再上傳、整合、新增、改名、刪除；只有管理者可以解鎖
    const can = canBilling(user) && !locked;
    // 審核：管理者、建築師事務所
    const canApprove = canApproveBilling(user) && !locked;
    // 刪除還沒審核完成的：管理者、建築師事務所、承包商
    const canRemove = canDeleteBillingFile(user) && !locked;
    const photosDone = !!bill.photosApproved;
    const [sheet, setSheet] = useState(null);
    // 按了「新增一筆」、還沒選好檔案的是哪一區；正在從哪一區挑已上傳的檔案
    const [adding, setAdding] = useState(null);
    const [picking, setPicking] = useState(null);
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
     * 一份文件按「審核完成」，按了就不能再改、不能刪。
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
    /** 請款照片整區按一次「審核完成」，之後不能再新增、改名或刪除。按鈕排在照片下面、靠左（跟文件的一樣），不跟「新增一筆」並排，免得誤按 */
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
    const removeFile = (key, label) => f => actions.updateBilling(bill.id, { [key]: bill[key].filter(q => q.id !== f.id) }, `刪除${label}「${f.name}」`);
    const removeMerged = () => actions.updateBilling(bill.id, { merged: null }, `刪除整合施工日誌「${bill.merged.name}」`);
    // 刪除前先問一次（主人 09/30 決定）：直接上傳的刪了就救不回來；從檔案夾挑來的只從這期請款拿掉
    const [deleting, setDeleting] = useState(null);
    const askDelete = (name, picked, run) => setDeleting({ name, picked, run });
    const approver = key => (canApprove ? f => approve(key, f) : null);
    const photosAppr = approvalOf(bill.photosApproved, canApprove && bill.photos.length > 0 ? approvePhotos : null);

    /** 新增一筆：選好的照片或文件加到最後；照片的預設名稱照順序編號，文件的預設名稱是檔名 */
    const addEntry = (key, file, from) => {
      const entry = { id: uid(key === 'photos' ? 'bp' : 'bd'), name: key === 'photos' ? '' : file.name, file, from };
      const list = key === 'photos' ? numberPhotos(bill, [...bill.photos, entry]) : [...bill.docs, entry];
      actions.updateBilling(bill.id, { [key]: list }, `新增${ENTRY_LABEL[key]}：${list[list.length - 1].name}`);
      setAdding(null);
      setPicking(null);
    };
    const uploadEntry = async (key, files) => {
      const [it] = await PR.readFiles(files, key === 'photos' ? 'photo' : 'pdf', { room: 1, toast: actions.toast });
      if (it) addEntry(key, key === 'photos' ? toPhoto(it) : toPdf(it, user.id, nowIso()), null);
    };
    const pickEntry = (key, rec, file) => addEntry(key, { ...file }, { recId: rec.id, title: rec.title, date: rec.date });
    /** 改名稱：清空的話，照片變回預設名稱、文件變回檔名 */
    const renameEntry = (key, e) => name => {
      const t = name.trim();
      let list = bill[key].map(x => (x.id === e.id ? { ...x, name: t || (key === 'docs' ? x.file.name : '') } : x));
      if (key === 'photos') list = numberPhotos(bill, list);
      const after = list.find(x => x.id === e.id).name;
      if (after !== e.name) actions.updateBilling(bill.id, { [key]: list }, `${ENTRY_LABEL[key]}改名：${e.name} → ${after}`);
    };
    /** 刪除一筆（按了 X、確認之後）；照片刪掉後，預設名稱照新的順序重新編號 */
    const removeEntry = (key, e) => () => {
      const rest = bill[key].filter(x => x.id !== e.id);
      actions.updateBilling(bill.id, { [key]: key === 'photos' ? numberPhotos(bill, rest) : rest }, `刪除${ENTRY_LABEL[key]}「${e.name}」`);
    };
    /** 空白的那一筆和「新增一筆」按鈕 */
    const pendingRow = (key, n) => adding === key && html`<${PendingRow} kind=${key === 'photos' ? 'photo' : 'pdf'} index=${n}
      onPick=${() => setPicking(key)} onUpload=${files => uploadEntry(key, files)} onCancel=${() => setAdding(null)} />`;
    const addRowBtn = key => html`<button class="btn btn-outline btn-block" onClick=${() => setAdding(key)}><${Icon} name="plus" />新增一筆</button>`;

    /** 估價單、其他文件：標題旁邊是「上傳」，還沒審核完成的可以刪除 */
    const uploadSec = (key, label) => html`<section class="sec bill-sec">
      <div class="sec-head">
        <h3 class="d-sec-title">${label} ${bill[key].length} 份</h3>
        ${can && html`<label class="btn btn-outline sm pick-inline">
          <input type="file" multiple accept="application/pdf,.pdf" onChange=${e => { addFiles(key, label, e.target.files); e.target.value = ''; }} />
          <${Icon} name="upload" size=${20} />上傳
        </label>`}
      </div>
      ${bill[key].length
        ? html`<${FileRows} files=${bill[key]} actions=${actions}
            onRemove=${canRemove ? f => askDelete(f.name, false, () => removeFile(key, label)(f)) : null} onApprove=${approver(key)} />`
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
      <div class="bill-title-line">
        <h2 class="d-detail-title">${billingName(bill)}</h2>
        <${BillingNote} bill=${bill} user=${user} actions=${actions} editing=${note.editing} onEdit=${note.onEdit} />
      </div>
      ${locked
        ? html`<div class="bill-lock">
            <span class="st st-pass"><${Icon} name="lock" size=${16} />全部審核完成</span>
            <span class="bill-lock-note">${userById(bill.done.by).name}｜${dt(bill.done.at)} 完成，已鎖定</span>
            ${isAdmin(user) && html`<button class="btn btn-outline sm" onClick=${unlock}><${Icon} name="unlock" size=${20} />解鎖</button>`}
          </div>`
        : canApprove && html`<div class="d-actions">
            ${allApproved(bill) ? doneBtn : html`<span class="tip tip-start" tabIndex="0" data-tip=${doneTip} aria-label=${doneTip}>${doneBtn}</span>`}
          </div>`}

      ${uploadSec('quotes', '估價單')}

      <section class="sec bill-sec">
        <div class="sec-head">
          <h3 class="d-sec-title">整合施工日誌</h3>
          ${can && !(bill.merged && bill.merged.approved) && html`<button class="btn btn-outline sm" onClick=${() => setSheet('merge')}>
            ${bill.merged ? '重新整合' : '整合施工日誌'}</button>`}
        </div>
        ${bill.merged
          ? html`<${FileRows} files=${[bill.merged]} actions=${actions}
              onRemove=${canRemove ? () => askDelete(bill.merged.name, false, removeMerged) : null} onApprove=${approver('merged')} />`
          : html`<p class="muted">還沒有整合</p>`}
      </section>

      <section class="sec bill-sec">
        <div class="sec-head">
          <h3 class="d-sec-title">請款照片 ${bill.photos.length} 張</h3>
          ${bill.photos.length > 0 && html`<button class="btn btn-outline sm" disabled=${printing} onClick=${printPhotos}>
            <${Icon} name="printer" size=${20} />${printing ? '產生中…' : '列印'}</button>`}
        </div>
        ${bill.photos.length || adding === 'photos'
          ? html`<ol class="entry-list">
              ${bill.photos.map((e, i) => html`<${EntryRow} key=${e.id} kind="photo" entry=${e} index=${i}
                onOpen=${() => actions.openGallery(gallery, i)}
                onRename=${can && !photosDone ? renameEntry('photos', e) : null}
                onRemove=${canRemove && !photosDone ? () => askDelete(e.name, !!e.from, removeEntry('photos', e)) : null} />`)}
              ${pendingRow('photos', bill.photos.length)}
            </ol>`
          : html`<p class="muted">還沒有照片</p>`}
        ${can && !photosDone && adding !== 'photos' && addRowBtn('photos')}
        ${photosAppr && html`<div class="bill-photos-foot">${photosAppr}</div>`}
      </section>

      <section class="sec bill-sec">
        <div class="sec-head">
          <h3 class="d-sec-title">書審及材料測試 ${bill.docs.length} 份</h3>
        </div>
        ${bill.docs.length || adding === 'docs'
          ? html`<ol class="entry-list">
              ${bill.docs.map((e, i) => html`<${EntryRow} key=${e.id} kind="pdf" entry=${e} index=${i}
                onOpen=${() => actions.openPdf(docFileOf(e))}
                onDownload=${() => PR.downloadFile(docFileOf(e), 'pdf', actions.toast)}
                onRename=${can && !e.approved ? renameEntry('docs', e) : null}
                onRemove=${canRemove && !e.approved ? () => askDelete(e.name, !!e.from, removeEntry('docs', e)) : null}
                stamp=${e.approved} onApprove=${canApprove ? () => approve('docs', e) : null} />`)}
              ${pendingRow('docs', bill.docs.length)}
            </ol>`
          : html`<p class="muted">還沒有文件</p>`}
        ${can && adding !== 'docs' && addRowBtn('docs')}
      </section>

      ${uploadSec('others', '其他文件')}

      ${picking && html`<${Sheet} title=${picking === 'photos' ? '從已上傳的照片挑一張' : '從已上傳的文件挑一份'} wide onClose=${() => setPicking(null)}>
        <${Picker} kind=${picking === 'photos' ? 'photo' : 'pdf'} data=${data} onPick=${(rec, file) => pickEntry(picking, rec, file)} />
      <//>`}
      ${deleting && html`<${Sheet} title="確定刪除？" onClose=${() => setDeleting(null)}>
        <p>${deleting.picked
          ? `「${deleting.name}」只會從這期請款拿掉，檔案夾裡的原檔不會刪。`
          : `「${deleting.name}」刪除後就救不回來了。`}</p>
        <button class="btn btn-danger btn-block btn-lg" onClick=${() => { deleting.run(); actions.toast(`已刪除「${deleting.name}」`); setDeleting(null); }}>確定刪除</button>
        <button class="btn btn-outline btn-block" onClick=${() => setDeleting(null)}>取消</button>
      <//>`}
      ${sheet === 'merge' && html`<${MergeSheet} bill=${bill} data=${data} user=${user} actions=${actions} onClose=${() => setSheet(null)} />`}
      ${sheet === 'done' && html`<${Sheet} title="確定全部審核完成？" onClose=${() => setSheet(null)}>
        <p>「${billingName(bill)}」全部審核完成後就不能再上傳或刪除檔案</p>
        <button class="btn btn-primary btn-block btn-lg" onClick=${complete}>確定全部審核完成</button>
      <//>`}
    </div>`;
  }

  // ---------- 整合施工日誌：日期區間預設空白，兩個日期都填了才列出要整合的文件 ----------
  function MergeSheet({ bill, data, user, actions, onClose }) {
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [progress, setProgress] = useState(null);
    const ready = !!(from && to && from <= to);
    const docs = ready ? diaryDocs(data.records, from, to) : [];
    const pages = docs.reduce((n, d) => n + (d.pdf.pages || 1), 0);
    const run = async () => {
      setProgress({ done: 0, total: docs.length });
      try {
        const { blob, pages: n } = await PR.mergePdfs(docs.map(d => d.pdf), (done, total) => setProgress({ done, total }));
        const merged = {
          id: uid('m'), name: `第${bill.no}期整合施工日誌.pdf`, size: fmtSize(blob.size), pages: n, url: URL.createObjectURL(blob),
          from, to, sources: docs.map(d => d.pdf.id), uploaderId: user.id, uploadedAt: nowIso()
        };
        actions.updateBilling(bill.id, { merged }, mergeDetail(from, to, docs.length, n));
        actions.toast(`已整合成一份 PDF，共 ${n} 頁`);
        onClose();
      } catch (e) {
        actions.toast(e.message || '整合失敗，請再試一次');
        setProgress(null);
      }
    };
    let body;
    if (!from || !to) body = html`<div class="notice info">請選擇要整合的日期區間</div>`;
    else if (!ready) body = html`<div class="notice error">開始日期不能晚於結束日期</div>`;
    else if (!docs.length) body = html`<div class="notice info">這段期間沒有勾選施工日誌的文件</div>`;
    else {
      body = html`<table class="d-table d-static merge-table">
          <thead><tr><th>順序</th><th>日期</th><th>檔案夾</th><th>檔案</th><th>頁數</th></tr></thead>
          <tbody>
            ${docs.map((d, i) => html`<tr key=${d.pdf.id}>
              <td>${i + 1}</td><td class="c-nowrap">${ymd(d.rec.date)}</td><td>${d.rec.title}</td><td>${d.pdf.name}</td>
              <td class="c-nowrap">${d.pdf.pages || '—'}</td>
            </tr>`)}
          </tbody>
        </table>
        <div class="merge-sum">共 ${docs.length} 份、約 ${pages} 頁</div>`;
    }
    return html`<${Sheet} title="整合施工日誌" wide onClose=${progress ? () => {} : onClose}>
      <p class="muted">選好日期區間，區間內勾了「施工日誌」的文件會依日期順序合成一份新的 PDF。</p>
      <div class="date-range">
        <label class="dr-end"><span class="dr-label">從</span>
          <input type="date" class="input" aria-label="開始日期" value=${from} max=${to || undefined}
            onInput=${e => setFrom(e.target.value)} onChange=${e => setFrom(e.target.value)} />
        </label>
        <span class="dr-sep" aria-hidden="true">～</span>
        <label class="dr-end"><span class="dr-label">到</span>
          <input type="date" class="input" aria-label="結束日期" value=${to} min=${from || undefined}
            onInput=${e => setTo(e.target.value)} onChange=${e => setTo(e.target.value)} />
        </label>
      </div>
      ${body}
      ${progress && html`<div class="progress-num" role="status">整合中 ${progress.done} / ${progress.total}…</div>
        <div class="bar"><div style=${{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }}></div></div>`}
      <button class="btn btn-primary btn-block btn-lg" disabled=${!docs.length || !!progress} onClick=${run}>整合</button>
    <//>`;
  }

  // ---------- 從已上傳的檔案夾挑照片或文件 ----------
  function Picker({ kind, data, onPick }) {
    const isPhoto = kind === 'photo';
    const [q, setQ] = useState('');
    const word = q.trim();
    // 照片和文件都可以從工地記錄、書審及材料測試挑，新的排前面
    const recs = data.records
      .filter(r => (r.cat === 'site' || r.cat === 'review') && (isPhoto ? r.photos.length : r.pdfs.length))
      .filter(r => !word || `${r.title} ${r.tags.join(' ')}`.includes(word))
      .sort(byDateDesc);
    return html`<div class="picker">
      <div class="picker-bar">
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

  Object.assign(PR, { BillingPage });
})();
