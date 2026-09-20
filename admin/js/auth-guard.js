// Runs on every protected admin page. There is no self-signup: the only way
// in is a session for an account that also has a row in store_admins.
// Kept out of DOMContentLoaded so it runs as early as possible — the page
// body stays hidden (see the .auth-pending rule in style.css) until this
// either reveals it or redirects away.
(function () {
  function goToLogin(reason) {
    var next = encodeURIComponent(location.pathname.split('/').pop() || 'overview.html');
    location.replace('login.html?next=' + next + (reason ? '&reason=' + reason : ''));
  }

  if (!window.sb) {
    goToLogin('client_error');
    return;
  }

  sb.auth.getSession().then(function (result) {
    var session = result.data && result.data.session;
    if (!session) { goToLogin(); return; }

    return sb.from('store_admins').select('email, full_name').eq('id', session.user.id).maybeSingle()
      .then(function (res) {
        if (res.error || !res.data) {
          sb.auth.signOut().finally(function () { goToLogin('not_admin'); });
          return;
        }
        window.CURRENT_ADMIN = res.data;
        revealDashboard(res.data);
      });
  }).catch(function () {
    goToLogin('client_error');
  });

  sb.auth.onAuthStateChange(function (event) {
    if (event === 'SIGNED_OUT') goToLogin();
  });

  function initials(name, email) {
    var source = (name || email || 'Admin').trim();
    var parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return source.slice(0, 2).toUpperCase();
  }

  function revealDashboard(admin) {
    var displayName = admin.full_name || admin.email;

    document.querySelectorAll('.footer-meta .name, .user-badge .u-name').forEach(function (el) {
      el.textContent = displayName;
    });
    document.querySelectorAll('.footer-meta .role, .user-badge .u-role').forEach(function (el) {
      el.textContent = 'Admin';
    });
    document.querySelectorAll('.avatar-circle').forEach(function (el) {
      el.textContent = initials(admin.full_name, admin.email);
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
      sb.auth.signOut().finally(function () { location.replace('login.html'); });
    });

    document.querySelectorAll('.topbar-actions, .mobile-topbar-actions').forEach(function (el) {
      el.appendChild(logoutBtn.cloneNode(true));
    });

    document.querySelectorAll('.icon-btn[title="Log out"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        sb.auth.signOut().finally(function () { location.replace('login.html'); });
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
