// Public, safe-by-design (RLS-protected) — not a secret.
var SUPABASE_URL = 'https://ellilwezvzvdftgbpabt.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsbGlsd2V6dnp2ZGZ0Z2JwYWJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5OTU5MzYsImV4cCI6MjEwMjU3MTkzNn0.jW3q1LsVKkQrETrL-KkeIhbxLgFI0HIao466orETCwk';
var STOREFRONT_SITE = 'clinipausemd';

function supabaseRpc(fnName, args) {
  return fetch(SUPABASE_URL + '/rest/v1/rpc/' + fnName, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + SUPABASE_ANON_KEY
    },
    body: JSON.stringify(args || {})
  }).then(function (res) {
    return res.text().then(function (text) {
      var data = null;
      try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
      if (!res.ok) throw new Error((data && (data.message || data.hint)) || 'Request failed');
      return data;
    });
  });
}

function supabaseSelect(table, query) {
  return fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + query, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY }
  }).then(function (res) { return res.json(); });
}

function startCheckout(payload) {
  var st = window.SITE_SETTINGS || {};
  if (payload && payload.kind === 'order' && st.shop_enabled === false) {
    return Promise.reject(new Error('Our shop is temporarily closed for orders. Please check back soon.'));
  }
  if (payload && payload.kind === 'booking' && st.booking_enabled === false) {
    return Promise.reject(new Error('Online booking is paused right now. Please email info@clinipause.com to arrange a consultation.'));
  }
  return fetch('/api/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ site: STOREFRONT_SITE, origin: window.location.origin }, payload))
  }).then(function (res) {
    return res.json().then(function (data) {
      if (!res.ok) throw new Error(data.error || 'Unable to start checkout');
      return data;
    });
  });
}

document.addEventListener('DOMContentLoaded', function () {
  // Mobile nav toggle
  var toggle = document.querySelector('.nav-toggle');
  var links = document.querySelector('.nav-links');
  var navOverlay = document.querySelector('.nav-overlay');
  function closeNav() {
    if (links) links.classList.remove('open');
    if (navOverlay) navOverlay.classList.remove('open');
    if (toggle) toggle.classList.remove('open');
    document.body.classList.remove('nav-open');
  }
  function openNav() {
    if (links) links.classList.add('open');
    if (navOverlay) navOverlay.classList.add('open');
    if (toggle) toggle.classList.add('open');
    document.body.classList.add('nav-open');
  }
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      if (links.classList.contains('open')) closeNav(); else openNav();
    });
    document.querySelectorAll('[data-nav-close]').forEach(function (el) {
      el.addEventListener('click', closeNav);
    });
    links.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', closeNav);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeNav();
    });
  }

  // FAQ accordion
  document.querySelectorAll('.faq-item').forEach(function (item) {
    var question = item.querySelector('.faq-question');
    if (!question) return;
    question.addEventListener('click', function () {
      var wasOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(function (i) {
        i.classList.remove('open');
      });
      if (!wasOpen) item.classList.add('open');
    });
  });

  initSiteSettings();
  initCart();
  initBookingModal();
  initShopProducts();
  initHomeProductsTeaser();
  showPaymentReturnBanner();
  initContactModal();
  initLiveChat();
  initHeroEntrance();
  initScrollReveal();
  initParallax();
  initHeroVideo();
  initNewsletterPopup();
});

/* =========================================================
   Hero entrance animation — the first thing a visitor sees
   fades/slides up in a quick stagger the moment the page loads.
   ========================================================= */
/* =========================================================
   Site settings the team controls from the dashboard: an
   announcement bar, and switches that pause online booking,
   shop checkout or the chat assistant.
   ========================================================= */
function initSiteSettings() {
  supabaseRpc('get_public_site_settings', {}).then(function (st) {
    st = st || {};
    window.SITE_SETTINGS = st;

    var ann = st.announcement || {};
    if (ann.enabled && ann.text) {
      var bar = document.createElement('div');
      bar.className = 'site-announcement';
      bar.setAttribute('role', 'status');
      bar.textContent = ann.text;
      document.body.insertBefore(bar, document.body.firstChild);
    }

    if (st.chat_enabled === false) {
      ['chat-bubble', 'chat-panel'].forEach(function (id) { var n = document.getElementById(id); if (n) n.remove(); });
    }

    if (st.booking_enabled === false) {
      document.addEventListener('click', function (e) {
        if (!e.target.closest('[data-book-open]')) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        alert('Online booking is paused right now. Please email info@clinipause.com and our team will arrange your consultation.');
      }, true);
      var overlay = document.querySelector('.booking-overlay.open');
      if (overlay) overlay.classList.remove('open');
    }
  }).catch(function () { /* settings are optional; the site works with defaults */ });
}

function initHeroEntrance() {
  var groups = [
    document.querySelectorAll('.home-hero-copy > *'),
    document.querySelectorAll('.page-hero-content > *'),
    document.querySelectorAll('.home-hero-video')
  ];

  groups.forEach(function (nodeList) {
    Array.prototype.forEach.call(nodeList, function (el, i) {
      el.classList.add('hero-fade-up');
      el.style.animationDelay = (i * 0.1) + 's';
    });
  });

  var heroImage = document.querySelector('.page-hero-image');
  if (heroImage) {
    heroImage.classList.add('hero-fade-up');
    heroImage.style.animationDelay = '0.15s';
  }
}

/* =========================================================
   Scroll reveal — sections/cards fade up into place as they
   enter the viewport. Falls back to fully visible content if
   IntersectionObserver isn't available.
   ========================================================= */
function initScrollReveal() {
  var selectors = [
    '.section-head', '.service-card', '.approach-card', '.topic-card',
    '.product-card', '.split-copy', '.split-image', '.feature-banner-image',
    '.faq-item', '.bundle-strip', '.footer-col', '.footer-brand',
    '.eyebrow', '.leaf-motif', '.app-badges'
  ];
  var targets = document.querySelectorAll(selectors.join(','));
  if (!targets.length) return;

  if (!('IntersectionObserver' in window)) {
    targets.forEach(function (el) { el.setAttribute('data-reveal', ''); el.classList.add('revealed'); });
    return;
  }

  document.documentElement.classList.add('js-reveal-ready');
  targets.forEach(function (el) { el.setAttribute('data-reveal', ''); });

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry, i) {
      if (entry.isIntersecting) {
        var delay = (i % 3) * 0.08;
        entry.target.style.transitionDelay = delay + 's';
        entry.target.classList.add('revealed');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  targets.forEach(function (el) { observer.observe(el); });
}

/* =========================================================
   Subtle parallax — hero/feature images drift slightly as the
   page scrolls, for a livelier feel. Skipped entirely when the
   visitor prefers reduced motion.
   ========================================================= */
function initParallax() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var layers = document.querySelectorAll('[data-parallax]');
  if (!layers.length) return;

  var ticking = false;
  function update() {
    var vh = window.innerHeight;
    layers.forEach(function (el) {
      var rect = el.getBoundingClientRect();
      var center = rect.top + rect.height / 2;
      var offset = ((center - vh / 2) / vh) * -18;
      el.style.transform = 'translateY(' + offset.toFixed(1) + 'px)';
    });
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
  update();
}

/* =========================================================
   Payment return banner — Stripe redirects back with
   ?paid=1 or ?canceled=1. The row is only ever marked paid
   by the Stripe webhook server-side, so this is just a
   friendly acknowledgement, not the source of truth.
   ========================================================= */
function showPaymentReturnBanner() {
  var params = new URLSearchParams(window.location.search);
  if (!params.has('paid') && !params.has('canceled') && !params.has('booked')) return;

  var overlay = document.createElement('div');
  overlay.className = 'booking-overlay open';
  var booked = params.has('booked');
  var paid = params.has('paid') || booked;

  var title = booked ? "You're Booked!" : (paid ? 'Payment Successful!' : 'Checkout Canceled');
  var message = booked
    ? "Your consultation is confirmed. We've emailed you a confirmation with a calendar invite and your personal video link — if you don't see it in a few minutes, please check your spam folder."
    : (paid
      ? "Thank you — your order is confirmed. A receipt has been sent to your email, and we'll be in touch with any next steps."
      : 'No payment was taken, and your time slot has been released. You can pick up where you left off any time.');

  overlay.innerHTML =
    '<div class="booking-modal" role="dialog" aria-modal="true">' +
      '<button type="button" class="booking-close" aria-label="Close">&times;</button>' +
      '<div class="success-modal-body">' +
        '<div class="checkmark">' + (paid ? '&check;' : '&times;') + '</div>' +
        '<h3 class="booking-title">' + title + '</h3>' +
        '<p class="booking-sub">' + message + '</p>' +
        '<button type="button" class="btn btn-primary" id="payment-return-done" style="margin-top:10px;">Done</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  function close() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    overlay.remove();
  }
  overlay.querySelector('.booking-close').addEventListener('click', close);
  overlay.querySelector('#payment-return-done').addEventListener('click', close);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

  if (paid && window.CliniCart) window.CliniCart.clear();

  var url = new URL(window.location.href);
  url.searchParams.delete('paid');
  url.searchParams.delete('canceled');
  url.searchParams.delete('booked');
  url.searchParams.delete('booking');
  window.history.replaceState({}, '', url.pathname + url.search);
}

/* =========================================================
   Booking Modal — Details -> Length, Date & Time -> Confirm & Pay
   Every rule (weekdays, valid slots, a full hour fitting for 60-minute
   sessions, 1 hour minimum notice, closed days, overlaps, price) is
   enforced again by create_consultation_booking in the database — what
   the modal shows is a convenience, never the source of truth. Paid
   bookings are only confirmed by the Stripe webhook; $0.00 sessions are
   confirmed server-side without Stripe.
   ========================================================= */
