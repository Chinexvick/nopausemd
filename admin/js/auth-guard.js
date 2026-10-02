// Runs on every protected admin page. The ONE sign-in for every staff
// member (including the super admin) is against the NoPauseMD app's own
// backend/Supabase — see js/nopause-backend.js — never the website's
// Supabase directly. This file:
//   1. Verifies that sign-in and pulls the caller's role/permissions from
//      GET /v1/me.
//   2. Bridges into a website Supabase session too (api/mint-website-session.js),
//      so Orders/Products/Live Chat/Contact/Bookings/Speaking Engagements —
//      which still read the website's own database — keep working
//      unchanged, without the admin ever signing in there directly.
//   3. Reveals the dashboard shell with the Super Admin nav group physically
//      removed from the DOM (not just hidden) for anyone whose /v1/me
//      doesn't say isSuperAdmin — so non-super-admin staff never see it
//      exists at all once the page has loaded.
//
// Kept out of DOMContentLoaded so it runs as early as possible — the page
// body stays hidden (see the .auth-pending rule in style.css) until this
// either reveals it or redirects away.
(function () {
  function goToLogin(reason) {
    // Preserve the full page + query string (e.g. order-detail.html?id=...&type=order)
    // so a deep link (an email notification CTA, say) still lands on the same
    // record after signing in — not just back at overview.html. login.html
    // re-validates this value before ever using it as a redirect target.
    var page = location.pathname.split('/').pop() || 'overview.html';
    var next = encodeURIComponent(page + location.search);
    location.replace('login.html?next=' + next + (reason ? '&reason=' + reason : ''));
  }

  if (!window.NopauseBackend || !window.nopauseSb) {
    goToLogin('client_error');
    return;
  }

  // What each page needs, using the permission names the admin API returns
  // from GET /v1/me. Menu items a person can't use are removed from the page,
  // and opening one directly sends them to their own landing page.
  var PAGE_PERMISSION = {
    'overview.html': 'dashboard.read',
    'users.html': 'members.read',
    'consultations.html': 'consultations.work',
    'clinician-schedule.html': 'consultations.work',
    'content-bulk-actions.html': 'content.read',
    'evidence-library.html': 'content.read',
    'treatments.html': 'content.read',
    'supplement-library.html': 'content.read',
    'hormone-center.html': 'content.read',
    'ai-dashboard.html': 'escalations.review',
    'ai-review-queue.html': 'escalations.review',
    'safety-rules.html': 'escalations.review',
    'safety-events.html': 'escalations.review',
    'assessments.html': 'assessment.manage',
    'subscriptions.html': 'subscriptions.read',
    'analytics.html': 'dashboard.read',
    'reports.html': 'exports.create',
    'orders.html': 'dashboard.read',
    'order-detail.html': 'dashboard.read',
    'products.html': 'dashboard.read',
    'product-edit.html': 'dashboard.read',
    'live-chat.html': 'dashboard.read',
    'contact-messages.html': 'dashboard.read',
    'bookings.html': 'dashboard.read',
    'video-call.html': 'dashboard.read',
    'speaking-engagements.html': 'dashboard.read',
    'privacy-compliance.html': 'audit.read',
    'audit-log.html': 'audit.read',
    'system-health.html': 'dashboard.read',
    'admin-settings.html': 'staff.manage'
  };

  function mayOpen(info, page) {
    if (info.isSuperAdmin) return true;
    var need = PAGE_PERMISSION[page];
    return !need || info.permissions.indexOf(need) > -1;
  }

  function landingFor(info) {
    return mayOpen(info, 'overview.html') ? 'overview.html' : 'consultations.html';
  }

  function trimMenu(info) {
    document.querySelectorAll('.sidebar .nav-item').forEach(function (a) {
      var page = (a.getAttribute('href') || '').split('?')[0];
      if (page && !mayOpen(info, page)) a.remove();
    });
    document.querySelectorAll('.sidebar .nav-group').forEach(function (g) {
      if (!g.querySelector('.nav-item')) g.remove();
    });
  }

  // Always remove the Super Admin nav group from the DOM up front, before
  // anything else runs — it only gets put back (never re-inserted; it just
  // never gets removed) once /v1/me confirms isSuperAdmin below. This way a
  // non-super-admin's page never has it in the DOM at any point, not even
  // for a frame.
  var superNavGroup = document.getElementById('super-admin-nav-group');
  var superNavPlaceholder = document.createComment('super-admin-nav-group removed pending role check');
  if (superNavGroup) superNavGroup.parentNode.replaceChild(superNavPlaceholder, superNavGroup);

  NopauseBackend.getSession().then(function (session) {
    if (!session) { goToLogin(); return; }

    return NopauseBackend.api('/v1/me').then(function (me) {
      if (me.mustChangePassword) {
        // Shouldn't normally reach a dashboard page in this state (login.html
        // handles it), but if a session lingers past a password reset, send
        // them back through the proper flow rather than erroring here.
        goToLogin('password_change_required');
        return;
      }

      var adminInfo = {
        userId: me.userId,
        email: me.email,
        name: me.fullName || me.name || me.displayName || null,
        roles: me.roles || [],
        permissions: me.permissions || [],
        isSuperAdmin: !!me.isSuperAdmin
      };

      var thisPage = location.pathname.split('/').pop() || 'overview.html';
      if (!mayOpen(adminInfo, thisPage)) { location.replace(landingFor(adminInfo)); return; }
      trimMenu(adminInfo);

      if (adminInfo.isSuperAdmin && superNavPlaceholder.parentNode) {
        superNavPlaceholder.parentNode.replaceChild(superNavGroup, superNavPlaceholder);
      }

      // Bridge into a website Supabase session for the pages that still read
      // the website's own database directly. Non-fatal if it fails — those
      // specific pages will show their own "unable to load" state, but the
      // rest of the dashboard still works.
      //
      // window.CURRENT_ADMIN is deliberately NOT set until this finishes.
      // Every page script gates its data loading/saving on CURRENT_ADMIN
      // existing — if it were set earlier, a page could run a write against
      // `sb` before the bridge attaches a session to it, and that write
      // would silently affect zero rows under RLS instead of failing loudly.
      var wantsWebsite = adminInfo.isSuperAdmin || adminInfo.permissions.indexOf('dashboard.read') > -1;
      var bridged = (window.sb && wantsWebsite) ? bridgeWebsiteSession(session.access_token) : Promise.resolve();

      return bridged.finally(function () {
        window.CURRENT_ADMIN = adminInfo;
        revealDashboard(window.CURRENT_ADMIN);
      });
    }).catch(function (err) {
      if (err && err.code === 'password_change_required') { goToLogin('password_change_required'); return; }
      goToLogin('client_error');
    });
  }).catch(function () {
    goToLogin('client_error');
  });

  function bridgeWebsiteSession(accessToken) {
    return fetch('/api/mint-website-session', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken }
    }).then(function (res) {
      if (!res.ok) return null;
      return res.json();
    }).then(function (body) {
      if (!body || !body.access_token) return;
      return window.sb.auth.setSession({ access_token: body.access_token, refresh_token: body.refresh_token });
    }).catch(function () { /* see comment above — non-fatal */ });
  }

  window.nopauseSb.auth.onAuthStateChange(function (event) {
    if (event === 'SIGNED_OUT') goToLogin();
  });

  // Auto-logout after 5 hours of no activity (mouse, keyboard, touch, or scroll).
  // A fresh sign-in resets the clock; this is a rolling idle timeout, not a
  // hard session-age cap.
  var IDLE_LIMIT_MS = 5 * 60 * 60 * 1000;
  var idleTimer = null;

  function signOutEverywhere() {
    var out = [window.nopauseSb.auth.signOut()];
    if (window.sb) out.push(window.sb.auth.signOut());
    return Promise.all(out);
  }

  function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
      signOutEverywhere().finally(function () { goToLogin('idle_timeout'); });
    }, IDLE_LIMIT_MS);
  }

  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(function (evt) {
    document.addEventListener(evt, resetIdleTimer, { passive: true });
  });
  resetIdleTimer();

  function initials(email) {
    var source = (email || 'Admin').trim();
    return source.slice(0, 2).toUpperCase();
  }

  function revealDashboard(admin) {
    document.querySelectorAll('.footer-meta .name, .user-badge .u-name').forEach(function (el) {
      el.textContent = admin.name || admin.email;
    });
    document.querySelectorAll('.footer-meta .role, .user-badge .u-role').forEach(function (el) {
      el.textContent = admin.isSuperAdmin ? 'Super Admin' : (admin.roles[0] || 'Staff');
    });
    document.querySelectorAll('.avatar-circle').forEach(function (el) {
      el.textContent = initials(admin.email);
    });

    injectMobileNav();
    injectLogout();

    document.documentElement.classList.remove('auth-pending');
  }

  function injectLogout() {
    var logoutBtn = document.createElement('button');
    logoutBtn.type = 'button';
    logoutBtn.className = 'icon-btn';
    logoutBtn.title = 'Log out';
    logoutBtn.setAttribute('aria-label', 'Log out');
    logoutBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>';
    logoutBtn.addEventListener('click', function () {
      signOutEverywhere().finally(function () { location.replace('login.html'); });
    });

    document.querySelectorAll('.topbar-actions, .mobile-topbar-actions').forEach(function (el) {
      el.appendChild(logoutBtn.cloneNode(true));
    });

    document.querySelectorAll('.icon-btn[title="Log out"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        signOutEverywhere().finally(function () { location.replace('login.html'); });
      });
    });
  }

  function injectMobileNav() {
    var shell = document.querySelector('.app-shell');
    var sidebar = document.querySelector('.sidebar');
    if (!shell || !sidebar) return;

    var mobileTopbar = document.createElement('div');
    mobileTopbar.className = 'mobile-topbar';
    mobileTopbar.innerHTML =
      '<button type="button" class="hamburger-btn" id="mobile-nav-toggle" aria-label="Open menu"><span></span></button>' +
      '<div class="mobile-topbar-brand"><span class="logo-dot"></span>CliniPauseMD</div>' +
      '<div class="mobile-topbar-actions" style="width:38px;"></div>';
    shell.parentNode.insertBefore(mobileTopbar, shell);

    var backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    document.body.appendChild(backdrop);

    function closeNav() {
      sidebar.classList.remove('open');
      backdrop.classList.remove('open');
    }

    document.getElementById('mobile-nav-toggle').addEventListener('click', function () {
      sidebar.classList.add('open');
      backdrop.classList.add('open');
    });
    backdrop.addEventListener('click', closeNav);
    sidebar.querySelectorAll('.nav-item').forEach(function (a) {
      a.addEventListener('click', closeNav);
    });
  }
})();
