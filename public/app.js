const state = { token: localStorage.getItem('mbi_token'), me: null, dashboard: null, homeLayout: null, aiCredits: null, draggedWidget: null };
const icon = { home:'⌂', sales:'▥', inventory:'▣', purchases:'↥', report:'▤', branch:'⌂', users:'♙', device:'◈', sync:'↻', settings:'⚙' };

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'content-type': 'application/json', ...(state.token ? { authorization: `Bearer ${state.token}` } : {}), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || 'Request failed');
  return data;
}

function loginView(message = '') {
  document.querySelector('#app').innerHTML = `<main class="login"><section class="login-card"><div class="brand"><img class="brand-logo" src="/assets/brand/MBI-LOGO.png" alt="MBI Inventra"><span>MBI <em>Inventra</em></span></div><h1>Run every branch with clarity.</h1><p>Secure multi-tenant pharmacy operations with device-bound access, device-bound access and tenant-safe operations.</p><form id="loginForm"><div class="field"><label>Username</label><input name="login" value="owner" autocomplete="username" required /></div><div class="field"><label>Password</label><input name="password" type="password" value="demo12345" autocomplete="current-password" required /></div><div class="field"><label>Device name</label><input name="deviceName" value="Owner workstation" required /></div><button class="btn primary" type="submit">Enter command center →</button><button class="btn" type="button" id="goRegister" style="margin-top:8px">Register a new pharmacy (Basic plan)</button><div class="demo">Demo account is available for local preview. Production requires your own tenant credentials.</div>${message ? `<div class="error">${message}</div>` : ''}</form></section></main>`;
  document.querySelector('#loginForm').addEventListener('submit', async (event) => { event.preventDefault(); const body = Object.fromEntries(new FormData(event.currentTarget)); try { const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }); state.token = data.token; localStorage.setItem('mbi_token', state.token); await renderApp(); } catch (error) { loginView(error.message); } });
  document.querySelector('#goRegister').addEventListener('click', () => registerView());
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
  return `<div class="shell"><aside class="rail"><div class="brand"><img class="brand-logo" src="/assets/brand/MBI-LOGO.png" alt="MBI Inventra"><span>MBI <em>Inventra</em></span></div><div class="rail-label">Workspace</div>${navItem('Overview','home',true)}${navItem('Sales / POS','sales')}${navItem('Inventory','inventory')}${navItem('Purchases','purchases')}${navItem('Prescriptions','prescriptions')}${navItem('Attendance','attendance')}${navItem('Online Orders','orders')}<div class="rail-label">Control room</div>${navItem('Reports','report')}${navItem('Branches','branch')}${navItem('Devices','device')}${navItem('Sync health','sync')}<div class="rail-label">System</div>${navItem('Settings','settings')}<div class="profile"><div class="avatar">${state.me.user.name.split(' ').map(x => x[0]).join('').slice(0,2)}</div><div><strong>${state.me.user.name}</strong><span>${state.me.user.role}</span></div></div></aside><main class="main" id="mainContent">${dashboardHTML()}</main><div class="toast" id="toast"></div><button id="aiButton" class="ai-button" title="MBI AI Assistant"><img src="/assets/brand/MBI-LOGO.png" alt="MBI Inventra"> AI</button><div id="aiPanel" class="ai-panel" style="display:none"><div class="ai-head"><img src="/assets/brand/MBI-LOGO.png" alt="MBI Inventra"><strong>MBI AI Assistant</strong><span id="aiCreditsText"></span><button id="aiClose" class="btn ghost">X</button></div><div id="aiMessages" class="ai-messages"><div class="ai-msg ai-bot">Hi, I am your MBI pharmacy assistant. Ask about this tenant's branches and dashboard summary. I only use this tenant's data.</div></div><form id="aiForm" class="ai-form"><input id="aiInput" placeholder="Ask about your pharmacy..." maxlength="2000" required /><button class="btn primary" type="submit">Send</button></form></div></div>`;
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
    '<section class="card panel" style="margin-top:16px"><div class="panel-head"><h2 class="panel-title">Add medicine</h2></div><form id="invMedForm" style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><input name="sku" placeholder="SKU *" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="name" placeholder="Medicine name *" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="barcode" placeholder="Barcode (optional)" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="strength" placeholder="Strength (e.g. 500mg)" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="genericSalt" placeholder="Generic salt" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="category" placeholder="Category" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="isControlled" /> Controlled drug (prescription zaroori)</label><button class="btn primary" type="submit">Add medicine</button></form></section>' +
    '<section class="card panel" style="margin-top:16px"><div class="panel-head"><h2 class="panel-title">Add batch</h2></div><form id="invBatchForm" style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><input name="medicineId" id="batchMedicineId" placeholder="Medicine ID (Batches button se auto-fill)" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="batchNo" placeholder="Batch no *" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="expiryDate" type="date" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="salePrice" type="number" step="0.01" min="0" placeholder="Sale price *" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="purchasePrice" type="number" step="0.01" min="0" placeholder="Purchase price" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><button class="btn primary" type="submit">Add batch</button></form></section>' +
    '<section class="card panel" style="margin-top:16px"><div class="panel-head"><h2 class="panel-title">Adjust stock</h2></div><form id="invStockForm" style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><select name="branchId" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px">' + branches + '</select><input name="batchId" id="stockBatchId" placeholder="Batch ID *" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="quantity" type="number" step="1" placeholder="Quantity (+ add, - remove, 0 nahi) *" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><select name="movementType" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px"><option value="purchase">Purchase</option><option value="adjust">Adjust</option><option value="return">Return</option><option value="damage">Damage</option><option value="transfer">Transfer</option></select><input name="reorderLevel" type="number" step="1" min="0" placeholder="Reorder level (optional)" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><button class="btn primary" type="submit">Adjust stock</button></form><p style="font-size:12px;color:#627d98">Stock adjustment idempotent hai: dobara submit par wohi movement wapas milega, stock double nahi hoga.</p></section>';
  document.querySelector('#invSearchBtn').addEventListener('click', loadMedicines);
  document.querySelector('#invMedForm').addEventListener('submit', async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); f.isControlled = f.isControlled === 'on'; try { await api('/api/inventory/medicines', { method: 'POST', body: JSON.stringify(f) }); e.target.reset(); loadMedicines(); } catch (err) { alert(err.message); } });
  document.querySelector('#invBatchForm').addEventListener('submit', async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); f.purchasePrice = Number(f.purchasePrice || 0); f.salePrice = Number(f.salePrice); try { await api('/api/inventory/batches', { method: 'POST', body: JSON.stringify(f) }); loadMedicines(); loadAlerts(); } catch (err) { alert(err.message); } });
  document.querySelector('#invStockForm').addEventListener('submit', async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); f.quantity = Number(f.quantity); if (f.reorderLevel) f.reorderLevel = Number(f.reorderLevel); else delete f.reorderLevel; f.idempotencyKey = 'adj-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); try { await api('/api/inventory/stock/adjust', { method: 'POST', body: JSON.stringify(f) }); loadMedicines(); loadAlerts(); } catch (err) { alert(err.message); } });
  loadMedicines(); loadAlerts();
}



