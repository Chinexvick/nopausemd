// Overview: one live summary for the whole team. Website and clinic figures
// come from a single database call (admin_overview_snapshot), which only
// includes the team-performance table for super admins. App figures come
// from the NoPauseMD backend. Everything refreshes on its own when orders,
// chats or bookings change.
(function () {
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var reloadTimer = null;

  function money(cents) {
    return '$' + (Number(cents || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  function waited(iso) {
    if (!iso) return '';
    var m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 60) return 'oldest ' + Math.max(m, 1) + ' min';
    if (m < 2880) return 'oldest ' + Math.round(m / 60) + 'h';
    return 'oldest ' + Math.round(m / 1440) + ' days';
  }
  function ago(iso) {
    var m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    if (m < 1440) return Math.floor(m / 60) + 'h ago';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function clinicTime(iso) {
    return new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
  }
  function untilText(ms) {
    var m = Math.max(1, Math.round(ms / 60000));
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60), r = m % 60;
    return h + 'h' + (r ? ' ' + r + 'm' : '');
  }
  function setText(id, t) { var el = document.getElementById(id); if (el) el.textContent = t; }

  function setCard(key, n, sub, level) {
    var card = document.querySelector('.ov-card[data-k="' + key + '"]');
    if (!card) return;
    card.querySelector('.ov-n').textContent = n == null ? '—' : n;
    card.querySelector('.ov-s').textContent = sub || (n === 0 ? 'All clear' : '');
    card.classList.remove('hot', 'urgent', 'clear');
    if (n === 0) card.classList.add('clear');
    else if (n > 0) card.classList.add(level || 'hot');
  }

  function greet() {
    var a = window.CURRENT_ADMIN || {};
    var first = String(a.name || a.fullName || a.email || '').split(/[ @]/)[0];
    var h = new Date().getHours();
    var part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    setText('ov-greeting', part + (first ? ', ' + first : ''));
    setText('ov-date', new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) + ' · live summary of the website, clinic and app');
  }

  async function loadSnapshot() {
    var res = await sb.rpc('admin_overview_snapshot');
    if (res.error) {
      document.getElementById('ov-today').innerHTML = '<div class="orders-empty">Unable to load: ' + esc(res.error.message) + '</div>';
      return;
    }
    var d = res.data;

    var chatOld = d.oldest_chat_wait ? (Date.now() - new Date(d.oldest_chat_wait)) / 60000 : 0;
    setCard('chats', d.chats_waiting, d.chats_waiting ? waited(d.oldest_chat_wait) : (d.chats_open ? d.chats_open + ' open' : ''), chatOld > 10 ? 'urgent' : 'hot');
    var orderOld = d.oldest_order_wait ? (Date.now() - new Date(d.oldest_order_wait)) / 864e5 : 0;
    setCard('orders', d.orders_to_fulfil, d.orders_to_fulfil ? waited(d.oldest_order_wait) : '', orderOld > 2 ? 'urgent' : 'hot');
    setCard('contact', d.contact_new);
    setCard('speaking', d.speaking_new);
    setText('ov-transit', d.orders_in_transit);
    setText('ov-news', d.newsletter_30d);

    setText('ov-sales', money(d.sales_30d_cents));
    var prev = d.sales_prev_30d_cents, cur = d.sales_30d_cents;
    var trend = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
    document.getElementById('ov-sales-sub').innerHTML = d.orders_30d + ' shop order' + (d.orders_30d === 1 ? '' : 's') + ' · ' + d.consults_30d + ' paid consultation' + (d.consults_30d === 1 ? '' : 's') +
      (trend != null ? ' · <span class="' + (trend >= 0 ? 'up' : 'down') + '">' + (trend >= 0 ? '▲ ' : '▼ ') + Math.abs(trend) + '% vs previous 30 days</span>' : '');
    var max = Math.max.apply(null, d.sales_by_day.map(function (x) { return x.c; }).concat([1]));
    document.getElementById('ov-chart').innerHTML = d.sales_by_day.map(function (x) {
      var pct = x.c ? Math.max(4, Math.round((x.c / max) * 100)) : 2;
      var label = new Date(x.d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ': ' + money(x.c);
      return '<div class="' + (x.c ? '' : 'zero') + '" style="height:' + pct + '%" title="' + esc(label) + '"></div>';
    }).join('');

    var sessions = d.today_sessions || [];
    var todayEl = document.getElementById('ov-today');
    if (!sessions.length) {
      todayEl.innerHTML = '<div class="orders-empty">No consultations today.' + (d.upcoming_7d ? ' ' + d.upcoming_7d + ' in the next 7 days.' : '') + '</div>';
    } else {
      todayEl.innerHTML = sessions.map(function (s) {
        var start = new Date(s.starts_at).getTime();
        var end = start + (s.minutes || 30) * 60000;
        var now = Date.now();
        var chip = s.outcome === 'completed' ? '<span class="ov-chip done">Completed</span>'
          : s.outcome === 'no_show' ? '<span class="ov-chip">No-show</span>'
          : now >= start && now < end ? '<span class="ov-chip live">Live now</span>'
          : now >= end ? '<span class="ov-chip">Ended</span>'
          : '<span class="ov-chip">in ' + untilText(start - now) + '</span>';
        var canJoin = !s.outcome && now >= start - 10 * 60000 && now < end;
        return '<div class="ov-sess"><div><b>' + esc(clinicTime(s.starts_at)) + ' · ' + esc(s.name) + '</b><small>' + s.minutes + ' min' +
          (s.attended_by ? ' · joined by ' + esc(s.attended_by) : '') + '</small></div>' +
          '<div style="display:flex;gap:8px;align-items:center;">' + chip +
          (canJoin ? '<a class="btn btn-primary" href="video-call.html?booking_id=' + encodeURIComponent(s.id) + '">Join</a>'
                   : '<a class="btn btn-secondary" href="bookings.html?booking=' + encodeURIComponent(s.id) + '">Open</a>') +
          '</div></div>';
      }).join('') + (d.upcoming_7d ? '<div class="ov-sub" style="margin-top:8px;">' + d.upcoming_7d + ' more in the next 7 days</div>' : '');
    }

    var acts = d.team_activity || [];
    document.getElementById('ov-activity').innerHTML = acts.length ? acts.map(function (a) {
      return '<a class="t-link" href="' + esc(a.link) + '"><div class="timeline-item"><div class="t-dot"></div><div class="t-body">' +
        '<div class="t-title"><strong>' + esc(a.who || 'Staff') + '</strong> ' + esc(a.what) + '</div>' +
        '<div class="t-time">' + ago(a.at) + '</div></div></div></a>';
    }).join('') : '<div class="orders-empty">Nothing yet. Chats, consultations and order updates will show here with the staff member\'s name.</div>';

    if (d.leaderboard) {
      document.getElementById('ov-board-card').style.display = '';
      document.getElementById('ov-board').innerHTML = d.leaderboard.length ? d.leaderboard.map(function (r) {
        return '<tr><td>' + esc(r.name) + '</td><td>' + r.consults + '</td><td>' + r.chats + '</td><td>' + r.orders + '</td></tr>';
      }).join('') : '<tr><td colspan="4" class="orders-empty">No staff activity in the last 30 days.</td></tr>';
    }
  }

  function loadApp() {
    NopauseBackend.api('/v1/dashboard/summary').then(function (data) {
      setText('kpi-members-total', data.members.total.toLocaleString());
      setText('kpi-members-delta', '+' + data.members.newLast30Days + ' in last 30 days');
      setCard('unassigned', data.consultations.unassigned, data.consultations.urgentOpen ? data.consultations.urgentOpen + ' urgent' : '', data.consultations.urgentOpen ? 'urgent' : 'hot');
      setCard('safety', data.safety.escalationsUnreviewed, '', 'urgent');
    }).catch(function () {
      setText('kpi-members-total', '—');
      setText('kpi-members-delta', 'App data unavailable');
      setCard('unassigned', null, 'App data unavailable');
      setCard('safety', null, 'App data unavailable');
    });

    NopauseBackend.api('/v1/clinicians').then(function (data) {
      setText('kpi-clinicians-total', (data.clinicians || []).filter(function (c) { return c.acceptingPatients; }).length);
    }).catch(function () { setText('kpi-clinicians-total', '—'); });

    var list = document.getElementById('recent-activity-list');
    NopauseBackend.api('/v1/audit?limit=6').then(function (data) {
      var entries = data.entries || [];
      list.innerHTML = entries.length ? entries.map(function (e) {
        return '<div class="timeline-item"><div class="t-dot"></div><div class="t-body">' +
          '<div class="t-title">' + esc(String(e.action || '').replace(/[._]/g, ' ')) + (e.resourceType ? ' · ' + esc(e.resourceType) : '') + '</div>' +
          '<div class="t-time">' + (e.occurredAt ? ago(e.occurredAt) : '') + ' · ' + esc(e.actorName || e.actorRole || 'staff') + '</div>' +
        '</div></div>';
      }).join('') : '<div class="orders-empty">No recent app activity.</div>';
    }).catch(function () {
      document.getElementById('ov-app-card').style.display = 'none';
    });
  }

  function scheduleReload() {
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(loadSnapshot, 500);
  }

  function whenReady(cb) {
    if (window.CURRENT_ADMIN) { cb(); return; }
    var tries = 0;
    var iv = setInterval(function () {
      tries += 1;
      if (window.CURRENT_ADMIN) { clearInterval(iv); cb(); }
      else if (tries > 200) { clearInterval(iv); }
    }, 50);
  }

  whenReady(function () {
    greet();
    loadSnapshot();
    loadApp();
    document.getElementById('ov-refresh').addEventListener('click', function (e) { e.preventDefault(); loadSnapshot(); loadApp(); });
    sb.channel('overview-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_orders' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_bookings' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_conversations' }, scheduleReload)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'contact_messages' }, scheduleReload)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'speaking_engagement_requests' }, scheduleReload)
      .subscribe();
    setInterval(loadSnapshot, 60000);
  });
})();
