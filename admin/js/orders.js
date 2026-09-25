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
  var openIds = {};

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
        stripe_payment_intent_id: b.stripe_payment_intent_id, stripe_checkout_session_id: b.stripe_checkout_session_id
      };
    });

    var orders = (ordersRes.data || []).map(function (o) {
      return {
        type: 'order', id: o.id, site: o.site, name: o.customer_name, email: o.email, phone: o.phone,
        items: o.store_order_items, shipping_address: o.shipping_address,
        amount_cents: o.amount_cents, paid: o.paid, status: o.status, created_at: o.created_at, paid_at: o.paid_at,
        tracking_carrier: o.tracking_carrier, tracking_number: o.tracking_number, tracking_status: o.tracking_status,
        is_recurring: o.is_recurring,
        stripe_payment_intent_id: o.stripe_payment_intent_id, stripe_checkout_session_id: o.stripe_checkout_session_id
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
        var key = row.getAttribute('data-key');
        openIds[key] = !openIds[key];
        row.classList.toggle('open', openIds[key]);

        if (openIds[key]) {
          var stripeBlock = row.querySelector('[data-stripe-block]');
          if (stripeBlock) loadStripeDetails(stripeBlock, stripeBlock.getAttribute('data-stripe-block'));
        }
      });
    });

    tableEl.querySelectorAll('.tracker-save').forEach(function (btn) {
      btn.addEventListener('click', saveTracking);
    });
  }

  function rowHtml(r) {
    var key = r.type + '_' + r.id;
    var open = !!openIds[key];
    return (
      '<div class="order-row' + (open ? ' open' : '') + '" data-key="' + key + '">' +
        '<div class="order-row-summary">' +
          '<div><div class="order-cell-label">Customer</div><div class="order-name">' + escapeHtml(r.name) + '</div><div class="order-sub">' + escapeHtml(r.email) + '</div>' + siteTag(r.site) + '</div>' +
          '<div><div class="order-cell-label">Product / Service</div><div class="order-sub">' + escapeHtml(productSummary(r)) + '</div></div>' +
          '<div><div class="order-cell-label">Phone</div><div class="order-sub">' + escapeHtml(r.phone || '—') + '</div></div>' +
          '<div><div class="order-cell-label">Date</div><div class="order-sub">' + fmtDate(r.created_at) + '</div></div>' +
          '<div><div class="order-cell-label">Amount</div><div class="order-sub">' + money(r.amount_cents) + '</div></div>' +
          '<div><div class="order-cell-label">Status</div>' + statusBadge(r) + '</div>' +
          '<svg class="order-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>' +
        '</div>' +
        '<div class="order-row-detail">' + detailHtml(r, key) + '</div>' +
      '</div>'
    );
  }

  function detailHtml(r, key) {
    var left =
      '<div class="order-detail-block"><h4>Contact</h4>' +
      '<p><strong>' + escapeHtml(r.name) + '</strong></p>' +
      '<p>' + escapeHtml(r.email) + '</p>' +
      '<p>' + escapeHtml(r.phone || '—') + '</p>' +
      '<p>Source: ' + (r.site === 'drivanah' ? 'drivanah.com' : 'clinipausemd.com') + '</p>' +
      (r.paid_at ? '<p>Paid at: ' + fmtDate(r.paid_at) + '</p>' : '') +
      '</div>';

    var right;
    if (r.type === 'booking') {
      right =
        '<div class="order-detail-block"><h4>Consultation</h4>' +
        '<p>Reason: ' + escapeHtml(r.reason || '—') + '</p>' +
        '<p>Date: ' + escapeHtml(r.appointment_date) + ' at ' + escapeHtml(r.appointment_time) + '</p>' +
        '<p>Fee: ' + money(r.amount_cents) + '</p>' +
        '</div>';
    } else {
      var addr = r.shipping_address || {};
      var itemsHtml = (r.items || []).map(function (i) {
        return '<div class="order-line-item"><span>' + escapeHtml(i.product_name) + (i.quantity > 1 ? ' ×' + i.quantity : '') + '</span><span>' + money(i.unit_price_cents * i.quantity) + '</span></div>';
      }).join('');

      right =
        '<div class="order-detail-block"><h4>Order &amp; Shipping</h4>' +
        itemsHtml +
        '<p style="margin-top:10px;">Ship to: ' + escapeHtml([addr.line1, addr.city, addr.postal_code].filter(Boolean).join(', ') || '—') + '</p>' +
        '<div class="tracker-field"><label>Fulfillment status</label>' +
          '<select data-field="tracking_status" data-id="' + r.id + '">' +
            ['awaiting_fulfillment','processing','shipped','out_for_delivery','delivered','returned'].map(function (s) {
              return '<option value="' + s + '"' + (r.tracking_status === s ? ' selected' : '') + '>' + s.replace(/_/g, ' ') + '</option>';
            }).join('') +
          '</select></div>' +
        '<div class="tracker-field"><label>Carrier</label><input type="text" data-field="tracking_carrier" data-id="' + r.id + '" value="' + escapeHtml(r.tracking_carrier || '') + '" placeholder="e.g. USPS, UPS, FedEx"></div>' +
        '<div class="tracker-field"><label>Tracking number</label><input type="text" data-field="tracking_number" data-id="' + r.id + '" value="' + escapeHtml(r.tracking_number || '') + '"></div>' +
        '<button type="button" class="btn btn-primary tracker-save" data-id="' + r.id + '" data-key="' + key + '">Save Tracking</button>' +
        '<span class="tracker-save-status" data-status-for="' + r.id + '" style="margin-left:10px;font-size:12px;color:var(--text-muted);"></span>' +
        '</div>';
    }

    var stripeBlock = '';
    if (r.stripe_payment_intent_id) {
      stripeBlock =
        '<div class="order-detail-block" data-stripe-block="' + r.stripe_payment_intent_id + '"><h4>Stripe Payment</h4>' +
        '<p class="stripe-detail-loading">Loading payment details…</p>' +
        '</div>';
    } else if (r.stripe_checkout_session_id) {
      stripeBlock =
        '<div class="order-detail-block"><h4>Stripe Payment</h4>' +
        '<p style="color:var(--text-muted);">Checkout session was created but never completed.</p>' +
        '</div>';
    }

    return '<div class="order-detail-grid">' + left + right + '</div>' + stripeBlock;
  }

  var stripeDetailCache = {};

  function moneyFromCents(cents, currency) {
    return '$' + (Number(cents || 0) / 100).toFixed(2) + ' ' + String(currency || 'usd').toUpperCase();
  }

  async function loadStripeDetails(container, paymentIntentId) {
    if (stripeDetailCache[paymentIntentId]) {
      renderStripeDetails(container, stripeDetailCache[paymentIntentId]);
      return;
    }
    try {
      var sessionRes = await sb.auth.getSession();
      var token = sessionRes.data && sessionRes.data.session && sessionRes.data.session.access_token;
      if (!token) throw new Error('Not signed in');

      var res = await fetch('/api/admin-order-stripe-details?payment_intent_id=' + encodeURIComponent(paymentIntentId), {
        headers: { Authorization: 'Bearer ' + token }
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');

      stripeDetailCache[paymentIntentId] = data;
      renderStripeDetails(container, data);
    } catch (err) {
      container.innerHTML = '<h4>Stripe Payment</h4><p style="color:var(--text-muted);">Unable to load Stripe details: ' + escapeHtml(err.message) + '</p>';
    }
  }

  function renderStripeDetails(container, data) {
    var card = data.card ? (data.card.brand.toUpperCase() + ' •••• ' + data.card.last4 + ' (exp ' + data.card.exp_month + '/' + data.card.exp_year + ')') : '—';
    var refundLine = data.amount_refunded > 0
      ? '<p>Refunded: ' + moneyFromCents(data.amount_refunded, data.currency) + '</p>'
      : '';
    container.innerHTML =
      '<h4>Stripe Payment</h4>' +
      '<p>Status: <strong>' + escapeHtml(data.status) + '</strong></p>' +
      '<p>Amount charged: ' + moneyFromCents(data.amount, data.currency) + '</p>' +
      '<p>Card: ' + escapeHtml(card) + '</p>' +
      refundLine +
      '<p style="margin-top:10px;">' +
        (data.receipt_url ? '<a href="' + escapeHtml(data.receipt_url) + '" target="_blank" rel="noopener" class="btn btn-secondary" style="margin-right:8px;">View Receipt</a>' : '') +
        '<a href="' + escapeHtml(data.dashboard_url) + '" target="_blank" rel="noopener" class="btn btn-secondary">Open in Stripe</a>' +
      '</p>';
  }

  async function saveTracking(e) {
    var btn = e.currentTarget;
    var id = btn.getAttribute('data-id');
    var container = btn.closest('.order-row-detail');
    var statusEl = container.querySelector('[data-status-for="' + id + '"]');

    var payload = {
      tracking_status: container.querySelector('[data-field="tracking_status"]').value,
      tracking_carrier: container.querySelector('[data-field="tracking_carrier"]').value || null,
      tracking_number: container.querySelector('[data-field="tracking_number"]').value || null
    };

    btn.disabled = true;
    btn.textContent = 'Saving…';

    var res = await sb.from('store_orders').update(payload).eq('id', id);

    btn.disabled = false;
    btn.textContent = 'Save Tracking';
    statusEl.textContent = res.error ? ('Error: ' + res.error.message) : 'Saved ✓';
    setTimeout(function () { statusEl.textContent = ''; }, 2500);
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
