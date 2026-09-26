/* 阿美中會工地記錄平台 Demo：檔案處理
   照片壓縮、讀拍攝時間與頁數、產生示意檔、單檔／打包下載、列印、合併施工日誌、照片列印 PDF */
(function () {
  'use strict';

  const PR = window.PR;
  if (!PR || PR.bootFailed) return;

  const { uid, fmtSize, ymd, photoName, MAX_PHOTOS, MAX_PDF_BYTES } = PR;

  const LIBS = {
    pdf: { url: 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js', global: 'PDFLib' },
    zip: { url: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', global: 'JSZip' }
  };
  const PRINT_EDGE = 2480; // A5 用 300dpi 列印時的長邊像素：壓縮到這個大小，印 A5 也清楚
  const JPEG_QUALITY = 0.85;
  const MAX_PAGE_SCAN_BYTES = 30 * 1024 * 1024; // 超過就不數頁數，避免手機記憶體吃緊
  const A4 = [595.28, 841.89];
  const FONT = "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif";

  const loading = {};
  /**
   * 需要時才載入 PDF／壓縮檔套件，手機一般瀏覽不用多下載。
   * @param {'pdf'|'zip'} name
   * @returns {Promise<any>} 套件的全域物件
   */
  function ensureLib(name) {
    const lib = LIBS[name];
    if (window[lib.global]) return Promise.resolve(window[lib.global]);
    if (!loading[name]) {
      loading[name] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = lib.url;
        s.onload = () => (window[lib.global] ? resolve(window[lib.global]) : reject(new Error('套件載入失敗，請重新整理再試')));
        s.onerror = () => { delete loading[name]; reject(new Error('需要網路連線才能使用這個功能')); };
        document.head.appendChild(s);
      });
    }
    return loading[name];
  }

  const canvasOf = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
  const toBlob = (c, type, q) => new Promise((resolve, reject) => c.toBlob(b => (b ? resolve(b) : reject(new Error('產生圖片失敗'))), type, q));
  const bytesOf = async blob => new Uint8Array(await blob.arrayBuffer());
  const safeName = s => String(s).replace(/[\\/:*?"<>|]/g, '_');
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  // ---------- 讀取選到的檔案 ----------
  async function readShotAt(file) {
    try {
      if (!window.exifr) return null;
      const tags = await window.exifr.parse(file, ['DateTimeOriginal', 'CreateDate']);
      const v = tags && (tags.DateTimeOriginal || tags.CreateDate);
      return v instanceof Date && !isNaN(v.getTime()) ? v.toISOString() : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * PDF 頁數：先直接數檔案裡的頁面物件；物件表有壓縮、數不到的，才載入 pdf-lib 讀。
   * @param {Blob} file
   * @returns {Promise<number|null>} 讀不到（例如加密或壞掉的檔案）回傳 null
   */
  async function countPdfPages(file) {
    if (file.size > MAX_PAGE_SCAN_BYTES) return null;
    try {
      const text = await file.text();
      const pages = (text.match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length;
      if (pages) return pages;
      const counts = (text.match(/\/Count\s+\d+/g) || []).map(s => Number(s.replace(/\D/g, '')));
      if (counts.length) return Math.max(...counts);
      const { PDFDocument } = await ensureLib('pdf');
      const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true, updateMetadata: false });
      return doc.getPageCount();
    } catch (e) {
      return null;
    }
  }

  /**
   * 壓縮照片：長邊縮到 2480px（A5、300dpi），轉成 JPEG。本來就夠小的 JPEG 不重壓。
   * 瀏覽器解不開的格式（例如電腦版 Chrome 的 HEIC）回傳 null，保留原檔。
   * @param {Blob} file
   * @returns {Promise<{ blob: Blob, width: number, height: number } | null>}
   */
  async function compressPhoto(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const scale = Math.min(1, PRINT_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      if (scale === 1 && file.type === 'image/jpeg') return { blob: file, width: w, height: h };
      const c = canvasOf(w, h);
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      return { blob: await toBlob(c, 'image/jpeg', JPEG_QUALITY), width: w, height: h };
    } catch (e) {
      return null;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /**
   * 讀取選到的檔案：分出照片與 PDF、擋掉不支援的格式與太大的 PDF，
   * 讀出照片的拍攝時間（壓縮前先讀，壓縮後的 JPEG 沒有這個資訊）、壓縮照片、數 PDF 頁數。
   * @param {FileList|File[]} fileList 選到的檔案
   * @param {'photo'|'pdf'|'auto'} kind 從哪個選檔按鈕進來；auto 表示兩種都收
   * @param {{ room: number, toast: (msg: string) => void, allowPdf?: boolean }} opts room 是還能再加幾張照片
   * @returns {Promise<Object[]>} 可以加進清單的項目
   */
  async function readFiles(fileList, kind, { room, toast, allowPdf = true }) {
    const files = Array.from(fileList || []);
    let wrongType = 0;
    let pdfBlocked = 0;
    let tooBig = 0;
    const photoFiles = [];
    const pdfFiles = [];
    files.forEach(f => {
      const isImg = f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png)$/i.test(f.name);
      const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
      if (isPdf && kind !== 'photo') {
        if (!allowPdf) pdfBlocked += 1;
        else if (f.size > MAX_PDF_BYTES) tooBig += 1;
        else pdfFiles.push(f);
        return;
      }
      if (isImg && kind !== 'pdf') { photoFiles.push(f); return; }
      wrongType += 1;
    });
    if (pdfBlocked) toast('阿美中會帳號只能上傳照片，不能上傳文件');
    else if (wrongType) toast('只能傳照片或 PDF，Word／Excel 請先轉成 PDF');
    if (tooBig) toast('PDF 單檔上限 50MB，請先壓縮或分冊');
    let keep = photoFiles;
    if (keep.length > room) {
      keep = keep.slice(0, Math.max(0, room));
      toast(`一次最多 ${MAX_PHOTOS} 張，已先加入前 ${keep.length} 張`);
    }
    return Promise.all([
      ...keep.map(async f => {
        const shotAt = await readShotAt(f);
        const c = await compressPhoto(f);
        const blob = c ? c.blob : f;
        const name = blob !== f ? f.name.replace(/\.[^.]+$/, '') + '.jpg' : f.name;
        return {
          id: uid('f'), kind: 'photo', name, label: f.name, url: URL.createObjectURL(blob), shotAt, tone: '#e5e5e5',
          before: f.size, after: blob.size
        };
      }),
      ...pdfFiles.map(async f => ({
        id: uid('f'), kind: 'pdf', name: f.name, size: fmtSize(f.size), pages: await countPdfPages(f), url: URL.createObjectURL(f)
      }))
    ]);
  }

  // ---------- 示意檔（Demo 假資料沒有實際檔案，下載、列印、合併時當場畫一份） ----------
  function wrapLines(g, text, maxWidth) {
    const lines = [];
    let line = '';
    [...text].forEach(ch => {
      if (g.measureText(line + ch).width > maxWidth && line) { lines.push(line); line = ch; }
      else line += ch;
    });
    if (line) lines.push(line);
    return lines;
  }

  /**
   * 把文字畫成 PNG（PDF 內建字型沒有中文，中文一律畫成圖再放進 PDF）。
   * @param {Array<string|{text: string, size?: number, weight?: number, color?: string}>} rows
   * @param {{ width: number, size?: number, color?: string, weight?: number }} opts width 是圖片寬度（像素）
   * @returns {Promise<Uint8Array>}
   */
  async function textPng(rows, { width, size = 28, color = '#0f172a', weight = 400 }) {
    const measure = canvasOf(1, 1).getContext('2d');
    const lines = [];
    rows.filter(Boolean).forEach(r => {
      const row = typeof r === 'string' ? { text: r } : r;
      const s = row.size || size;
      measure.font = `${row.weight || weight} ${s}px ${FONT}`;
      wrapLines(measure, row.text, width).forEach(t => lines.push({ t, s, w: row.weight || weight, c: row.color || color }));
    });
    const lh = s => Math.round(s * 1.45);
    const c = canvasOf(width, Math.max(1, lines.reduce((n, l) => n + lh(l.s), 0)));
    const g = c.getContext('2d');
    let y = 0;
    lines.forEach(l => {
      g.font = `${l.w} ${l.s}px ${FONT}`;
      g.fillStyle = l.c;
      g.textBaseline = 'top';
      g.fillText(l.t, 0, y + (lh(l.s) - l.s) / 2);
      y += lh(l.s);
    });
    return bytesOf(await toBlob(c, 'image/png'));
  }

  function placeholderPhoto(p) {
    const c = canvasOf(1600, 1200);
    const g = c.getContext('2d');
    g.fillStyle = p.tone || '#e2e8f0';
    g.fillRect(0, 0, 1600, 1200);
    g.fillStyle = '#475569';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 96px ${FONT}`;
    g.fillText(p.label, 800, 560);
    g.font = `400 40px ${FONT}`;
    g.fillText('Demo 示意照片', 800, 690);
    return toBlob(c, 'image/jpeg', JPEG_QUALITY);
  }

  /** 畫一份示意 PDF：標題、說明與灰色文字線，頁碼照原檔 */
  async function placeholderPdf(f, maxPages) {
    const { PDFDocument, rgb, StandardFonts } = await ensureLib('pdf');
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const total = f.pages || 1;
    const n = Math.min(total, maxPages);
    const title = await doc.embedPng(await textPng([{ text: f.name.replace(/\.pdf$/i, ''), size: 40, weight: 700 }], { width: 1000 }));
    const note = await doc.embedPng(await textPng([{
      text: total > n ? `Demo 示意檔：原檔共 ${total} 頁，這裡只放前 ${n} 頁` : 'Demo 示意檔',
      size: 26, color: '#92400e'
    }], { width: 1000 }));
    const widths = [92, 78, 85, 64, 90, 72, 48, 81, 67, 88, 70, 83, 59, 76];
    for (let i = 0; i < n; i++) {
      const page = doc.addPage(A4);
      const t = title.scale(0.5);
      const nt = note.scale(0.5);
      page.drawImage(title, { x: 48, y: 790 - t.height, width: t.width, height: t.height });
      page.drawImage(note, { x: 48, y: 780 - t.height - nt.height, width: nt.width, height: nt.height });
      widths.forEach((w, k) => page.drawRectangle({ x: 48, y: 690 - k * 26, width: 499 * w / 100, height: 9, color: rgb(0.886, 0.91, 0.941) }));
      page.drawText(`${i + 1} / ${total}`, { x: 510, y: 36, size: 10, font, color: rgb(0.39, 0.45, 0.55) });
    }
    return new Blob([await doc.save()], { type: 'application/pdf' });
  }

  /**
   * 取得檔案內容：這次選進來的檔案直接讀；Demo 假資料當場畫一份示意檔。
   * @param {Object} file 照片或文件
   * @param {'photo'|'pdf'} kind
   * @param {{ maxPages?: number }} [opts] 示意 PDF 最多畫幾頁
   * @returns {Promise<Blob>}
   */
  async function fileBlob(file, kind, opts = {}) {
    if (file.url) return (await fetch(file.url)).blob();
    return kind === 'photo' ? placeholderPhoto(file) : placeholderPdf(file, opts.maxPages || 3);
  }

  /** 照片轉成 JPEG 位元組（放進 PDF 用）；解不開的格式畫一張「這張無法預覽」 */
  async function photoJpeg(p) {
    const blob = await fileBlob(p, 'photo');
    if (blob.type === 'image/jpeg') return bytesOf(blob);
    const c = await compressPhoto(blob);
    return bytesOf(c ? c.blob : await placeholderPhoto({ ...p, label: '這張無法預覽' }));
  }

  // ---------- 下載 ----------
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  /** 下載單一照片或 PDF */
  async function downloadFile(file, kind, toast) {
    try {
      downloadBlob(await fileBlob(file, kind), kind === 'photo' ? photoName(file) : file.name);
    } catch (e) {
      toast(e.message || '下載失敗，請再試一次');
    }
  }

  function uniquePath(path, used) {
    const slash = path.lastIndexOf('/');
    const dot = path.lastIndexOf('.');
    const base = dot > slash ? path.slice(0, dot) : path;
    const ext = dot > slash ? path.slice(dot) : '';
    let p = path;
    let n = 2;
    while (used.has(p)) p = `${base}（${n++}）${ext}`;
    used.add(p);
    return p;
  }

  /**
   * 把多個檔案打包成一個 zip 下載。
   * @param {Array<{ folder?: string, file: Object, kind: 'photo'|'pdf' }>} items folder 是 zip 裡的資料夾名稱，不給就放最外層
   * @param {string} zipName
   * @param {(done: number, total: number) => void} [onProgress]
   */
  async function downloadZip(items, zipName, onProgress) {
    const JSZip = await ensureLib('zip');
    const zip = new JSZip();
    const used = new Set();
    for (let i = 0; i < items.length; i++) {
      if (onProgress) onProgress(i, items.length);
      const { folder, file, kind } = items[i];
      const name = safeName(kind === 'photo' ? photoName(file) : file.name);
      zip.file(uniquePath(folder ? `${safeName(folder)}/${name}` : name, used), await fileBlob(file, kind));
    }
    if (onProgress) onProgress(items.length, items.length);
    downloadBlob(await zip.generateAsync({ type: 'blob' }), zipName);
  }

  // ---------- 列印 ----------
  /**
   * 列印照片或 PDF：放進看不見的 iframe 叫出瀏覽器的列印視窗；叫不出來就另開分頁讓使用者自己印。
   * @param {Object} file
   * @param {'photo'|'pdf'} kind
   * @param {string} caption 照片下方的說明文字
   * @param {(msg: string) => void} toast
   */
  async function printFile(file, kind, caption, toast) {
    try {
      const blob = await fileBlob(file, kind, { maxPages: 30 });
      const url = URL.createObjectURL(blob);
      const frame = document.createElement('iframe');
      frame.className = 'print-frame';
      frame.setAttribute('aria-hidden', 'true');
      const run = () => {
        try {
          frame.contentWindow.focus();
          frame.contentWindow.print();
        } catch (e) {
          window.open(url, '_blank');
        }
        setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 60000);
      };
      if (kind === 'photo') {
        frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>
          @page { size: A4; margin: 12mm; } html, body { margin: 0; }
          body { font-family: ${FONT}; text-align: center; color: #334155; }
          img { max-width: 100%; max-height: 250mm; } p { margin: 6mm 0 0; font-size: 12pt; }
          </style></head><body><img src="${url}" alt=""><p>${esc(caption)}</p></body></html>`;
        frame.onload = () => {
          const img = frame.contentDocument.querySelector('img');
          if (img.complete) run();
          else { img.onload = run; img.onerror = run; }
        };
      } else {
        frame.src = url;
        frame.onload = () => setTimeout(run, 300); // PDF 檢視器載入需要一點時間
      }
      document.body.appendChild(frame);
    } catch (e) {
      toast(e.message || '列印失敗，請再試一次');
    }
  }

  // ---------- 請款用：合併施工日誌、照片列印 PDF ----------
  /**
   * 依順序把多份 PDF 合成一份。讀不到內容的那份會放一頁說明，不會整個失敗。
   * @param {Object[]} files 依日期排好的施工日誌
   * @param {(done: number, total: number) => void} [onProgress]
   * @returns {Promise<{ blob: Blob, pages: number }>}
   */
  async function mergePdfs(files, onProgress) {
    const { PDFDocument } = await ensureLib('pdf');
    const out = await PDFDocument.create();
    for (let i = 0; i < files.length; i++) {
      if (onProgress) onProgress(i, files.length);
      const f = files[i];
      let src;
      try {
        src = await PDFDocument.load(await (await fileBlob(f, 'pdf', { maxPages: 200 })).arrayBuffer(), { ignoreEncryption: true });
      } catch (e) {
        src = await PDFDocument.load(await (await placeholderPdf({ ...f, name: `${f.name}（這份讀不到內容）`, pages: 1 }, 1)).arrayBuffer());
      }
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach(p => out.addPage(p));
    }
    if (onProgress) onProgress(files.length, files.length);
    const bytes = await out.save();
    return { blob: new Blob([bytes], { type: 'application/pdf' }), pages: out.getPageCount() };
  }

  /**
   * 請款的記錄照片列印：A4 一頁兩張，照片下面印名稱與來源。
   * @param {string} title 請款項目名稱
   * @param {Array<{ name: string, file: Object, from?: Object }>} entries
   * @returns {Promise<{ blob: Blob, pages: number }>}
   */
  async function photosPdf(title, entries) {
    const { PDFDocument, rgb, StandardFonts } = await ensureLib('pdf');
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pages = Math.ceil(entries.length / 2);
    const head = await doc.embedPng(await textPng([{ text: `${title}｜記錄照片`, size: 26, color: '#475569' }], { width: 1030 }));
    const boxW = 515;
    const boxH = 300;
    for (let pi = 0; pi < pages; pi++) {
      const page = doc.addPage(A4);
      const hd = head.scale(0.5);
      page.drawImage(head, { x: 40, y: 806 - hd.height, width: hd.width, height: hd.height });
      page.drawText(`${pi + 1} / ${pages}`, { x: 520, y: 28, size: 10, font, color: rgb(0.39, 0.45, 0.55) });
      for (let k = 0; k < 2; k++) {
        const e = entries[pi * 2 + k];
        if (!e) break;
        const top = 772 - k * 372;
        const img = await doc.embedJpg(await photoJpeg(e.file));
        const s = Math.min(boxW / img.width, boxH / img.height);
        const w = img.width * s;
        const h = img.height * s;
        page.drawImage(img, { x: 40 + (boxW - w) / 2, y: top - boxH + (boxH - h) / 2, width: w, height: h });
        const cap = await doc.embedPng(await textPng([
          { text: e.name, size: 30, weight: 700 },
          e.from ? { text: `來自：${ymd(e.from.date)} ${e.from.title}`, size: 24, color: '#475569' } : null
        ], { width: 1030 }));
        const cp = cap.scale(0.5);
        page.drawImage(cap, { x: 40, y: top - boxH - 10 - cp.height, width: cp.width, height: cp.height });
      }
    }
    return { blob: new Blob([await doc.save()], { type: 'application/pdf' }), pages };
  }

  Object.assign(PR, {
    ensureLib, readFiles, countPdfPages, compressPhoto, fileBlob, downloadBlob, downloadFile, downloadZip, printFile, mergePdfs, photosPdf
  });
})();
