/* /pantalla: videos (los archivos viven en ESTA notebook, en IndexedDB) y animaciones, manejados desde el panel.
   El panel escribe pantalla_estado.reproduccion = { tipo: 'video'|'anim', id, estado: 'play'|'pausa', inicio, pos, n }.
   Todo se calcula desde "inicio" (hora del servidor): si la página se recarga, sigue donde iba. */
(function () {
  const { $, esc } = S60;
  const BOOM = 8, DURA_FIESTA = 20;
  const DIR = '../assets/';
  const azar = (a, b) => a + Math.random() * (b - a);

  let desfase = () => 0, alCambiar = () => {};
  let estado = { volumen: 100, efectos: true };
  let actual = null;                 // lo que se está mostrando: { n, tipo, id, cerrar() }
  const ahoraSrv = () => Date.now() + desfase();
  const transcurrido = r => Math.max(0, ahoraSrv() - Date.parse(r.inicio));

  // Videos que ya terminaron (para no repetirlos si la página se recarga)
  const finalizados = new Set(S60.local.leer('vid_fin', []));
  function finalizar(n) { finalizados.add(n); S60.local.guardar('vid_fin', Array.from(finalizados).slice(-30)); }
  const fallidos = new Set();

  /* ====================== SONIDO (Web Audio: todo generado acá, nada con derechos) ====================== */
  const Sonido = (function () {
    let ctx = null, master = null;
    function crear() {
      if (ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { ctx = new AC(); master = ctx.createGain(); master.connect(ctx.destination); volumen(); } catch (e) { ctx = null; }
    }
    function desbloquear() { crear(); if (ctx && ctx.state === 'suspended') ctx.resume().then(() => informar()).catch(() => {}); }
    const listo = () => !!ctx && ctx.state === 'running';
    function volumen() { if (master) master.gain.value = Math.max(0, Math.min(1, (estado.volumen == null ? 100 : estado.volumen) / 100)); }
    function puede(forzar) {
      if (!forzar && estado.efectos === false) return false;
      crear();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (!listo()) avisoSinSonido(true);
      return !!ctx;
    }
    function ruido(seg) {
      const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seg), ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const s = ctx.createBufferSource(); s.buffer = b; return s;
    }
    function env(g, t, pico, ataque, caida) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(pico, t + ataque);
      g.gain.exponentialRampToValueAtTime(0.0001, t + ataque + caida);
    }
    // Sirena tipo baliza: sube y baja rápido (devuelve una función para cortarla)
    function sirena(dur) {
      if (!puede()) return () => {};
      const t = ctx.currentTime;
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o1.type = 'sawtooth'; o2.type = 'square'; lfo.type = 'triangle';
      o1.frequency.value = 880; o2.frequency.value = 884; lfo.frequency.value = 1.7; lg.gain.value = 330;
      lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.13, t + .2); g.gain.setValueAtTime(.13, t + dur - .35); g.gain.linearRampToValueAtTime(0, t + dur);
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(master);
      [o1, o2, lfo].forEach(o => { o.start(t); o.stop(t + dur + .05); });
      return () => { try { g.gain.cancelScheduledValues(ctx.currentTime); g.gain.setTargetAtTime(0, ctx.currentTime, .04); } catch (e) {} };
    }
    function pitido(fr, dur = .24) {
      if (!puede()) return;
      const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = fr;
      env(g, t, .5, .01, dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05);
    }
    // Golpe grave: seno que cae + ruido filtrado + un poco de saturación
    function boom() {
      if (!puede()) return;
      const t = ctx.currentTime;
      const sat = ctx.createWaveShaper(), curva = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curva[i] = Math.tanh(x * 2.6); }
      sat.curve = curva; sat.connect(master);
      const o = ctx.createOscillator(), go = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(30, t + 1.5);
      env(go, t, 1, .008, 2.3);
      o.connect(go); go.connect(sat); o.start(t); o.stop(t + 2.5);
      const n = ruido(2.2), fn = ctx.createBiquadFilter(), gn = ctx.createGain();
      fn.type = 'lowpass'; fn.frequency.setValueAtTime(900, t); fn.frequency.exponentialRampToValueAtTime(70, t + 1.6);
      env(gn, t, .8, .005, 1.8);
      n.connect(fn); fn.connect(gn); gn.connect(sat); n.start(t);
    }
    function whoosh() {
      if (!puede()) return;
      const t = ctx.currentTime, n = ruido(1.6), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'bandpass'; f.Q.value = 1.4; f.frequency.setValueAtTime(260, t); f.frequency.exponentialRampToValueAtTime(3800, t + 1.1);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(.32, t + .8); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      n.connect(f); f.connect(g); g.connect(master); n.start(t);
    }
    function destello() {
      if (!puede()) return;
      for (let i = 0; i < 7; i++) {
        const t = ctx.currentTime + i * .07, o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = azar(1900, 3800);
        env(g, t, .06, .005, .7);
        o.connect(g); g.connect(master); o.start(t); o.stop(t + .8);
      }
    }
    function prueba() {
      if (!puede(true)) return;
      [659, 784, 988, 1319].forEach((fr, i) => {
        const t = ctx.currentTime + i * .17, o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = fr;
        env(g, t, .35, .01, .7);
        o.connect(g); g.connect(master); o.start(t); o.stop(t + .8);
      });
    }
    return { crear, desbloquear, listo, volumen, sirena, pitido, boom, whoosh, destello, prueba };
  })();

  function avisoSinSonido(mostrar) { $('#sinSonido').classList.toggle('oculto', !mostrar || Sonido.listo() && !(actual && actual.mudo)); }
  // Cualquier toque en la notebook habilita el sonido (los navegadores lo exigen)
  document.addEventListener('pointerdown', () => {
    Sonido.desbloquear();
    if (actual && actual.mudo && actual.reproductor) { actual.reproductor.desmutear(); actual.mudo = false; informarRep(actual.rep, 'play'); }
    setTimeout(() => avisoSinSonido(false), 300);
  }, true);

  /* ====================== VIDEOS GUARDADOS EN ESTA NOTEBOOK (IndexedDB) ====================== */
  const Biblio = (function () {
    let db = null;
    function abrir() {
      if (!db) db = new Promise((ok, mal) => {
        const r = indexedDB.open('s60videos', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('videos', { keyPath: 'id' });
        r.onsuccess = () => ok(r.result);
        r.onerror = () => mal(r.error);
      });
      return db;
    }
    const tx = async (modo, fn) => { const d = await abrir(); return new Promise((ok, mal) => { const t = d.transaction('videos', modo); const r = fn(t.objectStore('videos')); t.oncomplete = () => ok(r && r.result); t.onerror = () => mal(t.error); t.onabort = () => mal(t.error || new Error('No hay espacio en la notebook')); }); };
    return {
      todos: () => tx('readonly', s => s.getAll()).catch(() => []),
      get: id => tx('readonly', s => s.get(id)).catch(() => null),
      guardar: reg => tx('readwrite', s => s.put(reg)),
      quitar: id => tx('readwrite', s => s.delete(id))
    };
  })();

  // Lee duración y tamaño; avisa si el navegador no puede reproducir el archivo
  function revisarArchivo(archivo) {
    return new Promise(ok => {
      const v = document.createElement('video'), u = URL.createObjectURL(archivo);
      const fin = r => { clearTimeout(t); v.removeAttribute('src'); v.load(); URL.revokeObjectURL(u); ok(r); };
      const t = setTimeout(() => fin({ ok: false, dur: 0, motivo: 'no se pudo leer' }), 20000);
      v.preload = 'metadata'; v.muted = true;
      v.onloadedmetadata = () => fin(v.videoWidth > 0 && isFinite(v.duration) ? { ok: true, dur: v.duration, ancho: v.videoWidth, alto: v.videoHeight } : { ok: false, dur: v.duration || 0, motivo: 'este navegador no puede mostrar la imagen de este video (¿formato HEVC/H.265?)' });
      v.onerror = () => fin({ ok: false, dur: 0, motivo: 'este navegador no puede reproducir este formato' });
      v.src = u;
    });
  }

  /* ---------- Informe al panel: qué videos hay y qué se está reproduciendo ---------- */
  let repInforme = null, tInforme = null, ultimoInforme = 0;
  function informar() {
    clearTimeout(tInforme);
    const espera = Math.max(0, 1500 - (Date.now() - ultimoInforme));
    tInforme = setTimeout(async () => {
      ultimoInforme = Date.now();
      const lista = await Biblio.todos();
      const p = {
        videos: lista.slice(0, 30).map(v => ({ id: v.id, nombre: String(v.nombre || '').slice(0, 80), bytes: v.bytes || 0, dur: Math.round(v.dur || 0), ok: !!v.ok })),
        reproduciendo: repInforme,
        audio: Sonido.listo() ? 'ok' : 'bloqueado'
      };
      try { await Datos.informarPantalla(p); } catch (e) { /* sin el SQL nuevo o sin conexión: se reintenta en el próximo aviso */ }
    }, espera);
  }
  function informarRep(r, est, extra) {
    repInforme = r ? Object.assign({ id: r.id, n: r.n, estado: est }, extra || {}) : null;
    if (actual && actual.reproductor && r && actual.n === r.n) {
      const rp = actual.reproductor;
      repInforme.pos = Math.round(rp.pos() * 10) / 10;
      repInforme.dur = Math.round(rp.dur() || 0);
    }
    informar();
  }

  /* ====================== REPRODUCTORES (archivo local o YouTube) ====================== */
  const cine = () => $('#cine');
  function reproductorLocal(reg, alTerminar) {
    const v = $('#cineVideo');
    const url = URL.createObjectURL(reg.archivo);
    v.classList.remove('oculto');
    v.src = url; v.muted = false; v.volume = vol();
    v.onended = alTerminar;
    return {
      play: () => v.play(),
      pausa: () => v.pause(),
      ir: s => { try { v.currentTime = s; } catch (e) {} },
      pos: () => v.currentTime || 0,
      dur: () => v.duration || reg.dur || 0,
      volumen: x => { v.volume = x; },
      mutear: () => { v.muted = true; },
      desmutear: () => { v.muted = false; },
      pausado: () => v.paused,
      destruir: () => { v.pause(); v.onended = null; v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); v.classList.add('oculto'); }
    };
  }
  let ytApi = null;
  function cargarYt() {
    if (!ytApi) ytApi = new Promise((ok, mal) => {
      if (window.YT && YT.Player) return ok();
      window.onYouTubeIframeAPIReady = ok;
      const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.onerror = () => { ytApi = null; mal(new Error('YouTube no carga')); };
      document.head.appendChild(s);
      setTimeout(() => mal(new Error('YouTube no responde')), 15000);
    });
    return ytApi;
  }
  const idYoutube = u => { const m = String(u || '').match(/(?:youtu\.be\/|[?&]v=|shorts\/|embed\/|live\/)([\w-]{11})/); return m ? m[1] : null; };
  async function reproductorYoutube(idYt, desde, alTerminar, alError) {
    await cargarYt();
    const caja = $('#cineYt');
    caja.innerHTML = '<div id="cineYtJugador"></div>';
    caja.classList.remove('oculto');
    let p = null;
    await new Promise((ok, mal) => {
      p = new YT.Player('cineYtJugador', {
        width: '100%', height: '100%', videoId: idYt,
        playerVars: { autoplay: 0, controls: 0, rel: 0, modestbranding: 1, playsinline: 1, iv_load_policy: 3, disablekb: 1, fs: 0, start: Math.floor(desde) },
        events: { onReady: ok, onStateChange: e => { if (e.data === 0) alTerminar(); }, onError: e => { alError(); mal(new Error('YouTube ' + e.data)); } }
      });
      setTimeout(() => mal(new Error('YouTube no responde')), 15000);
    });
    return {
      play: () => { p.playVideo(); return new Promise((ok, mal) => setTimeout(() => (p.getPlayerState() === 1 || p.getPlayerState() === 3) ? ok() : mal(new Error('bloqueado')), 2500)); },
      pausa: () => p.pauseVideo(),
      ir: s => p.seekTo(s, true),
      pos: () => p.getCurrentTime() || 0,
      dur: () => p.getDuration() || 0,
      volumen: x => p.setVolume(Math.round(x * 100)),
      mutear: () => p.mute(),
      desmutear: () => p.unMute(),
      pausado: () => p.getPlayerState() !== 1,
      destruir: () => { try { p.destroy(); } catch (e) {} caja.innerHTML = ''; caja.classList.add('oculto'); }
    };
  }
  const vol = () => Math.max(0, Math.min(1, (estado.volumen == null ? 100 : estado.volumen) / 100));
  const posDe = r => r.pos + (r.estado === 'play' ? transcurrido(r) / 1000 : 0);

  async function iniciarVideo(r) {
    const yo = { n: r.n, tipo: 'video', id: r.id, rep: r, reproductor: null, mudo: false, timers: [] };
    let reg = await Biblio.get(r.id);
    let ytId = null;
    if (!reg || !reg.ok) {
      const v = (await Datos.videos().catch(() => [])).find(x => x.id === r.id);
      ytId = v && idYoutube(v.youtube);
      if (!ytId) { fallidos.add(r.n); informarRep(r, 'sin-archivo'); console.warn('Pantalla: no tengo el video', r.id); return; }
    }
    if (reg && reg.dur && posDe(r) >= reg.dur - .5) { finalizar(r.n); informarRep(r, 'fin'); return; }
    if (actual) cerrar(true);
    actual = yo;
    yo.cerrar = () => { yo.timers.forEach(clearInterval); if (yo.reproductor) yo.reproductor.destruir(); };
    alCambiar();
    const c = cine();
    c.classList.remove('oculto');
    requestAnimationFrame(() => c.classList.add('visible'));         // fundido a negro
    const terminar = () => { if (actual !== yo) return; finalizar(r.n); informarRep(yo.rep, 'fin'); cerrar(); };
    try {
      yo.reproductor = reg && reg.ok ? reproductorLocal(reg, terminar) : await reproductorYoutube(ytId, posDe(r), terminar, () => { if (actual === yo) { fallidos.add(r.n); informarRep(r, 'error'); cerrar(); } });
    } catch (e) { if (actual === yo) { fallidos.add(r.n); informarRep(r, 'error'); cerrar(); } return; }
    if (actual !== yo) { yo.reproductor.destruir(); return; }
    yo.reproductor.volumen(vol());
    await new Promise(ok => setTimeout(ok, 800));
    if (actual !== yo) return;
    await sincronizarVideo(yo.rep, true);
    yo.timers.push(setInterval(() => { if (actual === yo && !yo.reproductor.pausado()) informarRep(yo.rep, yo.mudo ? 'mudo' : 'play'); }, 10000));
  }
  async function sincronizarVideo(r, primera) {
    const yo = actual; if (!yo || !yo.reproductor) return;
    const rp = yo.reproductor, antes = yo.rep;
    yo.rep = r;
    const objetivo = posDe(r);
    if (r.estado === 'pausa') {
      rp.pausa();
      if (Math.abs(rp.pos() - objetivo) > 1) rp.ir(objetivo);
      if (primera || antes.estado !== 'pausa') informarRep(r, 'pausa');
      return;
    }
    if (primera || Math.abs(rp.pos() - objetivo) > 2) rp.ir(objetivo);
    if (primera || antes.estado !== 'play' || rp.pausado()) {
      try { await rp.play(); yo.mudo = false; }
      catch (e) {
        // sin un toque previo el navegador no deja sonido: arranca mudo y avisa
        rp.mutear(); yo.mudo = true;
        try { await rp.play(); } catch (x) {}
        avisoSinSonido(true);
      }
      informarRep(r, yo.mudo ? 'mudo' : 'play');
    }
  }

  /* ====================== ANIMACIONES ====================== */
  // Pasos [segundo, fn(salteado)]: si la pantalla se recargó a mitad, los pasos pasados se aplican sin efectos ni sonido
  function linea(raiz, pasos, desde) {
    const timers = [];
    raiz.classList.add('saltar');
    pasos.forEach(([t, fn]) => { if (t * 1000 <= desde) fn(true); else timers.push(setTimeout(() => fn(false), t * 1000 - desde)); });
    void raiz.offsetWidth;
    requestAnimationFrame(() => raiz.classList.remove('saltar'));
    return () => timers.forEach(clearTimeout);
  }
  const ver = (el, si = true) => el.classList.toggle('ver', si);
  const fuera = el => { el.classList.remove('ver'); el.classList.add('fuera'); };

  // Chispas doradas sobre negro (canvas propio de las animaciones)
  function chispas(canvas, intensidad) {
    const ctx = canvas.getContext('2d');
    let w, h, raf, parts = [], fuerza = intensidad || .3;
    const medir = () => { const d = Math.min(devicePixelRatio || 1, 2); w = canvas.clientWidth; h = canvas.clientHeight; canvas.width = w * d; canvas.height = h * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
    medir();
    const nueva = () => ({ x: Math.random() * w, y: Math.random() * h, r: azar(.6, 2.6), v: azar(.1, .6), f: Math.random() * 6.3, e: Math.random() < .3 });
    parts = Array.from({ length: 160 }, nueva);
    (function dibujar(t) {
      ctx.clearRect(0, 0, w, h);
      const n = Math.floor(parts.length * fuerza);
      for (let i = 0; i < n; i++) {
        const p = parts[i];
        p.y -= p.v; if (p.y < -10) Object.assign(p, nueva(), { y: h + 10 });
        const a = Math.max(0, Math.sin(t / 500 + p.f)) * (.4 + .6 * fuerza);
        ctx.globalAlpha = a;
        if (p.e) {
          const s = p.r * 3.2;
          ctx.fillStyle = '#FFE9A8';
          ctx.beginPath(); ctx.moveTo(p.x, p.y - s); ctx.quadraticCurveTo(p.x, p.y, p.x + s, p.y); ctx.quadraticCurveTo(p.x, p.y, p.x, p.y + s);
          ctx.quadraticCurveTo(p.x, p.y, p.x - s, p.y); ctx.quadraticCurveTo(p.x, p.y, p.x, p.y - s); ctx.fill();
        } else {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3);
          g.addColorStop(0, '#FFF3C4'); g.addColorStop(.4, '#D4AF37'); g.addColorStop(1, 'rgba(212,175,55,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3, 0, 6.3); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(dibujar);
    })(0);
    return { fuerza: x => { fuerza = x; }, parar: () => cancelAnimationFrame(raf) };
  }

  // ✨ ENTRADA DE SILVIA (~25 s, después queda en el cuadro final hasta ⏹)
  function animEntrada(r) {
    const raiz = $('#showEntrada');
    raiz.querySelectorAll('.ver, .fuera').forEach(el => el.classList.remove('ver', 'fuera'));
    raiz.classList.remove('oculto');
    const ch = chispas(raiz.querySelector('.show-chispas'), .15);
    const [l1, l2, l3] = raiz.querySelectorAll('.se-linea');
    const final = raiz.querySelector('.se-final'), foto = raiz.querySelector('.se-foto'), nombre = raiz.querySelector('.se-nombre'), emb = raiz.querySelector('.se-emblema'), luz = raiz.querySelector('.se-luz');
    const cortar = linea(raiz, [
      [0, () => ver(raiz)],
      [1.2, s => { ver(l1); ch.fuerza(.3); if (!s) Sonido.destello(); }],
      [5.4, () => fuera(l1)],
      [6.4, () => { ver(l2); ch.fuerza(.45); }],
      [12.2, () => fuera(l2)],
      [13.2, () => { ver(l3); ch.fuerza(.6); }],
      [16.4, () => fuera(l3)],
      [17, s => { ver(final); ver(nombre); ver(luz); ch.fuerza(1); if (!s) Sonido.whoosh(); }],
      [17.7, s => { if (!s) { Sonido.destello(); S60.confetiDorado({ x: .62, y: .5 }); } }],
      [18.2, () => ver(foto)],
      [19.6, s => { ver(emb); if (!s) S60.destellos(7000); }],
      [24, () => ch.fuerza(.7)]
    ], transcurrido(r));
    return () => { cortar(); ch.parar(); };
  }

  // 🚨 ¡ARRANCA LA FIESTA! (~20 s; el BOOM es exactamente 8 s después de tocar ▶; después vuelve solo al muro)
  let billetesListos = null;
  function precargarBilletes() {
    if (!billetesListos) billetesListos = Promise.all(['silvidolar-frente.webp', 'silvidolar-dorso.webp'].map(f => new Promise(ok => { const i = new Image(); i.onload = i.onerror = ok; i.src = DIR + f; })));
    return billetesListos;
  }
  function animFiesta(r, alFin) {
    const raiz = $('#showFiesta');
    raiz.querySelectorAll('.ver, .fuera, .temblor, .fuerte, .arriba').forEach(el => el.classList.remove('ver', 'fuera', 'temblor', 'fuerte', 'arriba'));
    raiz.classList.remove('oculto', 'apagando', 'post-boom');
    precargarBilletes();
    const q = s => raiz.querySelector(s);
    const alerta = q('.sf-alerta'), aten = q('.sf-atencion'), cuenta = q('.sf-cuenta'), boom = q('.sf-boom'), flash = q('.sf-flash'),
      balizas = q('.sf-balizas'), final = q('.sf-final'), escena = q('.sf-escena'), lluvia = q('.sf-billetes');
    lluvia.innerHTML = '';
    let pararSirena = () => {}, lluviaT = null;
    const numero = (txt, s, fr) => { cuenta.textContent = txt; cuenta.classList.remove('ver'); void cuenta.offsetWidth; ver(cuenta); if (!s) Sonido.pitido(fr); };
    function billete() {
      const b = document.createElement('div');
      b.className = 'billete';
      const ancho = azar(10, 17);
      b.style.width = ancho + 'rem';
      b.style.left = azar(-6, 96) + '%';
      b.innerHTML = `<div class="b-giro"><img class="b-cara" src="${DIR}silvidolar-frente.webp" alt=""><img class="b-cara b-dorso" src="${DIR}silvidolar-dorso.webp" alt=""></div>`;
      lluvia.appendChild(b);
      const dur = azar(4800, 8200), x = () => azar(-9, 9), g0 = azar(-40, 40);
      const caer = b.animate([
        { transform: `translate(0, -32vh) rotate(${g0}deg)` },
        { transform: `translate(${x()}vw, 22vh) rotate(${g0 + azar(-50, 50)}deg)` },
        { transform: `translate(${x()}vw, 66vh) rotate(${g0 + azar(-90, 90)}deg)` },
        { transform: `translate(${x()}vw, 128vh) rotate(${g0 + azar(-140, 140)}deg)` }
      ], { duration: dur, easing: 'cubic-bezier(.35, .1, .6, 1)', fill: 'forwards' });
      const lado = Math.random() < .5 ? 1 : -1;
      b.firstChild.animate([
        { transform: 'rotateY(0deg) rotateX(18deg)' },
        { transform: `rotateY(${180 * lado}deg) rotateX(-18deg)` },
        { transform: `rotateY(${360 * lado}deg) rotateX(18deg)` }
      ], { duration: azar(1300, 2600), iterations: Infinity });
      caer.onfinish = () => b.remove();
    }
    function empezarLluvia() {
      clearInterval(lluviaT);
      for (let i = 0; i < 24; i++) setTimeout(billete, i * 50);
      lluviaT = setInterval(() => { if (lluvia.childElementCount < 80) billete(); }, 100);
    }
    const desde = transcurrido(r);
    const cortar = linea(raiz, [
      [0, s => { ver(raiz); ver(balizas); ver(alerta); if (!s) pararSirena = Sonido.sirena(4.8); }],
      [2.6, () => { alerta.classList.add('arriba'); ver(aten); escena.classList.add('temblor'); }],
      [4.8, () => { fuera(alerta); fuera(aten); escena.classList.remove('temblor'); }],
      [5, s => numero('3', s, 880)],
      [6, s => numero('2', s, 880)],
      [7, s => numero('1', s, 1175)],
      [BOOM, s => {
        cuenta.classList.remove('ver'); balizas.classList.remove('ver'); raiz.classList.add('post-boom'); ver(boom);
        if (!s) {
          Sonido.boom(); ver(flash); setTimeout(() => flash.classList.remove('ver'), 450);
          escena.classList.add('temblor', 'fuerte'); setTimeout(() => escena.classList.remove('temblor', 'fuerte'), 900);
          if (window.confetti) {
            const MULTI = ['#D4AF37', '#F5D97A', '#ff4d6d', '#ffb703', '#3a86ff', '#06d6a0', '#8338ec', '#ffffff'];
            confetti({ particleCount: 320, spread: 360, startVelocity: 75, ticks: 260, origin: { x: .5, y: .5 }, colors: MULTI, scalar: 2.4, zIndex: 9996 });
            setTimeout(() => confetti({ particleCount: 200, spread: 140, startVelocity: 65, origin: { x: .5, y: .7 }, colors: ['#B8860B', '#D4AF37', '#F5D97A', '#FFF3C4'], scalar: 2.2, zIndex: 9996 }), 250);
          }
        }
      }],
      [9.3, s => { fuera(boom); ver(final); empezarLluvia(); if (!s) S60.fiesta(7500, 2.4); }],
      [17, () => { clearInterval(lluviaT); }],
      [18.6, () => raiz.classList.add('apagando')],
      [DURA_FIESTA, () => { finalizar(r.n); alFin(); }]
    ], desde);
    return () => { cortar(); pararSirena(); clearInterval(lluviaT); setTimeout(() => { lluvia.innerHTML = ''; }, 900); };
  }

  function iniciarAnim(r) {
    if (r.id === 'fiesta' && transcurrido(r) >= DURA_FIESTA * 1000) { finalizar(r.n); return; }
    if (actual) cerrar(true);
    const yo = { n: r.n, tipo: 'anim', id: r.id, rep: r };
    actual = yo;
    const raizId = r.id === 'fiesta' ? '#showFiesta' : '#showEntrada';
    const parar = r.id === 'fiesta' ? animFiesta(r, () => { if (actual === yo) cerrar(); }) : animEntrada(r);
    yo.cerrar = () => { parar(); const el = $(raizId); el.classList.remove('ver'); setTimeout(() => { if (!actual || actual.id !== r.id) el.classList.add('oculto'); }, 900); };
    if (r.id === 'fiesta' && !Sonido.listo() && estado.efectos !== false) avisoSinSonido(true);
    informarRep(r, 'play');
    alCambiar();
  }

  function cerrar(inmediato) {
    const yo = actual;
    if (!yo) return;
    actual = null;
    try { yo.cerrar && yo.cerrar(); } catch (e) { console.warn(e); }
    if (yo.tipo === 'video') {
      const c = cine();
      c.classList.remove('visible');
      setTimeout(() => { if (!actual || actual.tipo !== 'video') c.classList.add('oculto'); }, inmediato ? 0 : 900);
    }
    avisoSinSonido(false);
    if (!repInforme || repInforme.n !== yo.n || (repInforme.estado !== 'fin' && repInforme.estado !== 'error')) informarRep(null);
    alCambiar();
  }

  /* ====================== ESTADO DESDE EL PANEL ====================== */
  let sonidoVisto = null;
  function aplicar(p) {
    if (!p) return;
    estado.volumen = p.volumen == null ? 100 : p.volumen;
    estado.efectos = p.efectos !== false;
    Sonido.volumen();
    if (actual && actual.reproductor) actual.reproductor.volumen(vol());
    // 🔔 Probar sonido (solo si el pedido es reciente: una recarga no lo repite)
    if (p.sonido_ts && p.sonido_ts !== sonidoVisto) {
      const nuevo = sonidoVisto !== null || ahoraSrv() - Date.parse(p.sonido_ts) < 15000;
      sonidoVisto = p.sonido_ts;
      if (nuevo && ahoraSrv() - Date.parse(p.sonido_ts) < 60000) Sonido.prueba();
    } else if (sonidoVisto === null) sonidoVisto = p.sonido_ts || '';
    const r = p.reproduccion || null;
    if (!r) { if (actual) cerrar(); return; }
    if (actual && actual.n === r.n) { if (actual.tipo === 'video') sincronizarVideo(r); return; }
    if (finalizados.has(r.n) || fallidos.has(r.n) || (iniciando === r.n)) return;
    iniciando = r.n;
    Promise.resolve(r.tipo === 'anim' ? iniciarAnim(r) : iniciarVideo(r)).finally(() => { if (iniciando === r.n) iniciando = null; });
  }
  let iniciando = null;

  /* ====================== ⚙ PREPARAR VIDEOS (una vez, días antes, en la notebook del salón) ====================== */
  const mmss = s => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const mb = b => b >= 1e9 ? (b / 1073741824).toFixed(1).replace('.', ',') + ' GB' : Math.round(b / 1048576) + ' MB';
  let probando = null;
  async function pintarPreparar() {
    const [lista, guardados] = await Promise.all([Datos.videos().catch(e => { $('#prepError').textContent = e.message; return []; }), Biblio.todos()]);
    const filas = lista.map(v => ({ v, g: guardados.find(x => x.id === v.id) }))
      .concat(guardados.filter(g => !lista.some(v => v.id === g.id)).map(g => ({ v: { id: g.id, titulo: g.titulo || g.id, huerfano: true }, g })));
    $('#prepLista').innerHTML = filas.map(({ v, g }) => `
      <div class="prep-fila" data-id="${esc(v.id)}">
        <div class="prep-info">
          <b>🎬 ${esc(v.titulo)}${v.huerfano ? ' <small>(ya no está en el panel)</small>' : ''}</b>
          <span class="${g ? (g.ok ? 'ok' : 'mal') : 'falta'}">${g ? (g.ok ? `✅ ${esc(g.nombre)} · ${mb(g.bytes)} · ${mmss(g.dur)}` : `⚠️ ${esc(g.nombre)}: ${esc(g.motivo || 'no se puede reproducir')}. Usá MP4 (H.264).`) : (v.youtube ? '▶ Sin archivo: se usaría YouTube (necesita buena conexión)' : '⚠️ Falta elegir el archivo')}</span>
        </div>
        <div class="prep-botones">
          ${v.huerfano ? '' : `<label class="prep-btn oro">📂 ${g ? 'Cambiar' : 'Elegir archivo'}<input type="file" accept="video/*,.mp4,.m4v,.webm,.mov" hidden></label>`}
          ${g && g.ok ? '<button class="prep-btn" data-a="probar" type="button">▶ Probar</button>' : ''}
          ${g ? '<button class="prep-btn" data-a="quitar" type="button">🗑 Quitar</button>' : ''}
        </div>
      </div>`).join('') || '<p>No hay videos en la lista. Agregalos desde el panel → Videos.</p>';
    try {
      const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
      const pers = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
      $('#prepEspacio').innerHTML = (est ? `💾 Usado ${mb(est.usage || 0)} de ${mb(est.quota || 0)} disponibles en esta notebook. ` : '')
        + (pers ? '🔒 Guardado permanente: el navegador no los va a borrar.' : '⚠️ El navegador podría borrarlos si se queda sin espacio (no uses modo incógnito).');
    } catch (e) {}
  }
  async function cargarArchivo(id, archivo, titulo) {
    const fila = document.querySelector(`.prep-fila[data-id="${CSS.escape(id)}"] .prep-info span`);
    if (fila) { fila.className = 'falta'; fila.textContent = `⏳ Revisando y guardando «${archivo.name}» (${mb(archivo.size)})… no cierres esta página`; }
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) {}
    const info = await revisarArchivo(archivo);
    try {
      await Biblio.guardar({ id, titulo, archivo, nombre: archivo.name, bytes: archivo.size, tipo: archivo.type, dur: info.dur || 0, ok: info.ok, motivo: info.motivo || null, cargado: new Date().toISOString() });
    } catch (e) { alert('No se pudo guardar el video en esta notebook: ' + (e && e.message || 'sin espacio')); }
    await pintarPreparar();
    informar();
    return info;
  }
  function abrirPreparar() {
    $('#preparar').classList.remove('oculto');
    document.body.classList.add('preparando');
    pintarPreparar();
  }
  function cerrarPreparar() {
    if (probando) { probando.pause(); probando.removeAttribute('src'); probando.load(); URL.revokeObjectURL(probando.dataset.url || ''); probando.classList.add('oculto'); probando = null; }
    $('#preparar').classList.add('oculto');
    document.body.classList.remove('preparando');
  }
  function armarPreparar() {
    $('#prepCerrar').addEventListener('click', cerrarPreparar);
    $('#prepLista').addEventListener('change', async e => {
      const inp = e.target.closest('input[type=file]'); if (!inp || !inp.files[0]) return;
      const id = inp.closest('.prep-fila').dataset.id;
      const titulo = inp.closest('.prep-fila').querySelector('b').textContent.replace(/^🎬\s*/, '');
      const info = await cargarArchivo(id, inp.files[0], titulo);
      if (!info.ok) alert('⚠️ Este navegador no puede reproducir ese archivo (' + (info.motivo || 'formato') + ').\nConvertilo a MP4 (H.264) y volvé a elegirlo.');
    });
    $('#prepLista').addEventListener('click', async e => {
      const b = e.target.closest('button[data-a]'); if (!b) return;
      const id = b.closest('.prep-fila').dataset.id;
      if (b.dataset.a === 'quitar') {
        if (!confirm('¿Quitar este video de la notebook?')) return;
        await Biblio.quitar(id); await pintarPreparar(); informar();
      } else {
        const g = await Biblio.get(id); if (!g) return;
        const v = $('#prepPrueba');
        if (probando) URL.revokeObjectURL(v.dataset.url || '');
        v.dataset.url = URL.createObjectURL(g.archivo);
        v.src = v.dataset.url; v.volume = vol(); v.classList.remove('oculto');
        probando = v;
        Sonido.desbloquear();
        v.play().catch(() => {});
        v.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    // Toque largo (2 s) en la esquina de arriba a la izquierda → Preparar videos
    let tLargo = null, x0 = 0, y0 = 0;
    document.addEventListener('pointerdown', e => {
      if (e.clientX > innerWidth * .14 || e.clientY > innerHeight * .16) return;
      x0 = e.clientX; y0 = e.clientY;
      tLargo = setTimeout(abrirPreparar, 2000);
    });
    const cancelar = () => { clearTimeout(tLargo); tLargo = null; };
    document.addEventListener('pointerup', cancelar);
    document.addEventListener('pointercancel', cancelar);
    document.addEventListener('pointermove', e => { if (tLargo && Math.hypot(e.clientX - x0, e.clientY - y0) > 25) cancelar(); });
  }

  window.Show = {
    iniciar(o) {
      desfase = o.desfase || desfase; alCambiar = o.alCambiar || alCambiar;
      Sonido.crear();
      armarPreparar();
      precargarBilletes();
      if (new URLSearchParams(location.search).has('preparar')) abrirPreparar();
      informar();
      setInterval(informar, 60000);      // "sigo acá" para el panel
    },
    aplicar,
    activo: () => !!actual,
    desbloquear: Sonido.desbloquear,
    // para pruebas desde la consola
    __: { Biblio, cargarArchivo, Sonido, actual: () => actual, abrirPreparar }
  };
})();