var CLINIC_TZ = 'America/New_York';
var BOOKING_MIN_NOTICE_MINUTES = 60;
var BOOKING_TIME_SLOTS = ['9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM', '3:00 PM', '3:30 PM', '4:00 PM'];

function slotMinutes(label) {
  var m = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(label);
  var h = parseInt(m[1], 10) % 12 + (m[3] === 'PM' ? 12 : 0);
  return h * 60 + parseInt(m[2], 10);
}

function minutesToLabel(total) {
  var h = Math.floor(total / 60), mm = total % 60;
  return ((h % 12) || 12) + ':' + String(mm).padStart(2, '0') + ' ' + (h >= 12 ? 'PM' : 'AM');
}

function clinicWallClock(date) {
  var parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CLINIC_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  var get = function (type) { return (parts.find(function (p) { return p.type === type; }) || {}).value; };
  return {
    date: get('year') + '-' + get('month') + '-' + get('day'),
    minutes: parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10),
    utcMs: Date.UTC(+get('year'), +get('month') - 1, +get('day'), +get('hour'), +get('minute'))
  };
}

// Clinic wall-clock date + slot label -> the real instant (DST-safe).
function clinicSlotToDate(dateStr, label) {
  var p = dateStr.split('-').map(Number);
  var mins = slotMinutes(label);
  var target = Date.UTC(p[0], p[1] - 1, p[2], Math.floor(mins / 60), mins % 60);
  var guess = target;
  for (var i = 0; i < 2; i++) guess = target - (clinicWallClock(new Date(guess)).utcMs - guess);
  return new Date(guess);
}

function visitorIsInClinicTz() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone === CLINIC_TZ; } catch (e) { return true; }
}

