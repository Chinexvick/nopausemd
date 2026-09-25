// Super-admin-only, read-only view of admin_action_log — 50 rows per
// "Load more" click, newest first. SELECT is gated by is_super_admin()
// RLS, so this only ever returns data for a signed-in super admin.
(function () {
  var body = document.getElementById('audit-body');
  if (!body) return;

  var PAGE_SIZE = 50;
  var rows = [];
  var offset = 0;
  var reachedEnd = false;

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function gateOut() {
    document.getElementById('audit-body').style.display = 'none';
    var gate = document.getElementById('super-admin-gate');
    if (gate) gate.style.display = 'block';
    setTimeout(function () { location.replace('overview.html'); }, 1500);
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  async function loadPage(reset) {
    if (reset) { offset = 0; rows = []; reachedEnd = false; }

    var res = await window.sb.from('admin_action_log')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (res.error) {
      document.getElementById('audit-tbody').innerHTML = '<tr><td colspan="5">Unable to load: ' + escapeHtml(res.error.message) + '</td></tr>';
      return;
    }

    var page = res.data || [];
    if (page.length < PAGE_SIZE) reachedEnd = true;
    rows = rows.concat(page);
    offset += page.length;

    render();
  }

  function render() {
    var tbody = document.getElementById('audit-tbody');
    if (!rows.length) { tbody.innerHTML = '<tr><td colspan="5">No admin actions logged yet.</td></tr>'; }
    else {
      tbody.innerHTML = rows.map(function (r) {
        var metaStr = '';
        try { metaStr = r.metadata ? JSON.stringify(r.metadata, null, 2) : ''; } catch (e) { metaStr = ''; }
        return '<tr>' +
          '<td>' + fmtDate(r.created_at) + '</td>' +
          '<td>' + escapeHtml(r.actor_email || r.actor_id || '—') + '</td>' +
          '<td>' + escapeHtml(r.action) + '</td>' +
          '<td>' + escapeHtml(r.target || '—') + '</td>' +
          '<td>' + (metaStr ? '<pre style="white-space:pre-wrap;font-size:11px;margin:0;max-width:320px;">' + escapeHtml(metaStr) + '</pre>' : '—') + '</td>' +
        '</tr>';
      }).join('');
    }

    document.getElementById('audit-count-label').textContent = rows.length + ' action' + (rows.length === 1 ? '' : 's') + ' loaded';

    var loadMoreBtn = document.getElementById('load-more-audit');
    loadMoreBtn.style.display = reachedEnd ? 'none' : 'inline-block';
  }

  document.getElementById('load-more-audit').addEventListener('click', function () { loadPage(false); });

  var refreshBtn = document.getElementById('refresh-audit');
  if (refreshBtn) refreshBtn.addEventListener('click', function (e) { e.preventDefault(); loadPage(true); });

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
    loadPage(true);
  });
})();
