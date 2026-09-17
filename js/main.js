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

  // Add to cart / buy buttons — simple feedback
  document.querySelectorAll('.product-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var original = btn.textContent;
      btn.textContent = 'Added ✓';
      setTimeout(function () {
        btn.textContent = original;
      }, 1500);
    });
  });

  initBookingModal();
});

/* =========================================================
   Booking Modal — Details -> Date/Time -> $300 Payment -> Confirmation
   No backend yet: bookings are stored in localStorage under
   "clinipause_bookings" so the admin dashboard can be pointed at
   the same data later. A booking is written as soon as a time slot
   is confirmed (paid: false) and flipped to paid: true only after
   the payment step succeeds — unpaid bookings are the ones the
   admin dashboard should treat as "not confirmed".
   ========================================================= */
function initBookingModal() {
  var triggers = document.querySelectorAll('[data-book-open]');
  if (!triggers.length) return;

  var CONSULT_FEE = 300;
  var STORAGE_KEY = 'clinipause_bookings';
  var TIME_SLOTS = ['9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
    '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM', '3:00 PM', '3:30 PM', '4:00 PM'];

  var state = { date: null, time: null, bookingId: null };
  var monthCursor = new Date();
  monthCursor.setDate(1);

  var overlay = document.createElement('div');
  overlay.className = 'booking-overlay';
  overlay.id = 'book-consultation';
  overlay.innerHTML =
    '<div class="booking-modal" role="dialog" aria-modal="true" aria-labelledby="booking-title">' +
      '<button type="button" class="booking-close" data-book-close aria-label="Close">&times;</button>' +
      '<div class="booking-steps"><span class="s1"></span><span class="s2"></span><span class="s3"></span><span class="s4"></span></div>' +
      '<div class="booking-panels"></div>' +
    '</div>';
  document.body.appendChild(overlay);

  var panels = overlay.querySelector('.booking-panels');
  var stepEls = overlay.querySelectorAll('.booking-steps span');

  function getBookings() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch (e) { return []; }
  }

  function saveBookings(list) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }
    catch (e) { /* storage unavailable — booking still confirms in-session */ }
  }

  function upsertBooking(record) {
    var list = getBookings();
    var idx = list.findIndex(function (b) { return b.id === record.id; });
    if (idx > -1) list[idx] = record; else list.push(record);
    saveBookings(list);
  }

  function isSlotTaken(dateStr, time) {
    return getBookings().some(function (b) {
      return b.date === dateStr && b.time === time && b.paid !== false && b.status !== 'cancelled';
    });
  }

  function setActiveStep(n) {
    stepEls.forEach(function (el, i) { el.classList.toggle('active', i < n); });
  }

  function open() {
    state = { date: null, time: null, bookingId: null };
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
        renderSlots();
      });
    });

    if (state.date) renderSlots();
  }

  function renderSlots() {
    var wrap = document.getElementById('slot-wrap');
    var grid = document.getElementById('slot-grid');
    wrap.style.display = 'block';
    grid.innerHTML = TIME_SLOTS.map(function (t) {
      var taken = isSlotTaken(state.date, t);
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

  /* ---------- Step 3: Payment ---------- */
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
      '<form id="booking-form-3">' +
        '<div class="booking-field"><label>Name on card</label><input type="text" name="cardName" required value="' + d.name + '"></div>' +
        '<div class="booking-field"><label>Card number</label><input type="text" name="cardNumber" inputmode="numeric" placeholder="1234 1234 1234 1234" required maxlength="19"></div>' +
        '<div class="booking-row-2">' +
          '<div class="booking-field"><label>Expiry</label><input type="text" name="expiry" placeholder="MM / YY" required maxlength="7"></div>' +
          '<div class="booking-field"><label>CVC</label><input type="text" name="cvc" inputmode="numeric" placeholder="123" required maxlength="4"></div>' +
        '</div>' +
        '<p class="booking-error" id="booking-error-3">Please complete all payment fields.</p>' +
        '<div class="booking-actions">' +
          '<button type="button" class="booking-back" id="step3-back">&larr; Back</button>' +
          '<button type="submit" class="btn btn-primary" id="pay-btn">Pay $' + CONSULT_FEE + ' &amp; Confirm</button>' +
        '</div>' +
      '</form>' +
      '<p class="booking-note">Payments are not processed yet — this site is running without a payment backend. Your slot is held as "not paid" until checkout goes live.</p>';

    document.getElementById('step3-back').addEventListener('click', renderStep2);

    document.getElementById('booking-form-3').addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var card = {
        cardName: (fd.get('cardName') || '').trim(),
        cardNumber: (fd.get('cardNumber') || '').trim(),
        expiry: (fd.get('expiry') || '').trim(),
        cvc: (fd.get('cvc') || '').trim()
      };
      if (!card.cardName || !card.cardNumber || !card.expiry || !card.cvc) {
        document.getElementById('booking-error-3').classList.add('show');
        return;
      }

      if (!state.bookingId) state.bookingId = 'bk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

      // Record the appointment immediately as unpaid — flips to paid below.
      // Until a real payment gateway is wired in, this simulates the charge.
      upsertBooking({
        id: state.bookingId,
        name: state.details.name,
        email: state.details.email,
        phone: state.details.phone,
        reason: state.details.reason,
        date: state.date,
        time: state.time,
        amount: CONSULT_FEE,
        paid: false,
        status: 'pending_payment',
        createdAt: new Date().toISOString()
      });

      var payBtn = document.getElementById('pay-btn');
      payBtn.disabled = true;
      payBtn.textContent = 'Processing payment…';

      setTimeout(function () {
        upsertBooking({
          id: state.bookingId,
          name: state.details.name,
          email: state.details.email,
          phone: state.details.phone,
          reason: state.details.reason,
          date: state.date,
          time: state.time,
          amount: CONSULT_FEE,
          paid: true,
          status: 'confirmed',
          createdAt: new Date().toISOString(),
          paidAt: new Date().toISOString()
        });
        renderStep4();
      }, 1400);
    });
  }

  /* ---------- Step 4: Confirmation ---------- */
  function renderStep4() {
    setActiveStep(4);
    var prettyDate = new Date(state.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    panels.innerHTML =
      '<div class="booking-success">' +
        '<div class="checkmark">&check;</div>' +
        '<h3 class="booking-title">You\'re Booked!</h3>' +
        '<p class="booking-sub">Thanks, ' + state.details.name.split(' ')[0] + ' — your consultation is confirmed for<br><strong>' + prettyDate + ' at ' + state.time + '</strong>.</p>' +
        '<p class="booking-sub">A confirmation will be sent to ' + state.details.email + '. Our team will reach out at ' + state.details.phone + ' if anything changes.</p>' +
        '<button type="button" class="btn btn-primary" id="booking-done" style="margin-top:10px;">Done</button>' +
      '</div>';
    document.getElementById('booking-done').addEventListener('click', close);
  }
}
