/* Registrar gasto — app instalable. Guarda en "Archivo de Extractos" a través de Apps Script (doPost). */
'use strict';

// Publicación "API" de Apps Script (acceso anónimo; sin la clave no hace nada).
const API_URL = 'https://script.google.com/macros/s/AKfycby_bUuLvpQNeED3cp7aL-oXPZczOTXeKTYHCkTelK4r8jxULDkIAK_hSzjpf0C9CbTu/exec';
// Publicación "Conectar" (solo la cuenta dueña): entrega la clave a este celular.
const CONECTAR_URL = 'https://script.google.com/macros/s/AKfycbxVnLg4F4b5f-ZFJyAAj_HIx1qb_bzBB6o44OWAs0JZSMA6v502NrhGktiaL0HDMQeT/exec?conectar=1';
const MOCK = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && location.search.includes('mock');

const CATS_BASE = ['Restaurantes y comida fuera', 'Mercado y hogar', 'Transporte público', 'Transporte por app',
                   'Ropa y cuidado personal', 'Domicilios (Rappi)', 'Salud y droguería'];
const MEDIOS_BASE = ['Efectivo', 'Nequi', 'Cuenta Nu', 'TC Nu', 'Visa BdB', 'AV Villas'];
const CORTOS = {
  'Restaurantes y comida fuera': 'Comida', 'Mercado y hogar': 'Mercado', 'Transporte público': 'TuLlave',
  'Transporte por app': 'Uber / taxi', 'Ropa y cuidado personal': 'Cuidado', 'Domicilios (Rappi)': 'Domicilios',
  'Salud y droguería': 'Salud', 'Suscripciones (entretenimiento)': 'Suscripciones', 'Videojuegos y gaming': 'Juegos',
  'Servicios del hogar y telecom': 'Servicios', 'Entretenimiento y salidas': 'Salidas', 'Hogar y tecnología (compras grandes)': 'Tecnología',
  'Viajes y transporte intermunicipal': 'Viajes', 'Software e IA (trabajo)': 'Software', 'Libros y educación': 'Libros',
  'Moto (repuestos, taller, peajes, parqueo)': 'Moto', 'Compras online: Mercado Libre / Amazon / MP': 'Online', 'Gimnasio': 'Gym',
};
const ICONOS = [
  [/restaurante|comida/i, 'tools-kitchen-2'], [/mercado y hogar/i, 'shopping-cart'], [/transporte p[uú]blico/i, 'bus'],
  [/transporte por app/i, 'car'], [/domicilio/i, 'truck-delivery'], [/videojuego/i, 'device-gamepad-2'], [/suscrip/i, 'repeat'],
  [/servicios del hogar/i, 'bolt'], [/online|mercado pago/i, 'package'], [/moto/i, 'motorbike'], [/gasolina/i, 'gas-station'],
  [/salud/i, 'pill'], [/ropa|cuidado/i, 'scissors'], [/entreten|salidas/i, 'ticket'], [/mascota/i, 'paw'], [/libro/i, 'book'],
  [/gimnasio/i, 'barbell'], [/software/i, 'code'], [/viaje/i, 'map'], [/tecnolog/i, 'device-laptop'], [/seguro/i, 'shield'],
  [/impuesto/i, 'receipt-tax'], [/transferencia/i, 'arrows-exchange'], [/persona|laura|familia/i, 'user'],
  [/efectivo|retiro/i, 'cash'], [/tarjeta|cr[eé]dito|cuota|financier/i, 'credit-card'], [/vivienda|fiducia/i, 'home'],
  [/ahorro|rendimiento|ingreso|entradas|dep[oó]sito/i, 'pig-money'],
];

/* ───────────── Utilidades ───────────── */

