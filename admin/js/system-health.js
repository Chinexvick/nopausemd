(function () {
  var esc = NopauseBackend.escapeHtml;

  document.addEventListener('DOMContentLoaded', function () {
    var slot = document.getElementById('nopause-connect-slot');
    if (!slot) return;
    NopauseBackend.ensureSession(slot, load);
  });

  function load() {
    var body = document.getElementById('backend-status-body');
    NopauseBackend.api('/v1/system/status').then(function (s) {
      body.innerHTML = '<tr>' +
        '<td>' + esc(s.environment) + '</td>' +
        '<td>' + (s.videoVisits ? '<span class="badge badge-green">Enabled</span>' : '<span class="badge badge-grey">Disabled</span>') + '</td>' +
        '<td>' + (s.mfaRequired ? '<span class="badge badge-amber">Required</span>' : '<span class="badge badge-grey">Optional</span>') + '</td>' +
        '<td>' + esc(s.ownersConfigured) + '</td></tr>';
    }).catch(function (err) {
      body.innerHTML = '<tr><td colspan="4" class="orders-empty">Unable to load backend status: ' + esc(err.message) + '</td></tr>';
    });
  }
})();
