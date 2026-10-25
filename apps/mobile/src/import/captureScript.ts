/** Tamaño máximo del archivo capturado (los movimientos de varios años suelen pesar menos de 1 MB). */
export const MAX_CAPTURE_BYTES = 10 * 1024 * 1024;

/** Mensajes que envía el script inyectado a la app. */
export type CaptureMessage =
  | { type: 'mf-file'; name: string; mime: string; data: string }
  | { type: 'mf-file'; name: string; mime: string; text: string }
  | { type: 'mf-busy' }
  | { type: 'mf-error'; code: 'too_large' | 'read' | 'fetch' };

/**
 * Script que se inyecta en la web del broker antes de que cargue. Solo intercepta descargas
 * de archivos (enlaces `download`, `blob:` y `data:`, y archivos abiertos con `window.open`)
 * y envía su contenido a la app. No lee formularios, campos ni contraseñas.
 */
export const CAPTURE_SCRIPT = `(function () {
  if (window.__mfCapture) return;
  window.__mfCapture = true;
  var MAX = ${MAX_CAPTURE_BYTES};
  var blobs = {};

  function post(msg) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch (e) {}
  }

  function sendBlob(blob, name) {
    if (blob.size > MAX) { post({ type: 'mf-error', code: 'too_large' }); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var s = String(reader.result);
      post({ type: 'mf-file', name: name || '', mime: blob.type || '', data: s.slice(s.indexOf(',') + 1) });
    };
    reader.onerror = function () { post({ type: 'mf-error', code: 'read' }); };
    reader.readAsDataURL(blob);
  }

  function nameFromUrl(url) {
    try {
      var path = new URL(url, location.href).pathname;
      return decodeURIComponent(path.split('/').pop() || '');
    } catch (e) { return ''; }
  }

  function nameFromHeader(header) {
    var m = /filename\\*=(?:UTF-8'')?([^;]+)/i.exec(header) || /filename="?([^";]+)"?/i.exec(header);
    if (!m) return '';
    try { return decodeURIComponent(m[1].trim()); } catch (e) { return m[1].trim(); }
  }

  /** Descarga el archivo desde la propia página (con la sesión del usuario) y lo envía. */
  function capture(url, name, allowHttp) {
    if (typeof url !== 'string' || !url) return false;
    var isBlob = url.indexOf('blob:') === 0;
    var isData = url.indexOf('data:') === 0;
    if (isBlob && blobs[url]) { sendBlob(blobs[url], name); return true; }
    if (!isBlob && !isData && !(allowHttp && /^https?:/i.test(url))) return false;
    post({ type: 'mf-busy' });
    fetch(url, { credentials: 'include' })
      .then(function (r) {
        if (!r.ok) throw new Error('status');
        var header = r.headers.get('content-disposition') || '';
        return r.blob().then(function (b) { sendBlob(b, name || nameFromHeader(header) || nameFromUrl(url)); });
      })
      .catch(function () { post({ type: 'mf-error', code: 'fetch' }); });
    return true;
  }

  function handleAnchor(a) {
    if (!a || !a.href) return false;
    var href = a.href;
    var download = a.hasAttribute && a.hasAttribute('download');
    if (!download && href.indexOf('blob:') !== 0 && href.indexOf('data:') !== 0) return false;
    var name = (download && a.getAttribute('download')) || '';
    return capture(href, name, download);
  }

  var createObjectURL = URL.createObjectURL;
  URL.createObjectURL = function (obj) {
    var url = createObjectURL.apply(URL, arguments);
    if (obj instanceof Blob) blobs[url] = obj;
    return url;
  };

  document.addEventListener('click', function (ev) {
    var el = ev.target;
    var a = el && el.closest ? el.closest('a') : null;
    if (handleAnchor(a)) { ev.preventDefault(); ev.stopPropagation(); }
  }, true);

  // Descargas con enlaces creados por código y sin agregar a la página (patrón habitual).
  var click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (!this.isConnected && handleAnchor(this)) return;
    return click.apply(this, arguments);
  };
  var dispatch = HTMLAnchorElement.prototype.dispatchEvent;
  HTMLAnchorElement.prototype.dispatchEvent = function (ev) {
    if (ev && ev.type === 'click' && !this.isConnected && handleAnchor(this)) return false;
    return dispatch.apply(this, arguments);
  };

  var open = window.open;
  window.open = function (url) {
    if (typeof url === 'string' && (url.indexOf('blob:') === 0 || url.indexOf('data:') === 0) && capture(url, '', false)) return null;
    return open.apply(window, arguments);
  };

  /** La app lo llama cuando el servidor responde con un archivo para descargar (iOS). */
  window.__mfFetchDownload = function (url) { capture(url, '', true); };
})();
true;`;

/**
 * Script que corre al terminar de cargar cada página: si el navegador mostró un archivo de texto
 * (CSV) en lugar de descargarlo, envía su contenido.
 */
export const INLINE_FILE_SCRIPT = `(function () {
  try {
    var type = (document.contentType || '').toLowerCase();
    if (/csv|text\\/plain|excel|spreadsheet|tab-separated/.test(type) && document.body) {
      var path = location.pathname.split('/').pop() || '';
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'mf-file', name: decodeURIComponent(path), mime: type, text: document.body.innerText }));
    }
  } catch (e) {}
})();
true;`;

/** Valida un mensaje recibido del navegador; devuelve undefined si no tiene la forma esperada. */
export function parseCaptureMessage(raw: string): CaptureMessage | undefined {
  if (raw.length > MAX_CAPTURE_BYTES * 1.4 + 1000) return { type: 'mf-error', code: 'too_large' };
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!msg || typeof msg !== 'object') return undefined;
  const m = msg as Record<string, unknown>;
  if (m.type === 'mf-busy') return { type: 'mf-busy' };
  if (m.type === 'mf-error') {
    return m.code === 'too_large' || m.code === 'read' || m.code === 'fetch' ? { type: 'mf-error', code: m.code } : undefined;
  }
  if (m.type !== 'mf-file') return undefined;
  const name = typeof m.name === 'string' ? m.name.slice(0, 200) : '';
  const mime = typeof m.mime === 'string' ? m.mime.slice(0, 100) : '';
  if (typeof m.data === 'string' && /^[A-Za-z0-9+/=\s]*$/.test(m.data.slice(0, 1000))) return { type: 'mf-file', name, mime, data: m.data };
  if (typeof m.text === 'string') return { type: 'mf-file', name, mime, text: m.text };
  return undefined;
}