const $ = (id) => document.getElementById(id);
const leer = (k, def) => { try { const v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } };
const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } };
// Los nombres de categoría y de medio vienen de la hoja: se escapan antes de ponerlos como HTML.
const esc = (t) => String(t).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const cop = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
const corto = (c) => CORTOS[c] || String(c).split(/\s+y\s+|\s*\(/)[0];
const icono = (c) => (ICONOS.find(([re]) => re.test(c)) || [null, 'tag'])[1];
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const vibrar = () => { try { navigator.vibrate && navigator.vibrate(6); } catch (e) { /* sin vibración */ } };
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* ───────────── Estado ───────────── */

let clave = leer('clave', '');
let datos = leer('datos', { todas: [], medios: MEDIOS_BASE, totales: null });
let usos = leer('usos', {});
let pendientes = leer('pendientes', []);          // gastos aún sin confirmar por la hoja
const confirmados = {};                            // id → ficha para deshacer
const deshacerAlLlegar = new Set();
let enviando = false;
const s = { digitos: '', cat: '', medio: leer('medio', ''), cuando: 'hoy', fecha: '', nota: '' };

/* ───────────── Pintar ───────────── */

function pintarTop() {
  const hoy = new Date();
  const dia = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'short' }).format(hoy).replace(',', '').replace('.', '');
  $('hoyFecha').textContent = dia.charAt(0).toUpperCase() + dia.slice(1);
  const mes = new Intl.DateTimeFormat('es-CO', { month: 'short' }).format(hoy).replace('.', '');
  const t = datos.totales;
  $('totales').innerHTML = `Hoy <b>${t ? cop(t.hoy) : '—'}</b> · ${mes.charAt(0).toUpperCase() + mes.slice(1)} <b>${t ? cop(t.mes) : '—'}</b>` +
                           '<i class="ti ti-chevron-down" aria-hidden="true"></i>';
  $('pend').classList.toggle('on', pendientes.length > 0);
  $('pendTxt').textContent = pendientes.length ? `${pendientes.length} por enviar ·` : '';
  if ($('hojaUltimos').classList.contains('on')) pintarUltimos();
}

/* ───────────── El mes y los últimos gastos ───────────── */

const fechaCorta = (dia) => {
  const [y, m, d] = String(dia).split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' }).format(new Date(y, m - 1, d)).replace('.', '');
};

function pintarUltimos() {
  const t = datos.totales;
  const mes = new Intl.DateTimeFormat('es-CO', { month: 'long' }).format(new Date());
  $('mesTitulo').textContent = mes.charAt(0).toUpperCase() + mes.slice(1);
  const prom = t && t.promedio > 0 ? t.promedio : 0;
  const parte = prom ? t.mes / prom : 0;
  $('mesResumen').textContent = !t ? 'Aún no hay datos de la hoja.'
    : prom ? `Llevas ${cop(t.mes)}. En un mes normal gastas ${cop(prom)}: vas en el ${Math.round(parte * 100)} %.`
    : `Llevas ${cop(t.mes)} este mes.`;
  $('mesBarra').style.width = Math.min(100, Math.round(parte * 100)) + '%';
  $('mesBarraFondo').classList.toggle('pasado', parte > 1);

  const cont = $('ultimos');
  cont.textContent = '';
  const filas = pendientes.slice().reverse().map((g) => ({ g, porEnviar: true, fecha: g.fecha, monto: g.monto, categoria: g.categoria, medio: g.medio, descripcion: g.nota }))
    .concat(datos.recientes || []);
  if (!filas.length) {
    const p = document.createElement('p');
    p.className = 'vacio';
    p.textContent = 'Aquí aparecen los gastos que anotes, para borrarlos si te equivocas.';
    cont.appendChild(p);
  }
  filas.forEach((x) => cont.appendChild(itemUltimo(x)));
}

/** Una fila de la lista. Todo el texto entra con textContent: son datos de la hoja. */
function itemUltimo(x) {
  const el = (tag, clase, texto) => { const e = document.createElement(tag); if (clase) e.className = clase; if (texto !== undefined) e.textContent = texto; return e; };
  const fila = el('div', 'item');
  const ico = el('i', `ti ti-${icono(x.categoria)}`);
  ico.setAttribute('aria-hidden', 'true');
  const txt = el('div', 'txt');
  txt.appendChild(el('b', '', x.descripcion || corto(x.categoria)));
  txt.appendChild(el('small', '', [x.fecha ? fechaCorta(x.fecha) : '', x.medio, x.porEnviar ? 'por enviar' : ''].filter(String).join(' · ')));
  const b = el('button', 'borrar');
  b.type = 'button';
  b.innerHTML = '<i class="ti ti-trash" aria-hidden="true"></i>';
  b.setAttribute('aria-label', `Borrar ${cop(x.monto)}, ${x.descripcion || corto(x.categoria)}`);
  let timer = null;
  b.addEventListener('click', () => {
    vibrar();
    if (!b.classList.contains('seguro')) {            // primer toque: pide confirmar
      b.classList.add('seguro'); b.textContent = '¿Borrar?';
      timer = setTimeout(() => { b.classList.remove('seguro'); b.innerHTML = '<i class="ti ti-trash" aria-hidden="true"></i>'; }, 3500);
      return;
    }
    clearTimeout(timer);
    b.disabled = true; b.textContent = '…';
    borrarUltimo(x);
  });
  fila.append(ico, txt, el('span', 'val num', cop(x.monto)), b);
  return fila;
}

