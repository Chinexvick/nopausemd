// Privacy & Compliance: consent totals, data requests and security events
// from the app's audit log (no personal details leave the database).
(function () {
  if (!document.getElementById('pc-events')) return;
  var esc = NopauseBackend.escapeHtml;
  var LABEL = {
    'consent.record': 'Consent recorded', 'privacy.sharing_updated': 'Data sharing preferences changed',
    'account.password_changed': 'Password changed', 'auth.password_reset_completed': 'Password reset completed',
    'auth.login_failed': 'Failed sign-in attempt', 'audit.viewed': 'Audit log viewed by staff',
    'settings.updated': 'Account settings updated', 'partner.invite_created': 'Partner access invited',
    'partner.invite_revoked': 'Partner access revoked'
  };
  function nice(a) { return LABEL[a] || String(a).replace(/[._]/g, ' ').replace(/^\w/, function (c) { return c.toUpperCase(); }); }
  function when(iso) { return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  function row(e, extra) {
    return '<div class="timeline-item"><div class="t-dot"></div><div class="t-body"><div class="t-title">' + esc(nice(e.action)) + (extra || '') + '</div>' +
      '<div class="t-time">' + when(e.at) + (e.role ? ' · ' + esc(e.role) : '') + '</div></div></div>';
  }
  function load() {
    NopauseBackend.rpc('admin_compliance').then(function (d) {
      var c = d.consents || {};
      var keys = Object.keys(c);
      var minGranted = keys.length ? Math.min.apply(null, keys.map(function (k) { return c[k].granted; })) : 0;
      document.getElementById('pc-consent').textContent = minGranted;
      document.getElementById('pc-withdrawn').textContent = keys.reduce(function (s, k) { return s + c[k].withdrawn; }, 0);
      document.getElementById('pc-sharing').textContent = d.sharing_changes_30d;
      document.getElementById('pc-failed').textContent = d.failed_logins_7d;
      document.getElementById('pc-consents').innerHTML = keys.length ? keys.map(function (k) {
        return '<tr><td>' + esc(k.replace(/_/g, ' ').replace(/^\w/, function (x) { return x.toUpperCase(); })) + '</td><td>' + c[k].granted + '</td><td>' + c[k].withdrawn + '</td></tr>';
      }).join('') : '<tr><td colspan="3" class="orders-empty">No consents recorded yet.</td></tr>';
      document.getElementById('pc-requests').innerHTML = (d.data_requests || []).length
        ? d.data_requests.map(function (e) { return row(e, ' · #' + e.id); }).join('')
        : '<div class="orders-empty">No data export or deletion requests yet.</div>';
      document.getElementById('pc-events').innerHTML = (d.events || []).length
        ? d.events.map(function (e) { return row(e); }).join('')
        : '<div class="orders-empty">No events yet.</div>';
    }).catch(function (err) {
      document.getElementById('pc-events').innerHTML = '<div class="orders-empty">Unavailable: ' + esc(err.message) + '</div>';
    });
  }
  var tries = 0;
  var iv = setInterval(function () {
    if (window.CURRENT_ADMIN) { clearInterval(iv); load(); }
    else if (++tries > 200) clearInterval(iv);
  }, 50);
})();