function initBookingModal() {
  var triggers = document.querySelectorAll('[data-book-open]');
  if (!triggers.length) return;

  // Prices come live from the two consultation products in the admin
  // dashboard; null means "still loading".
  var prices = { 30: null, 60: null };
  supabaseSelect('store_products', 'select=slug,price_cents&slug=in.(video-consultation,video-consultation-60)')
    .then(function (rows) {
      (rows || []).forEach(function (r) {
        if (r.slug === 'video-consultation') prices[30] = r.price_cents;
        if (r.slug === 'video-consultation-60') prices[60] = r.price_cents;
      });
      if (document.getElementById('booking-durations')) renderDurations();
    })
    .catch(function () { /* cards show "See price at checkout" */ });

  var blockedByMonth = {};
  var state;
  var monthCursor;

  var overlay = document.createElement('div');
  overlay.className = 'booking-overlay';
  overlay.id = 'book-consultation';
  overlay.innerHTML =
    '<div class="booking-modal" role="dialog" aria-modal="true" aria-labelledby="booking-title">' +
      '<button type="button" class="booking-close" data-book-close aria-label="Close">&times;</button>' +
      '<div class="booking-steps"><span class="s1"></span><span class="s2"></span><span class="s3"></span></div>' +
      '<div class="booking-panels"></div>' +
    '</div>';
  document.body.appendChild(overlay);

  var panels = overlay.querySelector('.booking-panels');
  var stepEls = overlay.querySelectorAll('.booking-steps span');

  function setActiveStep(n) {
    stepEls.forEach(function (el, i) { el.classList.toggle('active', i < n); });
    overlay.querySelector('.booking-modal').scrollIntoView({ block: 'start' });
  }

  function open() {
    state = { duration: 30, date: null, time: null, takenSlots: [], details: null };
    monthCursor = new Date();
    monthCursor.setDate(1);
    renderStep1();
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  triggers.forEach(function (t) {
    t.addEventListener('click', function (e) {
      e.preventDefault();
      open();
    });
  });

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay || e.target.hasAttribute('data-book-close')) close();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay.classList.contains('open')) close();
  });

  function priceLabel(duration) {
    var cents = prices[duration];
    if (cents == null) return '';
    return cents === 0 ? 'Complimentary' : money(cents);
  }

  /* ---------- Step 1: Your details ---------- */
  var REASONS = ['Perimenopause / Menopause symptoms', 'Hormone therapy', 'Weight management',
    'Peptides', 'Aesthetics', 'General wellness consultation'];

  function renderStep1() {
    setActiveStep(1);
    var prefill = state.details || {};
    panels.innerHTML =
      '<p class="booking-eyebrow">Step 1 of 3</p>' +
      '<h3 class="booking-title" id="booking-title">Book a Consultation</h3>' +
      '<p class="booking-sub">Tell us a bit about you so Dr. Thomas\' team can prepare for your visit.</p>' +
      '<form id="booking-form-1" novalidate>' +
        '<div class="booking-row-2">' +
          '<div class="booking-field"><label for="bk-name">Full name</label><input id="bk-name" type="text" name="name" autocomplete="name" maxlength="200" required value="' + escapeHtml(prefill.name || '') + '"></div>' +
          '<div class="booking-field"><label for="bk-phone">Phone</label><input id="bk-phone" type="tel" name="phone" autocomplete="tel" maxlength="40" required value="' + escapeHtml(prefill.phone || '') + '"></div>' +
        '</div>' +
        '<div class="booking-field"><label for="bk-email">Email</label><input id="bk-email" type="email" name="email" autocomplete="email" maxlength="254" required value="' + escapeHtml(prefill.email || '') + '"></div>' +
        '<div class="booking-field"><label for="bk-reason">What would you like to discuss?</label>' +
          '<select id="bk-reason" name="reason">' +
            REASONS.map(function (r) {
              return '<option' + (prefill.reason === r ? ' selected' : '') + '>' + escapeHtml(r) + '</option>';
            }).join('') +
          '</select>' +
        '</div>' +
        '<p class="booking-error" id="booking-error-1">Please fill in your name, a valid email, and your phone number.</p>' +
        '<div class="booking-actions" style="justify-content:flex-end;">' +
          '<button type="submit" class="btn btn-primary">Continue</button>' +
        '</div>' +
      '</form>';

    document.getElementById('booking-form-1').addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var details = {
        name: (fd.get('name') || '').trim(),
        email: (fd.get('email') || '').trim(),
        phone: (fd.get('phone') || '').trim(),
        reason: fd.get('reason')
      };
      if (!details.name || !details.phone || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(details.email)) {
        document.getElementById('booking-error-1').classList.add('show');
        return;
      }
      state.details = details;
      renderStep2();
    });
  }

  /* ---------- Step 2: Length, date + time ---------- */
  function renderStep2() {
    setActiveStep(2);
    panels.innerHTML =
      '<p class="booking-eyebrow">Step 2 of 3</p>' +
      '<h3 class="booking-title" id="booking-title">Choose Your Session</h3>' +
      '<p class="booking-sub">Pick a length, then a day and time that suits you.</p>' +
      '<span class="booking-section-label">Session length</span>' +
      '<div class="booking-durations" id="booking-durations" role="radiogroup" aria-label="Session length"></div>' +
      '<span class="booking-section-label">Date</span>' +
      '<div class="booking-calendar-head">' +
        '<button type="button" id="cal-prev" aria-label="Previous month">&lsaquo;</button>' +
        '<span id="cal-label"></span>' +
        '<button type="button" id="cal-next" aria-label="Next month">&rsaquo;</button>' +
      '</div>' +
      '<div class="booking-calendar-grid" id="cal-grid"></div>' +
      '<div id="slot-wrap" style="display:none;">' +
        '<span class="booking-section-label">Available times <span class="booking-tz">Eastern Time (ET)</span></span>' +
        '<div class="booking-slots" id="slot-grid"></div>' +
        '<p class="booking-local-time" id="slot-local"></p>' +
      '</div>' +
      '<p class="booking-error" id="booking-error-2">Please choose a date and a time.</p>' +
      '<div class="booking-actions">' +
        '<button type="button" class="booking-back" id="step2-back">&larr; Back</button>' +
        '<button type="button" class="btn btn-primary" id="step2-continue">Continue</button>' +
      '</div>';

    document.getElementById('step2-back').addEventListener('click', renderStep1);
    document.getElementById('cal-prev').addEventListener('click', function () {
      monthCursor.setMonth(monthCursor.getMonth() - 1);
      renderCalendar();
    });
    document.getElementById('cal-next').addEventListener('click', function () {
      monthCursor.setMonth(monthCursor.getMonth() + 1);
      renderCalendar();
    });
    document.getElementById('step2-continue').addEventListener('click', function () {
      if (!state.date || !state.time) {
        document.getElementById('booking-error-2').classList.add('show');
        return;
      }
      renderStep3();
    });

    renderDurations();
    renderCalendar();
    if (state.date) loadSlotsForDate(state.date);
  }

  function renderDurations() {
    var wrap = document.getElementById('booking-durations');
    if (!wrap) return;
    var options = [
      { minutes: 30, title: '30 minutes', desc: 'Focused visit for one main concern or a follow-up.' },
      { minutes: 60, title: '1 hour', desc: 'In-depth review of symptoms, history, and a full plan.' }
    ];
    wrap.innerHTML = options.map(function (o) {
      var selected = state.duration === o.minutes;
      var price = priceLabel(o.minutes);
      return '<button type="button" class="booking-duration' + (selected ? ' selected' : '') + '" role="radio" aria-checked="' + selected + '" data-duration="' + o.minutes + '">' +
        '<span class="d-length">' + o.title + '</span>' +
        '<span class="d-price">' + (price || '&nbsp;') + '</span>' +
        '<span class="d-desc">' + o.desc + '</span>' +
      '</button>';
    }).join('');

    wrap.querySelectorAll('[data-duration]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = parseInt(btn.getAttribute('data-duration'), 10);
        if (next === state.duration) return;
        state.duration = next;
        renderDurations();
        if (state.date) renderSlots();
      });
    });
  }

  function toDateStr(y, m, d) {
    return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  function monthKey(y, m) { return y + '-' + m; }

  function loadBlockedDates(y, m) {
    var key = monthKey(y, m);
    if (blockedByMonth[key]) return Promise.resolve(blockedByMonth[key]);
    var from = toDateStr(y, m, 1);
    var to = toDateStr(y, m, new Date(y, m + 1, 0).getDate());
    return supabaseRpc('list_blocked_dates', { p_from: from, p_to: to })
      .then(function (rows) {
        blockedByMonth[key] = (rows || []).map(function (r) { return r.blocked_date || r; });
        return blockedByMonth[key];
      })
      .catch(function () { return []; });
  }

  function renderCalendar() {
    var y = monthCursor.getFullYear(), m = monthCursor.getMonth();
    var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    document.getElementById('cal-label').textContent = monthNames[m] + ' ' + y;

    var clinicToday = clinicWallClock(new Date()).date;
    var todayParts = clinicToday.split('-').map(Number);
    document.getElementById('cal-prev').disabled = (y < todayParts[0]) || (y === todayParts[0] && m <= todayParts[1] - 1);

    var blocked = blockedByMonth[monthKey(y, m)] || [];
    var grid = document.getElementById('cal-grid');
    var html = '';
    ['S','M','T','W','T','F','S'].forEach(function (d) { html += '<div class="dow">' + d + '</div>'; });

    var firstDay = new Date(y, m, 1).getDay();
    var daysInMonth = new Date(y, m + 1, 0).getDate();
    for (var i = 0; i < firstDay; i++) html += '<button type="button" class="booking-day empty" disabled></button>';

    for (var d = 1; d <= daysInMonth; d++) {
      var dateStr = toDateStr(y, m, d);
      var dow = new Date(y, m, d).getDay();
      var isClosed = blocked.indexOf(dateStr) > -1;
      var disabled = dateStr < clinicToday || dow === 0 || dow === 6 || isClosed;
      var selected = state.date === dateStr;
      html += '<button type="button" class="booking-day' + (selected ? ' selected' : '') + (isClosed ? ' closed' : '') + '" data-date="' + dateStr + '"' +
        (disabled ? ' disabled' : '') + (isClosed ? ' title="Clinic closed"' : '') + '>' + d + '</button>';
    }
    grid.innerHTML = html;

    grid.querySelectorAll('.booking-day[data-date]:not(:disabled)').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.date = btn.getAttribute('data-date');
        state.time = null;
        renderCalendar();
        loadSlotsForDate(state.date);
      });
    });

    if (!blockedByMonth[monthKey(y, m)]) {
      loadBlockedDates(y, m).then(function () {
        if (document.getElementById('cal-grid') && monthCursor.getFullYear() === y && monthCursor.getMonth() === m) renderCalendar();
      });
    }
  }

  function loadSlotsForDate(dateStr) {
    var wrap = document.getElementById('slot-wrap');
    var grid = document.getElementById('slot-grid');
    wrap.style.display = 'block';
    grid.innerHTML = '<p class="booking-slots-msg">Checking availability…</p>';

    supabaseRpc('list_taken_slots', { p_site: STOREFRONT_SITE, p_date: dateStr })
      .then(function (rows) {
        if (state.date !== dateStr) return;
        state.takenSlots = (rows || []).map(function (r) { return r.appointment_time; });
        renderSlots();
      })
      .catch(function () {
        if (state.date !== dateStr) return;
        state.takenSlots = [];
        renderSlots();
      });
  }

  function slotAvailable(label) {
    if (state.takenSlots.indexOf(label) > -1) return false;
    if (state.duration === 60) {
      var next = minutesToLabel(slotMinutes(label) + 30);
      if (BOOKING_TIME_SLOTS.indexOf(next) === -1 || state.takenSlots.indexOf(next) > -1) return false;
    }
    var now = clinicWallClock(new Date());
    if (state.date === now.date && slotMinutes(label) < now.minutes + BOOKING_MIN_NOTICE_MINUTES) return false;
    return true;
  }

  function renderSlots() {
    var grid = document.getElementById('slot-grid');
    if (!grid) return;
    if (state.time && !slotAvailable(state.time)) state.time = null;

    var anyAvailable = BOOKING_TIME_SLOTS.some(slotAvailable);
    if (!anyAvailable) {
      grid.innerHTML = '<p class="booking-slots-msg">No ' + (state.duration === 60 ? '1-hour' : '30-minute') + ' times left on this day — please choose another date' + (state.duration === 60 ? ' or a 30-minute session' : '') + '.</p>';
      renderLocalTime();
      return;
    }

    grid.innerHTML = BOOKING_TIME_SLOTS.map(function (t) {
      var available = slotAvailable(t);
      var selected = state.time === t;
      return '<button type="button" class="booking-slot' + (selected ? ' selected' : '') + '" data-time="' + t + '"' +
        (available ? '' : ' disabled aria-disabled="true"') + '>' + t + '</button>';
    }).join('');

    grid.querySelectorAll('.booking-slot:not(:disabled)').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.time = btn.getAttribute('data-time');
        document.getElementById('booking-error-2').classList.remove('show');
        renderSlots();
      });
    });
    renderLocalTime();
  }

  function timeRange() {
    return state.time + ' – ' + minutesToLabel(slotMinutes(state.time) + state.duration);
  }

  function localTimeText() {
    if (!state.date || !state.time || visitorIsInClinicTz()) return '';
    var start = clinicSlotToDate(state.date, state.time);
    var local = start.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
    return 'That\'s ' + local + ' where you are.';
  }

  function renderLocalTime() {
    var el = document.getElementById('slot-local');
    if (!el) return;
    el.textContent = state.time
      ? 'Selected: ' + timeRange() + ' ET. ' + localTimeText()
      : '';
  }

  /* ---------- Step 3: Review + pay (or confirm, if complimentary) ---------- */
  function renderStep3() {
    setActiveStep(3);
    var d = state.details;
    var prettyDate = new Date(state.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    var cents = prices[state.duration];
    var isFree = cents === 0;
    var local = localTimeText();

    function row(label, value) {
      return '<div class="bs-row"><span>' + label + '</span><strong>' + value + '</strong></div>';
    }

    panels.innerHTML =
      '<p class="booking-eyebrow">Step 3 of 3</p>' +
      '<h3 class="booking-title" id="booking-title">' + (isFree ? 'Confirm Your Booking' : 'Confirm &amp; Pay') + '</h3>' +
      '<p class="booking-sub">' + (isFree
        ? 'Please check your details. Your consultation is complimentary — no payment is needed.'
        : 'Please check your details. Your visit is confirmed as soon as payment is received.') + '</p>' +
      '<div class="booking-summary">' +
        row('Name', escapeHtml(d.name)) +
        row('Email', escapeHtml(d.email)) +
        row('Phone', escapeHtml(d.phone)) +
        row('Topic', escapeHtml(d.reason)) +
        row('Date', escapeHtml(prettyDate)) +
        row('Time', escapeHtml(timeRange()) + ' ET' + (local ? '<small>' + escapeHtml(local) + '</small>' : '')) +
        row('Length', state.duration === 60 ? '1 hour' : '30 minutes') +
        row('Format', 'Secure video call') +
      '</div>' +
      '<div class="booking-amount"><span>Consultation fee</span><span>' + (cents == null ? '—' : (isFree ? 'Free' : money(cents))) + '</span></div>' +
      '<p class="booking-error" id="booking-error-3">Something went wrong. Please try again.</p>' +
      '<div class="booking-actions">' +
        '<button type="button" class="booking-back" id="step3-back">&larr; Back</button>' +
        '<button type="button" class="btn btn-primary" id="pay-btn">' + (isFree ? 'Confirm Booking' : 'Continue to Secure Payment') + '</button>' +
      '</div>' +
      '<p class="booking-note">' + (isFree
        ? 'You\'ll get a confirmation email with a calendar invite and your personal video link.'
        : 'You\'ll be taken to Stripe\'s secure checkout. CliniPause never sees or stores your card number. You\'ll then get a confirmation email with a calendar invite and your personal video link.') + '</p>';

    document.getElementById('step3-back').addEventListener('click', renderStep2);

    document.getElementById('pay-btn').addEventListener('click', function () {
      var payBtn = this;
      var idleLabel = payBtn.textContent;
      payBtn.disabled = true;
      payBtn.textContent = isFree ? 'Confirming…' : 'Redirecting…';
      document.getElementById('booking-error-3').classList.remove('show');

      startCheckout({
        kind: 'booking',
        booking: {
          fullName: d.name,
          email: d.email,
          phone: d.phone,
          reason: d.reason,
          date: state.date,
          time: state.time,
          duration: state.duration,
          returnPath: window.location.pathname
        }
      }).then(function (data) {
        window.location.href = data.url;
      }).catch(function (err) {
        payBtn.disabled = false;
        payBtn.textContent = idleLabel;
        var errEl = document.getElementById('booking-error-3');
        errEl.textContent = err.message || 'Something went wrong. Please try again.';
        errEl.classList.add('show');
      });
    });
  }

  // Deep link from emails ("Book a new time"): /?book=1 opens the modal.
  var params = new URLSearchParams(window.location.search);
  if (params.has('book')) {
    open();
    params.delete('book');
    var qs = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (qs ? '?' + qs : ''));
  }
}

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function money(cents) { return '$' + (Number(cents || 0) / 100).toFixed(2); }