async function borrarUltimo(x) {
  if (x.porEnviar) { await deshacer(x.g); pintarUltimos(); return; }
  try {
    const r = await api('deshacer', { deshacer: { hoja: x.hoja, fila: x.fila, id: x.id } });
    if (r.codigo === 401) { desconectar(); return; }
    if (!r.ok) throw new Error(r.error);
    if (r.totales) datos.totales = r.totales;
    datos.recientes = r.recientes || (datos.recientes || []).filter((y) => y.id !== x.id);
    escribir('datos', datos);
    pintarTop(); pintarUltimos();
    aviso('Listo, se borró ese gasto.');
  } catch (e) {
    aviso('No se pudo borrar: ' + (e.message || 'sin señal'), null, null, true);
    pintarUltimos();
    refrescar();
  }
}

/* ───────────── Paneles que suben (el botón atrás de Android los cierra) ───────────── */

function abrirPanel(id) {
  $(id).classList.add('on');
  try { history.pushState({ panel: id }, ''); } catch (e) { /* sin historial */ }
}
function cerrarPanel(id) {
  if (!$(id).classList.contains('on')) return;
  $(id).classList.remove('on');
  try { if (history.state && history.state.panel) history.back(); } catch (e) { /* sin historial */ }
}
window.addEventListener('popstate', () => document.querySelectorAll('.hoja.on').forEach((h) => h.classList.remove('on')));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.hoja.on').forEach((h) => cerrarPanel(h.id)); });
document.querySelectorAll('.hoja').forEach((h) => h.addEventListener('click', (e) => { if (e.target === h) cerrarPanel(h.id); }));
$('totales').addEventListener('click', () => { vibrar(); pintarUltimos(); abrirPanel('hojaUltimos'); refrescar(); });

function pintarMonto() {
  $('digitos').textContent = s.digitos ? Number(s.digitos).toLocaleString('es-CO') : '0';
  $('valor').classList.toggle('cero', !s.digitos);
  const b = $('guardar');
  const falta = queFalta();
  b.classList.toggle('falta', !!falta);
  b.classList.remove('listo');
  b.textContent = falta || `Guardar ${cop(s.digitos)}`;
}

function queFalta() {
  if (!s.digitos) return 'Escribe el monto';
  if (!s.cat) return 'Elige la categoría';
  if (!s.medio) return 'Elige con qué pagaste';
  return '';
}

function visibles() {
  const existe = (c) => !datos.todas.length || datos.todas.includes(c);
  const usadas = Object.keys(usos).sort((a, b) => usos[b] - usos[a]);
  const orden = [...new Set([...usadas, ...CATS_BASE])].filter(existe);
  return orden.slice(0, 7);
}

function boton(clase, valor, contenido, alTocar) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = clase; b.dataset.v = valor; b.innerHTML = contenido;
  b.addEventListener('click', () => { vibrar(); alTocar(valor); });
  return b;
}

function pintarCats() {
  const cont = $('cats');
  cont.textContent = '';
  const vis = visibles();
  vis.forEach((c) => {
    const b = boton('cat', c, `<i class="ti ti-${icono(c)}" aria-hidden="true"></i>${esc(corto(c))}`, elegirCat);
    b.setAttribute('aria-pressed', String(s.cat === c));
    cont.appendChild(b);
  });
  const fuera = s.cat && !vis.includes(s.cat);
  const mas = boton('cat', '__mas', fuera ? `<i class="ti ti-${icono(s.cat)}" aria-hidden="true"></i>${esc(corto(s.cat))}`
                                          : '<i class="ti ti-dots" aria-hidden="true"></i>Más', abrirHoja);
  mas.setAttribute('aria-pressed', String(!!fuera));
  mas.setAttribute('aria-label', fuera ? `${s.cat}. Cambiar categoría` : 'Más categorías');
  cont.appendChild(mas);
}

