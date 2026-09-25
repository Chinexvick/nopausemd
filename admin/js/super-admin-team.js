// Super-admin-only team & access management: list of store_admins, their
// super-admin status, per-page permission toggles (admin_permissions,
// no-row-means-granted), and promote/revoke super admin. Every write goes
// through a SECURITY DEFINER RPC gated by is_super_admin() — this page's
// own client-side gate is UX only, not real enforcement.
(function () {
  var body = document.getElementById('team-body');
  if (!body) return;

  var PAGE_KEYS = ['orders', 'products', 'live-chat', 'contact-messages', 'bookings', 'speaking-engagements', 'analytics', 'subscriptions'];

  var admins = [];
  var superAdminIds = {};
  var permissions = {}; // adminId -> { pageKey: granted(bool) }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function gateOut() {
    document.getElementById('team-body').style.display = 'none';
    var gate = document.getElementById('super-admin-gate');
    if (gate) gate.style.display = 'block';
    setTimeout(function () { location.replace('overview.html'); }, 1500);
  }

  function initials(name, email) {
    var source = (name || email || 'Admin').trim();
    var parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return source.slice(0, 2).toUpperCase();
  }

  async function notifySensitiveAction(action, target) {
    try {
      var session = (await window.sb.auth.getSession()).data.session;
      if (!session) return;
      fetch('/api/notify-sensitive-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ action: action, target: target, actor_email: window.CURRENT_ADMIN.email })
      }).catch(function () {});
    } catch (e) { /* best-effort, never block the UI on this */ }
  }

  async function logAction(action, target, metadata) {
    try {
      await window.sb.rpc('log_admin_action', { p_action: action, p_target: target, p_metadata: metadata || null });
    } catch (e) { /* best-effort */ }
  }

  async function loadAll() {
    var adminsPromise = window.sb.from('store_admins').select('*').order('created_at', { ascending: true });
    var superPromise = window.sb.from('super_admins').select('id');
    var permsPromise = window.sb.from('admin_permissions').select('*');

    var results = await Promise.all([adminsPromise, superPromise, permsPromise]);
    var adminsRes = results[0], superRes = results[1], permsRes = results[2];

    if (adminsRes.error) {
      document.getElementById('team-list').innerHTML = '<div class="orders-empty">Unable to load team: ' + escapeHtml(adminsRes.error.message) + '</div>';
      return;
    }

    admins = adminsRes.data || [];
    superAdminIds = {};
    (superRes.data || []).forEach(function (r) { superAdminIds[r.id] = true; });

    permissions = {};
    (permsRes.data || []).forEach(function (r) {
      if (!permissions[r.admin_id]) permissions[r.admin_id] = {};
      permissions[r.admin_id][r.page_key] = r.granted;
    });

    render();
  }

  function render() {
    var el = document.getElementById('team-list');
    if (!admins.length) { el.innerHTML = '<div class="orders-empty">No admins found.</div>'; return; }

    el.innerHTML = admins.map(function (a) {
      var isSuper = !!superAdminIds[a.id];
      var perms = permissions[a.id] || {};

      var permCheckboxes = PAGE_KEYS.map(function (key) {
        var granted = perms[key] !== false; // no row = granted by default
        return '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-dark);">' +
          '<input type="checkbox" class="perm-toggle" data-admin-id="' + a.id + '" data-page-key="' + key + '"' + (granted ? ' checked' : '') + '> ' +
          escapeHtml(key) +
        '</label>';
      }).join('');

      return (
        '<div class="card">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px;">' +
            '<div class="name-cell">' +
              '<span class="avatar-sm">' + initials(a.full_name, a.email) + '</span>' +
              '<div>' +
                '<div class="cell-name">' + escapeHtml(a.full_name || a.email) +
                  (isSuper ? ' <span class="badge badge-green" style="margin-left:6px;"><span class="badge-dot"></span>Super Admin</span>' : '') +
                '</div>' +
                '<div class="cell-sub">' + escapeHtml(a.email) + '</div>' +
              '</div>' +
            '</div>' +
            '<button class="btn ' + (isSuper ? 'btn-danger' : 'btn-secondary') + ' super-toggle-btn" data-admin-id="' + a.id + '" data-is-super="' + isSuper + '">' +
              (isSuper ? 'Revoke Super Admin' : 'Promote to Super Admin') +
            '</button>' +
          '</div>' +
          '<div class="label-caps">Page permissions</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:14px;">' + permCheckboxes + '</div>' +
        '</div>'
      );
    }).join('');

    el.querySelectorAll('.perm-toggle').forEach(function (input) {
      input.addEventListener('change', onPermToggle);
    });
    el.querySelectorAll('.super-toggle-btn').forEach(function (btn) {
      btn.addEventListener('click', onSuperToggle);
    });
  }

  async function onPermToggle(e) {
    var input = e.currentTarget;
    var adminId = input.getAttribute('data-admin-id');
    var pageKey = input.getAttribute('data-page-key');
    var granted = input.checked;

    input.disabled = true;
    try {
      var res = await window.sb.rpc('set_admin_permission', { p_admin_id: adminId, p_page_key: pageKey, p_granted: granted });
      if (res.error) throw res.error;

      if (!permissions[adminId]) permissions[adminId] = {};
      permissions[adminId][pageKey] = granted;

      var targetAdmin = admins.find(function (a) { return a.id === adminId; });
      var targetLabel = (targetAdmin ? targetAdmin.email : adminId) + ' — ' + pageKey;
      await logAction('set_admin_permission', targetLabel, { page_key: pageKey, granted: granted });
      notifySensitiveAction('Changed page permission (' + (granted ? 'granted' : 'denied') + ')', targetLabel);
    } catch (err) {
      alert('Could not update permission: ' + (err.message || err));
      input.checked = !granted;
    } finally {
      input.disabled = false;
    }
  }

  async function onSuperToggle(e) {
    var btn = e.currentTarget;
    var adminId = btn.getAttribute('data-admin-id');
    var isSuper = btn.getAttribute('data-is-super') === 'true';
    var targetAdmin = admins.find(function (a) { return a.id === adminId; });
    var label = targetAdmin ? (targetAdmin.full_name || targetAdmin.email) : adminId;

    if (isSuper) {
      if (!confirm('Revoke super admin access for ' + label + '?')) return;
    } else {
      if (!confirm('Promote ' + label + ' to super admin?')) return;
    }

    btn.disabled = true;
    try {
      if (isSuper) {
        var revokeRes = await window.sb.rpc('revoke_super_admin', { p_user_id: adminId });
        if (revokeRes.error) throw revokeRes.error;
        notifySensitiveAction('Revoked super admin', targetAdmin ? targetAdmin.email : adminId);
      } else {
        var grantRes = await window.sb.rpc('grant_super_admin', { p_user_id: adminId, p_full_name: targetAdmin ? targetAdmin.full_name : null });
        if (grantRes.error) throw grantRes.error;
        notifySensitiveAction('Granted super admin', targetAdmin ? targetAdmin.email : adminId);
      }
      await loadAll();
    } catch (err) {
      // "Cannot remove the last super admin" and other RPC errors should
      // read as a clear message, not a raw crash.
      alert(err && err.message ? err.message : 'That action could not be completed.');
      btn.disabled = false;
    }
  }

  var refreshBtn = document.getElementById('refresh-team');
  if (refreshBtn) refreshBtn.addEventListener('click', function (e) { e.preventDefault(); loadAll(); });

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
    if (!window.CURRENT_ADMIN.isSuperAdmin) { gateOut(); return; }
    loadAll();
  });
})();
