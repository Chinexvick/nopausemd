(function () {
  var esc = NopauseBackend.escapeHtml;
  var currentType = 'knowledge';

  document.addEventListener('DOMContentLoaded', function () {
    var slot = document.getElementById('nopause-connect-slot');
    if (!slot) return;
    NopauseBackend.ensureSession(slot, function () {
      document.querySelectorAll('#content-type-pills .pill').forEach(function (pill) {
        pill.addEventListener('click', function () {
          document.querySelectorAll('#content-type-pills .pill').forEach(function (p) { p.classList.remove('active'); });
          pill.classList.add('active');
          currentType = pill.getAttribute('data-type');
          load();
        });
      });
      load();
    });
  });

  function titleOf(item) {
    return item.title || item.topicKey || '(untitled)';
  }

  function statusBadge(status) {
    if (status === 'approved') return '<span class="badge badge-green">Approved</span>';
    if (status === 'retired') return '<span class="badge badge-grey">Retired</span>';
    return '<span class="badge badge-amber">Pending</span>';
  }

  function load() {
    var body = document.getElementById('content-table-body');
    body.innerHTML = '<tr><td colspan="4" class="orders-empty">Loading…</td></tr>';
    NopauseBackend.api('/v1/content/' + currentType + '?limit=100').then(function (data) {
      var items = data.items || [];
      if (!items.length) {
        body.innerHTML = '<tr><td colspan="4" class="orders-empty">No items in this library yet.</td></tr>';
        return;
      }
      body.innerHTML = items.map(function (item) {
        var actions = [];
        if (item.status === 'pending') {
          actions.push('<a href="#" class="approve-btn" data-id="' + item.id + '" style="color:var(--green);font-weight:600;">Approve</a>');
        } else if (item.status === 'approved') {
          actions.push('<a href="#" class="revise-btn" data-id="' + item.id + '" style="color:var(--blue);font-weight:600;">Revise</a>');
          actions.push('<a href="#" class="retire-btn" data-id="' + item.id + '" style="color:var(--red);font-weight:600;">Retire</a>');
        }
        return '<tr><td>' + esc(titleOf(item)) + '</td><td>' + statusBadge(item.status) + '</td>' +
          '<td>' + esc((item.updatedAt || '').slice(0, 10)) + '</td>' +
          '<td>' + actions.join(' &nbsp; ') + '</td></tr>';
      }).join('');

      body.querySelectorAll('.approve-btn').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          var id = btn.getAttribute('data-id');
          NopauseBackend.api('/v1/content/' + currentType + '/' + id + '/approve', { method: 'POST', body: JSON.stringify({}) })
            .then(load).catch(function (err) { alert('Could not approve: ' + err.message); });
        });
      });
      body.querySelectorAll('.retire-btn').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          var id = btn.getAttribute('data-id');
          if (!confirm('Retire this item?')) return;
          NopauseBackend.api('/v1/content/' + currentType + '/' + id + '/retire', { method: 'POST' })
            .then(load).catch(function (err) { alert('Could not retire: ' + err.message); });
        });
      });
      body.querySelectorAll('.revise-btn').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          var id = btn.getAttribute('data-id');
          NopauseBackend.api('/v1/content/' + currentType + '/' + id + '/revise', { method: 'POST', body: JSON.stringify({}) })
            .then(function () { alert('New draft created — edit it, then approve.'); load(); })
            .catch(function (err) { alert('Could not revise: ' + err.message); });
        });
      });
    }).catch(function (err) {
      body.innerHTML = '<tr><td colspan="4" class="orders-empty">Unable to load content: ' + esc(err.message) + '</td></tr>';
    });
  }
})();
