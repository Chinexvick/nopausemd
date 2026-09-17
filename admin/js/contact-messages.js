(function () {
  var tableEl = document.getElementById('contact-table');
  if (!tableEl) return;

  var records = [];
  var activeFilter = 'all';
  var searchTerm = '';
  var openIds = {};

  function fmtDate(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  function siteTag(site) {
    var label = site === 'drivanah' ? 'drivanah.com' : 'clinipausemd.com';
    return '<span class="order-site-tag site-' + site + '">' + label + '</span>';
  }
  function statusBadge(status) {
    if (status === 'new') return '<span class="badge badge-amber"><span class="badge-dot"></span>New</span>';
    if (status === 'archived') return '<span class="badge badge-grey"><span class="badge-dot"></span>Archived</span>';
    return '<span class="badge badge-green"><span class="badge-dot"></span>Read</span>';
  }
  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  async function loadAll() {
    var res = await sb.from('contact_messages').select('*').order('created_at', { ascending: false }).limit(300);
    if (res.error) {
      tableEl.innerHTML = '<div class="orders-empty">Unable to load messages: ' + escapeHtml(res.error.message) + '</div>';
      return;
    }
    records = res.data || [];
    render();
  }

  function matches(r) {
    if (activeFilter !== 'all' && r.status !== activeFilter) return false;
    if (searchTerm) {
      var hay = (r.name + ' ' + r.email).toLowerCase();
      if (hay.indexOf(searchTerm) === -1) return false;
    }
    return true;
  }

  function render() {
    var visible = records.filter(matches);
    if (!visible.length) {
      tableEl.innerHTML = '<div class="orders-empty">No messages match this view yet.</div>';
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
          if (rec && rec.status === 'new') markStatus(key, 'read', true);
        }
      });
    });
    tableEl.querySelectorAll('[data-mark-archived]').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); markStatus(btn.getAttribute('data-mark-archived'), 'archived'); });
    });
    tableEl.querySelectorAll('[data-mark-read]').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); markStatus(btn.getAttribute('data-mark-read'), 'read'); });
    });
  }

  function rowHtml(r) {
    var key = r.id;
    var open = !!openIds[key];
    return (
      '<div class="order-row' + (open ? ' open' : '') + '" data-key="' + key + '">' +
        '<div class="order-row-summary" style="grid-template-columns: 1.4fr 1.8fr 1fr 1fr 24px;">' +
          '<div><div class="order-cell-label">From</div><div class="order-name">' + escapeHtml(r.name) + '</div><div class="order-sub">' + escapeHtml(r.email) + '</div>' + siteTag(r.site) + '</div>' +
          '<div><div class="order-cell-label">Subject</div><div class="order-sub">' + escapeHtml(r.subject || r.message.slice(0, 60)) + '</div></div>' +
          '<div><div class="order-cell-label">Date</div><div class="order-sub">' + fmtDate(r.created_at) + '</div></div>' +
          '<div><div class="order-cell-label">Status</div>' + statusBadge(r.status) + '</div>' +
          '<svg class="order-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>' +
        '</div>' +
        '<div class="order-row-detail"><div class="order-detail-grid">' +
          '<div class="order-detail-block"><h4>Contact</h4>' +
          '<p><strong>' + escapeHtml(r.name) + '</strong></p>' +
          '<p>' + escapeHtml(r.email) + '</p>' +
          '<p>' + escapeHtml(r.phone || '—') + '</p>' +
          '<p>Source: ' + (r.site === 'drivanah' ? 'drivanah.com' : 'clinipausemd.com') + '</p>' +
          '</div>' +
          '<div class="order-detail-block"><h4>Message</h4>' +
          (r.subject ? '<p><strong>' + escapeHtml(r.subject) + '</strong></p>' : '') +
          '<p style="white-space:pre-wrap;">' + escapeHtml(r.message) + '</p>' +
          '<div style="margin-top:12px;display:flex;gap:8px;">' +
          (r.status !== 'archived' ? '<button type="button" class="btn btn-secondary" data-mark-archived="' + r.id + '">Archive</button>' : '') +
          (r.status === 'archived' ? '<button type="button" class="btn btn-secondary" data-mark-read="' + r.id + '">Restore to Read</button>' : '') +
          '</div>' +
          '</div>' +
        '</div></div>' +
      '</div>'
    );
  }

  async function markStatus(id, status, silent) {
    await sb.from('contact_messages').update({ status: status }).eq('id', id);
    if (!silent) loadAll();
    else {
      var rec = records.find(function (r) { return r.id === id; });
      if (rec) rec.status = status;
    }
  }

  document.getElementById('contact-filter-pills').addEventListener('click', function (e) {
    var pill = e.target.closest('.pill');
    if (!pill) return;
    document.querySelectorAll('#contact-filter-pills .pill').forEach(function (p) { p.classList.remove('active'); });
    pill.classList.add('active');
    activeFilter = pill.getAttribute('data-filter');
    render();
  });

  document.getElementById('contact-search').addEventListener('input', function (e) {
    searchTerm = e.target.value.trim().toLowerCase();
    render();
  });

  document.getElementById('refresh-contact').addEventListener('click', function (e) { e.preventDefault(); loadAll(); });

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
    sb.channel('admin-contact').on('postgres_changes', { event: '*', schema: 'public', table: 'contact_messages' }, loadAll).subscribe();
  });
})();