async function renderPrescriptions() {
  const branches = state.me.tenant.branches.map(b => '<option value="' + b.id + '">' + b.name + '</option>').join('');
  document.querySelector('#mainContent').innerHTML =
    '<div class="topbar"><div><div class="eyebrow">PRESCRIPTIONS & CONTROLLED DRUGS</div><h1 class="headline">Prescriptions</h1><p class="subhead">Controlled medicine sirf pending prescription par bik sakti hai. Sale ya direct dispense par prescription dispensed ho jati hai aur controlled log me entry likhi jati hai.</p></div></div>' +
    '<section class="card panel" style="margin-top:24px"><div class="panel-head"><h2 class="panel-title">New prescription</h2></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><input id="rxPatient" placeholder="Patient name *" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input id="rxDoctor" placeholder="Doctor name *" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><select id="rxBranch" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px">' + branches + '</select><input id="rxMedSearch" placeholder="Search medicine (name / SKU)" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /></div><div id="rxMedList" style="margin-top:12px"></div><div id="rxItems" style="margin-top:12px"></div><button class="btn primary" id="rxSubmit" style="margin-top:8px">Create prescription</button><div id="rxResult" style="margin-top:12px"></div></section>' +
    '<section class="card panel" style="margin-top:16px"><div class="panel-head"><h2 class="panel-title">Prescriptions</h2></div><div id="rxList"><p>Loading...</p></div></section>' +
    '<section class="card panel" style="margin-top:16px"><div class="panel-head"><h2 class="panel-title">Controlled drug log</h2></div><div id="rxLog"><p>Loading...</p></div></section>';
  const items = [];
  function renderRxItems() { const box = document.querySelector('#rxItems'); box.innerHTML = items.length ? '<table class="table"><thead><tr><th>Medicine</th><th>Qty</th><th>Dosage</th><th></th></tr></thead><tbody>' + items.map((c, i) => '<tr><td>' + c.name + '</td><td>' + c.quantity + '</td><td>' + (c.dosage || '') + '</td><td><button class="btn" data-rx-remove="' + i + '">Remove</button></td></tr>').join('') + '</tbody></table>' : '<p>No items yet. Search a medicine and add it.</p>'; box.querySelectorAll('[data-rx-remove]').forEach(btn => btn.addEventListener('click', () => { items.splice(Number(btn.dataset.rxRemove), 1); renderRxItems(); })); }
  renderRxItems();
  document.querySelector('#rxMedSearch').addEventListener('input', async (e) => {
    const q = e.target.value.trim(); if (q.length < 2) return;
    try { const data = await api('/api/inventory/medicines?search=' + encodeURIComponent(q)); document.querySelector('#rxMedList').innerHTML = data.medicines.slice(0, 10).map(m => '<div class="activity"><div><strong>' + m.name + '</strong><span>' + m.sku + (m.isControlled ? ' - CONTROLLED' : '') + '</span></div><button class="btn primary" data-rx-add="' + m.id + '" data-rx-name="' + m.name + '">Add</button></div>').join(''); document.querySelectorAll('[data-rx-add]').forEach(btn => btn.addEventListener('click', () => { const qty = Number(prompt('Quantity?', '1') || 0); if (!(qty > 0)) return; const dosage = prompt('Dosage (optional)', '') || null; items.push({ medicineId: btn.dataset.rxAdd, name: btn.dataset.rxName, quantity: qty, dosage }); renderRxItems(); })); } catch (err) { /* search errors stay silent until submit */ }
  });
  document.querySelector('#rxSubmit').addEventListener('click', async () => {
    if (!items.length) return alert('Add at least one item.');
    try { const data = await api('/api/prescriptions', { method: 'POST', body: JSON.stringify({ patientName: document.querySelector('#rxPatient').value, doctorName: document.querySelector('#rxDoctor').value, branchId: document.querySelector('#rxBranch').value, items: items.map(i => ({ medicineId: i.medicineId, quantity: i.quantity, dosage: i.dosage })) }) }); document.querySelector('#rxResult').innerHTML = '<p>Prescription created: ' + data.prescription.id + ' (pending)</p>'; items.length = 0; renderRxItems(); loadRx(); } catch (err) { alert(err.message); }
  });
  async function loadRx() {
    try { const data = await api('/api/prescriptions'); document.querySelector('#rxList').innerHTML = data.prescriptions.map(rx => '<div class="activity"><div><strong>' + rx.patientName + ' - Dr. ' + rx.doctorName + ' (' + rx.status + ')</strong><span>' + rx.items.map(i => i.medicineId + ' x' + i.quantity).join(', ') + '</span></div>' + (rx.status === 'pending' ? '<div style="display:flex;gap:8px"><button class="btn primary" data-rx-dispense="' + rx.id + '">Dispense</button><button class="btn" data-rx-cancel="' + rx.id + '">Cancel</button></div>' : '<span>' + rx.id + '</span>') + '</div>').join('') || '<p>No prescriptions yet.</p>'; document.querySelectorAll('[data-rx-dispense]').forEach(btn => btn.addEventListener('click', async () => { try { await api('/api/prescriptions/' + btn.dataset.rxDispense + '/dispense', { method: 'POST' }); loadRx(); loadLog(); } catch (err) { alert(err.message); } })); document.querySelectorAll('[data-rx-cancel]').forEach(btn => btn.addEventListener('click', async () => { try { await api('/api/prescriptions/' + btn.dataset.rxCancel + '/cancel', { method: 'POST' }); loadRx(); } catch (err) { alert(err.message); } })); } catch (e) { document.querySelector('#rxList').innerHTML = '<p class="error">' + e.message + '</p>'; }
  }
  async function loadLog() {
    try { const data = await api('/api/controlled-log'); document.querySelector('#rxLog').innerHTML = data.logs.map(l => '<div class="activity"><div><strong>' + l.action + ' - ' + l.medicineId + ' x' + l.quantity + '</strong><span>Branch ' + l.branchId + ' - Prescription ' + (l.prescriptionId || '-') + '</span></div><time>' + l.createdAt.slice(0, 10) + '</time></div>').join('') || '<p>No controlled drug entries yet.</p>'; } catch (e) { document.querySelector('#rxLog').innerHTML = '<p class="error">' + e.message + '</p>'; }
  }
  loadRx(); loadLog();
}


