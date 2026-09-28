(function () {
  var esc = NopauseBackend.escapeHtml;

  document.addEventListener('DOMContentLoaded', function () {
    loadFlags();
    loadEscalations();
  });

  function loadFlags() {
    var grid = document.getElementById('flags-grid');
    NopauseBackend.api('/v1/flags').then(function (data) {
      var flags = data.flags || [];
      grid.innerHTML = flags.map(function (f) {
        return '<div class="card">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<strong>' + esc(f.label) + '</strong>' +
            '<div class="toggle-switch flag-toggle ' + (f.enabled ? 'on' : '') + '" data-key="' + esc(f.key) + '" data-enabled="' + f.enabled + '" style="cursor:pointer;"></div>' +
          '</div>' +
          '<div style="font-size:13px;color:var(--text-muted);margin-top:8px;">' + esc(f.description || '') + '</div>' +
        '</div>';
      }).join('');

      grid.querySelectorAll('.flag-toggle').forEach(function (toggle) {
        toggle.addEventListener('click', function () {
          var key = toggle.getAttribute('data-key');
          var enabled = toggle.getAttribute('data-enabled') === 'true';
          NopauseBackend.api('/v1/flags/' + key, { method: 'PUT', body: JSON.stringify({ enabled: !enabled }) })
            .then(loadFlags).catch(function (err) { alert('Could not update flag: ' + err.message); });
        });
      });
    }).catch(function (err) {
      grid.innerHTML = '<div class="card"><div class="orders-empty">Unable to load flags: ' + esc(err.message) + '</div></div>';
    });
  }

  function loadEscalations() {
    var body = document.getElementById('escalations-body');
    NopauseBackend.api('/v1/escalations?status=unreviewed').then(function (data) {
      var list = data.escalations || [];
      document.getElementById('kpi-escalations-unreviewed').textContent = data.total;
      if (!list.length) {
        body.innerHTML = '<tr><td colspan="5" class="orders-empty">No unreviewed escalations.</td></tr>';
        return;
      }
      body.innerHTML = list.map(function (e) {
        return '<tr><td>' + esc(e.member.displayName || e.member.email) + '</td>' +
          '<td><span class="badge badge-red">' + esc(e.tier) + '</span></td>' +
          '<td>' + esc((e.content || '').slice(0, 80)) + '</td>' +
          '<td>' + esc((e.createdAt || '').slice(0, 16).replace('T', ' ')) + '</td>' +
          '<td><a href="#" class="review-btn" data-id="' + e.messageId + '" style="color:var(--green);font-weight:600;">Review</a></td></tr>';
      }).join('');

      body.querySelectorAll('.review-btn').forEach(function (btn) {
        btn.addEventListener('click', function (ev) {
          ev.preventDefault();
          var id = btn.getAttribute('data-id');
          var outcome = prompt('Outcome: no_action_needed / member_contacted / referred_to_clinician / emergency_services_advised');
          if (!outcome) return;
          NopauseBackend.api('/v1/escalations/' + id + '/review', { method: 'POST', body: JSON.stringify({ outcome: outcome }) })
            .then(loadEscalations).catch(function (err) { alert('Could not record review: ' + err.message); });
        });
      });
    }).catch(function (err) {
      body.innerHTML = '<tr><td colspan="5" class="orders-empty">Unable to load escalations: ' + esc(err.message) + '</td></tr>';
    });
  }
})();
