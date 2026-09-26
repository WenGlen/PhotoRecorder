/* 阿美中會工地記錄平台 Demo：以下資料全部為虛構，只用來展示畫面 */
window.DEMO = (() => {
  // Demo 的「現在時間」固定，讓「今天往前 7 天」「還可以修改幾天」每次看都一樣
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
    { id: 'u3', name: '江維玲', email: 'jiang.wl@example.com', role: 'architect', disabled: false },
    { id: 'u4', name: '張志明', email: 'chang.cm@example.com', role: 'contractor', disabled: false },
    { id: 'u5', name: '李秀英', email: 'lee.sy@example.com', role: 'amis', disabled: false },
    // 已離場的前工地主任：示範「帳號只停用不刪除，以前傳的資料仍看得到是誰傳的」
    { id: 'u6', name: '吳俊賢', email: 'wu.jx@example.com', role: 'contractor', disabled: true }
  ];
  const roleOf = id => users.find(u => u.id === id).role;

  const pdf = (name, size, pages, extra) => Object.assign({ name, size, pages }, extra);
  // 上傳者的身分記在記錄上；每份文件各自記上傳者與時間（書審文件會被別人更新），沒寫就跟記錄一樣
  function rec(o) {
    const r = Object.assign({ photos: [], pdfs: [], tags: [], note: '' }, o);
    r.role = roleOf(r.uploaderId);
    r.pdfs = r.pdfs.map((p, i) => Object.assign({ id: `${r.id}-d${i + 1}`, uploaderId: r.uploaderId, uploadedAt: r.uploadedAt }, p));
    return r;
  }

  // roles：能上傳這一類的身分；subKind：day＝日期子分類（工地記錄），list＝自訂子分類；status：有書審狀態
  const categories = [
    { id: 'site', name: '工地記錄', short: '工地記錄', roles: ['admin', 'architect', 'contractor', 'amis'], subKind: 'day', desc: '施工照片、施工日誌，依日期分子分類' },
    { id: 'review', name: '書審及材料測試', short: '書審及材料測試', roles: ['admin', 'contractor'], subKind: 'list', status: true, desc: '材料送審、試驗報告等，由建築師事務所審查' },
    { id: 'event', name: '活動記錄', short: '活動記錄', roles: ['admin', 'architect', 'contractor'], subKind: 'list', desc: '動土、上樑、感恩禮拜等活動' },
    { id: 'basic', name: '案件基本資料', short: '基本資料', roles: ['admin'], desc: '契約、建照、設計圖說' }
  ];

  // 自訂子分類：書審及材料測試、活動記錄各一份；沒有記錄的子分類，列表不會出現那一段
  const subcats = {
    review: [
      { id: 'sc1', name: '施工計畫' },
      { id: 'sc2', name: '鋼筋' },
      { id: 'sc3', name: '混凝土' },
      { id: 'sc4', name: '防水' },
      { id: 'sc5', name: '電梯' },
      { id: 'sc6', name: '外牆' }
    ],
    event: [
      { id: 'ev1', name: '動土典禮' },
      { id: 'ev2', name: '上樑典禮' },
      { id: 'ev3', name: '感恩禮拜' }
    ]
  };

  const diary = (name, size, pages) => pdf(name, size, pages, { diary: true });

  const records = [
    // 案件基本資料（只有管理者能傳）
    rec({ id: 'r01', cat: 'basic', date: '2026-01-08', title: '建造執照', uploaderId: 'u1', uploadedAt: '2026-02-21T10:12:00+08:00', tags: ['建照', '法規'], pdfs: [pdf('建造執照-115建字第0038號.pdf', '2.1MB', 3)] }),
    rec({ id: 'r02', cat: 'basic', date: '2026-02-20', title: '工程承攬契約', uploaderId: 'u1', uploadedAt: '2026-02-21T10:20:00+08:00', tags: ['契約', '工期'], pdfs: [pdf('工程承攬契約書.pdf', '8.7MB', 46)] }),
    rec({ id: 'r03', cat: 'basic', date: '2026-02-01', title: '建築設計圖說（核定版）', uploaderId: 'u1', uploadedAt: '2026-02-21T10:35:00+08:00', tags: ['圖說', '結構', '電梯'], pdfs: [pdf('建築設計圖說-核定版.pdf', '31.4MB', 88)] }),
    rec({ id: 'r30', cat: 'basic', date: '2026-03-10', title: '鄰房現況鑑定報告', uploaderId: 'u1', uploadedAt: '2026-03-11T09:40:00+08:00', tags: ['鄰房', '鑑定'], note: '開工前委託鑑定，四周鄰房共 6 戶', pdfs: [pdf('鄰房現況鑑定報告.pdf', '18.2MB', 64)] }),

    // 活動記錄
    rec({ id: 'r04', cat: 'event', sub: 'ev1', date: '2026-03-15', title: '動土典禮', uploaderId: 'u1', uploadedAt: '2026-03-15T20:41:00+08:00', tags: ['典禮', '動土'], note: '感謝各教會弟兄姊妹出席', photos: photos('r04', '動土', 23, '2026-03-15', '09:30', 4) }),
    rec({ id: 'r05', cat: 'event', sub: 'ev1', date: '2026-03-16', title: '動土典禮紀要', uploaderId: 'u1', uploadedAt: '2026-03-17T09:05:00+08:00', tags: ['典禮', '會議記錄'], pdfs: [pdf('動土典禮紀要.pdf', '1.2MB', 4)] }),
    rec({ id: 'r35', cat: 'event', sub: 'ev3', date: '2026-09-13', title: '上樑前感恩禮拜', uploaderId: 'u1', uploadedAt: '2026-09-13T21:00:00+08:00', tags: ['典禮', '感恩禮拜'], note: '同工與工班一起為工程平安禱告', photos: photos('r35', '感恩禮拜', 10, '2026-09-13', '10:00', 6) }),

    // 工地記錄（日期就是子分類；施工日誌勾了「施工日誌」，請款時可以整合）
    rec({ id: 'r06', cat: 'site', date: '2026-03-28', title: '放樣', uploaderId: 'u6', uploadedAt: '2026-03-28T17:30:00+08:00', tags: ['放樣', '測量'], photos: photos('r06', '放樣', 8, '2026-03-28', '08:40', 25) }),
    rec({ id: 'r40', cat: 'site', date: '2026-03-31', title: '3 月施工日誌', uploaderId: 'u6', uploadedAt: '2026-04-01T09:00:00+08:00', tags: ['日誌'], pdfs: [diary('施工日誌-2026年3月.pdf', '2.8MB', 12)] }),
    rec({ id: 'r07', cat: 'site', date: '2026-04-10', title: '基地開挖', uploaderId: 'u6', uploadedAt: '2026-04-10T18:02:00+08:00', tags: ['開挖', '擋土', '安全衛生'], photos: photos('r07', '開挖', 15, '2026-04-10', '08:10', 30) }),
    rec({ id: 'r41', cat: 'site', date: '2026-04-30', title: '4 月施工日誌', uploaderId: 'u6', uploadedAt: '2026-05-01T09:10:00+08:00', tags: ['日誌'], pdfs: [diary('施工日誌-2026年4月.pdf', '4.9MB', 26)] }),
    rec({ id: 'r08', cat: 'site', date: '2026-05-06', title: '基礎鋼筋查驗', uploaderId: 'u3', uploadedAt: '2026-05-06T16:10:00+08:00', tags: ['鋼筋', '查驗', '基礎'], note: '監造查驗，箍筋間距符合圖說', photos: photos('r08', '基礎鋼筋', 12, '2026-05-06', '10:05', 6) }),
    rec({ id: 'r09', cat: 'site', date: '2026-05-12', title: '基礎灌漿', uploaderId: 'u2', uploadedAt: '2026-05-12T19:22:00+08:00', tags: ['灌漿', '混凝土', '基礎'], photos: photos('r09', '基礎灌漿', 18, '2026-05-12', '07:50', 35) }),
    rec({ id: 'r42', cat: 'site', date: '2026-05-31', title: '5 月施工日誌', uploaderId: 'u2', uploadedAt: '2026-06-01T09:05:00+08:00', tags: ['日誌'], pdfs: [diary('施工日誌-2026年5月.pdf', '5.3MB', 29)] }),
    rec({ id: 'r43', cat: 'site', date: '2026-06-30', title: '6 月施工日誌', uploaderId: 'u2', uploadedAt: '2026-07-01T09:15:00+08:00', tags: ['日誌'], pdfs: [diary('施工日誌-2026年6月.pdf', '5.0MB', 27)] }),
    rec({ id: 'r10', cat: 'site', date: '2026-07-08', title: '一樓版灌漿', uploaderId: 'u2', uploadedAt: '2026-07-08T18:47:00+08:00', tags: ['灌漿', '混凝土', '一樓'], photos: photos('r10', '一樓灌漿', 21, '2026-07-08', '08:00', 28) }),
    rec({ id: 'r44', cat: 'site', date: '2026-07-31', title: '7 月施工日誌', uploaderId: 'u2', uploadedAt: '2026-08-01T09:00:00+08:00', tags: ['日誌'], pdfs: [diary('施工日誌-2026年7月.pdf', '5.5MB', 30)] }),
    rec({ id: 'r11', cat: 'site', date: '2026-08-19', title: '二樓版灌漿', uploaderId: 'u2', uploadedAt: '2026-08-19T18:15:00+08:00', tags: ['灌漿', '混凝土', '二樓'], photos: photos('r11', '二樓灌漿', 16, '2026-08-19', '08:20', 32) }),
    rec({ id: 'r12', cat: 'site', date: '2026-08-31', title: '8 月施工日誌', uploaderId: 'u2', uploadedAt: '2026-09-01T09:30:00+08:00', tags: ['日誌', '進度'], pdfs: [diary('施工日誌-2026年8月.pdf', '5.6MB', 31)] }),
    rec({ id: 'r13', cat: 'site', date: '2026-09-02', title: '颱風前工地巡查', uploaderId: 'u2', uploadedAt: '2026-09-02T16:40:00+08:00', tags: ['安全衛生', '颱風'], note: '鷹架帆布已收，材料都綁好固定', photos: photos('r13', '巡查', 7, '2026-09-02', '14:10', 9) }),
    rec({ id: 'r14', cat: 'site', date: '2026-09-15', title: '三樓柱鋼筋查驗', uploaderId: 'u3', uploadedAt: '2026-09-15T15:52:00+08:00', tags: ['鋼筋', '查驗', '三樓'], note: '柱主筋搭接長度抽查 6 處，都符合', photos: photos('r14', '三樓鋼筋', 14, '2026-09-15', '13:30', 7) }),
    rec({ id: 'r45', cat: 'site', date: '2026-09-18', title: '三樓版試體取樣', uploaderId: 'u4', uploadedAt: '2026-09-18T16:30:00+08:00', tags: ['混凝土', '試驗', '三樓'], note: '取 6 顆圓柱試體，7 天、28 天各送 3 顆', photos: photos('r45', '試體取樣', 4, '2026-09-18', '15:10', 5) }),
    rec({ id: 'r15', cat: 'site', date: '2026-09-18', title: '三樓版灌漿', uploaderId: 'u2', uploadedAt: '2026-09-18T19:40:00+08:00', tags: ['灌漿', '混凝土', '三樓'], note: '預拌車 12 車，14:00 開始，19:10 完成', editedBy: 'u2', editedAt: '2026-09-19T08:10:00+08:00', photos: photos('r15', '三樓灌漿', 19, '2026-09-18', '13:50', 17) }),
    rec({ id: 'r16', cat: 'site', date: '2026-09-22', title: '四樓模板組立', uploaderId: 'u2', uploadedAt: '2026-09-22T17:05:00+08:00', tags: ['模板', '四樓'], photos: photos('r16', '四樓模板', 9, '2026-09-22', '09:15', 40) }),
    rec({ id: 'r17', cat: 'site', date: '2026-09-23', title: '三樓水電配管', uploaderId: 'u2', uploadedAt: '2026-09-23T16:20:00+08:00', tags: ['水電', '三樓', '瑕疵'], note: '有 2 處配管轉角需補強，已請水電包商處理', photos: photos('r17', '水電配管', 6, '2026-09-23', '10:30', 22) }),
    rec({ id: 'r46', cat: 'site', date: '2026-09-24', title: '四樓鋼筋進場', uploaderId: 'u5', uploadedAt: '2026-09-24T11:20:00+08:00', tags: ['鋼筋', '四樓'], note: '教會同工到場看鋼筋進場', photos: photos('r46', '鋼筋進場', 3, '2026-09-24', '10:40', 8) }),
    rec({ id: 'r50', cat: 'site', date: '2026-09-03', title: '颱風後復工巡查', uploaderId: 'u2', uploadedAt: '2026-09-03T10:20:00+08:00', tags: ['安全衛生', '颱風'], note: '工區積水已抽乾，鷹架逐一檢查後復工', photos: photos('r50', '復工巡查', 5, '2026-09-03', '08:30', 12) }),
    rec({ id: 'r51', cat: 'site', date: '2026-09-07', title: '三樓柱鋼筋綁紮', uploaderId: 'u2', uploadedAt: '2026-09-07T16:40:00+08:00', tags: ['鋼筋', '三樓'], photos: photos('r51', '柱鋼筋綁紮', 10, '2026-09-07', '09:00', 30) }),
    rec({ id: 'r52', cat: 'site', date: '2026-09-09', title: '三樓柱模板組立', uploaderId: 'u2', uploadedAt: '2026-09-09T17:10:00+08:00', tags: ['模板', '三樓'], photos: photos('r52', '柱模板', 8, '2026-09-09', '08:40', 35) }),
    rec({ id: 'r53', cat: 'site', date: '2026-09-11', title: '三樓梁版模板組立', uploaderId: 'u2', uploadedAt: '2026-09-11T16:55:00+08:00', tags: ['模板', '三樓'], photos: photos('r53', '梁版模板', 12, '2026-09-11', '08:20', 25) }),
    rec({ id: 'r54', cat: 'site', date: '2026-09-14', title: '三樓梁版鋼筋綁紮', uploaderId: 'u2', uploadedAt: '2026-09-14T17:20:00+08:00', tags: ['鋼筋', '三樓'], photos: photos('r54', '梁版鋼筋', 16, '2026-09-14', '08:10', 20) }),
    rec({ id: 'r55', cat: 'site', date: '2026-09-16', title: '三樓水電預埋管', uploaderId: 'u2', uploadedAt: '2026-09-16T16:30:00+08:00', tags: ['水電', '三樓'], photos: photos('r55', '水電預埋', 7, '2026-09-16', '10:00', 25) }),
    rec({ id: 'r56', cat: 'site', date: '2026-09-17', title: '三樓灌漿前檢查', uploaderId: 'u3', uploadedAt: '2026-09-17T15:40:00+08:00', tags: ['查驗', '灌漿', '三樓'], note: '模板支撐、鋼筋保護層抽查，可以灌漿', photos: photos('r56', '灌漿前檢查', 9, '2026-09-17', '13:30', 10) }),
    rec({ id: 'r57', cat: 'site', date: '2026-09-21', title: '三樓版養護灑水', uploaderId: 'u4', uploadedAt: '2026-09-21T09:30:00+08:00', tags: ['混凝土', '三樓'], photos: photos('r57', '養護灑水', 4, '2026-09-21', '08:00', 15) }),
    // 九月每個工作天（週一到週五）都有一份施工日誌，請款時可以一次整合
    ...['01', '02', '03', '04', '07', '08', '09', '10', '11', '14', '15', '16', '17', '18', '21', '22', '23', '24'].map((d, i) => rec({
      id: `rd${d}`, cat: 'site', date: `2026-09-${d}`, title: '施工日誌', uploaderId: i % 5 === 3 ? 'u4' : 'u2',
      uploadedAt: `2026-09-${d}T17:${pad(5 + ((i * 7) % 50))}:00+08:00`, tags: ['日誌'],
      pdfs: [diary(`施工日誌-2026-09-${d}.pdf`, `${(0.4 + (i % 4) * 0.1).toFixed(1)}MB`, 2 + (i % 3))]
    })),

    // 書審及材料測試（承包商、管理者上傳；狀態由建築師事務所切換；文件誰都能更新、不能刪）
    rec({ id: 'r18', cat: 'review', sub: 'sc1', status: 'pass', statusBy: 'u3', statusAt: '2026-03-05T11:25:00+08:00', date: '2026-02-25', title: '工期規劃', uploaderId: 'u4', uploadedAt: '2026-02-25T15:10:00+08:00', tags: ['工期', '進度'], note: '依建築師意見調整結構體工期後重新送審', pdfs: [pdf('預定進度表-修正版.pdf', '1.9MB', 6, { uploadedAt: '2026-03-04T09:20:00+08:00' })] }),
    rec({ id: 'r20', cat: 'review', sub: 'sc2', status: 'pass', statusBy: 'u3', statusAt: '2026-04-28T10:30:00+08:00', date: '2026-04-20', title: '鋼筋材料送審', uploaderId: 'u4', uploadedAt: '2026-04-20T16:45:00+08:00', tags: ['鋼筋', '材料送審'], pdfs: [pdf('鋼筋-出廠證明.pdf', '3.2MB', 12), pdf('鋼筋-規格表.pdf', '0.8MB', 3)] }),
    rec({ id: 'r21', cat: 'review', sub: 'sc3', status: 'pass', statusBy: 'u3', statusAt: '2026-04-30T14:00:00+08:00', date: '2026-04-22', title: '預拌混凝土配比送審', uploaderId: 'u4', uploadedAt: '2026-04-22T10:05:00+08:00', tags: ['混凝土', '配比', '材料送審'], pdfs: [pdf('混凝土配比設計.pdf', '1.1MB', 7)] }),
    rec({ id: 'r31', cat: 'review', sub: 'sc2', status: 'pass', statusBy: 'u3', statusAt: '2026-05-12T09:00:00+08:00', date: '2026-05-08', title: '基礎鋼筋拉力試驗', uploaderId: 'u2', uploadedAt: '2026-05-09T10:15:00+08:00', tags: ['鋼筋', '試驗', '基礎'], pdfs: [pdf('鋼筋拉力試驗報告-基礎.pdf', '0.9MB', 4)] }),
    rec({ id: 'r32', cat: 'review', sub: 'sc3', status: 'pass', statusBy: 'u3', statusAt: '2026-06-12T10:00:00+08:00', date: '2026-06-09', title: '基礎混凝土抗壓試驗（28 天）', uploaderId: 'u2', uploadedAt: '2026-06-10T09:40:00+08:00', tags: ['混凝土', '抗壓', '試驗', '基礎'], pdfs: [pdf('混凝土圓柱試體抗壓報告-基礎28天.pdf', '0.7MB', 3)] }),
    rec({ id: 'r22', cat: 'review', sub: 'sc5', status: 'pending', date: '2026-09-05', title: '電梯送審', uploaderId: 'u4', uploadedAt: '2026-09-05T14:30:00+08:00', tags: ['電梯', '設備送審'], note: '建築師 09/20 意見：車廂內部尺寸與圖說不符；承包商已更新施工圖', pdfs: [pdf('電梯型錄與規格.pdf', '12.8MB', 40), pdf('電梯施工圖-修正版.pdf', '6.8MB', 15, { uploaderId: 'u2', uploadedAt: '2026-09-22T10:40:00+08:00' })] }),
    rec({ id: 'r33', cat: 'review', sub: 'sc2', status: 'pending', date: '2026-09-16', title: '三樓鋼筋拉力試驗', uploaderId: 'u4', uploadedAt: '2026-09-16T11:00:00+08:00', tags: ['鋼筋', '試驗', '三樓'], pdfs: [pdf('鋼筋拉力試驗報告-三樓.pdf', '1.0MB', 4)] }),
    rec({ id: 'r34', cat: 'review', sub: 'sc3', status: 'pass', statusBy: 'u3', statusAt: '2026-09-20T10:00:00+08:00', date: '2026-09-17', title: '二樓版混凝土抗壓試驗（28 天）', uploaderId: 'u2', uploadedAt: '2026-09-19T14:20:00+08:00', tags: ['混凝土', '抗壓', '試驗', '二樓'], note: '6 顆試體平均 290 kgf/cm²，符合設計強度', pdfs: [pdf('混凝土圓柱試體抗壓報告-二樓28天.pdf', '0.8MB', 3)], photos: photos('r34', '抗壓試體', 6, '2026-09-17', '10:00', 12) }),
    rec({ id: 'r24', cat: 'review', sub: 'sc4', status: 'pending', date: '2026-09-21', title: '防水材料送審', uploaderId: 'u4', uploadedAt: '2026-09-21T11:30:00+08:00', tags: ['防水', '材料送審'], pdfs: [pdf('防水材料型錄.pdf', '4.5MB', 18)] })
  ];

  // 工地記錄的子分類備註（以日期為單位）
  const siteNotes = {
    '2026-09-03': { text: '颱風過後復工，先清理工區積水', by: 'u2', at: '2026-09-03T17:30:00+08:00' },
    '2026-09-11': { text: '午後雷陣雨，停工約 1 小時', by: 'u2', at: '2026-09-11T17:20:00+08:00' },
    '2026-09-18': { text: '三樓版灌漿日，天氣晴。預拌車 12 車，下午 2 點開始、7 點 10 分完成', by: 'u2', at: '2026-09-18T20:00:00+08:00' },
    '2026-09-23': { text: '水電配管查驗日，建築師抽查後有 2 處需補強', by: 'u3', at: '2026-09-23T17:30:00+08:00' }
  };

  // 回收區：刪除只做標記，管理者可以救回
  const deletedRecords = [
    rec({ id: 'x01', cat: 'site', date: '2026-09-18', title: '三樓版灌漿（重複）', uploaderId: 'u2', uploadedAt: '2026-09-18T19:46:00+08:00', tags: ['灌漿'], photos: photos('x01', '三樓灌漿', 19, '2026-09-18', '13:50', 17), deletedBy: 'u2', deletedAt: '2026-09-18T20:02:00+08:00', deleteNote: '重複上傳' }),
    rec({ id: 'x02', cat: 'site', date: '2026-09-12', title: '手機誤傳的照片', uploaderId: 'u5', uploadedAt: '2026-09-12T21:10:00+08:00', photos: photos('x02', '誤傳', 2, '2026-09-12', '20:55', 3), deletedBy: 'u5', deletedAt: '2026-09-12T21:15:00+08:00', deleteNote: '' })
  ];

  // 請款：獨立的資料，不跟上面的記錄共用；照片、文件是從記錄挑過來的（存一份當時的副本）
  const findRec = id => records.find(r => r.id === id);
  const fromOf = r => ({ recId: r.id, title: r.title, date: r.date });
  // 照片名稱跟系統預設一樣是「日期 項目」；第三個參數可以換掉項目那段
  const pickPhoto = (recId, n, name) => {
    const r = findRec(recId);
    return { id: `bp-${recId}-${n}`, name: `${r.date.replace(/-/g, '/')} ${name || r.title}`, file: { ...r.photos[n - 1] }, from: fromOf(r) };
  };
  const pickDoc = (recId, n) => {
    const r = findRec(recId);
    const file = r.pdfs[n - 1];
    return { id: `bd-${recId}-${n}`, name: file.name, file: { ...file }, from: fromOf(r) };
  };
  const billing = [
    {
      id: 'b1', no: 1, from: '2026-03-15', to: '2026-05-31', createdBy: 'u2', createdAt: '2026-06-02T10:00:00+08:00',
      done: { by: 'u2', at: '2026-06-05T16:00:00+08:00' },
      merged: { id: 'b1-m', name: '第1期整合施工日誌.pdf', size: '13.0MB', pages: 67, sources: ['r40-d1', 'r41-d1', 'r42-d1'], uploaderId: 'u2', uploadedAt: '2026-06-02T10:05:00+08:00' },
      photos: [pickPhoto('r06', 2, '放樣完成'), pickPhoto('r07', 5), pickPhoto('r08', 3), pickPhoto('r09', 7)],
      docs: [pickDoc('r20', 1), pickDoc('r21', 1), pickDoc('r31', 1)],
      quotes: [pdf('第1期估價單.pdf', '0.9MB', 5, { id: 'b1-q1', uploaderId: 'u2', uploadedAt: '2026-06-02T10:10:00+08:00' })],
      others: [pdf('第1期請款函.pdf', '0.2MB', 1, { id: 'b1-o1', uploaderId: 'u2', uploadedAt: '2026-06-02T10:12:00+08:00' })]
    },
    {
      id: 'b2', no: 2, from: '2026-06-01', to: '2026-07-31', createdBy: 'u2', createdAt: '2026-08-02T09:00:00+08:00',
      done: { by: 'u2', at: '2026-08-06T15:30:00+08:00' },
      merged: { id: 'b2-m', name: '第2期整合施工日誌.pdf', size: '10.5MB', pages: 57, sources: ['r43-d1', 'r44-d1'], uploaderId: 'u2', uploadedAt: '2026-08-02T09:05:00+08:00' },
      photos: [pickPhoto('r10', 4), pickPhoto('r10', 12, '一樓版灌漿完成面')],
      docs: [pickDoc('r32', 1)],
      quotes: [pdf('第2期估價單.pdf', '1.0MB', 5, { id: 'b2-q1', uploaderId: 'u2', uploadedAt: '2026-08-02T09:10:00+08:00' })],
      others: [
        pdf('第2期請款函.pdf', '0.2MB', 1, { id: 'b2-o1', uploaderId: 'u2', uploadedAt: '2026-08-02T09:12:00+08:00' }),
        pdf('工程保險單.pdf', '0.6MB', 3, { id: 'b2-o2', uploaderId: 'u2', uploadedAt: '2026-08-02T09:14:00+08:00' })
      ]
    },
    {
      id: 'b3', no: 3, from: '2026-08-01', to: '2026-08-31', createdBy: 'u2', createdAt: '2026-09-10T17:05:00+08:00', done: null,
      merged: null,
      photos: [pickPhoto('r11', 3)],
      docs: [],
      quotes: [pdf('第3期估價單.pdf', '1.1MB', 5, { id: 'b3-q1', uploaderId: 'u2', uploadedAt: '2026-09-10T17:05:00+08:00' })],
      others: []
    },
    // 九月這期還沒整合：按「整合施工日誌」會列出九月每個工作天的施工日誌
    { id: 'b4', no: 4, from: '2026-09-01', to: '2026-09-30', createdBy: 'u2', createdAt: '2026-09-24T17:40:00+08:00', done: null, merged: null, quotes: [], photos: [], docs: [], others: [] }
  ];

  // 帳號異動（進操作記錄）
  const accountEvents = [
    { at: '2026-02-20T09:30:00+08:00', userId: 'u1', action: '帳號', target: '王建宏', detail: '新增帳號：承包商' },
    { at: '2026-02-20T09:32:00+08:00', userId: 'u1', action: '帳號', target: '吳俊賢', detail: '新增帳號：承包商' },
    { at: '2026-02-20T09:35:00+08:00', userId: 'u1', action: '帳號', target: '江維玲', detail: '新增帳號：建築師事務所' },
    { at: '2026-02-20T09:40:00+08:00', userId: 'u1', action: '帳號', target: '張志明', detail: '新增帳號：承包商' },
    { at: '2026-03-01T10:00:00+08:00', userId: 'u1', action: '帳號', target: '李秀英', detail: '新增帳號：阿美中會' },
    { at: '2026-07-01T09:00:00+08:00', userId: 'u1', action: '帳號', target: '吳俊賢', detail: '停用帳號（已離場）' }
  ];

  return { NOW, TONES, users, categories, subcats, records, siteNotes, deletedRecords, billing, accountEvents };
})();