function pintarMedios() {
  const cont = $('medios');
  cont.textContent = '';
  (datos.medios && datos.medios.length ? datos.medios : MEDIOS_BASE).forEach((m) => {
    const b = boton('medio', m, esc(m), (v) => { s.medio = v; escribir('medio', v); pintarMedios(); pintarMonto(); });
    b.setAttribute('aria-pressed', String(s.medio === m));
    cont.appendChild(b);
  });
}

function pintarFechas() {
  document.querySelectorAll('.fechas button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cuando === s.cuando)));
  if (s.cuando === 'fecha' && s.fecha) {
    const [y, m, d] = s.fecha.split('-').map(Number);
    const txt = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(y, m - 1, d));
    $('otraTxt').textContent = txt.replace(/\./g, '').replace(',', '');
  } else $('otraTxt').textContent = 'Otra fecha';
}

function pintarTodo() { pintarTop(); pintarMonto(); pintarCats(); pintarMedios(); pintarFechas(); }

/* ───────────── Interacción ───────────── */

function elegirCat(c) { s.cat = c; pintarCats(); pintarMonto(); }

function abrirHoja() {
  const lista = $('lista');
  lista.textContent = '';
  const todas = datos.todas.length ? datos.todas : [...new Set([...CATS_BASE, ...Object.keys(CORTOS)])].sort((a, b) => a.localeCompare(b, 'es'));
  todas.forEach((c) => {
    const b = boton('opcion', c, `<i class="ti ti-${icono(c)}" aria-hidden="true"></i><span>${esc(c)}</span>`, (v) => { cerrarHoja(); elegirCat(v); });
    b.setAttribute('aria-pressed', String(s.cat === c));
    lista.appendChild(b);
  });
  abrirPanel('hoja');
}
function cerrarHoja() { cerrarPanel('hoja'); }

$('teclado').addEventListener('click', (e) => {
  const t = e.target.closest('.tecla');
  if (!t) return;
  vibrar();
  if (t.hasAttribute('data-borrar')) s.digitos = s.digitos.slice(0, -1);
  else if (t.textContent === '000') { if (s.digitos) s.digitos = (s.digitos + '000').slice(0, 9); }
  else s.digitos = (s.digitos + t.textContent).replace(/^0+/, '').slice(0, 9);
  pintarMonto();
});

// Mantener presionado "borrar" limpia el monto.
let timerBorrar = null;
const borrar = document.querySelector('[data-borrar]');
borrar.addEventListener('pointerdown', () => { timerBorrar = setTimeout(() => { s.digitos = ''; vibrar(); pintarMonto(); }, 550); });
['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => borrar.addEventListener(ev, () => clearTimeout(timerBorrar)));

document.querySelector('.fechas').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  vibrar();
  if (b.dataset.cuando !== 'fecha') { s.cuando = b.dataset.cuando; s.fecha = ''; pintarFechas(); return; }
  const inp = $('fechaInput');
  const hoy = new Date();
  inp.max = ymd(hoy);
  inp.min = ymd(new Date(hoy.getTime() - 60 * 864e5));
  inp.value = s.fecha || ymd(new Date(hoy.getTime() - 2 * 864e5));
  try { inp.showPicker(); } catch (err) { inp.focus(); inp.click(); }
});
$('fechaInput').addEventListener('change', (e) => {
  if (!e.target.value) return;
  s.cuando = 'fecha'; s.fecha = e.target.value; pintarFechas();
});

$('btnNota').addEventListener('click', () => { $('nota').classList.add('on'); $('btnNota').style.display = 'none'; $('nota').focus(); });
$('nota').addEventListener('input', (e) => { s.nota = e.target.value; });
$('nota').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.target.blur(); } });

/* ───────────── Avisos ───────────── */

let timerToast = null;
function aviso(texto, accion, alTocar, error) {
  const t = $('toast');
  $('toastTxt').textContent = texto;
  const b = $('toastBtn');
  b.textContent = accion || '';
  b.style.display = accion ? '' : 'none';
  b.onclick = () => { ocultarAviso(); alTocar && alTocar(); };
  t.classList.toggle('err', !!error);
  t.classList.add('on');
  clearTimeout(timerToast);
  timerToast = setTimeout(ocultarAviso, accion ? 6000 : 3500);
}
function ocultarAviso() { $('toast').classList.remove('on'); }

