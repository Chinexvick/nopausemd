// Add and manage staff. Accounts are created on the app backend (POST /v1/staff);
// the temporary password it generates is never shown on screen. Instead it is
// handed straight to the website server, which emails the person a branded
// message with their email, the temporary password, and the sign-in link.
// If that email can't be sent, the password is shown once so it isn't lost.
(function () {
  var NB = window.NopauseBackend, esc = NB.escapeHtml;
  var MAIL_API = 'https://www.clinipausemd.com/api/admin-actions';
  var ROLES = [['admin', 'Administrator'], ['clinical_lead', 'Clinical Lead'], ['clinician', 'Clinician']];
  var ROLE_HINT = {
    admin: 'Full access, including managing the team.',
    clinical_lead: 'Assigns and oversees consultations, manages clinical content.',
    clinician: 'Sees only consultations assigned to them; replies and takes video visits.'
  };
  var staff = [];

  function toast(t, b, k) { if (window.StaffAlerts) window.StaffAlerts.toast(t, b, null, k); }
  function ago(iso) { return iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''; }
  function roleOf(s) { var r = (s.roles || []).filter(function (x) { return ROLES.some(function (y) { return y[0] === x; }); }); return r[0] || 'clinician'; }

  function sendWelcome(p) {
    return NB.getSession().then(function (session) {
      return fetch(MAIL_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ action: 'send_staff_welcome', email: p.email, name: p.name, role: p.role, temporaryPassword: p.temporaryPassword, expiresAt: p.expiresAt, kind: p.kind })
      });
    }).then(function (res) { return res.json().catch(function () { return {}; }).then(function (b) { if (!res.ok) throw new Error(b.error || 'Email failed'); return true; }); });
  }

  // Exposed so other pages (e.g. adding a clinician) can reuse the same email.
  window.StaffOnboarding = { sendWelcome: sendWelcome, showPassword: showPassword };

  function modal(html) {
    var m = document.getElementById('sm-modal'), o = document.getElementById('sm-overlay');
    if (!m) {
      o = document.createElement('div'); o.id = 'sm-overlay'; o.className = 'od-overlay'; o.hidden = true;
      m = document.createElement('div'); m.id = 'sm-modal'; m.className = 'cx-modal'; m.hidden = true;
      document.body.appendChild(o); document.body.appendChild(m);
    }
    m.innerHTML = html; m.hidden = false; o.hidden = false;
    function close() { m.hidden = true; o.hidden = true; }
    o.onclick = close; m.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', close); });
    return close;
  }

  function showPassword(email, password, why) {
    modal('<h3>Share this password securely</h3><p class="od-sub">' + esc(why || 'The email could not be sent, so the password is shown once here.') + ' It is not stored anywhere. They must choose their own password the first time they sign in.</p>' +
      '<div style="background:#f3f8f1;border:1px solid #cfe3c8;border-radius:10px;padding:12px 14px;margin:12px 0;"><div class="od-label">' + esc(email) + '</div><div style="font:700 17px Menlo,Consolas,monospace;user-select:all;word-break:break-all;">' + esc(password) + '</div></div>' +
      '<div class="cx-modal-foot"><button type="button" class="btn btn-secondary" id="sm-copy">Copy password</button><button type="button" class="btn btn-primary" data-close>Done</button></div>');
    var c = document.getElementById('sm-copy');
    if (c) c.onclick = function () { if (navigator.clipboard) navigator.clipboard.writeText(password).then(function () { c.textContent = 'Copied'; }); };
  }

  var root = document.getElementById('staff-manager');
  if (!root) return;

  function deliver(res, email, name, role, kind) {
    var pw = res && res.temporaryPassword;
    if (!pw) return Promise.resolve({ sent: false, existing: true });
    return sendWelcome({ email: email, name: name, role: role, temporaryPassword: pw, expiresAt: res.temporaryPasswordExpiresAt, kind: kind })
      .then(function () { return { sent: true }; })
      .catch(function (err) { showPassword(email, pw, 'The email could not be sent (' + err.message + ').'); return { sent: false, shown: true }; });
  }

  function render() {
    var rows = staff.map(function (s) {
      var role = roleOf(s);
      var status = !s.emailConfirmed ? '<span class="badge badge-amber">Invited</span>' : (s.lastSignInAt ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-blue">Waiting for first sign-in</span>');
      return '<tr><td><strong>' + esc(s.displayName || s.email.split('@')[0]) + '</strong>' + (s.isSuperAdmin ? ' <span class="badge badge-blue">Owner</span>' : '') + '<div class="od-sub">' + esc(s.email) + '</div></td>' +
        '<td>' + (s.isSuperAdmin ? 'Administrator' : '<select class="sm-role" data-id="' + s.userId + '" aria-label="Role" style="padding:5px 8px;border:1px solid var(--border);border-radius:6px;">' + ROLES.map(function (r) { return '<option value="' + r[0] + '"' + (r[0] === role ? ' selected' : '') + '>' + r[1] + '</option>'; }).join('') + '</select>') + '</td>' +
        '<td>' + status + '<div class="od-sub">' + (s.lastSignInAt ? 'Last sign-in ' + ago(s.lastSignInAt) : 'Added ' + ago(s.createdAt)) + '</div></td>' +
        '<td>' + (s.isSuperAdmin ? '—' : '<a href="#" class="sm-resend" data-id="' + s.userId + '" style="color:var(--blue);font-weight:600;">Send new login details</a><br><a href="#" class="sm-remove" data-id="' + s.userId + '" style="color:var(--red);font-weight:600;">Remove access</a>') + '</td></tr>';
    }).join('');
    document.getElementById('sm-body').innerHTML = rows || '<tr><td colspan="4" class="orders-empty">No staff yet.</td></tr>';
  }

  function load() {
    return NB.api('/v1/staff').then(function (d) { staff = d.staff || []; render(); })
      .catch(function (err) { document.getElementById('sm-body').innerHTML = '<tr><td colspan="4" class="orders-empty">' + (err.status === 403 ? 'Only administrators can manage the team.' : 'Unable to load staff: ' + esc(err.message)) + '</td></tr>'; });
  }

  root.innerHTML =
    '<div class="card" style="margin-bottom:18px;"><div class="card-title">Add a team member</div>' +
    '<p class="od-sub" style="margin-top:-4px;">They are emailed their login details automatically: their email, a temporary password and a link to sign in. They choose their own password the first time.</p>' +
    '<form id="sm-form" class="od-form"><div class="od-grid2"><label>Full name<input name="name" maxlength="80" required placeholder="e.g. Grace Okafor"></label><label>Email<input name="email" type="email" required placeholder="name@example.com"></label></div>' +
    '<label>Role<select name="role">' + ROLES.map(function (r) { return '<option value="' + r[0] + '">' + r[1] + '</option>'; }).join('') + '</select></label>' +
    '<span class="od-sub" id="sm-hint" style="margin-top:-4px;">' + ROLE_HINT.admin + '</span>' +
    '<div class="od-form-foot"><span class="od-msg" id="sm-msg"></span><button type="submit" class="btn btn-primary">Add and email login details</button></div></form></div>' +
    '<div class="table-card"><div class="table-card-header">Team</div><table class="data-table"><thead><tr><th>Person</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody id="sm-body"><tr><td colspan="4" class="orders-empty">Loading…</td></tr></tbody></table></div>';

  var form = document.getElementById('sm-form');
  form.role.addEventListener('change', function () { document.getElementById('sm-hint').textContent = ROLE_HINT[form.role.value]; });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = form.querySelector('button[type=submit]'), msg = document.getElementById('sm-msg');
    var email = form.email.value.trim(), name = form.name.value.trim(), role = form.role.value;
    btn.disabled = true; msg.textContent = 'Creating the account…'; msg.className = 'od-msg';
    NB.api('/v1/staff', { method: 'POST', body: JSON.stringify({ email: email, roles: [role], displayName: name, method: 'password' }) })
      .then(function (res) {
        msg.textContent = 'Sending the email…';
        return deliver(res, email, name, role, 'welcome').then(function (r) {
          if (r.existing) { msg.textContent = 'They already had an account, so the role was added and no password was changed.'; msg.className = 'od-msg'; }
          else if (r.sent) { msg.textContent = 'Done. Login details were emailed to ' + email + '.'; msg.className = 'od-msg ok'; }
          else { msg.textContent = 'Account created. See the password to share.'; msg.className = 'od-msg'; }
          form.reset(); document.getElementById('sm-hint').textContent = ROLE_HINT.admin;
          return load();
        });
      })
      .catch(function (err) { msg.textContent = err.message; msg.className = 'od-msg err'; })
      .then(function () { btn.disabled = false; });
  });

  document.getElementById('sm-body').addEventListener('click', function (e) {
    var rs = e.target.closest('.sm-resend'), rm = e.target.closest('.sm-remove');
    if (!rs && !rm) return;
    e.preventDefault();
    var id = (rs || rm).getAttribute('data-id'), s = staff.filter(function (x) { return x.userId === id; })[0];
    if (!s) return;
    if (rs) {
      if (!confirm('Create a new temporary password for ' + s.email + ' and email it to them? Their current password will stop working.')) return;
      NB.api('/v1/staff/' + id + '/reset-password', { method: 'POST', body: JSON.stringify({ method: 'password' }) })
        .then(function (res) { return deliver(res, s.email, s.displayName || '', roleOf(s), 'reset'); })
        .then(function (r) { if (r.sent) toast('Login details sent', 'A new temporary password was emailed to ' + s.email + '.', 'ok'); load(); })
        .catch(function (err) { toast('Could not reset the password', err.message, 'error'); });
    } else {
      if (!confirm('Remove ' + s.email + '\'s staff access? Their account and data are kept.')) return;
      NB.api('/v1/staff/' + id, { method: 'DELETE' }).then(load).catch(function (err) { toast('Could not remove', err.message, 'error'); });
    }
  });

  document.getElementById('sm-body').addEventListener('change', function (e) {
    var sel = e.target.closest('.sm-role'); if (!sel) return;
    var id = sel.getAttribute('data-id'), s = staff.filter(function (x) { return x.userId === id; })[0], before = roleOf(s);
    if (!confirm('Change ' + s.email + ' to ' + sel.options[sel.selectedIndex].text + '? It applies on their very next action.')) { sel.value = before; return; }
    NB.api('/v1/staff/' + id, { method: 'PATCH', body: JSON.stringify({ roles: [sel.value] }) }).then(load)
      .catch(function (err) { toast('Could not change the role', err.message, 'error'); sel.value = before; });
  });

  var tries = 0;
  var iv = setInterval(function () {
    if (window.CURRENT_ADMIN) { clearInterval(iv); load(); } else if (++tries > 200) clearInterval(iv);
  }, 50);
})();