/* =========================================================
   Shop — products are never hardcoded. They're loaded from
   store_products (managed in the admin dashboard: title,
   description, price, image) and rendered here. "Add to Cart"
   just adds a line to the cart (see initCart) — checkout for
   everything in the cart happens once, from the cart drawer.
   ========================================================= */
function renderProductGrid(grid, products) {
  var byId = {};
  products.forEach(function (p) { byId[p.id] = p; });

  grid.innerHTML = products.map(function (p) {
    return (
      '<div class="product-card">' +
        '<div class="product-image" data-view-product-id="' + p.id + '">' +
          '<img src="' + escapeHtml(p.image_url || '') + '" alt="' + escapeHtml(p.name) + '" loading="lazy">' +
        '</div>' +
        '<div class="product-body">' +
          '<div class="badge-row"><span class="badge badge-green">' + escapeHtml(p.category || 'Wellness') + '</span></div>' +
          '<h3 data-view-product-id="' + p.id + '" style="cursor:pointer;">' + escapeHtml(p.name) + '</h3>' +
          '<p>' + escapeHtml(p.description || '') + '</p>' +
          '<div class="price-row"><span class="price-now">' + money(p.price_cents) + '</span></div>' +
          '<button class="product-btn" data-add-to-cart-id="' + p.id + '">Add to Cart</button>' +
        '</div>' +
      '</div>'
    );
  }).join('');

  grid.querySelectorAll('[data-add-to-cart-id]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var product = byId[btn.getAttribute('data-add-to-cart-id')];
      if (!product) return;
      window.CliniCart.add(product);
      var original = btn.textContent;
      btn.textContent = 'Added ✓';
      btn.disabled = true;
      setTimeout(function () { btn.textContent = original; btn.disabled = false; }, 1200);
    });
  });

  grid.querySelectorAll('[data-view-product-id]').forEach(function (el) {
    el.addEventListener('click', function () {
      var product = byId[el.getAttribute('data-view-product-id')];
      if (product) window.openProductDetail(product);
    });
  });
}

function skeletonProductCards(count) {
  var card =
    '<div class="product-card skeleton-card">' +
      '<div class="skeleton skeleton-image"></div>' +
      '<div class="product-body">' +
        '<div class="skeleton skeleton-line" style="width:40%;"></div>' +
        '<div class="skeleton skeleton-line" style="width:75%;height:20px;"></div>' +
        '<div class="skeleton skeleton-line" style="width:100%;"></div>' +
        '<div class="skeleton skeleton-line" style="width:60%;"></div>' +
        '<div class="skeleton skeleton-line" style="width:45%;height:24px;"></div>' +
        '<div class="skeleton skeleton-line" style="width:100%;height:44px;border-radius:999px;"></div>' +
      '</div>' +
    '</div>';
  return new Array(count || 3).fill(card).join('');
}

function loadProducts(selectorId, limit) {
  var grid = document.getElementById(selectorId);
  if (!grid) return;

  grid.innerHTML = skeletonProductCards(limit || 3);

  // The two consultation lengths are store_products rows too (so their prices
  // are editable from the admin Products page), but they're booked through
  // the consultation flow, not bought off the shop grid — excluded by slug.
  var query = 'select=id,name,description,price_cents,image_url,category&active=eq.true&slug=not.in.(video-consultation,video-consultation-60)&order=sort_order.asc';
  if (limit) query += '&limit=' + encodeURIComponent(limit);

  function showRetryState(offline) {
    grid.innerHTML =
      '<div class="products-error" style="grid-column:1/-1;">' +
        '<p>' + (offline ? "You're offline — reconnect to load products." : 'Unable to load products right now.') + '</p>' +
        '<button type="button" class="btn btn-outline" data-retry-products>Try again</button>' +
      '</div>';
    var retryBtn = grid.querySelector('[data-retry-products]');
    if (retryBtn) retryBtn.addEventListener('click', function () { loadProducts(selectorId, limit); });
  }

  supabaseSelect('store_products', query)
    .then(function (products) {
      if (!products || !products.length) {
        grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--neutral-n200);">Check back soon — new products are on the way.</p>';
        return;
      }
      renderProductGrid(grid, products);
    })
    .catch(function () {
      showRetryState(typeof navigator !== 'undefined' && navigator.onLine === false);
    });

  initProductDetailModal();
}

function initShopProducts() {
  loadProducts('shop-product-grid', null);
}

function initHomeProductsTeaser() {
  loadProducts('home-product-grid', 2);
}

/* =========================================================
   Product detail modal — clicking a product's image or title
   expands it with the full description and an Add to Cart button.
   ========================================================= */
function initProductDetailModal() {
  if (document.getElementById('product-detail-modal')) return;

  var overlay = document.createElement('div');
  overlay.className = 'booking-overlay';
  overlay.id = 'product-detail-modal';
  overlay.innerHTML =
    '<div class="booking-modal" role="dialog" aria-modal="true" style="max-width:700px;">' +
      '<button type="button" class="booking-close" data-detail-close aria-label="Close">&times;</button>' +
      '<div class="product-modal-body" id="product-modal-content"></div>' +
    '</div>';
  document.body.appendChild(overlay);

  function close() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay || e.target.hasAttribute('data-detail-close')) close();
  });

  window.openProductDetail = function (product) {
    document.getElementById('product-modal-content').innerHTML =
      '<div class="product-modal-image">' +
        '<img src="' + escapeHtml(product.image_url || '') + '" alt="' + escapeHtml(product.name) + '">' +
      '</div>' +
      '<div class="product-modal-info">' +
        '<span class="badge badge-green" style="align-self:flex-start;">' + escapeHtml(product.category || 'Wellness') + '</span>' +
        '<h3>' + escapeHtml(product.name) + '</h3>' +
        '<p>' + escapeHtml(product.description || '') + '</p>' +
        '<div class="product-modal-price">' + money(product.price_cents) + '</div>' +
        '<button type="button" class="btn btn-primary" id="detail-add-to-cart">Add to Cart</button>' +
      '</div>';

    document.getElementById('detail-add-to-cart').addEventListener('click', function () {
      window.CliniCart.add(product);
      this.textContent = 'Added ✓';
      var self = this;
      setTimeout(function () { self.textContent = 'Add to Cart'; }, 1200);
    });

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  };
}

/* =========================================================
   Cart — persisted in localStorage, shared across all pages.
   Adds a cart icon + count badge to the navbar and a slide-out
   drawer. Checkout sends every line item to Stripe in one
   session; prices are still always re-verified server-side.
   ========================================================= */
function initCart() {
  var STORAGE_KEY = 'clinipause_cart';

  function readCart() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch (e) { return []; }
  }
  function writeCart(items) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch (e) { /* ignore */ }
    renderDrawer();
    updateBadge();
  }

  // Floating cart popup — no persistent nav icon. It shows itself the
  // moment something is added, and hides itself once the cart is empty.
  var drawer = document.createElement('div');
  drawer.className = 'cart-drawer';
  drawer.id = 'cart-drawer';
  drawer.innerHTML =
    '<div class="cart-drawer-header"><h3>Your Cart</h3><button type="button" class="cart-drawer-close" aria-label="Close cart">&times;</button></div>' +
    '<div class="cart-drawer-items" id="cart-drawer-items"></div>' +
    '<div class="cart-drawer-footer" id="cart-drawer-footer" style="display:none;">' +
      '<div class="cart-subtotal"><span>Subtotal</span><span id="cart-subtotal-amount">$0.00</span></div>' +
      '<p class="booking-error" id="cart-checkout-error">Something went wrong. Please try again.</p>' +
      '<button type="button" class="btn btn-primary" id="cart-checkout-btn" style="width:100%;">Checkout</button>' +
    '</div>';
  document.body.appendChild(drawer);

  function openDrawer() {
    drawer.classList.add('open');
  }
  function closeDrawer() {
    drawer.classList.remove('open');
  }
  drawer.querySelector('.cart-drawer-close').addEventListener('click', closeDrawer);

  function updateBadge() {
    // No persistent nav badge anymore; kept as a no-op hook in case any
    // markup elsewhere still queries #cart-badge.
  }

  function renderDrawer() {
    var items = readCart();
    var itemsEl = document.getElementById('cart-drawer-items');
    var footerEl = document.getElementById('cart-drawer-footer');
    if (!itemsEl) return;

    if (!items.length) {
      itemsEl.innerHTML = '<div class="cart-empty">Your cart is empty.</div>';
      footerEl.style.display = 'none';
      closeDrawer();
      return;
    }

    footerEl.style.display = 'block';
    itemsEl.innerHTML = items.map(function (item, i) {
      return (
        '<div class="cart-item">' +
          '<div class="cart-item-img"><img src="' + escapeHtml(item.image_url || '') + '" alt=""></div>' +
          '<div class="cart-item-info">' +
            '<h4>' + escapeHtml(item.name) + '</h4>' +
            '<div class="price">' + money(item.price_cents) + '</div>' +
            '<div class="cart-qty">' +
              '<button type="button" data-qty-down="' + i + '">&minus;</button>' +
              '<span>' + item.quantity + '</span>' +
              '<button type="button" data-qty-up="' + i + '">+</button>' +
            '</div>' +
            '<label class="cart-item-recurring">' +
              '<input type="checkbox" data-recurring="' + i + '"' + (item.recurring ? ' checked' : '') + '>' +
              ' Subscribe &amp; save (monthly)' +
            '</label>' +
            (item.recurring ? '<p class="cart-item-recurring-note">Recurring: you\'ll be charged automatically and receive this product every month, on the same day as this order.</p>' : '') +
            '<button type="button" class="cart-item-remove" data-remove="' + i + '">Remove</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    var subtotal = items.reduce(function (sum, i) { return sum + i.price_cents * i.quantity; }, 0);
    document.getElementById('cart-subtotal-amount').textContent = money(subtotal);

    itemsEl.querySelectorAll('[data-qty-up]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var items = readCart();
        items[+btn.getAttribute('data-qty-up')].quantity += 1;
        writeCart(items);
      });
    });
    itemsEl.querySelectorAll('[data-qty-down]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var items = readCart();
        var idx = +btn.getAttribute('data-qty-down');
        items[idx].quantity -= 1;
        if (items[idx].quantity <= 0) items.splice(idx, 1);
        writeCart(items);
      });
    });
    itemsEl.querySelectorAll('[data-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var items = readCart();
        items.splice(+btn.getAttribute('data-remove'), 1);
        writeCart(items);
      });
    });
    itemsEl.querySelectorAll('[data-recurring]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var items = readCart();
        var idx = +cb.getAttribute('data-recurring');
        items[idx].recurring = cb.checked;
        writeCart(items);
      });
    });
  }

  drawer.querySelector('#cart-checkout-btn').addEventListener('click', function () {
    var items = readCart();
    if (!items.length) return;
    var btn = this;
    var errEl = document.getElementById('cart-checkout-error');
    errEl.classList.remove('show');
    btn.disabled = true;
    btn.textContent = 'Redirecting…';

    startCheckout({
      kind: 'order',
      order: { items: items.map(function (i) { return { product_id: i.id, quantity: i.quantity, recurring: !!i.recurring }; }) }
    }).then(function (data) {
      window.location.href = data.url;
    }).catch(function (err) {
      btn.disabled = false;
      btn.textContent = 'Checkout';
      errEl.textContent = err.message || 'Something went wrong. Please try again.';
      errEl.classList.add('show');
    });
  });

  window.CliniCart = {
    add: function (product, quantity) {
      quantity = quantity || 1;
      var items = readCart();
      var existing = items.find(function (i) { return i.id === product.id; });
      if (existing) existing.quantity += quantity;
      else items.push({ id: product.id, name: product.name, price_cents: product.price_cents, image_url: product.image_url, quantity: quantity, recurring: false });
      writeCart(items);
      openDrawer();
    },
    clear: function () { writeCart([]); },
    open: openDrawer
  };

  renderDrawer();
  updateBadge();
}

