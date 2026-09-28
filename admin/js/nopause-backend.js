// Client for the NoPauseMD admin-backend (https://clinipausemd-admin-backend.onrender.com).
// This is a SEPARATE product's backend from the CliniPauseMD website — it has its own
// Supabase project (the NoPauseMD mobile app's), so it needs its own auth session,
// independent of window.sb (the website's Supabase client used by Orders, Products,
// Live Chat, Contact Form, Bookings, Speaking Engagements and the Super Admin pages).
//
// TODO: fill in the NoPauseMD app's Supabase project URL + publishable (anon) key below —
// the same values used by the mobile app's EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
// Until these are set, every backend-powered page shows "Backend not configured yet" instead
// of failing silently.
window.NOPAUSE_BACKEND_URL = 'https://clinipausemd-admin-backend.onrender.com';
window.NOPAUSE_SUPABASE_URL = ''; // e.g. 'https://xxxx.supabase.co'
window.NOPAUSE_SUPABASE_ANON_KEY = '';

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

  // Renders a small inline "connect" card into `container` when there is no session yet.
  // Calls `onReady()` once a session exists (either already present, or just signed in).
  function ensureSession(container, onReady) {
    if (!isConfigured()) {
      container.innerHTML = '<div class="orders-empty">This section isn\'t configured yet — the NoPauseMD backend needs its Supabase URL and key set in js/nopause-backend.js.</div>';
      return;
    }
    getSession().then(function (session) {
      if (session) { onReady(session); return; }
      renderConnectForm(container, onReady);
    });
  }

  function renderConnectForm(container, onReady) {
    container.innerHTML =
      '<div class="card" style="max-width:420px;">' +
        '<div class="card-title">Connect to the NoPauseMD backend</div>' +
        '<p style="font-size:13px;color:var(--text-muted);margin:0 0 14px;">Sign in with your NoPauseMD staff account to load this section.</p>' +
        '<form id="nopause-connect-form">' +
          '<input type="email" required placeholder="Staff email" id="nopause-connect-email" style="width:100%;padding:10px 12px;margin-bottom:10px;border:1px solid var(--border);border-radius:8px;">' +
          '<input type="password" required placeholder="Password" id="nopause-connect-password" style="width:100%;padding:10px 12px;margin-bottom:10px;border:1px solid var(--border);border-radius:8px;">' +
          '<div id="nopause-connect-error" style="display:none;color:var(--red);font-size:13px;margin-bottom:10px;"></div>' +
          '<button type="submit" class="btn btn-primary" style="width:100%;">Sign in</button>' +
        '</form>' +
      '</div>';

    document.getElementById('nopause-connect-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var email = document.getElementById('nopause-connect-email').value;
      var password = document.getElementById('nopause-connect-password').value;
      var errorEl = document.getElementById('nopause-connect-error');
      errorEl.style.display = 'none';
      signIn(email, password).then(function (session) {
        container.innerHTML = '';
        onReady(session);
      }).catch(function (err) {
        errorEl.textContent = (err && err.message) || 'Sign-in failed.';
        errorEl.style.display = 'block';
      });
    });
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
    ensureSession: ensureSession,
    api: api,
    downloadCsv: downloadCsv,
    escapeHtml: escapeHtml
  };
})();
