const state = { token: localStorage.getItem('mbi_token'), me: null, dashboard: null, homeLayout: null, aiCredits: null, draggedWidget: null };
const icon = { home:'⌂', sales:'▥', inventory:'▣', purchases:'↥', report:'▤', branch:'⌂', users:'♙', device:'◈', sync:'↻', settings:'⚙' };

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'content-type': 'application/json', ...(state.token ? { authorization: `Bearer ${state.token}` } : {}), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || 'Request failed');
  return data;
}

function loginView(message = '') {
  document.querySelector('#app').innerHTML = `<main class="login"><section class="login-card"><div class="brand"><img class="brand-logo" src="/assets/brand/MBI-LOGO.png" alt="MBI Inventra"><span>MBI <em>Inventra</em></span></div><h1>Run every branch with clarity.</h1><p>Secure multi-tenant pharmacy operations with device-bound access, device-bound access and tenant-safe operations.</p><form id="loginForm"><div class="field"><label>Username</label><input name="login" value="owner" autocomplete="username" required /></div><div class="field"><label>Password</label><input name="password" type="password" value="demo12345" autocomplete="current-password" required /></div><div class="field"><label>Device name</label><input name="deviceName" value="Owner workstation" required /></div><button class="btn primary" type="submit">Enter command center →</button><div class="demo">Demo account is available for local preview. Production requires your own tenant credentials.</div>${message ? `<div class="error">${message}</div>` : ''}</form></section></main>`;
  document.querySelector('#loginForm').addEventListener('submit', async (event) => { event.preventDefault(); const body = Object.fromEntries(new FormData(event.currentTarget)); try { const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }); state.token = data.token; localStorage.setItem('mbi_token', state.token); await renderApp(); } catch (error) { loginView(error.message); } });
}

function navItem(label, key, active = false) { return `<a class="nav ${active ? 'active' : ''}" data-page="${key}"><span class="icon">${icon[key] || '•'}</span><label>${label}</label></a>`; }
function money(value) { return new Intl.NumberFormat('en-PK', { style:'currency', currency:'PKR', maximumFractionDigits:0 }).format(value).replace('PKR','Rs.'); }

function widgetPanel(key, s) {
  const drag = 'draggable="true" data-widget="' + key + '"';
  const handle = '<span class="drag-handle" title="Drag to reorder">::</span>';
  if (key === 'branch') {
    const maxRevenue = Math.max(0, ...s.branchPerformance.map(b => b.revenue));
    const bars = s.branchPerformance.map((item) => { const height = maxRevenue ? Math.round(item.revenue / maxRevenue * 100) : 0; return '<div class="bar" style="height:' + height + '%"><span>' + money(item.revenue) + '</span><small>' + item.name + '</small></div>'; }).join('');
    return '<article class="card panel" ' + drag + '><div class="panel-head">' + handle + '<h2 class="panel-title">Branch performance</h2><span class="panel-note">This week</span></div><div class="chart">' + bars + '</div></article>';
  }
  if (key === 'alerts') {
    return '<article class="card panel" ' + drag + '><div class="panel-head">' + handle + '<h2 class="panel-title">Inventory alerts</h2><span class="panel-note">View all</span></div><div class="activity"><span class="dot danger"></span><div><strong>Low stock items</strong><span>' + s.lowStock + ' items need attention</span></div></div><div class="activity"><span class="dot warn"></span><div><strong>Expiring soon</strong><span>' + s.expiringSoon + ' items expiring soon</span></div></div><p>Per-medicine alerts will be wired in Phase 2 (Inventory) - no medicine names are shown until real stock data exists.</p></article>';
  }
  if (key === 'top') {
    const rows = s.topProducts.map(x => '<tr><td><strong>' + x.name + '</strong></td><td>' + x.units.toLocaleString() + '</td><td>' + money(x.revenue) + '</td></tr>').join('');
    return '<article class="card panel" ' + drag + '><div class="panel-head">' + handle + '<h2 class="panel-title">Top selling medicines</h2><span class="panel-note">View report</span></div><table class="table"><thead><tr><th>Medicine</th><th>Units</th><th>Revenue</th></tr></thead><tbody>' + rows + '</tbody></table></article>';
  }
  if (key === 'activity') {
    const acts = s.activity.map(x => '<div class="activity"><span class="dot ' + (x.tone === 'danger' ? 'danger' : x.tone === 'warn' ? 'warn' : x.tone === 'info' ? 'info' : '') + '"></span><div><strong>' + x.label + '</strong><span>' + x.detail + '</span></div><time>' + x.time + '</time></div>').join('');
    return '<article class="card panel" ' + drag + '><div class="panel-head">' + handle + '<h2 class="panel-title">Recent activity</h2><span class="panel-note">Audit log</span></div>' + acts + '</article>';
  }
  if (key === 'command') {
    return '<article class="card panel wide" ' + drag + '><div class="panel-head">' + handle + '<h2 class="panel-title">Your command center</h2><span class="panel-note">Function-level access enabled</span></div><div class="module-grid"><div class="module"><h3>Device security</h3><p>3-device sync, HWID binding, signed sessions and revoke controls are ready for this tenant.</p></div><div class="module"><h3>Tenant isolation</h3><p>All API requests resolve the signed tenant session. Client-provided tenant IDs are never trusted.</p></div><div class="module"><h3>Offline PWA</h3><p>PWA shell caching is ready. Offline sync storage is coming in Phase 6 - sync push currently returns 501 and does not save. Server transactions remain the source of truth.</p></div></div></article>';
  }
  return '';
}

