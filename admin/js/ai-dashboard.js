(function () {
  var esc = NopauseBackend.escapeHtml;

  document.addEventListener('DOMContentLoaded', function () {
    NopauseBackend.api('/v1/dashboard/summary').then(function (data) {
      document.getElementById('kpi-coach-messages').textContent = data.coach.messagesLast7Days.toLocaleString();
      document.getElementById('kpi-ai-escalations').textContent = data.safety.escalationsUnreviewed;
    }).catch(function (err) {
      document.getElementById('kpi-coach-messages').textContent = 'Error';
      document.getElementById('kpi-ai-escalations').textContent = err.message;
    });

    var grid = document.getElementById('ai-flags-grid');
    NopauseBackend.api('/v1/flags').then(function (data) {
      var flags = data.flags || [];
      if (!flags.length) {
        grid.innerHTML = '<div class="module-card"><div class="orders-empty">No flags returned.</div></div>';
        return;
      }
      grid.innerHTML = flags.map(function (f) {
        return '<div class="module-card">' +
          '<div class="module-header"><span class="m-name">' + esc(f.label) + '</span>' +
          '<span class="badge ' + (f.enabled ? 'badge-green' : 'badge-grey') + '">' + (f.enabled ? 'Enabled' : 'Disabled') + '</span></div>' +
          '<div class="module-spec-row"><span>' + esc(f.description || '') + '</span></div>' +
        '</div>';
      }).join('');
    }).catch(function (err) {
      grid.innerHTML = '<div class="module-card"><div class="orders-empty">Unable to load flags: ' + esc(err.message) + '</div></div>';
    });
  });
})();