/* =========================================================
   Home hero video — opens a lightbox on click. Drop a real
   video file at assets/video/home-intro.mp4 (or swap the
   <video> below for a YouTube/Vimeo <iframe>) to go live —
   until then it shows a friendly placeholder.
   ========================================================= */
function initHeroVideo() {
  var trigger = document.getElementById('home-hero-video');
  if (!trigger) return;

  var overlay = document.createElement('div');
  overlay.className = 'video-lightbox';
  overlay.innerHTML =
    '<div class="video-lightbox-inner">' +
      '<button type="button" class="video-lightbox-close" aria-label="Close video">&times;</button>' +
      '<div id="video-lightbox-content"></div>' +
    '</div>';
  document.body.appendChild(overlay);

  function close() {
    overlay.classList.remove('open');
    document.getElementById('video-lightbox-content').innerHTML = '';
    document.body.style.overflow = '';
  }
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  overlay.querySelector('.video-lightbox-close').addEventListener('click', close);

  // youtube-nocookie.com + rel=0/modestbranding/iv_load_policy keep this as
  // close to "no distracting suggestions" as YouTube's embed API allows —
  // rel=0 limits any end-screen suggestions to this same channel only,
  // there's no fully-suppress option without the paid API.
  var YOUTUBE_VIDEO_ID = 'ArA7c1WuZAE';

  trigger.addEventListener('click', function () {
    var content = document.getElementById('video-lightbox-content');
    var iframe = document.createElement('iframe');
    iframe.src = 'https://www.youtube-nocookie.com/embed/' + YOUTUBE_VIDEO_ID +
      '?autoplay=1&rel=0&modestbranding=1&iv_load_policy=3&playsinline=1';
    iframe.title = 'CliniPause welcome video';
    iframe.frameBorder = '0';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    content.appendChild(iframe);
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  });
}

/* =========================================================
   Contact form modal — writes to contact_messages via
   submit_contact_message(), visible to the admin dashboard
   the moment it's sent (Realtime + the green nav dot).
   ========================================================= */
function initContactModal() {
  var triggers = document.querySelectorAll('[data-contact-open]');
  if (!triggers.length) return;

  var overlay = document.createElement('div');
  overlay.className = 'booking-overlay';
  overlay.id = 'contact-us';
  overlay.innerHTML =
    '<div class="booking-modal" role="dialog" aria-modal="true">' +
      '<button type="button" class="booking-close" data-contact-close aria-label="Close">&times;</button>' +
      '<p class="booking-eyebrow">Get in Touch</p>' +
      '<h3 class="booking-title">Contact CliniPause</h3>' +
      '<p class="booking-sub">Send us a message and our team will get back to you shortly.</p>' +
      '<form id="contact-form">' +
        '<div class="booking-row-2">' +
          '<div class="booking-field"><label>Full name</label><input type="text" name="name" required></div>' +
          '<div class="booking-field"><label>Phone (optional)</label><input type="tel" name="phone"></div>' +
        '</div>' +
        '<div class="booking-field"><label>Email</label><input type="email" name="email" required></div>' +
        '<div class="booking-field"><label>Subject</label><input type="text" name="subject" placeholder="What is this about?"></div>' +
        '<div class="booking-field"><label>Message</label><textarea name="message" rows="4" required style="border:1.5px solid var(--neutral-n30);border-radius:12px;padding:12px 14px;font-size:15px;font-family:var(--font-sans);width:100%;resize:vertical;"></textarea></div>' +
        '<p class="booking-error" id="contact-error">Please fill in your name, email, and message.</p>' +
        '<div class="booking-actions" style="justify-content:flex-end;">' +
          '<button type="submit" class="btn btn-primary" id="contact-submit-btn">Send Message</button>' +
        '</div>' +
      '</form>' +
    '</div>';
  document.body.appendChild(overlay);

  function open() { overlay.classList.add('open'); document.body.style.overflow = 'hidden'; }
  function close() { overlay.classList.remove('open'); document.body.style.overflow = ''; }

  triggers.forEach(function (t) {
    t.addEventListener('click', function (e) { e.preventDefault(); open(); });
  });
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay || e.target.hasAttribute('data-contact-close')) close();
  });

  document.getElementById('contact-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var fd = new FormData(e.target);
    var name = (fd.get('name') || '').trim();
    var email = (fd.get('email') || '').trim();
    var message = (fd.get('message') || '').trim();
    var errEl = document.getElementById('contact-error');

    if (!name || !email || !message) { errEl.classList.add('show'); return; }
    errEl.classList.remove('show');

    var btn = document.getElementById('contact-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Sending…';

    supabaseRpc('submit_contact_message', {
      p_site: STOREFRONT_SITE,
      p_name: name,
      p_email: email,
      p_phone: (fd.get('phone') || '').trim() || null,
      p_subject: (fd.get('subject') || '').trim() || null,
      p_message: message
    }).then(function () {
      e.target.innerHTML = '<div class="booking-success"><div class="checkmark">&check;</div>' +
        '<h3 class="booking-title">Message Sent</h3>' +
        '<p class="booking-sub">Thanks, ' + name.split(' ')[0] + ' — we\'ll get back to you soon.</p>' +
        '<button type="button" class="btn btn-primary" id="contact-done" style="margin-top:10px;">Done</button></div>';
      document.getElementById('contact-done').addEventListener('click', close);
    }).catch(function (err) {
      errEl.textContent = err.message || 'Something went wrong. Please try again.';
      errEl.classList.add('show');
      btn.disabled = false;
      btn.textContent = 'Send Message';
    });
  });
}

/* =========================================================
   Chat assistant — answers common questions instantly from
   the site's own information, and hands the visitor over to a
   real person on request. The handoff saves the transcript and
   a short summary to the dashboard so staff have the context.
   No visitor login: a random token in localStorage identifies
   "this browser's" conversation and every RPC checks it.
   ========================================================= */
