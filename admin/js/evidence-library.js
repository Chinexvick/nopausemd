(function () {
  var esc = NopauseBackend.escapeHtml;

  document.addEventListener('DOMContentLoaded', function () {
    var slot = document.getElementById('nopause-connect-slot');
    if (!slot) return;
    NopauseBackend.ensureSession(slot, load);
  });

  function statusBadge(status) {
    if (status === 'approved') return '<span class="badge badge-green">Approved</span>';
    if (status === 'retired') return '<span class="badge badge-grey">Retired</span>';
    return '<span class="badge badge-amber">Pending</span>';
  }

  function load() {
    var body = document.getElementById('evidence-table-body');
    NopauseBackend.api('/v1/content/knowledge?limit=200').then(function (data) {
      var items = data.items || [];
      document.getElementById('evidence-count').textContent = 'Showing ' + items.length + ' of ' + data.total + ' references';
      if (!items.length) {
        body.innerHTML = '<tr><td colspan="4" class="orders-empty">No evidence entries yet.</td></tr>';
        return;
      }
      body.innerHTML = items.map(function (item) {
        return '<tr><td>' + esc(item.topicKey) + '</td><td><span class="badge badge-blue">Grade ' + esc(item.rating) + '</span></td>' +
          '<td>' + esc(item.source || '—') + '</td><td>' + statusBadge(item.status) + '</td></tr>';
      }).join('');
    }).catch(function (err) {
      body.innerHTML = '<tr><td colspan="4" class="orders-empty">Unable to load evidence library: ' + esc(err.message) + '</td></tr>';
    });
  }
})();
