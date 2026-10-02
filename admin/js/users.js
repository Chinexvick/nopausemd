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
      el.innerHTML = '<div class="lc-kpi"><span>' + membersTotal + '</span><label>Members' + (term || plan || status ? ' (filtered)' : '') + '</label></div>' +
        '<div class="lc-kpi"><span>' + members.filter(function (m) { return new Date(m.joined) > since; }).length + '</span><label>Joined in 30 days (shown)</label></div>' +
        '<div class="lc-kpi"><span>' + members.filter(function (m) { return m.last_sign_in && new Date(m.last_sign_in) > since; }).length + '</span><label>Signed in last 30 days (shown)</label></div>' +
        '<div class="lc-kpi"><span>' + members.filter(function (m) { return !m.onboarded; }).length + '</span><label>Not onboarded (shown)</label></div>';
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
      head.innerHTML = '<tr><th>Member</th><th>Location</th><th>Joined</th><th>Last sign-in</th><th>Plan</th></tr>';
      if (!members) return;
      body.innerHTML = members.length ? members.map(function (m) {
        return '<tr data-id="' + m.id + '" style="cursor:pointer;"><td><strong>' + esc(m.name) + '</strong> ' + role(m.roles) + '<div class="od-sub">' + esc(m.email || '') + '</div></td>' +
          '<td>' + esc(m.location || '—') + '</td><td>' + date(m.joined) + (m.onboarded ? '' : '<div class="od-sub">Onboarding not finished</div>') + '</td>' +
          '<td>' + date(m.last_sign_in) + '</td><td>' + esc(m.plan) + '</td></tr>';
      }).join('') + (members.length < membersTotal ? '<tr><td colspan="5" style="text-align:center;"><button type="button" class="btn btn-secondary" id="us-more">Show more (' + (membersTotal - members.length) + ' left)</button></td></tr>' : '')
        : '<tr><td colspan="5" class="orders-empty">No members match.</td></tr>';
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

  var membersTotal = 0, plan = '', status = '';

  function loadMembers(more) {
    var qs = ['limit=200', 'offset=' + (more ? (members || []).length : 0)];
    if (term) qs.push('search=' + encodeURIComponent(term));
    if (plan) qs.push('plan=' + plan);
    if (status) qs.push('status=' + status);
    return NopauseBackend.api('/v1/members?' + qs.join('&')).then(function (d) {
      var rows = (d.members || []).map(function (m) {
        return { id: m.userId, name: m.displayName || 'Member', email: m.email, location: [m.state, m.country].filter(Boolean).join(', '),
          joined: m.createdAt, onboarded: m.onboarded, last_sign_in: m.lastSignInAt, roles: m.roles || [],
          plan: m.subscription ? m.subscription.plan + (m.subscription.status && m.subscription.status !== m.subscription.plan ? ' · ' + m.subscription.status : '') : 'free' };
      });
      members = more ? (members || []).concat(rows) : rows;
      membersTotal = d.total || members.length;
      render();
    }).catch(function (err) {
      if (tab === 'app') body.innerHTML = '<tr><td colspan="6" class="orders-empty">' + (err.status === 403 ? 'Your role does not include member records.' : 'Unable to load members: ' + esc(err.message)) + '</td></tr>';
    });
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
    if (e.target.id === 'us-more') { loadMembers(true); return; }
    var tr = e.target.closest('tr[data-id]');
    if (!tr || !members) return;
    var id = tr.getAttribute('data-id');
    var m = members.find(function (x) { return x.id === id; });
    document.getElementById('od-eyebrow').textContent = 'App member';
    document.getElementById('od-title').textContent = m.name;
    document.getElementById('od-body').innerHTML = '<p class="od-sub">Loading…</p>';
    document.getElementById('od-drawer').classList.add('open');
    document.getElementById('od-overlay').hidden = false;
    NopauseBackend.api('/v1/members/' + encodeURIComponent(id)).then(function (d) {
      var x = d.member || d, a = x.activity || {}, sc = x.score;
      var consents = (x.consents || []).map(function (c) { return '<li><span>' + esc(String(c.consentType || c.type || '').replace(/_/g, ' ')) + '</span><b>' + (c.granted ? 'Granted' : 'Withdrawn') + '</b></li>'; }).join('');
      document.getElementById('od-body').innerHTML = '<div class="od-grid2">' +
        '<div><div class="od-label">Email</div>' + esc(x.email || '—') + '</div><div><div class="od-label">Location</div>' + esc(m.location || '—') + '</div>' +
        '<div><div class="od-label">Joined</div>' + date(x.createdAt) + '</div><div><div class="od-label">Last sign-in</div>' + date(x.lastSignInAt) + '</div>' +
        '<div><div class="od-label">Plan</div>' + esc(m.plan) + '</div><div><div class="od-label">Referral code</div>' + esc(x.referralCode || '—') + '</div>' +
        '<div><div class="od-label">Symptom logs</div>' + (a.trackingEntries == null ? '—' : a.trackingEntries) + '</div><div><div class="od-label">Last log</div>' + date(a.lastTrackingAt) + '</div>' +
        '<div><div class="od-label">Consultations</div>' + (a.consultations == null ? '—' : a.consultations) + ' (' + (a.openConsultations || 0) + ' open)</div>' +
        '<div><div class="od-label">AI conversations</div>' + (a.aiConversations == null ? '—' : a.aiConversations) + (a.flaggedMessages ? ' · <span class="badge badge-red">' + a.flaggedMessages + ' flagged</span>' : '') + '</div>' +
        '<div><div class="od-label">Health score</div>' + (sc && sc.overall != null ? sc.overall : '—') + '</div><div><div class="od-label">Referrals made</div>' + (a.referralsMade || 0) + '</div></div>' +
        (consents ? '<section class="od-sec"><h3>Consents</h3><ul class="cx-list-plain">' + consents + '</ul></section>' : '') +
        '<section class="od-sec"><h3>Go to</h3><p><a class="btn btn-secondary" href="consultations.html">Consultations</a> <a class="btn btn-secondary" href="safety-events.html">Safety events</a></p>' +
        '<p class="od-sub">Viewing a member record is written to the audit log with your name.</p></section>';
    }).catch(function (err) {
      document.getElementById('od-body').innerHTML = '<p class="od-sub">' + (err.status === 403 ? 'Your role does not include member records.' : 'Could not load this member: ' + esc(err.message)) + '</p>';
    });
  });
  function closeDrawer() { document.getElementById('od-drawer').classList.remove('open'); document.getElementById('od-overlay').hidden = true; }
  document.getElementById('od-close').addEventListener('click', closeDrawer);
  document.getElementById('od-overlay').addEventListener('click', closeDrawer);

  document.getElementById('us-tabs').addEventListener('click', function (e) {
    var p = e.target.closest('.pill'); if (!p) return;
    document.querySelectorAll('#us-tabs .pill').forEach(function (x) { x.classList.toggle('active', x === p); });
    tab = p.getAttribute('data-tab');
    body.innerHTML = '<tr><td class="orders-empty">Loading…</td></tr>';
    document.getElementById('us-plan').style.display = tab === 'app' ? '' : 'none';
    if (tab === 'web' && !customers) loadCustomers(); else if (tab === 'app') loadMembers(); else render();
  });
  var searchTimer = null;
  document.getElementById('us-search').addEventListener('input', function (e) {
    term = e.target.value.trim().toLowerCase();
    if (tab === 'app') { clearTimeout(searchTimer); searchTimer = setTimeout(function () { loadMembers(); }, 300); } else render();
  });
  var planSel = document.getElementById('us-plan');
  if (planSel) planSel.addEventListener('change', function () { plan = planSel.value; if (tab === 'app') loadMembers(); });
  document.getElementById('us-export').addEventListener('click', function (e) {
    e.preventDefault();
    if (tab === 'app') {
      var qs = []; if (term) qs.push('search=' + encodeURIComponent(term)); if (plan) qs.push('plan=' + plan);
      NopauseBackend.downloadCsv('/v1/exports/members.csv' + (qs.length ? '?' + qs.join('&') : '')).catch(function (err) { alert('Export failed: ' + err.message); });
      return;
    }
    var rows = [['Name', 'Email', 'Phone', 'Orders', 'Consultations', 'Chats', 'Spent', 'Last seen']].concat((customers || []).map(function (c) { return [c.name, c.email, c.phone, c.orders, c.consults, c.chats, (c.spent / 100).toFixed(2), c.last]; }));
    var csv = rows.map(function (r) { return r.map(function (v) { var s = String(v == null ? '' : v); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'customers-' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
  });

  var tries = 0;
  var iv = setInterval(function () {
    if (window.CURRENT_ADMIN) {
      clearInterval(iv);
      var q = new URLSearchParams(location.search).get('q');
      if (q) { term = q.toLowerCase(); document.getElementById('us-search').value = q; }
      render();
      var mayWeb = window.CURRENT_ADMIN.isSuperAdmin || window.CURRENT_ADMIN.permissions.indexOf('dashboard.read') > -1;
      if (!mayWeb) { var wt = document.querySelector('#us-tabs [data-tab="web"]'); if (wt) wt.remove(); }
      var mayMembers = window.CURRENT_ADMIN.isSuperAdmin || window.CURRENT_ADMIN.permissions.indexOf('members.read') > -1;
      if (mayMembers) loadMembers(); else body.innerHTML = '<tr><td colspan="5" class="orders-empty">Your role does not include member records.</td></tr>';
      if (q) loadCustomers();
    }
    else if (++tries > 200) clearInterval(iv);
  }, 50);
})();
