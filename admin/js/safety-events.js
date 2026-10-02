// Safety Events: every red-flag check the app raised (assessments, AI coach,
// symptom logs, appointment requests). Reviewing escalations happens on the
// Safety & Rules escalation queue.
(function () {
  var body = document.getElementById('se-body');
  if (!body) return;
  var esc = NopauseBackend.escapeHtml;
  var SOURCE = { ai: 'AI coach', tracking: 'Symptom log', assessment: 'Assessment', appointments: 'Appointment request' };
  var events = [], filter = 'all';

  function when(iso) { return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  function details(d) {
    if (!d || typeof d !== 'object') return '—';
    var flags = d.flags || d.safety_flags || d.matched || d.reasons;
    if (Array.isArray(flags) && flags.length) return flags.map(function (x) { return String(x).replace(/_/g, ' '); }).join(', ');
    var out = d.outcome || d.safety_outcome || d.tier;
    return out ? String(out).replace(/_/g, ' ') : '—';
  }

  function render() {
    var list = events.filter(function (e) { return filter === 'all' || e.source === filter; });
    body.innerHTML = list.length ? list.map(function (e) {
      return '<tr><td>' + when(e.at) + '</td><td>' + esc(e.member) + '</td><td>' + esc(SOURCE[e.source] || e.source) + '</td><td>' + esc(details(e.details)) + '</td>' +
        '<td>' + (e.reviewed ? '<span class="badge badge-green">Reviewed</span>' : '<span class="badge badge-amber">Logged</span>') + '</td></tr>';
    }).join('') : '<tr><td colspan="5" class="orders-empty">No safety events here.</td></tr>';
  }

  document.getElementById('se-tabs').addEventListener('click', function (e) {
    var p = e.target.closest('.pill'); if (!p) return;
    document.querySelectorAll('#se-tabs .pill').forEach(function (x) { x.classList.toggle('active', x === p); });
    filter = p.getAttribute('data-f'); render();
  });

  function load() {
    Promise.all([NopauseBackend.rpc('admin_safety_events', { p_limit: 300 }), NopauseBackend.rpc('admin_safety_stats', { p_days: 30 })]).then(function (r) {
      events = r[0] || [];
      var s = r[1];
      document.getElementById('se-kpis').innerHTML =
        '<div class="lc-kpi"><span>' + s.total + '</span><label>Flags in the last 30 days</label></div>' +
        '<div class="lc-kpi"><span>' + s.urgent_open + '</span><label>Urgent clinician requests open</label></div>' +
        '<div class="lc-kpi"><span>' + s.emergency_assessments + '</span><label>Emergency assessments (30d)</label></div>' +
        '<div class="lc-kpi"><span>' + s.reviewed + '</span><label>Escalations reviewed (30d)</label></div>';
      render();
    }).catch(function (err) { body.innerHTML = '<tr><td colspan="5" class="orders-empty">Unable to load: ' + esc(err.message) + '</td></tr>'; });
  }
  var tries = 0;
  var iv = setInterval(function () {
    if (window.CURRENT_ADMIN) { clearInterval(iv); load(); }
    else if (++tries > 200) clearInterval(iv);
  }, 50);
})();
