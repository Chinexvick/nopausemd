// Consultations: requests from the NoPauseMD app. Everything here goes through
// the admin backend's documented /v1/consultations API, so its own rules apply:
// who may see a request, who may reply, every read written to the audit trail.
//
// The flow: a member asks in the app → the care lead assigns it to a clinician →
// the assigned clinician replies, confirms it, and starts the video visit from
// here. Only the assignee (or a clinical lead / administrator) can act on it.
(function () {
  var NB = window.NopauseBackend;
  var esc = NB.escapeHtml;
  var BACKEND = window.NOPAUSE_BACKEND_URL;

  var admin = null;          // window.CURRENT_ADMIN
  var oversee = false;       // can see and assign every consultation
  var tab = 'mine';
  var queue = [];            // open consultations (requested + confirmed)
  var completed = null;      // loaded when that tab is opened
  var staff = {};            // userId -> name, for the assign picker
  var staffList = [];
  var current = null;        // { c: consultation, video: bool }
  var pending = [];          // attachments uploaded but not yet sent
  var pane = 'messages';
  var brief = null;

  var SOURCE = { ai_coach: 'AI coach', relief: 'Relief check', manual: 'Requested directly', safety_alert: 'Safety alert (paid)' };
  var STATUS = { requested: 'Requested', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled' };

  function $(id) { return document.getElementById(id); }
  function ago(iso) {
    if (!iso) return '';
    var m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    if (m < 1440) return Math.floor(m / 60) + 'h ago';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function when(iso) { return iso ? new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; }
  function money(c) { return '$' + (c / 100).toFixed(c % 100 ? 2 : 0); }
  function toast(title, body, link, kind) { if (window.StaffAlerts) window.StaffAlerts.toast(title, body, link, kind); }

  function urgency(c) {
    if (c.safetyOutcome === 'emergency') return 'emergency';
    if (c.safetyOutcome === 'urgent_clinician') return 'urgent';
    if (c.concernReported) return 'concern';
    return '';
  }

  function badges(c) {
    var out = '';
    var u = urgency(c);
    if (u === 'emergency') out += '<span class="badge badge-red">Emergency</span> ';
    else if (u === 'urgent') out += '<span class="badge badge-red">Urgent</span> ';
    else if (u === 'concern') out += '<span class="badge badge-amber">Member is concerned</span> ';
    out += '<span class="badge badge-gray">' + esc(SOURCE[c.source] || c.source || '') + '</span> ';
    if (c.amountPaidCents) out += '<span class="badge badge-green">Paid ' + money(c.amountPaidCents) + (c.durationMinutes ? ' · ' + c.durationMinutes + ' min' : '') + '</span> ';
    return out;
  }

  function assigneeLabel(c) {
    if (c.assignedToMe) return 'You';
    if (!c.assignedTo) return 'Unassigned';
    return staff[c.assignedTo] || c.assignedToName || 'Assigned';
  }

  /* ---------- Queue ---------- */
  function tabsFor() {
    var open = queue;
    var mine = open.filter(function (c) { return c.assignedToMe; });
    if (!oversee) {
      return [
        { key: 'mine', label: 'My consultations', n: mine.length, items: mine },
        { key: 'confirmed', label: 'Confirmed', n: mine.filter(function (c) { return c.status === 'confirmed'; }).length, items: mine.filter(function (c) { return c.status === 'confirmed'; }) },
        { key: 'completed', label: 'Completed', n: null, items: completed || [] }
      ];
    }
    var needs = open.filter(function (c) { return !c.assignedTo && c.status === 'requested'; });
    return [
      { key: 'needs', label: 'Needs assigning', n: needs.length, hot: true, items: needs },
      { key: 'urgent', label: 'Urgent', n: open.filter(function (c) { return urgency(c); }).length, items: open.filter(function (c) { return urgency(c); }) },
      { key: 'mine', label: 'Mine', n: mine.length, items: mine },
      { key: 'confirmed', label: 'Confirmed', n: open.filter(function (c) { return c.status === 'confirmed'; }).length, items: open.filter(function (c) { return c.status === 'confirmed'; }) },
      { key: 'open', label: 'All open', n: open.length, items: open },
      { key: 'completed', label: 'Completed', n: null, items: completed || [] }
    ];
  }

  function renderTabs() {
    var tabs = tabsFor();
    if (!tabs.some(function (t) { return t.key === tab; })) tab = tabs[0].key;
    $('cx-tabs').innerHTML = tabs.map(function (t) {
      return '<button type="button" class="cx-tab' + (t.key === tab ? ' active' : '') + (t.hot && t.n ? ' hot' : '') + '" data-tab="' + t.key + '">' + esc(t.label) + (t.n ? ' <b>' + t.n + '</b>' : '') + '</button>';
    }).join('');
    var active = tabs.filter(function (t) { return t.key === tab; })[0];
    renderItems(active.items, active.key);
  }

  function renderItems(items, key) {
    var el = $('cx-items');
    if (key === 'completed' && completed === null) { el.innerHTML = '<div class="orders-empty">Loading…</div>'; return; }
    if (!items.length) {
      var msg = { needs: 'Nothing waiting to be assigned.', urgent: 'No urgent requests.', mine: 'Nothing assigned to you right now.', confirmed: 'No confirmed consultations.', completed: 'No completed consultations yet.' };
      el.innerHTML = '<div class="orders-empty">' + (msg[key] || 'No consultations.') + '</div>';
      return;
    }
    el.innerHTML = items.map(function (c) {
      var u = urgency(c);
      return '<div class="cx-item' + (current && current.c.id === c.id ? ' active' : '') + (u ? ' ' + (u === 'concern' ? 'concern' : 'urgent') : '') + '" data-id="' + c.id + '">' +
        '<div class="cx-item-top"><strong>' + esc((c.member && c.member.displayName) || 'Member') + '</strong><span>' + ago(c.createdAt) + '</span></div>' +
        '<div class="cx-item-reason">' + esc(c.reason || '—') + '</div>' +
        '<div class="cx-item-tags">' + badges(c) + '<span class="badge badge-blue">' + esc(STATUS[c.status] || c.status) + '</span></div>' +
        '<div class="cx-item-meta"><span>' + (c.assignedTo ? 'With ' + esc(assigneeLabel(c)) : '<b>Unassigned</b>') + '</span>' +
        (c.scheduledAt ? '<span>' + esc(when(c.scheduledAt)) + '</span>' : '') + '</div></div>';
    }).join('');
  }

  function loadQueue() {
    var qs = oversee ? 'status=open&assigned=all&limit=100' : 'status=open&assigned=me&limit=100';
    return NB.api('/v1/consultations?' + qs).then(function (d) {
      queue = d.consultations || [];
      var unassigned = queue.filter(function (c) { return !c.assignedTo && c.status === 'requested'; }).length;
      $('cx-sub').textContent = oversee
        ? (unassigned ? unassigned + ' waiting to be assigned · requests from the NoPauseMD app, live' : 'Requests from the NoPauseMD app, live. Nothing waiting to be assigned.')
        : 'Consultations assigned to you, live.';
      renderTabs();
    }).catch(function (err) {
      $('cx-items').innerHTML = '<div class="orders-empty">Unable to load consultations: ' + esc(err.message) + '</div>';
    });
  }

  function loadCompleted() {
    if (completed !== null) return;
    NB.api('/v1/consultations?status=completed&assigned=' + (oversee ? 'all' : 'me') + '&limit=100').then(function (d) {
      completed = d.consultations || []; renderTabs();
    }).catch(function () { completed = []; renderTabs(); });
  }

  /* ---------- One consultation ---------- */
  // Only the person it is assigned to replies, confirms or takes the call. The care lead's job is assigning.
  function canAct(c) { return !!c.assignedToMe; }

  function open(id, quiet) {
    if (current && current.c.id !== id) stopVideoUi(true);
    return NB.api('/v1/consultations/' + encodeURIComponent(id)).then(function (d) {
      var sameThread = current && current.c.id === id;
      current = { c: d.consultation, video: !!d.videoAvailable };
      if (!sameThread) { pending = []; brief = null; pane = 'messages'; }
      $('cx-placeholder').style.display = 'none';
      $('cx-open').style.display = '';
      renderDetail();
      renderTabs();
      history.replaceState(null, '', '?id=' + encodeURIComponent(id));
      if (!quiet && window.innerWidth < 1000) $('cx-detail').scrollIntoView({ behavior: 'smooth' });
    }).catch(function (err) {
      toast('Could not open this consultation', err.message, null, 'error');
    });
  }

  function renderDetail() {
    var c = current.c;
    var act = canAct(c);
    var closed = c.status === 'completed' || c.status === 'cancelled';

    $('cx-head').innerHTML =
      '<div class="cx-head-row"><div><h2>' + esc((c.member && c.member.displayName) || 'Member') + '</h2><div class="cx-head-tags">' + badges(c) +
        '<span class="badge badge-blue">' + esc(STATUS[c.status] || c.status) + '</span></div></div>' +
        '<div class="cx-head-meta"><div>Requested ' + esc(when(c.createdAt)) + '</div>' + (c.scheduledAt ? '<div><strong>Scheduled ' + esc(when(c.scheduledAt)) + '</strong></div>' : '') + '</div></div>' +
      (urgency(c) === 'emergency' ? '<div class="cx-alert red">The safety check flagged a possible emergency. If the member is in danger, advise them to call 911 straight away.</div>' :
       urgency(c) === 'urgent' ? '<div class="cx-alert red">The safety check flagged this as urgent. Please see it first.</div>' : '') +
      '<div class="cx-reason"><span class="od-label">Why they asked</span><p>' + esc(c.reason || '—') + '</p></div>' +
      '<div class="cx-owner">' + (c.assignedTo
        ? 'Assigned to <strong>' + esc(assigneeLabel(c)) + '</strong>'
        : '<strong>Not assigned yet.</strong> ' + (oversee ? 'Choose who should take this.' : 'The care lead will assign it.')) + '</div>';

    var bar = '';
    if (!closed) {
      if (oversee) {
        bar += '<div class="cx-assign"><select id="cx-assign-sel" aria-label="Assign to">' +
          '<option value="">' + (c.assignedTo ? 'Reassign to…' : 'Assign to…') + '</option>' +
          staffList.filter(function (s) { return s.userId !== c.assignedTo; }).map(function (s) { return '<option value="' + s.userId + '">' + esc(s.displayName || 'Staff') + (s.isYou ? ' (you)' : '') + '</option>'; }).join('') +
          (c.assignedTo ? '<option value="__queue">Return to the queue</option>' : '') + '</select>' +
          '<button type="button" class="btn btn-secondary" id="cx-assign-btn">' + (c.assignedTo ? 'Reassign' : 'Assign') + '</button></div>';
      }
      if (act && c.assignedTo) {
        if (c.status === 'requested') {
          bar += '<button type="button" class="btn btn-primary" data-act="ready">Ready now</button><button type="button" class="btn btn-secondary" data-act="schedule">Schedule a time</button>';
        }
        if (c.status === 'confirmed' && current.video) bar += '<button type="button" class="btn btn-primary cx-video-btn" data-act="video">Start video visit</button>';
        if (c.status === 'requested' && current.video) bar += '<button type="button" class="btn btn-secondary" data-act="ready-video">Ready &amp; start video</button>';
        bar += '<button type="button" class="btn btn-secondary" data-act="complete">Mark complete</button>';
      }
      if (c.status === 'confirmed' && !current.video && act) bar += '<span class="od-sub">Video visits are switched off on the app server.</span>';
    }
    $('cx-bar').innerHTML = bar;
    $('cx-bar').style.display = bar ? '' : 'none';

    renderThread();
    setPane(pane);
    var chatTab = $('cx-chat-tab');
    chatTab.style.display = c.conversation && c.conversation.shared ? '' : 'none';

    var reply = $('cx-reply');
    var enabled = !closed && act && !!c.assignedTo;
    reply.style.display = enabled ? '' : 'none';
    var note = $('cx-readonly');
    if (!note) {
      note = document.createElement('div'); note.id = 'cx-readonly'; note.className = 'cx-readonly';
      reply.parentNode.appendChild(note);
    }
    note.style.display = enabled ? 'none' : '';
    note.textContent = closed ? 'This consultation is closed.'
      : !c.assignedTo ? (oversee ? 'Assign this consultation to a clinician to start replying.' : 'Waiting for the care lead to assign this to you.')
      : 'Only ' + assigneeLabel(c) + ' can reply to this member or take the call. You can reassign it above.';
    renderPending();
  }

  function renderThread() {
    var c = current.c;
    var msgs = c.messages || [];
    $('cx-thread').innerHTML = msgs.length ? msgs.map(function (m) {
      var mine = m.from === 'clinician';
      var files = (m.attachments || []).map(function (a) {
        return '<button type="button" class="cx-file" data-file="' + a.id + '">📎 ' + esc(a.filename) + '</button>';
      }).join('');
      return '<div class="cx-msg ' + (mine ? 'clinician' : 'member') + '"><div class="cx-bubble">' + (m.body ? esc(m.body).replace(/\n/g, '<br>') : '') + files + '</div>' +
        '<div class="cx-msg-time">' + (mine ? 'Clinician' : esc((c.member && c.member.displayName) || 'Member')) + ' · ' + ago(m.createdAt) + '</div></div>';
    }).join('') : '<div class="orders-empty">No messages yet. The member\'s request is shown above.</div>';
    var t = $('cx-thread'); t.scrollTop = t.scrollHeight;
  }

  function setPane(name) {
    pane = name;
    document.querySelectorAll('#cx-subtabs button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-pane') === name); });
    ['messages', 'brief', 'chat'].forEach(function (p) { $('cx-pane-' + p).hidden = p !== name; });
    if (name === 'brief') loadBrief();
    if (name === 'chat') renderChat();
  }

  function renderChat() {
    var conv = current.c.conversation;
    var el = $('cx-pane-chat');
    if (!conv || !conv.shared) { el.innerHTML = '<div class="orders-empty">The member did not share their AI chat.</div>'; return; }
    el.innerHTML = '<p class="od-sub" style="padding:12px 16px 0;">Shared by the member. Read-only.</p><div class="cx-thread">' + conv.messages.map(function (m) {
      return '<div class="cx-msg ' + (m.role === 'user' ? 'member' : 'clinician') + '"><div class="cx-bubble">' + esc(m.content).replace(/\n/g, '<br>') + '</div><div class="cx-msg-time">' + (m.role === 'user' ? 'Member' : 'AI coach') + ' · ' + ago(m.createdAt) + '</div></div>';
    }).join('') + '</div>';
  }

  function loadBrief() {
    var el = $('cx-pane-brief');
    if (brief) { renderBrief(); return; }
    el.innerHTML = '<div class="orders-empty">Building the brief…</div>';
    var id = current.c.id;
    NB.api('/v1/consultations/' + encodeURIComponent(id) + '/brief').then(function (d) {
      if (!current || current.c.id !== id) return;
      brief = d.brief; renderBrief();
    }).catch(function (err) { el.innerHTML = '<div class="orders-empty">Brief unavailable: ' + esc(err.message) + '</div>'; });
  }

  function renderBrief() {
    var b = brief, el = $('cx-pane-brief');
    var notShared = '<p class="od-sub">The member has not shared this.</p>';
    var sym = b.topSymptoms === null ? notShared : (b.topSymptoms.length
      ? '<ul class="cx-list-plain">' + b.topSymptoms.map(function (s) { return '<li><span>' + esc(String(s.category).replace(/_/g, ' ')) + '</span><b>' + s.count + ' logs</b></li>'; }).join('') + '</ul>'
      : '<p class="od-sub">No symptoms logged recently.</p>');
    var score = b.scoreSummary
      ? '<div class="cx-score"><span>' + (b.scoreSummary.overallScore == null ? '—' : b.scoreSummary.overallScore) + '</span><div>Overall score<br><small>' + esc(when(b.scoreSummary.computedAt)) + '</small></div></div>' +
        (b.scoreSummary.lowestDomains || []).map(function (d) { return '<div class="cx-bar-row"><span>' + esc(String(d.domain).replace(/_/g, ' ')) + '</span><b>' + (d.score == null ? '—' : d.score) + '</b></div>'; }).join('')
      : notShared;
    var reviews = b.recentWeeklyReviews === null ? notShared : (b.recentWeeklyReviews.length
      ? b.recentWeeklyReviews.map(function (r) {
        return '<div class="cx-review"><strong>Week of ' + esc(new Date(r.weekStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })) + '</strong><p>' + esc(r.howTheWeekWent) + '</p>' +
          (r.whatHelped ? '<p><em>Helped:</em> ' + esc(r.whatHelped) + '</p>' : '') + (r.newSymptoms ? '<p><em>New:</em> ' + esc(r.newSymptoms) + '</p>' : '') + '</div>';
      }).join('') : '<p class="od-sub">No weekly reviews yet.</p>');
    var flags = (b.safetyFlags || []).length
      ? '<ul class="cx-list-plain">' + b.safetyFlags.map(function (f) { return '<li><span>' + esc(f.source) + (f.outcome ? ' · ' + esc(String(f.outcome).replace(/_/g, ' ')) : '') + '</span><b>' + esc(when(f.occurredAt)) + '</b></li>'; }).join('') + '</ul>'
      : '<p class="od-sub">No safety flags in the last 6 months.</p>';
    el.innerHTML = '<div class="cx-brief">' +
      '<section><h4>Top symptoms</h4>' + sym + '</section><section><h4>Health score</h4>' + score + '</section>' +
      '<section><h4>Recent weekly reviews</h4>' + reviews + '</section><section><h4>Safety flags</h4>' + flags + '</section>' +
      '<p class="od-sub">Built only from what the member chose to share. Safety flags are always shown. Viewing this brief is recorded in the audit log.</p></div>';
  }

  /* ---------- Actions ---------- */
  function run(btn, fn) {
    if (btn) btn.disabled = true;
    return Promise.resolve().then(fn).catch(function (err) { toast('That did not work', err.message, null, 'error'); })
      .then(function () { if (btn) btn.disabled = false; });
  }
  function refreshAll() { return loadQueue().then(function () { return current ? open(current.c.id, true) : null; }); }

  function assign(value, btn) {
    if (!value) return;
    var body = { assignToUserId: value === '__queue' ? null : value };
    return run(btn, function () {
      return NB.api('/v1/consultations/' + current.c.id + '/reassign', { method: 'POST', body: JSON.stringify(body) }).then(function () {
        toast('Saved', body.assignToUserId ? 'Assigned to ' + (staff[value] || 'the clinician') + '. They have been notified.' : 'Returned to the queue.', null, 'ok');
        return refreshAll();
      });
    });
  }

  function setStatus(status, scheduledAt, btn) {
    var body = { status: status }; if (scheduledAt) body.scheduledAt = scheduledAt;
    return run(btn, function () {
      return NB.api('/v1/consultations/' + current.c.id, { method: 'PATCH', body: JSON.stringify(body) }).then(function () {
        toast('Saved', status === 'completed' ? 'Marked complete. The member has been told.' : (scheduledAt ? 'Scheduled. The member has been told.' : 'The member has been told you are ready.'), null, 'ok');
        return refreshAll();
      });
    });
  }

  function modal(html, onReady) {
    var m = $('cx-modal'); m.innerHTML = html; m.hidden = false; $('cx-modal-overlay').hidden = false;
    function close() { m.hidden = true; $('cx-modal-overlay').hidden = true; }
    $('cx-modal-overlay').onclick = close;
    m.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', close); });
    if (onReady) onReady(close);
    return close;
  }

  function scheduleModal() {
    var d = new Date(Date.now() + 3600000); d.setMinutes(0, 0, 0);
    var local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    modal('<h3>Schedule the consultation</h3><p class="od-sub">The member is told the time and reminded about an hour before. Times are in your own time zone.</p>' +
      '<label class="cx-lbl">Date and time<input type="datetime-local" id="cx-when" value="' + local + '"></label>' +
      '<div class="cx-modal-foot"><button type="button" class="btn btn-secondary" data-close>Cancel</button><button type="button" class="btn btn-primary" id="cx-when-ok">Confirm</button></div>',
      function (close) {
        $('cx-when-ok').addEventListener('click', function () {
          var v = $('cx-when').value;
          if (!v || new Date(v).getTime() < Date.now() - 60000) { toast('Pick a future time', 'That time has already passed.', null, 'error'); return; }
          close(); setStatus('confirmed', new Date(v).toISOString(), null);
        });
      });
  }

  function completeModal() {
    modal('<h3>Mark this consultation complete?</h3><p class="od-sub">The member is told it is complete and can no longer message about it. This cannot be undone.</p>' +
      '<div class="cx-modal-foot"><button type="button" class="btn btn-secondary" data-close>Not yet</button><button type="button" class="btn btn-primary" id="cx-done-ok">Mark complete</button></div>',
      function (close) { $('cx-done-ok').addEventListener('click', function () { close(); stopVideoUi(true); setStatus('completed', null, null); }); });
  }

  /* ---------- Messages & files ---------- */
  function renderPending() {
    $('cx-files').innerHTML = pending.map(function (a, i) {
      return '<span class="cx-chip">📎 ' + esc(a.filename) + ' <button type="button" data-rm="' + i + '" aria-label="Remove">×</button></span>';
    }).join('');
  }

  function attach(file) {
    if (!file) return;
    if (pending.length >= 5) { toast('Too many files', 'You can attach up to 5 files to one message.', null, 'error'); return; }
    if (file.size > 10 * 1024 * 1024) { toast('File too large', 'Files can be up to 10 MB.', null, 'error'); return; }
    var msg = $('cx-reply-msg'); msg.textContent = 'Uploading…'; msg.className = 'od-msg';
    NB.api('/v1/consultations/' + current.c.id + '/attachments', { method: 'POST', body: JSON.stringify({ filename: file.name, contentType: file.type, sizeBytes: file.size }) }).then(function (d) {
      return window.nopauseSb.storage.from(d.upload.bucket).uploadToSignedUrl(d.upload.path, d.upload.token, file, { contentType: file.type }).then(function (r) {
        if (r.error) throw r.error;
        pending.push({ id: d.attachment.id, filename: file.name }); renderPending(); msg.textContent = '';
      });
    }).catch(function (err) { msg.textContent = err.message || 'Upload failed'; msg.className = 'od-msg err'; });
  }

  function openFile(id) {
    var w = window.open('', '_blank');
    NB.api('/v1/consultations/' + current.c.id + '/attachments/' + id + '/url').then(function (d) {
      if (w) w.location = d.url; else window.location = d.url;
    }).catch(function (err) { if (w) w.close(); toast('Could not open the file', err.message, null, 'error'); });
  }

  function send(e) {
    e.preventDefault();
    var body = $('cx-reply-body').value.trim();
    if (!body && !pending.length) return;
    var btn = $('cx-send'); btn.disabled = true;
    var payload = {}; if (body) payload.body = body; if (pending.length) payload.attachmentIds = pending.map(function (a) { return a.id; });
    NB.api('/v1/consultations/' + current.c.id + '/messages', { method: 'POST', body: JSON.stringify(payload) }).then(function () {
      $('cx-reply-body').value = ''; pending = []; renderPending(); $('cx-reply-msg').textContent = '';
      return open(current.c.id, true);
    }).catch(function (err) { $('cx-reply-msg').textContent = err.message; $('cx-reply-msg').className = 'od-msg err'; })
      .then(function () { btn.disabled = false; });
  }

  /* ---------- Video visit ---------- */
  var video = { on: false, poll: null, tick: null, startedAt: null, id: null };

  function startVideo(btn) {
    var id = current.c.id;
    return run(btn, function () {
      return NB.api('/v1/consultations/' + id + '/video/join', { method: 'POST' }).then(function (d) {
        var v = d.video;
        var src = BACKEND + '/video/room#token=' + encodeURIComponent(v.token) + '&room=' + encodeURIComponent(v.roomName) + '&label=' + encodeURIComponent('the member');
        $('cx-video').hidden = false;
        $('cx-video-frame').src = src;
        $('cx-video-state').textContent = ' Connecting your camera…';
        video.on = true; video.id = id; video.startedAt = null; $('cx-timer').textContent = '00:00';
        $('cx-video').scrollIntoView({ behavior: 'smooth', block: 'start' });
        pollVideo();
        if (video.poll) clearInterval(video.poll);
        video.poll = setInterval(pollVideo, 5000);
      });
    });
  }

  function pollVideo() {
    if (!video.on) return;
    NB.api('/v1/consultations/' + video.id + '/video/status').then(function (s) {
      if (!video.on) return;
      var name = (current && current.c.member && current.c.member.displayName) || 'the member';
      if (s.memberPresent) { $('cx-video-state').textContent = ' ' + name + ' is in the call'; markStart(); }
      else $('cx-video-state').textContent = ' Waiting for ' + name + ' to join. They have been notified.';
    }).catch(function () { /* transient */ });
  }

  function markStart() {
    if (video.startedAt) return;
    video.startedAt = Date.now();
    video.tick = setInterval(function () {
      var s = Math.floor((Date.now() - video.startedAt) / 1000);
      $('cx-timer').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    }, 1000);
  }

  function stopVideoUi(silent) {
    video.on = false;
    if (video.poll) clearInterval(video.poll); if (video.tick) clearInterval(video.tick);
    video.poll = video.tick = null; video.startedAt = null;
    var f = $('cx-video-frame'); if (f) f.src = 'about:blank';
    var v = $('cx-video'); if (v) v.hidden = true;
  }

  function endVideo() {
    modal('<h3>End the visit for everyone?</h3><p class="od-sub">This closes the room, so the member is disconnected too. You can still start it again while the consultation is confirmed.</p>' +
      '<div class="cx-modal-foot"><button type="button" class="btn btn-secondary" data-close>Keep going</button><button type="button" class="btn cx-end" id="cx-end-ok">End visit</button></div>',
      function (close) {
        $('cx-end-ok').addEventListener('click', function () {
          close();
          NB.api('/v1/consultations/' + video.id + '/video/end', { method: 'POST' }).then(function () {
            stopVideoUi(); toast('Visit ended', 'You can mark the consultation complete when you are done.', null, 'ok');
          }).catch(function (err) { toast('Could not end the visit', err.message, null, 'error'); });
        });
      });
  }

  window.addEventListener('message', function (e) {
    if (!BACKEND || e.origin !== BACKEND || !e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'error') {
      var k = e.data.kind;
      $('cx-video-state').textContent = ' ' + (k === 'permission' ? 'Allow camera and microphone access in your browser, then start again.'
        : k === 'no-device' ? 'No camera or microphone was found.' : k === 'expired' ? 'The visit link expired. Start the visit again.'
        : k === 'full' ? 'The room already has two people.' : (e.data.message || 'Could not connect.'));
    } else if (e.data.type === 'remote-joined') { $('cx-video-state').textContent = ' The member is in the call'; markStart(); }
    else if (e.data.type === 'remote-left') { $('cx-video-state').textContent = ' The member left the call'; }
    else if (e.data.type === 'connected') { $('cx-video-state').textContent = ' You are connected. Waiting for the member…'; }
  });

  /* ---------- Wiring ---------- */
  $('cx-tabs').addEventListener('click', function (e) {
    var b = e.target.closest('.cx-tab'); if (!b) return;
    tab = b.getAttribute('data-tab'); renderTabs();
    if (tab === 'completed') loadCompleted();
  });
  $('cx-items').addEventListener('click', function (e) {
    var it = e.target.closest('.cx-item'); if (it) open(it.getAttribute('data-id'));
  });
  $('cx-subtabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setPane(b.getAttribute('data-pane')); });
  $('cx-bar').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.id === 'cx-assign-btn') { assign($('cx-assign-sel').value, b); return; }
    var a = b.getAttribute('data-act');
    if (a === 'ready') setStatus('confirmed', null, b);
    else if (a === 'schedule') scheduleModal();
    else if (a === 'complete') completeModal();
    else if (a === 'video') startVideo(b);
    else if (a === 'ready-video') { setStatus('confirmed', null, b).then(function () { if (current && current.c.status === 'confirmed') startVideo(null); }); }
  });
  $('cx-thread').addEventListener('click', function (e) { var f = e.target.closest('[data-file]'); if (f) openFile(f.getAttribute('data-file')); });
  $('cx-reply').addEventListener('submit', send);
  $('cx-file').addEventListener('change', function (e) { attach(e.target.files[0]); e.target.value = ''; });
  $('cx-files').addEventListener('click', function (e) { var r = e.target.closest('[data-rm]'); if (r) { pending.splice(Number(r.getAttribute('data-rm')), 1); renderPending(); } });
  $('cx-reply-body').addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) $('cx-reply').requestSubmit(); });
  $('cx-video-leave').addEventListener('click', function () { stopVideoUi(); });
  $('cx-video-end').addEventListener('click', endVideo);
  $('cx-refresh').addEventListener('click', function (e) { e.preventDefault(); refreshAll(); });
  window.addEventListener('focus', function () { loadQueue(); });
  window.addEventListener('beforeunload', function () { video.on = false; });

  // Live: a new request, an assignment, or a member message arrived.
  window.addEventListener('staff-notification', function (e) {
    var n = e.detail || {};
    var kind = n.kind || '';
    if (kind.indexOf('consultation') !== 0) return;
    loadQueue();
    if (current && n.data && n.data.requestId === current.c.id && (kind === 'consultation_member_message' || kind === 'consultation_assigned')) open(current.c.id, true);
  });

  function whenReady(cb) {
    if (window.CURRENT_ADMIN) { cb(); return; }
    var tries = 0;
    var iv = setInterval(function () {
      if (window.CURRENT_ADMIN) { clearInterval(iv); cb(); } else if (++tries > 200) clearInterval(iv);
    }, 50);
  }

  whenReady(function () {
    admin = window.CURRENT_ADMIN;
    oversee = admin.isSuperAdmin || admin.permissions.indexOf('consultations.oversee') > -1;
    tab = oversee ? 'needs' : 'mine';
    var params = new URLSearchParams(location.search);
    var staffP = oversee ? NB.api('/v1/consultations/assignees').then(function (d) {
      staffList = d.staff || []; staffList.forEach(function (s) { staff[s.userId] = s.displayName || 'Staff'; });
    }).catch(function () {}) : Promise.resolve();
    staffP.then(loadQueue).then(function () {
      var want = params.get('tab'); if (want && tabsFor().some(function (t) { return t.key === want; })) { tab = want; renderTabs(); if (want === 'completed') loadCompleted(); }
      var id = params.get('id'); if (id) open(id);
    });
  });
})();
