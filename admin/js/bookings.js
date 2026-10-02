// Consultations — the admin booking engine (bookings.html).
//
// Data: store_bookings rows (readable/updatable by store admins via RLS) and
// booking_blocked_dates. Actions that need server credentials — sending the
// meeting link, rescheduling (re-emails the patient), cancelling (optional
// Stripe refund + email) — go through the website's
// /api/admin-booking-action, authenticated with this admin's own session.
// Notes and session outcomes are written directly through RLS.
//
// All booking times are clinic time (America/New_York): appointment_date +
// appointment_time are the clinic's wall clock, meeting_scheduled_at is the
// same moment in UTC.
(function () {
  var listEl = document.getElementById('bk-list');
  if (!listEl) return;

  var CLINIC_TZ = 'America/New_York';
  var WEBSITE_URL = 'https://www.clinipausemd.com';
  var ACTION_URL = WEBSITE_URL + '/api/admin-booking-action';
  var HOLD_MINUTES = 35;
  var SLOT_PX = 44;
  var AVATAR_COLORS = ['#2d6a4f', '#0077b6', '#7c5cbf', '#c2410c', '#0f766e', '#be185d', '#4d7c0f', '#b45309'];

  var el = {
    shell: document.getElementById('bk-shell'),
    week: document.getElementById('bk-week'),
    range: document.getElementById('bk-range'),
    detail: document.getElementById('bk-detail'),
    backdrop: document.getElementById('bk-backdrop'),
    modal: document.getElementById('bk-modal'),
    modalBox: document.getElementById('bk-modal-box'),
    toast: document.getElementById('bk-toast'),
    search: document.getElementById('bk-search'),
    topSearch: document.getElementById('booking-search'),
    filters: document.getElementById('bk-filters')
  };

  var bookings = [];
  var byId = {};
  var closedDays = [];
  var filter = 'upcoming';
  var searchTerm = '';
  var weekStart = null;
  var selectedId = null;
  var loadedOnce = false;
  var toastTimer = null;

  // ---------------------------------------------------------------- utils

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function clinicNow() {
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: CLINIC_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date());
    var get = function (t) { return (parts.find(function (p) { return p.type === t; }) || {}).value; };
    return { date: get('year') + '-' + get('month') + '-' + get('day'), minutes: +get('hour') * 60 + +get('minute') };
  }

  function dateObj(str) { var p = str.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])); }
  function dateStr(d) { return d.toISOString().slice(0, 10); }
  function addDays(str, n) { var d = dateObj(str); d.setUTCDate(d.getUTCDate() + n); return dateStr(d); }
  function dow(str) { return dateObj(str).getUTCDay(); }
  function mondayOf(str) { var w = dow(str); return addDays(str, w === 0 ? -6 : 1 - w); }

  function fmtDate(str, opts) { return dateObj(str).toLocaleDateString('en-US', Object.assign({ timeZone: 'UTC' }, opts)); }
  function fmtLongDay(str) { return fmtDate(str, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); }
  function fmtShortDay(str) { return fmtDate(str, { weekday: 'short', month: 'short', day: 'numeric' }); }
  function fmtStamp(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString('en-US', { timeZone: CLINIC_TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function slotMinutes(label) {
    var m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(label || '').trim());
    if (!m) return 0;
    return (parseInt(m[1], 10) % 12 + (/pm/i.test(m[3]) ? 12 : 0)) * 60 + parseInt(m[2], 10);
  }
  function minutesToLabel(total) {
    var h = Math.floor(total / 60), mm = total % 60;
    return ((h % 12) || 12) + ':' + String(mm).padStart(2, '0') + ' ' + (h >= 12 ? 'PM' : 'AM');
  }

  function duration(b) { return b.meeting_duration_minutes || 30; }
  function durationLabel(b) { return duration(b) === 60 ? '1 hour' : duration(b) + ' min'; }
  function timeRange(b) {
    return b.appointment_time + ' – ' + minutesToLabel(slotMinutes(b.appointment_time) + duration(b));
  }
  function startMs(b) { return Date.parse(b.meeting_scheduled_at); }
  function endMs(b) { return startMs(b) + duration(b) * 60000; }

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  function fee(b) { return Number(b.amount_cents) === 0 ? 'Complimentary' : usd.format((b.amount_cents || 0) / 100); }

  function initials(name) {
    var parts = String(name || '?').trim().split(/\s+/);
    return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }
  function avatarColor(name) {
    var h = 0;
    String(name || '').split('').forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) >>> 0; });
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }

  function relative(ms) {
    var abs = Math.abs(ms), m = Math.round(abs / 60000);
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d >= 1) return d + (d === 1 ? ' day' : ' days') + (h % 24 ? ' ' + (h % 24) + ' hr' : '');
    return h + ' hr' + (m % 60 ? ' ' + (m % 60) + ' min' : '');
  }

  // ---------------------------------------------------------------- state

  var STATES = {
    upcoming:  { label: 'Confirmed',          badge: 'badge-green', chip: 'green', dot: '#2d6a4f' },
    live:      { label: 'Live now',           badge: 'badge-red',   chip: 'red',   dot: '#e5484d' },
    holding:   { label: 'Awaiting payment',   badge: 'badge-amber', chip: 'amber', dot: '#ff9f1c' },
    expired:   { label: 'Checkout abandoned', badge: 'badge-grey',  chip: '',      dot: '#a5adb8' },
    past:      { label: 'Ended',              badge: 'badge-grey',  chip: '',      dot: '#a5adb8' },
    completed: { label: 'Completed',          badge: 'badge-blue',  chip: 'blue',  dot: '#0077b6' },
    no_show:   { label: 'No-show',            badge: 'badge-grey',  chip: '',      dot: '#a5adb8' },
    cancelled: { label: 'Cancelled',          badge: 'badge-red',   chip: 'red',   dot: '#e5484d' },
    refunded:  { label: 'Refunded',           badge: 'badge-red',   chip: 'red',   dot: '#e5484d' }
  };

  function stateOf(b) {
    if (b.status === 'cancelled') return 'cancelled';
    if (b.status === 'refunded') return 'refunded';
    if (b.status === 'pending_payment') {
      return Date.now() - Date.parse(b.created_at) < HOLD_MINUTES * 60000 ? 'holding' : 'expired';
    }
    if (b.outcome === 'completed') return 'completed';
    if (b.outcome === 'no_show') return 'no_show';
    var now = Date.now();
    if (now >= startMs(b) && now < endMs(b)) return 'live';
    if (now >= endMs(b)) return 'past';
    return 'upcoming';
  }

  function isActive(s) { return s === 'upcoming' || s === 'live' || s === 'holding'; }
  function onCalendar(s) { return s !== 'cancelled' && s !== 'refunded' && s !== 'expired'; }
  function canJoin(b) {
    var s = stateOf(b);
    return b.paid && b.meeting_token && (s === 'upcoming' || s === 'live');
  }
  function patientLink(b) { return WEBSITE_URL + '/consultation.html?t=' + encodeURIComponent(b.meeting_token); }

  // ---------------------------------------------------------------- data

  function load() {
    return Promise.all([
      sb.from('store_bookings').select('*').order('meeting_scheduled_at', { ascending: false }).limit(1000),
      sb.from('booking_blocked_dates').select('*').order('blocked_date', { ascending: true })
    ]).then(function (results) {
      var res = results[0];
      if (res.error) {
        listEl.innerHTML = '<div class="bk-empty">Unable to load consultations: ' + esc(res.error.message) + '<br>Try reloading the page.</div>';
        return;
      }
      bookings = (res.data || []).filter(function (b) { return b.meeting_scheduled_at; });
      byId = {};
      bookings.forEach(function (b) { byId[b.id] = b; });
      closedDays = (results[1] && !results[1].error && results[1].data) || [];
      renderAll();

      if (!loadedOnce) {
        loadedOnce = true;
        var deepLink = new URLSearchParams(location.search).get('booking');
        if (deepLink && byId[deepLink]) {
          var s = stateOf(byId[deepLink]);
          if (!matchesFilter(byId[deepLink], s, filter)) setFilter('all');
          openDetail(deepLink, { jumpWeek: true });
        }
      } else if (selectedId && byId[selectedId]) {
        renderDetail(byId[selectedId]);
      }
    });
  }

  function renderAll() {
    renderKpis();
    renderCounts();
    renderList();
    renderWeek();
  }

  // ---------------------------------------------------------------- KPIs

  function renderKpis() {
    var now = clinicNow();
    var nowMs = Date.now();
    var today = bookings.filter(function (b) {
      var s = stateOf(b);
      return b.appointment_date === now.date && s !== 'cancelled' && s !== 'refunded' && s !== 'expired';
    });
    var nextToday = today.filter(function (b) { return stateOf(b) === 'upcoming' || stateOf(b) === 'live'; })
      .sort(function (a, b) { return startMs(a) - startMs(b); })[0];
    document.getElementById('kpi-today').textContent = today.length;
    document.getElementById('kpi-today-sub').textContent = nextToday
      ? (stateOf(nextToday) === 'live' ? 'Live now: ' : 'Next: ') + nextToday.full_name.split(' ')[0] + ' at ' + nextToday.appointment_time
      : (today.length ? 'None left today' : 'No sessions today');

    var week = bookings.filter(function (b) {
      var s = stateOf(b);
      return (s === 'upcoming' || s === 'live') && startMs(b) < nowMs + 7 * 86400000;
    });
    var minutes = week.reduce(function (sum, b) { return sum + duration(b); }, 0);
    document.getElementById('kpi-week').textContent = week.length;
    document.getElementById('kpi-week-sub').textContent = week.length ? (minutes / 60) + ' hours booked' : 'Nothing booked yet';

    var holding = bookings.filter(function (b) { return stateOf(b) === 'holding'; });
    var abandoned = bookings.filter(function (b) {
      return stateOf(b) === 'expired' && nowMs - Date.parse(b.created_at) < 7 * 86400000;
    });
    document.getElementById('kpi-holding').textContent = holding.length;
    document.getElementById('kpi-holding-sub').textContent = abandoned.length + ' abandoned this week';

    var month = now.date.slice(0, 7);
    var paidThisMonth = bookings.filter(function (b) {
      return b.paid && b.status === 'confirmed' && b.paid_at &&
        new Date(b.paid_at).toLocaleDateString('en-CA', { timeZone: CLINIC_TZ }).slice(0, 7) === month;
    });
    var revenue = paidThisMonth.reduce(function (sum, b) { return sum + (b.amount_cents || 0); }, 0);
    var free = paidThisMonth.filter(function (b) { return Number(b.amount_cents) === 0; }).length;
    document.getElementById('kpi-revenue').textContent = usd.format(revenue / 100);
    document.getElementById('kpi-revenue-sub').textContent = (paidThisMonth.length - free) + ' paid' + (free ? ' · ' + free + ' complimentary' : '') + ' this month';
  }

  // ---------------------------------------------------------------- list

  function matchesFilter(b, s, f) {
    var today = clinicNow().date;
    switch (f) {
      case 'upcoming': return isActive(s);
      case 'today': return b.appointment_date === today && onCalendar(s);
      case 'past': return s === 'past' || s === 'completed' || s === 'no_show';
      case 'unpaid': return s === 'holding' || s === 'expired';
      case 'cancelled': return s === 'cancelled' || s === 'refunded';
      default: return true;
    }
  }

  function matchesSearch(b) {
    if (!searchTerm) return true;
    var hay = [b.full_name, b.email, b.phone, b.reason].join(' ').toLowerCase();
    return hay.indexOf(searchTerm) > -1;
  }

  function renderCounts() {
    ['upcoming', 'today', 'past', 'unpaid', 'cancelled'].forEach(function (f) {
      var n = bookings.filter(function (b) { return matchesFilter(b, stateOf(b), f); }).length;
      var c = el.filters.querySelector('[data-count="' + f + '"]');
      if (c) c.textContent = n ? n : '';
    });
  }

  function groupLabel(date) {
    var today = clinicNow().date;
    if (date === today) return 'Today';
    if (date === addDays(today, 1)) return 'Tomorrow';
    if (date === addDays(today, -1)) return 'Yesterday';
    return fmtDate(date, { weekday: 'long', month: 'short', day: 'numeric', year: date.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric' });
  }

  function renderList() {
    var ascending = filter === 'upcoming' || filter === 'today';
    var rows = bookings.filter(function (b) {
      return matchesFilter(b, stateOf(b), filter) && matchesSearch(b);
    }).sort(function (a, b) { return ascending ? startMs(a) - startMs(b) : startMs(b) - startMs(a); });

    if (!rows.length) {
      var msg = {
        upcoming: 'No upcoming consultations.',
        today: 'No consultations today.',
        past: 'No past consultations yet.',
        unpaid: 'No unpaid or abandoned checkouts.',
        cancelled: 'No cancelled consultations.',
        all: 'No consultations yet.'
      }[filter];
      listEl.innerHTML = '<div class="bk-empty">' + (searchTerm ? 'No patients match “' + esc(searchTerm) + '”.' : msg) + '</div>';
      return;
    }

    var html = '';
    var lastGroup = null;
    rows.forEach(function (b) {
      var g = groupLabel(b.appointment_date);
      if (g !== lastGroup) { html += '<div class="bk-group-label">' + esc(g) + '</div>'; lastGroup = g; }
      var s = stateOf(b);
      var meta = STATES[s];
      var chip = s === 'upcoming'
        ? '<span class="bk-chip">' + esc(durationLabel(b)) + '</span>'
        : '<span class="bk-chip ' + meta.chip + '">' + esc(meta.label) + '</span>';
      html +=
        '<button type="button" class="bk-item' + (b.id === selectedId ? ' active' : '') + '" data-id="' + b.id + '">' +
          '<span class="bk-avatar" style="background:' + avatarColor(b.full_name) + '">' + esc(initials(b.full_name)) +
            '<span class="bk-status-dot" style="background:' + meta.dot + '"></span></span>' +
          '<span style="min-width:0;">' +
            '<span class="bk-item-name" style="display:block;">' + esc(b.full_name) + '</span>' +
            '<span class="bk-item-sub" style="display:block;">' + esc(b.reason || 'General consultation') + '</span>' +
          '</span>' +
          '<span class="bk-item-meta"><span class="bk-item-time">' + esc(b.appointment_time) + '</span>' + chip + '</span>' +
        '</button>';
    });
    listEl.innerHTML = html;
  }

  listEl.addEventListener('click', function (e) {
    var item = e.target.closest('.bk-item');
    if (item) openDetail(item.getAttribute('data-id'), { jumpWeek: true });
  });

  function setFilter(f) {
    filter = f;
    el.filters.querySelectorAll('.pill').forEach(function (p) {
      var on = p.getAttribute('data-filter') === f;
      p.classList.toggle('active', on);
      p.setAttribute('aria-selected', String(on));
    });
    renderList();
  }

  el.filters.addEventListener('click', function (e) {
    var pill = e.target.closest('.pill');
    if (pill) setFilter(pill.getAttribute('data-filter'));
  });

  function onSearch(value) {
    searchTerm = value.trim().toLowerCase();
    if (searchTerm && filter !== 'all') setFilter('all'); else renderList();
  }
  el.search.addEventListener('input', function (e) {
    if (el.topSearch) el.topSearch.value = e.target.value;
    onSearch(e.target.value);
  });
  if (el.topSearch) {
    el.topSearch.addEventListener('input', function (e) {
      el.search.value = e.target.value;
      onSearch(e.target.value);
    });
  }

  // ---------------------------------------------------------------- calendar

  function renderWeek() {
    var today = clinicNow();
    var visible = bookings.filter(function (b) { return onCalendar(stateOf(b)); });
    var weekEnd = addDays(weekStart, 6);
    var inWeek = visible.filter(function (b) { return b.appointment_date >= weekStart && b.appointment_date <= weekEnd; });

    var days = [];
    for (var i = 0; i < 7; i++) {
      var d = addDays(weekStart, i);
      var weekend = i >= 5;
      if (!weekend || inWeek.some(function (b) { return b.appointment_date === d; })) days.push(d);
    }

    var startMin = 8 * 60, endMin = 18 * 60;
    inWeek.forEach(function (b) {
      var s = slotMinutes(b.appointment_time);
      startMin = Math.min(startMin, Math.floor(s / 60) * 60);
      endMin = Math.max(endMin, Math.ceil((s + duration(b)) / 60) * 60);
    });
    var height = (endMin - startMin) / 30 * SLOT_PX;

    var first = days[0], last = days[days.length - 1];
    var sameMonth = first.slice(0, 7) === last.slice(0, 7);
    el.range.textContent = fmtDate(first, { month: 'short', day: 'numeric' }) + ' – ' +
      (sameMonth ? Number(last.slice(8)) : fmtDate(last, { month: 'short', day: 'numeric' })) + ', ' + last.slice(0, 4);

    var closedSet = {};
    closedDays.forEach(function (c) { closedSet[c.blocked_date] = c.reason || 'Clinic closed'; });

    el.week.style.gridTemplateColumns = '58px repeat(' + days.length + ', minmax(112px, 1fr))';
    var html = '<div class="bk-week-corner"></div>';
    days.forEach(function (d) {
      html += '<div class="bk-day-head' + (d === today.date ? ' today' : '') + '">' +
        (closedSet[d] ? '<span class="closed-tag" title="' + esc(closedSet[d]) + '">Closed</span>' : '') +
        '<span class="dn">' + fmtDate(d, { weekday: 'short' }) + '</span><span class="dd">' + Number(d.slice(8)) + '</span></div>';
    });

    html += '<div class="bk-time-col" style="height:' + height + 'px">';
    for (var m = startMin + 60; m < endMin; m += 60) {
      html += '<span class="bk-time-label" style="top:' + ((m - startMin) / 30 * SLOT_PX) + 'px">' + minutesToLabel(m).replace(':00', '') + '</span>';
    }
    html += '</div>';

    days.forEach(function (d) {
      html += '<div class="bk-day-col' + (d === today.date ? ' today' : '') + (closedSet[d] ? ' closed' : '') + '" style="height:' + height + 'px">';
      inWeek.filter(function (b) { return b.appointment_date === d; }).forEach(function (b) {
        var s = stateOf(b);
        var top = (slotMinutes(b.appointment_time) - startMin) / 30 * SLOT_PX + 2;
        var h = duration(b) / 30 * SLOT_PX - 4;
        html += '<button type="button" class="bk-event st-' + s + (b.id === selectedId ? ' selected' : '') + '" data-id="' + b.id + '" style="top:' + top + 'px;height:' + h + 'px" ' +
          'title="' + esc(b.full_name + ' · ' + timeRange(b) + ' · ' + STATES[s].label) + '">' +
          '<span class="ev-name">' + esc(b.full_name) + '</span>' +
          '<span class="ev-time">' + esc(timeRange(b)) + '</span>' +
          (h > 70 ? '<span class="ev-reason">' + esc(b.reason || '') + '</span>' : '') +
        '</button>';
      });
      if (d === today.date && today.minutes >= startMin && today.minutes <= endMin) {
        html += '<div class="bk-now-line" style="top:' + ((today.minutes - startMin) / 30 * SLOT_PX) + 'px"></div>';
      }
      html += '</div>';
    });

    el.week.innerHTML = html;
  }

  el.week.addEventListener('click', function (e) {
    var ev = e.target.closest('.bk-event');
    if (ev) openDetail(ev.getAttribute('data-id'));
  });

  function goToWeek(date) {
    weekStart = mondayOf(date);
    renderWeek();
  }
  document.getElementById('bk-prev').addEventListener('click', function () { goToWeek(addDays(weekStart, -7)); });
  document.getElementById('bk-next').addEventListener('click', function () { goToWeek(addDays(weekStart, 7)); });
  document.getElementById('bk-today').addEventListener('click', function () { goToWeek(clinicNow().date); });

  // List / Calendar toggle (only visible below 1100px; both show side by side above).
  var viewToggle = document.querySelector('.bk-view-toggle');
  function setView(v) {
    el.shell.setAttribute('data-view', v);
    viewToggle.querySelectorAll('button').forEach(function (b) {
      var on = b.getAttribute('data-view') === v;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
    try { localStorage.setItem('bk-view', v); } catch (e) { /* storage unavailable */ }
  }
  viewToggle.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-view]');
    if (btn) setView(btn.getAttribute('data-view'));
  });
  try { if (localStorage.getItem('bk-view') === 'week') setView('week'); } catch (e) { /* default list */ }

  // ---------------------------------------------------------------- detail

  function openDetail(id, opts) {
    var b = byId[id];
    if (!b) return;
    selectedId = id;
    if (opts && opts.jumpWeek) goToWeek(b.appointment_date); else renderWeek();
    renderList();
    renderDetail(b);
    el.detail.classList.add('open');
    el.detail.setAttribute('aria-hidden', 'false');
    el.backdrop.hidden = false;
    requestAnimationFrame(function () { el.backdrop.classList.add('show'); });
    document.body.style.overflow = 'hidden';

    var url = new URL(location.href);
    url.searchParams.set('booking', id);
    history.replaceState({}, '', url.pathname + url.search);

    if (!b.viewed_at) {
      sb.rpc('mark_booking_viewed', { p_booking_id: id }).then(function (r) {
        if (!r.error) b.viewed_at = new Date().toISOString();
      });
    }
  }

  function closeDetail() {
    selectedId = null;
    el.detail.classList.remove('open');
    el.detail.setAttribute('aria-hidden', 'true');
    el.backdrop.classList.remove('show');
    setTimeout(function () { if (!selectedId) el.backdrop.hidden = true; }, 200);
    document.body.style.overflow = '';
    var url = new URL(location.href);
    url.searchParams.delete('booking');
    history.replaceState({}, '', url.pathname + url.search);
    renderList();
    renderWeek();
  }

  el.backdrop.addEventListener('click', closeDetail);
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!el.modal.hidden) closeModal();
    else if (selectedId) closeDetail();
  });

  function sessionLine(b, s) {
    var now = Date.now();
    switch (s) {
      case 'upcoming': return 'Starts in ' + relative(startMs(b) - now);
      case 'live': return 'Live now · ' + relative(endMs(b) - now) + ' left';
      case 'holding': return 'Waiting for payment — slot held until ' + fmtStamp(new Date(Date.parse(b.created_at) + HOLD_MINUTES * 60000).toISOString());
      case 'expired': return 'Checkout was abandoned — this time is free again';
      case 'cancelled':
      case 'refunded': return (s === 'refunded' ? 'Refunded' : 'Cancelled') + (b.cancelled_at ? ' on ' + fmtStamp(b.cancelled_at) : '');
      case 'completed': return 'Completed';
      case 'no_show': return 'Patient did not attend';
      default: return 'Ended ' + relative(now - endMs(b)) + ' ago — record the outcome below';
    }
  }

  function timeline(b) {
    var events = [
      { at: b.created_at, text: 'Booked online' + (b.site === 'drivanah' ? ' (drivanah.com)' : '') },
      { at: b.paid_at, text: Number(b.amount_cents) === 0 ? 'Confirmed (complimentary)' : 'Payment received · ' + fee(b) },
      { at: b.invite_sent_at, text: 'Meeting link emailed to patient' },
      { at: b.rescheduled_at, text: 'Rescheduled to ' + fmtShortDay(b.appointment_date) + ', ' + b.appointment_time },
      { at: b.reminder_sent_at, text: '20-minute reminders sent (patient + team)' },
      { at: b.attended_at, text: (b.attended_by_name || 'Staff') + ' joined the call' },
      { at: b.meeting_started_at, text: 'Video call started' },
      { at: b.meeting_ended_at, text: 'Video call closed', cls: 'muted' },
      { at: b.cancelled_at, text: (b.status === 'refunded' ? 'Cancelled and refunded' : 'Cancelled') + (b.cancel_reason ? ' — “' + b.cancel_reason + '”' : ''), cls: 'bad' }
    ].filter(function (e) { return e.at; }).sort(function (x, y) { return Date.parse(x.at) - Date.parse(y.at); });

    if (!events.length) return '<p class="bk-meta-line" style="margin:0;">No activity yet.</p>';
    return '<ul class="bk-timeline">' + events.map(function (e) {
      return '<li class="' + (e.cls || '') + '">' + esc(e.text) + '<span class="t-when">' + esc(fmtStamp(e.at)) + ' ET</span></li>';
    }).join('') + '</ul>';
  }

  function renderDetail(b) {
    var s = stateOf(b);
    var meta = STATES[s];
    var paidConfirmed = b.paid && b.status === 'confirmed';
    var ended = s === 'past' || s === 'completed' || s === 'no_show';
    var editable = (b.status === 'confirmed' && (s === 'upcoming' || s === 'live')) || s === 'holding';

    var join = '';
    if (canJoin(b)) {
      join = '<a class="btn btn-primary bk-join" href="video-call.html?booking_id=' + encodeURIComponent(b.id) + '" target="_blank" rel="noopener">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3z"/></svg>' +
        (s === 'live' ? 'Join now — patient may be waiting' : 'Join video call') + '</a>' +
        '<div class="bk-row-actions">' +
          '<button type="button" class="btn btn-secondary btn-sm" data-act="copy">Copy patient link</button>' +
          '<button type="button" class="btn btn-secondary btn-sm" data-act="resend">Re-send link email</button>' +
        '</div>';
    } else if (paidConfirmed && !b.meeting_token && !ended) {
      join = '<button type="button" class="btn btn-primary bk-join" data-act="create-link">Create meeting link &amp; email patient</button>';
    }

    var metaBits = [];
    if (b.invite_sent_at) metaBits.push('Link emailed ' + fmtStamp(b.invite_sent_at));
    if (b.reminder_sent_at) metaBits.push('Reminder sent ' + fmtStamp(b.reminder_sent_at));
    if (paidConfirmed && !b.invite_sent_at && b.meeting_token) metaBits.push('Link not emailed yet');

    var outcome = '';
    if (paidConfirmed && (ended || s === 'live')) {
      outcome =
        '<div class="bk-d-section"><p class="bk-d-title">Session outcome</p>' +
          '<div class="bk-outcome">' +
            '<button type="button" class="btn btn-secondary btn-sm' + (b.outcome === 'completed' ? ' on' : '') + '" data-act="outcome" data-value="completed">✓ Completed</button>' +
            '<button type="button" class="btn btn-secondary btn-sm ns' + (b.outcome === 'no_show' ? ' on' : '') + '" data-act="outcome" data-value="no_show">Patient no-show</button>' +
          '</div>' +
          (b.attended_by_name ? '<p class="bk-meta-line">Attended by <strong>' + esc(b.attended_by_name) + '</strong>' + (b.attended_at ? ' · joined ' + esc(fmtStamp(b.attended_at)) : '') + '</p>' : '') +
        '</div>';
    } else if (b.attended_by_name) {
      outcome = '<div class="bk-d-section"><p class="bk-d-title">Care team</p><p class="bk-meta-line" style="margin:0;">Attended by <strong>' + esc(b.attended_by_name) + '</strong></p></div>';
    }

    el.detail.innerHTML =
      '<div class="bk-d-head">' +
        '<span class="bk-avatar lg" style="background:' + avatarColor(b.full_name) + '">' + esc(initials(b.full_name)) + '</span>' +
        '<div class="who"><h2>' + esc(b.full_name) + '</h2><span class="badge ' + meta.badge + '"><span class="badge-dot"></span>' + esc(meta.label) + '</span></div>' +
        '<button type="button" class="bk-d-close" data-act="close" aria-label="Close details">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>' +
      '</div>' +

      '<div class="bk-d-section">' +
        '<div class="bk-session st-' + s + '">' +
          '<div class="s-day">' + esc(fmtLongDay(b.appointment_date)) + '</div>' +
          '<div class="s-time"><span>' + esc(timeRange(b)) + ' ET</span><span class="bk-chip">' + esc(durationLabel(b)) + '</span><span class="bk-chip">Video call</span></div>' +
          '<div class="s-count" id="bk-countdown">' + esc(sessionLine(b, s)) + '</div>' +
          join +
          (metaBits.length ? '<p class="bk-meta-line">' + esc(metaBits.join(' · ')) + '</p>' : '') +
        '</div>' +
      '</div>' +

      '<div class="bk-d-section"><p class="bk-d-title">Patient</p>' +
        '<dl class="bk-kv">' +
          '<dt>Email</dt><dd><a href="mailto:' + esc(b.email) + '">' + esc(b.email) + '</a></dd>' +
          '<dt>Phone</dt><dd><a href="tel:' + esc(b.phone) + '">' + esc(b.phone) + '</a></dd>' +
          '<dt>Booked</dt><dd>' + esc(fmtStamp(b.created_at)) + ' ET</dd>' +
          '<dt>Fee</dt><dd>' + esc(fee(b)) + (b.paid ? ' · <span style="color:var(--green);font-weight:600;">Paid</span>' : ' · Unpaid') +
            (b.stripe_payment_intent_id ? ' · <a href="order-detail.html?id=' + encodeURIComponent(b.id) + '&type=booking">Payment details</a>' : '') + '</dd>' +
          '<dt>Website</dt><dd>' + (b.site === 'drivanah' ? 'drivanah.com' : 'clinipausemd.com') + '</dd>' +
        '</dl>' +
      '</div>' +

      '<div class="bk-d-section"><p class="bk-d-title">Reason for visit</p><div class="bk-reason">' + esc(b.reason || 'General wellness consultation') + '</div></div>' +

      outcome +

      '<div class="bk-d-section bk-notes"><p class="bk-d-title">Internal notes</p>' +
        '<textarea class="form-control" id="bk-notes" maxlength="4000" placeholder="Visible to staff only — prep notes, follow-ups, anything the team should know.">' + esc(b.admin_notes || '') + '</textarea>' +
        '<div class="bk-notes-foot"><span id="bk-notes-status">Only staff can see these notes.</span>' +
          '<button type="button" class="btn btn-secondary btn-sm" data-act="save-notes">Save notes</button></div>' +
      '</div>' +

      '<div class="bk-d-section"><p class="bk-d-title">Activity</p>' + timeline(b) + '</div>' +

      (editable
        ? '<div class="bk-d-footer">' +
            '<button type="button" class="btn btn-secondary" data-act="reschedule">Reschedule</button>' +
            '<button type="button" class="btn btn-danger" data-act="cancel">Cancel booking</button>' +
          '</div>'
        : (paidConfirmed && (s === 'no_show' || s === 'past')
          ? '<div class="bk-d-footer"><button type="button" class="btn btn-secondary" data-act="reschedule">Reschedule (missed session)</button></div>'
          : ''));
  }

  el.detail.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn || !selectedId) return;
    var b = byId[selectedId];
    var act = btn.getAttribute('data-act');
    if (act === 'close') closeDetail();
    else if (act === 'copy') copyLink(b);
    else if (act === 'resend') runAction(btn, 'send_invite', {}, 'Meeting link re-sent to ' + b.email);
    else if (act === 'create-link') runAction(btn, 'send_invite', {}, 'Meeting link created and emailed to ' + b.email);
    else if (act === 'save-notes') saveNotes(btn, b);
    else if (act === 'outcome') setOutcome(b, btn.getAttribute('data-value'));
    else if (act === 'reschedule') openReschedule(b);
    else if (act === 'cancel') openCancel(b);
  });

  // ---------------------------------------------------------------- actions

  function toast(message, isError) {
    el.toast.textContent = message;
    el.toast.classList.toggle('error', !!isError);
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove('show'); }, isError ? 6000 : 3500);
  }

  function callAction(action, bookingId, payload) {
    return sb.auth.getSession().then(function (r) {
      var token = r.data && r.data.session && r.data.session.access_token;
      if (!token) throw new Error('Your session has expired. Please reload the page and sign in again.');
      return fetch(ACTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(Object.assign({ action: action, booking_id: bookingId }, payload || {}))
      });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) throw new Error(body.error || 'That didn’t work. Please try again.');
        return body;
      });
    });
  }

  function runAction(btn, action, payload, successMsg) {
    var label = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = 'Working…';
    return callAction(action, selectedId, payload).then(function () {
      toast(successMsg);
      return load();
    }).catch(function (err) {
      toast(err.message, true);
    }).finally(function () {
      if (document.body.contains(btn)) { btn.disabled = false; btn.innerHTML = label; }
    });
  }

  function copyLink(b) {
    var link = patientLink(b);
    var done = function () { toast('Patient link copied — share it only with ' + b.full_name.split(' ')[0] + '.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(done).catch(function () { window.prompt('Copy the patient link:', link); });
    } else {
      window.prompt('Copy the patient link:', link);
    }
  }

  function logAction(action, bookingId, metadata) {
    sb.rpc('log_admin_action', { p_action: action, p_target: 'booking:' + bookingId, p_metadata: metadata || null }).then(function () {});
  }

  function saveNotes(btn, b) {
    var value = document.getElementById('bk-notes').value.trim();
    var statusEl = document.getElementById('bk-notes-status');
    btn.disabled = true;
    sb.from('store_bookings').update({ admin_notes: value || null }).eq('id', b.id).select('id').then(function (res) {
      btn.disabled = false;
      if (res.error || !res.data || !res.data.length) {
        statusEl.textContent = 'Couldn’t save — please reload and try again.';
        return;
      }
      b.admin_notes = value || null;
      statusEl.textContent = 'Saved ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      logAction('booking.notes', b.id, null);
    });
  }

  function setOutcome(b, value) {
    var next = b.outcome === value ? null : value;
    sb.from('store_bookings').update({ outcome: next }).eq('id', b.id).select('id').then(function (res) {
      if (res.error || !res.data || !res.data.length) { toast('Couldn’t update the outcome. Please reload and try again.', true); return; }
      b.outcome = next;
      logAction('booking.outcome', b.id, { outcome: next });
      toast(next ? (next === 'completed' ? 'Marked as completed' : 'Marked as no-show') : 'Outcome cleared');
      renderAll();
      renderDetail(b);
    });
  }

  // ---------------------------------------------------------------- modals

  function openModal(html) {
    el.modalBox.innerHTML = html;
    el.modal.hidden = false;
    var first = el.modalBox.querySelector('input, select, textarea, button');
    if (first) first.focus();
  }
  function closeModal() {
    el.modal.hidden = true;
    el.modalBox.innerHTML = '';
  }
  el.modal.addEventListener('click', function (e) {
    if (e.target === el.modal || e.target.closest('[data-modal-close]')) closeModal();
  });
  function modalError(message) {
    var box = el.modalBox.querySelector('.bk-modal-error');
    box.textContent = message;
    box.classList.add('show');
  }

  function busyOn(date, minutes, length, excludeId) {
    return bookings.some(function (o) {
      if (o.id === excludeId || o.appointment_date !== date) return false;
      var s = stateOf(o);
      if (!(s === 'upcoming' || s === 'live' || s === 'holding')) return false;
      var os = slotMinutes(o.appointment_time);
      return minutes < os + duration(o) && os < minutes + length;
    });
  }

  function openReschedule(b) {
    var today = clinicNow().date;
    var initialDate = b.appointment_date >= today ? b.appointment_date : today;
    openModal(
      '<h3 id="bk-modal-title">Reschedule consultation</h3>' +
      '<p class="sub">' + esc(b.full_name) + ' · currently ' + esc(fmtShortDay(b.appointment_date)) + ', ' + esc(timeRange(b)) + ' ET (' + esc(durationLabel(b)) + ')</p>' +
      '<div class="grid-2">' +
        '<div class="form-field"><label for="rs-date">New date</label><input type="date" class="form-control" id="rs-date" min="' + today + '" value="' + initialDate + '"></div>' +
        '<div class="form-field"><label for="rs-time">New time (ET)</label><select class="form-control" id="rs-time"></select></div>' +
      '</div>' +
      (b.paid ? '<label class="bk-check"><input type="checkbox" id="rs-notify" checked>Email ' + esc(b.full_name.split(' ')[0]) + ' the new time with an updated calendar invite (their link stays the same)</label>' : '') +
      '<p class="bk-modal-error"></p>' +
      '<div class="bk-modal-actions">' +
        '<button type="button" class="btn btn-secondary" data-modal-close>Keep current time</button>' +
        '<button type="button" class="btn btn-primary" id="rs-save">Reschedule</button>' +
      '</div>'
    );

    var dateInput = document.getElementById('rs-date');
    var timeSelect = document.getElementById('rs-time');
    function fillTimes() {
      var date = dateInput.value;
      var now = clinicNow();
      var options = '';
      for (var m = 7 * 60; m + duration(b) <= 20 * 60; m += 30) {
        var label = minutesToLabel(m);
        var past = date === now.date && m <= now.minutes;
        var busy = busyOn(date, m, duration(b), b.id);
        var weekday = dow(date) !== 0 && dow(date) !== 6;
        var usual = weekday && ((m >= 540 && m + duration(b) <= 720) || (m >= 780 && m + duration(b) <= 990));
        var selected = date === b.appointment_date && label === b.appointment_time;
        options += '<option value="' + label + '"' + (past || busy ? ' disabled' : '') + (selected ? ' selected' : '') + '>' +
          label + (busy ? ' — booked' : (past ? ' — passed' : (usual ? '' : ' — outside usual hours'))) + '</option>';
      }
      timeSelect.innerHTML = options;
      if (timeSelect.selectedOptions[0] && timeSelect.selectedOptions[0].disabled) {
        var firstFree = timeSelect.querySelector('option:not([disabled])');
        if (firstFree) firstFree.selected = true;
      }
    }
    dateInput.addEventListener('change', fillTimes);
    fillTimes();

    document.getElementById('rs-save').addEventListener('click', function () {
      var btn = this;
      var date = dateInput.value;
      var time = timeSelect.value;
      if (!date || !time) { modalError('Choose a new date and time.'); return; }
      if (date === b.appointment_date && time === b.appointment_time) { modalError('That’s the current time — choose a different one.'); return; }
      var notifyBox = document.getElementById('rs-notify');
      var notify = notifyBox ? notifyBox.checked : false;
      btn.disabled = true;
      btn.textContent = 'Rescheduling…';
      callAction('reschedule', b.id, { date: date, time: time, notify: notify }).then(function (r) {
        closeModal();
        toast('Moved to ' + fmtShortDay(date) + ', ' + time + (r.emailed ? ' — patient emailed' : ''));
        return load();
      }).catch(function (err) {
        btn.disabled = false;
        btn.textContent = 'Reschedule';
        modalError(err.message);
      });
    });
  }

  function openCancel(b) {
    var canRefund = b.paid && Number(b.amount_cents) > 0 && !!b.stripe_payment_intent_id;
    openModal(
      '<h3 id="bk-modal-title">Cancel this consultation?</h3>' +
      '<p class="sub">' + esc(b.full_name) + ' · ' + esc(fmtShortDay(b.appointment_date)) + ', ' + esc(timeRange(b)) + ' ET. The time slot will open up for other patients and the video link will stop working.</p>' +
      '<div class="form-field"><label for="cx-reason">Message to the patient (optional)</label>' +
        '<textarea class="form-control" id="cx-reason" maxlength="500" placeholder="e.g. Dr. Thomas is unavailable that day — we’d love to find you a new time."></textarea></div>' +
      (canRefund ? '<label class="bk-check"><input type="checkbox" id="cx-refund">Refund ' + esc(fee(b)) + ' to the patient’s card through Stripe</label>' : '') +
      (b.paid ? '<label class="bk-check"><input type="checkbox" id="cx-notify" checked>Email the patient that it’s cancelled (with a link to book a new time)</label>' : '') +
      '<p class="bk-modal-error"></p>' +
      '<div class="bk-modal-actions">' +
        '<button type="button" class="btn btn-secondary" data-modal-close>Keep booking</button>' +
        '<button type="button" class="btn btn-danger-solid" id="cx-confirm">Cancel booking</button>' +
      '</div>'
    );

    document.getElementById('cx-confirm').addEventListener('click', function () {
      var btn = this;
      var refundBox = document.getElementById('cx-refund');
      var notifyBox = document.getElementById('cx-notify');
      var refund = refundBox ? refundBox.checked : false;
      if (refund && !window.confirm('Refund ' + fee(b) + ' to ' + b.full_name + '? This can’t be undone.')) return;
      btn.disabled = true;
      btn.textContent = 'Cancelling…';
      callAction('cancel', b.id, {
        reason: document.getElementById('cx-reason').value.trim(),
        refund: refund,
        notify: notifyBox ? notifyBox.checked : false
      }).then(function (r) {
        closeModal();
        toast('Booking cancelled' + (r.refunded ? ' and refunded' : '') + (r.emailed ? ' — patient emailed' : ''));
        return load();
      }).catch(function (err) {
        btn.disabled = false;
        btn.textContent = 'Cancel booking';
        modalError(err.message);
      });
    });
  }

  function openClosedDays() {
    var today = clinicNow().date;
    function listHtml() {
      var upcoming = closedDays.filter(function (c) { return c.blocked_date >= today; });
      if (!upcoming.length) return '<li><span class="text-muted">No closed days coming up.</span></li>';
      return upcoming.map(function (c) {
        return '<li><span>' + esc(fmtLongDay(c.blocked_date)) + (c.reason ? '<small>' + esc(c.reason) + '</small>' : '') + '</span>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-unblock="' + c.blocked_date + '">Reopen</button></li>';
      }).join('');
    }
    openModal(
      '<h3 id="bk-modal-title">Closed days</h3>' +
      '<p class="sub">Patients can’t book consultations on these days. Existing bookings on a closed day are not cancelled automatically.</p>' +
      '<div class="grid-2">' +
        '<div class="form-field"><label for="cd-date">Date</label><input type="date" class="form-control" id="cd-date" min="' + today + '"></div>' +
        '<div class="form-field"><label for="cd-reason">Reason (staff only)</label><input type="text" class="form-control" id="cd-reason" maxlength="120" placeholder="e.g. Public holiday"></div>' +
      '</div>' +
      '<p class="bk-modal-error"></p>' +
      '<div class="bk-modal-actions" style="margin-top:0;">' +
        '<button type="button" class="btn btn-secondary" data-modal-close>Done</button>' +
        '<button type="button" class="btn btn-primary" id="cd-add">Close this day</button>' +
      '</div>' +
      '<ul class="bk-closed-list" id="cd-list">' + listHtml() + '</ul>'
    );

    document.getElementById('cd-add').addEventListener('click', function () {
      var btn = this;
      var date = document.getElementById('cd-date').value;
      var reason = document.getElementById('cd-reason').value.trim();
      if (!date) { modalError('Choose a date to close.'); return; }
      var existing = bookings.filter(function (o) { return o.appointment_date === date && isActive(stateOf(o)); }).length;
      if (existing && !window.confirm(existing + ' consultation' + (existing === 1 ? ' is' : 's are') + ' already booked on that day. Close it to new bookings anyway? (Existing bookings stay as they are.)')) return;
      btn.disabled = true;
      sb.from('booking_blocked_dates').insert({ blocked_date: date, reason: reason || null, created_by: (window.CURRENT_ADMIN && window.CURRENT_ADMIN.email) || null }).then(function (res) {
        btn.disabled = false;
        if (res.error) {
          modalError(/duplicate|unique/i.test(res.error.message) ? 'That day is already closed.' : res.error.message);
          return;
        }
        logAction('booking.close_day', date, { reason: reason || null });
        return load().then(function () {
          document.getElementById('cd-list').innerHTML = listHtml();
          document.getElementById('cd-date').value = '';
          document.getElementById('cd-reason').value = '';
          toast(fmtShortDay(date) + ' is now closed to new bookings');
        });
      });
    });

    document.getElementById('cd-list').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-unblock]');
      if (!btn) return;
      var date = btn.getAttribute('data-unblock');
      btn.disabled = true;
      sb.from('booking_blocked_dates').delete().eq('blocked_date', date).select('blocked_date').then(function (res) {
        if (res.error || !res.data || !res.data.length) { btn.disabled = false; modalError('Couldn’t reopen that day. Please try again.'); return; }
        logAction('booking.reopen_day', date, null);
        return load().then(function () {
          document.getElementById('cd-list').innerHTML = listHtml();
          toast(fmtShortDay(date) + ' is open for bookings again');
        });
      });
    });
  }

  document.getElementById('bk-block-btn').addEventListener('click', openClosedDays);
  document.getElementById('bk-refresh').addEventListener('click', function () {
    load().then(function () { toast('Up to date'); });
  });

  // ---------------------------------------------------------------- live updates

  function liveTick() {
    renderKpis();
    renderCounts();
    renderWeek();
    if (selectedId && byId[selectedId]) {
      var line = document.getElementById('bk-countdown');
      var b = byId[selectedId];
      if (line) line.textContent = sessionLine(b, stateOf(b));
    }
  }

  var reloadTimer = null;
  function scheduleReload() {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(load, 500);
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
    weekStart = mondayOf(clinicNow().date);
    load();
    sb.channel('admin-consultations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_bookings' }, scheduleReload)
      .subscribe();
    setInterval(liveTick, 30000);
    setInterval(load, 120000);
  });
})();
