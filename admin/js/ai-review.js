// AI Review Queue: what the AI coach told members, next to the question it
// answered. Staff mark replies as reviewed; the review is stored with their
// account and written to the app's audit log.
(function () {
  var body = document.getElementById('aq-body');
  if (!body) return;
  var esc = NopauseBackend.escapeHtml;
  var KIND = { answer: ['Answered', 'badge-green'], no_evidence: ['No evidence found', 'badge-blue'], unavailable: ['Coach unavailable', 'badge-gray'], safety_urgent: ['Safety: urgent', 'badge-red'] };
  var items = [], filter = 'pending';

  function when(iso) { return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }

  function render() {
    body.innerHTML = items.length ? items.map(function (m) {
      var k = KIND[m.kind] || [m.kind || '—', 'badge-gray'];
      return '<tr data-id="' + m.id + '" style="cursor:pointer;"><td>' + when(m.at) + '</td><td>' + esc((m.question || '—').slice(0, 120)) + '</td>' +
        '<td><span class="badge ' + k[1] + '">' + esc(k[0]) + '</span></td>' +
        '<td>' + (m.reviewed_at ? '<span class="badge badge-green">Reviewed</span><div class="od-sub">' + esc(m.reviewed_by || '') + '</div>' : '<span class="badge badge-amber">Pending</span>') + '</td></tr>';
    }).join('') : '<tr><td colspan="4" class="orders-empty">' + (filter === 'pending' ? 'Nothing waiting for review.' : 'Nothing here yet.') + '</td></tr>';
  }

  function open(id) {
    var m = items.find(function (x) { return x.id === id; });
    if (!m) return;
    var k = KIND[m.kind] || [m.kind];
    document.getElementById('od-eyebrow').textContent = when(m.at) + ' · ' + k[0];
    document.getElementById('od-title').textContent = 'AI coach reply';
    var cites = Array.isArray(m.citations) && m.citations.length ? '<section class="od-sec"><h3>Sources cited</h3><ul style="margin:0;padding-left:18px;">' +
      m.citations.map(function (c) { return '<li>' + esc(c.title || c.source || c.id || JSON.stringify(c)) + '</li>'; }).join('') + '</ul></section>' : '';
    document.getElementById('od-body').innerHTML =
      '<section class="od-sec" style="margin-top:0;"><h3>Member asked</h3><div class="lc-summary" style="margin:0;">' + esc(m.question || '—') + '</div></section>' +
      '<section class="od-sec"><h3>Coach replied</h3><div class="lc-summary staff" style="margin:0;white-space:pre-line;">' + esc(m.answer || '') + '</div></section>' + cites +
      (m.reviewed_at
        ? '<p class="od-sub">Reviewed ' + when(m.reviewed_at) + (m.reviewed_by ? ' by ' + esc(m.reviewed_by) : '') + '.</p>'
        : '<section class="od-sec"><h3>Your review</h3><form class="od-form" id="aq-form"><label>Note (optional)<textarea name="note" rows="3" maxlength="1000" placeholder="e.g. Accurate and appropriately cautious."></textarea></label>' +
          '<div class="od-form-foot"><span class="od-msg" id="aq-msg"></span><button type="submit" class="btn btn-primary">Mark as reviewed</button></div></form>' +
          '<p class="od-sub">If the reply was unsafe or wrong, also raise it with the clinical lead so the coach can be corrected.</p></section>');
    var form = document.getElementById('aq-form');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button'); btn.disabled = true;
      var note = form.note.value.trim();
      NopauseBackend.rpc('admin_mark_ai_reviewed', { p_message_id: m.id, p_note: note || null }).then(function () {
        closeDrawer(); load();
      }).catch(function (err) { btn.disabled = false; document.getElementById('aq-msg').textContent = err.message; document.getElementById('aq-msg').className = 'od-msg err'; });
    });
    document.getElementById('od-drawer').classList.add('open');
    document.getElementById('od-overlay').hidden = false;
  }
  function closeDrawer() { document.getElementById('od-drawer').classList.remove('open'); document.getElementById('od-overlay').hidden = true; }

  body.addEventListener('click', function (e) { var tr = e.target.closest('tr[data-id]'); if (tr) open(tr.getAttribute('data-id')); });
  document.getElementById('od-close').addEventListener('click', closeDrawer);
  document.getElementById('od-overlay').addEventListener('click', closeDrawer);
  document.getElementById('aq-tabs').addEventListener('click', function (e) {
    var p = e.target.closest('.pill'); if (!p) return;
    document.querySelectorAll('#aq-tabs .pill').forEach(function (x) { x.classList.toggle('active', x === p); });
    filter = p.getAttribute('data-f'); load();
  });

  function load() {
    NopauseBackend.rpc('admin_ai_review_queue', { p_status: filter, p_limit: 200 }).then(function (d) { items = d || []; render(); })
      .catch(function (err) { body.innerHTML = '<tr><td colspan="4" class="orders-empty">Unable to load: ' + esc(err.message) + '</td></tr>'; });
  }
  var tries = 0;
  var iv = setInterval(function () {
    if (window.CURRENT_ADMIN) { clearInterval(iv); load(); }
    else if (++tries > 200) clearInterval(iv);
  }, 50);
})();
