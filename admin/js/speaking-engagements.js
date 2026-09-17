(function () {
  var tableEl = document.getElementById('speaking-table');
  if (!tableEl) return;

  var records = [];
  var activeFilter = 'all';
  var searchTerm = '';
  var openIds = {};
  var STATUSES = ['new', 'contacted', 'booked', 'declined', 'archived'];

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function fmtDateTime(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  function siteTag(site) {
    var label = site === 'drivanah' ? 'drivanah.com' : 'clinipausemd.com';
    return '<span class="order-site-tag site-' + site + '">' + label + '</span>';
  }
  function statusBadge(status) {
    if (status === 'new') return '<span class="badge badge-amber"><span class="badge-dot"></span>New</span>';
    if (status === 'booked') return '<span class="badge badge-green"><span class="badge-dot"></span>Booked</span>';
    if (status === 'declined') return '<span class="badge badge-red"><span class="badge-dot"></span>Declined</span>';
    if (status === 'archived') return '<span class="badge badge-grey"><span class="badge-dot"></span>Archived</span>';
    return '<span class="badge badge-blue"><span class="badge-dot"></span>Contacted</span>';
  }
  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  async function loadAll() {
    var res = await sb.from('speaking_engagement_requests').select('*').order('created_at', { ascending: false }).limit(300);
    if (res.error) {
      tableEl.innerHTML = '<div class="orders-empty">Unable to load requests: ' + escapeHtml(res.error.message) + '</div>';
      return;
    }
    records = res.data || [];
    render();
  }

  function matches(r) {
    if (activeFilter !== 'all' && r.status !== activeFilter) return false;
    if (searchTerm) {
      var hay = (r.requester_name + ' ' + (r.organization || '') + ' ' + r.email).toLowerCase();
      if (hay.indexOf(searchTerm) === -1) return false;
    }
    return true;
  }

  function render() {
    var visible = records.filter(matches);
    if (!visible.length) {
      tableEl.innerHTML = '<div class="orders-empty">No requests match this view yet.</div>';
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
          var rec = records.find(function (r) { return r.id === key; });
          if (rec && rec.status === 'new') updateStatus(key, 'contacted', true);
        }
      });
    });
    tableEl.querySelectorAll('.speaking-status-select').forEach(function (sel) {
      sel.addEventListener('click', function (e) { e.stopPropagation(); });
      sel.addEventListener('change', function () { updateStatus(sel.getAttribute('data-id'), sel.value); });
    });
  }

  function rowHtml(r) {
    var key = r.id;
    var open = !!openIds[key];
    return (
      '<div class="order-row' + (open ? ' open' : '') + '" data-key="' + key + '">' +
        '<div class="order-row-summary" style="grid-template-columns: 1.4fr 1.4fr 1fr 1fr 1fr 24px;">' +
          '<div><div class="order-cell-label">Requester</div><div class="order-name">' + escapeHtml(r.requester_name) + '</div><div class="order-sub">' + escapeHtml(r.organization || r.email) + '</div>' + siteTag(r.site) + '</div>' +
          '<div><div class="order-cell-label">Event</div><div class="order-sub">' + escapeHtml(r.event_name || '—') + '</div></div>' +
          '<div><div class="order-cell-label">Date</div><div class="order-sub">' + fmtDate(r.event_date) + '</div></div>' +
          '<div><div class="order-cell-label">Format</div><div class="order-sub">' + escapeHtml(r.event_format || '—') + '</div></div>' +
          '<div><div class="order-cell-label">Status</div>' + statusBadge(r.status) + '</div>' +
          '<svg class="order-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>' +
        '</div>' +
        '<div class="order-row-detail"><div class="order-detail-grid">' +
          '<div class="order-detail-block"><h4>Requester</h4>' +
          '<p><strong>' + escapeHtml(r.requester_name) + '</strong></p>' +
          (r.organization ? '<p>' + escapeHtml(r.organization) + '</p>' : '') +
          '<p>' + escapeHtml(r.email) + '</p>' +
          '<p>' + escapeHtml(r.phone || '—') + '</p>' +
          '<p>Submitted: ' + fmtDateTime(r.created_at) + '</p>' +
          '</div>' +
          '<div class="order-detail-block"><h4>Event Details</h4>' +
          '<p>Event: ' + escapeHtml(r.event_name || '—') + '</p>' +
          '<p>Date: ' + fmtDate(r.event_date) + '</p>' +
          '<p>Format: ' + escapeHtml(r.event_format || '—') + '</p>' +
          '<p>Audience size: ' + escapeHtml(r.audience_size || '—') + '</p>' +
          '<p>Event type: ' + escapeHtml(r.event_type || '—') + '</p>' +
          '<p>Topic interest: ' + escapeHtml(r.topic_interest || '—') + '</p>' +
          '<p>Budget range: ' + escapeHtml(r.budget_range || '—') + '</p>' +
          (r.message ? '<p style="white-space:pre-wrap;">Notes: ' + escapeHtml(r.message) + '</p>' : '') +
          '<div class="tracker-field" style="margin-top:12px;"><label>Status</label>' +
          '<select class="speaking-status-select" data-id="' + r.id + '">' +
          STATUSES.map(function (s) { return '<option value="' + s + '"' + (r.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') +
          '</select></div>' +
          '</div>' +
        '</div></div>' +
      '</div>'
    );
  }

  async function updateStatus(id, status, silent) {
    await sb.from('speaking_engagement_requests').update({ status: status }).eq('id', id);
    if (!silent) loadAll();
    else {
      var rec = records.find(function (r) { return r.id === id; });
      if (rec) rec.status = status;
    }
  }

  document.getElementById('speaking-filter-pills').addEventListener('click', function (e) {
    var pill = e.target.closest('.pill');
    if (!pill) return;
    document.querySelectorAll('#speaking-filter-pills .pill').forEach(function (p) { p.classList.remove('active'); });
    pill.classList.add('active');
    activeFilter = pill.getAttribute('data-filter');
    render();
  });

  document.getElementById('speaking-search').addEventListener('input', function (e) {
    searchTerm = e.target.value.trim().toLowerCase();
    render();
  });

  document.getElementById('refresh-speaking').addEventListener('click', function (e) { e.preventDefault(); loadAll(); });

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
    sb.channel('admin-speaking').on('postgres_changes', { event: '*', schema: 'public', table: 'speaking_engagement_requests' }, loadAll).subscribe();
  });
})();
