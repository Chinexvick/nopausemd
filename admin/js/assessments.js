(function () {
  var esc = NopauseBackend.escapeHtml;

  document.addEventListener('DOMContentLoaded', load);

  function statusBadge(v) {
    if (v.status === 'active') return '<span class="badge badge-green">Active</span>';
    if (v.status === 'approved') return '<span class="badge badge-blue">Approved</span>';
    if (v.status === 'retired') return '<span class="badge badge-grey">Retired</span>';
    return '<span class="badge badge-amber">Draft</span>';
  }

  function load() {
    var body = document.getElementById('assessment-versions-body');
    NopauseBackend.api('/v1/assessment/versions').then(function (data) {
      var versions = data.versions || [];
      if (!versions.length) {
        body.innerHTML = '<tr><td colspan="5" class="orders-empty">No assessment versions yet.</td></tr>';
        return;
      }
      body.innerHTML = versions.map(function (v) {
        var actions = [];
        if (v.status === 'draft') actions.push('<a href="#" class="approve-v" data-id="' + v.id + '" style="color:var(--green);font-weight:600;">Approve</a>');
        if (v.status === 'approved') actions.push('<a href="#" class="activate-v" data-id="' + v.id + '" style="color:var(--blue);font-weight:600;">Activate</a>');
        return '<tr><td>' + esc(v.label) + '</td><td>' + statusBadge(v) + '</td><td>' + esc(v.questionCount) + '</td>' +
          '<td>' + esc((v.createdAt || '').slice(0, 10)) + '</td><td>' + actions.join(' ') + '</td></tr>';
      }).join('');

      body.querySelectorAll('.approve-v').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          var id = btn.getAttribute('data-id');
          NopauseBackend.api('/v1/assessment/versions/' + id + '/approve', { method: 'POST' })
            .then(load).catch(function (err) { alert('Could not approve: ' + err.message); });
        });
      });
      body.querySelectorAll('.activate-v').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          var id = btn.getAttribute('data-id');
          if (!confirm('Activate this version? It becomes the live version for all members.')) return;
          NopauseBackend.api('/v1/assessment/versions/' + id + '/activate', { method: 'POST' })
            .then(load).catch(function (err) { alert('Could not activate: ' + err.message); });
        });
      });
    }).catch(function (err) {
      body.innerHTML = '<tr><td colspan="5" class="orders-empty">Unable to load assessment versions: ' + esc(err.message) + '</td></tr>';
    });
  }
})();
