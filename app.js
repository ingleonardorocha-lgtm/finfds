// Firebase config (user-provided)
const firebaseConfig = {
  apiKey: "AIzaSyAlvYyMNrWzEqgUw5k7iV4KPQpmuRRh3ms",
  authDomain: "fds-sorteo.firebaseapp.com",
  projectId: "fds-sorteo",
  storageBucket: "fds-sorteo.firebasestorage.app",
  messagingSenderId: "240336284711",
  appId: "1:240336284711:web:cd9fc3a1eecfba1b3ef202",
  measurementId: "G-YWLZ4VMNXJ"
};

try { firebase.initializeApp(firebaseConfig); } catch(e) { console.warn('Firebase init:', e); }
const db = (typeof firebase !== 'undefined' && firebase.firestore) ? firebase.firestore() : null;
const docRef = db ? db.collection('rifas').doc('active') : null;

let adminMode = false;
let rifa = null;
let gridHandler = null;

function pad2(n){ return (''+n).padStart(2,'0'); }
function generateNumbers(){ return Array.from({length:100}, (_,i)=>({ numero: pad2(i), disponible:true })); }
function formatDateISO(dt){ if(!dt) return ''; try{ const d=new Date(dt); return d.toISOString(); } catch(e){ return dt; } }
function formatDisplay(dt){ if(!dt) return 'Sin fecha'; try{ const d=new Date(dt); return d.toLocaleString(); } catch(e){ return dt; } }

// Realtime listener
if(docRef){
  docRef.onSnapshot(doc=>{ rifa = doc.exists ? doc.data() : null; renderAll(); }, err=>{ console.error('Firestore listener error:', err); alert('Error conectando a Firestore: '+err.message); });
} else {
  document.addEventListener('DOMContentLoaded', ()=> renderAll());
}

function renderAll(){
  renderRifa();
  if(adminMode) createAdminPanel(); else removeAdminPanel();
  if(adminMode) renderParticipants();
  updateLoginUI();
}

// Public raffle rendering (no admin controls visible)
function renderRifa(){
  const el = document.getElementById('rifa-activa');
  if(!el) return;
  if(!rifa){ el.innerHTML = '<div class="card"><p>No hay rifa activa.</p></div>'; return; }
  const fecha = formatDisplay(rifa.fechaHora);
  let nums = '<div class="numeros" id="numeros-grid">';
  (rifa.numeros || []).forEach(n=>{
    const cls = n.disponible ? 'numero' : 'numero no-disponible';
    // clickable class only if adminMode AND available
    const clickable = adminMode && n.disponible ? ' clickable' : '';
    nums += `<div class="${cls}${clickable}" data-num="${n.numero}">${n.numero}</div>`;
  });
  nums += '</div>';
  const winner = rifa.ganador ? `<p class="meta"><strong>🏆 Ganador:</strong> <span>${rifa.nombreGanador||''} — ${rifa.ganador}</span></p>` : '';
  el.innerHTML = `
    <div class="card rifa">
      <h2>${rifa.titulo}</h2>
      <p>${rifa.descripcion}</p>
      <div class="meta"><strong>🎁 Premio:</strong> <span>${rifa.premio}</span> · <strong>💰 Acumulado:</strong> ${rifa.acumulado||'-'}</div>
      <div class="meta"><strong>📅 Fecha y hora:</strong> ${fecha}</div>
      ${nums}
      ${winner}
    </div>
  `;
  setupGridHandler();
}

// Grid handler - only active in admin mode
function setupGridHandler(){
  const grid = document.getElementById('numeros-grid');
  if(!grid){ gridHandler = null; return; }
  if(gridHandler) grid.removeEventListener('click', gridHandler);
  if(!adminMode){ gridHandler = null; return; }
  gridHandler = function(e){
    const node = e.target.closest('[data-num]');
    if(!node) return;
    const num = node.getAttribute('data-num');
    onNumeroClick(num);
  };
  grid.addEventListener('click', gridHandler);
}

