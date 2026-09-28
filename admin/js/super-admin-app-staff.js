// NoPauseMD app staff panel on the website's Super Admin > Team & Access page.
// Separate backend, separate auth session (see nopause-backend.js) — gated the same
// way as the rest of this page (super admin only), reusing window.CURRENT_ADMIN set by auth-guard.js.
(function () {
  var esc = NopauseBackend.escapeHtml;

  function whenReady(cb) {
    if (window.CURRENT_ADMIN) { cb(); return; }
    var tries = 0;
    var iv = setInterval(function () {
      tries += 1;
      if (window.CURRENT_ADMIN) { clearInterval(iv); cb(); }
      else if (tries > 100) { clearInterval(iv); }
    }, 50);
  }

  whenReady(function () {
    if (!window.CURRENT_ADMIN.isSuperAdmin) return;
    var slot = document.getElementById('nopause-connect-slot');
    if (!slot) return;
    NopauseBackend.ensureSession(slot, loadAppStaff);
  });

  function loadAppStaff() {
    var body = document.getElementById('app-staff-body');
    NopauseBackend.api('/v1/staff').then(function (data) {
      var staff = data.staff || [];
      if (!staff.length) {
        body.innerHTML = '<tr><td colspan="4" class="orders-empty">No app staff accounts yet.</td></tr>';
        return;
      }
      body.innerHTML = staff.map(function (s) {
        var status = s.emailConfirmed ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-amber">Invited</span>';
        return '<tr><td>' + esc(s.email) + (s.isSuperAdmin ? ' <span class="badge badge-blue">Owner</span>' : '') + '</td>' +
          '<td>' + esc((s.roles || []).join(', ')) + '</td>' +
          '<td>' + status + '</td>' +
          '<td>' + (s.isSuperAdmin ? '—' : '<a href="admin-settings.html" style="color:var(--blue);font-weight:600;">Manage in Admin Settings</a>') + '</td></tr>';
      }).join('');
    }).catch(function (err) {
      body.innerHTML = '<tr><td colspan="4" class="orders-empty">Unable to load app staff: ' + esc(err.message) + '</td></tr>';
    });
  }
})();
