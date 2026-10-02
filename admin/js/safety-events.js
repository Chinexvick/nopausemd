// Headline numbers and CSV export for the Safety Events page. The list itself
// comes from the escalations API (js/escalations.js). These figures are counts
// only, read through a reporting function limited to leads and administrators.
(function () {
  var el = document.getElementById('se-kpis');
  if (!el) return;
  document.getElementById('se-export').addEventListener('click', function (e) {
    e.preventDefault();
    NopauseBackend.downloadCsv('/v1/exports/escalations.csv').catch(function (err) { alert('Export failed: ' + err.message); });
  });
  var tries = 0;
  var iv = setInterval(function () {
    if (window.CURRENT_ADMIN) {
      clearInterval(iv);
      NopauseBackend.rpc('admin_safety_stats', { p_days: 30 }).then(function (s) {
        el.innerHTML = '<div class="lc-kpi"><span>' + s.total + '</span><label>Flags in the last 30 days</label></div>' +
          '<div class="lc-kpi"><span>' + s.urgent_open + '</span><label>Urgent consultations open</label></div>' +
          '<div class="lc-kpi"><span>' + s.emergency_assessments + '</span><label>Emergency assessments (30d)</label></div>' +
          '<div class="lc-kpi"><span>' + s.reviewed + '</span><label>Escalations reviewed (30d)</label></div>';
      }).catch(function () { el.style.display = 'none'; });
    } else if (++tries > 200) clearInterval(iv);
  }, 50);
})();