function dashboardHTML() {
  const s = state.dashboard.summary;
  const layout = (state.homeLayout && state.homeLayout.length ? state.homeLayout : ["kpis", "branch", "alerts", "top", "activity", "command"]);
  const gridOrder = layout.filter(k => ["branch", "alerts", "top", "activity", "command"].includes(k));
  for (const k of ["branch", "alerts", "top", "activity", "command"]) if (!gridOrder.includes(k)) gridOrder.push(k);
  const tenantLabel = state.me.tenant.id === 'tenant_demo' ? 'DEMO TENANT - PREVIEW DATA' : 'LIVE TENANT';
  const branchOptions = state.me.tenant.branches.map(b => '<option>' + b.name + '</option>').join('');
  const topbar = '<div class="topbar"><div><div class="eyebrow">' + state.me.tenant.plan.toUpperCase() + ' PLAN - ' + tenantLabel + '</div><h1 class="headline">Good morning, ' + state.me.user.name.split(' ')[0] + '.</h1><p class="subhead">Here is what is happening across ' + state.me.tenant.branches.length + ' branches today.</p></div><div class="top-actions"><select class="selector"><option>All branches (' + state.me.tenant.branches.length + ')</option>' + branchOptions + '</select><button class="btn" id="resetLayout">Reset layout</button><button class="btn primary" id="refresh">Refresh dashboard</button></div></div>';
  const kpis = '<section class="kpis"><article class="card kpi"><div class="label">Total revenue</div><div class="value">' + money(s.revenue) + '</div></article><article class="card kpi"><div class="label">Net profit</div><div class="value">' + money(s.profit) + '</div></article><article class="card kpi warn"><div class="label">Low stock items</div><div class="value">' + s.lowStock + '</div><div class="trend">Needs purchase action</div></article><article class="card kpi alert"><div class="label">Expiring soon</div><div class="value">' + s.expiringSoon + '</div><div class="trend">Review expiring items</div></article></section>';
  const grid = '<section class="grid">' + gridOrder.map(key => widgetPanel(key, s)).join('') + '</section>';
  return topbar + kpis + grid;
}

function appShell() {
  return `<div class="shell"><aside class="rail"><div class="brand"><img class="brand-logo" src="/assets/brand/MBI-LOGO.png" alt="MBI Inventra"><span>MBI <em>Inventra</em></span></div><div class="rail-label">Workspace</div>${navItem('Overview','home',true)}${navItem('Sales / POS','sales')}${navItem('Inventory','inventory')}${navItem('Purchases','purchases')}<div class="rail-label">Control room</div>${navItem('Reports','report')}${navItem('Branches','branch')}${navItem('Devices','device')}${navItem('Sync health','sync')}<div class="rail-label">System</div>${navItem('Settings','settings')}<div class="profile"><div class="avatar">${state.me.user.name.split(' ').map(x => x[0]).join('').slice(0,2)}</div><div><strong>${state.me.user.name}</strong><span>${state.me.user.role}</span></div></div></aside><main class="main" id="mainContent">${dashboardHTML()}</main><div class="toast" id="toast"></div><button id="aiButton" class="ai-button" title="MBI AI Assistant"><img src="/assets/brand/MBI-LOGO.png" alt="MBI Inventra"> AI</button><div id="aiPanel" class="ai-panel" style="display:none"><div class="ai-head"><img src="/assets/brand/MBI-LOGO.png" alt="MBI Inventra"><strong>MBI AI Assistant</strong><span id="aiCreditsText"></span><button id="aiClose" class="btn ghost">X</button></div><div id="aiMessages" class="ai-messages"><div class="ai-msg ai-bot">Hi, I am your MBI pharmacy assistant. Ask about this tenant's branches and dashboard summary. I only use this tenant's data.</div></div><form id="aiForm" class="ai-form"><input id="aiInput" placeholder="Ask about your pharmacy..." maxlength="2000" required /><button class="btn primary" type="submit">Send</button></form></div></div>`;
}

