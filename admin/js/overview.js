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
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }
})();
