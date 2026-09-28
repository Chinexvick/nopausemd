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
          '<td>' + esc((s.roles || []).join(', ')) + '</td>' +
          '<td>' + status + '</td>' +
          '<td>' + (s.isSuperAdmin ? '—' : '<a href="#" class="reset-btn" data-id="' + s.userId + '" style="color:var(--blue);font-weight:600;">Reset password</a> &nbsp; <a href="#" class="remove-btn" data-id="' + s.userId + '" style="color:var(--red);font-weight:600;">Remove</a>') + '</td></tr>';
      }).join('');

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
