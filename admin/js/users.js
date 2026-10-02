// Users: app members (from the app database, staff-only reporting
// function) and website customers (everyone who ordered, booked or chatted
// on the website), with quick health-of-account signals.
(function () {
  var body = document.getElementById('us-body');
  if (!body) return;
  var esc = NopauseBackend.escapeHtml;
  var tab = 'app', term = '', members = null, customers = null;

  function date(iso) { return iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'; }
  function money(c) { return '$' + (c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function role(r) { return r.filter(function (x) { return x !== 'member'; }).map(function (x) { return '<span class="badge badge-blue">' + esc(x.replace('_', ' ')) + '</span>'; }).join(' '); }

  function kpis() {
    var el = document.getElementById('us-kpis');
    if (tab === 'app' && members) {
      var since = Date.now() - 30 * 864e5;
      el.innerHTML = '<div class="lc-kpi"><span>' + members.length + '</span><label>Members</label></div>' +
        '<div class="lc-kpi"><span>' + members.filter(function (m) { return new Date(m.joined) > since; }).length + '</span><label>Joined in 30 days</label></div>' +
        '<div class="lc-kpi"><span>' + members.filter(function (m) { return m.logs_30d > 0; }).length + '</span><label>Active (logged symptoms, 30d)</label></div>' +
        '<div class="lc-kpi"><span>' + members.filter(function (m) { return !m.onboarded; }).length + '</span><label>Haven\'t finished onboarding</label></div>';
    } else if (customers) {
      el.innerHTML = '<div class="lc-kpi"><span>' + customers.length + '</span><label>Website customers</label></div>' +
        '<div class="lc-kpi"><span>' + customers.filter(function (c) { return c.orders; }).length + '</span><label>Shop buyers</label></div>' +
        '<div class="lc-kpi"><span>' + customers.filter(function (c) { return c.consults; }).length + '</span><label>Consultation patients</label></div>' +
        '<div class="lc-kpi"><span>' + customers.filter(function (c) { return c.orders + c.consults > 1; }).length + '</span><label>Returning customers</label></div>';
    }
  }

  function render() {
    var head = document.getElementById('us-head');
    if (tab === 'app') {
      head.innerHTML = '<tr><th>Member</th><th>Location</th><th>Joined</th><th>Last sign-in</th><th>Plan</th><th>Activity (30d)</th><th>Flags</th></tr>';
      if (!members) return;
      var list = members.filter(function (m) { return !term || (m.name + ' ' + (m.email || '')).toLowerCase().indexOf(term) > -1; });
      body.innerHTML = list.length ? list.map(function (m) {
        return '<tr data-id="' + m.id + '" style="cursor:pointer;"><td><strong>' + esc(m.name) + '</strong> ' + role(m.roles || []) + '<div class="od-sub">' + esc(m.email || '') + '</div></td>' +
          '<td>' + esc(m.location || '—') + '</td><td>' + date(m.joined) + (m.onboarded ? '' : '<div class="od-sub">Onboarding not finished</div>') + '</td>' +
          '<td>' + date(m.last_sign_in) + '</td><td>' + esc(m.plan || 'free') + '</td><td>' + m.logs_30d + ' log' + (m.logs_30d === 1 ? '' : 's') + '</td>' +
          '<td>' + (m.safety_flags ? '<span class="badge badge-red">' + m.safety_flags + ' safety</span>' : '') + (m.open_requests ? ' <span class="badge badge-amber">' + m.open_requests + ' request</span>' : '') + '</td></tr>';
      }).join('') : '<tr><td colspan="7" class="orders-empty">No members match.</td></tr>';
    } else {
      head.innerHTML = '<tr><th>Customer</th><th>Phone</th><th>Shop orders</th><th>Consultations</th><th>Chats</th><th>Total spent</th><th>Last seen</th></tr>';
      if (!customers) return;
      var l2 = customers.filter(function (c) { return !term || (c.name + ' ' + c.email).toLowerCase().indexOf(term) > -1; });
      body.innerHTML = l2.length ? l2.map(function (c) {
        return '<tr><td><strong>' + esc(c.name || '—') + '</strong><div class="od-sub"><a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a></div></td><td>' + esc(c.phone || '—') + '</td>' +
          '<td>' + (c.orders ? '<a href="orders.html">' + c.orders + '</a>' : '0') + '</td><td>' + (c.consults ? '<a href="bookings.html">' + c.consults + '</a>' : '0') + '</td><td>' + c.chats + '</td>' +
          '<td>' + money(c.spent) + '</td><td>' + date(c.last) + '</td></tr>';
      }).join('') : '<tr><td colspan="7" class="orders-empty">No customers match.</td></tr>';
    }
    kpis();
  }

  function loadMembers() {
    NopauseBackend.rpc('admin_members', { p_limit: 500 }).then(function (d) { members = d || []; render(); })
      .catch(function (err) { if (tab === 'app') body.innerHTML = '<tr><td colspan="7" class="orders-empty">Unable to load members: ' + esc(err.message) + '</td></tr>'; });
  }

  async function loadCustomers() {
    var r = await Promise.all([
      sb.from('store_orders').select('customer_name,email,phone,amount_cents,paid,created_at').eq('paid', true).limit(1000),
      sb.from('store_bookings').select('full_name,email,phone,amount_cents,paid,created_at').eq('paid', true).limit(1000),
      sb.from('chat_conversations').select('visitor_name,visitor_email,last_message_at').not('visitor_email', 'is', null).limit(1000)
    ]);
    var map = {};
    function get(email, name, phone) {
      var k = String(email || '').trim().toLowerCase();
      if (!k) return null;
      if (!map[k]) map[k] = { email: k, name: name, phone: phone, orders: 0, consults: 0, chats: 0, spent: 0, last: null };
      var c = map[k]; if (!c.name && name) c.name = name; if (!c.phone && phone) c.phone = phone;
      return c;
    }
    function seen(c, iso) { if (iso && (!c.last || iso > c.last)) c.last = iso; }
    (r[0].data || []).forEach(function (o) { var c = get(o.email, o.customer_name, o.phone); if (c) { c.orders++; c.spent += o.amount_cents || 0; seen(c, o.created_at); } });
    (r[1].data || []).forEach(function (b) { var c = get(b.email, b.full_name, b.phone); if (c) { c.consults++; c.spent += b.amount_cents || 0; seen(c, b.created_at); } });
    (r[2].data || []).forEach(function (v) { var c = get(v.visitor_email, v.visitor_name); if (c) { c.chats++; seen(c, v.last_message_at); } });
    customers = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return (b.last || '').localeCompare(a.last || ''); });
    render();
  }

  body.addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-id]');
    if (!tr || !members) return;
    var m = members.find(function (x) { return x.id === tr.getAttribute('data-id'); });
    document.getElementById('od-eyebrow').textContent = 'App member';
    document.getElementById('od-title').textContent = m.name;
    document.getElementById('od-body').innerHTML = '<div class="od-grid2">' +
      '<div><div class="od-label">Email</div>' + esc(m.email || '—') + '</div><div><div class="od-label">Location</div>' + esc(m.location || '—') + '</div>' +
      '<div><div class="od-label">Joined</div>' + date(m.joined) + '</div><div><div class="od-label">Last sign-in</div>' + date(m.last_sign_in) + '</div>' +
      '<div><div class="od-label">Plan</div>' + esc(m.plan || 'free') + '</div><div><div class="od-label">Onboarding</div>' + (m.onboarded ? 'Complete' : 'Not finished') + '</div>' +
      '<div><div class="od-label">Symptom logs (30d)</div>' + m.logs_30d + '</div><div><div class="od-label">Safety flags (all time)</div>' + m.safety_flags + '</div></div>' +
      '<section class="od-sec"><h3>Go to</h3><p><a class="btn btn-secondary" href="safety-events.html">Safety events</a> <a class="btn btn-secondary" href="appointment-detail.html">Clinical care</a></p>' +
      '<p class="od-sub">Clinical records stay in the clinical tools, where every view is audited.</p></section>';
    document.getElementById('od-drawer').classList.add('open');
    document.getElementById('od-overlay').hidden = false;
  });
  function closeDrawer() { document.getElementById('od-drawer').classList.remove('open'); document.getElementById('od-overlay').hidden = true; }
  document.getElementById('od-close').addEventListener('click', closeDrawer);
  document.getElementById('od-overlay').addEventListener('click', closeDrawer);

  document.getElementById('us-tabs').addEventListener('click', function (e) {
    var p = e.target.closest('.pill'); if (!p) return;
    document.querySelectorAll('#us-tabs .pill').forEach(function (x) { x.classList.toggle('active', x === p); });
    tab = p.getAttribute('data-tab');
    body.innerHTML = '<tr><td class="orders-empty">Loading…</td></tr>';
    if (tab === 'web' && !customers) loadCustomers(); else render();
  });
  document.getElementById('us-search').addEventListener('input', function (e) { term = e.target.value.trim().toLowerCase(); render(); });
  document.getElementById('us-export').addEventListener('click', function (e) {
    e.preventDefault();
    var rows = tab === 'app'
      ? [['Name', 'Email', 'Location', 'Joined', 'Last sign-in', 'Plan', 'Logs 30d']].concat((members || []).map(function (m) { return [m.name, m.email, m.location, m.joined, m.last_sign_in, m.plan, m.logs_30d]; }))
      : [['Name', 'Email', 'Phone', 'Orders', 'Consultations', 'Chats', 'Spent', 'Last seen']].concat((customers || []).map(function (c) { return [c.name, c.email, c.phone, c.orders, c.consults, c.chats, (c.spent / 100).toFixed(2), c.last]; }));
    var csv = rows.map(function (r) { return r.map(function (v) { var s = String(v == null ? '' : v); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = (tab === 'app' ? 'members-' : 'customers-') + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
  });

  var tries = 0;
  var iv = setInterval(function () {
    if (window.CURRENT_ADMIN) {
      clearInterval(iv);
      var q = new URLSearchParams(location.search).get('q');
      if (q) { term = q.toLowerCase(); document.getElementById('us-search').value = q; }
      render(); loadMembers();
      if (q) loadCustomers();
    }
    else if (++tries > 200) clearInterval(iv);
  }, 50);
})();