// ADMIN UI creation (dynamically)
function createAdminPanel(){
  if(document.getElementById('admin-panel')) return;
  const mainArea = document.getElementById('main-area');
  const admin = document.createElement('div');
  admin.id = 'admin-panel';
  admin.className = 'card';
  admin.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <h3 style="margin:0">Panel de administración</h3>
      <div><button id="btn-logout" class="btn btn-secondary">Salir</button></div>
    </div>
    <label>Título</label><input id="admin-titulo" type="text" />
    <label>Descripción</label><input id="admin-descripcion" type="text" />
    <label>Premio</label><input id="admin-premio" type="text" />
    <label>Acumulado</label><input id="admin-acumulado" type="text" />
    <label>Fecha y hora</label><input id="admin-fechaHora" type="datetime-local" />
    <div style="display:flex;gap:8px;margin-top:10px">
      <button id="btn-create" class="btn btn-primary">Crear rifa</button>
      <button id="btn-save" class="btn btn-primary">Guardar cambios</button>
      <button id="btn-delete" class="btn btn-secondary">Eliminar rifa</button>
    </div>
  `;
  mainArea.insertBefore(admin, document.getElementById('rifa-activa'));

  // Sidebar participants
  const sidebar = document.getElementById('sidebar');
  sidebar.innerHTML = `<div class="card"><div class="title"><strong>Participantes</strong></div><div class="participants"><table id="participants-table" class="participants-table"><thead><tr><th>Número</th><th>Nombre</th><th>Contacto</th><th>Acción</th></tr></thead><tbody></tbody></table></div></div>`;
  sidebar.classList.remove('hidden');
  sidebar.setAttribute('aria-hidden','false');

  // bind actions
  document.getElementById('btn-logout').addEventListener('click', logoutAdmin);
  document.getElementById('btn-create').addEventListener('click', crearRifa);
  document.getElementById('btn-save').addEventListener('click', editarRifa);
  document.getElementById('btn-delete').addEventListener('click', eliminarRifa);

  loadAdminForm();
  renderParticipants();
}

// Remove admin UI
function removeAdminPanel(){
  const admin = document.getElementById('admin-panel');
  if(admin && admin.parentNode) admin.parentNode.removeChild(admin);
  const sidebar = document.getElementById('sidebar');
  if(sidebar){ sidebar.innerHTML = ''; sidebar.classList.add('hidden'); sidebar.setAttribute('aria-hidden','true'); }
  if(gridHandler){
    const g = document.getElementById('numeros-grid');
    if(g) g.removeEventListener('click', gridHandler);
    gridHandler = null;
  }
}

// Participants rendering
function renderParticipants(){
  const tbody = document.querySelector('#participants-table tbody');
  if(!tbody) return;
  tbody.innerHTML = '';
  if(!rifa) return;
  const taken = (rifa.numeros || []).filter(n=> !n.disponible);
  taken.sort((a,b)=> a.numero.localeCompare(b.numero));
  taken.forEach(n=>{
    const tr = document.createElement('tr');
    const td1 = document.createElement('td'); td1.textContent = n.numero;
    const td2 = document.createElement('td'); td2.textContent = n.clienteNombre||'';
    const td3 = document.createElement('td'); td3.textContent = n.clienteNumero||'';
    const td4 = document.createElement('td');
    const btn = document.createElement('button'); btn.textContent = 'Liberar'; btn.className = 'btn btn-secondary'; btn.addEventListener('click', ()=>{ if(confirm('Liberar número ' + n.numero + '?')) liberarNumero(n.numero); });
    td4.appendChild(btn);
    tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3); tr.appendChild(td4);
    tbody.appendChild(tr);
  });
}

// ADMIN actions (Firestore-backed)
function crearRifa(){
  if(!adminMode) return alert('Solo admin');
  if(!docRef) return alert('Firestore no configurado');
  if(rifa) return alert('Ya existe una rifa activa. Elimínala o edítala.');
  const t = document.getElementById('admin-titulo').value.trim();
  const d = document.getElementById('admin-descripcion').value.trim();
  const p = document.getElementById('admin-premio').value.trim();
  const a = document.getElementById('admin-acumulado').value.trim();
  const f = document.getElementById('admin-fechaHora').value;
  if(!t||!d||!p||!f) return alert('Completa los campos obligatorios');
  const newR = { titulo:t, descripcion:d, premio:p, acumulado:a, fechaHora:formatDateISO(f), numeros: generateNumbers(), ganador:null, nombreGanador:'' };
  docRef.set(newR).catch(e=>alert('Error creando rifa: '+e.message));
}

function editarRifa(){
  if(!adminMode) return alert('Solo admin');
  if(!rifa) return alert('No hay rifa activa');
  if(!docRef) return alert('Firestore no configurado');
  const t = document.getElementById('admin-titulo').value.trim();
  const d = document.getElementById('admin-descripcion').value.trim();
  const p = document.getElementById('admin-premio').value.trim();
  const a = document.getElementById('admin-acumulado').value.trim();
  const f = document.getElementById('admin-fechaHora').value;
  if(!t||!d||!p||!f) return alert('Completa los campos');
  docRef.update({ titulo:t, descripcion:d, premio:p, acumulado:a, fechaHora:formatDateISO(f) }).catch(e=>alert('Error actualizando: '+e.message));
}

function eliminarRifa(){
  if(!adminMode) return alert('Solo admin');
  if(!rifa) return alert('No hay rifa');
  if(!confirm('¿Eliminar rifa?')) return;
  if(!docRef) return alert('Firestore no configurado');
  docRef.delete().catch(e=>alert('Error eliminando: '+e.message));
}

function loadAdminForm(){
  if(!rifa) return;
  const elT = document.getElementById('admin-titulo');
  const elD = document.getElementById('admin-descripcion');
  const elP = document.getElementById('admin-premio');
  const elA = document.getElementById('admin-acumulado');
  const elF = document.getElementById('admin-fechaHora');
  if(elT) elT.value = rifa.titulo || '';
  if(elD) elD.value = rifa.descripcion || '';
  if(elP) elP.value = rifa.premio || '';
  if(elA) elA.value = rifa.acumulado || '';
  if(elF) elF.value = rifa.fechaHora ? new Date(rifa.fechaHora).toISOString().slice(0,16) : '';
}

// handle number click (admin)
function onNumeroClick(numero){
  if(!adminMode || !rifa) return;
  const existing = (rifa.numeros || []).find(n=> n.numero === numero);
  if(!existing) return;
  if(!existing.disponible){
    const info = `Número ${numero} ya está ocupado\nCliente: ${existing.clienteNombre||'--'}\nContacto: ${existing.clienteNumero||'--'}\n\n¿Liberar número?`;
    if(confirm(info)) liberarNumero(numero);
    return;
  }
  showAssignModal(numero);
}

// modal functions
function showAssignModal(numero){
  const modal = document.getElementById('assign-modal');
  if(!modal) return;
  document.getElementById('modal-numero').textContent = numero;
  document.getElementById('modal-nombre').value = '';
  document.getElementById('modal-contacto').value = '';
  modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false');
  setTimeout(()=> document.getElementById('modal-nombre').focus(), 50);
}
function hideAssignModal(){ const modal = document.getElementById('assign-modal'); if(!modal) return; modal.classList.add('hidden'); modal.setAttribute('aria-hidden','true'); }

function assignNumberFromModal(){
  const numero = document.getElementById('modal-numero').textContent;
  const nombre = document.getElementById('modal-nombre').value.trim();
  const contacto = document.getElementById('modal-contacto').value.trim();
  if(!numero) return alert('Número inválido');
  if(!nombre) return alert('Ingresa nombre del comprador');
  if(!contacto) return alert('Ingresa contacto');
  if(!docRef) return alert('Firestore no configurado');
  const updated = (rifa.numeros || []).map(n=> n.numero === numero ? {...n, disponible:false, clienteNombre:nombre, clienteNumero:contacto} : n);
  docRef.update({ numeros: updated }).then(()=> hideAssignModal() ).catch(e=> alert('Error guardando: '+e.message));
}

// liberar número
function liberarNumero(numero){
  if(!adminMode || !rifa) return;
  if(!docRef) return alert('Firestore no configurado');
  const updated = (rifa.numeros || []).map(n=> n.numero === numero ? {...n, disponible:true, clienteNombre:null, clienteNumero:null} : n);
  docRef.update({ numeros: updated }).catch(e=> alert('Error liberando: '+e.message));
}

// assign winner
function asignarGanador(){
  if(!adminMode || !rifa) return alert('Solo admin');
  const raw = (document.getElementById('ganador-input')||{}).value || '';
  const nombre = (document.getElementById('ganador-nombre')||{}).value || '';
  const digits = raw.replace(/\D/g,'');
  if(!digits) return alert('Ingresa número 00-99');
  const num = parseInt(digits,10);
  if(isNaN(num) || num < 0 || num > 99) return alert('Número inválido');
  if(!nombre.trim()) return alert('Ingresa nombre del ganador');
  if(!docRef) return alert('Firestore no configurado');
  docRef.update({ ganador: pad2(num), nombreGanador: nombre.trim() }).catch(e=> alert('Error asignando ganador: '+e.message));
}

// login/logout UI control
function loginAdmin(){
  const pass = (document.getElementById('admin-pass')||{}).value || '';
  if(pass.trim() === 'fds123'){
    adminMode = true;
    renderAll();
  } else {
    alert('Contraseña incorrecta');
  }
}
function logoutAdmin(){
  adminMode = false;
  renderAll();
}

// update login UI visibility (login stays in header when public)
function updateLoginUI(){
  const login = document.getElementById('login-wrap');
  if(!login) return;
  if(adminMode) login.classList.add('hidden'); else login.classList.remove('hidden');
}

// bind modal buttons and login after DOM ready
document.addEventListener('DOMContentLoaded', ()=>{
  const btnLogin = document.getElementById('btn-login'); if(btnLogin) btnLogin.addEventListener('click', loginAdmin);
  const modalCancel = document.getElementById('modal-cancel'); if(modalCancel) modalCancel.addEventListener('click', hideAssignModal);
  const modalSave = document.getElementById('modal-save'); if(modalSave) modalSave.addEventListener('click', assignNumberFromModal);
  const assignModal = document.getElementById('assign-modal'); if(assignModal) assignModal.addEventListener('click', (e)=>{ if(e.target === assignModal) hideAssignModal(); });
});
