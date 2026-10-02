// CliniPauseMD Admin — shared interactivity
document.addEventListener('DOMContentLoaded', function () {
  // Tab strips / pills — toggle .active within same group on click
  document.querySelectorAll('[data-tab-group]').forEach(function (group) {
    var items = group.querySelectorAll('[data-tab]');
    items.forEach(function (item) {
      item.addEventListener('click', function (e) {
        // allow real navigation if href is set to a real page
        var href = item.getAttribute('href');
        if (href && href !== '#') return;
        e.preventDefault();
        items.forEach(function (i) { i.classList.remove('active'); });
        item.classList.add('active');
      });
    });
  });

  // Toggle switches
  document.querySelectorAll('.toggle-switch').forEach(function (t) {
    t.addEventListener('click', function () {
      t.classList.toggle('on');
    });
  });

  // Checkbox boxes
  document.querySelectorAll('.checkbox-box').forEach(function (c) {
    c.addEventListener('click', function () {
      c.classList.toggle('checked');
    });
  });
});

// Top search bar on pages that don't have their own search: Enter looks the
// term up across members and website customers on the Users page.
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.topbar .search-input:not([id])').forEach(function (input) {
    input.placeholder = 'Search members and customers…';
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && input.value.trim()) location.href = 'users.html?q=' + encodeURIComponent(input.value.trim());
    });
  });
});

// Live staff alerts (new consultation requests, assignments, messages) on every page.
(function () {
  if (document.querySelector('script[src$="staff-alerts.js"]')) return;
  var s = document.createElement('script');
  s.src = 'js/staff-alerts.js';
  document.head.appendChild(s);
})();
