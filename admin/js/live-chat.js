// Live chat inbox. The website assistant answers visitors first; anyone who
// asks for a real person arrives here as "Waiting" with the assistant's
// transcript and a summary. Every staff reply is stamped with the sender's
// name by the database, the first staff member to reply becomes the owner,
// and closing a chat saves a staff summary under the closer's name.
(function () {
  var listEl = document.getElementById('chat-conversations');
  if (!listEl) return;

  var headerEl = document.getElementById('chat-thread-header');
  var summaryEl = document.getElementById('chat-summary');
  var messagesEl = document.getElementById('chat-thread-messages');
  var replyForm = document.getElementById('chat-reply-form');
  var replyInput = document.getElementById('chat-reply-input');
  var quickEl = document.getElementById('chat-quick');
  var closePanel = document.getElementById('chat-close-panel');
  var closeSummary = document.getElementById('chat-close-summary');

  var conversations = [];
  var unreadByConv = {};
  var activeConvId = null;
  var searchTerm = '';
  var filter = 'waiting';
  var myId = null;
  var reloadTimer = null;

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function linkify(html) {
    return html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  }
  function timeAgo(iso) {
    if (!iso) return '';
    var mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function fmtTime(iso) {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function siteLabel(site) { return site === 'drivanah' ? 'drivanah.com' : 'clinipausemd.com'; }
  function firstName(n) { return String(n || '').split('@')[0]; }

  function state(c) {
    if (c.status === 'closed') return 'closed';
    if (c.handoff_requested_at && !c.first_response_at) return 'waiting';
    if (c.assigned_admin_name || c.first_response_at) return 'handled';
    return c.handoff_requested_at ? 'waiting' : 'open';
  }

  function scheduleReload() {
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(loadConversations, 250);
  }

  async function loadConversations() {
    var convRes = await sb.from('chat_conversations').select('*').order('last_message_at', { ascending: false }).limit(300);
    if (convRes.error) {
      listEl.innerHTML = '<div class="orders-empty">Unable to load chats: ' + escapeHtml(convRes.error.message) + '</div>';
      return;
    }
    conversations = convRes.data || [];

    var unreadRes = await sb.from('chat_messages').select('conversation_id').eq('sender_is_admin', false).eq('read_by_admin', false);
    unreadByConv = {};
    (unreadRes.data || []).forEach(function (m) { unreadByConv[m.conversation_id] = (unreadByConv[m.conversation_id] || 0) + 1; });

    var previews = {};
    var previewRes = await sb.from('chat_messages').select('conversation_id, body, sender_kind').neq('sender_kind', 'system').order('created_at', { ascending: false }).limit(600);
    (previewRes.data || []).forEach(function (m) { if (!previews[m.conversation_id]) previews[m.conversation_id] = m.body; });
    conversations.forEach(function (c) { c._preview = previews[c.id] || ''; });

    renderKpis();
    renderList();
    if (activeConvId) renderHeader();
  }

  function renderKpis() {
    var startToday = new Date(); startToday.setHours(0, 0, 0, 0);
    var weekAgo = Date.now() - 7 * 864e5;
    var waiting = 0, open = 0, closedToday = 0, frt = [];
    conversations.forEach(function (c) {
      var s = state(c);
      if (s === 'waiting') waiting++;
      if (s !== 'closed') open++;
      if (c.resolved_at && new Date(c.resolved_at) >= startToday) closedToday++;
      if (c.handoff_requested_at && c.first_response_at && new Date(c.handoff_requested_at).getTime() > weekAgo) {
        frt.push((new Date(c.first_response_at) - new Date(c.handoff_requested_at)) / 60000);
      }
    });
    document.getElementById('lc-k-waiting').textContent = waiting;
    document.getElementById('lc-k-open').textContent = open;
    document.getElementById('lc-k-today').textContent = closedToday;
    if (frt.length) {
      var avg = frt.reduce(function (a, b) { return a + b; }, 0) / frt.length;
      document.getElementById('lc-k-frt').textContent = avg < 1 ? '< 1 min' : Math.round(avg) + ' min';
    } else {
      document.getElementById('lc-k-frt').textContent = '—';
    }
    document.querySelectorAll('.lc-tab').forEach(function (t) {
      var f = t.getAttribute('data-filter');
      var n = conversations.filter(function (c) { return matchesFilter(c, f); }).length;
      t.innerHTML = t.textContent.replace(/\s*\d+$/, '') + (f !== 'all' && f !== 'closed' && n ? ' <b>' + n + '</b>' : '');
    });
  }

  function matchesFilter(c, f) {
    var s = state(c);
    if (f === 'waiting') return s === 'waiting';
    if (f === 'open') return s !== 'closed';
    if (f === 'mine') return s !== 'closed' && c.assigned_admin_id === myId;
    if (f === 'closed') return s === 'closed';
    return true;
  }

  function renderList() {
    var visible = conversations.filter(function (c) {
      if (!matchesFilter(c, filter)) return false;
      if (!searchTerm) return true;
      var hay = [c.visitor_name, c.visitor_email, c.bot_summary, c.staff_summary, c.assigned_admin_name].join(' ').toLowerCase();
      return hay.indexOf(searchTerm) > -1;
    });

    if (!visible.length) {
      var empty = { waiting: 'Nobody is waiting for a staff member right now.', mine: 'You have no open conversations.', closed: 'No closed conversations yet.' };
      listEl.innerHTML = '<div class="orders-empty">' + (empty[filter] || 'No conversations yet.') + '</div>';
      return;
    }

    listEl.innerHTML = visible.map(function (c) {
      var unread = unreadByConv[c.id] || 0;
      var s = state(c);
      var tag = s === 'waiting' ? '<span class="lc-badge waiting">Waiting ' + timeAgo(c.handoff_requested_at).replace(' ago', '') + '</span>'
        : s === 'handled' ? '<span class="lc-badge handled">' + escapeHtml(firstName(c.assigned_admin_name)) + '</span>'
        : s === 'closed' ? '<span class="lc-badge closed">Closed' + (c.resolved_by_name ? ' by ' + escapeHtml(firstName(c.resolved_by_name)) : '') + '</span>'
        : '<span class="lc-badge bot">Not assigned</span>';
      return (
        '<div class="chat-conv-item' + (c.id === activeConvId ? ' active' : '') + '" data-id="' + c.id + '">' +
          '<div class="conv-name">' + (unread ? '<span class="conv-unread-dot"></span>' : '') + escapeHtml(c.visitor_name || 'Website visitor') + '</div>' +
          '<div class="conv-preview">' + escapeHtml(c._preview || c.bot_summary || '—') + '</div>' +
          '<div class="conv-tags">' + tag + '</div>' +
          '<div class="conv-meta"><span>' + siteLabel(c.site) + '</span><span>' + timeAgo(c.last_message_at) + '</span></div>' +
        '</div>'
      );
    }).join('');
  }

  listEl.addEventListener('click', function (e) {
    var el = e.target.closest('.chat-conv-item');
    if (el) openConversation(el.getAttribute('data-id'));
  });

  function renderHeader() {
    var c = conversations.find(function (x) { return x.id === activeConvId; });
    if (!c) return;
    var s = state(c);
    var who = s === 'closed'
      ? 'Closed by ' + escapeHtml(c.resolved_by_name || 'staff') + (c.resolved_at ? ' · ' + fmtTime(c.resolved_at) : '')
      : c.assigned_admin_name ? 'Handled by ' + escapeHtml(c.assigned_admin_name) : (c.handoff_requested_at ? 'Waiting for a staff member since ' + fmtTime(c.handoff_requested_at) : 'Not assigned yet');
    headerEl.innerHTML =
      '<div class="lc-head-row"><div>' + escapeHtml(c.visitor_name || 'Website visitor') +
        (c.visitor_email ? ' <a class="lc-head-sub" href="mailto:' + escapeHtml(c.visitor_email) + '">' + escapeHtml(c.visitor_email) + '</a>' : '') +
        '<div class="lc-head-sub">' + siteLabel(c.site) + ' · started ' + fmtTime(c.created_at) + ' · ' + who + '</div></div>' +
        '<div class="lc-head-actions">' +
          (s === 'closed'
            ? '<button type="button" class="btn btn-secondary" id="lc-reopen">Reopen</button>'
            : '<button type="button" class="btn btn-secondary" id="lc-close">Close &amp; summarize</button>') +
        '</div></div>';

    var sum = '';
    if (c.bot_summary) sum += '<div class="lc-summary"><h4>Assistant summary</h4>' + escapeHtml(c.bot_summary) + '</div>';
    if (c.staff_summary) sum += '<div class="lc-summary staff"><h4>Staff summary · ' + escapeHtml(c.resolved_by_name || '') + '</h4>' + escapeHtml(c.staff_summary) + '</div>';
    summaryEl.innerHTML = sum;
    summaryEl.style.display = sum ? 'block' : 'none';

    var closed = s === 'closed';
    replyForm.style.display = closed ? 'none' : 'flex';
    quickEl.style.display = closed ? 'none' : 'flex';

    var closeBtn = document.getElementById('lc-close');
    if (closeBtn) closeBtn.onclick = function () {
      closePanel.style.display = 'flex';
      closeSummary.value = c.staff_summary || '';
      closeSummary.focus();
    };
    var reopenBtn = document.getElementById('lc-reopen');
    if (reopenBtn) reopenBtn.onclick = async function () {
      var r = await sb.from('chat_conversations').update({ status: 'open', resolved_at: null }).eq('id', c.id).select('id');
      if (r.error || !r.data || !r.data.length) { alert('Could not reopen this conversation.'); return; }
      loadConversations();
    };
  }

  async function openConversation(id) {
    activeConvId = id;
    closePanel.style.display = 'none';
    renderList();
    renderHeader();
    await loadMessages();
    await sb.from('chat_messages').update({ read_by_admin: true }).eq('conversation_id', id).eq('sender_is_admin', false).eq('read_by_admin', false);
    delete unreadByConv[id];
    renderList();
    if (window.innerWidth < 900) messagesEl.scrollIntoView({ behavior: 'smooth' });
  }

  async function loadMessages() {
    if (!activeConvId) return;
    var res = await sb.from('chat_messages').select('*').eq('conversation_id', activeConvId).order('created_at', { ascending: true });
    renderMessages(res.data || []);
  }

  function renderMessages(msgs) {
    messagesEl.innerHTML = msgs.map(function (m) {
      var kind = m.sender_kind || (m.sender_is_admin ? 'admin' : 'visitor');
      if (kind === 'system') return '<div class="chat-system-line">' + escapeHtml(m.body) + ' · ' + fmtTime(m.created_at) + '</div>';
      var who = kind === 'admin' ? escapeHtml(m.sender_name || 'Staff') : kind === 'bot' ? 'Assistant' : '';
      return '<div class="chat-bubble from-' + kind + '">' +
        (who ? '<div class="chat-bubble-who">' + who + '</div>' : '') +
        linkify(escapeHtml(m.body)).replace(/\n/g, '<br>') +
        '<div class="chat-bubble-time">' + fmtTime(m.created_at) + '</div></div>';
    }).join('');
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function sendReply(body) {
    if (!body || !activeConvId) return;
    var res = await sb.from('chat_messages').insert({ conversation_id: activeConvId, sender_is_admin: true, body: body });
    if (res.error) { alert('Message not sent: ' + res.error.message); return false; }
    return true;
  }

  replyForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var body = replyInput.value.trim();
    if (!body) return;
    replyInput.value = '';
    if (!(await sendReply(body))) replyInput.value = body;
  });

  quickEl.addEventListener('click', function (e) {
    var b = e.target.closest('[data-quick]');
    if (!b) return;
    replyInput.value = b.getAttribute('data-quick');
    replyInput.focus();
  });

  document.getElementById('chat-close-cancel').addEventListener('click', function () { closePanel.style.display = 'none'; });
  document.getElementById('chat-close-confirm').addEventListener('click', async function () {
    var text = closeSummary.value.trim();
    if (text.length < 5) { closeSummary.focus(); closeSummary.placeholder = 'Please add a short summary before closing.'; return; }
    var btn = this;
    btn.disabled = true;
    var r = await sb.rpc('resolve_chat_conversation', { p_conversation_id: activeConvId, p_summary: text });
    btn.disabled = false;
    if (r.error) { alert('Could not close: ' + r.error.message); return; }
    closePanel.style.display = 'none';
    loadConversations();
    loadMessages();
  });

  document.getElementById('chat-search').addEventListener('input', function (e) {
    searchTerm = e.target.value.trim().toLowerCase();
    renderList();
  });
  var topSearch = document.getElementById('chat-search-top');
  if (topSearch) topSearch.addEventListener('input', function (e) {
    searchTerm = e.target.value.trim().toLowerCase();
    if (searchTerm) setFilter('all');
    renderList();
  });

  function setFilter(f) {
    filter = f;
    document.querySelectorAll('.lc-tab').forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-filter') === f); });
    renderList();
  }
  document.querySelectorAll('.lc-tab').forEach(function (t) {
    t.addEventListener('click', function () { setFilter(t.getAttribute('data-filter')); });
  });

  function whenReady(cb) {
    if (window.CURRENT_ADMIN) { cb(); return; }
    var tries = 0;
    var iv = setInterval(function () {
      tries += 1;
      if (window.CURRENT_ADMIN) { clearInterval(iv); cb(); }
      else if (tries > 200) { clearInterval(iv); }
    }, 50);
  }

  whenReady(async function () {
    var u = await sb.auth.getUser();
    myId = u.data && u.data.user ? u.data.user.id : null;
    await loadConversations();
    if (!conversations.some(function (c) { return state(c) === 'waiting'; })) setFilter('open');
    var deepLink = new URLSearchParams(location.search).get('conversation');
    if (deepLink) { setFilter('all'); openConversation(deepLink); }

    sb.channel('admin-live-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, function (payload) {
        var msg = payload.new;
        if (msg.conversation_id === activeConvId) {
          loadMessages();
          if (!msg.sender_is_admin && !msg.read_by_admin) sb.from('chat_messages').update({ read_by_admin: true }).eq('id', msg.id);
        }
        scheduleReload();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_conversations' }, scheduleReload)
      .subscribe();

    setInterval(renderKpis, 60000);
  });
})();
