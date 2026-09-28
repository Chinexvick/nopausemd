(function () {
  var esc = NopauseBackend.escapeHtml;

  document.addEventListener('DOMContentLoaded', function () {
    load();
    var exportBtn = document.getElementById('export-audit-log');
    if (exportBtn) {
      exportBtn.addEventListener('click', function (e) {
        e.preventDefault();
        NopauseBackend.downloadCsv('/v1/exports/audit-log.csv').catch(function (err) {
          alert('Could not export: ' + err.message);
        });
      });
    }
  });

  function load() {
    var body = document.getElementById('audit-body');
    NopauseBackend.api('/v1/audit?limit=50').then(function (data) {
      var entries = data.entries || [];
      if (!entries.length) {
        body.innerHTML = '<tr><td colspan="4" class="orders-empty">No audit entries yet.</td></tr>';
        return;
      }
      body.innerHTML = entries.map(function (e) {
        return '<tr><td>' + esc((e.occurredAt || '').replace('T', ' ').slice(0, 16)) + '</td>' +
          '<td>' + esc(e.actorRole || '—') + '</td>' +
          '<td>' + esc(e.action) + '</td>' +
          '<td>' + esc(e.resourceType || '—') + (e.resourceId ? ' · ' + esc(e.resourceId).slice(0, 8) : '') + '</td></tr>';
      }).join('');
    }).catch(function (err) {
      body.innerHTML = '<tr><td colspan="4" class="orders-empty">Unable to load audit log: ' + esc(err.message) + '</td></tr>';
    });
  }
})();
