// Orders dashboard — merges consultation bookings and product orders from
// both clinipausemd.com and drivanah.com into one live feed. Reads rely on
// the store_bookings_admin_select / store_orders_admin_select RLS policies,
// so this only ever returns data if the signed-in user is in store_admins.
(function () {
  var tableEl = document.getElementById('orders-table');
  if (!tableEl) return;

  var records = [];
  var activeFilter = 'all';
  var searchTerm = '';

  function money(cents) {
    return '$' + (Number(cents || 0) / 100).toFixed(2);
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function statusBadge(record) {
    if (record.paid) return '<span class="badge badge-green"><span class="badge-dot"></span>Paid</span>';
    if (record.status === 'cancelled') return '<span class="badge badge-grey"><span class="badge-dot"></span>Cancelled</span>';
    return '<span class="badge badge-amber"><span class="badge-dot"></span>Pending</span>';
  }

  function siteTag(site) {
    var label = site === 'drivanah' ? 'drivanah.com' : 'clinipausemd.com';
    return '<span class="order-site-tag site-' + site + '">' + label + '</span>';
  }

  function productSummary(r) {
    if (r.type === 'booking') return 'Consultation — ' + (r.reason || 'General wellness');
    if (!r.items || !r.items.length) return 'Product order';
    return r.items.map(function (i) { return i.product_name + (i.quantity > 1 ? ' ×' + i.quantity : ''); }).join(', ');
  }

  async function loadAll() {
    var bookingsPromise = sb.from('store_bookings').select('*').order('created_at', { ascending: false }).limit(200);
    var ordersPromise = sb.from('store_orders').select('*, store_order_items(product_name, unit_price_cents, quantity)').order('created_at', { ascending: false }).limit(200);

    var results = await Promise.all([bookingsPromise, ordersPromise]);
    var bookingsRes = results[0], ordersRes = results[1];

    if (bookingsRes.error || ordersRes.error) {
      tableEl.innerHTML = '<div class="orders-empty">Unable to load orders' + ((bookingsRes.error || ordersRes.error).message ? ': ' + (bookingsRes.error || ordersRes.error).message : '') + '</div>';
      return;
    }

    var bookings = (bookingsRes.data || []).map(function (b) {
      return {
        type: 'booking', id: b.id, site: b.site, name: b.full_name, email: b.email, phone: b.phone,
        reason: b.reason, appointment_date: b.appointment_date, appointment_time: b.appointment_time,
        amount_cents: b.amount_cents, paid: b.paid, status: b.status, created_at: b.created_at, paid_at: b.paid_at,
        stripe_payment_intent_id: b.stripe_payment_intent_id, stripe_checkout_session_id: b.stripe_checkout_session_id,
        viewed_at: b.viewed_at
      };
    });

    var orders = (ordersRes.data || []).map(function (o) {
      return {
        type: 'order', id: o.id, site: o.site, name: o.customer_name, email: o.email, phone: o.phone,
        items: o.store_order_items, shipping_address: o.shipping_address,
        amount_cents: o.amount_cents, paid: o.paid, status: o.status, created_at: o.created_at, paid_at: o.paid_at,
        tracking_carrier: o.tracking_carrier, tracking_number: o.tracking_number, tracking_status: o.tracking_status,
        is_recurring: o.is_recurring,
        stripe_payment_intent_id: o.stripe_payment_intent_id, stripe_checkout_session_id: o.stripe_checkout_session_id,
        viewed_at: o.viewed_at
      };
    });

    records = bookings.concat(orders).sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    updateKpis();
    render();
  }

  function updateKpis() {
    var since = Date.now() - 30 * 24 * 60 * 60 * 1000;
    var paid = records.filter(function (r) { return r.paid; });
    var paid30 = paid.filter(function (r) { return new Date(r.created_at).getTime() >= since; });
    var pending = records.filter(function (r) { return !r.paid && r.status !== 'cancelled'; });
    var totalCents = paid30.reduce(function (sum, r) { return sum + (r.amount_cents || 0); }, 0);

    document.getElementById('kpi-paid-count').textContent = paid30.length;
    document.getElementById('kpi-paid-total').textContent = money(totalCents);
    document.getElementById('kpi-pending-count').textContent = pending.length;
    document.getElementById('kpi-site-clinipausemd').textContent = paid.filter(function (r) { return r.site === 'clinipausemd'; }).length;
    document.getElementById('kpi-site-drivanah').textContent = paid.filter(function (r) { return r.site === 'drivanah'; }).length;
  }

  function matchesFilter(r) {
    if (activeFilter === 'paid') return !!r.paid;
    if (activeFilter === 'pending_payment') return !r.paid && r.status !== 'cancelled';
    if (activeFilter === 'booking') return r.type === 'booking';
    if (activeFilter === 'order') return r.type === 'order';
    return true;
  }

  function matchesSearch(r) {
    if (!searchTerm) return true;
    var haystack = (r.name + ' ' + r.email).toLowerCase();
    return haystack.indexOf(searchTerm) > -1;
  }

  function render() {
    var visible = records.filter(matchesFilter).filter(matchesSearch);

    if (!visible.length) {
      tableEl.innerHTML = '<div class="orders-empty">No orders match this view yet.</div>';
      return;
    }

    tableEl.innerHTML = visible.map(rowHtml).join('');

    tableEl.querySelectorAll('.order-row-summary').forEach(function (el) {
      el.addEventListener('click', function () {
        var row = el.closest('.order-row');
        var type = row.getAttribute('data-type');
        var id = row.getAttribute('data-id');
        location.href = 'order-detail.html?type=' + encodeURIComponent(type) + '&id=' + encodeURIComponent(id);
      });
    });
  }

  function rowHtml(r) {
    var key = r.type + '_' + r.id;
    var unread = !r.viewed_at;
    return (
      '<div class="order-row" data-key="' + key + '" data-type="' + r.type + '" data-id="' + r.id + '">' +
        '<div class="order-row-summary">' +
          '<div><div class="order-cell-label">Customer</div><div class="order-name">' + (unread ? '<span class="order-unread-dot" title="Unread"></span>' : '') + escapeHtml(r.name) + '</div><div class="order-sub">' + escapeHtml(r.email) + '</div>' + siteTag(r.site) + '</div>' +
          '<div><div class="order-cell-label">Product / Service</div><div class="order-sub">' + escapeHtml(productSummary(r)) + '</div></div>' +
          '<div><div class="order-cell-label">Phone</div><div class="order-sub">' + escapeHtml(r.phone || '—') + '</div></div>' +
          '<div><div class="order-cell-label">Date</div><div class="order-sub">' + fmtDate(r.created_at) + '</div></div>' +
          '<div><div class="order-cell-label">Amount</div><div class="order-sub">' + money(r.amount_cents) + '</div></div>' +
          '<div><div class="order-cell-label">Status</div>' + statusBadge(r) + '</div>' +
          '<svg class="order-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 6 15 12 9 18"/></svg>' +
        '</div>' +
      '</div>'
    );
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  document.getElementById('order-filter-pills').addEventListener('click', function (e) {
    var pill = e.target.closest('.pill');
    if (!pill) return;
    document.querySelectorAll('#order-filter-pills .pill').forEach(function (p) { p.classList.remove('active'); });
    pill.classList.add('active');
    activeFilter = pill.getAttribute('data-filter');
    render();
  });

  document.getElementById('order-search').addEventListener('input', function (e) {
    searchTerm = e.target.value.trim().toLowerCase();
    render();
  });

  document.getElementById('refresh-orders').addEventListener('click', function (e) {
    e.preventDefault();
    loadAll();
  });

  // Wait for auth-guard to confirm an admin session before touching data.
  function whenReady(cb) {
    if (window.CURRENT_ADMIN) { cb(); return; }
    var tries = 0;
    var iv = setInterval(function () {
      tries += 1;
      if (window.CURRENT_ADMIN) { clearInterval(iv); cb(); }
      else if (tries > 100) { clearInterval(iv); } // auth-guard will have redirected by now
    }, 50);
  }

  whenReady(function () {
    loadAll();

    // Realtime: reload the affected slice whenever a booking/order changes.
    sb.channel('storefront-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_bookings' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_orders' }, loadAll)
      .subscribe();
  });
})();
