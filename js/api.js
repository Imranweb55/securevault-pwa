/* ------------------------------------------------------------------
   Thin wrapper around the Google Apps Script web app.
   POST bodies are sent as text/plain so the browser skips the CORS pre-flight
   (Apps Script cannot answer OPTIONS requests).
   ------------------------------------------------------------------ */
window.Api = (function () {
  'use strict';
  function url() { return window.APP_CONFIG.API_URL; }

  function netError() { var e = new Error('network'); e.kind = 'network'; return e; }
  function serverError() { var e = new Error('bad_response'); e.kind = 'server'; return e; }

  async function parse(res) {
    try { return await res.json(); } catch (e) { throw serverError(); }
  }

  async function getPublic() {
    var res;
    try { res = await fetch(url(), { method: 'GET', redirect: 'follow', cache: 'no-store' }); }
    catch (e) { throw netError(); }
    return parse(res);
  }

  async function call(action, data) {
    var res;
    try {
      res = await fetch(url(), {
        method: 'POST',
        redirect: 'follow',
        cache: 'no-store',
        body: JSON.stringify(Object.assign({ action: action }, data || {})),
      });
    } catch (e) { throw netError(); }
    return parse(res);
  }

  return { getPublic: getPublic, call: call };
})();
