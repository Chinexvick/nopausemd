// Super-admin-only CRUD over notification_recipients — the internal list
// of people emailed about new orders/bookings and sensitive admin
// changes. Direct sb.from() calls are safe here because of the
// is_super_admin()-gated RLS policies added alongside this page.
(function () {
  var body = document.getElementById('notif-body');
  if (!body) return;

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function gateOut() {
    document.getElementById('notif-body').style.display = 'none';
    var gate = document.getElementById('super-admin-gate');
    if (gate) gate.style.display = 'block';
    setTimeout(function () { location.replace('overview.html'); }, 1500);
  }

  async function notifySensitiveAction(action, target) {
    try {
      var session = (await window.sb.auth.getSession()).data.session;
      if (!session) return;
      fetch('/api/notify-sensitive-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ action: action, target: target, actor_email: window.CURRENT_ADMIN.email })
      }).catch(function () {});
    } catch (e) { /* best-effort */ }
  }

  async function logAction(action, target, metadata) {
    try { await window.sb.rpc('log_admin_action', { p_action: action, p_target: target, p_metadata: metadata || null }); }
    catch (e) { /* best-effort */ }
  }

  var recipients = [];

  async function loadAll() {
    var res = await window.sb.from('notification_recipients').select('*').order('created_at', { ascending: true });
    if (res.error) {
      document.getElementById('recipients-tbody').innerHTML = '<tr><td colspan="5">Unable to load: ' + escapeHtml(res.error.message) + '</td></tr>';
      return;
    }
    recipients = res.data || [];
    render();
  }

  function render() {
    var tbody = document.getElementById('recipients-tbody');
    if (!recipients.length) { tbody.innerHTML = '<tr><td colspan="5">No recipients yet.</td></tr>'; return; }

    tbody.innerHTML = recipients.map(function (r) {
      var when = r.created_at ? new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
      return '<tr>' +
        '<td>' + escapeHtml(r.email) + '</td>' +
        '<td>' + escapeHtml(r.label || '—') + '</td>' +
        '<td><button class="badge ' + (r.active ? 'badge-green' : 'badge-grey') + ' toggle-active-btn" data-id="' + r.id + '" data-active="' + r.active + '" style="border:none;cursor:pointer;"><span class="badge-dot"></span>' + (r.active ? 'Active' : 'Inactive') + '</button></td>' +
        '<td>' + when + '</td>' +
        '<td><button class="btn btn-danger delete-recipient-btn" data-id="' + r.id + '" data-email="' + escapeHtml(r.email) + '">Remove</button></td>' +
      '</tr>';
    }).join('');

    tbody.querySelectorAll('.toggle-active-btn').forEach(function (btn) { btn.addEventListener('click', onToggleActive); });
    tbody.querySelectorAll('.delete-recipient-btn').forEach(function (btn) { btn.addEventListener('click', onDelete); });
  }

  async function onToggleActive(e) {
    var btn = e.currentTarget;
    var id = btn.getAttribute('data-id');
    var wasActive = btn.getAttribute('data-active') === 'true';
    var rec = recipients.find(function (r) { return r.id === id; });

    btn.disabled = true;
    var res = await window.sb.from('notification_recipients').update({ active: !wasActive }).eq('id', id);
    btn.disabled = false;

    if (res.error) { alert('Could not update: ' + res.error.message); return; }

    await logAction('toggle_notification_recipient', rec ? rec.email : id, { active: !wasActive });
    notifySensitiveAction('Toggled notification recipient ' + (!wasActive ? 'active' : 'inactive'), rec ? rec.email : id);
    loadAll();
  }

  async function onDelete(e) {
    var btn = e.currentTarget;
    var id = btn.getAttribute('data-id');
    var email = btn.getAttribute('data-email');
    if (!confirm('Remove ' + email + ' from notification recipients?')) return;

    btn.disabled = true;
    var res = await window.sb.from('notification_recipients').delete().eq('id', id);
    btn.disabled = false;

    if (res.error) { alert('Could not remove: ' + res.error.message); return; }

    await logAction('remove_notification_recipient', email);
    notifySensitiveAction('Removed notification recipient', email);
    loadAll();
  }

  var form = document.getElementById('add-recipient-form');
  if (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var email = document.getElementById('new-recipient-email').value.trim();
      var label = document.getElementById('new-recipient-label').value.trim();
      var msgEl = document.getElementById('notif-form-msg');
      if (!email) return;

      msgEl.textContent = '';
      var res = await window.sb.from('notification_recipients').insert({ email: email, label: label || null, active: true });
      if (res.error) {
        msgEl.style.color = 'var(--red, #c0392b)';
        msgEl.textContent = 'Could not add recipient: ' + res.error.message;
        return;
      }

      msgEl.style.color = 'var(--green, #2f8f5b)';
      msgEl.textContent = 'Added ' + email + '.';
      document.getElementById('new-recipient-email').value = '';
      document.getElementById('new-recipient-label').value = '';

      await logAction('add_notification_recipient', email, { label: label || null });
      notifySensitiveAction('Added notification recipient', email);
      loadAll();
    });
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
    loadAll();
  });
})();
