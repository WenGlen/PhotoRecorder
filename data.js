/* 阿美中會工地紀錄平台 Demo：以下資料全部為虛構，只用來展示畫面 */
window.DEMO = (() => {
  // Demo 的「現在時間」固定，讓「還可以修改幾天」每次看都一樣
  const NOW = '2026-09-24T18:00:00+08:00';

  // 示意照片的底色（Tailwind 預設色票的淺中性色，避免深淺差太大顯得雜亂）
  const TONES = ['#e2e8f0', '#cbd5e1', '#e7e5e4', '#d6d3d1', '#e4e4e7', '#d1d5db'];

  const pad = n => String(n).padStart(2, '0');
  const hash = s => [...s].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);

  function photos(key, label, count, date, start, stepMin) {
    const [hh, mm] = start.split(':').map(Number);
    const base = new Date(`${date}T${pad(hh)}:${pad(mm)}:00+08:00`).getTime();
    const seed = hash(key);
    return Array.from({ length: count }, (_, i) => ({
      id: `${key}-p${i + 1}`,
      label: `${label} ${pad(i + 1)}`,
      shotAt: new Date(base + i * stepMin * 60000).toISOString(),
      tone: TONES[(seed + i * 5) % TONES.length]
    }));
  }

  // Gmail 用 example.com 示意，避免對到真實信箱
  const users = [
    { id: 'u1', name: '陳桂芳', email: 'chen.gf@example.com', role: 'admin', disabled: false },
    { id: 'u2', name: '王建宏', email: 'wang.jh@example.com', role: 'contractor', disabled: false },
    { id: 'u3', name: '林雅婷', email: 'lin.yt@example.com', role: 'architect', disabled: false },
    { id: 'u4', name: '張志明', email: 'chang.cm@example.com', role: 'submitter', disabled: false },
    { id: 'u5', name: '李秀英', email: 'lee.sy@example.com', role: 'viewer', disabled: false },
    // 已離場的前工地主任：示範「帳號只停用不刪除，以前傳的資料仍看得到是誰傳的」
    { id: 'u6', name: '吳俊賢', email: 'wu.jx@example.com', role: 'contractor', disabled: true }
  ];
  const roleOf = id => users.find(u => u.id === id).role;

  const pdf = (name, size, pages, extra) => Object.assign({ name, size, pages }, extra);
  // 上傳者的身分記在紀錄上；每份文件各自記上傳者與時間（書審文件會被別人更新），沒寫就跟紀錄一樣
  function rec(o) {
    const r = Object.assign({ photos: [], pdfs: [], tags: [], note: '' }, o);
    r.role = roleOf(r.uploaderId);
    r.pdfs = r.pdfs.map((p, i) => Object.assign({ id: `${r.id}-d${i + 1}`, uploaderId: r.uploaderId, uploadedAt: r.uploadedAt }, p));
    return r;
  }

  // roles：只有這些身分能選這個分類；sub：有子分類；status：有書審狀態
  const categories = [
    { id: 'basic', name: '案件基本資料建檔', short: '基本資料', roles: ['admin', 'architect'], desc: '契約、建照、設計圖說' },
    { id: 'event', name: '活動紀錄', short: '活動', desc: '動土、上樑等典禮' },
    { id: 'site', name: '工地紀錄', short: '工地', desc: '施工照片、施工日誌' },
    { id: 'review', name: '文件書審', short: '文件書審', roles: ['admin', 'submitter'], sub: true, status: true, desc: '施工計畫、材料送審等，由建築師事務所審查' },
    { id: 'test', name: '材料測試報告', short: '材料測試報告', sub: true, desc: '鋼筋拉力、混凝土抗壓等試驗報告' },
    { id: 'billing', name: '請款紀錄', short: '請款', desc: '請款單、日報、材料證明' },
    { id: 'other', name: '其它', short: '其它', desc: '臨時交辦、未分類備忘' }
  ];

  // 文件書審與材料測試報告共用的子分類；「外牆」目前沒有資料，列表不會出現這一段
  const subcats = [
    { id: 'sc1', name: '施工計畫' },
    { id: 'sc2', name: '鋼筋' },
    { id: 'sc3', name: '混凝土' },
    { id: 'sc4', name: '防水' },
    { id: 'sc5', name: '電梯' },
    { id: 'sc6', name: '外牆' }
  ];

  const records = [
    // 案件基本資料（只有管理者、建築師事務所能傳）
    rec({ id: 'r01', cat: 'basic', date: '2026-01-08', title: '建造執照', uploaderId: 'u1', uploadedAt: '2026-02-21T10:12:00+08:00', tags: ['建照', '法規'], pdfs: [pdf('建造執照-115建字第0038號.pdf', '2.1MB', 3)] }),
    rec({ id: 'r02', cat: 'basic', date: '2026-02-20', title: '工程承攬契約', uploaderId: 'u1', uploadedAt: '2026-02-21T10:20:00+08:00', tags: ['契約', '工期'], pdfs: [pdf('工程承攬契約書.pdf', '8.7MB', 46)] }),
    rec({ id: 'r03', cat: 'basic', date: '2026-02-01', title: '建築設計圖說（核定版）', uploaderId: 'u3', uploadedAt: '2026-02-21T10:35:00+08:00', tags: ['圖說', '結構', '電梯'], pdfs: [pdf('建築設計圖說-核定版.pdf', '31.4MB', 88)] }),

    // 活動紀錄
    rec({ id: 'r04', cat: 'event', date: '2026-03-15', title: '動土典禮', uploaderId: 'u1', uploadedAt: '2026-03-15T20:41:00+08:00', tags: ['典禮', '動土'], note: '感謝各教會弟兄姊妹出席', photos: photos('r04', '動土', 23, '2026-03-15', '09:30', 4) }),
    rec({ id: 'r05', cat: 'event', date: '2026-03-16', title: '動土典禮紀要', uploaderId: 'u1', uploadedAt: '2026-03-17T09:05:00+08:00', tags: ['典禮', '會議紀錄'], pdfs: [pdf('動土典禮紀要.pdf', '1.2MB', 4)] }),

    // 工地紀錄
    rec({ id: 'r06', cat: 'site', date: '2026-03-28', title: '放樣', uploaderId: 'u6', uploadedAt: '2026-03-28T17:30:00+08:00', tags: ['放樣', '測量'], photos: photos('r06', '放樣', 8, '2026-03-28', '08:40', 25) }),
    rec({ id: 'r07', cat: 'site', date: '2026-04-10', title: '基地開挖', uploaderId: 'u6', uploadedAt: '2026-04-10T18:02:00+08:00', tags: ['開挖', '擋土', '安全衛生'], photos: photos('r07', '開挖', 15, '2026-04-10', '08:10', 30) }),
    rec({ id: 'r08', cat: 'site', date: '2026-05-06', title: '基礎鋼筋查驗', uploaderId: 'u3', uploadedAt: '2026-05-06T16:10:00+08:00', tags: ['鋼筋', '查驗', '基礎'], note: '監造查驗，箍筋間距符合圖說', photos: photos('r08', '基礎鋼筋', 12, '2026-05-06', '10:05', 6) }),
    rec({ id: 'r09', cat: 'site', date: '2026-05-12', title: '基礎灌漿', uploaderId: 'u2', uploadedAt: '2026-05-12T19:22:00+08:00', tags: ['灌漿', '混凝土', '基礎'], photos: photos('r09', '基礎灌漿', 18, '2026-05-12', '07:50', 35) }),
    rec({ id: 'r10', cat: 'site', date: '2026-07-08', title: '一樓版灌漿', uploaderId: 'u2', uploadedAt: '2026-07-08T18:47:00+08:00', tags: ['灌漿', '混凝土', '一樓'], photos: photos('r10', '一樓灌漿', 21, '2026-07-08', '08:00', 28) }),
    rec({ id: 'r11', cat: 'site', date: '2026-08-19', title: '二樓版灌漿', uploaderId: 'u2', uploadedAt: '2026-08-19T18:15:00+08:00', tags: ['灌漿', '混凝土', '二樓'], photos: photos('r11', '二樓灌漿', 16, '2026-08-19', '08:20', 32) }),
    rec({ id: 'r12', cat: 'site', date: '2026-09-01', title: '8 月施工日誌', uploaderId: 'u2', uploadedAt: '2026-09-01T09:30:00+08:00', tags: ['日誌', '進度'], pdfs: [pdf('施工日誌-115年8月.pdf', '5.6MB', 31)] }),
    rec({ id: 'r14', cat: 'site', date: '2026-09-15', title: '三樓柱鋼筋查驗', uploaderId: 'u3', uploadedAt: '2026-09-15T15:52:00+08:00', tags: ['鋼筋', '查驗', '三樓'], note: '柱主筋搭接長度抽查 6 處，都符合', photos: photos('r14', '三樓鋼筋', 14, '2026-09-15', '13:30', 7) }),
    rec({ id: 'r15', cat: 'site', date: '2026-09-18', title: '三樓版灌漿', uploaderId: 'u2', uploadedAt: '2026-09-18T19:40:00+08:00', tags: ['灌漿', '混凝土', '三樓'], note: '預拌車 12 車，14:00 開始，19:10 完成', editedBy: 'u2', editedAt: '2026-09-19T08:10:00+08:00', photos: photos('r15', '三樓灌漿', 19, '2026-09-18', '13:50', 17) }),
    rec({ id: 'r16', cat: 'site', date: '2026-09-22', title: '四樓模板組立', uploaderId: 'u2', uploadedAt: '2026-09-22T17:05:00+08:00', tags: ['模板', '四樓'], photos: photos('r16', '四樓模板', 9, '2026-09-22', '09:15', 40) }),
    rec({ id: 'r17', cat: 'site', date: '2026-09-23', title: '三樓水電配管', uploaderId: 'u2', uploadedAt: '2026-09-23T16:20:00+08:00', tags: ['水電', '三樓', '瑕疵'], note: '有 2 處配管轉角需補強，已請水電包商處理', photos: photos('r17', '水電配管', 6, '2026-09-23', '10:30', 22) }),

    // 文件書審（送審員、管理者上傳；狀態由建築師事務所切換；文件誰都能更新、不能刪）
    rec({ id: 'r18', cat: 'review', sub: 'sc1', status: 'pass', statusBy: 'u3', statusAt: '2026-03-05T11:25:00+08:00', date: '2026-02-25', title: '工期規劃', uploaderId: 'u4', uploadedAt: '2026-02-25T15:10:00+08:00', tags: ['工期', '進度'], note: '依建築師意見調整結構體工期後重新送審', pdfs: [pdf('預定進度表-修正版.pdf', '1.9MB', 6, { uploadedAt: '2026-03-04T09:20:00+08:00' })] }),
    rec({ id: 'r20', cat: 'review', sub: 'sc2', status: 'pass', statusBy: 'u3', statusAt: '2026-04-28T10:30:00+08:00', date: '2026-04-20', title: '鋼筋材料送審', uploaderId: 'u4', uploadedAt: '2026-04-20T16:45:00+08:00', tags: ['鋼筋', '材料送審'], pdfs: [pdf('鋼筋-出廠證明.pdf', '3.2MB', 12), pdf('鋼筋-規格表.pdf', '0.8MB', 3)] }),
    rec({ id: 'r21', cat: 'review', sub: 'sc3', status: 'pass', statusBy: 'u3', statusAt: '2026-04-30T14:00:00+08:00', date: '2026-04-22', title: '預拌混凝土配比送審', uploaderId: 'u4', uploadedAt: '2026-04-22T10:05:00+08:00', tags: ['混凝土', '配比', '材料送審'], pdfs: [pdf('混凝土配比設計.pdf', '1.1MB', 7)] }),
    rec({ id: 'r22', cat: 'review', sub: 'sc5', status: 'pending', date: '2026-09-05', title: '電梯送審', uploaderId: 'u4', uploadedAt: '2026-09-05T14:30:00+08:00', tags: ['電梯', '設備送審'], note: '建築師 09/20 意見：車廂內部尺寸與圖說不符；承包商已更新施工圖', pdfs: [pdf('電梯型錄與規格.pdf', '12.8MB', 40), pdf('電梯施工圖-修正版.pdf', '6.8MB', 15, { uploaderId: 'u2', uploadedAt: '2026-09-22T10:40:00+08:00' })] }),
    rec({ id: 'r24', cat: 'review', sub: 'sc4', status: 'pending', date: '2026-09-21', title: '防水材料送審', uploaderId: 'u4', uploadedAt: '2026-09-21T11:30:00+08:00', tags: ['防水', '材料送審'], pdfs: [pdf('防水材料型錄.pdf', '4.5MB', 18)] }),

    // 材料測試報告（一般分類：能上傳的人都能傳，一週內可改可刪）
    rec({ id: 'r31', cat: 'test', sub: 'sc2', date: '2026-05-08', title: '基礎鋼筋拉力試驗', uploaderId: 'u2', uploadedAt: '2026-05-09T10:15:00+08:00', tags: ['鋼筋', '試驗', '基礎'], pdfs: [pdf('鋼筋拉力試驗報告-基礎.pdf', '0.9MB', 4)] }),
    rec({ id: 'r32', cat: 'test', sub: 'sc3', date: '2026-06-09', title: '基礎混凝土抗壓試驗（28 天）', uploaderId: 'u2', uploadedAt: '2026-06-10T09:40:00+08:00', tags: ['混凝土', '抗壓', '試驗', '基礎'], pdfs: [pdf('混凝土圓柱試體抗壓報告-基礎28天.pdf', '0.7MB', 3)] }),
    rec({ id: 'r33', cat: 'test', sub: 'sc2', date: '2026-09-16', title: '三樓鋼筋拉力試驗', uploaderId: 'u4', uploadedAt: '2026-09-16T11:00:00+08:00', tags: ['鋼筋', '試驗', '三樓'], pdfs: [pdf('鋼筋拉力試驗報告-三樓.pdf', '1.0MB', 4)] }),
    rec({ id: 'r34', cat: 'test', sub: 'sc3', date: '2026-09-17', title: '二樓版混凝土抗壓試驗（28 天）', uploaderId: 'u2', uploadedAt: '2026-09-19T14:20:00+08:00', tags: ['混凝土', '抗壓', '試驗', '二樓'], note: '6 顆試體平均 290 kgf/cm²，符合設計強度', pdfs: [pdf('混凝土圓柱試體抗壓報告-二樓28天.pdf', '0.8MB', 3)], photos: photos('r34', '抗壓試體', 6, '2026-09-17', '10:00', 12) }),

    // 請款紀錄（依期別分組）
    rec({ id: 'r25', cat: 'billing', date: '2026-05-31', title: '第 1 期請款單與日報', uploaderId: 'u2', uploadedAt: '2026-05-31T17:20:00+08:00', period: 1, tags: ['請款', '日報'], pdfs: [pdf('第1期請款單.pdf', '0.9MB', 5), pdf('第1期施工日報.pdf', '4.1MB', 22)] }),
    rec({ id: 'r26', cat: 'billing', date: '2026-05-31', title: '第 1 期請款照片', uploaderId: 'u2', uploadedAt: '2026-05-31T17:35:00+08:00', period: 1, tags: ['請款', '基礎'], photos: photos('r26', '一期請款', 11, '2026-05-30', '09:00', 45) }),
    rec({ id: 'r27', cat: 'billing', date: '2026-07-31', title: '第 2 期請款單、日報與照片', uploaderId: 'u2', uploadedAt: '2026-07-31T16:50:00+08:00', period: 2, tags: ['請款', '日報', '一樓'], pdfs: [pdf('第2期請款單.pdf', '1.0MB', 5), pdf('第2期施工日報.pdf', '4.8MB', 26)], photos: photos('r27', '二期請款', 9, '2026-07-30', '10:00', 38) }),
    rec({ id: 'r28', cat: 'billing', date: '2026-08-03', title: '第 2 期材料證明', uploaderId: 'u2', uploadedAt: '2026-08-03T09:15:00+08:00', period: 2, tags: ['請款', '鋼筋', '混凝土'], pdfs: [pdf('鋼筋進貨單.pdf', '0.7MB', 4), pdf('預拌混凝土出貨單.pdf', '1.3MB', 8)] }),
    rec({ id: 'r29', cat: 'billing', date: '2026-09-10', title: '第 3 期請款單、日報與照片', uploaderId: 'u2', uploadedAt: '2026-09-10T17:05:00+08:00', period: 3, tags: ['請款', '日報', '二樓'], pdfs: [pdf('第3期請款單.pdf', '1.1MB', 5), pdf('第3期施工日報.pdf', '5.2MB', 29)], photos: photos('r29', '三期請款', 14, '2026-09-09', '09:30', 33) }),

    // 其它
    rec({ id: 'r30', cat: 'other', date: '2026-03-10', title: '鄰房現況鑑定報告', uploaderId: 'u1', uploadedAt: '2026-03-11T09:40:00+08:00', tags: ['鄰房', '鑑定'], note: '開工前委託鑑定，四周鄰房共 6 戶', pdfs: [pdf('鄰房現況鑑定報告.pdf', '18.2MB', 64)] }),
    rec({ id: 'r13', cat: 'other', date: '2026-09-02', title: '颱風前工地巡查', uploaderId: 'u2', uploadedAt: '2026-09-02T16:40:00+08:00', tags: ['安全衛生', '颱風'], note: '鷹架帆布已收，材料都綁好固定', photos: photos('r13', '巡查', 7, '2026-09-02', '14:10', 9) })
  ];

  // 回收區：刪除只做標記，管理者可以救回
  const deletedRecords = [
    rec({ id: 'x01', cat: 'site', date: '2026-09-18', title: '三樓版灌漿（重複）', uploaderId: 'u2', uploadedAt: '2026-09-18T19:46:00+08:00', tags: ['灌漿'], photos: photos('x01', '三樓灌漿', 19, '2026-09-18', '13:50', 17), deletedBy: 'u2', deletedAt: '2026-09-18T20:02:00+08:00', deleteNote: '重複上傳' }),
    rec({ id: 'x02', cat: 'other', date: '2026-09-12', title: '手機誤傳的照片', uploaderId: 'u4', uploadedAt: '2026-09-12T21:10:00+08:00', photos: photos('x02', '誤傳', 2, '2026-09-12', '20:55', 3), deletedBy: 'u4', deletedAt: '2026-09-12T21:15:00+08:00', deleteNote: '' })
  ];

  // 帳號異動（進操作紀錄）
  const accountEvents = [
    { at: '2026-02-20T09:30:00+08:00', userId: 'u1', action: '帳號', target: '王建宏', detail: '新增帳號：承包商' },
    { at: '2026-02-20T09:32:00+08:00', userId: 'u1', action: '帳號', target: '吳俊賢', detail: '新增帳號：承包商' },
    { at: '2026-02-20T09:35:00+08:00', userId: 'u1', action: '帳號', target: '林雅婷', detail: '新增帳號：建築師事務所' },
    { at: '2026-02-20T09:40:00+08:00', userId: 'u1', action: '帳號', target: '張志明', detail: '新增帳號：送審員' },
    { at: '2026-03-01T10:00:00+08:00', userId: 'u1', action: '帳號', target: '李秀英', detail: '新增帳號：一般檢視者' },
    { at: '2026-07-01T09:00:00+08:00', userId: 'u1', action: '帳號', target: '吳俊賢', detail: '停用帳號（已離場）' }
  ];

  const periods = [
    { no: 1, date: '2026-05-31' },
    { no: 2, date: '2026-07-31' },
    { no: 3, date: '2026-09-10' }
  ];

  // 常用關鍵字：出現在上傳表單和篩選的按鈕裡
  const tags = ['放樣', '開挖', '鋼筋', '模板', '灌漿', '混凝土', '查驗', '水電', '防水', '電梯', '試驗', '請款', '日誌', '典禮', '安全衛生', '瑕疵'];

  const recentNames = {
    basic: ['契約', '建造執照', '設計圖說'],
    event: ['動土典禮', '上樑典禮', '典禮紀要'],
    site: ['施工照片', '施工日誌', '灌漿', '鋼筋查驗', '模板組立'],
    review: ['材料送審', '施工計畫', '修正後再送'],
    test: ['鋼筋拉力試驗', '混凝土抗壓試驗', '試體照片'],
    billing: ['請款單與日報', '請款照片', '材料證明'],
    other: ['工地巡查', '臨時交辦']
  };

  return { NOW, TONES, users, categories, subcats, records, deletedRecords, accountEvents, periods, tags, recentNames };
})();
