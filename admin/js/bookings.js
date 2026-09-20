(function () {
  var tableEl = document.getElementById('bookings-table');
  if (!tableEl) return;

  var records = [];
  var activeFilter = 'all';
  var searchTerm = '';
  var openIds = {};

  function money(cents) { return '$' + (Number(cents || 0) / 100).toFixed(2); }
  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  function statusBadge(r) {
    if (r.paid) return '<span class="badge badge-green"><span class="badge-dot"></span>Confirmed</span>';
    if (r.status === 'cancelled') return '<span class="badge badge-grey"><span class="badge-dot"></span>Cancelled</span>';
    return '<span class="badge badge-amber"><span class="badge-dot"></span>Pending</span>';
  }
  function siteTag(site) {
    var label = site === 'drivanah' ? 'drivanah.com' : 'clinipausemd.com';
    return '<span class="order-site-tag site-' + site + '">' + label + '</span>';
  }
  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  async function loadAll() {
    var res = await sb.from('store_bookings').select('*').order('created_at', { ascending: false }).limit(300);
    if (res.error) {
      tableEl.innerHTML = '<div class="orders-empty">Unable to load bookings: ' + escapeHtml(res.error.message) + '</div>';
      return;
    }
    records = res.data || [];
    updateKpis();
    render();
  }

  function updateKpis() {
    var paid = records.filter(function (r) { return r.paid; });
    var pending = records.filter(function (r) { return !r.paid && r.status !== 'cancelled'; });
    document.getElementById('kpi-upcoming').textContent = paid.length;
    document.getElementById('kpi-pending').textContent = pending.length;
    document.getElementById('kpi-site-a').textContent = paid.filter(function (r) { return r.site === 'clinipausemd'; }).length;
    document.getElementById('kpi-site-b').textContent = paid.filter(function (r) { return r.site === 'drivanah'; }).length;
  }

  function matches(r) {
    if (activeFilter === 'paid' && !r.paid) return false;
    if (activeFilter === 'pending_payment' && (r.paid || r.status === 'cancelled')) return false;
    if (searchTerm) {
      var hay = (r.full_name + ' ' + r.email).toLowerCase();
      if (hay.indexOf(searchTerm) === -1) return false;
    }
    return true;
  }

  function render() {
    var visible = records.filter(matches);
    if (!visible.length) {
      tableEl.innerHTML = '<div class="orders-empty">No bookings match this view yet.</div>';
      return;
    }
    tableEl.innerHTML = visible.map(rowHtml).join('');
    tableEl.querySelectorAll('.order-row-summary').forEach(function (el) {
      el.addEventListener('click', function () {
        var row = el.closest('.order-row');
        var key = row.getAttribute('data-key');
        openIds[key] = !openIds[key];
        row.classList.toggle('open', openIds[key]);
      });
    });
    tableEl.querySelectorAll('.booking-cancel-btn').forEach(function (btn) {
      btn.addEventListener('click', cancelBooking);
    });
  }

  function rowHtml(r) {
    var key = r.id;
    var open = !!openIds[key];
    return (
      '<div class="order-row' + (open ? ' open' : '') + '" data-key="' + key + '">' +
        '<div class="order-row-summary">' +
          '<div><div class="order-cell-label">Patient</div><div class="order-name">' + escapeHtml(r.full_name) + '</div><div class="order-sub">' + escapeHtml(r.email) + '</div>' + siteTag(r.site) + '</div>' +
          '<div><div class="order-cell-label">Reason</div><div class="order-sub">' + escapeHtml(r.reason || '—') + '</div></div>' +
          '<div><div class="order-cell-label">Phone</div><div class="order-sub">' + escapeHtml(r.phone || '—') + '</div></div>' +
          '<div><div class="order-cell-label">Appointment</div><div class="order-sub">' + escapeHtml(r.appointment_date) + ' · ' + escapeHtml(r.appointment_time) + '</div></div>' +
          '<div><div class="order-cell-label">Fee</div><div class="order-sub">' + money(r.amount_cents) + '</div></div>' +
          '<div><div class="order-cell-label">Status</div>' + statusBadge(r) + '</div>' +
          '<svg class="order-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>' +
        '</div>' +
        '<div class="order-row-detail"><div class="order-detail-grid">' +
          '<div class="order-detail-block"><h4>Contact</h4>' +
          '<p><strong>' + escapeHtml(r.full_name) + '</strong></p>' +
          '<p>' + escapeHtml(r.email) + '</p>' +
          '<p>' + escapeHtml(r.phone || '—') + '</p>' +
          '<p>Source: ' + (r.site === 'drivanah' ? 'drivanah.com' : 'clinipausemd.com') + '</p>' +
          (r.paid_at ? '<p>Paid at: ' + fmtDate(r.paid_at) + '</p>' : '') +
          '</div>' +
          '<div class="order-detail-block"><h4>Consultation</h4>' +
          '<p>Reason: ' + escapeHtml(r.reason || '—') + '</p>' +
          '<p>Date: ' + escapeHtml(r.appointment_date) + ' at ' + escapeHtml(r.appointment_time) + '</p>' +
          '<p>Requested: ' + fmtDate(r.created_at) + '</p>' +
          (r.status !== 'cancelled' ? '<button type="button" class="btn btn-secondary booking-cancel-btn" data-id="' + r.id + '" style="margin-top:8px;">Cancel Booking</button>' : '<span class="badge badge-grey">Cancelled</span>') +
          '</div>' +
        '</div></div>' +
      '</div>'
    );
  }

  async function cancelBooking(e) {
    var id = e.currentTarget.getAttribute('data-id');
    e.currentTarget.disabled = true;
    e.currentTarget.textContent = 'Cancelling…';
    await sb.from('store_bookings').update({ status: 'cancelled' }).eq('id', id);
    loadAll();
  }

  document.getElementById('booking-filter-pills').addEventListener('click', function (e) {
    var pill = e.target.closest('.pill');
    if (!pill) return;
    document.querySelectorAll('#booking-filter-pills .pill').forEach(function (p) { p.classList.remove('active'); });
    pill.classList.add('active');
    activeFilter = pill.getAttribute('data-filter');
    render();
  });

  document.getElementById('booking-search').addEventListener('input', function (e) {
    searchTerm = e.target.value.trim().toLowerCase();
    render();
  });

  document.getElementById('refresh-bookings').addEventListener('click', function (e) { e.preventDefault(); loadAll(); });

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
    sb.channel('admin-bookings').on('postgres_changes', { event: '*', schema: 'public', table: 'store_bookings' }, loadAll).subscribe();
  });
})();
