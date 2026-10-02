// Orders: every shop order in one live table. Clicking a row opens a drawer
// with the items, shipping address, payment details from Stripe, the full
// fulfilment timeline (with the staff member behind each change) and the
// tracking editor. Saving goes through /api/admin-order-action so the
// customer can be emailed the update automatically.
// Consultations are managed on the Bookings page.
(function () {
  var tableEl = document.getElementById('orders-table');
  if (!tableEl) return;

  var API = 'https://www.clinipausemd.com/api/';
  var STEPS = [
    { key: 'awaiting_fulfillment', label: 'Confirmed' },
    { key: 'processing', label: 'Packing' },
    { key: 'shipped', label: 'Shipped' },
    { key: 'out_for_delivery', label: 'Out for delivery' },
    { key: 'delivered', label: 'Delivered' }
  ];
  var LABEL = { awaiting_fulfillment: 'To fulfil', processing: 'Packing', shipped: 'Shipped', out_for_delivery: 'Out for delivery', delivered: 'Delivered', returned: 'Returned' };
  var CARRIERS = ['USPS', 'UPS', 'FedEx', 'DHL', 'Canada Post', 'Other'];

  var orders = [];
  var activeFilter = 'tofulfil';
  var searchTerm = '';
  var openId = null;
  var reloadTimer = null;

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(cents) {
    return '$' + (Number(cents || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtDate(iso, withTime) {
    if (!iso) return '—';
    var o = { month: 'short', day: 'numeric' };
    if (new Date(iso).getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
    if (withTime) { o.hour = 'numeric'; o.minute = '2-digit'; }
    return new Date(iso).toLocaleString(undefined, o);
  }
  function ago(iso) {
    var h = (Date.now() - new Date(iso).getTime()) / 36e5;
    if (h < 1) return 'under an hour';
    if (h < 48) return Math.round(h) + 'h';
    return Math.round(h / 24) + ' days';
  }
  function staffName(s) { return s ? String(s).split('@')[0] : ''; }

  function bucket(o) {
    if (!o.paid) return 'unpaid';
    var s = o.tracking_status || 'awaiting_fulfillment';
    if (s === 'awaiting_fulfillment' || s === 'processing') return 'tofulfil';
    if (s === 'shipped' || s === 'out_for_delivery') return 'transit';
    return s;
  }

  async function loadAll() {
    var res = await sb.from('store_orders')
      .select('*, store_order_items(product_name, unit_price_cents, quantity)')
      .order('created_at', { ascending: false }).limit(500);
    if (res.error) {
      tableEl.innerHTML = '<tr><td colspan="8" class="orders-empty">Unable to load orders: ' + escapeHtml(res.error.message) + '</td></tr>';
      return;
    }
    orders = res.data || [];
    updateKpis();
    render();
    if (openId) renderDrawer(openId, true);
  }

  function scheduleReload() {
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(loadAll, 300);
  }

  function updateKpis() {
    var since = Date.now() - 30 * 864e5;
    var toFulfil = orders.filter(function (o) { return bucket(o) === 'tofulfil'; });
    var transit = orders.filter(function (o) { return bucket(o) === 'transit'; });
    var delivered = orders.filter(function (o) { return o.tracking_status === 'delivered' && new Date(o.tracking_updated_at || o.created_at).getTime() >= since; });
    var paid30 = orders.filter(function (o) { return o.paid && new Date(o.paid_at || o.created_at).getTime() >= since; });

    document.getElementById('kpi-tofulfil').textContent = toFulfil.length;
    var oldest = toFulfil.reduce(function (m, o) { var t = new Date(o.paid_at || o.created_at).getTime(); return t < m ? t : m; }, Infinity);
    document.getElementById('kpi-oldest').textContent = toFulfil.length ? 'Oldest waiting ' + ago(new Date(oldest).toISOString()) : 'Nothing waiting';
    document.getElementById('kpi-transit').textContent = transit.length;
    document.getElementById('kpi-delivered').textContent = delivered.length;
    document.getElementById('kpi-sales').textContent = money(paid30.reduce(function (s, o) { return s + (o.amount_cents || 0); }, 0));
    document.getElementById('kpi-sales-count').textContent = paid30.length;

    var shipTimes = delivered.filter(function (o) { return o.paid_at && o.tracking_updated_at; })
      .map(function (o) { return (new Date(o.tracking_updated_at) - new Date(o.paid_at)) / 864e5; });
    document.getElementById('kpi-avgship').textContent = shipTimes.length
      ? 'Avg ' + (shipTimes.reduce(function (a, b) { return a + b; }, 0) / shipTimes.length).toFixed(1) + ' days to deliver'
      : 'Delivery time shows here';

    document.querySelectorAll('#order-filter-pills .pill').forEach(function (p) {
      var f = p.getAttribute('data-filter');
      var n = f === 'all' ? orders.length : orders.filter(function (o) { return bucket(o) === f; }).length;
      p.innerHTML = p.textContent.replace(/\s*\(\d+\)$/, '') + (n ? ' (' + n + ')' : '');
    });
  }

  function matches(o) {
    if (activeFilter !== 'all' && bucket(o) !== activeFilter) return false;
    if (!searchTerm) return true;
    var hay = [o.order_number, o.customer_name, o.email, o.tracking_number, o.phone].join(' ').toLowerCase();
    return hay.indexOf(searchTerm) > -1;
  }

  function statusPill(o) {
    if (!o.paid) return '<span class="od-pill unpaid">' + (o.status === 'cancelled' ? 'Cancelled' : 'Awaiting payment') + '</span>';
    var s = o.tracking_status || 'awaiting_fulfillment';
    return '<span class="od-pill ' + s + '">' + LABEL[s] + '</span>';
  }

  function itemsSummary(o) {
    var items = o.store_order_items || [];
    if (!items.length) return '—';
    var first = items[0].product_name + (items[0].quantity > 1 ? ' × ' + items[0].quantity : '');
    return escapeHtml(first) + (items.length > 1 ? ' <span class="od-more">+' + (items.length - 1) + ' more</span>' : '');
  }

  function render() {
    var visible = orders.filter(matches);
    if (!visible.length) {
      var msg = { tofulfil: 'All caught up. No orders waiting to be fulfilled.', transit: 'No orders in transit.', unpaid: 'No unpaid checkouts.' };
      tableEl.innerHTML = '<tr><td colspan="8" class="orders-empty">' + (searchTerm ? 'No orders match your search.' : (msg[activeFilter] || 'No orders here yet.')) + '</td></tr>';
      return;
    }
    tableEl.innerHTML = visible.map(function (o) {
      return '<tr data-id="' + o.id + '"' + (o.id === openId ? ' class="active"' : '') + '>' +
        '<td><span class="od-num">' + (!o.viewed_at && o.paid ? '<span class="order-unread-dot" title="New"></span>' : '') + escapeHtml(o.order_number || '—') + '</span>' +
          (o.is_recurring ? '<span class="od-tag">Subscription</span>' : '') + '</td>' +
        '<td><div class="od-cust">' + escapeHtml(o.customer_name || '—') + '</div><div class="od-sub">' + escapeHtml(o.email || '') + '</div></td>' +
        '<td>' + itemsSummary(o) + '</td>' +
        '<td class="num">' + money(o.amount_cents) + '</td>' +
        '<td>' + (o.paid ? '<span class="od-paid">Paid</span>' : '<span class="od-unpaid">Unpaid</span>') + '</td>' +
        '<td>' + statusPill(o) + '</td>' +
        '<td class="od-sub">' + (o.tracking_updated_by ? escapeHtml(staffName(o.tracking_updated_by)) + '<br>' + fmtDate(o.tracking_updated_at, true) : '—') + '</td>' +
        '<td class="od-sub">' + fmtDate(o.paid_at || o.created_at, true) + '</td>' +
      '</tr>';
    }).join('');
  }

  tableEl.addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-id]');
    if (tr) openDrawer(tr.getAttribute('data-id'));
  });

  /* ---------- Drawer ---------- */
  var drawer = document.getElementById('od-drawer');
  var overlay = document.getElementById('od-overlay');
  var bodyEl = document.getElementById('od-body');

  function openDrawer(id) {
    openId = id;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    overlay.hidden = false;
    render();
    renderDrawer(id);
    var o = orders.find(function (x) { return x.id === id; });
    if (o && !o.viewed_at) {
      sb.from('store_orders').update({ viewed_at: new Date().toISOString() }).eq('id', id).then(function () {});
      o.viewed_at = new Date().toISOString();
    }
    history.replaceState(null, '', '?order=' + encodeURIComponent(id));
  }
  function closeDrawer() {
    openId = null;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    overlay.hidden = true;
    render();
    history.replaceState(null, '', location.pathname);
  }
  document.getElementById('od-close').addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && openId) closeDrawer(); });

  function addressHtml(a) {
    if (!a) return '<span class="od-sub">No shipping address</span>';
    var lines = [a.name, a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(', '), a.country].filter(Boolean);
    return lines.map(escapeHtml).join('<br>');
  }

  function progressHtml(o) {
    var s = o.tracking_status || 'awaiting_fulfillment';
    if (s === 'returned') return '<div class="od-progress returned"><span>Returned</span></div>';
    var idx = STEPS.map(function (x) { return x.key; }).indexOf(s);
    return '<div class="od-progress">' + STEPS.map(function (step, i) {
      return '<div class="od-step' + (i <= idx ? ' done' : '') + (i === idx ? ' current' : '') + '"><i></i><span>' + step.label + '</span></div>';
    }).join('') + '</div>';
  }

  async function renderDrawer(id, keepForm) {
    var o = orders.find(function (x) { return x.id === id; });
    if (!o) { bodyEl.innerHTML = '<p class="od-sub">Order not found.</p>'; return; }
    if (keepForm && bodyEl.querySelector('.od-form.dirty')) return;

    document.getElementById('od-eyebrow').textContent = (o.paid ? 'Paid ' + fmtDate(o.paid_at, true) : 'Not paid') + (o.is_recurring ? ' · Subscription' : '');
    document.getElementById('od-title').textContent = o.order_number || 'Order';

    var items = (o.store_order_items || []).map(function (i) {
      return '<tr><td>' + escapeHtml(i.product_name) + '</td><td class="num">' + i.quantity + '</td><td class="num">' + money(i.unit_price_cents * i.quantity) + '</td></tr>';
    }).join('');
    var trackUrl = o.order_number ? 'https://www.clinipausemd.com/track-order.html?order=' + encodeURIComponent(o.order_number) : '';
    var current = o.tracking_status || 'awaiting_fulfillment';

    bodyEl.innerHTML =
      (o.paid ? progressHtml(o) : '<div class="od-alert">This checkout was started but never paid. Nothing needs to be shipped.</div>') +

      '<section class="od-sec"><h3>Customer</h3>' +
        '<div class="od-grid2"><div><strong>' + escapeHtml(o.customer_name || '—') + '</strong><br>' +
        (o.email ? '<a href="mailto:' + escapeHtml(o.email) + '">' + escapeHtml(o.email) + '</a><br>' : '') +
        (o.phone ? '<a href="tel:' + escapeHtml(o.phone) + '">' + escapeHtml(o.phone) + '</a>' : '') + '</div>' +
        '<div><div class="od-label">Ship to</div>' + addressHtml(o.shipping_address) + '</div></div></section>' +

      '<section class="od-sec"><h3>Items</h3><table class="od-items"><tbody>' + items +
        '<tr class="od-total"><td>Total</td><td></td><td class="num">' + money(o.amount_cents) + '</td></tr></tbody></table></section>' +

      (o.paid ?
      '<section class="od-sec"><h3>Fulfilment</h3><form class="od-form" id="od-form">' +
        '<label>Status<select name="tracking_status">' + Object.keys(LABEL).map(function (k) {
          return '<option value="' + k + '"' + (k === current ? ' selected' : '') + '>' + (k === 'awaiting_fulfillment' ? 'Confirmed (to fulfil)' : LABEL[k]) + '</option>';
        }).join('') + '</select></label>' +
        '<div class="od-grid2"><label>Carrier<select name="tracking_carrier"><option value="">—</option>' + CARRIERS.map(function (c) {
          return '<option' + (o.tracking_carrier === c ? ' selected' : '') + '>' + c + '</option>';
        }).join('') + (o.tracking_carrier && CARRIERS.indexOf(o.tracking_carrier) < 0 ? '<option selected>' + escapeHtml(o.tracking_carrier) + '</option>' : '') + '</select></label>' +
        '<label>Tracking number<input name="tracking_number" maxlength="80" value="' + escapeHtml(o.tracking_number || '') + '" placeholder="e.g. 9400 1000 0000 0000"></label></div>' +
        '<label class="od-check"><input type="checkbox" name="notify" checked> Email the customer about this update</label>' +
        '<div class="od-form-foot"><span class="od-msg" id="od-msg"></span><button type="submit" class="btn btn-primary">Save update</button></div>' +
      '</form>' +
      (trackUrl ? '<p class="od-sub" style="margin-top:8px;">Customer tracking page: <a href="' + trackUrl + '" target="_blank" rel="noopener">' + escapeHtml(o.order_number) + '</a></p>' : '') +
      '</section>' : '') +

      '<section class="od-sec"><h3>Timeline</h3><ol class="od-timeline" id="od-timeline"><li class="od-sub">Loading…</li></ol></section>' +

      (o.stripe_payment_intent_id ? '<section class="od-sec" id="od-stripe"><h3>Payment</h3><p class="od-sub">Loading Stripe details…</p></section>' : '');

    var form = document.getElementById('od-form');
    if (form) {
      form.addEventListener('input', function () { form.classList.add('dirty'); });
      form.addEventListener('submit', function (e) { e.preventDefault(); saveTracking(o, form); });
    }
    loadTimeline(o);
    if (o.stripe_payment_intent_id) loadStripe(o.stripe_payment_intent_id);
  }

  async function loadTimeline(o) {
    var res = await sb.from('store_order_events').select('*').eq('order_id', o.id).order('created_at', { ascending: false });
    var el = document.getElementById('od-timeline');
    if (!el || openId !== o.id) return;
    var events = (res.data || []).map(function (e) {
      return { at: e.created_at, text: e.note ? e.note : e.status === 'awaiting_fulfillment' ? 'Order confirmed' : 'Marked ' + (LABEL[e.status] || e.status).toLowerCase(), who: e.actor };
    });
    if (o.paid_at && !events.some(function (e) { return e.text === 'Order confirmed'; })) events.push({ at: o.paid_at, text: 'Payment received', who: null });
    events.push({ at: o.created_at, text: 'Checkout started', who: null });
    events.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
    el.innerHTML = events.map(function (e) {
      return '<li><b>' + escapeHtml(e.text) + '</b>' +
        '<span>' + fmtDate(e.at, true) + (e.who ? ' · by ' + escapeHtml(staffName(e.who)) : (e.text === 'Checkout started' || e.text === 'Payment received' ? ' · customer' : '')) + '</span></li>';
    }).join('');
  }

  async function authToken() {
    var s = await sb.auth.getSession();
    return s.data && s.data.session && s.data.session.access_token;
  }

  async function saveTracking(o, form) {
    var btn = form.querySelector('button[type=submit]');
    var msg = document.getElementById('od-msg');
    var fd = new FormData(form);
    btn.disabled = true;
    btn.textContent = 'Saving…';
    msg.textContent = '';
    try {
      var token = await authToken();
      var res = await fetch(API + 'admin-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          action: 'update_tracking', order_id: o.id,
          tracking_status: fd.get('tracking_status'),
          tracking_carrier: fd.get('tracking_carrier') || null,
          tracking_number: String(fd.get('tracking_number') || '').trim() || null,
          notify: fd.get('notify') === 'on'
        })
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || 'Could not save');
      Object.assign(o, data.order);
      form.classList.remove('dirty');
      msg.textContent = data.emailed ? 'Saved. Customer emailed.' : 'Saved.';
      msg.className = 'od-msg ok';
      updateKpis();
      render();
      renderDrawer(o.id);
      setTimeout(function () { var m = document.getElementById('od-msg'); if (m) { m.textContent = data.emailed ? 'Saved. Customer emailed.' : 'Saved.'; m.className = 'od-msg ok'; } }, 0);
    } catch (err) {
      msg.textContent = err.message;
      msg.className = 'od-msg err';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save update';
    }
  }

  async function loadStripe(pi) {
    var el = document.getElementById('od-stripe');
    try {
      var token = await authToken();
      var res = await fetch(API + 'admin-order-stripe-details?payment_intent_id=' + encodeURIComponent(pi), { headers: { Authorization: 'Bearer ' + token } });
      var d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Unavailable');
      if (!document.getElementById('od-stripe')) return;
      var card = d.card ? d.card.brand.toUpperCase() + ' •••• ' + d.card.last4 : '—';
      document.getElementById('od-stripe').innerHTML = '<h3>Payment</h3>' +
        '<div class="od-grid2"><div><div class="od-label">Status</div>' + escapeHtml(d.status) + '</div><div><div class="od-label">Card</div>' + escapeHtml(card) + '</div>' +
        '<div><div class="od-label">Charged</div>' + money(d.amount) + '</div><div><div class="od-label">Refunded</div>' + money(d.amount_refunded || 0) + '</div></div>' +
        '<p style="margin-top:10px;">' + (d.receipt_url ? '<a class="btn btn-secondary" target="_blank" rel="noopener" href="' + escapeHtml(d.receipt_url) + '">Receipt</a> ' : '') +
        '<a class="btn btn-secondary" target="_blank" rel="noopener" href="' + escapeHtml(d.dashboard_url) + '">Open in Stripe</a></p>';
    } catch (err) {
      if (el) el.innerHTML = '<h3>Payment</h3><p class="od-sub">Stripe details unavailable: ' + escapeHtml(err.message) + '</p>';
    }
  }

  /* ---------- Toolbar ---------- */
  document.getElementById('order-filter-pills').addEventListener('click', function (e) {
    var pill = e.target.closest('.pill');
    if (!pill) return;
    document.querySelectorAll('#order-filter-pills .pill').forEach(function (p) { p.classList.remove('active'); });
    pill.classList.add('active');
    activeFilter = pill.getAttribute('data-filter');
    render();
  });

  function onSearch(e) {
    searchTerm = e.target.value.trim().toLowerCase();
    render();
  }
  document.getElementById('order-search-inline').addEventListener('input', onSearch);
  var topSearch = document.getElementById('order-search');
  if (topSearch) topSearch.addEventListener('input', function (e) {
    document.getElementById('order-search-inline').value = e.target.value;
    onSearch(e);
  });

  document.getElementById('refresh-orders').addEventListener('click', function (e) { e.preventDefault(); loadAll(); });

  document.getElementById('export-orders').addEventListener('click', function (e) {
    e.preventDefault();
    var rows = [['Order', 'Placed', 'Customer', 'Email', 'Phone', 'Items', 'Total', 'Paid', 'Status', 'Carrier', 'Tracking', 'Updated by', 'Updated at']];
    orders.filter(matches).forEach(function (o) {
      rows.push([o.order_number, o.paid_at || o.created_at, o.customer_name, o.email, o.phone,
        (o.store_order_items || []).map(function (i) { return i.product_name + ' x' + i.quantity; }).join('; '),
        (o.amount_cents / 100).toFixed(2), o.paid ? 'yes' : 'no', o.paid ? LABEL[o.tracking_status || 'awaiting_fulfillment'] : 'unpaid',
        o.tracking_carrier, o.tracking_number, o.tracking_updated_by, o.tracking_updated_at]);
    });
    var csv = rows.map(function (r) {
      return r.map(function (v) {
        var s = String(v == null ? '' : v);
        if (/^[=+\-@]/.test(s)) s = "'" + s;
        return '"' + s.replace(/"/g, '""') + '"';
      }).join(',');
    }).join('\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'orders-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
  });

  function whenReady(cb) {
    if (window.CURRENT_ADMIN) { cb(); return; }
    var tries = 0;
    var iv = setInterval(function () {
      tries += 1;
      if (window.CURRENT_ADMIN) { clearInterval(iv); cb(); }
      else if (tries > 200) { clearInterval(iv); }
    }, 50);
  }

  whenReady(async function () {
    await loadAll();
    var deep = new URLSearchParams(location.search).get('order') || (new URLSearchParams(location.search).get('type') === 'order' && new URLSearchParams(location.search).get('id'));
    if (deep && orders.some(function (o) { return o.id === deep; })) {
      var o = orders.find(function (x) { return x.id === deep; });
      activeFilter = 'all';
      document.querySelectorAll('#order-filter-pills .pill').forEach(function (p) { p.classList.toggle('active', p.getAttribute('data-filter') === 'all'); });
      openDrawer(o.id);
    } else if (!orders.some(function (o) { return bucket(o) === 'tofulfil'; }) && orders.length) {
      activeFilter = 'all';
      document.querySelectorAll('#order-filter-pills .pill').forEach(function (p) { p.classList.toggle('active', p.getAttribute('data-filter') === 'all'); });
      render();
    }

    sb.channel('storefront-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_orders' }, scheduleReload)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'store_order_events' }, function (p) {
        if (p.new && p.new.order_id === openId) { var o = orders.find(function (x) { return x.id === openId; }); if (o) loadTimeline(o); }
      })
      .subscribe();
  });
})();
