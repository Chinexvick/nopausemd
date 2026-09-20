(function () {
  var grid = document.getElementById('products-grid');
  if (!grid) return;

  var products = [];
  var activeFilter = 'active';
  var searchTerm = '';

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(cents) { return '$' + (Number(cents || 0) / 100).toFixed(2); }
  function toCents(dollars) { return Math.round(Number(dollars) * 100); }

  function slugify(name) {
    return String(name || '').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'product';
  }

  async function loadProducts() {
    var res = await sb.from('store_products').select('*').order('sort_order', { ascending: true });
    if (res.error) {
      grid.innerHTML = '<div class="orders-empty">Unable to load products: ' + escapeHtml(res.error.message) + '</div>';
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
      grid.innerHTML = '<div class="orders-empty">No products in this view.</div>';
      return;
    }

    grid.innerHTML = visible.map(function (p) {
      return (
        '<div class="card" style="padding:0;overflow:hidden;">' +
          '<div style="height:160px;background:#f5f6f7;overflow:hidden;">' +
            (p.image_url ? '<img src="' + escapeHtml(p.image_url) + '" alt="' + escapeHtml(p.name) + '" style="width:100%;height:100%;object-fit:cover;">' : '') +
          '</div>' +
          '<div style="padding:16px;">' +
            '<div class="badge-row" style="margin-bottom:8px;">' +
              '<span class="badge ' + (p.active ? 'badge-green' : 'badge-grey') + '"><span class="badge-dot"></span>' + (p.active ? 'Active' : 'Inactive') + '</span>' +
              (p.category ? '<span class="badge badge-blue">' + escapeHtml(p.category) + '</span>' : '') +
            '</div>' +
            '<div style="font-weight:600;font-size:14px;margin-bottom:4px;">' + escapeHtml(p.name) + '</div>' +
            '<div style="font-size:13px;color:var(--text-muted);margin-bottom:10px;">' + money(p.price_cents) + '</div>' +
            '<div style="display:flex;gap:8px;">' +
              '<button type="button" class="btn btn-secondary" data-edit-id="' + p.id + '" style="flex:1;">Edit</button>' +
              '<button type="button" class="btn ' + (p.active ? 'btn-secondary' : 'btn-primary') + '" data-toggle-id="' + p.id + '" data-toggle-active="' + p.active + '" style="flex:1;">' + (p.active ? 'Deactivate' : 'Activate') + '</button>' +
            '</div>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    grid.querySelectorAll('[data-edit-id]').forEach(function (btn) {
      btn.addEventListener('click', function () { openForm(products.find(function (p) { return p.id === btn.getAttribute('data-edit-id'); })); });
    });
    grid.querySelectorAll('[data-toggle-id]').forEach(function (btn) {
      btn.addEventListener('click', function () { toggleActive(btn.getAttribute('data-toggle-id'), btn.getAttribute('data-toggle-active') !== 'true'); });
    });
  }

  async function toggleActive(id, nextActive) {
    await sb.from('store_products').update({ active: nextActive }).eq('id', id);
    loadProducts();
  }

  // ---------- Add / Edit form ----------
  var formCard = document.getElementById('product-form-card');
  var form = document.getElementById('product-form');
  var errorEl = document.getElementById('pf-error');
  var uploadedImageUrl = '';

  function openForm(product) {
    form.reset();
    errorEl.classList.remove('show');
    document.getElementById('pf-image-preview').innerHTML = '';
    uploadedImageUrl = product ? (product.image_url || '') : '';

    document.getElementById('product-form-title').textContent = product ? 'Edit Product' : 'Add Product';
    document.getElementById('pf-id').value = product ? product.id : '';
    document.getElementById('pf-name').value = product ? product.name : '';
    document.getElementById('pf-price').value = product ? (product.price_cents / 100).toFixed(2) : '';
    document.getElementById('pf-category').value = product ? (product.category || '') : '';
    document.getElementById('pf-sort').value = product ? product.sort_order : 0;
    document.getElementById('pf-description').value = product ? (product.description || '') : '';
    document.getElementById('pf-image-url').value = uploadedImageUrl;

    if (uploadedImageUrl) {
      document.getElementById('pf-image-preview').innerHTML = '<img src="' + uploadedImageUrl + '" style="max-width:160px;border-radius:8px;">';
    }

    formCard.style.display = 'block';
    formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.getElementById('add-product-btn').addEventListener('click', function () { openForm(null); });
  document.getElementById('pf-cancel').addEventListener('click', function () { formCard.style.display = 'none'; });

  document.getElementById('pf-image-file').addEventListener('change', async function (e) {
    var file = e.target.files[0];
    if (!file) return;

    var preview = document.getElementById('pf-image-preview');
    preview.innerHTML = 'Uploading…';

    var ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    var path = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;

    var uploadRes = await sb.storage.from('product-images').upload(path, file, { upsert: true, contentType: file.type });
    if (uploadRes.error) {
      preview.innerHTML = '<span style="color:#c0392b;">Upload failed: ' + escapeHtml(uploadRes.error.message) + '</span>';
      return;
    }

    var pub = sb.storage.from('product-images').getPublicUrl(path);
    uploadedImageUrl = pub.data.publicUrl;
    document.getElementById('pf-image-url').value = uploadedImageUrl;
    preview.innerHTML = '<img src="' + uploadedImageUrl + '" style="max-width:160px;border-radius:8px;">';
  });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var id = document.getElementById('pf-id').value;
    var name = document.getElementById('pf-name').value.trim();
    var priceDollars = document.getElementById('pf-price').value;
    var category = document.getElementById('pf-category').value.trim() || null;
    var sortOrder = parseInt(document.getElementById('pf-sort').value, 10) || 0;
    var description = document.getElementById('pf-description').value.trim() || null;

    if (!name || !priceDollars || isNaN(Number(priceDollars)) || Number(priceDollars) < 0) {
      errorEl.classList.add('show');
      return;
    }
    errorEl.classList.remove('show');

    var saveBtn = document.getElementById('pf-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    var payload = {
      name: name,
      price_cents: toCents(priceDollars),
      category: category,
      sort_order: sortOrder,
      description: description,
      image_url: uploadedImageUrl || null
    };

    var res;
    if (id) {
      res = await sb.from('store_products').update(payload).eq('id', id);
    } else {
      payload.slug = slugify(name) + '-' + Date.now().toString(36);
      payload.active = true;
      res = await sb.from('store_products').insert(payload);
    }

    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Product';

    if (res.error) {
      errorEl.textContent = res.error.message;
      errorEl.classList.add('show');
      return;
    }

    formCard.style.display = 'none';
    loadProducts();
  });

  document.getElementById('product-filter-pills').addEventListener('click', function (e) {
    var pill = e.target.closest('.pill');
    if (!pill) return;
    document.querySelectorAll('#product-filter-pills .pill').forEach(function (p) { p.classList.remove('active'); });
    pill.classList.add('active');
    activeFilter = pill.getAttribute('data-filter');
    render();
  });

  document.getElementById('product-search').addEventListener('input', function (e) {
    searchTerm = e.target.value.trim().toLowerCase();
    render();
  });

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