function initLiveChat() {
  var TOKEN_KEY = 'clinipause_chat_token';
  var CONV_KEY = 'clinipause_chat_conversation';
  var BOT_KEY = 'clinipause_chat_assistant';
  var pollTimer = null;
  var backgroundPollTimer = null;
  var lastSeenCount = 0;
  var isOpen = false;
  var mode = localStorage.getItem(CONV_KEY) ? 'agent' : 'bot';
  var transcript = loadTranscript();
  var missCount = 0;
  var prices = { 30: null, 60: null };

  supabaseSelect('store_products', 'select=slug,price_cents&slug=in.(video-consultation,video-consultation-60)')
    .then(function (rows) {
      (rows || []).forEach(function (r) {
        if (r.slug === 'video-consultation') prices[30] = r.price_cents;
        if (r.slug === 'video-consultation-60') prices[60] = r.price_cents;
      });
    }).catch(function () {});

  function getToken() {
    var token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      var bytes = new Uint8Array(16);
      (window.crypto || window.msCrypto).getRandomValues(bytes);
      token = 'v_' + Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      localStorage.setItem(TOKEN_KEY, token);
    }
    return token;
  }

  function loadTranscript() {
    try { return JSON.parse(sessionStorage.getItem(BOT_KEY)) || []; } catch (e) { return []; }
  }
  function saveTranscript() {
    try { sessionStorage.setItem(BOT_KEY, JSON.stringify(transcript.slice(-40))); } catch (e) {}
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(cents) {
    if (cents == null) return null;
    return cents === 0 ? 'free' : '$' + (cents / 100).toFixed(cents % 100 ? 2 : 0);
  }

  /* ---------- Knowledge base (from the site's own pages) ---------- */
  var LINKS = {
    book: { label: 'Book a consultation', action: 'book' },
    track: { label: 'Track my order', href: 'track-order.html' },
    shop: { label: 'Visit the shop', href: 'shop.html' },
    services: { label: 'See all services', href: 'services.html' },
    programs: { label: 'See programs', href: 'programs.html' },
    about: { label: 'Meet the team', href: 'about.html' },
    human: { label: 'Talk to a real person', action: 'human' }
  };

  function consultPriceLine() {
    var p30 = money(prices[30]), p60 = money(prices[60]);
    if (p30 && p60) return 'A 30-minute video consultation is <strong>' + p30 + '</strong> and a 1-hour consultation is <strong>' + p60 + '</strong>.';
    return 'We offer 30-minute and 1-hour video consultations. You\'ll see the current price when you pick a session length.';
  }

  var INTENTS = [
    { id: 'emergency', words: ['emergency', 'chest pain', 'suicid', 'kill myself', 'overdose', 'can\'t breathe', 'cant breathe', 'heavy bleeding', 'stroke', 'faint'],
      reply: function () { return { html: 'If this is a medical emergency, please <strong>call 911</strong> (or your local emergency number) right away. This chat can\'t help with emergencies.<br><br>If you\'re in crisis, you can call or text <strong>988</strong> to reach the Suicide &amp; Crisis Lifeline.', links: ['human'] }; } },
    { id: 'greeting', words: ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'], exact: true,
      reply: function () { return { html: 'Hi there! How can I help you today?', chips: true }; } },
    { id: 'thanks', words: ['thank', 'thanks', 'appreciate', 'great', 'perfect', 'awesome'],
      reply: function () { return { html: 'You\'re welcome! Is there anything else I can help with?', chips: true }; } },
    { id: 'price', words: ['price', 'cost', 'how much', 'fee', 'charge', 'pay', 'expensive', 'afford', 'insurance'],
      reply: function (t) {
        var extra = /insurance/.test(t) ? '<br><br>For insurance questions, our team can advise on your specific plan.' : '';
        return { html: consultPriceLine() + ' You pay securely by card when you book.' + extra, links: /insurance/.test(t) ? ['book', 'human'] : ['book'] };
      } },
    { id: 'book', words: ['book', 'appointment', 'schedule', 'consult', 'see a doctor', 'see the doctor', 'session', 'available', 'availability', 'slot', 'when can'],
      reply: function () {
        return { html: 'You can book a private video consultation with Dr. Ivanah Thomas online in a few steps: your details, then a 30-minute or 1-hour session and a time, then secure payment.<br><br>' + consultPriceLine() + '<br><br>Sessions run on weekdays, 9:00 AM to 4:00 PM Eastern Time. You\'ll get a confirmation email with your private video link and a calendar invite, plus a reminder 20 minutes before.', links: ['book'] };
      } },
    { id: 'reschedule', words: ['reschedule', 'cancel', 'change my appointment', 'move my appointment', 'refund', 'missed'],
      reply: function () { return { html: 'Our care team handles rescheduling, cancellations and refunds personally, so they can find the best option for you. Tap below and a team member will pick it up.', links: ['human'] }; } },
    { id: 'video', words: ['video', 'link', 'join', 'camera', 'microphone', 'zoom', 'call'],
      reply: function () { return { html: 'Your private video link is in your booking confirmation email. The waiting room opens 10 minutes before your session, where you can test your camera and microphone. It works in any modern browser; nothing to install.<br><br>Can\'t find your link? A team member can resend it.', links: ['human'] }; } },
    { id: 'track', words: ['track', 'order', 'shipping', 'shipped', 'deliver', 'package', 'where is my', 'tracking'],
      reply: function () { return { html: 'You can follow your order live on our <strong>Track Order</strong> page. Enter your order number (it looks like <strong>CP-10001</strong> and is in your confirmation email) and the email you ordered with.', links: ['track', 'human'] }; } },
    { id: 'shop', words: ['shop', 'product', 'supplement', 'buy', 'subscribe', 'subscription', 'store'],
      reply: function () { return { html: 'Our shop has CliniPause wellness products. You can buy once or subscribe monthly, and checkout is secure through Stripe. Every order gets an order number so you can track it.', links: ['shop', 'track'] }; } },
    { id: 'hormone', words: ['hormone', 'hrt', 'estrogen', 'progesterone', 'testosterone', 'bioidentical'],
      reply: function () { return { html: 'We offer <strong>personalized hormone therapy</strong> support built around your symptoms, health history and goals. The right option is different for everyone, so it starts with a consultation.', links: ['book', 'services'] }; } },
    { id: 'symptoms', words: ['hot flash', 'hot flush', 'night sweat', 'sleep', 'insomnia', 'mood', 'anxiety', 'brain fog', 'focus', 'memory', 'fatigue', 'tired', 'energy', 'weight', 'libido', 'dryness', 'irritab', 'symptom', 'period'],
      reply: function () { return { html: 'Changes like hot flashes, poor sleep, mood shifts, brain fog, low energy and weight changes are very common during perimenopause and menopause, and there are effective ways to help.<br><br>CliniPause offers personalized support for each of these. I can\'t give medical advice in chat, but a consultation with Dr. Thomas is the best next step.', links: ['book', 'services'] }; } },
    { id: 'menopause', words: ['menopause', 'perimenopause', 'postmenopause', 'change of life'],
      reply: function () { return { html: 'CliniPause specializes in <strong>perimenopause and menopause care</strong>: personalized, evidence-informed support for symptoms like hot flashes, sleep, mood, energy, brain fog, and weight and metabolic health.', links: ['book', 'programs'] }; } },
    { id: 'services', words: ['service', 'offer', 'treatment', 'what do you do', 'help with', 'aesthetic', 'peptide', 'o-shot', 'oshot', 'rejuvenation', 'wellness', 'weight loss'],
      reply: function () { return { html: 'Our services include:<ul><li>Hormone therapy</li><li>Perimenopause &amp; menopause care</li><li>Integrative wellness</li><li>Weight management</li><li>Peptides</li><li>Aesthetics</li><li>Vaginal rejuvenation &amp; O-Shot</li></ul>', links: ['services', 'book'] }; } },
    { id: 'programs', words: ['program', 'cancer', 'oncology', 'survivor', 'thrive'],
      reply: function () { return { html: 'We run three programs:<ul><li><strong>The Cancer Thrive Program</strong>: integrative oncology and survivorship support (nutrition, fatigue and sleep, supplement safety reviews, coaching). It complements, never replaces, your oncology care.</li><li><strong>Perimenopause &amp; Menopause Wellness</strong></li><li><strong>Hormone Wellness</strong></li></ul>', links: ['programs', 'book'] }; } },
    { id: 'team', words: ['doctor', 'dr.', 'dr ', 'ivanah', 'thomas', 'who are you', 'team', 'provider', 'qualified', 'about'],
      reply: function () { return { html: 'CliniPause was founded by <strong>Dr. Ivanah Thomas, MD</strong>, an Integrative Medicine Specialist and women\'s health advocate, and author of <em>The CliniPause Solution Handbook</em>. She works alongside an experienced team of clinicians.', links: ['about', 'book'] }; } },
    { id: 'hours', words: ['hours', 'open', 'when are you', 'time zone', 'timezone', 'weekend', 'saturday', 'sunday'],
      reply: function () { return { html: 'Consultations run <strong>Monday to Friday, 9:00 AM to 4:00 PM Eastern Time</strong>. The booking calendar shows times in both clinic time and your own local time.', links: ['book'] }; } },
    { id: 'contact', words: ['contact', 'email', 'phone', 'call you', 'reach', 'speak to', 'address', 'location', 'where are you'],
      reply: function () { return { html: 'You can email us at <a href="mailto:info@clinipause.com">info@clinipause.com</a>, or talk to a team member right here.', links: ['human'] }; } },
    { id: 'privacy', words: ['privacy', 'private', 'secure', 'confidential', 'data', 'hipaa'],
      reply: function () { return { html: 'Your privacy matters to us. Each video consultation uses its own private room and a personal link that only works for your booking, and payments are handled securely by Stripe. We never see your card details.', links: ['book'] }; } },
    { id: 'human', words: ['human', 'real person', 'agent', 'someone', 'staff', 'representative', 'talk to', 'speak with', 'nurse', ' live '],
      reply: function () { return { html: 'Of course, I\'ll connect you with our care team.', handoff: true }; } }
  ];

  function matchIntent(text) {
    var t = ' ' + text.toLowerCase().replace(/[^a-z0-9'\-\. ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
    if (INTENTS[0].words.some(function (w) { return t.indexOf(w) > -1; })) return { intent: INTENTS[0], t: t };
    var best = null, bestScore = 0;
    INTENTS.forEach(function (intent) {
      if (intent.id === 'emergency') return;
      var score = 0;
      intent.words.forEach(function (w) {
        var hit = intent.exact ? new RegExp('(^| )' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '( |$)').test(t) : t.indexOf(w) > -1;
        if (hit) score += w.length > 5 ? 2 : 1;
      });
      if (intent.exact && score && t.trim().split(' ').length > 4) score = 0;
      if (score > bestScore) { best = intent; bestScore = score; }
    });
    return best ? { intent: best, t: t } : null;
  }

  function answer(text) {
    var m = matchIntent(text);
    if (!m) {
      missCount += 1;
      return {
        html: missCount > 1
          ? 'I\'m still not sure I can answer that well. A member of our care team can help. Would you like me to connect you?'
          : 'I\'m not sure I have the answer to that. I can help with booking, prices, our services and programs, order tracking, or connect you with a real person.',
        links: ['human'], chips: missCount <= 1, missed: true
      };
    }
    missCount = 0;
    var r = m.intent.reply(m.t);
    r.topic = m.intent.id;
    return r;
  }

  /* ---------- UI ---------- */
  var bubble = document.createElement('button');
  bubble.type = 'button';
  bubble.id = 'chat-bubble';
  bubble.setAttribute('aria-label', 'Open chat');
  bubble.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span id="chat-unread-dot" aria-hidden="true"></span>';
  document.body.appendChild(bubble);

  var panel = document.createElement('div');
  panel.id = 'chat-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'CliniPause chat');
  panel.innerHTML =
    '<div class="chat-panel-header">' +
      '<div class="chat-panel-header-brand">' +
        '<img src="assets/images/favicon-32.png" alt="">' +
        '<div><span class="chat-title">CliniPause Assistant</span><span class="chat-status" id="chat-status"><i></i>Instant answers, real team on request</span></div>' +
      '</div>' +
      '<button type="button" id="chat-panel-close" aria-label="Close chat">&times;</button>' +
    '</div>' +
    '<div class="chat-panel-body" id="chat-panel-body">' +
      '<div class="chat-panel-messages" id="chat-panel-messages" aria-live="polite"></div>' +
    '</div>' +
    '<div class="chat-handoff-bar" id="chat-handoff-bar"><button type="button" id="chat-handoff-btn">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg> Talk to a real person</button></div>' +
    '<form id="chat-panel-form" class="chat-panel-form">' +
      '<input type="text" id="chat-panel-input" placeholder="Ask me anything…" autocomplete="off" maxlength="1000" aria-label="Message">' +
      '<button type="submit" aria-label="Send"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg></button>' +
    '</form>';
  document.body.appendChild(panel);

  var box = document.getElementById('chat-panel-messages');
  var statusEl = document.getElementById('chat-status');
  var handoffBar = document.getElementById('chat-handoff-bar');

  function scrollDown() { box.scrollTop = box.scrollHeight; }

  function linkButtons(keys) {
    if (!keys || !keys.length) return '';
    return '<div class="chat-actions">' + keys.map(function (k) {
      var l = LINKS[k];
      if (!l) return '';
      return l.href
        ? '<a class="chat-action" href="' + l.href + '">' + l.label + '</a>'
        : '<button type="button" class="chat-action' + (k === 'human' ? ' human' : '') + '" data-chat-action="' + l.action + '">' + l.label + '</button>';
    }).join('') + '</div>';
  }

  function chipsHtml() {
    var chips = ['How much is a consultation?', 'Book a consultation', 'Track my order', 'What services do you offer?'];
    return '<div class="chat-chips">' + chips.map(function (c) {
      return '<button type="button" class="chat-chip" data-chat-ask="' + escapeHtml(c) + '">' + escapeHtml(c) + '</button>';
    }).join('') + '</div>';
  }

  function botRow(html, extra) {
    return '<div class="chat-panel-row from-admin">' +
      '<img class="chat-avatar" src="assets/images/favicon-32.png" alt="">' +
      '<div class="chat-panel-col"><div class="chat-panel-bubble from-admin">' + html + '</div>' + (extra || '') + '</div></div>';
  }
  function visitorRow(text, cls) {
    return '<div class="chat-panel-row from-visitor"><div class="chat-panel-bubble from-visitor' + (cls ? ' ' + cls : '') + '">' + escapeHtml(text) + '</div></div>';
  }

  function renderBot() {
    var html = botRow('Hi! I\'m the CliniPause assistant. I can answer questions about consultations, prices, our services and your orders right away.' +
      ' Or tap <strong>Talk to a real person</strong> any time.', transcript.length ? '' : chipsHtml());
    transcript.forEach(function (m) {
      html += m.from === 'bot' ? botRow(m.html || escapeHtml(m.text), linkButtons(m.links) + (m.chips ? chipsHtml() : '')) : visitorRow(m.text);
    });
    box.innerHTML = html;
    scrollDown();
  }

  function htmlToText(html) {
    var d = document.createElement('div');
    d.innerHTML = html.replace(/<br\s*\/?>/g, '\n').replace(/<li>/g, '\n• ');
    return (d.textContent || '').trim();
  }

  function showTyping() {
    var el = document.createElement('div');
    el.className = 'chat-panel-row from-admin chat-typing-row';
    el.innerHTML = '<img class="chat-avatar" src="assets/images/favicon-32.png" alt=""><div class="chat-typing"><span></span><span></span><span></span></div>';
    box.appendChild(el);
    scrollDown();
    return el;
  }

  function askBot(text) {
    transcript.push({ from: 'visitor', text: text });
    saveTranscript();
    box.insertAdjacentHTML('beforeend', visitorRow(text));
    box.querySelectorAll('.chat-chips').forEach(function (c) { c.remove(); });
    var typing = showTyping();
    var r = answer(text);
    setTimeout(function () {
      typing.remove();
      var entry = { from: 'bot', html: r.html, text: htmlToText(r.html), links: r.links, chips: r.chips, topic: r.topic, missed: r.missed };
      transcript.push(entry);
      saveTranscript();
      box.insertAdjacentHTML('beforeend', botRow(r.html, linkButtons(r.links) + (r.chips ? chipsHtml() : '')));
      scrollDown();
      if (r.handoff) setTimeout(showHandoffForm, 350);
    }, 450 + Math.min(text.length * 12, 700));
  }

  /* ---------- Handoff to a real person ---------- */
  var TOPIC_LABELS = { price: 'prices', book: 'booking a consultation', reschedule: 'rescheduling or cancelling', video: 'video call or link', track: 'order tracking',
    shop: 'shop and products', hormone: 'hormone therapy', symptoms: 'symptoms', menopause: 'menopause care', services: 'services', programs: 'programs',
    team: 'the care team', hours: 'opening hours', contact: 'contact details', privacy: 'privacy', emergency: 'possible emergency (shown 911 guidance)' };

  function buildSummary(name) {
    var asked = transcript.filter(function (m) { return m.from === 'visitor'; }).map(function (m) { return m.text; });
    var topics = [];
    transcript.forEach(function (m) {
      if (m.from === 'bot' && m.topic && TOPIC_LABELS[m.topic] && topics.indexOf(TOPIC_LABELS[m.topic]) < 0) topics.push(TOPIC_LABELS[m.topic]);
    });
    var unanswered = [];
    transcript.forEach(function (m, i) {
      if (m.from === 'bot' && m.missed && transcript[i - 1]) unanswered.push(transcript[i - 1].text);
    });
    var lines = [(name || 'Visitor') + ' asked to talk to a real person' + (asked.length ? ' after ' + asked.length + ' message' + (asked.length > 1 ? 's' : '') + ' with the assistant.' : ' straight away.')];
    if (topics.length) lines.push('Topics: ' + topics.join(', ') + '.');
    if (unanswered.length) lines.push('Assistant could not answer: "' + unanswered.slice(-3).join('", "') + '".');
    if (asked.length) lines.push('Last question: "' + asked[asked.length - 1].slice(0, 200) + '".');
    return lines.join(' ');
  }

  function showHandoffForm() {
    if (mode !== 'bot' || document.getElementById('chat-handoff-form')) { scrollDown(); return; }
    box.insertAdjacentHTML('beforeend',
      '<form class="chat-handoff-form" id="chat-handoff-form">' +
        '<p>Our care team usually replies within a few minutes during clinic hours. Leave your details so we can follow up if you step away.</p>' +
        '<input type="text" name="name" placeholder="Your name" required maxlength="120" autocomplete="name">' +
        '<input type="email" name="email" placeholder="Email (so we can reply if you leave)" maxlength="200" autocomplete="email">' +
        '<textarea name="message" rows="2" maxlength="1000" placeholder="Anything you\'d like the team to know? (optional)"></textarea>' +
        '<button type="submit" class="btn btn-primary">Connect me</button>' +
        '<p class="chat-form-error" id="chat-handoff-error"></p>' +
      '</form>');
    scrollDown();
    document.getElementById('chat-handoff-form').querySelector('input').focus();
  }

  function submitHandoff(form) {
    var fd = new FormData(form);
    var name = String(fd.get('name') || '').trim();
    var email = String(fd.get('email') || '').trim();
    var note = String(fd.get('message') || '').trim();
    if (!name) return;
    var btn = form.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Connecting…';
    var summary = buildSummary(name);
    var convId;
    supabaseRpc('start_chat_conversation', {
      p_site: STOREFRONT_SITE, p_visitor_token: getToken(), p_visitor_name: name, p_visitor_email: email || null
    }).then(function (id) {
      convId = id;
      var payload = transcript.map(function (m) { return { from: m.from, text: m.text }; });
      return supabaseRpc('request_chat_handoff', { p_conversation_id: convId, p_visitor_token: getToken(), p_transcript: payload, p_summary: summary });
    }).then(function () {
      if (note) return supabaseRpc('send_chat_message', { p_conversation_id: convId, p_visitor_token: getToken(), p_body: note });
    }).then(function () {
      localStorage.setItem(CONV_KEY, convId);
      transcript = [];
      saveTranscript();
      enterAgentMode(convId);
    }).catch(function (err) {
      btn.disabled = false;
      btn.textContent = 'Connect me';
      document.getElementById('chat-handoff-error').textContent = (err && err.message) || 'Could not connect. Please try again.';
    });
  }

  /* ---------- Live conversation with staff ---------- */
  var agentClosed = false;

  function enterAgentMode(convId) {
    mode = 'agent';
    handoffBar.style.display = 'none';
    panel.querySelector('.chat-title').textContent = 'CliniPause Care Team';
    statusEl.innerHTML = '<i></i>You\'re chatting with a real person';
    document.getElementById('chat-panel-input').placeholder = 'Type a message…';
    fetchMessages(convId);
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () { if (isOpen) fetchMessages(convId); }, 3000);
    startBackgroundPolling(convId);
  }

  function renderAgentMessages(msgs) {
    var html = '';
    var waiting = true;
    msgs.forEach(function (m) {
      if (m.sender_kind === 'system') {
        html += '<div class="chat-system">' + escapeHtml(m.body) + '</div>';
      } else if (m.sender_kind === 'admin') {
        waiting = false;
        html += botRow(escapeHtml(m.body), '<div class="chat-sender">' + escapeHtml(m.sender_name || 'CliniPause team') + ' · CliniPause team</div>');
      } else if (m.sender_kind === 'bot') {
        html += botRow(escapeHtml(m.body).replace(/\n/g, '<br>'), '<div class="chat-sender">Assistant</div>');
      } else {
        html += visitorRow(m.body);
      }
    });
    var last = msgs[msgs.length - 1];
    agentClosed = !!(last && last.sender_kind === 'system' && /^Conversation closed/.test(last.body));
    if (agentClosed) {
      html += '<div class="chat-actions center"><button type="button" class="chat-action" data-chat-action="restart">Start a new chat</button></div>';
    } else if (waiting) {
      html += '<div class="chat-system waiting"><span class="chat-pulse"></span>Waiting for a team member to join…</div>';
    }
    box.innerHTML = html;
    scrollDown();
  }

  function fetchMessages(convId) {
    return supabaseRpc('get_chat_messages_v2', { p_conversation_id: convId, p_visitor_token: getToken() }).then(function (msgs) {
      msgs = msgs || [];
      if (isOpen && mode === 'agent') renderAgentMessages(msgs);
      if (msgs.length > lastSeenCount && lastSeenCount > 0) {
        var hasNewReply = msgs.slice(lastSeenCount).some(function (m) { return m.sender_kind === 'admin'; });
        if (hasNewReply && !isOpen) bubble.classList.add('has-unread');
      }
      lastSeenCount = msgs.length;
      return msgs;
    }).catch(function (err) {
      if (err && /Not authorized/.test(err.message)) resetToBot();
    });
  }

  function startBackgroundPolling(convId) {
    if (backgroundPollTimer) clearInterval(backgroundPollTimer);
    backgroundPollTimer = setInterval(function () { if (!isOpen) fetchMessages(convId); }, 8000);
  }

  function resetToBot() {
    localStorage.removeItem(CONV_KEY);
    if (pollTimer) clearInterval(pollTimer);
    if (backgroundPollTimer) clearInterval(backgroundPollTimer);
    pollTimer = backgroundPollTimer = null;
    mode = 'bot';
    agentClosed = false;
    lastSeenCount = 0;
    missCount = 0;
    transcript = [];
    saveTranscript();
    handoffBar.style.display = '';
    panel.querySelector('.chat-title').textContent = 'CliniPause Assistant';
    statusEl.innerHTML = '<i></i>Instant answers, real team on request';
    document.getElementById('chat-panel-input').placeholder = 'Ask me anything…';
    renderBot();
  }

  /* ---------- Events ---------- */
  function open() {
    panel.classList.add('open');
    isOpen = true;
    bubble.classList.remove('has-unread');
    var convId = localStorage.getItem(CONV_KEY);
    if (mode === 'agent' && convId) enterAgentMode(convId);
    else renderBot();
    setTimeout(function () { document.getElementById('chat-panel-input').focus(); }, 50);
  }
  function close() {
    panel.classList.remove('open');
    isOpen = false;
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  bubble.addEventListener('click', function () { panel.classList.contains('open') ? close() : open(); });
  document.getElementById('chat-panel-close').addEventListener('click', close);
  document.getElementById('chat-handoff-btn').addEventListener('click', showHandoffForm);

  box.addEventListener('click', function (e) {
    var ask = e.target.closest('[data-chat-ask]');
    if (ask) { askBot(ask.getAttribute('data-chat-ask')); return; }
    var act = e.target.closest('[data-chat-action]');
    if (!act) return;
    var a = act.getAttribute('data-chat-action');
    if (a === 'human') showHandoffForm();
    else if (a === 'restart') resetToBot();
    else if (a === 'book') {
      var trigger = document.querySelector('[data-book-open]');
      if (trigger) { close(); trigger.click(); } else { window.location.href = '/?book=1'; }
    }
  });

  box.addEventListener('submit', function (e) {
    if (e.target.id === 'chat-handoff-form') { e.preventDefault(); submitHandoff(e.target); }
  });

  document.getElementById('chat-panel-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = document.getElementById('chat-panel-input');
    var body = input.value.trim();
    if (!body) return;
    input.value = '';

    if (mode === 'bot') { askBot(body); return; }

    var convId = localStorage.getItem(CONV_KEY);
    if (!convId) return;
    if (agentClosed) { resetToBot(); askBot(body); return; }
    box.querySelectorAll('.chat-system.waiting').forEach(function (w) { w.remove(); });
    box.insertAdjacentHTML('beforeend', visitorRow(body, 'pending'));
    var optimistic = box.lastElementChild;
    scrollDown();
    supabaseRpc('send_chat_message', { p_conversation_id: convId, p_visitor_token: getToken(), p_body: body })
      .then(function () { fetchMessages(convId); })
      .catch(function () {
        var b = optimistic.querySelector('.chat-panel-bubble');
        b.classList.add('failed');
        b.setAttribute('title', 'Not sent. Check your connection.');
      });
  });

  var existingConvId = localStorage.getItem(CONV_KEY);
  if (existingConvId) {
    fetchMessages(existingConvId).then(function () { startBackgroundPolling(existingConvId); });
  }
}

/* =========================================================
   Newsletter popup — appears once per browser session, 20s
   after page load. Dismissing (or subscribing) marks the
   session so it doesn't reappear on later page navigations
   within the same tab session.
   ========================================================= */
function initNewsletterPopup() {
  var SESSION_KEY = 'clinipause_newsletter_seen';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  var alreadySeen = false;
  try { alreadySeen = sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { alreadySeen = false; }
  if (alreadySeen) return;

  function markSeen() {
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) { /* ignore */ }
  }

  setTimeout(function () {
    // Re-check — the popup may have already been dismissed on another tab
    // within the same session, or shown earlier this page load.
    try { if (sessionStorage.getItem(SESSION_KEY) === '1') return; } catch (e) { /* ignore */ }

    var overlay = document.createElement('div');
    overlay.className = 'newsletter-overlay';
    overlay.innerHTML =
      '<div class="newsletter-modal" role="dialog" aria-modal="true">' +
        '<button type="button" class="newsletter-close" aria-label="Close">&times;</button>' +
        '<div class="newsletter-body">' +
          '<h3>Stay in the loop</h3>' +
          '<p>Get occasional wellness tips and updates from CliniPause. No spam, unsubscribe anytime.</p>' +
          '<form class="newsletter-form" id="newsletter-form" novalidate>' +
            '<input type="email" id="newsletter-email" placeholder="you@example.com" required>' +
            '<button type="submit" class="btn btn-primary" id="newsletter-submit">Subscribe</button>' +
          '</form>' +
          '<p class="newsletter-message" id="newsletter-message"></p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add('open'); });

    function dismiss() {
      overlay.classList.remove('open');
      markSeen();
      setTimeout(function () { overlay.remove(); }, 300);
    }

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) dismiss();
    });
    overlay.querySelector('.newsletter-close').addEventListener('click', dismiss);

    var form = overlay.querySelector('#newsletter-form');
    var submitBtn = overlay.querySelector('#newsletter-submit');
    var msgEl = overlay.querySelector('#newsletter-message');
    var submitting = false;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (submitting) return; // prevent double-submit

      var email = overlay.querySelector('#newsletter-email').value.trim();
      if (!EMAIL_RE.test(email)) {
        msgEl.textContent = 'Please enter a valid email address.';
        msgEl.classList.add('show', 'error');
        return;
      }

      submitting = true;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Subscribing…';
      msgEl.classList.remove('show', 'error');

      supabaseRpc('subscribe_newsletter', { p_site: STOREFRONT_SITE, p_email: email })
        .then(function (status) {
          if (status === 'already_subscribed') {
            msgEl.textContent = "You're already subscribed — thanks for being with us!";
          } else {
            msgEl.textContent = "You're subscribed! Check your inbox for a welcome email.";
            // Fire-and-forget: a slow/failed welcome email should never
            // block or undo the subscription itself.
            fetch('/api/send-newsletter-welcome', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ site: STOREFRONT_SITE, email: email })
            }).catch(function () { /* subscription already succeeded; ignore */ });
          }
          msgEl.classList.add('show');
          form.style.display = 'none';
          markSeen();
          setTimeout(dismiss, 2500);
        })
        .catch(function (err) {
          submitting = false;
          submitBtn.disabled = false;
          submitBtn.textContent = 'Subscribe';
          msgEl.textContent = (err && err.message) || 'Something went wrong. Please try again.';
          msgEl.classList.add('show', 'error');
        });
    });
  }, 20000);
}
