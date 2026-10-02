(function () {
  var esc = NopauseBackend.escapeHtml;

  document.addEventListener('DOMContentLoaded', load);

  function load() {
    var list = document.getElementById('clinician-list');
    NopauseBackend.api('/v1/clinicians').then(function (data) {
      var clinicians = data.clinicians || [];
      if (!clinicians.length) {
        list.innerHTML = '<div class="orders-empty">No clinicians yet.</div>';
        return;
      }
      list.innerHTML = clinicians.map(function (c) {
        var dotColor = c.acceptingPatients ? 'var(--green)' : 'var(--amber)';
        return '<div class="clinician-item">' +
          '<span class="status-dot" style="background:' + dotColor + ';"></span> ' +
          esc(c.displayName) + (c.credentials ? ', ' + esc(c.credentials) : '') +
          '<div style="font-size:12px;color:var(--text-muted);margin-left:16px;">' +
            esc(c.specialty || 'No specialty set') + ' · ' +
            (c.acceptingPatients ? 'Accepting patients' : 'Not accepting patients') +
          '</div>' +
        '</div>';
      }).join('');
    }).catch(function (err) {
      list.innerHTML = '<div class="orders-empty">Unable to load clinicians: ' + esc(err.message) + '</div>';
    });
  }
})();

// Week calendar: website consultations (website database) and app
// appointment requests (app database, staff-only reporting function).
(function () {
  var grid = document.getElementById('cs-week-grid');
  if (!grid) return;
  var esc = NopauseBackend.escapeHtml;
  var weekStart = startOfWeek(new Date());

  function startOfWeek(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function time(iso) { return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }

  async function load() {
    var end = new Date(weekStart); end.setDate(end.getDate() + 6);
    var upEnd = new Date(); upEnd.setDate(upEnd.getDate() + 30);
    document.getElementById('cs-range').textContent = weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' – ' + end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

    var from = new Date(Math.min(weekStart, Date.now())); var to = new Date(Math.max(end, upEnd));
    var appP = NopauseBackend.rpc('admin_schedule', { p_from: ymd(from), p_to: ymd(to) }).catch(function () { return null; });
    var webP = window.sb ? sb.from('store_bookings').select('id,full_name,meeting_scheduled_at,meeting_duration_minutes,attended_by_name,outcome')
      .eq('paid', true).eq('status', 'confirmed').is('cancelled_at', null)
      .gte('meeting_scheduled_at', from.toISOString()).lte('meeting_scheduled_at', new Date(to.getTime() + 864e5).toISOString()) : Promise.resolve({ data: [] });
    var res = await Promise.all([appP, webP]);
    var app = res[0], web = (res[1] && res[1].data) || [];

    var events = web.map(function (b) {
      return { at: b.meeting_scheduled_at, kind: 'web', title: b.full_name, sub: (b.meeting_duration_minutes || 30) + ' min video' + (b.attended_by_name ? ' · ' + b.attended_by_name : ''), link: 'bookings.html?booking=' + b.id };
    });
    ((app && app.items) || []).forEach(function (a) {
      if (!a.at) return;
      events.push({ at: a.at, kind: a.confirmed ? 'app' : 'req', urgent: a.urgent, title: a.patient, sub: (a.minutes || 30) + ' min · ' + (a.clinician || 'Unassigned') + (a.status === 'requested' ? ' · requested' : ''), link: 'appointment-detail.html' });
    });
    events.sort(function (x, y) { return new Date(x.at) - new Date(y.at); });

    var today = ymd(new Date());
    var html = '';
    var weekCount = 0;
    for (var i = 0; i < 7; i++) {
      var d = new Date(weekStart); d.setDate(d.getDate() + i);
      var key = ymd(d);
      var dayEv = events.filter(function (e) { return ymd(new Date(e.at)) === key; });
      weekCount += dayEv.length;
      html += '<div class="cs-day' + (key === today ? ' today' : '') + '"><h4>' + d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }) + '</h4>' +
        (dayEv.map(function (e) {
          return '<a class="cs-ev ' + e.kind + (e.urgent ? ' urgent' : '') + '" href="' + e.link + '"><b>' + time(e.at) + (e.urgent ? ' · urgent' : '') + '</b>' + esc(e.title) + '<br><span class="od-sub">' + esc(e.sub) + '</span></a>';
        }).join('') || '') + '</div>';
    }
    grid.innerHTML = html;

    document.getElementById('cs-today').textContent = events.filter(function (e) { return ymd(new Date(e.at)) === today && e.kind !== 'req'; }).length;
    document.getElementById('cs-week').textContent = weekCount;
    document.getElementById('cs-requested').textContent = app ? app.today.requested : '—';
    document.getElementById('cs-urgent').textContent = app ? app.today.urgent : '—';

    var upcoming = events.filter(function (e) { return new Date(e.at) >= new Date(); }).slice(0, 8);
    document.getElementById('cs-upcoming').innerHTML = upcoming.length ? upcoming.map(function (e) {
      return '<a class="t-link" href="' + e.link + '"><div class="cs-up"><strong>' + esc(e.title) + '</strong><small>' +
        new Date(e.at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' · ' + esc(e.sub) + '</small></div></a>';
    }).join('') : '<div class="orders-empty">Nothing booked in the next 30 days.</div>';
  }

  function shift(days) { weekStart.setDate(weekStart.getDate() + days); load(); }
  document.getElementById('cs-prev').addEventListener('click', function () { shift(-7); });
  document.getElementById('cs-next').addEventListener('click', function () { shift(7); });
  document.getElementById('cs-now').addEventListener('click', function () { weekStart = startOfWeek(new Date()); load(); });

  var tries = 0;
  var iv = setInterval(function () {
    if (window.CURRENT_ADMIN) { clearInterval(iv); load(); }
    else if (++tries > 200) clearInterval(iv);
  }, 50);
})();
