// Sales analytics — all figures come live from store_orders / store_order_items /
// store_subscriptions via the authenticated admin Supabase session. Reads rely
// entirely on the store_orders_admin_select / subscriptions_admin_select RLS
// policies (is_store_admin()), so this only ever returns data for a signed-in
// admin — the same trust boundary every other admin page in this dashboard uses.
(function () {
  var dailyChartEl = document.getElementById('chart-daily');
  if (!dailyChartEl) return;

  function money(cents) {
    return '$' + (Number(cents || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function startOfMonth(d) { var x = new Date(d); x.setDate(1); x.setHours(0, 0, 0, 0); return x; }

  async function loadAll() {
    var now = new Date();
    var since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Recent window (30 days) drives the charts, top-products, and the
    // "this month" / "today" KPI cards. A separate lightweight query gets
    // the true all-time total without pulling every historical row's items.
    var recentPromise = window.sb
      .from('store_orders')
      .select('id, amount_cents, created_at, site, is_recurring, customer_name, email, store_order_items(product_name, unit_price_cents, quantity)')
      .eq('paid', true)
      .gte('created_at', since30.toISOString())
      .order('created_at', { ascending: false });

    var allTimePromise = window.sb
      .from('store_orders')
      .select('amount_cents')
      .eq('paid', true);

    var subsPromise = window.sb
      .from('store_subscriptions')
      .select('amount_cents, status')
      .eq('status', 'active');

    var results = await Promise.all([recentPromise, allTimePromise, subsPromise]);
    var recentRes = results[0], allTimeRes = results[1], subsRes = results[2];

    if (recentRes.error || allTimeRes.error) {
      var errMsg = (recentRes.error || allTimeRes.error).message;
      document.getElementById('recent-orders').innerHTML = '<div class="orders-empty">Unable to load analytics: ' + escapeHtml(errMsg) + '</div>';
      return;
    }

    var recent = recentRes.data || [];
    var allTime = allTimeRes.data || [];
    var subs = subsRes.error ? [] : (subsRes.data || []);

    renderKpis(recent, allTime, subs, now);
    renderDailyChart(recent, now);
    renderHourlyChart(recent, now);
    renderTopProducts(recent);
    renderRecentOrders(recent.slice(0, 25));
  }

  function renderKpis(recent, allTime, subs, now) {
    var todayStart = startOfDay(now);
    var monthStart = startOfMonth(now);

    var today = recent.filter(function (o) { return new Date(o.created_at) >= todayStart; });
    var month = recent.filter(function (o) { return new Date(o.created_at) >= monthStart; });

    var sum = function (rows) { return rows.reduce(function (t, o) { return t + (o.amount_cents || 0); }, 0); };
    var allTimeTotal = sum(allTime);

    document.getElementById('kpi-revenue-today').textContent = money(sum(today));
    document.getElementById('kpi-orders-today').textContent = today.length;
    document.getElementById('kpi-revenue-month').textContent = money(sum(month));
    document.getElementById('kpi-orders-month').textContent = month.length;
    document.getElementById('kpi-revenue-total').textContent = money(allTimeTotal);
    document.getElementById('kpi-orders-total').textContent = allTime.length;
    document.getElementById('kpi-subs-active').textContent = subs.length;
    document.getElementById('kpi-mrr').textContent = money(sum(subs));
  }

  function renderDailyChart(recent, now) {
    var days = [];
    for (var i = 29; i >= 0; i--) {
      var d = startOfDay(new Date(now.getTime() - i * 24 * 60 * 60 * 1000));
      days.push({ date: d, cents: 0, count: 0 });
    }
    recent.forEach(function (o) {
      var d = startOfDay(new Date(o.created_at)).getTime();
      var bucket = days.find(function (b) { return b.date.getTime() === d; });
      if (bucket) { bucket.cents += (o.amount_cents || 0); bucket.count += 1; }
    });

    var max = Math.max.apply(null, days.map(function (b) { return b.cents; }).concat([1]));
    dailyChartEl.innerHTML = days.map(function (b) {
      var pct = Math.max(Math.round((b.cents / max) * 100), b.cents > 0 ? 4 : 0);
      var label = b.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return '<div class="chart-bar-col" title="' + label + ': ' + money(b.cents) + ' · ' + b.count + ' order' + (b.count === 1 ? '' : 's') + '">' +
        '<div class="chart-bar" style="height:' + pct + '%"></div>' +
      '</div>';
    }).join('');
  }

  function renderHourlyChart(recent, now) {
    var todayStart = startOfDay(now);
    var hours = [];
    for (var h = 0; h < 24; h++) hours.push({ hour: h, cents: 0, count: 0 });

    recent.forEach(function (o) {
      var d = new Date(o.created_at);
      if (d >= todayStart) {
        hours[d.getHours()].cents += (o.amount_cents || 0);
        hours[d.getHours()].count += 1;
      }
    });

    var max = Math.max.apply(null, hours.map(function (b) { return b.cents; }).concat([1]));
    document.getElementById('chart-hourly').innerHTML = hours.map(function (b) {
      var pct = Math.max(Math.round((b.cents / max) * 100), b.cents > 0 ? 4 : 0);
      var label12 = b.hour === 0 ? '12am' : b.hour < 12 ? b.hour + 'am' : b.hour === 12 ? '12pm' : (b.hour - 12) + 'pm';
      return '<div class="chart-bar-col" title="' + label12 + ': ' + money(b.cents) + ' · ' + b.count + ' order' + (b.count === 1 ? '' : 's') + '">' +
        '<div class="chart-bar chart-bar--hour" style="height:' + pct + '%"></div>' +
      '</div>';
    }).join('');
  }

  function renderTopProducts(recent) {
    var totals = {};
    recent.forEach(function (o) {
      (o.store_order_items || []).forEach(function (item) {
        var key = item.product_name || 'Unknown';
        if (!totals[key]) totals[key] = { name: key, cents: 0, qty: 0 };
        totals[key].cents += (item.unit_price_cents || 0) * (item.quantity || 1);
        totals[key].qty += item.quantity || 1;
      });
    });

    var rows = Object.keys(totals).map(function (k) { return totals[k]; }).sort(function (a, b) { return b.cents - a.cents; }).slice(0, 8);
    var el = document.getElementById('top-products');
    if (!rows.length) { el.innerHTML = '<div class="orders-empty">No product sales in the last 30 days.</div>'; return; }

    el.innerHTML = rows.map(function (r) {
      return '<div class="meta-row"><span class="meta-label">' + escapeHtml(r.name) + ' <span style="color:var(--text-muted);">×' + r.qty + '</span></span><span class="meta-value">' + money(r.cents) + '</span></div>';
    }).join('');
  }

  function renderRecentOrders(rows) {
    var el = document.getElementById('recent-orders');
    if (!rows.length) { el.innerHTML = '<div class="orders-empty">No successful orders in the last 30 days.</div>'; return; }

    el.innerHTML = rows.map(function (r) {
      var items = (r.store_order_items || []).map(function (i) { return i.product_name + (i.quantity > 1 ? ' ×' + i.quantity : ''); }).join(', ') || 'Order';
      var when = new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
        ' · ' + new Date(r.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      return '<div class="meta-row">' +
        '<span class="meta-label"><strong>' + escapeHtml(r.customer_name || r.email || 'Customer') + '</strong> — ' + escapeHtml(items) +
          (r.is_recurring ? ' <span class="badge badge-blue" style="margin-left:6px;">Recurring</span>' : '') +
          '<br><span style="color:var(--text-muted);font-size:12px;">' + when + '</span></span>' +
        '<span class="meta-value">' + money(r.amount_cents) + '</span>' +
      '</div>';
    }).join('');
  }

  document.getElementById('refresh-analytics').addEventListener('click', function (e) {
    e.preventDefault();
    loadAll();
  });

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
    loadAll();

    // Realtime: refresh figures the moment a new order/subscription lands.
    window.sb.channel('storefront-analytics')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_orders' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_subscriptions' }, loadAll)
      .subscribe();
  });
})();