/* ───────────── Guardar, enviar y deshacer ───────────── */

function sumarTotales(g, signo) {
  if (!datos.totales) return;
  const hoy = ymd(new Date());
  const dia = g.fecha || (g.cuando === 'ayer' ? ymd(new Date(Date.now() - 864e5)) : hoy);
  const v = signo * Number(g.monto);
  if (dia === hoy) datos.totales.hoy += v;
  if (dia.slice(0, 7) === hoy.slice(0, 7)) datos.totales.mes += v;
  escribir('datos', datos);
}

function guardar() {
  const falta = queFalta();
  if (falta) { vibrar(); aviso(falta + '.'); return; }
  // El día queda fijo desde ya: si el gasto sale horas después (sin señal), "hoy" sigue siendo el día en que se anotó.
  const dia = s.cuando === 'fecha' ? s.fecha : ymd(new Date(Date.now() - (s.cuando === 'ayer' ? 864e5 : 0)));
  const g = { id: uuid(), monto: s.digitos, categoria: s.cat, medio: s.medio, nota: s.nota.trim(), cuando: s.cuando, fecha: dia };
  pendientes.push(g);
  escribir('pendientes', pendientes);
  usos[g.categoria] = (usos[g.categoria] || 0) + 1;
  escribir('usos', usos);
  sumarTotales(g, 1);

  const b = $('guardar');
  b.classList.add('listo');
  b.innerHTML = '<i class="ti ti-check" aria-hidden="true"></i>Guardado';
  setTimeout(pintarMonto, 900);
  aviso(`${cop(g.monto)} · ${corto(g.categoria)} · ${g.medio}`, 'Deshacer', () => deshacer(g));

  s.digitos = ''; s.nota = ''; s.cuando = 'hoy'; s.fecha = '';
  $('nota').value = ''; $('nota').classList.remove('on'); $('btnNota').style.display = '';
  pintarTop(); pintarCats(); pintarFechas();
  enviar();
}
$('guardar').addEventListener('click', guardar);

async function deshacer(g) {
  const i = pendientes.findIndex((x) => x.id === g.id);
  if (i >= 0 && !(enviando && i === 0)) {          // aún no salió: se quita de la cola
    pendientes.splice(i, 1);
    escribir('pendientes', pendientes);
    sumarTotales(g, -1); pintarTop();
    aviso('Listo, no se guardó.');
    return;
  }
  if (!confirmados[g.id]) { deshacerAlLlegar.add(g.id); return; }   // va en camino: se borra al confirmar
  try {
    const r = await api('deshacer', { deshacer: confirmados[g.id] });
    if (!r.ok) throw new Error(r.error);
    delete confirmados[g.id];
    if (r.recientes) datos.recientes = r.recientes;
    if (r.totales) { datos.totales = r.totales; escribir('datos', datos); }
    pintarTop();
    aviso('Listo, se borró ese gasto.');
  } catch (e) {
    aviso('No se pudo deshacer: ' + e.message, null, null, true);
  }
}

/** Lo que viaja a la hoja: el día guardado al anotar. Solo va como "hoy" si de verdad sigue siendo hoy. */
function paraEnviar(g) {
  if (!g.fecha) return g;   // gastos en cola de una versión anterior
  return Object.assign({}, g, { cuando: g.fecha === ymd(new Date()) ? 'hoy' : 'fecha' });
}

async function enviar() {
  if (enviando || !clave || !pendientes.length) { pintarTop(); return; }
  enviando = true;
  while (pendientes.length) {
    const g = pendientes[0];
    let r;
    try { r = await api('guardar', { gasto: paraEnviar(g) }); }
    catch (e) { break; }                                             // sin señal: se reintenta después
    if (r.codigo === 401) { desconectar(); break; }
    pendientes.shift();
    escribir('pendientes', pendientes);
    if (!r.ok) {   // la hoja lo rechazó: se devuelve lo que se había sumado al total
      sumarTotales(g, -1);
      aviso(`No se guardó ${cop(g.monto)}: ${r.error}`, null, null, true);
      continue;
    }
    if (r.totales) datos.totales = r.totales;
    if (r.recientes) datos.recientes = r.recientes;
    escribir('datos', datos);
    if (r.deshacer) confirmados[g.id] = r.deshacer;
    if (deshacerAlLlegar.has(g.id)) { deshacerAlLlegar.delete(g.id); deshacer(g); }
  }
  enviando = false;
  pintarTop();
}

