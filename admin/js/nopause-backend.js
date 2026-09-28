// Client for the NoPauseMD admin-backend (https://clinipausemd-admin-backend.onrender.com)
// and its own Supabase project (efaulijkuqxwmsrvxwtc — confirmed by its table names:
// clinicians, consultation_messages, assessment_versions, feature_flags, etc., matching
// the admin-backend's own repositories). This is now the ONE sign-in for the whole admin
// dashboard (see auth-guard.js) — independent of window.sb, the website's own Supabase
// client, which auth-guard.js bridges into automatically after this sign-in succeeds so
// Orders/Products/Live Chat/Contact Form/Bookings/Speaking Engagements keep working.
window.NOPAUSE_BACKEND_URL = 'https://clinipausemd-admin-backend.onrender.com';
window.NOPAUSE_SUPABASE_URL = 'https://efaulijkuqxwmsrvxwtc.supabase.co';
window.NOPAUSE_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmYXVsaWprdXF4d21zcnZ4d3RjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4MTI3OTUsImV4cCI6MjEwNTM4ODc5NX0.4phbivgGhTBA2qC3IEUzuyvXrYnmdR8VHNs_vgf506U';

(function () {
  if (window.NOPAUSE_SUPABASE_URL && window.NOPAUSE_SUPABASE_ANON_KEY && typeof supabase !== 'undefined') {
    window.nopauseSb = supabase.createClient(window.NOPAUSE_SUPABASE_URL, window.NOPAUSE_SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'nopause-admin-backend-auth' }
    });
  }

  function isConfigured() {
    return !!window.nopauseSb;
  }

  function getSession() {
    if (!isConfigured()) return Promise.resolve(null);
    return window.nopauseSb.auth.getSession().then(function (r) { return (r.data && r.data.session) || null; });
  }

  function signIn(email, password) {
    if (!isConfigured()) return Promise.reject(new Error('Backend not configured yet.'));
    return window.nopauseSb.auth.signInWithPassword({ email: email, password: password }).then(function (r) {
      if (r.error) throw r.error;
      return r.data.session;
    });
  }

  function signOut() {
    if (!isConfigured()) return Promise.resolve();
    return window.nopauseSb.auth.signOut();
  }

  // Calls the admin-backend, attaching the signed-in staff member's bearer token.
  // Rejects with a readable Error on any non-2xx response.
  function api(path, options) {
    options = options || {};
    return getSession().then(function (session) {
      if (!session) throw new Error('Not signed in to the NoPauseMD backend.');
      var headers = Object.assign({ 'Authorization': 'Bearer ' + session.access_token }, options.headers || {});
      if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
      return fetch(window.NOPAUSE_BACKEND_URL + path, Object.assign({}, options, { headers: headers }));
    }).then(function (res) {
      if (res.status === 204) return null;
      return res.json().catch(function () { return null; }).then(function (body) {
        if (!res.ok) {
          var message = (body && body.error && body.error.message) || ('Request failed (' + res.status + ')');
          var err = new Error(message);
          err.code = body && body.error && body.error.code;
          err.status = res.status;
          throw err;
        }
        return body;
      });
    });
  }

  // Downloads a CSV export, saving it via a synthetic <a download>.
  function downloadCsv(path) {
    return getSession().then(function (session) {
      if (!session) throw new Error('Not signed in to the NoPauseMD backend.');
      return fetch(window.NOPAUSE_BACKEND_URL + path, {
        headers: { 'Authorization': 'Bearer ' + session.access_token }
      });
    }).then(function (res) {
      if (!res.ok) return res.json().then(function (body) {
        throw new Error((body && body.error && body.error.message) || ('Export failed (' + res.status + ')'));
      });
      var disposition = res.headers.get('Content-Disposition') || '';
      var match = disposition.match(/filename="?([^"]+)"?/);
      var filename = match ? match[1] : 'export.csv';
      return res.blob().then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      });
    });
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  window.NopauseBackend = {
    isConfigured: isConfigured,
    getSession: getSession,
    signIn: signIn,
    signOut: signOut,
    api: api,
    downloadCsv: downloadCsv,
    escapeHtml: escapeHtml
  };
})();
