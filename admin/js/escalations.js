// Safety escalations from the app: member messages the Safety Engine rated
// urgent or worse. Shared by "AI Review Queue" and "Safety Events". Opening one
// reads the conversation around it (audited by the backend), and recording an
// outcome is permanent and attributed to the reviewer.
(function () {
  var body = document.getElementById('es-body');
  if (!body) return;
  var NB = window.NopauseBackend, esc = NB.escapeHtml;
  var TIER = { emergency: ['Emergency', 'badge-red'], urgent_clinician: ['Urgent', 'badge-red'], urgent: ['Urgent', 'badge-red'] };
  var OUTCOMES = [
    ['no_action_needed', 'No action needed'],
    ['member_contacted', 'Member contacted'],
    ['referred_to_clinician', 'Referred to a clinician'],
    ['emergency_services_advised', 'Emergency services advised']
  ];
  var items = [], total = 0, filter = document.body.getAttribute('data-es-default') || 'unreviewed';

  function when(iso) { return iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; }
  function tier(t) { var x = TIER[t] || [String(t || '').replace(/_/g, ' '), 'badge-gray']; return '<span class="badge ' + x[1] + '">' + esc(x[0]) + '</span>'; }

  function render() {
    body.innerHTML = items.length ? items.map(function (e) {
      return '<tr data-id="' + e.messageId + '" style="cursor:pointer;"><td>' + when(e.createdAt) + '</td>' +
        '<td><strong>' + esc((e.member && (e.member.displayName || e.member.email)) || 'Member') + '</strong>' + (e.member && e.member.state ? '<div class="od-sub">' + esc(e.member.state) + '</div>' : '') + '</td>' +
        '<td>' + tier(e.tier) + '</td><td>' + esc(String(e.content || '').slice(0, 110)) + '</td>' +
        '<td>' + (e.reviewed ? '<span class="badge badge-green">Reviewed</span>' : '<span class="badge badge-amber">Needs review</span>') + '</td></tr>';
    }).join('') : '<tr><td colspan="5" class="orders-empty">' + (filter === 'unreviewed' ? 'Nothing waiting for review.' : 'Nothing here yet.') + '</td></tr>';
    var k = document.getElementById('es-count'); if (k) k.textContent = total;
  }

  function load() {
    NB.api('/v1/escalations?status=' + filter + '&limit=100').then(function (d) { items = d.escalations || []; total = d.total == null ? items.length : d.total; render(); })
      .catch(function (err) { body.innerHTML = '<tr><td colspan="5" class="orders-empty">' + (err.status === 403 ? 'Your role does not include safety review.' : 'Unable to load: ' + esc(err.message)) + '</td></tr>'; });
  }

  function closeDrawer() { document.getElementById('od-drawer').classList.remove('open'); document.getElementById('od-overlay').hidden = true; }

  function open(id) {
    document.getElementById('od-eyebrow').textContent = 'Safety escalation';
    document.getElementById('od-title').textContent = 'Flagged message';
    document.getElementById('od-body').innerHTML = '<p class="od-sub">Loading the conversation…</p>';
    document.getElementById('od-drawer').classList.add('open');
    document.getElementById('od-overlay').hidden = false;
    NB.api('/v1/escalations/' + encodeURIComponent(id)).then(function (d) {
      var e = d.escalation, conv = d.conversation || [];
      var thread = conv.map(function (m) {
        var flagged = m.id === e.messageId;
        return '<div class="cx-msg ' + (m.role === 'user' ? 'member' : 'clinician') + '" style="max-width:92%;"><div class="cx-bubble"' + (flagged ? ' style="outline:2px solid #d94848;"' : '') + '>' + esc(m.content).replace(/\n/g, '<br>') + '</div><div class="cx-msg-time">' + (m.role === 'user' ? 'Member' : 'AI coach') + ' · ' + when(m.createdAt) + (flagged ? ' · flagged' : '') + '</div></div>';
      }).join('');
      document.getElementById('od-body').innerHTML =
        '<div>' + tier(e.tier) + ' <span class="od-sub">' + esc((e.member && (e.member.displayName || e.member.email)) || 'Member') + (e.member && e.member.state ? ' · ' + esc(e.member.state) : '') + '</span></div>' +
        '<section class="od-sec"><h3>Conversation</h3><div class="cx-thread" style="max-height:340px;padding:0;">' + thread + '</div></section>' +
        (e.reviewed
          ? '<section class="od-sec"><h3>Reviewed</h3><p>' + when(e.reviewedAt) + (e.reviewedBy ? ' · ' + esc(e.reviewedBy) : '') + '</p></section>'
          : '<section class="od-sec"><h3>Record the outcome</h3><form class="od-form" id="es-form"><label>What was done?<select name="outcome">' + OUTCOMES.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('') + '</select></label>' +
            '<div class="od-form-foot"><span class="od-msg" id="es-msg"></span><button type="submit" class="btn btn-primary">Mark as reviewed</button></div></form>' +
            '<p class="od-sub">The outcome is saved with your name and can\'t be changed. No free-text note is stored.</p>' +
            (e.member && e.member.userId ? '<p><a class="btn btn-secondary" href="users.html?q=' + encodeURIComponent(e.member.email || '') + '">Find this member</a></p>' : '') + '</section>');
      var form = document.getElementById('es-form');
      if (form) form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var btn = form.querySelector('button'); btn.disabled = true;
        NB.api('/v1/escalations/' + encodeURIComponent(id) + '/review', { method: 'POST', body: JSON.stringify({ outcome: form.outcome.value }) }).then(function () { closeDrawer(); load(); })
          .catch(function (err) { btn.disabled = false; var m = document.getElementById('es-msg'); m.textContent = err.status === 409 ? 'Someone already reviewed this.' : err.message; m.className = 'od-msg err'; if (err.status === 409) load(); });
      });
    }).catch(function (err) { document.getElementById('od-body').innerHTML = '<p class="od-sub">Could not load: ' + esc(err.message) + '</p>'; });
  }

  body.addEventListener('click', function (e) { var tr = e.target.closest('tr[data-id]'); if (tr) open(tr.getAttribute('data-id')); });
  document.getElementById('od-close').addEventListener('click', closeDrawer);
  document.getElementById('od-overlay').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });
  document.getElementById('es-tabs').addEventListener('click', function (e) {
    var p = e.target.closest('.pill'); if (!p) return;
    document.querySelectorAll('#es-tabs .pill').forEach(function (x) { x.classList.toggle('active', x === p); });
    filter = p.getAttribute('data-f'); load();
  });
  window.addEventListener('staff-notification', function () { load(); });

  var tries = 0;
  var iv = setInterval(function () {
    if (window.CURRENT_ADMIN) {
      clearInterval(iv); load();
      var id = new URLSearchParams(location.search).get('id'); if (id) open(id);
    } else if (++tries > 200) clearInterval(iv);
  }, 50);
})();
