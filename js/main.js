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
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      links.classList.toggle('open');
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

  initBookingModal();
  initShopProducts();
  showPaymentReturnBanner();
  initContactModal();
  initLiveChat();
  initHeroEntrance();
  initScrollReveal();
});

/* =========================================================
   Hero entrance animation — the first thing a visitor sees
   fades/slides up in a quick stagger the moment the page loads.
   ========================================================= */
function initHeroEntrance() {
  var groups = [
    document.querySelectorAll('.home-hero-copy > *'),
    document.querySelectorAll('.page-hero-content > *'),
    document.querySelectorAll('.home-hero-gallery .gallery-card')
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
    '.faq-item', '.bundle-strip'
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
   Payment return banner — Stripe redirects back with
   ?paid=1 or ?canceled=1. The row is only ever marked paid
   by the Stripe webhook server-side, so this is just a
   friendly acknowledgement, not the source of truth.
   ========================================================= */
function showPaymentReturnBanner() {
  var params = new URLSearchParams(window.location.search);
  if (!params.has('paid') && !params.has('canceled')) return;

  var banner = document.createElement('div');
  banner.style.cssText = 'position:sticky;top:0;z-index:200;padding:14px 20px;text-align:center;font-size:15px;font-weight:500;';
  if (params.has('paid')) {
    banner.style.background = '#eef8e7';
    banner.style.color = '#397f37';
    banner.textContent = "Payment received — thank you! We'll be in touch shortly to confirm the details.";
  } else {
    banner.style.background = '#fbe6df';
    banner.style.color = '#8b3a2b';
    banner.textContent = 'Checkout was canceled — no payment was taken. You can try again anytime.';
  }
  document.body.insertBefore(banner, document.body.firstChild);

  var url = new URL(window.location.href);
  url.searchParams.delete('paid');
  url.searchParams.delete('canceled');
  window.history.replaceState({}, '', url.pathname + url.search);
}

/* =========================================================
   Booking Modal — Details -> Date/Time -> Secure Payment (Stripe Checkout)
   Bookings are created server-side via the create_store_booking RPC the
   moment a slot is picked, as "pending_payment". They only flip to paid
   once Stripe confirms the charge and calls our webhook — never client-side.
   ========================================================= */
function initBookingModal() {
  var triggers = document.querySelectorAll('[data-book-open]');
  if (!triggers.length) return;

  var CONSULT_FEE = 300;
  var TIME_SLOTS = ['9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
    '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM', '3:00 PM', '3:30 PM', '4:00 PM'];

  var state = { date: null, time: null, takenSlots: [] };
  var monthCursor = new Date();
  monthCursor.setDate(1);

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
  }

  function open() {
    state = { date: null, time: null, takenSlots: [] };
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

  /* ---------- Step 1: Your details ---------- */
  function renderStep1(prefill) {
    setActiveStep(1);
    prefill = prefill || {};
    panels.innerHTML =
      '<p class="booking-eyebrow">Step 1 of 3</p>' +
      '<h3 class="booking-title" id="booking-title">Book a Consultation</h3>' +
      '<p class="booking-sub">Tell us a bit about you so Dr. Thomas\' team can prepare for your visit.</p>' +
      '<form id="booking-form-1">' +
        '<div class="booking-row-2">' +
          '<div class="booking-field"><label>Full name</label><input type="text" name="name" required value="' + (prefill.name || '') + '"></div>' +
          '<div class="booking-field"><label>Phone</label><input type="tel" name="phone" required value="' + (prefill.phone || '') + '"></div>' +
        '</div>' +
        '<div class="booking-field"><label>Email</label><input type="email" name="email" required value="' + (prefill.email || '') + '"></div>' +
        '<div class="booking-field"><label>What would you like to discuss?</label>' +
          '<select name="reason">' +
            '<option>Perimenopause / Menopause symptoms</option>' +
            '<option>Hormone therapy</option>' +
            '<option>Weight management</option>' +
            '<option>Peptides</option>' +
            '<option>Aesthetics</option>' +
            '<option>General wellness consultation</option>' +
          '</select>' +
        '</div>' +
        '<p class="booking-error" id="booking-error-1">Please fill in your name, email, and phone number.</p>' +
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
      if (!details.name || !details.email || !details.phone) {
        document.getElementById('booking-error-1').classList.add('show');
        return;
      }
      state.details = details;
      renderStep2();
    });
  }

  /* ---------- Step 2: Date + time ---------- */
  function renderStep2() {
    setActiveStep(2);
    panels.innerHTML =
      '<p class="booking-eyebrow">Step 2 of 3</p>' +
      '<h3 class="booking-title">Choose a Date &amp; Time</h3>' +
      '<p class="booking-sub">Pick a day and an available time for your consultation.</p>' +
      '<div class="booking-calendar-head">' +
        '<button type="button" id="cal-prev" aria-label="Previous month">&lsaquo;</button>' +
        '<span id="cal-label"></span>' +
        '<button type="button" id="cal-next" aria-label="Next month">&rsaquo;</button>' +
      '</div>' +
      '<div class="booking-calendar-grid" id="cal-grid"></div>' +
      '<div id="slot-wrap" style="display:none;">' +
        '<label style="font-size:14px;font-weight:500;">Available times</label>' +
        '<div class="booking-slots" id="slot-grid" style="margin-top:10px;"></div>' +
      '</div>' +
      '<p class="booking-error" id="booking-error-2">Please select both a date and a time.</p>' +
      '<div class="booking-actions">' +
        '<button type="button" class="booking-back" id="step2-back">&larr; Back</button>' +
        '<button type="button" class="btn btn-primary" id="step2-continue">Continue</button>' +
      '</div>';

    document.getElementById('step2-back').addEventListener('click', function () { renderStep1(state.details); });
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

    renderCalendar();
  }

  function toDateStr(y, m, d) {
    return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  function renderCalendar() {
    var y = monthCursor.getFullYear(), m = monthCursor.getMonth();
    var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    document.getElementById('cal-label').textContent = monthNames[m] + ' ' + y;

    var grid = document.getElementById('cal-grid');
    var html = '';
    ['S','M','T','W','T','F','S'].forEach(function (d) { html += '<div class="dow">' + d + '</div>'; });

    var firstDay = new Date(y, m, 1).getDay();
    var daysInMonth = new Date(y, m + 1, 0).getDate();
    var today = new Date(); today.setHours(0,0,0,0);

    for (var i = 0; i < firstDay; i++) html += '<button type="button" class="booking-day empty" disabled></button>';

    for (var d = 1; d <= daysInMonth; d++) {
      var thisDate = new Date(y, m, d);
      var dateStr = toDateStr(y, m, d);
      var isPast = thisDate < today;
      var isWeekend = thisDate.getDay() === 0 || thisDate.getDay() === 6;
      var disabled = isPast || isWeekend;
      var selected = state.date === dateStr;
      html += '<button type="button" class="booking-day' + (selected ? ' selected' : '') + '" data-date="' + dateStr + '"' + (disabled ? ' disabled' : '') + '>' + d + '</button>';
    }
    grid.innerHTML = html;

    grid.querySelectorAll('.booking-day[data-date]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.date = btn.getAttribute('data-date');
        state.time = null;
        renderCalendar();
        loadSlotsForDate(state.date);
      });
    });

    if (state.date) loadSlotsForDate(state.date);
  }

  function loadSlotsForDate(dateStr) {
    var wrap = document.getElementById('slot-wrap');
    var grid = document.getElementById('slot-grid');
    wrap.style.display = 'block';
    grid.innerHTML = '<p style="font-size:14px;color:var(--neutral-n200);grid-column:1/-1;">Checking availability…</p>';

    supabaseRpc('list_taken_slots', { p_site: STOREFRONT_SITE, p_date: dateStr })
      .then(function (rows) {
        state.takenSlots = (rows || []).map(function (r) { return r.appointment_time; });
        renderSlots();
      })
      .catch(function () {
        state.takenSlots = [];
        renderSlots();
      });
  }

  function renderSlots() {
    var grid = document.getElementById('slot-grid');
    grid.innerHTML = TIME_SLOTS.map(function (t) {
      var taken = state.takenSlots.indexOf(t) > -1;
      var selected = state.time === t;
      return '<button type="button" class="booking-slot' + (selected ? ' selected' : '') + '" data-time="' + t + '"' + (taken ? ' disabled' : '') + '>' + t + '</button>';
    }).join('');

    grid.querySelectorAll('.booking-slot:not(:disabled)').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.time = btn.getAttribute('data-time');
        renderSlots();
      });
    });
  }

  /* ---------- Step 3: Review + redirect to Stripe Checkout ---------- */
  function renderStep3() {
    setActiveStep(3);
    var d = state.details;
    var prettyDate = new Date(state.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    panels.innerHTML =
      '<p class="booking-eyebrow">Step 3 of 3</p>' +
      '<h3 class="booking-title">Confirm &amp; Pay</h3>' +
      '<p class="booking-sub">A $300 consultation fee secures your appointment. Your visit is only confirmed once payment is received.</p>' +
      '<div class="booking-summary">' +
        '<strong>' + d.name + '</strong><br>' +
        d.reason + '<br>' +
        prettyDate + ' at ' + state.time + '<br>' +
        d.email + ' &middot; ' + d.phone +
      '</div>' +
      '<div class="booking-amount"><span>Consultation fee</span><span>$' + CONSULT_FEE + '.00</span></div>' +
      '<p class="booking-error" id="booking-error-3">Something went wrong starting checkout. Please try again.</p>' +
      '<div class="booking-actions">' +
        '<button type="button" class="booking-back" id="step3-back">&larr; Back</button>' +
        '<button type="button" class="btn btn-primary" id="pay-btn">Continue to Secure Payment</button>' +
      '</div>' +
      '<p class="booking-note">You\'ll be taken to Stripe\'s secure checkout to enter your card details. CliniPause never sees or stores your card number.</p>';

    document.getElementById('step3-back').addEventListener('click', renderStep2);

    document.getElementById('pay-btn').addEventListener('click', function () {
      var payBtn = this;
      payBtn.disabled = true;
      payBtn.textContent = 'Redirecting…';
      document.getElementById('booking-error-3').classList.remove('show');

      startCheckout({
        kind: 'booking',
        booking: {
          fullName: state.details.name,
          email: state.details.email,
          phone: state.details.phone,
          reason: state.details.reason,
          date: state.date,
          time: state.time
        }
      }).then(function (data) {
        window.location.href = data.url;
      }).catch(function (err) {
        payBtn.disabled = false;
        payBtn.textContent = 'Continue to Secure Payment';
        var errEl = document.getElementById('booking-error-3');
        errEl.textContent = err.message || 'Something went wrong starting checkout. Please try again.';
        errEl.classList.add('show');
      });
    });
  }
}

