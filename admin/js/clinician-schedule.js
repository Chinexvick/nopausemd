// Clinicians & Schedule. The week calendar shows app consultations that have a
// time (from the consultations API) and, for roles that may see them, website
// video bookings. Administrators and clinical leads also manage the clinician
// directory: who members can book, in which states, and which login a clinician
// signs in with, so requests addressed to them reach them.
(function () {
  var NB = window.NopauseBackend, esc = NB.escapeHtml;
  var grid = document.getElementById('cs-week-grid');
  if (!grid) return;
  var weekStart = startOfWeek(new Date());
  var oversee = false, manage = false, web = false;
  var staffNames = {};
  var clinicians = [];

  function startOfWeek(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function time(iso) { return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
  function toast(t, b, k) { if (window.StaffAlerts) window.StaffAlerts.toast(t, b, null, k); }

  /* ---------- Calendar ---------- */
  async function load() {
    var end = new Date(weekStart); end.setDate(end.getDate() + 6);
    document.getElementById('cs-range').textContent = weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' – ' + end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    var scope = oversee ? 'all' : 'me';
    var jobs = [
      NB.api('/v1/consultations?status=open&assigned=' + scope + '&limit=100').catch(function () { return null; }),
      NB.api('/v1/consultations?status=completed&assigned=' + scope + '&limit=100').catch(function () { return null; })
    ];
    if (web) {
      var from = new Date(Math.min(weekStart, Date.now())), to = new Date(Math.max(end, Date.now() + 30 * 864e5));
      jobs.push(sb.from('store_bookings').select('id,full_name,meeting_scheduled_at,meeting_duration_minutes,attended_by_name,outcome')
        .eq('paid', true).eq('status', 'confirmed').is('cancelled_at', null)
        .gte('meeting_scheduled_at', from.toISOString()).lte('meeting_scheduled_at', new Date(to.getTime() + 864e5).toISOString()));
    }
    var res = await Promise.all(jobs);
    var open = (res[0] && res[0].consultations) || [], done = (res[1] && res[1].consultations) || [];
    var webRows = (res[2] && res[2].data) || [];

    var events = [];
    open.concat(done).forEach(function (c) {
      if (!c.scheduledAt) return;
      var who = c.assignedToMe ? 'You' : (c.assignedTo ? (staffNames[c.assignedTo] || 'Assigned') : 'Unassigned');
      events.push({ at: c.scheduledAt, kind: c.status === 'confirmed' ? 'app' : 'done', urgent: c.safetyOutcome && c.safetyOutcome !== 'none',
        title: (c.member && c.member.displayName) || 'Member', sub: 'App consultation · ' + who, link: 'consultations.html?id=' + c.id });
    });
    webRows.forEach(function (b) {
      events.push({ at: b.meeting_scheduled_at, kind: 'web', title: b.full_name, sub: (b.meeting_duration_minutes || 30) + ' min website video' + (b.attended_by_name ? ' · ' + b.attended_by_name : ''), link: 'bookings.html?booking=' + b.id });
    });
    events.sort(function (x, y) { return new Date(x.at) - new Date(y.at); });

    var today = ymd(new Date()), html = '', weekCount = 0;
    for (var i = 0; i < 7; i++) {
      var d = new Date(weekStart); d.setDate(d.getDate() + i);
      var key = ymd(d);
      var dayEv = events.filter(function (e) { return ymd(new Date(e.at)) === key; });
      weekCount += dayEv.length;
      html += '<div class="cs-day' + (key === today ? ' today' : '') + '"><h4>' + d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }) + '</h4>' +
        dayEv.map(function (e) {
          return '<a class="cs-ev ' + (e.kind === 'done' ? 'web' : e.kind) + (e.urgent ? ' urgent' : '') + '" href="' + e.link + '"><b>' + time(e.at) + (e.urgent ? ' · urgent' : '') + '</b>' + esc(e.title) + '<br><span class="od-sub">' + esc(e.sub) + '</span></a>';
        }).join('') + '</div>';
    }
    grid.innerHTML = html;

    document.getElementById('cs-today').textContent = events.filter(function (e) { return ymd(new Date(e.at)) === today && e.kind !== 'done'; }).length;
    document.getElementById('cs-week').textContent = weekCount;
    document.getElementById('cs-requested').textContent = open.filter(function (c) { return c.status === 'requested' && (oversee ? !c.assignedTo : c.assignedToMe); }).length;
    document.getElementById('cs-urgent').textContent = open.filter(function (c) { return c.safetyOutcome && c.safetyOutcome !== 'none'; }).length;

    var upcoming = events.filter(function (e) { return new Date(e.at) >= new Date() && e.kind !== 'done'; }).slice(0, 8);
    document.getElementById('cs-upcoming').innerHTML = upcoming.length ? upcoming.map(function (e) {
      return '<a class="t-link" href="' + e.link + '"><div class="cs-up"><strong>' + esc(e.title) + '</strong><small>' + new Date(e.at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' · ' + esc(e.sub) + '</small></div></a>';
    }).join('') : '<div class="orders-empty">Nothing scheduled in the next few weeks.</div>';
  }

  function shift(days) { weekStart.setDate(weekStart.getDate() + days); load(); }
  document.getElementById('cs-prev').addEventListener('click', function () { shift(-7); });
  document.getElementById('cs-next').addEventListener('click', function () { shift(7); });
  document.getElementById('cs-now').addEventListener('click', function () { weekStart = startOfWeek(new Date()); load(); });

  /* ---------- Clinician directory ---------- */
  function modal(html, ready) {
    var m = document.getElementById('cx-modal'), o = document.getElementById('cx-modal-overlay');
    m.innerHTML = html; m.hidden = false; o.hidden = false;
    function close() { m.hidden = true; o.hidden = true; }
    o.onclick = close;
    m.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', close); });
    if (ready) ready(close, m);
  }

  function renderClinicians() {
    var el = document.getElementById('clinician-list');
    if (!clinicians.length) { el.innerHTML = '<div class="orders-empty">No clinicians yet. Add one so members can request them.</div>'; return; }
    el.innerHTML = clinicians.map(function (c) {
      var hidden = !c.visibleToMembers;
      var why = !(c.licensedStates || []).length ? 'No licensed states set, so members cannot see them' : (!c.acceptingPatients ? 'Not accepting patients' : 'Hidden from members');
      return '<div class="clinician-item cl-row"><span class="status-dot" style="background:' + (hidden ? 'var(--amber)' : 'var(--green)') + ';"></span> ' +
        '<strong>' + esc(c.displayName) + '</strong>' + (c.credentials ? ', ' + esc(c.credentials) : '') +
        '<div style="font-size:12px;color:var(--text-muted);margin-left:16px;">' + esc(c.specialty || 'No specialty set') + ' · ' + ((c.licensedStates || []).join(', ') || 'no states') + '</div>' +
        '<div style="font-size:12px;margin-left:16px;color:' + (c.login ? 'var(--text-muted)' : '#b06b00') + ';">' + (c.login ? 'Signs in as ' + esc(c.login.email) : 'No login linked: requests addressed to them will not notify anyone') + '</div>' +
        (hidden ? '<div style="font-size:12px;margin-left:16px;color:#b06b00;">' + why + '</div>' : '') +
        (manage ? '<div style="margin:6px 0 0 16px;"><button type="button" class="btn btn-secondary" style="padding:3px 10px;font-size:12px;" data-edit="' + c.id + '">Edit</button></div>' : '') + '</div>';
    }).join('');
  }

  function loadClinicians() {
    return NB.api('/v1/clinicians').then(function (d) { clinicians = d.clinicians || []; renderClinicians(); })
      .catch(function (err) {
        document.getElementById('clinician-list').innerHTML = '<div class="orders-empty">' + (err.status === 403 ? 'The clinician directory is managed by the care lead.' : 'Unable to load clinicians: ' + esc(err.message)) + '</div>';
      });
  }

  function form(c) {
    var isNew = !c;
    c = c || { displayName: '', credentials: '', specialty: '', bio: '', acceptingPatients: true, licensedStates: [], login: null };
    modal('<h3>' + (isNew ? 'Add a clinician' : 'Edit ' + esc(c.displayName)) + '</h3>' +
      '<form id="cl-form" class="od-form" style="margin-top:10px;">' +
      '<label>Display name<input name="displayName" required maxlength="120" value="' + esc(c.displayName) + '"></label>' +
      '<div class="od-grid2"><label>Credentials<input name="credentials" maxlength="60" value="' + esc(c.credentials || '') + '" placeholder="MD, NP…"></label>' +
      '<label>Specialty<input name="specialty" maxlength="120" value="' + esc(c.specialty || '') + '" placeholder="Menopause medicine"></label></div>' +
      '<label>Licensed states<input name="states" value="' + esc((c.licensedStates || []).join(', ')) + '" placeholder="GA, NY  or  ALL for nationwide"></label>' +
      '<span class="od-sub" style="margin-top:-4px;">Members only see clinicians licensed in their own state. Leave blank and nobody will see this clinician.</span>' +
      '<label>Short bio<textarea name="bio" rows="2" maxlength="600">' + esc(c.bio || '') + '</textarea></label>' +
      (isNew ? '<label>Login email<input name="email" type="email" placeholder="doctor@example.com"></label><span class="od-sub" style="margin-top:-4px;">Gives them the clinician role and emails a temporary password. They must choose their own on first sign-in. Needed so assigned consultations reach them.</span>' : '') +
      '<label class="od-check"><input type="checkbox" name="accepting"' + (c.acceptingPatients ? ' checked' : '') + '> Accepting patients</label>' +
      '<div class="cx-modal-foot"><span class="od-msg" id="cl-msg" style="margin-right:auto;"></span><button type="button" class="btn btn-secondary" data-close>Cancel</button><button type="submit" class="btn btn-primary">Save</button></div></form>',
      function (close) {
        document.getElementById('cl-form').addEventListener('submit', function (e) {
          e.preventDefault();
          var f = e.target, btn = f.querySelector('button[type=submit]'), msg = document.getElementById('cl-msg');
          var raw = f.states.value.trim();
          var states = raw ? raw.split(/[\s,]+/).filter(Boolean).map(function (x) { return x.toUpperCase(); }) : [];
          if (states.some(function (x) { return !/^([A-Z]{2}|ALL)$/.test(x); })) { msg.textContent = 'Use two-letter state codes, or ALL.'; msg.className = 'od-msg err'; return; }
          var body = { displayName: f.displayName.value.trim(), credentials: f.credentials.value.trim() || undefined, specialty: f.specialty.value.trim() || undefined,
            bio: f.bio.value.trim() || undefined, acceptingPatients: f.accepting.checked, licensedStates: states };
          if (isNew && f.email.value.trim()) { body.email = f.email.value.trim(); body.method = 'password'; }
          btn.disabled = true; msg.textContent = '';
          NB.api(isNew ? '/v1/clinicians' : '/v1/clinicians/' + c.id, { method: isNew ? 'POST' : 'PATCH', body: JSON.stringify(body) }).then(function (d) {
            close();
            if (d && d.temporaryPassword && window.StaffOnboarding) {
              var pw = d.temporaryPassword, to = body.email;
              window.StaffOnboarding.sendWelcome({ email: to, name: body.displayName, role: 'clinician', temporaryPassword: pw, expiresAt: d.temporaryPasswordExpiresAt, kind: 'welcome' })
                .then(function () { toast('Clinician added', 'Login details were emailed to ' + to + '.', 'ok'); })
                .catch(function (err) { window.StaffOnboarding.showPassword(to, pw, 'The email could not be sent (' + err.message + ').'); });
            } else toast(isNew ? 'Clinician added' : 'Saved', isNew && body.email ? 'They already had an account, so the clinician role was added.' : '', 'ok');
            loadClinicians();
          }).catch(function (err) { btn.disabled = false; msg.textContent = err.message; msg.className = 'od-msg err'; });
        });
      });
  }

  document.getElementById('cl-add').addEventListener('click', function () { form(null); });
  document.getElementById('clinician-list').addEventListener('click', function (e) {
    var b = e.target.closest('[data-edit]'); if (!b) return;
    form(clinicians.filter(function (c) { return c.id === b.getAttribute('data-edit'); })[0]);
  });
  window.addEventListener('staff-notification', function () { load(); });

  var tries = 0;
  var iv = setInterval(function () {
    if (window.CURRENT_ADMIN) {
      clearInterval(iv);
      var a = window.CURRENT_ADMIN, has = function (p) { return a.isSuperAdmin || a.permissions.indexOf(p) > -1; };
      oversee = has('consultations.oversee'); manage = has('clinicians.manage'); web = has('dashboard.read') && !!window.sb;
      if (manage) { document.getElementById('cl-add').style.display = ''; }
      var names = oversee ? NB.api('/v1/consultations/assignees').then(function (d) { (d.staff || []).forEach(function (s) { staffNames[s.userId] = s.displayName || 'Staff'; }); }).catch(function () {}) : Promise.resolve();
      names.then(load);
      if (manage || oversee) loadClinicians(); else document.getElementById('cl-card').style.display = 'none';
    } else if (++tries > 200) clearInterval(iv);
  }, 50);
})();
