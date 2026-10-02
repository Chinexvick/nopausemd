(function () {
  var form = document.getElementById('product-form');
  if (!form) return;

  var params = new URLSearchParams(location.search);
  var productId = params.get('id');
  var uploadedImageUrl = '';
  var isActive = true;

  var errorEl = document.getElementById('pf-error');
  var titleEl = document.getElementById('product-edit-title');
  var activeRow = document.getElementById('pf-active-row');
  var activeToggle = document.getElementById('pf-active-toggle');

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toCents(dollars) { return Math.round(Number(dollars) * 100); }

  function slugify(name) {
    return String(name || '').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'product';
  }

  async function loadProduct() {
    if (!productId) {
      // New product — the active toggle doesn't apply yet (every new
      // product starts active), so it stays hidden until there's something
      // to toggle.
      return;
    }

    var res = await sb.from('store_products').select('*').eq('id', productId).maybeSingle();
    if (res.error || !res.data) {
      errorEl.textContent = 'Could not load this product' + (res.error ? ': ' + res.error.message : ' — it may have been removed') + '.';
      errorEl.style.display = 'block';
      form.querySelector('#pf-save').disabled = true;
      return;
    }

    var p = res.data;
    titleEl.textContent = 'Edit Product';
    document.getElementById('pf-id').value = p.id;
    document.getElementById('pf-name').value = p.name;
    document.getElementById('pf-price').value = (p.price_cents / 100).toFixed(2);
    document.getElementById('pf-category').value = p.category || '';
    document.getElementById('pf-sort').value = p.sort_order;
    document.getElementById('pf-description').value = p.description || '';

    uploadedImageUrl = p.image_url || '';
    document.getElementById('pf-image-url').value = uploadedImageUrl;
    if (uploadedImageUrl) {
      document.getElementById('pf-image-preview').innerHTML = '<img src="' + escapeHtml(uploadedImageUrl) + '" style="max-width:160px;border-radius:8px;">';
    }

    isActive = !!p.active;
    activeToggle.classList.toggle('on', isActive);
    activeRow.style.display = 'flex';
  }

  activeToggle.addEventListener('click', function () {
    isActive = !isActive;
    activeToggle.classList.toggle('on', isActive);
  });

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
    preview.innerHTML = '<img src="' + escapeHtml(uploadedImageUrl) + '" style="max-width:160px;border-radius:8px;">';
  });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var name = document.getElementById('pf-name').value.trim();
    var priceDollars = document.getElementById('pf-price').value;
    var category = document.getElementById('pf-category').value.trim() || null;
    var sortOrder = parseInt(document.getElementById('pf-sort').value, 10) || 0;
    var description = document.getElementById('pf-description').value.trim() || null;

    if (!name || !priceDollars || isNaN(Number(priceDollars)) || Number(priceDollars) < 0) {
      errorEl.textContent = 'Please fill in the product name and a valid price.';
      errorEl.style.display = 'block';
      return;
    }
    errorEl.style.display = 'none';

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
    if (productId) {
      payload.active = isActive;
      // .select() matters here: without it, Supabase reports "success" even
      // when row-level security silently excluded the row and zero rows
      // were actually updated — this is exactly how a permissions problem
      // can look like a successful save that quietly did nothing.
      res = await sb.from('store_products').update(payload).eq('id', productId).select();
    } else {
      payload.slug = slugify(name) + '-' + Date.now().toString(36);
      payload.active = true;
      res = await sb.from('store_products').insert(payload).select();
    }

    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Product';

    if (res.error) {
      errorEl.textContent = res.error.message;
      errorEl.style.display = 'block';
      return;
    }
    if (!res.data || !res.data.length) {
      errorEl.textContent = 'Nothing was saved — your session may not have permission to make this change. Please reload the page and try again.';
      errorEl.style.display = 'block';
      return;
    }

    location.href = 'products.html';
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

  whenReady(loadProduct);
})();