async function renderAttendance() {
  const branches = state.me.tenant.branches.map(b => '<option value="' + b.id + '">' + b.name + '</option>').join('');
  document.querySelector('#mainContent').innerHTML =
    '<div class="topbar"><div><div class="eyebrow">ATTENDANCE & PAYROLL</div><h1 class="headline">Staff attendance</h1><p class="subhead">Aik user ki aik din me aik hi check-in aur aik hi check-out hoti hai. Payroll simple pro-rata hai: salary x present days / month ke din. Is me deductions, overtime ya tax nahi hai.</p></div></div>' +
    '<section class="card panel" style="margin-top:24px"><div class="panel-head"><h2 class="panel-title">Today</h2></div><div style="display:flex;gap:8px"><select id="attBranch" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px">' + branches + '</select><button class="btn primary" id="attIn">Check in</button><button class="btn" id="attOut">Check out</button></div><div id="attResult" style="margin-top:12px"></div></section>' +
    '<section class="card panel" style="margin-top:16px"><div class="panel-head"><h2 class="panel-title">Attendance</h2></div><div id="attList"><p>Loading...</p></div></section>' +
    '<section class="card panel" style="margin-top:16px"><div class="panel-head"><h2 class="panel-title">Payroll</h2></div><div style="display:flex;gap:8px;margin-bottom:12px"><input id="payMonth" type="month" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><button class="btn primary" id="payLoad">Load payroll</button></div><div id="payList"><p>Select a month.</p></div><form id="salaryForm" style="display:flex;gap:8px;margin-top:12px"><input name="userId" placeholder="User ID (e.g. user_pharmacist)" required style="flex:1;padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="monthlySalary" type="number" min="0" placeholder="Monthly salary Rs." required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><button class="btn" type="submit">Set salary (admin only)</button></form></section>';
  async function loadAtt() { try { const data = await api('/api/attendance'); document.querySelector('#attList').innerHTML = data.attendance.map(a => '<div class="activity"><div><strong>' + a.userId + ' - ' + a.date + '</strong><span>Branch ' + a.branchId + ' - In ' + (a.checkIn ? a.checkIn.slice(11, 16) : '-') + ' - Out ' + (a.checkOut ? a.checkOut.slice(11, 16) : '-') + ' - ' + a.hours + ' hrs</span></div></div>').join('') || '<p>No attendance yet.</p>'; } catch (e) { document.querySelector('#attList').innerHTML = '<p class="error">' + e.message + '</p>'; } }
  document.querySelector('#attIn').addEventListener('click', async () => { try { const data = await api('/api/attendance/check-in', { method: 'POST', body: JSON.stringify({ branchId: document.querySelector('#attBranch').value }) }); document.querySelector('#attResult').innerHTML = '<p>Checked in at ' + data.attendance.checkIn + '</p>'; loadAtt(); } catch (e) { alert(e.message); } });
  document.querySelector('#attOut').addEventListener('click', async () => { try { const data = await api('/api/attendance/check-out', { method: 'POST' }); document.querySelector('#attResult').innerHTML = '<p>Checked out. Hours today: ' + data.attendance.hours + '</p>'; loadAtt(); } catch (e) { alert(e.message); } });
  document.querySelector('#payLoad').addEventListener('click', async () => { const month = document.querySelector('#payMonth').value; if (!month) return alert('Select a month.'); try { const data = await api('/api/payroll?month=' + month); document.querySelector('#payList').innerHTML = data.payroll.map(r => '<div class="activity"><div><strong>' + r.userId + '</strong><span>' + r.daysPresent + ' days present - ' + r.totalHours + ' hrs - Salary ' + r.monthlySalary + ' - Pay ' + r.pay + '</span></div></div>').join('') || '<p>No attendance in this month.</p>'; } catch (e) { alert(e.message); } });
  document.querySelector('#salaryForm').addEventListener('submit', async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); try { await api('/api/staff/' + f.userId + '/salary', { method: 'POST', body: JSON.stringify({ monthlySalary: Number(f.monthlySalary) }) }); alert('Salary saved.'); } catch (err) { alert(err.message); } });
  loadAtt();
}


async function renderOrders() {
  const storeUrl = window.location.origin + '/store/' + state.me.tenant.id;
  document.querySelector('#mainContent').innerHTML =
    '<div class="topbar"><div><div class="eyebrow">ONLINE STORE — ADVANCED ONLY</div><h1 class="headline">Online orders</h1><p class="subhead">Ye tenant ke apne online store ka sara data hai: har order, us ke items, customer aur status. Confirm par stock FEFO se katta hai, reject par kuch nahi katta, delivered sirf status hai. Online totals POS sales totals me nahi milte — ye alag channel hai, taake koi menu double-count na kare. Payment cash on delivery / pickup hai, is slice me online payment nahi hai.</p></div></div>' +
    '<section class="card panel" style="margin-top:24px"><div class="panel-head"><h2 class="panel-title">Public store link</h2></div><p>Customers isi link par order dete hain, bina login ke: <strong>' + storeUrl + '</strong></p><p style="font-size:12px;color:#627d98">Controlled medicines online store me kabhi nahi dikhti, kyunki anonymous customer prescription nahi de sakta.</p></section>' +
    '<section class="card panel" style="margin-top:16px"><div class="panel-head"><h2 class="panel-title">Orders</h2></div><div id="orderTotals" style="margin-bottom:12px"></div><div id="orderList"><p>Loading...</p></div></section>';
  async function loadOrders() {
    try {
      const data = await api('/api/orders');
      const pending = data.orders.filter(o => o.status === 'pending');
      const confirmed = data.orders.filter(o => o.status === 'confirmed');
      const delivered = data.orders.filter(o => o.status === 'delivered');
      const sum = (arr) => arr.reduce((s, o) => s + o.total, 0);
      document.querySelector('#orderTotals').innerHTML = '<p>Pending: ' + pending.length + ' - Confirmed total: ' + money(sum(confirmed)) + ' - Delivered total: ' + money(sum(delivered)) + ' - Rejected: ' + data.orders.filter(o => o.status === 'rejected').length + '</p>';
      const box = document.querySelector('#orderList');
      if (!data.orders.length) { box.innerHTML = '<p>No online orders yet.</p>'; return; }
      box.innerHTML = data.orders.map(o => '<div class="activity"><div><strong>' + o.orderNo + ' - ' + money(o.total) + ' - ' + o.status.toUpperCase() + '</strong><span>' + o.customerName + ' (' + o.customerPhone + ') - Branch ' + o.branchId + ' - Items: ' + o.items.map(i => i.medicineName + ' x' + i.quantity + ' @ Rs. ' + i.unitPrice).join(', ') + '</span></div>' + (o.status === 'pending' ? '<div style="display:flex;gap:8px"><button class="btn primary" data-order-confirm="' + o.id + '">Confirm (deduct stock)</button><button class="btn" data-order-reject="' + o.id + '">Reject</button></div>' : o.status === 'confirmed' ? '<button class="btn primary" data-order-deliver="' + o.id + '">Mark delivered</button>' : '<span>' + o.id + '</span>') + '</div>').join('');
      box.querySelectorAll('[data-order-confirm]').forEach(btn => btn.addEventListener('click', async () => { try { await api('/api/orders/' + btn.dataset.orderConfirm + '/confirm', { method: 'POST' }); loadOrders(); } catch (err) { alert(err.message); } }));
      box.querySelectorAll('[data-order-reject]').forEach(btn => btn.addEventListener('click', async () => { try { await api('/api/orders/' + btn.dataset.orderReject + '/reject', { method: 'POST' }); loadOrders(); } catch (err) { alert(err.message); } }));
      box.querySelectorAll('[data-order-deliver]').forEach(btn => btn.addEventListener('click', async () => { try { await api('/api/orders/' + btn.dataset.orderDeliver + '/deliver', { method: 'POST' }); loadOrders(); } catch (err) { alert(err.message); } }));
    } catch (e) { document.querySelector('#orderList').innerHTML = '<p class="error">' + e.message + '</p>'; }
  }
  loadOrders();
}

