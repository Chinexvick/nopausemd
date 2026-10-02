// Live alerts on every dashboard page. A new consultation request, an
// assignment, a member's message or a ready video visit arrives through
// Supabase Realtime (the staff member's own notifications), shows as a toast
// and a desktop notification, and updates the Consultations badge in the menu.
(function () {
  if (window.StaffAlerts) return;

  var box;
  function container() {
    if (box) return box;
    box = document.createElement('div');
    box.className = 'cx-toasts';
    box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box);
    return box;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toast(title, body, link, kind) {
    var el = document.createElement(link ? 'a' : 'div');
    el.className = 'cx-toast ' + (kind || '');
    if (link) el.href = link;
    el.innerHTML = '<strong>' + esc(title) + '</strong>' + (body ? '<span>' + esc(body) + '</span>' : '') + (link ? '<em>Open</em>' : '');
    container().appendChild(el);
    var life = kind === 'urgent' ? 30000 : 9000;
    var t = setTimeout(function () { el.classList.add('out'); setTimeout(function () { el.remove(); }, 250); }, life);
    el.addEventListener('click', function () { clearTimeout(t); el.remove(); });
    return el;
  }

  function beep() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      var ctx = new Ctx();
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.06;
      o.connect(g); g.connect(ctx.destination); o.start();
      setTimeout(function () { o.frequency.value = 660; }, 140);
      setTimeout(function () { o.stop(); ctx.close(); }, 320);
    } catch (e) { /* sound is optional */ }
  }

  window.StaffAlerts = { toast: toast };

  var baseTitle = document.title;
  var unread = 0;
  function setTitle() { document.title = (unread ? '(' + unread + ') ' : '') + baseTitle; }
  window.addEventListener('focus', function () { unread = 0; setTitle(); });

  function linkFor(n) {
    var id = n.data && n.data.requestId;
    return id ? 'consultations.html?id=' + encodeURIComponent(id) : 'notifications.html';
  }

  function desktop(n) {
    if (!('Notification' in window) || Notification.permission !== 'granted' || document.hasFocus()) return;
    try {
      var x = new Notification(n.title, { body: n.body || '', tag: n.id });
      x.onclick = function () { window.focus(); location.href = linkFor(n); x.close(); };
    } catch (e) { /* not supported here */ }
  }

  function setBadge(count, urgent) {
    document.querySelectorAll('.nav-badge[data-badge-for="consultations"]').forEach(function (el) {
      el.classList.toggle('show', count > 0);
      el.classList.toggle('urgent', !!urgent);
      el.textContent = count > 0 ? String(count) : '';
    });
  }

  function refreshBadge(admin) {
    var oversee = admin.isSuperAdmin || admin.permissions.indexOf('consultations.oversee') > -1;
    NopauseBackend.api('/v1/consultations?status=open&assigned=' + (oversee ? 'all' : 'me') + '&limit=100').then(function (d) {
      var list = d.consultations || [];
      var actionable = list.filter(function (c) { return c.assignedToMe || (oversee && !c.assignedTo && c.status === 'requested'); });
      setBadge(actionable.length, list.some(function (c) { return c.safetyOutcome && c.safetyOutcome !== 'none' && (c.assignedToMe || !c.assignedTo); }));
    }).catch(function () { /* badge is a convenience */ });
  }

  function start(admin) {
    if (!window.nopauseSb || !window.NopauseBackend) return;
    var mayWork = admin.isSuperAdmin || admin.permissions.indexOf('consultations.work') > -1;
    if (!mayWork) return;

    NopauseBackend.getSession().then(function (session) {
      if (!session) return;
      var uid = session.user.id;
      refreshBadge(admin);
      setInterval(function () { refreshBadge(admin); }, 60000);
      window.addEventListener('focus', function () { refreshBadge(admin); });

      window.nopauseSb.channel('staff-alerts-' + uid)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + uid }, function (payload) {
          var n = payload.new || {};
          var urgent = n.data && n.data.safetyOutcome && n.data.safetyOutcome !== 'none';
          toast(n.title || 'New notification', n.body, linkFor(n), urgent ? 'urgent' : '');
          if (n.kind === 'consultation_requested' || n.kind === 'consultation_assigned' || urgent) beep();
          unread += 1; setTitle(); desktop(n);
          refreshBadge(admin);
          window.dispatchEvent(new CustomEvent('staff-notification', { detail: n }));
        })
        .subscribe();

      // Ask once, on the first click, so desktop alerts can reach a clinician working in another tab.
      if ('Notification' in window && Notification.permission === 'default' && !localStorage.getItem('cp_asked_notify')) {
        document.addEventListener('click', function ask() {
          document.removeEventListener('click', ask);
          try { localStorage.setItem('cp_asked_notify', '1'); } catch (e) {}
          Notification.requestPermission();
        });
      }
    });
  }

  var tries = 0;
  var iv = setInterval(function () {
    if (window.CURRENT_ADMIN) { clearInterval(iv); start(window.CURRENT_ADMIN); }
    else if (++tries > 200) clearInterval(iv);
  }, 50);
})();
