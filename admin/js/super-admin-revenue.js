// Super-admin-only Stripe revenue dashboard — pulls live figures from
// /api/admin-stripe-revenue (which itself verifies is_super_admin() with
// the caller's own bearer token before touching Stripe). This page is
// hidden from non-super-admins in the sidebar (auth-guard.js), but a
// direct URL visit is also gated here client-side, in addition to the
// real enforcement at the API/RLS layer.
(function () {
  var body = document.getElementById('revenue-body');
  if (!body) return;

  function money(cents) {
    return '$' + (Number(cents || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function gateOut() {
    document.getElementById('revenue-body').style.display = 'none';
    var gate = document.getElementById('super-admin-gate');
    if (gate) gate.style.display = 'block';
    setTimeout(function () { location.replace('overview.html'); }, 1500);
  }

  async function loadRevenue() {
    var session = (await window.sb.auth.getSession()).data.session;
    if (!session) return;

    var res = await fetch('/api/admin-stripe-revenue', {
      headers: { Authorization: 'Bearer ' + session.access_token }
    });

    if (res.status === 403) { gateOut(); return; }

    if (!res.ok) {
      body.innerHTML = '<div class="orders-empty">Unable to load revenue right now.</div>';
      return;
    }

    var data = await res.json();
    render(data);
  }

  function render(data) {
    document.getElementById('kpi-revenue-today').textContent = money(data.today.net_cents);
    document.getElementById('kpi-count-today').textContent = data.today.count;
    document.getElementById('kpi-revenue-week').textContent = money(data.week.net_cents);
    document.getElementById('kpi-count-week').textContent = data.week.count;
    document.getElementById('kpi-revenue-month').textContent = money(data.month.net_cents);
    document.getElementById('kpi-count-month').textContent = data.month.count;
    document.getElementById('kpi-revenue-year').textContent = money(data.year.net_cents);
    document.getElementById('kpi-count-year').textContent = data.year.count;

    var chartEl = document.getElementById('chart-revenue-daily');
    var emptyEl = document.getElementById('revenue-empty-state');
    var daily = data.daily || [];
    var hasAnySales = data.year.net_cents > 0;

    if (!hasAnySales) {
      chartEl.style.display = 'none';
      emptyEl.style.display = 'block';
      return;
    }

    chartEl.style.display = 'flex';
    emptyEl.style.display = 'none';

    var max = Math.max.apply(null, daily.map(function (d) { return d.amount_cents; }).concat([1]));
    chartEl.innerHTML = daily.map(function (d) {
      var pct = Math.max(Math.round((d.amount_cents / max) * 100), d.amount_cents > 0 ? 4 : 0);
      var dayNum = Number(d.date.slice(8, 10));
      return '<div class="chart-bar-col" title="' + d.date + ': ' + money(d.amount_cents) + '">' +
        '<div class="chart-bar" style="height:' + pct + '%"></div>' +
      '</div>';
    }).join('');
  }

  var refreshBtn = document.getElementById('refresh-revenue');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function (e) { e.preventDefault(); loadRevenue(); });
  }

  function whenReady(cb) {
    if (window.CURRENT_ADMIN) { cb(); return; }
    var tries = 0;
    var iv = setInterval(function () {
      tries += 1;
      if (window.CURRENT_ADMIN) { clearInterval(iv); cb(); }
      else if (tries > 100) { clearInterval(iv); }
    }, 50);
  }

  whenReady(function () {
    if (!window.CURRENT_ADMIN.isSuperAdmin) { gateOut(); return; }
    loadRevenue();
  });
})();