async function renderSales() {
  const branches = state.me.tenant.branches.map(b => '<option value="' + b.id + '">' + b.name + '</option>').join('');
  document.querySelector('#mainContent').innerHTML =
    '<div class="topbar"><div><div class="eyebrow">SALES / POS</div><h1 class="headline">Point of sale</h1><p class="subhead">FEFO sale: sab se pehle expire hone wala batch pehle bikta hai. Sale, stock aur khata aik transaction me likhe jate hain. Stock kabhi negative nahi hota.</p></div></div>' +
    '<section class="card panel" style="margin-top:24px"><div class="panel-head"><h2 class="panel-title">New sale</h2></div><div style="display:flex;gap:8px;margin-bottom:12px"><select id="saleBranch" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px">' + branches + '</select><input id="saleMedSearch" placeholder="Search medicine (name / SKU)" style="flex:1;padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><button class="btn primary" id="saleSearchBtn">Search</button></div><div id="saleMedList"><p>Search a medicine, then add it to the cart.</p></div><div id="saleCart" style="margin-top:12px"></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px"><select id="saleCustomer" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px"><option value="">No customer (cash sale)</option></select><select id="salePayType" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px"><option value="cash">Cash (full payment)</option><option value="credit">Credit (khata)</option></select><input id="saleDiscount" type="number" step="0.01" min="0" value="0" placeholder="Discount Rs." style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input id="salePaid" type="number" step="0.01" min="0" value="0" placeholder="Paid amount Rs." style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input id="salePrescriptionId" placeholder="Prescription ID (controlled medicines ke liye zaroori)" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /></div><p style="font-size:12px;color:#627d98">Cash sale me paid amount total ke barabar hona chahiye. Credit sale me baqi amount customer ke khata me jayega. Discount sirf un users ko milega jin ke paas discount permission hai.</p><button class="btn primary" id="saleSubmit" style="margin-top:8px">Complete sale</button><div id="saleResult" style="margin-top:12px"></div></section>' +
    '<section class="card panel" style="margin-top:16px"><div class="panel-head"><h2 class="panel-title">Recent sales</h2></div><div id="saleList"><p>Loading...</p></div></section>' +
    '<section class="card panel" style="margin-top:16px"><div class="panel-head"><h2 class="panel-title">Return sale item</h2></div><form id="saleReturnForm" style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><input name="saleId" placeholder="Sale ID *" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="medicineId" placeholder="Medicine ID *" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="batchId" placeholder="Batch ID *" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="quantity" type="number" step="1" min="1" placeholder="Return qty *" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><button class="btn primary" type="submit">Return item</button></form><p style="font-size:12px;color:#627d98">Return stock wapas ata hai, khata balance kam hota hai (credit sale par), aur refund discount ke hisab se hota hai.</p></section>';
  const cart = [];
  function renderCart() {
    const box = document.querySelector('#saleCart'); if (!box) return;
    if (!cart.length) { box.innerHTML = '<p>Cart is empty.</p>'; return; }
    box.innerHTML = '<table class="table"><thead><tr><th>Medicine</th><th>Qty</th><th></th></tr></thead><tbody>' + cart.map((c, i) => '<tr><td><strong>' + c.name + '</strong></td><td>' + c.quantity + '</td><td><button class="btn" data-cart-remove="' + i + '">Remove</button></td></tr>').join('') + '</tbody></table>';
    box.querySelectorAll('[data-cart-remove]').forEach(btn => btn.addEventListener('click', () => { cart.splice(Number(btn.dataset.cartRemove), 1); renderCart(); }));
  }
  renderCart();
  async function loadCustomers() {
    try { const d = await api('/api/parties?type=customer'); const sel = document.querySelector('#saleCustomer'); if (sel) sel.innerHTML = '<option value="">No customer (cash sale)</option>' + d.parties.map(x => '<option value="' + x.id + '">' + x.name + '</option>').join(''); } catch (e) {}
  }
  loadCustomers();
  document.querySelector('#saleSearchBtn').addEventListener('click', async () => {
    const q = document.querySelector('#saleMedSearch').value;
    const data = await api('/api/inventory/medicines?search=' + encodeURIComponent(q));
    const box = document.querySelector('#saleMedList');
    if (!data.medicines.length) { box.innerHTML = '<p>No medicine found.</p>'; return; }
    box.innerHTML = data.medicines.map(m => '<div class="activity"><div><strong>' + m.name + '</strong><span>SKU ' + m.sku + ' - Stock ' + m.totalStock + '</span></div><input type="number" min="1" value="1" data-qty="' + m.id + '" style="width:70px;padding:8px;border:1px solid #d9e2ec;border-radius:8px" /><button class="btn primary" data-add="' + m.id + '" data-name="' + m.name + '">Add</button></div>').join('');
    box.querySelectorAll('[data-add]').forEach(btn => btn.addEventListener('click', () => {
      const qtyEl = box.querySelector('[data-qty="' + btn.dataset.add + '"]');
      const qty = Number(qtyEl ? qtyEl.value : 1);
      if (!(qty > 0)) return alert('Quantity must be positive.');
      const existing = cart.find(c => c.medicineId === btn.dataset.add); if (existing) existing.quantity += qty; else cart.push({ medicineId: btn.dataset.add, name: btn.dataset.name, quantity: qty });
      renderCart();
    }));
  });
  async function loadSales() {
    try {
      const data = await api('/api/sales');
      const box = document.querySelector('#saleList'); if (!box) return;
      if (!data.sales.length) { box.innerHTML = '<p>No sales yet.</p>'; return; }
      box.innerHTML = data.sales.slice(0, 20).map(x => '<div class="activity"><div><strong>' + x.invoiceNo + ' - ' + money(x.total) + '</strong><span>' + x.paymentType + ' - Paid ' + money(x.paidAmount) + ' - Balance ' + money(x.balanceDue) + ' - Status ' + x.status + ' - Items: ' + x.items.map(i => i.batchNo + ' x' + i.quantity + ' @ Rs. ' + i.unitPrice).join(', ') + '</span></div></div>').join('');
    } catch (e) { const box = document.querySelector('#saleList'); if (box) box.innerHTML = '<p class="error">' + e.message + '</p>'; }
  }
  loadSales();
  document.querySelector('#saleSubmit').addEventListener('click', async () => {
    if (!cart.length) return alert('Cart is empty.');
    const body = { branchId: document.querySelector('#saleBranch').value, customerId: document.querySelector('#saleCustomer').value || null, prescriptionId: document.querySelector('#salePrescriptionId').value || null, items: cart.map(c => ({ medicineId: c.medicineId, quantity: c.quantity })), discount: Number(document.querySelector('#saleDiscount').value || 0), paymentType: document.querySelector('#salePayType').value, paidAmount: Number(document.querySelector('#salePaid').value || 0) };
    try {
      const data = await api('/api/sales', { method: 'POST', body: JSON.stringify(body) });
      document.querySelector('#saleResult').innerHTML = '<p>Sale completed: <strong>' + data.sale.invoiceNo + '</strong> - Total ' + money(data.sale.total) + ' - Balance ' + money(data.sale.balanceDue) + '</p>';
      cart.length = 0; renderCart(); loadSales();
    } catch (e) { alert(e.message); }
  });
  document.querySelector('#saleReturnForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); f.quantity = Number(f.quantity);
    try { const data = await api('/api/sales/' + f.saleId + '/return', { method: 'POST', body: JSON.stringify({ items: [{ medicineId: f.medicineId, batchId: f.batchId, quantity: f.quantity }] }) }); alert('Returned. Sale status: ' + data.sale.status); loadSales(); } catch (err) { alert(err.message); }
  });
}

