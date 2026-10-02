(function () {
  var tbody = document.getElementById('products-tbody');
  if (!tbody) return;

  var products = [];
  var activeFilter = 'active';
  var searchTerm = '';

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(cents) { return '$' + (Number(cents || 0) / 100).toFixed(2); }

  async function loadProducts() {
    var res = await sb.from('store_products').select('*').order('sort_order', { ascending: true });
    if (res.error) {
      tbody.innerHTML = '<tr><td colspan="5" class="orders-empty">Unable to load products: ' + escapeHtml(res.error.message) + '</td></tr>';
      return;
    }
    products = res.data || [];
    render();
  }

  function matches(p) {
    if (activeFilter === 'active' && !p.active) return false;
    if (activeFilter === 'inactive' && p.active) return false;
    if (searchTerm && p.name.toLowerCase().indexOf(searchTerm) === -1) return false;
    return true;
  }

  function render() {
    var visible = products.filter(matches);
    if (!visible.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="orders-empty">No products in this view.</td></tr>';
      return;
    }

    tbody.innerHTML = visible.map(function (p) {
      var thumb = p.image_url
        ? '<img class="product-thumb" src="' + escapeHtml(p.image_url) + '" alt="">'
        : '<div class="product-thumb-placeholder"></div>';

      return (
        '<tr data-id="' + p.id + '">' +
          '<td><div class="name-cell">' + thumb + '<span class="cell-name">' + escapeHtml(p.name) + '</span></div></td>' +
          '<td>' + (p.category ? escapeHtml(p.category) : '<span class="cell-sub">—</span>') + '</td>' +
          '<td>' + money(p.price_cents) + '</td>' +
          '<td><span class="badge ' + (p.active ? 'badge-green' : 'badge-grey') + '"><span class="badge-dot"></span>' + (p.active ? 'Active' : 'Inactive') + '</span></td>' +
          '<td>' +
            '<div class="row-actions">' +
              '<span class="toggle-switch' + (p.active ? ' on' : '') + '" data-toggle-id="' + p.id + '" data-toggle-active="' + p.active + '" title="' + (p.active ? 'Deactivate' : 'Activate') + '"></span>' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' +
            '</div>' +
          '</td>' +
        '</tr>'
      );
    }).join('');

    tbody.querySelectorAll('tr[data-id]').forEach(function (row) {
      row.addEventListener('click', function (e) {
        if (e.target.closest('[data-toggle-id]')) return;
        location.href = 'product-edit.html?id=' + encodeURIComponent(row.getAttribute('data-id'));
      });
    });
    tbody.querySelectorAll('[data-toggle-id]').forEach(function (toggle) {
      toggle.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleActive(toggle.getAttribute('data-toggle-id'), toggle.getAttribute('data-toggle-active') !== 'true');
      });
    });
  }

  async function toggleActive(id, nextActive) {
    var res = await sb.from('store_products').update({ active: nextActive }).eq('id', id).select();
    if (res.error || !res.data || !res.data.length) {
      alert('Could not update this product — your session may not have permission. Please reload the page and try again.');
      return;
    }
    loadProducts();
  }

  document.getElementById('product-filter-pills').addEventListener('click', function (e) {
    var pill = e.target.closest('.pill');
    if (!pill) return;
    document.querySelectorAll('#product-filter-pills .pill').forEach(function (p) { p.classList.remove('active'); });
    pill.classList.add('active');
    activeFilter = pill.getAttribute('data-filter');
    render();
  });

  var searchInput = document.getElementById('product-search');
  if (searchInput) {
    searchInput.addEventListener('input', function (e) {
      searchTerm = e.target.value.trim().toLowerCase();
      render();
    });
  }

  function whenReady(cb) {
    if (window.CURRENT_ADMIN) { cb(); return; }
    var tries = 0;
    var iv = setInterval(function () {
      tries += 1;
      if (window.CURRENT_ADMIN) { clearInterval(iv); cb(); }
      else if (tries > 100) { clearInterval(iv); }
    }, 50);
  }

  whenReady(function () {
    loadProducts();
    sb.channel('admin-products').on('postgres_changes', { event: '*', schema: 'public', table: 'store_products' }, loadProducts).subscribe();
  });
})();
