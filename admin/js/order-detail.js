// Order/booking detail page — the drill-down destination from orders.html.
// Reads a single record by ?id=&type=order|booking, renders the same
// contact / shipping / tracking / Stripe panels that used to live inline in
// the orders list accordion, and marks the record viewed (clears the
// unread dot for every admin, permanently) the first time it's opened.
(function () {
  var contentEl = document.getElementById('order-detail-content');
  if (!contentEl) return;

  var params = new URLSearchParams(location.search);
  var recordType = params.get('type') === 'booking' ? 'booking' : 'order';
  var recordId = params.get('id');

  var record = null;

  function money(cents) {
    return '$' + (Number(cents || 0) / 100).toFixed(2);
  }

  function moneyFromCents(cents, currency) {
    return '$' + (Number(cents || 0) / 100).toFixed(2) + ' ' + String(currency || 'usd').toUpperCase();
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function statusBadge(r) {
    if (r.paid) return '<span class="badge badge-green"><span class="badge-dot"></span>Paid</span>';
    if (r.status === 'cancelled') return '<span class="badge badge-grey"><span class="badge-dot"></span>Cancelled</span>';
    return '<span class="badge badge-amber"><span class="badge-dot"></span>Pending</span>';
  }

  function productSummary(r) {
    if (r.type === 'booking') return 'Consultation — ' + (r.reason || 'General wellness');
    if (!r.items || !r.items.length) return 'Product order';
    return r.items.map(function (i) { return i.product_name + (i.quantity > 1 ? ' ×' + i.quantity : ''); }).join(', ');
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  async function loadRecord() {
    if (!recordId) {
      contentEl.innerHTML = '<div class="orders-empty">No order specified.</div>';
      return;
    }

    var res;
    if (recordType === 'booking') {
      res = await sb.from('store_bookings').select('*').eq('id', recordId).maybeSingle();
    } else {
      res = await sb.from('store_orders').select('*, store_order_items(product_name, unit_price_cents, quantity)').eq('id', recordId).maybeSingle();
    }

    if (res.error || !res.data) {
      contentEl.innerHTML = '<div class="orders-empty">Unable to load this ' + recordType + (res.error ? ': ' + escapeHtml(res.error.message) : ' — it may have been removed') + '.</div>';
      return;
    }

    var d = res.data;
    if (recordType === 'booking') {
      record = {
        type: 'booking', id: d.id, site: d.site, name: d.full_name, email: d.email, phone: d.phone,
        reason: d.reason, appointment_date: d.appointment_date, appointment_time: d.appointment_time,
        amount_cents: d.amount_cents, paid: d.paid, status: d.status, created_at: d.created_at, paid_at: d.paid_at,
        stripe_payment_intent_id: d.stripe_payment_intent_id, stripe_checkout_session_id: d.stripe_checkout_session_id,
        viewed_at: d.viewed_at
      };
    } else {
      record = {
        type: 'order', id: d.id, site: d.site, name: d.customer_name, email: d.email, phone: d.phone,
        items: d.store_order_items, shipping_address: d.shipping_address,
        amount_cents: d.amount_cents, paid: d.paid, status: d.status, created_at: d.created_at, paid_at: d.paid_at,
        tracking_carrier: d.tracking_carrier, tracking_number: d.tracking_number, tracking_status: d.tracking_status,
        is_recurring: d.is_recurring,
        stripe_payment_intent_id: d.stripe_payment_intent_id, stripe_checkout_session_id: d.stripe_checkout_session_id,
        viewed_at: d.viewed_at
      };
    }

    renderRecord();
    markViewedIfNeeded();
  }

  async function markViewedIfNeeded() {
    if (!record || record.viewed_at) return;
    var rpcName = record.type === 'booking' ? 'mark_booking_viewed' : 'mark_order_viewed';
    var argName = record.type === 'booking' ? 'p_booking_id' : 'p_order_id';
    var payload = {};
    payload[argName] = record.id;

    var res = await sb.rpc(rpcName, payload);
    if (!res.error) {
      record.viewed_at = new Date().toISOString();
    }
  }

  function renderHeader() {
    document.getElementById('order-crumb').textContent = record.type === 'booking' ? 'Consultation Booking' : 'Order';
    document.getElementById('order-detail-title').textContent = escapeHtml(record.name) + ' — ' + (record.type === 'booking' ? 'Consultation' : 'Order');
    document.getElementById('order-detail-subtitle').innerHTML =
      (record.site === 'drivanah' ? 'drivanah.com' : 'clinipausemd.com') + ' &middot; ' + fmtDate(record.created_at) + ' &middot; ' + statusBadge(record);
  }

  function renderRecord() {
    renderHeader();

    var left =
      '<div class="order-detail-block"><h4>Contact</h4>' +
      '<p><strong>' + escapeHtml(record.name) + '</strong></p>' +
      '<p>' + escapeHtml(record.email) + '</p>' +
      '<p>' + escapeHtml(record.phone || '—') + '</p>' +
      '<p>Source: ' + (record.site === 'drivanah' ? 'drivanah.com' : 'clinipausemd.com') + '</p>' +
      (record.paid_at ? '<p>Paid at: ' + fmtDate(record.paid_at) + '</p>' : '') +
      '</div>';

    var right;
    if (record.type === 'booking') {
      right =
        '<div class="order-detail-block"><h4>Consultation</h4>' +
        '<p>Reason: ' + escapeHtml(record.reason || '—') + '</p>' +
        '<p>Date: ' + escapeHtml(record.appointment_date) + ' at ' + escapeHtml(record.appointment_time) + '</p>' +
        '<p>Fee: ' + money(record.amount_cents) + '</p>' +
        '</div>';
    } else {
      var addr = record.shipping_address || {};
      var itemsHtml = (record.items || []).map(function (i) {
        return '<div class="order-line-item"><span>' + escapeHtml(i.product_name) + (i.quantity > 1 ? ' ×' + i.quantity : '') + '</span><span>' + money(i.unit_price_cents * i.quantity) + '</span></div>';
      }).join('');

      right =
        '<div class="order-detail-block"><h4>Order &amp; Shipping</h4>' +
        itemsHtml +
        '<p style="margin-top:10px;">Ship to: ' + escapeHtml([addr.line1, addr.city, addr.postal_code].filter(Boolean).join(', ') || '—') + '</p>' +
        '<div class="tracker-field"><label>Fulfillment status</label>' +
          '<select data-field="tracking_status" data-id="' + record.id + '">' +
            ['awaiting_fulfillment', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'returned'].map(function (s) {
              return '<option value="' + s + '"' + (record.tracking_status === s ? ' selected' : '') + '>' + s.replace(/_/g, ' ') + '</option>';
            }).join('') +
          '</select></div>' +
        '<div class="tracker-field"><label>Carrier</label><input type="text" data-field="tracking_carrier" data-id="' + record.id + '" value="' + escapeHtml(record.tracking_carrier || '') + '" placeholder="e.g. USPS, UPS, FedEx"></div>' +
        '<div class="tracker-field"><label>Tracking number</label><input type="text" data-field="tracking_number" data-id="' + record.id + '" value="' + escapeHtml(record.tracking_number || '') + '"></div>' +
        '<button type="button" class="btn btn-primary tracker-save" data-id="' + record.id + '">Save Tracking</button>' +
        '<span class="tracker-save-status" data-status-for="' + record.id + '" style="margin-left:10px;font-size:12px;color:var(--text-muted);"></span>' +
        '</div>';
    }

    var stripeBlock = '';
    if (record.stripe_payment_intent_id) {
      stripeBlock =
        '<div class="order-detail-block" data-stripe-block="' + record.stripe_payment_intent_id + '"><h4>Stripe Payment</h4>' +
        '<p class="stripe-detail-loading">Loading payment details…</p>' +
        '</div>';
    } else if (record.stripe_checkout_session_id) {
      stripeBlock =
        '<div class="order-detail-block"><h4>Stripe Payment</h4>' +
        '<p style="color:var(--text-muted);">Checkout session was created but never completed.</p>' +
        '</div>';
    }

    contentEl.innerHTML = '<div class="card" style="padding:20px;"><div class="order-detail-grid">' + left + right + '</div>' + stripeBlock + '</div>';

    var trackerSave = contentEl.querySelector('.tracker-save');
    if (trackerSave) trackerSave.addEventListener('click', saveTracking);

    var stripeEl = contentEl.querySelector('[data-stripe-block]');
    if (stripeEl) loadStripeDetails(stripeEl, stripeEl.getAttribute('data-stripe-block'));
  }

  async function loadStripeDetails(container, paymentIntentId) {
    try {
      var sessionRes = await sb.auth.getSession();
      var token = sessionRes.data && sessionRes.data.session && sessionRes.data.session.access_token;
      if (!token) throw new Error('Not signed in');

      var res = await fetch('/api/admin-order-stripe-details?payment_intent_id=' + encodeURIComponent(paymentIntentId), {
        headers: { Authorization: 'Bearer ' + token }
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');

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
    var container = btn.closest('.order-detail-block');
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
    loadRecord();
  });
})();