async function renderPurchases() {
  const branches = state.me.tenant.branches.map(b => '<option value="' + b.id + '">' + b.name + '</option>').join('');
  document.querySelector('#mainContent').innerHTML =
    '<div class="topbar"><div><div class="eyebrow">PURCHASES & KHATA</div><h1 class="headline">Purchases & khata</h1><p class="subhead">Supplier purchase, approval, supplier payment, customer aur supplier ka khata — sab aik jagah, inventory aur dashboard se sync.</p></div></div>' +
    '<section class="card panel" style="margin-top:24px"><div class="panel-head"><h2 class="panel-title">Parties (customer / supplier)</h2></div><form id="partyForm" style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><select name="type" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px"><option value="customer">Customer</option><option value="supplier">Supplier</option></select><input name="name" placeholder="Name *" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="phone" placeholder="Phone" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="address" placeholder="Address" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><button class="btn primary" type="submit">Add party</button></form><div id="partyList" style="margin-top:12px"><p>Loading...</p></div><div id="partyStatement" style="margin-top:12px"></div></section>' +
    '<section class="card panel" style="margin-top:16px"><div class="panel-head"><h2 class="panel-title">New purchase</h2></div><div style="display:flex;gap:8px;margin-bottom:12px"><select id="purBranch" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px">' + branches + '</select><select id="purSupplier" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px"><option value="">Select supplier</option></select></div><form id="purItemForm" style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><input name="medicineId" placeholder="Medicine ID *" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="batchNo" placeholder="Batch no *" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="expiryDate" type="date" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="purchasePrice" type="number" step="0.01" min="0" placeholder="Purchase price *" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="salePrice" type="number" step="0.01" min="0" placeholder="Sale price *" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="quantity" type="number" step="1" min="1" placeholder="Qty *" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><button class="btn" type="submit">Add item</button></form><div id="purCart" style="margin-top:12px"></div><div style="display:flex;gap:8px;margin-top:12px"><input id="purPaid" type="number" step="0.01" min="0" value="0" placeholder="Paid amount Rs." style="flex:1;padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><button class="btn primary" id="purSubmit">Create purchase</button></div><p style="font-size:12px;color:#627d98">Agar aap ke paas approve permission hai to purchase foran approved hogi aur stock ayega. Warna purchase pending rahegi — stock aur khata tabhi ayenge jab koi approver approve karega.</p></section>' +
    '<section class="card panel" style="margin-top:16px"><div class="panel-head"><h2 class="panel-title">Purchases</h2></div><div id="purList"><p>Loading...</p></div></section>';
  const cart = [];
  function renderPurCart() {
    const box = document.querySelector('#purCart'); if (!box) return;
    if (!cart.length) { box.innerHTML = '<p>No purchase items yet.</p>'; return; }
    box.innerHTML = '<table class="table"><thead><tr><th>Medicine</th><th>Batch</th><th>Qty</th><th>Price</th></tr></thead><tbody>' + cart.map(c => '<tr><td>' + c.medicineId + '</td><td>' + c.batchNo + '</td><td>' + c.quantity + '</td><td>Rs. ' + c.purchasePrice + '</td></tr>').join('') + '</tbody></table>';
  }
  renderPurCart();
  async function loadParties() {
    try {
      const data = await api('/api/parties');
      const box = document.querySelector('#partyList'); if (!box) return;
      if (!data.parties.length) { box.innerHTML = '<p>No parties yet.</p>'; return; }
      box.innerHTML = data.parties.map(x => '<div class="activity"><div><strong>' + x.name + ' (' + x.type + ')</strong><span>' + (x.phone || '') + '</span></div><button class="btn" data-stmt="' + x.id + '">Statement</button></div>').join('');
      box.querySelectorAll('[data-stmt]').forEach(btn => btn.addEventListener('click', async () => {
        const st = await api('/api/parties/' + btn.dataset.stmt + '/statement');
        const sb = document.querySelector('#partyStatement');
        sb.innerHTML = '<h3>' + st.party.name + ' - Balance Rs. ' + st.balance + '</h3>' +
          '<div style="display:flex;gap:8px;margin:8px 0"><input id="payAmount" type="number" step="0.01" min="0.01" placeholder="Payment amount" style="flex:1;padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><button class="btn primary" id="payBtn">Record payment</button></div>' +
          (st.entries.length ? st.entries.map(e => '<div class="activity"><div><strong>' + e.entryType + '</strong><span>Debit ' + e.debit + ' - Credit ' + e.credit + (e.note ? ' - ' + e.note : '') + '</span></div></div>').join('') : '<p>No khata entries yet.</p>');
        document.querySelector('#payBtn').addEventListener('click', async () => {
          const amount = Number(document.querySelector('#payAmount').value);
          try { await api('/api/parties/' + btn.dataset.stmt + '/pay', { method: 'POST', body: JSON.stringify({ amount }) }); loadParties(); } catch (err) { alert(err.message); }
        });
      }));
      const sel = document.querySelector('#purSupplier'); if (sel) sel.innerHTML = '<option value="">Select supplier</option>' + data.parties.filter(x => x.type === 'supplier').map(x => '<option value="' + x.id + '">' + x.name + '</option>').join('');
    } catch (e) { const box = document.querySelector('#partyList'); if (box) box.innerHTML = '<p class="error">' + e.message + '</p>'; }
  }
  loadParties();
  async function loadPurchases() {
    try {
      const data = await api('/api/purchases');
      const box = document.querySelector('#purList'); if (!box) return;
      if (!data.purchases.length) { box.innerHTML = '<p>No purchases yet.</p>'; return; }
      box.innerHTML = data.purchases.slice(0, 20).map(x => '<div class="activity"><div><strong>Purchase - Rs. ' + x.subtotal + ' - ' + x.status + '</strong><span>Paid ' + money(x.paidAmount) + ' - Balance ' + money(x.balanceDue) + ' - Items: ' + x.items.map(i => i.batchNo + ' x' + i.quantity).join(', ') + '</span></div>' + (x.status === 'pending' ? '<button class="btn primary" data-approve="' + x.id + '">Approve</button>' : '') + '</div>').join('');
      box.querySelectorAll('[data-approve]').forEach(btn => btn.addEventListener('click', async () => { try { await api('/api/purchases/' + btn.dataset.approve + '/approve', { method: 'POST', body: JSON.stringify({}) }); loadPurchases(); } catch (err) { alert(err.message); } }));
    } catch (e) { const box = document.querySelector('#purList'); if (box) box.innerHTML = '<p class="error">' + e.message + '</p>'; }
  }
  loadPurchases();
  document.querySelector('#partyForm').addEventListener('submit', async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); try { await api('/api/parties', { method: 'POST', body: JSON.stringify(f) }); e.target.reset(); loadParties(); } catch (err) { alert(err.message); } });
  document.querySelector('#purItemForm').addEventListener('submit', (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); f.purchasePrice = Number(f.purchasePrice); f.salePrice = Number(f.salePrice); f.quantity = Number(f.quantity); cart.push(f); renderPurCart(); e.target.reset(); });
  document.querySelector('#purSubmit').addEventListener('click', async () => {
    const supplierId = document.querySelector('#purSupplier').value;
    if (!supplierId) return alert('Select a supplier.');
    if (!cart.length) return alert('Add at least one purchase item.');
    try { const data = await api('/api/purchases', { method: 'POST', body: JSON.stringify({ branchId: document.querySelector('#purBranch').value, supplierId, items: cart, paidAmount: Number(document.querySelector('#purPaid').value || 0) }) }); alert('Purchase created: ' + data.purchase.status); cart.length = 0; renderPurCart(); loadPurchases(); } catch (err) { alert(err.message); }
  });
}


