/* Silvia 60 · utilidades compartidas */
(function () {
  const C = window.CONFIG;

  const $ = (sel, raiz = document) => raiz.querySelector(sel);
  const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // localStorage puede fallar (modo privado): siempre con try/catch
  const local = {
    leer(clave, def = null) { try { const v = localStorage.getItem('s60_' + clave); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
    guardar(clave, valor) { try { localStorage.setItem('s60_' + clave, JSON.stringify(valor)); } catch (e) {} },
    borrar(clave) { try { localStorage.removeItem('s60_' + clave); } catch (e) {} }
  };

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function idDispositivo() {
    let id = local.leer('dispositivo');
    if (!id) { id = uuid(); local.guardar('dispositivo', id); }
    return id;
  }

  function toast(texto, tipo = '', ms = 3500) {
    let zona = $('.toast-zona');
    if (!zona) { zona = document.createElement('div'); zona.className = 'toast-zona'; zona.setAttribute('role', 'status'); zona.setAttribute('aria-live', 'polite'); document.body.appendChild(zona); }
    const t = document.createElement('div');
    t.className = 'toast ' + tipo;
    t.textContent = texto;
    zona.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  function url(ruta = '') { return C.base + ruta; }

  function urlMaps() {
    if (C.mapsUrl) return C.mapsUrl;
    const q = `${C.lugar.nombre}, ${C.lugar.direccion}, ${C.lugar.localidad}`;
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  }

  // --- Datos del evento: vienen de la base (panel → Evento); config.js es el respaldo ---
  const ZONA = { timeZone: 'America/Argentina/San_Juan' };
  const mayus = s => s.charAt(0).toUpperCase() + s.slice(1);
  function derivarEvento() {
    const f = new Date(C.fechaEvento);
    C.fechaTexto = mayus(f.toLocaleDateString('es-AR', Object.assign({ weekday: 'long', day: 'numeric', month: 'long' }, ZONA)).replace(',', ''));
    C.fechaCorta = mayus(f.toLocaleDateString('es-AR', Object.assign({ weekday: 'short' }, ZONA)).replace('.', '').slice(0, 3)) + ' ' +
      f.toLocaleDateString('es-AR', Object.assign({ day: 'numeric', month: 'long' }, ZONA));
    const [hh, mm] = f.toLocaleTimeString('es-AR', Object.assign({ hour: '2-digit', minute: '2-digit', hour12: false }, ZONA)).split(':');
    C.horaTexto = mm === '00' ? `${+hh} h` : `${hh}:${mm} h`;
    C.horaInput = `${hh}:${mm}`;
    C.fotosDesde = new Date(f.getTime() - 2 * 3600e3).toISOString();   // /fotos se habilita 2 h antes
    C.fechaLimiteTexto = new Date(C.fechaLimiteRsvp).toLocaleDateString('es-AR', Object.assign({ day: 'numeric', month: 'long' }, ZONA));
  }
  function aplicarEvento(e) {
    if (!e) return;
    if (e.fecha_evento) C.fechaEvento = new Date(e.fecha_evento).toISOString();
    if (e.texto_puntual) C.textoPuntual = e.texto_puntual;
    if (e.fecha_limite_rsvp) C.fechaLimiteRsvp = new Date(e.fecha_limite_rsvp).toISOString();
    derivarEvento();
  }
  let eventoListo = null;
  // Se llama una vez al arrancar cada página. Si la base tarda más de 4 s, sigue con config.js.
  function cargarEvento() {
    if (!eventoListo) eventoListo = (async () => {
      derivarEvento();
      try {
        const e = await Promise.race([window.Datos.evento(), new Promise((_, mal) => setTimeout(() => mal(new Error('tiempo')), 4000))]);
        aplicarEvento(e);
      } catch (err) { console.warn('Datos del evento desde config.js', err && err.message); }
    })();
    return eventoListo;
  }

  // --- Fechas ---
  const fechaEvento = () => new Date(C.fechaEvento);
  function partesRestantes(hasta) {
    let ms = Math.max(0, hasta - Date.now());
    const dias = Math.floor(ms / 864e5); ms -= dias * 864e5;
    const horas = Math.floor(ms / 36e5); ms -= horas * 36e5;
    const minutos = Math.floor(ms / 6e4); ms -= minutos * 6e4;
    const segundos = Math.floor(ms / 1e3);
    return { dias, horas, minutos, segundos };
  }
  // --- Pantalla a prueba de fallas: ¿la trivia sigue a la vista o la pantalla vuelve sola al muro? ---
  // Lo usan /pantalla (para volver sola) y el panel (para decir qué se está viendo en el salón).
  //   · podio sin jugadores → muro al instante
  //   · podio 60 s, ranking 90 s, cualquier otra fase 3 min sin cambios → muro
  const LIMITE_FASE = { podio: 60e3, ranking: 90e3 }, LIMITE_OTRAS = 180e3;
  function triviaAlMuro(fase, edadMs, jugadores) {
    if (!fase || fase === 'apagada') return 'apagada';
    if (fase === 'podio' && jugadores === 0) return 'podio sin jugadores';
    if (edadMs > (LIMITE_FASE[fase] || LIMITE_OTRAS)) return 'tiempo';
    return '';
  }

  // modoPrueba: lo prende el admin desde el panel (Pantalla → Modo prueba) para probar /fotos antes del día
  function fotosHabilitadas(modoPrueba) {
    if (modoPrueba || new URLSearchParams(location.search).has('prueba')) return true;
    return Date.now() >= new Date(C.fotosDesde).getTime();
  }
  async function modoPruebaActivo() {
    try { return !!(window.Datos && (await Datos.pantalla()).modo_prueba); } catch (e) { return false; }
  }
  function rsvpAbierto() { return Date.now() <= new Date(C.fechaLimiteRsvp).getTime(); }

  // --- Calendario ---
  function fechaIcs(d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
  function datosEvento() {
    const ini = fechaEvento();
    const fin = new Date(ini.getTime() + C.duracionHoras * 36e5);
    const titulo = `Cumple 60 de ${C.homenajeada} 🥂`;
    const lugar = `${C.lugar.nombre}, ${C.lugar.direccion}, ${C.lugar.localidad}`;
    const detalle = `${C.textoPuntual}\nDress code: ${C.dressCode.titulo}\nInvitación: ${url()}`;
    return { ini, fin, titulo, lugar, detalle };
  }
  function urlGoogleCalendar() {
    const e = datosEvento();
    const p = new URLSearchParams({ action: 'TEMPLATE', text: e.titulo, dates: fechaIcs(e.ini) + '/' + fechaIcs(e.fin), details: e.detalle, location: e.lugar, ctz: 'America/Argentina/San_Juan' });
    return 'https://calendar.google.com/calendar/render?' + p.toString();
  }
  function descargarIcs() {
    const e = datosEvento();
    const escIcs = s => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Silvia60//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:silvia60-' + fechaIcs(e.ini) + '@invitacion',
      'DTSTAMP:' + fechaIcs(new Date()),
      'DTSTART:' + fechaIcs(e.ini),
      'DTEND:' + fechaIcs(e.fin),
      'SUMMARY:' + escIcs(e.titulo),
      'LOCATION:' + escIcs(e.lugar),
      'DESCRIPTION:' + escIcs(e.detalle),
      'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:' + escIcs('Mañana: ' + e.titulo), 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n');
    descargarArchivo(new Blob([ics], { type: 'text/calendar;charset=utf-8' }), 'cumple-silvia-60.ics');
  }

  function descargarArchivo(blob, nombre) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  // --- WhatsApp ---
  function urlWhatsApp(texto, telefono) {
    const tel = normalizarTelefono(telefono);
    return 'https://wa.me/' + (tel || '') + '?text=' + encodeURIComponent(texto);
  }
  // Argentina: 549 + código de área sin 0 + número sin 15
  function normalizarTelefono(t) {
    if (!t) return '';
    let d = String(t).replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('54')) { d = d.slice(2); if (d.startsWith('9')) d = d.slice(1); }
    if (d.startsWith('0')) d = d.slice(1);
    // quitar el 15 después del código de área (San Juan: 264)
    const m = d.match(/^(\d{2,4})15(\d{6,8})$/);
    if (m && (m[1] + m[2]).length === 10) d = m[1] + m[2];
    return d.length === 10 ? '549' + d : d;
  }

  // --- Texto ---
  function slugificar(s) {
    return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/&/g, ' y ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  }
  function sufijoAleatorio(n = 4) {
    const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
    const b = crypto.getRandomValues(new Uint8Array(n));
    return Array.from(b, x => abc[x % abc.length]).join('');
  }
  const PALABRAS_FEAS = ['puta', 'puto', 'pija', 'concha', 'culo', 'mierda', 'forro', 'forra', 'pelotudo', 'pelotuda', 'boludo', 'boluda', 'garcha', 'verga', 'chupala', 'trolo', 'trola', 'cogeme', 'coger', 'cojer', 'orto', 'tetas', 'pete', 'petera', 'mogolico', 'mogolica', 'idiota', 'imbecil', 'tarado', 'tarada', 'vieja chota', 'chota', 'hdp', 'lpm', 'lpqtp', 'ctm', 'sorete', 'cagar', 'cagon', 'negro de mierda', 'fuck', 'shit', 'bitch', 'dick', 'pussy', 'porn', 'sex', 'sexo'];
  function normalizar(s) {
    return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[0@4]/g, m => ({ '0': 'o', '@': 'a', '4': 'a' }[m])).replace(/[1!]/g, 'i').replace(/3/g, 'e').replace(/\$/g, 's');
  }
  function tieneMalasPalabras(s) {
    const t = ' ' + normalizar(s).replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ') + ' ';
    const pegado = normalizar(s).replace(/[^a-z]/g, '');
    return PALABRAS_FEAS.some(p => t.includes(' ' + p + ' ') || (p.length >= 6 && !p.includes(' ') && pegado.includes(p)));
  }

  // --- QR (usa qrcode-generator, cargado aparte) ---
  function qrSvg(texto, colorOscuro = '#4a3608') {
    if (!window.qrcode) return '';
    const qr = window.qrcode(0, 'M');
    qr.addData(texto);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }).replace(/fill="black"/g, `fill="${colorOscuro}"`).replace(/fill="#000000"/g, `fill="${colorOscuro}"`);
  }

  // --- Brillos dorados de fondo (canvas liviano) ---
  function brillos(canvas, opciones = {}) {
    const cant = opciones.cantidad || 36;
    const ctx = canvas.getContext('2d');
    const reducir = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w, h, dpr, parts = [], raf = null;
    function medir() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function nueva(inicial) {
      return { x: Math.random() * w, y: inicial ? Math.random() * h : h + 10, r: Math.random() * 2.2 + .6, v: Math.random() * .35 + .12, fase: Math.random() * Math.PI * 2, deriva: (Math.random() - .5) * .25, estrella: Math.random() < .22 };
    }
    function dibujar(t) {
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.y -= p.v; p.x += p.deriva;
        if (p.y < -10 || p.x < -10 || p.x > w + 10) Object.assign(p, nueva(false));
        const a = .35 + .45 * Math.sin(t / 700 + p.fase);
        ctx.globalAlpha = Math.max(0, a);
        if (p.estrella) {
          const s = p.r * 2.6;
          ctx.fillStyle = '#D4AF37';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - s); ctx.quadraticCurveTo(p.x, p.y, p.x + s, p.y);
          ctx.quadraticCurveTo(p.x, p.y, p.x, p.y + s); ctx.quadraticCurveTo(p.x, p.y, p.x - s, p.y);
          ctx.quadraticCurveTo(p.x, p.y, p.x, p.y - s); ctx.fill();
        } else {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.5);
          g.addColorStop(0, '#FFE58A'); g.addColorStop(1, 'rgba(212,175,55,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2.5, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(dibujar);
    }
    medir();
    parts = Array.from({ length: cant }, () => nueva(true));
    addEventListener('resize', medir);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { cancelAnimationFrame(raf); raf = null; } else if (!raf && !reducir) raf = requestAnimationFrame(dibujar);
    });
    if (reducir) { dibujar(0); cancelAnimationFrame(raf); } else raf = requestAnimationFrame(dibujar);
  }

  // --- Celebraciones con canvas-confetti (si está cargado) ---
  const ORO = ['#B8860B', '#D4AF37', '#F5D97A', '#FFF3C4', '#ffffff'];
  const MULTI = ['#D4AF37', '#F5D97A', '#ff4d6d', '#ffb703', '#3a86ff', '#06d6a0', '#8338ec', '#ffffff'];
  const sinMovimiento = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const conf = (o) => { if (window.confetti && !sinMovimiento()) window.confetti(Object.assign({ disableForReducedMotion: true, zIndex: 9996 }, o)); };
  // Estallido blanco y dorado (apertura del sobre)
  function confetiDorado(origen = { x: .5, y: .55 }) {
    conf({ particleCount: 110, spread: 100, startVelocity: 42, origin: origen, colors: ORO, scalar: 1.05 });
    setTimeout(() => conf({ particleCount: 60, spread: 140, startVelocity: 28, origin: origen, colors: ORO, shapes: ['circle'], scalar: .8 }), 180);
  }
  // Gran fiesta: confeti multicolor + dorado y fuegos artificiales desde los costados
  // escala: tamaño de cada papelito (en la pantalla del salón conviene 2 o más)
  function fiesta(duracion = 2600, escala = 1) {
    const v = escala > 1 ? 1.6 : 1;
    conf({ particleCount: 160, spread: 110, startVelocity: 50 * v, origin: { x: .5, y: .6 }, colors: MULTI, scalar: escala });
    const fin = Date.now() + duracion;
    (function lanzar() {
      conf({ particleCount: 28, angle: 60, spread: 60, startVelocity: 55 * v, origin: { x: 0, y: .75 }, colors: MULTI, scalar: escala });
      conf({ particleCount: 28, angle: 120, spread: 60, startVelocity: 55 * v, origin: { x: 1, y: .75 }, colors: MULTI, scalar: escala });
      if (Math.random() < .5) conf({ particleCount: 45, spread: 360, startVelocity: 26 * v, ticks: 70, gravity: .6, origin: { x: .2 + Math.random() * .6, y: .15 + Math.random() * .25 }, colors: ORO, shapes: ['circle'], scalar: escala });
      if (Date.now() < fin) setTimeout(lanzar, 260);
    })();
  }
  // Lluvia suave de destellos (cierre)
  function destellos(duracion = 2800) {
    const fin = Date.now() + duracion;
    (function caer() {
      conf({ particleCount: 6, startVelocity: 4, ticks: 260, gravity: .35, spread: 180, origin: { x: Math.random(), y: -.05 }, colors: ORO, shapes: ['star'], scalar: 1.1, drift: (Math.random() - .5) * .6 });
      if (Date.now() < fin) setTimeout(caer, 120);
    })();
  }
  // Corazones dorados que suben (respuesta "no podremos": cálido, sin fiesta)
  function corazones(cantidad = 14) {
    if (sinMovimiento()) return;
    for (let i = 0; i < cantidad; i++) {
      const c = document.createElement('span');
      c.className = 'corazon-sube';
      c.textContent = '♥';
      c.style.cssText = `left:${8 + Math.random() * 84}%;font-size:${18 + Math.random() * 22}px;animation-delay:${Math.random() * 1.6}s;animation-duration:${3.2 + Math.random() * 1.8}s`;
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 7000);
    }
  }
  // Vibración suave al tocar botones (celulares)
  document.addEventListener('pointerdown', e => {
    if (e.target.closest && e.target.closest('.btn, .opcion, .emoji-salto, .sobre') && navigator.vibrate) { try { navigator.vibrate(12); } catch (x) {} }
  }, { passive: true });

  // --- Lluvia dorada (celebración) ---
  function lluviaDorada(duracion = 3500, cantidad = 140) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.confetti) { confetiDorado({ x: .5, y: .45 }); destellos(duracion); return; }
    const c = document.createElement('canvas');
    c.className = 'brillos';
    c.style.zIndex = 9990;
    document.body.appendChild(c);
    const ctx = c.getContext('2d');
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = c.width = innerWidth * dpr, h = c.height = innerHeight * dpr;
    const colores = ['#c9a24a', '#e9d08c', '#f6e7b4', '#a77d22', '#ffffff', '#d4ad55'];
    const ps = Array.from({ length: cantidad }, () => ({
      x: Math.random() * w, y: -Math.random() * h * .6, vx: (Math.random() - .5) * 2 * dpr, vy: (Math.random() * 2 + 2) * dpr,
      s: (Math.random() * 6 + 4) * dpr, rot: Math.random() * 6, vr: (Math.random() - .5) * .2, c: colores[Math.floor(Math.random() * colores.length)], tipo: Math.random()
    }));
    const t0 = performance.now();
    (function frame(t) {
      const fin = t - t0 > duracion;
      ctx.clearRect(0, 0, w, h);
      let vivos = 0;
      for (const p of ps) {
        p.x += p.vx + Math.sin((t + p.rot * 100) / 300) * .6; p.y += p.vy; p.rot += p.vr;
        if (p.y < h + 20) vivos++;
        else if (!fin) { p.y = -20; p.x = Math.random() * w; }
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.c; ctx.strokeStyle = 'rgba(167,125,34,.4)';
        if (p.tipo < .5) { ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); }
        else { ctx.beginPath(); ctx.arc(0, 0, p.s / 3, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      }
      if (vivos > 0) requestAnimationFrame(frame); else c.remove();
    })(t0);
  }

  // --- Compresión de imágenes ---
  async function cargarImagen(archivo) {
    if ('createImageBitmap' in window) {
      try { return await createImageBitmap(archivo, { imageOrientation: 'from-image' }); } catch (e) {}
    }
    return await new Promise((ok, mal) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => mal(new Error('No se pudo leer la imagen'));
      img.src = URL.createObjectURL(archivo);
    });
  }
  async function comprimir(fuente, ladoMax, calidad) {
    const iw = fuente.width, ih = fuente.height;
    const esc = Math.min(1, ladoMax / Math.max(iw, ih));
    const cw = Math.round(iw * esc), ch = Math.round(ih * esc);
    const canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(fuente, 0, 0, cw, ch);
    const blob = await new Promise(ok => canvas.toBlob(ok, 'image/jpeg', calidad));
    canvas.width = canvas.height = 0;
    return { blob, ancho: cw, alto: ch };
  }

  function bannerDemo() {
    if (!C.modoDemo) return;
    const b = document.createElement('div');
    b.className = 'banner-demo';
    b.textContent = 'MODO DEMO · los datos se guardan solo en este navegador (falta conectar Supabase)';
    document.body.appendChild(b);
  }

  function formatoHora(d) { return new Date(d).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/San_Juan' }); }
  function formatoFechaHora(d) { return new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/San_Juan' }); }

  function primerNombre(s) { return String(s || '').trim().split(/[\s,]+/)[0] || ''; }

  derivarEvento();   // textos de fecha/hora desde config.js hasta que llegue lo de la base

  window.S60 = { $, $$, esc, local, uuid, idDispositivo, toast, url, urlMaps, fechaEvento, partesRestantes, triviaAlMuro, fotosHabilitadas, modoPruebaActivo, cargarEvento, aplicarEvento, derivarEvento, rsvpAbierto, urlGoogleCalendar, descargarIcs, descargarArchivo, urlWhatsApp, normalizarTelefono, slugificar, sufijoAleatorio, tieneMalasPalabras, qrSvg, brillos, lluviaDorada, confetiDorado, fiesta, destellos, corazones, cargarImagen, comprimir, bannerDemo, formatoHora, formatoFechaHora, primerNombre };
})();
