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