async function renderReports() {
  const branches = state.me.tenant.branches.map(b => '<option value="' + b.id + '">' + b.name + '</option>').join('');
  document.querySelector('#mainContent').innerHTML =
    '<div class="topbar"><div><div class="eyebrow">REPORTS & TRANSFERS — ADVANCED ONLY</div><h1 class="headline">Reports & branch transfers</h1><p class="subhead">Reports Phase 3 ki sales, purchases aur stock se hi bante hain, is liye report ka total dashboard aur sales list se match karna chahiye. Basic plan par ye page server se block hai.</p></div></div>' +
    '<section class="card panel" style="margin-top:24px"><div class="panel-head"><h2 class="panel-title">Sales report</h2></div><div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap"><input id="repFrom" type="date" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input id="repTo" type="date" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><select id="repBranch" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px"><option value="">All branches</option>' + branches + '</select><button class="btn primary" id="repLoad">Load report</button><button class="btn" id="repCsv">Export CSV</button></div><div id="repResult"><p>Load a report to see real totals.</p></div></section>' +
    '<section class="card panel" style="margin-top:16px"><div class="panel-head"><h2 class="panel-title">Accounting</h2></div><div id="accResult"><p>Loading...</p></div></section>' +
    '<section class="card panel" style="margin-top:16px"><div class="panel-head"><h2 class="panel-title">Branch transfer</h2></div><form id="transferForm" style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><input name="medicineId" placeholder="Medicine ID *" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="batchId" placeholder="Batch ID *" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><select name="fromBranchId" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px">' + branches + '</select><select name="toBranchId" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px">' + branches + '</select><input name="quantity" type="number" step="1" min="1" placeholder="Qty *" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><button class="btn primary" type="submit">Request transfer</button></form><p style="font-size:12px;color:#627d98">Request par stock nahi hilta. Approve par source branch se stock kam aur destination par zyada hota hai, aik transaction me. Reject par kuch nahi hota.</p><div id="transferList" style="margin-top:12px"><p>Loading...</p></div></section>';
  async function loadReport() {
    const from = document.querySelector('#repFrom').value; const to = document.querySelector('#repTo').value; const branchId = document.querySelector('#repBranch').value;
    const q = new URLSearchParams(); if (from) q.set('from', from); if (to) q.set('to', to); if (branchId) q.set('branchId', branchId);
    try {
      const data = await api('/api/reports/sales?' + q.toString());
      const r = data.report; const box = document.querySelector('#repResult');
      box.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px"><div><strong>Total sales</strong><div>' + money(r.totalSales) + '</div></div><div><strong>Total purchases (approved)</strong><div>' + money(r.totalPurchases) + '</div></div><div><strong>Profit</strong><div>' + money(r.profit) + '</div></div></div>' +
        '<p>Sales: ' + r.salesCount + ' - Purchases: ' + r.purchaseCount + '</p>' +
        '<h3>By branch</h3>' + r.byBranch.map(b => '<div class="activity"><div><strong>' + b.branchId + '</strong><span>' + money(b.sales) + ' - ' + b.orders + ' orders</span></div></div>').join('') +
        '<h3>Top products</h3>' + r.topProducts.map(t => '<div class="activity"><div><strong>' + t.name + '</strong><span>' + t.units + ' units - ' + money(t.revenue) + '</span></div></div>').join('');
    } catch (e) { const box = document.querySelector('#repResult'); if (box) box.innerHTML = '<p class="error">' + e.message + '</p>'; }
  }
  document.querySelector('#repLoad').addEventListener('click', loadReport);
  document.querySelector('#repCsv').addEventListener('click', async () => {
    const from = document.querySelector('#repFrom').value; const to = document.querySelector('#repTo').value; const branchId = document.querySelector('#repBranch').value;
    const q = new URLSearchParams(); if (from) q.set('from', from); if (to) q.set('to', to); if (branchId) q.set('branchId', branchId);
    try {
      const response = await fetch('/api/reports/sales/export?' + q.toString(), { headers: { authorization: 'Bearer ' + state.token } });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'sales-report.csv'; a.click(); URL.revokeObjectURL(url);
    } catch (e) { alert(e.message); }
  });
  async function loadAccounting() {
    try {
      const data = await api('/api/accounting/summary');
      const a = data.accounting; const box = document.querySelector('#accResult'); if (!box) return;
      box.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px"><div><strong>Revenue</strong><div>' + money(a.revenue) + '</div></div><div><strong>Purchases</strong><div>' + money(a.purchases) + '</div></div><div><strong>Profit</strong><div>' + money(a.profit) + '</div></div><div><strong>Receivable (customers owe)</strong><div>' + money(a.receivable) + '</div></div><div><strong>Payable (we owe suppliers)</strong><div>' + money(a.payable) + '</div></div><div><strong>Cash received on sales</strong><div>' + money(a.cashReceived) + '</div></div></div>' +
        '<h3>Ledger (derived, not a separate copy)</h3><p style="font-size:12px;color:#627d98">Ledger sales, purchases aur khata payments se har dafa banaya jata hai, is liye ye kabhi menus se alag nahi ho sakta.</p>' +
        a.ledger.slice(0, 50).map(e => '<div class="activity"><div><strong>' + e.type + ' - ' + e.reference + '</strong><span>' + e.note + ' - Debit ' + e.debit + ' - Credit ' + e.credit + '</span></div><time>' + e.date.slice(0, 10) + '</time></div>').join('');
    } catch (e) { const box = document.querySelector('#accResult'); if (box) box.innerHTML = '<p class="error">' + e.message + '</p>'; }
  }
  async function loadTransfers() {
    try {
      const data = await api('/api/transfers');
      const box = document.querySelector('#transferList'); if (!box) return;
      if (!data.transfers.length) { box.innerHTML = '<p>No transfers yet.</p>'; return; }
      box.innerHTML = data.transfers.slice(0, 20).map(x => '<div class="activity"><div><strong>' + x.batchNo + ' - ' + x.quantity + ' units - ' + x.status + '</strong><span>' + x.fromBranchId + ' to ' + x.toBranchId + '</span></div>' + (x.status === 'pending' ? '<button class="btn primary" data-approve="' + x.id + '">Approve</button><button class="btn" data-reject="' + x.id + '">Reject</button>' : '') + '</div>').join('');
      box.querySelectorAll('[data-approve]').forEach(btn => btn.addEventListener('click', async () => { try { await api('/api/transfers/' + btn.dataset.approve + '/approve', { method: 'POST', body: JSON.stringify({}) }); loadTransfers(); } catch (err) { alert(err.message); } }));
      box.querySelectorAll('[data-reject]').forEach(btn => btn.addEventListener('click', async () => { try { await api('/api/transfers/' + btn.dataset.reject + '/reject', { method: 'POST', body: JSON.stringify({}) }); loadTransfers(); } catch (err) { alert(err.message); } }));
    } catch (e) { const box = document.querySelector('#transferList'); if (box) box.innerHTML = '<p class="error">' + e.message + '</p>'; }
  }
  loadTransfers(); loadAccounting();
  document.querySelector('#transferForm').addEventListener('submit', async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); f.quantity = Number(f.quantity); try { await api('/api/transfers', { method: 'POST', body: JSON.stringify(f) }); loadTransfers(); } catch (err) { alert(err.message); } });
  loadReport();
}