async function renderApp() {
  try {
    state.me = await api('/api/me'); state.dashboard = await api('/api/dashboard');
    try { const l = await api('/api/home/layout'); state.homeLayout = l.layout; } catch { state.homeLayout = ["kpis", "branch", "alerts", "top", "activity", "command"]; }
    try { const c = await api('/api/ai/credits'); state.aiCredits = c.credits; } catch { state.aiCredits = null; }
    document.querySelector('#app').innerHTML = appShell(); bindApp();
    const ct = document.querySelector('#aiCreditsText'); if (ct) ct.textContent = state.aiCredits ? (state.aiCredits.remaining + ' credits left') : 'Credits: -';
  } catch (error) { localStorage.removeItem('mbi_token'); state.token = null; loginView(error.message); }
}


async function loadMedicines() {
  const search = document.querySelector('#invSearch') ? document.querySelector('#invSearch').value : '';
  try {
    const data = await api('/api/inventory/medicines?search=' + encodeURIComponent(search));
    const box = document.querySelector('#invList'); if (!box) return;
    if (!data.medicines.length) { box.innerHTML = '<p>No medicines yet. Create one below.</p>'; return; }
    box.innerHTML = data.medicines.map(m => '<div class="activity"><div><strong>' + m.name + '</strong><span>SKU ' + m.sku + (m.barcode ? ' - Barcode ' + m.barcode : '') + (m.strength ? ' - ' + m.strength : '') + ' - Stock ' + m.totalStock + ' - ' + (m.active ? 'Active' : 'Inactive') + '</span></div><button class="btn" data-med="' + m.id + '">Batches</button><button class="btn" data-toggle="' + m.id + '" data-active="' + (m.active ? '0' : '1') + '">' + (m.active ? 'Deactivate' : 'Activate') + '</button></div>').join('');
    box.querySelectorAll('[data-med]').forEach(btn => btn.addEventListener('click', async () => {
      const batches = await api('/api/inventory/medicines/' + btn.dataset.med + '/batches');
      const bb = document.querySelector('#invBatches'); if (!bb) return;
      if (!batches.batches.length) { bb.innerHTML = '<p>No batches for this medicine yet.</p>'; return; }
      bb.innerHTML = '<h3>Batches</h3>' + batches.batches.map(b => '<div class="activity"><div><strong>' + b.batchNo + '</strong><span>Expiry ' + b.expiryDate + ' - Sale Rs. ' + b.salePrice + ' - Stock: ' + b.stockByBranch.map(s => s.branchId + ': ' + s.quantity).join(', ') + '</span></div></div>').join('');
      const sel = document.querySelector('#stockBatchId'); if (sel) sel.value = batches.batches[0].id;
      const msel = document.querySelector('#batchMedicineId'); if (msel) msel.value = btn.dataset.med;
    }));
    box.querySelectorAll('[data-toggle]').forEach(btn => btn.addEventListener('click', async () => {
      await api('/api/inventory/medicines/' + btn.dataset.toggle + '/active', { method: 'POST', body: JSON.stringify({ active: btn.dataset.active === '1' }) });
      loadMedicines();
    }));
  } catch (error) { const box = document.querySelector('#invList'); if (box) box.innerHTML = '<p class="error">' + error.message + '</p>'; }
}
async function loadAlerts() {
  try {
    const a = await api('/api/inventory/alerts');
    const box = document.querySelector('#invAlerts'); if (!box) return;
    box.innerHTML = '<p>Low stock: ' + a.lowStock.length + ' - Expiring soon (90 days): ' + a.expiringSoon.length + ' - Expired with stock: ' + a.expired.length + '</p>' +
      a.lowStock.map(x => '<div class="activity"><span class="dot danger"></span><div><strong>' + x.medicineName + ' (' + x.batchNo + ')</strong><span>Branch ' + x.branchId + ' - ' + x.quantity + ' left, reorder ' + x.reorderLevel + '</span></div></div>').join('') +
      a.expiringSoon.map(x => '<div class="activity"><span class="dot warn"></span><div><strong>' + x.medicineName + ' (' + x.batchNo + ')</strong><span>Expiry ' + x.expiryDate + ' - Qty ' + x.quantity + '</span></div></div>').join('') +
      a.expired.map(x => '<div class="activity"><span class="dot danger"></span><div><strong>' + x.medicineName + ' (' + x.batchNo + ')</strong><span>EXPIRED ' + x.expiryDate + ' - Qty ' + x.quantity + ' (do not sell)</span></div></div>').join('');
  } catch (error) { const box = document.querySelector('#invAlerts'); if (box) box.innerHTML = '<p class="error">' + error.message + '</p>'; }
}
async function renderInventory() {
  const branches = state.me.tenant.branches.map(b => '<option value="' + b.id + '">' + b.name + '</option>').join('');
  document.querySelector('#mainContent').innerHTML =
    '<div class="topbar"><div><div class="eyebrow">INVENTORY</div><h1 class="headline">Inventory</h1><p class="subhead">Medicine master, batches, branch stock, FEFO and alerts. Stock never goes negative.</p></div></div>' +
    '<section class="card panel" style="margin-top:24px"><div class="panel-head"><h2 class="panel-title">Alerts</h2></div><div id="invAlerts"><p>Loading...</p></div></section>' +
    '<section class="card panel" style="margin-top:16px"><div class="panel-head"><h2 class="panel-title">Medicines</h2></div><div style="display:flex;gap:8px;margin-bottom:12px"><input id="invSearch" placeholder="Search name, SKU or barcode" style="flex:1;padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><button class="btn primary" id="invSearchBtn">Search</button></div><div id="invList"><p>Loading...</p></div><div id="invBatches" style="margin-top:12px"></div></section>' +
    '<section class="card panel" style="margin-top:16px"><div class="panel-head"><h2 class="panel-title">Add medicine</h2></div><form id="invMedForm" style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><input name="sku" placeholder="SKU *" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="name" placeholder="Medicine name *" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="barcode" placeholder="Barcode (optional)" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="strength" placeholder="Strength (e.g. 500mg)" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="genericSalt" placeholder="Generic salt" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="category" placeholder="Category" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><button class="btn primary" type="submit">Add medicine</button></form></section>' +
    '<section class="card panel" style="margin-top:16px"><div class="panel-head"><h2 class="panel-title">Add batch</h2></div><form id="invBatchForm" style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><input name="medicineId" id="batchMedicineId" placeholder="Medicine ID (Batches button se auto-fill)" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="batchNo" placeholder="Batch no *" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="expiryDate" type="date" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="salePrice" type="number" step="0.01" min="0" placeholder="Sale price *" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="purchasePrice" type="number" step="0.01" min="0" placeholder="Purchase price" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><button class="btn primary" type="submit">Add batch</button></form></section>' +
    '<section class="card panel" style="margin-top:16px"><div class="panel-head"><h2 class="panel-title">Adjust stock</h2></div><form id="invStockForm" style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><select name="branchId" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px">' + branches + '</select><input name="batchId" id="stockBatchId" placeholder="Batch ID *" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="quantity" type="number" step="1" placeholder="Quantity (+ add, - remove, 0 nahi) *" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><select name="movementType" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px"><option value="purchase">Purchase</option><option value="adjust">Adjust</option><option value="return">Return</option><option value="damage">Damage</option><option value="transfer">Transfer</option></select><input name="reorderLevel" type="number" step="1" min="0" placeholder="Reorder level (optional)" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><button class="btn primary" type="submit">Adjust stock</button></form><p style="font-size:12px;color:#627d98">Stock adjustment idempotent hai: dobara submit par wohi movement wapas milega, stock double nahi hoga.</p></section>';
  document.querySelector('#invSearchBtn').addEventListener('click', loadMedicines);
  document.querySelector('#invMedForm').addEventListener('submit', async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); try { await api('/api/inventory/medicines', { method: 'POST', body: JSON.stringify(f) }); e.target.reset(); loadMedicines(); } catch (err) { alert(err.message); } });
  document.querySelector('#invBatchForm').addEventListener('submit', async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); f.purchasePrice = Number(f.purchasePrice || 0); f.salePrice = Number(f.salePrice); try { await api('/api/inventory/batches', { method: 'POST', body: JSON.stringify(f) }); loadMedicines(); loadAlerts(); } catch (err) { alert(err.message); } });
  document.querySelector('#invStockForm').addEventListener('submit', async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); f.quantity = Number(f.quantity); if (f.reorderLevel) f.reorderLevel = Number(f.reorderLevel); else delete f.reorderLevel; f.idempotencyKey = 'adj-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); try { await api('/api/inventory/stock/adjust', { method: 'POST', body: JSON.stringify(f) }); loadMedicines(); loadAlerts(); } catch (err) { alert(err.message); } });
  loadMedicines(); loadAlerts();
}

