(function () {
  var esc = NopauseBackend.escapeHtml;

  document.addEventListener('DOMContentLoaded', load);

  function load() {
    var body = document.getElementById('staff-notifications-body');
    NopauseBackend.api('/v1/notifications?limit=30').then(function (data) {
      var list = data.notifications || [];
      if (!list.length) {
        body.innerHTML = '<tr><td colspan="4" class="orders-empty">No notifications.</td></tr>';
        return;
      }
      body.innerHTML = list.map(function (n) {
        return '<tr' + (n.read ? '' : ' style="font-weight:600;"') + '><td>' + esc(n.title) + '</td>' +
          '<td>' + esc(n.body || '') + '</td>' +
          '<td>' + esc((n.createdAt || '').replace('T', ' ').slice(0, 16)) + '</td>' +
          '<td>' + (n.read ? '' : '<span class="badge badge-blue">New</span>') + '</td></tr>';
      }).join('');
    }).catch(function (err) {
      body.innerHTML = '<tr><td colspan="4" class="orders-empty">Unable to load notifications: ' + esc(err.message) + '</td></tr>';
    });
  }
})();
