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
  initProductCheckout();
  showPaymentReturnBanner();
});

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
   Product checkout — shop.html "Add to Cart" / "Get the Book"
   buttons open a short contact + shipping form, then redirect
   to Stripe Checkout. Prices are always looked up server-side
   from store_products, never trusted from the page.
   ========================================================= */
function initProductCheckout() {
  var buttons = document.querySelectorAll('[data-product-slug]');
  if (!buttons.length) return;

  var overlay = document.createElement('div');
  overlay.className = 'booking-overlay';
  overlay.id = 'product-checkout';
  overlay.innerHTML =
    '<div class="booking-modal" role="dialog" aria-modal="true">' +
      '<button type="button" class="booking-close" data-product-close aria-label="Close">&times;</button>' +
      '<div class="booking-panels"></div>' +
    '</div>';
  document.body.appendChild(overlay);
  var panels = overlay.querySelector('.booking-panels');

  function close() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay || e.target.hasAttribute('data-product-close')) close();
  });

  buttons.forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var slug = btn.getAttribute('data-product-slug');
      var name = btn.getAttribute('data-product-name') || 'this product';
      renderForm(slug, name);
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    });
  });

  function renderForm(slug, name) {
    panels.innerHTML =
      '<p class="booking-eyebrow">Checkout</p>' +
      '<h3 class="booking-title">' + name + '</h3>' +
      '<p class="booking-sub">Enter your details to continue to secure payment.</p>' +
      '<form id="product-form">' +
        '<div class="booking-row-2">' +
          '<div class="booking-field"><label>Full name</label><input type="text" name="name" required></div>' +
          '<div class="booking-field"><label>Phone</label><input type="tel" name="phone" required></div>' +
        '</div>' +
        '<div class="booking-field"><label>Email</label><input type="email" name="email" required></div>' +
        '<div class="booking-field"><label>Shipping address</label><input type="text" name="address" placeholder="Street address" required></div>' +
        '<div class="booking-row-2">' +
          '<div class="booking-field"><input type="text" name="city" placeholder="City" required></div>' +
          '<div class="booking-field"><input type="text" name="zip" placeholder="ZIP / Postal code" required></div>' +
        '</div>' +
        '<p class="booking-error" id="product-error">Please complete all fields.</p>' +
        '<div class="booking-actions" style="justify-content:flex-end;">' +
          '<button type="submit" class="btn btn-primary" id="product-pay-btn">Continue to Secure Payment</button>' +
        '</div>' +
      '</form>' +
      '<p class="booking-note">You\'ll be taken to Stripe\'s secure checkout to enter your card details.</p>';

    document.getElementById('product-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var details = {
        name: (fd.get('name') || '').trim(),
        phone: (fd.get('phone') || '').trim(),
        email: (fd.get('email') || '').trim(),
        address: (fd.get('address') || '').trim(),
        city: (fd.get('city') || '').trim(),
        zip: (fd.get('zip') || '').trim()
      };
      if (!details.name || !details.phone || !details.email || !details.address || !details.city || !details.zip) {
        document.getElementById('product-error').classList.add('show');
        return;
      }

      var payBtn = document.getElementById('product-pay-btn');
      payBtn.disabled = true;
      payBtn.textContent = 'Looking up product…';

      supabaseSelect('store_products', 'slug=eq.' + encodeURIComponent(slug) + '&select=id&active=eq.true')
        .then(function (rows) {
          if (!rows || !rows.length) throw new Error('That product is currently unavailable.');
          payBtn.textContent = 'Redirecting…';
          return startCheckout({
            kind: 'order',
            order: {
              customerName: details.name,
              email: details.email,
              phone: details.phone,
              shippingAddress: { line1: details.address, city: details.city, postal_code: details.zip },
              items: [{ product_id: rows[0].id, quantity: 1 }]
            }
          });
        })
        .then(function (data) {
          window.location.href = data.url;
        })
        .catch(function (err) {
          payBtn.disabled = false;
          payBtn.textContent = 'Continue to Secure Payment';
          var errEl = document.getElementById('product-error');
          errEl.textContent = err.message || 'Something went wrong. Please try again.';
          errEl.classList.add('show');
        });
    });
  }
}