/* ───────────── Conexión con la hoja ───────────── */

async function api(accion, extra) {
  if (MOCK) return falsa(accion, extra);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 25000);
  try {
    const res = await fetch(API_URL, {
      method: 'POST', redirect: 'follow', signal: ctl.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ t: clave, a: accion }, extra || {})),
    });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function refrescar() {
  if (!clave) return;
  try {
    const r = await api('datos');
    if (r.codigo === 401) { desconectar(); return; }
    if (!r.ok) return;
    datos = { todas: r.todas || [], medios: r.medios || MEDIOS_BASE, totales: r.totales || null, recientes: r.recientes || [] };
    pendientes.forEach((g) => sumarTotales(g, 1));   // lo que aún no llega a la hoja
    escribir('datos', datos);
    pintarTodo();
  } catch (e) { /* sin señal: queda lo guardado */ }
}

function desconectar() {
  clave = '';
  escribir('clave', '');
  document.body.classList.add('sin-clave');
  $('conectar').classList.add('on');
}

$('btnConectar').addEventListener('click', () => {
  if (MOCK) { location.hash = '#t=prueba'; location.reload(); return; }
  location.href = CONECTAR_URL;
});

/* ───────────── Modo de prueba local (?mock en localhost) ───────────── */

const falso = { totales: { hoy: 0, mes: 152000, promedio: 3043921 }, n: 0, recientes: [
  { hoja: 'En vivo', fila: 12, id: 'peluqueria', fecha: '2026-11-03', monto: 17500, categoria: 'Ropa y cuidado personal', medio: 'Nequi', descripcion: 'Peluquería (José del Carmen Soler)' },
] };
function falsa(accion, extra) {
  const espera = (v) => new Promise((ok, ko) => setTimeout(() => (location.search.includes('caida') ? ko(new Error('sin red')) : ok(v)), 450));
  if (accion === 'datos') {
    return espera({ ok: true, todas: [...new Set([...CATS_BASE, ...Object.keys(CORTOS), 'Gasolina', 'Mascotas', 'Seguros'])].sort((a, b) => a.localeCompare(b, 'es')),
                    medios: MEDIOS_BASE, totales: Object.assign({}, falso.totales), recientes: falso.recientes.slice() });
  }
  if (accion === 'guardar') {
    const g = extra.gasto;
    if (g.cuando === 'hoy') falso.totales.hoy += Number(g.monto);
    falso.totales.mes += Number(g.monto);
    window.__guardados = (window.__guardados || []).concat([g]);
    const fila = 20 + (++falso.n);
    falso.recientes.unshift({ hoja: 'En vivo', fila, id: g.id, fecha: g.fecha, monto: Number(g.monto), categoria: g.categoria, medio: g.medio, descripcion: g.nota || corto(g.categoria) });
    return espera({ ok: true, totales: Object.assign({}, falso.totales), recientes: falso.recientes.slice(), deshacer: { hoja: 'En vivo', fila, id: g.id } });
  }
  if (accion === 'deshacer') {
    window.__deshechos = (window.__deshechos || []).concat([extra.deshacer]);
    const x = falso.recientes.find((y) => y.id === extra.deshacer.id);
    if (x) { falso.totales.mes -= x.monto; if (x.fecha === ymd(new Date())) falso.totales.hoy -= x.monto; }
    falso.recientes = falso.recientes.filter((y) => y.id !== extra.deshacer.id);
    return espera({ ok: true, totales: Object.assign({}, falso.totales), recientes: falso.recientes.slice() });
  }
  return espera({ ok: false, error: 'acción' });
}

/* ───────────── Arranque ───────────── */

if (location.hash.indexOf('#t=') === 0) {
  clave = decodeURIComponent(location.hash.slice(3));
  escribir('clave', clave);
  history.replaceState(null, '', location.pathname + location.search);
}
if (!clave) desconectar();
pintarTodo();
refrescar();
enviar();
window.addEventListener('online', enviar);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { refrescar(); enviar(); } });
setInterval(() => { if (pendientes.length) enviar(); }, 30000);
if ('serviceWorker' in navigator && !MOCK) navigator.serviceWorker.register('sw.js').catch(() => {});
