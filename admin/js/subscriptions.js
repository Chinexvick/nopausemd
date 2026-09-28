(function () {
  var esc = NopauseBackend.escapeHtml;

  document.addEventListener('DOMContentLoaded', function () {
    loadSummary();
    loadSubscribers();
  });

  function loadSummary() {
    NopauseBackend.api('/v1/dashboard/summary').then(function (data) {
      var s = data.subscriptions;
      var active = (s.byStatus.active || 0) + (s.byStatus.past_due || 0);
      document.getElementById('kpi-subs-active').textContent = active.toLocaleString();
      document.getElementById('kpi-subs-trialing').textContent = (s.byStatus.trialing || 0).toLocaleString();
      var cents = s.estimatedMonthlyRecurringRevenue.cents;
      document.getElementById('kpi-mrr').textContent = '$' + (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }).catch(function (err) {
      document.getElementById('kpi-subs-active').textContent = 'Error';
      document.getElementById('kpi-mrr').textContent = err.message;
    });
  }

  function statusBadge(status) {
    if (status === 'active') return '<span class="badge badge-green">Active</span>';
    if (status === 'trialing') return '<span class="badge badge-blue">Trialing</span>';
    if (status === 'past_due') return '<span class="badge badge-amber">Past due</span>';
    if (status === 'canceled') return '<span class="badge badge-grey">Canceled</span>';
    return '<span class="badge badge-grey">' + esc(status) + '</span>';
  }

  function loadSubscribers() {
    var body = document.getElementById('subscribers-body');
    NopauseBackend.api('/v1/subscriptions?limit=100').then(function (data) {
      var subs = data.subscriptions || [];
      if (!subs.length) {
        body.innerHTML = '<tr><td colspan="5" class="orders-empty">No subscribers yet.</td></tr>';
        return;
      }
      body.innerHTML = subs.map(function (s) {
        return '<tr><td>' + esc(s.displayName || s.email) + '</td><td>' + esc(s.plan) + '</td>' +
          '<td>' + statusBadge(s.status) + '</td>' +
          '<td>' + esc((s.trialEnd || '').slice(0, 10) || '—') + '</td>' +
          '<td>' + esc((s.currentPeriodEnd || '').slice(0, 10) || '—') + (s.cancelAtPeriodEnd ? ' (cancels)' : '') + '</td></tr>';
      }).join('');
    }).catch(function (err) {
      body.innerHTML = '<tr><td colspan="5" class="orders-empty">Unable to load subscribers: ' + esc(err.message) + '</td></tr>';
    });
  }
})();
