// Website tools on the Notifications, Reports, System Health and Admin
// Settings pages: newsletter broadcasts, the weekly summary email, uptime
// monitoring and live website settings. Each block runs only on its page.
(function () {
  var API = 'https://www.clinipausemd.com/api/admin-actions';
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  function el(id) { return document.getElementById(id); }
  function when(iso) { return iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'; }
  function msg(id, text, ok) { var m = el(id); if (!m) return; m.textContent = text; m.className = 'od-msg ' + (ok ? 'ok' : 'err'); }

  async function post(payload) {
    var s = await sb.auth.getSession();
    var token = s.data && s.data.session && s.data.session.access_token;
    var res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(payload) });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  /* ---------- Newsletter broadcast ---------- */
  async function initBroadcast() {
    var form = el('bc-form');
    if (!form) return;
    async function loadHistory() {
      var r = await sb.from('newsletter_broadcasts').select('*').order('created_at', { ascending: false }).limit(30);
      el('bc-history').innerHTML = (r.data || []).length ? r.data.map(function (b) {
        return '<tr><td>' + when(b.created_at) + '</td><td>' + esc(b.subject) + '</td><td>' + esc(b.sent_by_name || '—') + '</td><td>' +
          (b.status === 'sent' ? b.recipients + (b.failed ? ' (' + b.failed + ' failed)' : '') : 'Sending…') + '</td></tr>';
      }).join('') : '<tr><td colspan="4" class="orders-empty">No broadcasts sent yet.</td></tr>';
    }
    var c = await sb.from('newsletter_subscribers').select('id', { count: 'exact', head: true }).or('status.is.null,status.not.in.(unsubscribed,bounced)');
    el('bc-audience').textContent = c.count != null ? c.count + ' active subscriber' + (c.count === 1 ? '' : 's') + '.' : '';
    loadHistory();

    el('bc-test').addEventListener('click', async function () {
      var b = this; b.disabled = true;
      try { var d = await post({ action: 'send_broadcast', subject: form.subject.value, body: form.body.value, test: true }); msg('bc-msg', 'Test sent to ' + d.to + '.', true); }
      catch (err) { msg('bc-msg', err.message); }
      b.disabled = false;
    });
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!confirm('Send "' + form.subject.value + '" to all newsletter subscribers now? This can\'t be undone.')) return;
      var btn = form.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Sending…';
      try {
        var d = await post({ action: 'send_broadcast', subject: form.subject.value, body: form.body.value });
        msg('bc-msg', 'Sent to ' + d.sent + ' subscriber' + (d.sent === 1 ? '' : 's') + (d.failed ? ', ' + d.failed + ' failed' : '') + '.', true);
        form.reset();
        loadHistory();
      } catch (err) { msg('bc-msg', err.message); }
      btn.disabled = false; btn.textContent = 'Send to subscribers';
    });
  }

  /* ---------- Settings (shared by Reports and Admin Settings) ---------- */
  var settings = {};
  async function loadSettings() {
    var r = await sb.from('site_settings').select('*');
    settings = {};
    (r.data || []).forEach(function (s) { settings[s.key] = s; });
    return settings;
  }
  async function saveSetting(key, value) {
    var r = await sb.rpc('update_site_setting', { p_key: key, p_value: value });
    if (r.error) throw new Error(r.error.message);
  }

  async function initWeeklyReport() {
    if (!el('wr-card')) return;
    await loadSettings();
    var box = el('wr-enabled');
    box.checked = !settings.weekly_report_enabled || settings.weekly_report_enabled.value !== false;
    box.addEventListener('change', async function () {
      try { await saveSetting('weekly_report_enabled', box.checked); msg('wr-msg', box.checked ? 'Weekly summary on.' : 'Weekly summary off.', true); }
      catch (err) { box.checked = !box.checked; msg('wr-msg', err.message); }
    });
    el('wr-send').addEventListener('click', async function () {
      var b = this; b.disabled = true;
      try {
        var d = await post({ action: 'send_report' });
        msg('wr-msg', d.sent ? 'Sent to ' + d.sent + ' recipient' + (d.sent === 1 ? '' : 's') + '.' : (d.reason || 'Nothing sent.'), !!d.sent);
      } catch (err) { msg('wr-msg', err.message); }
      b.disabled = false;
    });
  }

  async function initWebsiteSettings() {
    if (!el('ws-card')) return;
    await loadSettings();
    document.querySelectorAll('#ws-card [data-setting]').forEach(function (box) {
      var key = box.getAttribute('data-setting');
      box.checked = !settings[key] || settings[key].value !== false;
      box.addEventListener('change', async function () {
        try { await saveSetting(key, box.checked); msg('ws-msg', 'Saved.', true); showUpdated(); }
        catch (err) { box.checked = !box.checked; msg('ws-msg', err.message); }
      });
    });
    var ann = (settings.announcement && settings.announcement.value) || {};
    el('ws-ann-text').value = ann.text || '';
    el('ws-ann-on').checked = !!ann.enabled;
    function showUpdated() {
      loadSettings().then(function () {
        var latest = Object.keys(settings).map(function (k) { return settings[k]; }).filter(function (s) { return s.updated_by; })
          .sort(function (a, b) { return b.updated_at.localeCompare(a.updated_at); })[0];
        el('ws-updated').textContent = latest ? 'Last change by ' + latest.updated_by + ', ' + when(latest.updated_at) + '.' : '';
      });
    }
    showUpdated();
    async function saveAnn() {
      try { await saveSetting('announcement', { text: el('ws-ann-text').value.trim(), enabled: el('ws-ann-on').checked }); msg('ws-msg', 'Announcement saved.', true); showUpdated(); }
      catch (err) { msg('ws-msg', err.message); }
    }
    el('ws-ann-save').addEventListener('click', saveAnn);
    el('ws-ann-on').addEventListener('change', saveAnn);
  }

  /* ---------- Uptime ---------- */
  async function initUptime() {
    var grid = el('up-grid');
    if (!grid) return;
    var r = await sb.rpc('uptime_summary');
    if (r.error) { grid.innerHTML = '<div class="orders-empty">Unavailable: ' + esc(r.error.message) + '</div>'; return; }
    var list = r.data || [];
    grid.innerHTML = list.length ? list.map(function (s) {
      var up = s.uptime_24h == null ? '—' : s.uptime_24h + '%';
      return '<div class="up-card"><div class="up-head"><strong>' + esc(s.service) + '</strong><span class="ov-chip ' + (s.last_ok ? 'done' : 'live') + '">' + (s.last_ok ? 'Operational' : 'Down') + '</span></div>' +
        '<div class="up-bars">' + (s.recent || []).map(function (ok) { return '<i class="' + (ok ? 'ok' : 'bad') + '"></i>'; }).join('') + '</div>' +
        '<div class="up-stats"><div><span>' + up + '</span>24h uptime</div><div><span>' + (s.uptime_30d == null ? '—' : s.uptime_30d + '%') + '</span>30 days</div><div><span>' + (s.last_check ? new Date(s.last_check).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—') + '</span>last checked</div></div>' +
        ((s.incidents || []).length ? '<div class="od-sub">Last incident: ' + when(s.incidents[0].at) + (s.incidents[0].code ? ' (HTTP ' + s.incidents[0].code + ')' : ' (no response)') + '</div>' : '<div class="od-sub">No incidents recorded.</div>') +
        '</div>';
    }).join('') : '<div class="orders-empty">First checks are running; results appear within 5 minutes.</div>';
  }

  var tries = 0;
  var iv = setInterval(function () {
    if (window.CURRENT_ADMIN) {
      clearInterval(iv);
      initBroadcast(); initWeeklyReport(); initWebsiteSettings(); initUptime();
      if (el('up-grid')) setInterval(initUptime, 60000);
    } else if (++tries > 200) clearInterval(iv);
  }, 50);
})();
