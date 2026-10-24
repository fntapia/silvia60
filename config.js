/* ==========================================================
   SILVIA 60 · CONFIGURACIÓN
   Este es el ÚNICO archivo que necesitás tocar para cambiar
   datos del evento. Cambiá solo lo que está entre comillas.
   ========================================================== */
window.CONFIG = {
  // --- La homenajeada ---
  homenajeada: 'Silvia',
  edad: 60,
  // Foto sin fondo (WebP con transparencia, en la carpeta assets).
  // "foco" = dónde está la cara (% horizontal, % vertical): se usa para la imagen de WhatsApp.
  imagenes: {
    portada: { src: 'assets/silvia-portada.webp', foco: [34, 27] }   // portada + imagen de WhatsApp
  },

  // --- Fecha y hora (hora de Argentina, -03:00) ---
  // ⚠️ Ahora se cambian desde el PANEL → pestaña "Evento" (se aplica al instante).
  //    Lo de acá es solo el RESPALDO por si la base no responde. Los textos ("Sábado 5 de diciembre", "22 h") se arman solos.
  fechaEvento: '2026-12-05T22:30:00-03:00',
  duracionHoras: 5,                      // para el evento del calendario
  textoPuntual: '¡Por favor, sé puntual!',

  // --- Lugar ---
  lugar: {
    nombre: 'Salón de Fer',
    direccion: 'Calle Salta 1850 (N)',
    localidad: 'Chimbas, San Juan, Argentina'
  },
  // Pegá acá el link exacto del pin de Google Maps (si queda vacío, se busca la dirección)
  mapsUrl: 'https://maps.app.goo.gl/Y4UzwntUFD6N6WxSA',   // pin exacto del Salón de Fer

  // --- Confirmaciones (respaldo: también se edita en el panel → Evento) ---
  fechaLimiteRsvp: '2026-11-20T23:59:59-03:00',

  // --- Fotos ("Subir fotos" se habilita solo, 2 horas antes del evento) ---
  fotos: {
    ladoMax: 1600,          // px del lado mayor de la foto que se muestra en pantalla
    calidad: 0.8,           // calidad JPEG (0 a 1)
    originalMaxMB: 8,       // se guarda el original si pesa menos que esto
    espacioOriginalesMB: 800, // al llegar a esto se dejan de guardar originales (el plan gratis tiene 1 GB)
    limitePorHora: 30,      // fotos por celular por hora
    leyendaMax: 80
  },

  // --- Filtro automático (0 a 1). Si se supera, la foto NO se publica y queda en revisión ---
  filtro: {
    porn: 0.40,
    hentai: 0.40,
    sexy: 0.70
  },

  // --- Trivia ---
  trivia: { segundos: 20 },

  // --- Dress code ---
  dressCode: {
    titulo: 'Elegante.',
    texto: 'No hace falta etiqueta rigurosa, pero sí venir bien vestidos para la ocasión. Si querés sumarte a la paleta de la noche: blanco, negro o dorado ✨',
    colores: [
      { nombre: 'Blanco', hex: '#ffffff' },
      { nombre: 'Negro', hex: '#1d1d1f' },
      { nombre: 'Dorado', hex: '#c9a24a' }
    ]
  },

  // --- Cierre ---
  cierre: { texto: 'Gracias por ser parte de mi vida. ¡Los espero!', firma: 'Silvia' },

  // --- Música de fondo (opcional). Ej: 'assets/musica.mp3'. Vacío = sin botón de música ---
  musicaUrl: '',

  // --- Dirección del sitio publicado (la completa la guía, paso 5). Vacío = se detecta sola ---
  sitioUrl: '',
  // Texto corto que se ve en la pantalla del salón debajo del QR (ej: 'bit.ly/silvia60'). Vacío = el link completo
  linkCortoTexto: '',

  // --- Mensaje de WhatsApp para enviar cada invitación. {nombres} y {link} se reemplazan solos ---
  mensajeWhatsApp: '¡Hola {nombres}! 💛 Silvia cumple 60 y nos encantaría que nos acompañen. Acá está su invitación, con todos los datos y para confirmar asistencia: {link}',

  // --- Supabase (paso 2 de la guía). Si queda vacío, el sitio funciona en MODO DEMO (solo en este navegador) ---
  supabase: {
    url: 'https://zowplxhfndblpzirrhrh.supabase.co',
    anonKey: 'sb_publishable_Mr2jQjwLYar6SyWRLUwnow_SiULDA93'   // clave pública (publishable): puede estar en la web
  }
};

// Dirección base del sitio (no tocar)
(function () {
  var src = document.currentScript && document.currentScript.src;
  var base = window.CONFIG.sitioUrl || (src ? new URL('.', src).href : location.origin + '/');
  if (!/\/$/.test(base)) base += '/';
  window.CONFIG.base = base;
  window.CONFIG.modoDemo = !(window.CONFIG.supabase.url && window.CONFIG.supabase.anonKey);
})();