/* =========================================================
   Shop — products are never hardcoded. They're loaded from
   store_products (managed in the admin dashboard: title,
   description, price, image) and rendered here. "Buy Now" goes
   straight to Stripe Checkout in one click — no form on our
   site at all. Stripe's own hosted page collects email, name,
   and shipping address; the order itself is only created (as
   already-paid) once the webhook confirms the charge.
   ========================================================= */
function initShopProducts() {
  var grid = document.getElementById('shop-product-grid');
  if (!grid) return;

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(cents) { return '$' + (Number(cents || 0) / 100).toFixed(2); }

  supabaseSelect('store_products', 'select=id,name,description,price_cents,image_url,category&active=eq.true&order=sort_order.asc')
    .then(function (products) {
      if (!products || !products.length) {
        grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--neutral-n200);">Check back soon — new products are on the way.</p>';
        return;
      }

      grid.innerHTML = products.map(function (p) {
        var isBook = p.category === 'book';
        return (
          '<div class="product-card">' +
            '<div class="product-image"' + (isBook ? ' style="background:#0c211b;"' : '') + '>' +
              '<img src="' + escapeHtml(p.image_url || '') + '" alt="' + escapeHtml(p.name) + '" loading="lazy">' +
            '</div>' +
            '<div class="product-body">' +
              '<div class="badge-row"><span class="badge badge-green">' + escapeHtml(p.category || 'Wellness') + '</span></div>' +
              '<h3>' + escapeHtml(p.name) + '</h3>' +
              '<p>' + escapeHtml(p.description || '') + '</p>' +
              '<div class="price-row"><span class="price-now">' + money(p.price_cents) + '</span></div>' +
              '<button class="product-btn" data-buy-product-id="' + p.id + '" data-buy-product-price="' + money(p.price_cents) + '">Buy Now — ' + money(p.price_cents) + '</button>' +
            '</div>' +
          '</div>'
        );
      }).join('');

      grid.querySelectorAll('[data-buy-product-id]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var productId = btn.getAttribute('data-buy-product-id');
          var original = btn.textContent;
          btn.disabled = true;
          btn.textContent = 'Redirecting…';

          startCheckout({
            kind: 'order',
            order: { items: [{ product_id: productId, quantity: 1 }] }
          }).then(function (data) {
            window.location.href = data.url;
          }).catch(function (err) {
            btn.disabled = false;
            btn.textContent = original;
            alert(err.message || 'Something went wrong starting checkout. Please try again.');
          });
        });
      });
    })
    .catch(function () {
      grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--neutral-n200);">Unable to load products right now. Please refresh the page.</p>';
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
   Live chat widget — a floating bubble that opens a small
   panel. No visitor login: a random token is kept in
   localStorage to identify "this browser's" conversation,
   checked server-side by every RPC call. Polls for replies
   while open; the admin side gets true Realtime + a nav dot.
   ========================================================= */
function initLiveChat() {
  var TOKEN_KEY = 'clinipause_chat_token';
  var CONV_KEY = 'clinipause_chat_conversation';
  var pollTimer = null;

  function getToken() {
    var token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      token = 'v_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
      localStorage.setItem(TOKEN_KEY, token);
    }
    return token;
  }

  var bubble = document.createElement('button');
  bubble.type = 'button';
  bubble.id = 'chat-bubble';
  bubble.setAttribute('aria-label', 'Open live chat');
  bubble.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  document.body.appendChild(bubble);

  var panel = document.createElement('div');
  panel.id = 'chat-panel';
  panel.innerHTML =
    '<div class="chat-panel-header">' +
      '<span>Chat with CliniPause</span>' +
      '<button type="button" id="chat-panel-close" aria-label="Close chat">&times;</button>' +
    '</div>' +
    '<div class="chat-panel-body" id="chat-panel-body">' +
      '<div class="chat-panel-intro">' +
        '<p>Hi! Leave your name and a message and our team will reply here.</p>' +
        '<form id="chat-intro-form">' +
          '<input type="text" name="name" placeholder="Your name" required>' +
          '<input type="email" name="email" placeholder="Your email (optional)">' +
          '<textarea name="message" placeholder="How can we help?" rows="3" required></textarea>' +
          '<button type="submit" class="btn btn-primary" style="width:100%;">Start Chat</button>' +
        '</form>' +
      '</div>' +
      '<div class="chat-panel-messages" id="chat-panel-messages" style="display:none;"></div>' +
    '</div>' +
    '<form id="chat-panel-form" class="chat-panel-form" style="display:none;">' +
      '<input type="text" id="chat-panel-input" placeholder="Type a message..." autocomplete="off">' +
      '<button type="submit" aria-label="Send">&#10148;</button>' +
    '</form>';
  document.body.appendChild(panel);

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function open() {
    panel.classList.add('open');
    var convId = localStorage.getItem(CONV_KEY);
    if (convId) showThread(convId);
  }
  function close() {
    panel.classList.remove('open');
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  bubble.addEventListener('click', function () {
    panel.classList.contains('open') ? close() : open();
  });
  document.getElementById('chat-panel-close').addEventListener('click', close);

  document.getElementById('chat-intro-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var fd = new FormData(e.target);
    var name = (fd.get('name') || '').trim();
    var email = (fd.get('email') || '').trim();
    var message = (fd.get('message') || '').trim();
    if (!name || !message) return;

    var submitBtn = e.target.querySelector('button');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Starting…';

    supabaseRpc('start_chat_conversation', {
      p_site: STOREFRONT_SITE, p_visitor_token: getToken(), p_visitor_name: name, p_visitor_email: email || null
    }).then(function (convId) {
      localStorage.setItem(CONV_KEY, convId);
      return supabaseRpc('send_chat_message', { p_conversation_id: convId, p_visitor_token: getToken(), p_body: message });
    }).then(function () {
      showThread(localStorage.getItem(CONV_KEY));
    }).catch(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Start Chat';
    });
  });

  function showThread(convId) {
    document.querySelector('.chat-panel-intro').style.display = 'none';
    document.getElementById('chat-panel-messages').style.display = 'flex';
    document.getElementById('chat-panel-form').style.display = 'flex';
    fetchMessages(convId);
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () { fetchMessages(convId); }, 3000);
  }

  function fetchMessages(convId) {
    supabaseRpc('get_chat_messages', { p_conversation_id: convId, p_visitor_token: getToken() }).then(function (msgs) {
      var box = document.getElementById('chat-panel-messages');
      box.innerHTML = (msgs || []).map(function (m) {
        return '<div class="chat-panel-bubble ' + (m.sender_is_admin ? 'from-admin' : 'from-visitor') + '">' + escapeHtml(m.body) + '</div>';
      }).join('');
      box.scrollTop = box.scrollHeight;
    }).catch(function () { /* transient — next poll will retry */ });
  }

  document.getElementById('chat-panel-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = document.getElementById('chat-panel-input');
    var body = input.value.trim();
    var convId = localStorage.getItem(CONV_KEY);
    if (!body || !convId) return;
    input.value = '';
    supabaseRpc('send_chat_message', { p_conversation_id: convId, p_visitor_token: getToken(), p_body: body })
      .then(function () { fetchMessages(convId); });
  });
}