function bindApp() {
  document.querySelectorAll('[data-page]').forEach(item => item.addEventListener('click', () => { document.querySelectorAll('.nav').forEach(x => x.classList.remove('active')); item.classList.add('active'); const key = item.dataset.page; if (key === 'inventory') { renderInventory(); } else if (key !== 'home') { document.querySelector('#mainContent').innerHTML = `<div class="topbar"><div><div class="eyebrow">${key.toUpperCase()} MODULE</div><h1 class="headline">${item.textContent.trim()}</h1><p class="subhead">Coming soon — not built yet. No data is shown here until this module is built in a later phase.</p></div></div><section class="card panel" style="margin-top:24px"><div class="module-grid"><div class="module"><h3>What will be here</h3><p>This module will connect to MariaDB tables, transaction endpoints and the offline sync queue in its build phase. Until then this page shows nothing else.</p></div></div></section>`; } else { document.querySelector('#mainContent').innerHTML = dashboardHTML(); bindApp(); }}));
  document.querySelector('#refresh')?.addEventListener('click', async () => { state.dashboard = await api('/api/dashboard'); document.querySelector('#mainContent').innerHTML = dashboardHTML(); bindApp(); const toast = document.querySelector('#toast'); toast.textContent = 'Dashboard refreshed.'; toast.style.display = 'block'; setTimeout(() => { toast.style.display = 'none'; }, 2600); });
  document.querySelector('#resetLayout')?.addEventListener('click', async () => { try { const r = await api('/api/home/layout', { method: 'POST', body: JSON.stringify({ layout: ["kpis", "branch", "alerts", "top", "activity", "command"] }) }); state.homeLayout = r.layout; document.querySelector('#mainContent').innerHTML = dashboardHTML(); bindApp(); } catch (error) { alert(error.message); } });
  document.querySelectorAll('[data-widget]').forEach(el => {
    el.addEventListener('dragstart', (e) => { state.draggedWidget = el.dataset.widget; try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', state.draggedWidget); } catch (err) {} });
    el.addEventListener('dragover', (e) => { e.preventDefault(); });
    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      const target = el.dataset.widget; const dragged = state.draggedWidget; if (!dragged || dragged === target) return;
      const current = (state.homeLayout && state.homeLayout.length ? [...state.homeLayout] : ["kpis", "branch", "alerts", "top", "activity", "command"]);
      const grid = current.filter(k => k !== 'kpis'); const from = grid.indexOf(dragged); const to = grid.indexOf(target);
      if (from < 0 || to < 0) return; grid.splice(from, 1); grid.splice(to, 0, dragged);
      const next = ["kpis", ...grid];
      try { const r = await api('/api/home/layout', { method: 'POST', body: JSON.stringify({ layout: next }) }); state.homeLayout = r.layout; document.querySelector('#mainContent').innerHTML = dashboardHTML(); bindApp(); } catch (error) { alert(error.message); }
    });
  });
  const aiForm = document.querySelector('#aiForm');
  if (aiForm && !aiForm.dataset.bound) {
    aiForm.dataset.bound = '1';
    document.querySelector('#aiButton')?.addEventListener('click', () => { const p = document.querySelector('#aiPanel'); p.style.display = p.style.display === 'none' ? 'flex' : 'none'; });
    document.querySelector('#aiClose')?.addEventListener('click', () => { document.querySelector('#aiPanel').style.display = 'none'; });
    aiForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = document.querySelector('#aiInput'); const text = input.value.trim(); if (!text) return;
      const box = document.querySelector('#aiMessages');
      const userDiv = document.createElement('div'); userDiv.className = 'ai-msg ai-user'; userDiv.textContent = text; box.appendChild(userDiv); input.value = '';
      const thinking = document.createElement('div'); thinking.className = 'ai-msg ai-bot'; thinking.textContent = 'Thinking...'; box.appendChild(thinking); box.scrollTop = box.scrollHeight;
      try {
        const data = await api('/api/ai/chat', { method: 'POST', body: JSON.stringify({ message: text }) });
        thinking.textContent = data.answer; state.aiCredits = data.credits;
        const ct = document.querySelector('#aiCreditsText'); if (ct) ct.textContent = data.credits.remaining + ' credits left';
      } catch (error) { thinking.textContent = error.message; }
      box.scrollTop = box.scrollHeight;
    });
  }
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
if (state.token) renderApp(); else loginView();
