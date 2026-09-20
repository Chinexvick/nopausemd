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
  if (!params.has('paid') && !params.has('canceled')) return;

  var overlay = document.createElement('div');
  overlay.className = 'booking-overlay open';
  var paid = params.has('paid');

  overlay.innerHTML =
    '<div class="booking-modal" role="dialog" aria-modal="true">' +
      '<button type="button" class="booking-close" aria-label="Close">&times;</button>' +
      '<div class="success-modal-body">' +
        '<div class="checkmark">' + (paid ? '&check;' : '&times;') + '</div>' +
        '<h3 class="booking-title">' + (paid ? 'Payment Successful!' : 'Checkout Canceled') + '</h3>' +
        '<p class="booking-sub">' + (paid
          ? "Thank you — your order is confirmed. A receipt has been sent to your email, and we'll be in touch with any next steps."
          : 'No payment was taken. You can pick up where you left off any time.') + '</p>' +
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
    var isBook = p.category === 'book';
    return (
      '<div class="product-card">' +
        '<div class="product-image" data-view-product-id="' + p.id + '"' + (isBook ? ' style="background:#0c211b;"' : '') + '>' +
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

  var query = 'select=id,name,description,price_cents,image_url,category&active=eq.true&order=sort_order.asc';
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
    var isBook = product.category === 'book';
    document.getElementById('product-modal-content').innerHTML =
      '<div class="product-modal-image"' + (isBook ? ' style="background:#0c211b;"' : '') + '>' +
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
  var backgroundPollTimer = null;
  var lastSeenCount = 0;
  var isOpen = false;

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
  bubble.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span id="chat-unread-dot" aria-hidden="true"></span>';
  document.body.appendChild(bubble);

  var panel = document.createElement('div');
  panel.id = 'chat-panel';
  panel.innerHTML =
    '<div class="chat-panel-header">' +
      '<div class="chat-panel-header-brand">' +
        '<img src="assets/images/favicon-32.png" alt="">' +
        '<span>Chat with CliniPause</span>' +
      '</div>' +
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

  function showUnreadDot() { bubble.classList.add('has-unread'); }
  function hideUnreadDot() { bubble.classList.remove('has-unread'); }

  function open() {
    panel.classList.add('open');
    isOpen = true;
    hideUnreadDot();
    var convId = localStorage.getItem(CONV_KEY);
    if (convId) showThread(convId);
  }
  function close() {
    panel.classList.remove('open');
    isOpen = false;
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
      showThread(convId, [{ id: 'local-optimistic', sender_is_admin: false, body: message, pending: true }]);
      return supabaseRpc('send_chat_message', { p_conversation_id: convId, p_visitor_token: getToken(), p_body: message });
    }).then(function () {
      var convId = localStorage.getItem(CONV_KEY);
      fetchMessages(convId).then(function () { startBackgroundPolling(convId); });
    }).catch(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Start Chat';
    });
  });

  function renderMessages(msgs) {
    var box = document.getElementById('chat-panel-messages');
    box.innerHTML = (msgs || []).map(function (m) {
      if (m.sender_is_admin) {
        return '<div class="chat-panel-row from-admin">' +
          '<img class="chat-avatar" src="assets/images/favicon-32.png" alt="CliniPause">' +
          '<div class="chat-panel-bubble from-admin">' + escapeHtml(m.body) + '</div>' +
        '</div>';
      }
      return '<div class="chat-panel-row from-visitor">' +
        '<div class="chat-panel-bubble from-visitor' + (m.pending ? ' pending' : '') + '">' + escapeHtml(m.body) + '</div>' +
      '</div>';
    }).join('');
    box.scrollTop = box.scrollHeight;
  }

  function showThread(convId, optimisticMsgs) {
    document.querySelector('.chat-panel-intro').style.display = 'none';
    document.getElementById('chat-panel-messages').style.display = 'flex';
    document.getElementById('chat-panel-form').style.display = 'flex';
    if (optimisticMsgs) renderMessages(optimisticMsgs);
    fetchMessages(convId);
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () { fetchMessages(convId); }, 3000);
  }

  function fetchMessages(convId) {
    return supabaseRpc('get_chat_messages', { p_conversation_id: convId, p_visitor_token: getToken() }).then(function (msgs) {
      msgs = msgs || [];
      if (isOpen && document.getElementById('chat-panel-messages').style.display !== 'none') {
        renderMessages(msgs);
      }
      if (msgs.length > lastSeenCount) {
        var newOnes = msgs.slice(lastSeenCount);
        var hasNewAdminReply = newOnes.some(function (m) { return m.sender_is_admin; });
        if (hasNewAdminReply && !isOpen) showUnreadDot();
      }
      lastSeenCount = msgs.length;
      return msgs;
    }).catch(function () { /* transient — next poll will retry */ });
  }

  document.getElementById('chat-panel-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = document.getElementById('chat-panel-input');
    var body = input.value.trim();
    var convId = localStorage.getItem(CONV_KEY);
    if (!body || !convId) return;
    input.value = '';

    var box = document.getElementById('chat-panel-messages');
    var optimistic = document.createElement('div');
    optimistic.className = 'chat-panel-row from-visitor';
    optimistic.innerHTML = '<div class="chat-panel-bubble from-visitor pending">' + escapeHtml(body) + '</div>';
    box.appendChild(optimistic);
    box.scrollTop = box.scrollHeight;

    supabaseRpc('send_chat_message', { p_conversation_id: convId, p_visitor_token: getToken(), p_body: body })
      .then(function () { fetchMessages(convId); })
      .catch(function () {
        var b = optimistic.querySelector('.chat-panel-bubble');
        b.classList.add('failed');
        b.setAttribute('title', 'Not sent — check your connection');
      });
  });

  // Keep checking for admin replies in the background (even while the
  // panel is closed) so the unread dot lights up like a real chat app.
  function startBackgroundPolling(convId) {
    if (backgroundPollTimer) clearInterval(backgroundPollTimer);
    backgroundPollTimer = setInterval(function () {
      if (!isOpen) fetchMessages(convId);
    }, 8000);
  }

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
        .then(function () {
          msgEl.textContent = "You're subscribed! Thanks for joining us.";
          msgEl.classList.add('show');
          form.style.display = 'none';
          markSeen();
          setTimeout(dismiss, 2000);
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
