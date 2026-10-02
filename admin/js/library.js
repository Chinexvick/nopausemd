// Clinical content library (Treatments, Supplements, Hormones). Reads the
// relief options the app shows members, straight from the app database via
// a staff-only reporting function. Content changes go through clinical
// review in the app, so this view is read-only.
(function () {
  var root = document.querySelector('[data-library]');
  if (!root) return;
  var sections = root.getAttribute('data-library').split(',');
  var body = document.getElementById('lib-body');
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var SECTION = { lifestyle: 'Lifestyle', behavioral: 'Behavioral', nonhormonal: 'Non-hormonal medication', hormone_therapy: 'Hormone therapy', supplements: 'Supplement' };
  var EVIDENCE = { good: ['Good evidence', 'badge-green'], some: ['Some evidence', 'badge-blue'], limited: ['Limited evidence', 'badge-amber'] };
  var items = [], filterCat = '', term = '';

  function label(k) { return String(k || '').replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }).replace('Gu', 'GU'); }

  function render() {
    var list = items.filter(function (o) {
      if (filterCat && (o.categories || []).indexOf(filterCat) < 0) return false;
      if (!term) return true;
      return (o.title + ' ' + (o.summary || '') + ' ' + (o.helps || '')).toLowerCase().indexOf(term) > -1;
    });
    if (!list.length) { body.innerHTML = '<tr><td colspan="5" class="orders-empty">Nothing matches.</td></tr>'; return; }
    body.innerHTML = list.map(function (o) {
      var ev = EVIDENCE[o.evidence] || [label(o.evidence), 'badge-gray'];
      return '<tr data-id="' + o.id + '" style="cursor:pointer;">' +
        '<td><strong>' + esc(o.title) + '</strong><div class="od-sub">' + esc(o.summary || '') + '</div></td>' +
        '<td>' + esc(SECTION[o.section] || label(o.section)) + '<div class="od-sub">' + (o.categories || []).map(label).map(esc).join(', ') + '</div></td>' +
        '<td><span class="badge ' + ev[1] + '">' + esc(ev[0]) + '</span></td>' +
        '<td>' + (o.requires_clinician ? '<span class="badge badge-amber">Clinician required</span>' : '<span class="badge badge-gray">Self-care</span>') + '</td>' +
        '<td>' + (o.review_status === 'approved' ? '<span class="badge badge-green">Clinically approved</span>' : '<span class="badge badge-amber">' + esc(label(o.review_status || 'pending')) + '</span>') +
          (o.approved_at ? '<div class="od-sub">' + new Date(o.approved_at).toLocaleDateString() + '</div>' : '') + '</td></tr>';
    }).join('');
  }

  function openItem(id) {
    var o = items.find(function (x) { return x.id === id; });
    if (!o) return;
    document.getElementById('od-title').textContent = o.title;
    document.getElementById('od-eyebrow').textContent = SECTION[o.section] || label(o.section);
    var block = function (h, t) { return t ? '<section class="od-sec"><h3>' + h + '</h3><p style="margin:0;white-space:pre-line;">' + esc(t) + '</p></section>' : ''; };
    document.getElementById('od-body').innerHTML =
      '<p>' + esc(o.summary || '') + '</p>' +
      block('What it may help with', o.helps) + block('What to consider', o.consider) + block('Who should talk to a clinician', o.talk_to_clinician) +
      '<section class="od-sec"><h3>Details</h3><div class="od-grid2">' +
        '<div><div class="od-label">Evidence</div>' + esc((EVIDENCE[o.evidence] || [label(o.evidence)])[0]) + '</div>' +
        '<div><div class="od-label">Symptoms</div>' + (o.categories || []).map(label).map(esc).join(', ') + '</div>' +
        '<div><div class="od-label">Clinical review</div>' + esc(label(o.review_status)) + (o.approved_at ? ' · ' + new Date(o.approved_at).toLocaleDateString() : '') + '</div>' +
        '<div><div class="od-label">Last updated</div>' + (o.updated_at ? new Date(o.updated_at).toLocaleDateString() : '—') + '</div>' +
      '</div></section>' + block('Source', o.source);
    document.getElementById('od-drawer').classList.add('open');
    document.getElementById('od-overlay').hidden = false;
  }
  function closeItem() {
    document.getElementById('od-drawer').classList.remove('open');
    document.getElementById('od-overlay').hidden = true;
  }

  body.addEventListener('click', function (e) { var tr = e.target.closest('tr[data-id]'); if (tr) openItem(tr.getAttribute('data-id')); });
  document.getElementById('od-close').addEventListener('click', closeItem);
  document.getElementById('od-overlay').addEventListener('click', closeItem);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeItem(); });
  document.getElementById('lib-search').addEventListener('input', function (e) { term = e.target.value.trim().toLowerCase(); render(); });
  document.getElementById('lib-cat').addEventListener('change', function (e) { filterCat = e.target.value; render(); });

  function load() {
    NopauseBackend.rpc('admin_library').then(function (d) {
      items = (d.options || []).filter(function (o) { return sections.indexOf(o.section) > -1; });
      var cats = {};
      items.forEach(function (o) { (o.categories || []).forEach(function (c) { cats[c] = 1; }); });
      document.getElementById('lib-cat').innerHTML = '<option value="">All symptoms</option>' + Object.keys(cats).sort().map(function (c) { return '<option value="' + esc(c) + '">' + esc(label(c)) + '</option>'; }).join('');
      var approved = items.filter(function (o) { return o.review_status === 'approved'; }).length;
      var inUse = d.in_use || {};
      var active = sections.indexOf('hormone_therapy') > -1 ? (inUse.hormone_therapy || inUse.hrt || 0) : null;
      document.getElementById('lib-kpis').innerHTML =
        '<div class="lc-kpi"><span>' + items.length + '</span><label>In the library</label></div>' +
        '<div class="lc-kpi"><span>' + approved + '</span><label>Clinically approved</label></div>' +
        '<div class="lc-kpi"><span>' + items.filter(function (o) { return o.evidence === 'good'; }).length + '</span><label>Good evidence</label></div>' +
        (active != null ? '<div class="lc-kpi"><span>' + active + '</span><label>Members currently logging hormone therapy</label></div>'
          : '<div class="lc-kpi"><span>' + items.filter(function (o) { return o.requires_clinician; }).length + '</span><label>Need a clinician</label></div>');
      render();
    }).catch(function (err) {
      body.innerHTML = '<tr><td colspan="5" class="orders-empty">Unable to load the library: ' + esc(err.message) + '</td></tr>';
    });
  }

  var tries = 0;
  var iv = setInterval(function () {
    if (window.CURRENT_ADMIN) { clearInterval(iv); load(); }
    else if (++tries > 200) clearInterval(iv);
  }, 50);
})();