function bindApp() {
  document.querySelectorAll('[data-page]').forEach(item => item.addEventListener('click', () => { document.querySelectorAll('.nav').forEach(x => x.classList.remove('active')); item.classList.add('active'); const key = item.dataset.page; if (key === 'inventory') { renderInventory(); } else if (key === 'sales') { renderSales(); } else if (key === 'purchases') { renderPurchases(); } else if (key === 'report') { renderReports(); } else if (key === 'prescriptions') { renderPrescriptions(); } else if (key === 'attendance') { renderAttendance(); } else if (key === 'orders') { renderOrders(); } else if (key !== 'home') { document.querySelector('#mainContent').innerHTML = `<div class="topbar"><div><div class="eyebrow">${key.toUpperCase()} MODULE</div><h1 class="headline">${item.textContent.trim()}</h1><p class="subhead">Coming soon — not built yet. No data is shown here until this module is built in a later phase.</p></div></div><section class="card panel" style="margin-top:24px"><div class="module-grid"><div class="module"><h3>What will be here</h3><p>This module will connect to MariaDB tables, transaction endpoints and the offline sync queue in its build phase. Until then this page shows nothing else.</p></div></div></section>`; } else { document.querySelector('#mainContent').innerHTML = dashboardHTML(); bindApp(); }}));
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

function registerView(message = '') {
  document.querySelector('#app').innerHTML = `<main class="login"><section class="login-card"><div class="brand"><img class="brand-logo" src="/assets/brand/MBI-LOGO.png" alt="MBI Inventra"><span>MBI <em>Inventra</em></span></div><h1>Register your pharmacy</h1><p>Public registration creates a Basic-plan tenant. Advanced is upgraded later from the master panel.</p><form id="registerForm"><div class="field"><label>Pharmacy name</label><input name="name" required /></div><div class="field"><label>Owner name</label><input name="ownerName" required /></div><div class="field"><label>Owner login</label><input name="ownerLogin" required /></div><div class="field"><label>Password (min 8 characters)</label><input name="ownerPassword" type="password" minlength="8" required /></div><div class="field"><label>Branch name</label><input name="branchName" required /></div><div class="field"><label>Branch city (optional)</label><input name="branchCity" /></div><button class="btn primary" type="submit">Create pharmacy account</button><button class="btn" type="button" id="backLogin" style="margin-top:8px">Back to login</button>${message ? `<div class="error">${message}</div>` : ''}</form></section></main>`;
  document.querySelector('#backLogin').addEventListener('click', () => loginView());
  document.querySelector('#registerForm').addEventListener('submit', async (event) => { event.preventDefault(); const body = Object.fromEntries(new FormData(event.currentTarget)); try { const data = await api('/api/public/register', { method: 'POST', body: JSON.stringify(body) }); const login = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ login: body.ownerLogin, password: body.ownerPassword, deviceName: 'Owner workstation' }) }); state.token = login.token; localStorage.setItem('mbi_token', state.token); await renderApp(); } catch (error) { registerView(error.message); } });
}


