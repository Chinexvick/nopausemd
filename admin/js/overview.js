(function () {
  document.addEventListener('DOMContentLoaded', load);

  function load() {
    NopauseBackend.api('/v1/dashboard/summary').then(function (data) {
      setText('kpi-members-total', data.members.total.toLocaleString());
      setText('kpi-members-delta', '+' + data.members.newLast30Days + ' in last 30 days');
      setText('kpi-consultations-unassigned', data.consultations.unassigned);
      setText('kpi-consultations-urgent', data.consultations.urgentOpen);
      setText('kpi-safety-escalations', data.safety.escalationsUnreviewed);
    }).catch(function (err) {
      setText('kpi-members-total', 'Error');
      setText('kpi-members-delta', err.message);
    });

    NopauseBackend.api('/v1/clinicians').then(function (data) {
      var accepting = (data.clinicians || []).filter(function (c) { return c.acceptingPatients; }).length;
      setText('kpi-clinicians-total', accepting);
    }).catch(function () {
      setText('kpi-clinicians-total', 'Error');
    });

    var esc = NopauseBackend.escapeHtml;
    var list = document.getElementById('recent-activity-list');
    NopauseBackend.api('/v1/audit?limit=6').then(function (data) {
      var entries = data.entries || [];
      if (!list) return;
      if (!entries.length) {
        list.innerHTML = '<div class="orders-empty">No recent activity yet.</div>';
        return;
      }
      list.innerHTML = entries.map(function (e) {
        return '<div class="timeline-item"><div class="t-dot"></div><div class="t-body">' +
          '<div class="t-title">' + esc(e.action) + (e.resourceType ? ' · ' + esc(e.resourceType) : '') + '</div>' +
          '<div class="t-time">' + esc((e.occurredAt || '').replace('T', ' ').slice(0, 16)) + ' · ' + esc(e.actorRole || 'staff') + '</div>' +
        '</div></div>';
      }).join('');
    }).catch(function (err) {
      if (list) list.innerHTML = '<div class="orders-empty">Unable to load recent activity: ' + esc(err.message) + '</div>';
    });
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }
})();
