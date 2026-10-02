(function () {
  var esc = NopauseBackend.escapeHtml;

  document.addEventListener('DOMContentLoaded', function () {
    loadStaff();
    document.getElementById('add-staff-form').addEventListener('submit', addStaff);
  });

  function loadStaff() {
    var body = document.getElementById('staff-body');
    NopauseBackend.api('/v1/staff').then(function (data) {
      var staff = data.staff || [];
      if (!staff.length) {
        body.innerHTML = '<tr><td colspan="4" class="orders-empty">No staff accounts yet.</td></tr>';
        return;
      }
      body.innerHTML = staff.map(function (s) {
        var status = s.emailConfirmed ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-amber">Invited</span>';
        return '<tr><td>' + esc(s.email) + (s.isSuperAdmin ? ' <span class="badge badge-blue">Owner</span>' : '') + '</td>' +
          '<td>' + (s.isSuperAdmin ? esc((s.roles || []).join(', ')) : '<select class="role-sel" data-id="' + s.userId + '" aria-label="Role" style="padding:4px 8px;border:1px solid var(--border);border-radius:6px;">' +
            [['admin', 'Administrator'], ['clinical_lead', 'Clinical Lead'], ['clinician', 'Clinician']].map(function (r) { return '<option value="' + r[0] + '"' + ((s.roles || [])[0] === r[0] ? ' selected' : '') + '>' + r[1] + '</option>'; }).join('') + '</select>') +
          '<div class="od-sub">' + (s.lastSignInAt ? 'Last sign-in ' + new Date(s.lastSignInAt).toLocaleDateString() : 'Never signed in') + '</div></td>' +
          '<td>' + status + '</td>' +
          '<td>' + (s.isSuperAdmin ? '—' : '<a href="#" class="reset-btn" data-id="' + s.userId + '" style="color:var(--blue);font-weight:600;">Reset password</a> &nbsp; <a href="#" class="remove-btn" data-id="' + s.userId + '" style="color:var(--red);font-weight:600;">Remove</a>') + '</td></tr>';
      }).join('');

      body.querySelectorAll('.role-sel').forEach(function (sel) {
        var before = sel.value;
        sel.addEventListener('change', function () {
          if (!confirm('Change this person\'s role? It applies on their very next action.')) { sel.value = before; return; }
          NopauseBackend.api('/v1/staff/' + sel.getAttribute('data-id'), { method: 'PATCH', body: JSON.stringify({ roles: [sel.value] }) })
            .then(function () { before = sel.value; loadStaff(); })
            .catch(function (err) { alert('Could not change the role: ' + err.message); sel.value = before; });
        });
      });
      body.querySelectorAll('.reset-btn').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          var id = btn.getAttribute('data-id');
          NopauseBackend.api('/v1/staff/' + id + '/reset-password', { method: 'POST', body: JSON.stringify({}) })
            .then(function (res) {
              alert(res.emailed ? 'A new temporary password was emailed to them.' : 'Temporary password: ' + res.temporaryPassword);
            }).catch(function (err) { alert('Could not reset password: ' + err.message); });
        });
      });
      body.querySelectorAll('.remove-btn').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          var id = btn.getAttribute('data-id');
          if (!confirm('Remove this person\'s staff access?')) return;
          NopauseBackend.api('/v1/staff/' + id, { method: 'DELETE' })
            .then(loadStaff).catch(function (err) { alert('Could not remove: ' + err.message); });
        });
      });
    }).catch(function (err) {
      body.innerHTML = '<tr><td colspan="4" class="orders-empty">Unable to load staff: ' + esc(err.message) + '</td></tr>';
    });
  }

  function addStaff(e) {
    e.preventDefault();
    var email = document.getElementById('add-staff-email').value;
    var role = document.getElementById('add-staff-role').value;
    var result = document.getElementById('add-staff-result');
    result.textContent = 'Adding…';
    NopauseBackend.api('/v1/staff', { method: 'POST', body: JSON.stringify({ email: email, roles: [role] }) })
      .then(function (res) {
        result.textContent = res.emailed ? 'Invited — a temporary password was emailed to them.' :
          (res.temporaryPassword ? 'Temporary password (share securely, shown once): ' + res.temporaryPassword : 'Added.');
        document.getElementById('add-staff-form').reset();
        loadStaff();
      }).catch(function (err) {
        result.textContent = 'Error: ' + err.message;
      });
  }
})();
