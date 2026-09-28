(function () {
  var esc = NopauseBackend.escapeHtml;

  document.addEventListener('DOMContentLoaded', load);

  function load() {
    var list = document.getElementById('clinician-list');
    NopauseBackend.api('/v1/clinicians').then(function (data) {
      var clinicians = data.clinicians || [];
      if (!clinicians.length) {
        list.innerHTML = '<div class="orders-empty">No clinicians yet.</div>';
        return;
      }
      list.innerHTML = clinicians.map(function (c) {
        var dotColor = c.acceptingPatients ? 'var(--green)' : 'var(--amber)';
        return '<div class="clinician-item">' +
          '<span class="status-dot" style="background:' + dotColor + ';"></span> ' +
          esc(c.displayName) + (c.credentials ? ', ' + esc(c.credentials) : '') +
          '<div style="font-size:12px;color:var(--text-muted);margin-left:16px;">' +
            esc(c.specialty || 'No specialty set') + ' · ' +
            (c.acceptingPatients ? 'Accepting patients' : 'Not accepting patients') +
          '</div>' +
        '</div>';
      }).join('');
    }).catch(function (err) {
      list.innerHTML = '<div class="orders-empty">Unable to load clinicians: ' + esc(err.message) + '</div>';
    });
  }
})();
