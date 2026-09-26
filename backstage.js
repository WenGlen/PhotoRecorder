/* 阿美中會工地記錄平台 Demo：後台（帳號管理、回收區、操作記錄）
   獨立網址 #/backstage：平台裡沒有任何入口，只有管理者進得來，其他人開這個網址只看到「找不到這個頁面」 */
(function () {
  'use strict';

  const PR = window.PR;
  if (!PR || PR.bootFailed) return;

  const { useState } = window.preactHooks;
  const { html, APP_NAME, ROLE_IDS, LOG_ACTIONS, ymd, dt, userById, catById, roleName, countText, byLine } = PR;

  const PAGES = [
    { id: 'accounts', label: '帳號管理' },
    { id: 'recycle', label: '回收區' },
    { id: 'log', label: '操作記錄' }
  ];

  function BackstageShell({ user, route, data, actions, children }) {
    const go = hash => e => { e.preventDefault(); actions.nav(hash); };
    return html`<div class="d-shell bs">
      <header class="d-head bs-head">
        <div class="d-brand">${APP_NAME}<span class="bs-tag">後台</span></div>
        <div class="d-user">${user.name}｜${roleName(user.role)}</div>
        <a class="bs-back" href="#/" onClick=${go('#/')}>回到平台</a>
      </header>
      <div class="d-body">
        <nav class="d-nav" aria-label="後台選單">
          ${PAGES.map(p => html`<a class=${'d-nav-item' + (route.id === p.id ? ' on' : '')} href=${'#/backstage/' + p.id}
            onClick=${go('#/backstage/' + p.id)}>${p.label}${p.id === 'recycle' && data.deleted.length ? `（${data.deleted.length}）` : ''}</a>`)}
        </nav>
        <main class="d-main">${children}</main>
      </div>
    </div>`;
  }

  // ---------- 帳號管理 ----------
  function AccountsPage({ user, users, actions }) {
    return html`<div class="d-page">
      <div class="d-page-head">
        <div>
          <h1 class="d-h1">帳號管理</h1>
          <p class="muted">只有名單上的 Gmail 能登入。身分決定能做什麼；停用後立即生效。帳號只停用不刪除，以前上傳的資料仍看得到是誰傳的。</p>
        </div>
        <button class="btn btn-primary" onClick=${actions.openAddAccount}>新增帳號</button>
      </div>
      <table class="d-table d-static">
        <thead><tr><th>姓名</th><th>Gmail</th><th>身分</th><th>狀態</th><th></th></tr></thead>
        <tbody>
          ${users.map(u => html`<tr key=${u.id} class=${u.disabled ? 'is-off' : ''}>
            <td class="c-title">${u.name}${u.id === user.id ? '（你）' : ''}</td>
            <td>${u.email}</td>
            <td>${u.id === user.id
              ? roleName(u.role)
              : html`<select class="select sm" aria-label=${u.name + ' 的身分'} value=${u.role} disabled=${u.disabled}
                  onChange=${e => actions.updateUser(u.id, { role: e.target.value })}>
                  ${ROLE_IDS.map(r => html`<option value=${r}>${roleName(r)}</option>`)}
                </select>`}</td>
            <td>${u.disabled ? html`<span class="off-tag">已停用</span>` : '使用中'}</td>
            <td class="c-actions">${u.id !== user.id && html`<button class=${'btn btn-outline sm' + (u.disabled ? '' : ' danger')}
              onClick=${() => actions.updateUser(u.id, { disabled: !u.disabled })}>${u.disabled ? '重新啟用' : '停用'}</button>`}</td>
          </tr>`)}
        </tbody>
      </table>
    </div>`;
  }

  // ---------- 回收區 ----------
  function RecyclePage({ data, actions }) {
    const list = [...data.deleted].sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
    return html`<div class="d-page">
      <div class="d-page-head">
        <div>
          <h1 class="d-h1">回收區</h1>
          <p class="muted">刪除的資料都在這裡，保留到平台結束。救回後跟刪除前完全一樣。</p>
        </div>
      </div>
      ${list.length === 0
        ? html`<div class="empty"><p>回收區是空的</p></div>`
        : html`<table class="d-table d-static">
          <thead><tr><th>名稱</th><th>分類</th><th>資料日期</th><th>原上傳者</th><th>刪除的人</th><th>刪除時間</th><th>內容</th><th></th></tr></thead>
          <tbody>
            ${list.map(r => html`<tr key=${r.id}>
              <td class="c-title">${r.title}${r.deleteNote && html`<div class="meta">原因：${r.deleteNote}</div>`}</td>
              <td><span class="chip">${catById(r.cat).short}</span></td>
              <td class="c-nowrap">${ymd(r.date)}</td>
              <td>${byLine(r)}</td>
              <td>${userById(r.deletedBy).name}</td>
              <td class="c-nowrap">${dt(r.deletedAt)}</td>
              <td class="c-nowrap">${countText(r)}</td>
              <td class="c-actions">
                <button class="btn btn-outline sm" onClick=${() => actions.restoreRecord(r.id)}>救回</button>
                <button class="btn btn-outline sm danger" onClick=${() => actions.askPurge(r.id)}>永久刪除</button>
              </td>
            </tr>`)}
          </tbody>
        </table>`}
    </div>`;
  }

  // ---------- 操作記錄 ----------
  function LogPage({ data, users }) {
    const [action, setAction] = useState('all');
    const [who, setWho] = useState('all');
    const list = data.log.filter(l => (action === 'all' || l.action === action) && (who === 'all' || l.userId === who));
    return html`<div class="d-page">
      <div class="d-page-head">
        <div>
          <h1 class="d-h1">操作記錄</h1>
          <p class="muted">上傳、修改、更新文件、書審狀態、子分類備註、請款、刪除、救回、帳號與設定的異動都會記下來。這份記錄只能新增，不能修改或刪除。</p>
        </div>
      </div>
      <div class="d-filter-row">
        <select class="select sm" aria-label="動作" value=${action} onChange=${e => setAction(e.target.value)}>
          <option value="all">全部動作</option>
          ${LOG_ACTIONS.map(a => html`<option value=${a}>${a}</option>`)}
        </select>
        <select class="select sm" aria-label="人" value=${who} onChange=${e => setWho(e.target.value)}>
          <option value="all">全部的人</option>
          ${users.map(u => html`<option value=${u.id}>${u.name}</option>`)}
        </select>
        <span class="c-muted">共 ${list.length} 筆</span>
      </div>
      <table class="d-table d-static">
        <thead><tr><th>時間</th><th>人</th><th>動作</th><th>對象</th><th>內容</th></tr></thead>
        <tbody>
          ${list.map(l => html`<tr key=${l.id}>
            <td class="c-nowrap">${dt(l.at)}</td>
            <td class="c-nowrap">${userById(l.userId).name}</td>
            <td><span class="chip">${l.action}</span></td>
            <td class="c-title">${l.target}</td>
            <td>${l.detail}</td>
          </tr>`)}
        </tbody>
      </table>
    </div>`;
  }

  Object.assign(PR, { BackstageShell, AccountsPage, RecyclePage, LogPage });
})();
