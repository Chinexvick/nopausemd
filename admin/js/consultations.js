(function () {
  var esc = NopauseBackend.escapeHtml;

  document.addEventListener('DOMContentLoaded', function () {
    var body = document.getElementById('consultations-body');
    if (!body) return;
    NopauseBackend.api('/v1/consultations?status=open').then(function (data) {
      var list = data.consultations || [];
      if (!list.length) {
        body.innerHTML = '<tr><td colspan="5" class="orders-empty">No open consultations.</td></tr>';
        return;
      }
      body.innerHTML = list.map(function (c) {
        var urgent = c.safetyOutcome && c.safetyOutcome !== 'none';
        return '<tr>' +
          '<td>' + esc(c.member.displayName) + (urgent ? ' <span class="badge badge-red">' + esc(c.safetyOutcome) + '</span>' : '') + '</td>' +
          '<td>' + esc(c.reason || '—') + '</td>' +
          '<td><span class="badge badge-blue">' + esc(c.status) + '</span></td>' +
          '<td>' + (c.assignedToMe ? 'You' : (c.assignedTo ? 'Assigned' : 'Unassigned')) + '</td>' +
          '<td>' + esc((c.createdAt || '').replace('T', ' ').slice(0, 16)) + '</td>' +
        '</tr>';
      }).join('');
    }).catch(function (err) {
      body.innerHTML = '<tr><td colspan="5" class="orders-empty">Unable to load consultations: ' + esc(err.message) + '</td></tr>';
    });
  });
})();