async function storeView(tenantId) {
  document.querySelector('#app').innerHTML = `<main class="login"><section class="login-card" style="max-width:760px"><div class="brand"><img class="brand-logo" src="/assets/brand/MBI-LOGO.png" alt="MBI Inventra"><span>MBI <em>Inventra</em></span></div><h1 id="storeTitle">Online store</h1><div id="storeContent"><p>Loading store...</p></div></section></main>`;
  const box = document.querySelector('#storeContent');
  try {
    const store = await api('/api/public/store/' + encodeURIComponent(tenantId));
    document.querySelector('#storeTitle').textContent = store.store.name + ' — Online store';
    box.innerHTML = '<p style="font-size:13px;color:#627d98">Bina login ke order karein. Payment cash on delivery / pickup hai. Controlled medicines yahan nahi milti.</p>' +
      '<div style="margin:12px 0"><label>Branch</label><select id="storeBranch" style="width:100%;padding:10px;border:1px solid #d9e2ec;border-radius:8px">' + store.store.branches.map(b => '<option value="' + b.id + '">' + b.name + (b.city ? ' — ' + b.city : '') + '</option>').join('') + '</select></div>' +
      '<div id="storeProducts"><p>Loading products...</p></div>' +
      '<div id="storeCart" style="margin-top:12px"></div>' +
      '<form id="storeCheckout" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px"><input name="customerName" placeholder="Your name *" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="customerPhone" placeholder="Phone *" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="address" placeholder="Address (optional)" style="grid-column:1 / -1;padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><button class="btn primary" type="submit">Place order</button></form><div id="storeResult" style="margin-top:12px"></div>';
    const cart = [];
    function renderCart() {
      const cb = document.querySelector('#storeCart'); if (!cb) return;
      if (!cart.length) { cb.innerHTML = '<p>Cart is empty.</p>'; return; }
      const total = cart.reduce((s, c) => s + c.quantity * c.unitPrice, 0);
      cb.innerHTML = '<table class="table"><thead><tr><th>Medicine</th><th>Qty</th><th>Price</th><th></th></tr></thead><tbody>' + cart.map((c, i) => '<tr><td>' + c.name + '</td><td>' + c.quantity + '</td><td>Rs. ' + (c.quantity * c.unitPrice) + '</td><td><button class="btn" data-store-remove="' + i + '">Remove</button></td></tr>').join('') + '</tbody></table><p><strong>Total: Rs. ' + total + '</strong></p>';
      cb.querySelectorAll('[data-store-remove]').forEach(btn => btn.addEventListener('click', () => { cart.splice(Number(btn.dataset.storeRemove), 1); renderCart(); }));
    }
    renderCart();
    async function loadProducts() {
      const branchId = document.querySelector('#storeBranch').value;
      try {
        const data = await api('/api/public/store/' + encodeURIComponent(tenantId) + '/products?branchId=' + encodeURIComponent(branchId));
        const pb = document.querySelector('#storeProducts'); if (!pb) return;
        if (!data.products.length) { pb.innerHTML = '<p>No medicines in stock at this branch right now.</p>'; return; }
        pb.innerHTML = data.products.map(p => '<div class="activity"><div><strong>' + p.name + (p.strength ? ' ' + p.strength : '') + '</strong><span>Rs. ' + p.unitPrice + ' - In stock: ' + p.available + '</span></div><input type="number" min="1" max="' + p.available + '" value="1" data-store-qty="' + p.medicineId + '" style="width:70px;padding:8px;border:1px solid #d9e2ec;border-radius:8px" /><button class="btn primary" data-store-add="' + p.medicineId + '" data-store-name="' + p.name + '" data-store-price="' + p.unitPrice + '" data-store-max="' + p.available + '">Add</button></div>').join('');
        pb.querySelectorAll('[data-store-add]').forEach(btn => btn.addEventListener('click', () => {
          const qtyEl = pb.querySelector('[data-store-qty="' + btn.dataset.storeAdd + '"]');
          const qty = Number(qtyEl ? qtyEl.value : 1);
          if (!(qty > 0)) return alert('Quantity must be positive.');
          if (qty > Number(btn.dataset.storeMax)) return alert('Only ' + btn.dataset.storeMax + ' in stock at this branch.');
          const existing = cart.find(c => c.medicineId === btn.dataset.storeAdd); if (existing) existing.quantity += qty; else cart.push({ medicineId: btn.dataset.storeAdd, name: btn.dataset.storeName, quantity: qty, unitPrice: Number(btn.dataset.storePrice) });
          renderCart();
        }));
      } catch (e) { const pb = document.querySelector('#storeProducts'); if (pb) pb.innerHTML = '<p class="error">' + e.message + '</p>'; }
    }
    document.querySelector('#storeBranch').addEventListener('change', () => { cart.length = 0; renderCart(); loadProducts(); });
    document.querySelector('#storeCheckout').addEventListener('submit', async (e) => {
      e.preventDefault(); if (!cart.length) return alert('Cart is empty.');
      const f = Object.fromEntries(new FormData(e.target));
      try {
        const data = await api('/api/public/store/' + encodeURIComponent(tenantId) + '/orders', { method: 'POST', body: JSON.stringify({ branchId: document.querySelector('#storeBranch').value, customerName: f.customerName, customerPhone: f.customerPhone, address: f.address || null, items: cart.map(c => ({ medicineId: c.medicineId, quantity: c.quantity })) }) });
        document.querySelector('#storeResult').innerHTML = '<p>Order placed! Your order number is <strong>' + data.order.orderNo + '</strong> — total Rs. ' + data.order.total + '. The pharmacy will confirm it shortly.</p>';
        cart.length = 0; renderCart(); loadProducts();
      } catch (err) { alert(err.message); }
    });
    loadProducts();
  } catch (e) { box.innerHTML = '<p class="error">' + e.message + '</p>'; }
}

function masterPanelView() {
  document.querySelector('#app').innerHTML = `<main class="login"><section class="login-card" style="max-width:720px"><div class="brand"><img class="brand-logo" src="/assets/brand/MBI-LOGO.png" alt="MBI Inventra"><span>MBI <em>Inventra</em></span></div><h1>Master panel</h1><p>Controls all tenants. This page is not linked anywhere — only you open it by URL. Your master key stays in this browser session only and is never saved.</p><form id="masterKeyForm" style="display:flex;gap:8px"><input id="masterKey" type="password" placeholder="Master key (server env)" required style="flex:1;padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><button class="btn primary" type="submit">Unlock panel</button></form><div id="masterContent" style="margin-top:16px"></div></section></main>`;
  document.querySelector('#masterKeyForm').addEventListener('submit', (e) => { e.preventDefault(); sessionStorage.setItem('mbi_master_key', document.querySelector('#masterKey').value); loadMaster(); });
  async function loadMaster() {
    const key = sessionStorage.getItem('mbi_master_key'); if (!key) return;
    try {
      const data = await api('/api/master/tenants', { headers: { 'x-master-key': key } });
      document.querySelector('#masterContent').innerHTML = '<h3>Tenants (' + data.tenants.length + ')</h3><p style="font-size:12px;color:#627d98">Master panel sirf tenants ko control karta hai — tenant ka business data (orders, sales, inventory) yahan kabhi nahi dikhta, wo sirf us tenant ke owner ke paas hota hai.</p>' + (data.tenants.map(t => '<div class="activity"><div><strong>' + t.name + '</strong><span>' + t.id + ' - ' + t.plan + ' - ' + t.status + ' - DB ' + t.databaseName + '</span></div><button class="btn" data-store-toggle="' + t.id + '" data-store-enabled="' + ((t.features && t.features.onlineStore === false) ? '1' : '0') + '">Online store: ' + ((t.features && t.features.onlineStore === false) ? 'OFF — turn on' : 'ON — turn off') + '</button></div>').join('') || '<p>No tenants yet.</p>') +
        '<h3 style="margin-top:16px">Create tenant</h3><form id="masterTenantForm" style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><input name="name" placeholder="Pharmacy name *" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><select name="plan" style="padding:10px;border:1px solid #d9e2ec;border-radius:8px"><option value="basic">Basic</option><option value="advanced">Advanced</option></select><input name="ownerName" placeholder="Owner name *" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="ownerLogin" placeholder="Owner login *" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="ownerPassword" type="password" placeholder="Owner password (min 8) *" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><input name="branchName" placeholder="Branch name *" required style="padding:10px;border:1px solid #d9e2ec;border-radius:8px" /><button class="btn primary" type="submit">Create tenant</button></form><div id="masterResult" style="margin-top:12px"></div>';
      document.querySelectorAll('[data-store-toggle]').forEach(btn => btn.addEventListener('click', async () => { try { await api('/api/master/tenants/' + btn.dataset.storeToggle + '/features', { method: 'POST', headers: { 'x-master-key': key }, body: JSON.stringify({ feature: 'online_store', enabled: btn.dataset.storeEnabled === '1' }) }); loadMaster(); } catch (err) { alert(err.message); } }));
      document.querySelector('#masterTenantForm').addEventListener('submit', async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); try { const created = await api('/api/master/tenants', { method: 'POST', headers: { 'x-master-key': key }, body: JSON.stringify(f) }); document.querySelector('#masterResult').innerHTML = '<p>Tenant created: ' + created.tenant.id + '. Owner login: ' + f.ownerLogin + '</p>'; loadMaster(); } catch (err) { document.querySelector('#masterResult').innerHTML = '<p class="error">' + err.message + '</p>'; } });
    } catch (err) { document.querySelector('#masterContent').innerHTML = '<p class="error">' + err.message + '</p>'; }
  }
  if (sessionStorage.getItem('mbi_master_key')) loadMaster();
}

if (window.location.pathname === '/server') masterPanelView(); else if (window.location.pathname === '/register') registerView(); else if (window.location.pathname.startsWith('/store/')) storeView(window.location.pathname.slice(7)); else if (state.token) renderApp(); else loginView();
