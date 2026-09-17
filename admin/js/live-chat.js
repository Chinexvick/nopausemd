(function () {
  var listEl = document.getElementById('chat-conversations');
  if (!listEl) return;

  var headerEl = document.getElementById('chat-thread-header');
  var messagesEl = document.getElementById('chat-thread-messages');
  var replyForm = document.getElementById('chat-reply-form');
  var replyInput = document.getElementById('chat-reply-input');

  var conversations = [];
  var unreadByConv = {};
  var activeConvId = null;
  var searchTerm = '';

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function timeAgo(iso) {
    var diff = Date.now() - new Date(iso).getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function siteLabel(site) { return site === 'drivanah' ? 'drivanah.com' : 'clinipausemd.com'; }

  async function loadConversations() {
    var convRes = await sb.from('chat_conversations').select('*').order('last_message_at', { ascending: false }).limit(200);
    if (convRes.error) {
      listEl.innerHTML = '<div class="orders-empty">Unable to load chats: ' + escapeHtml(convRes.error.message) + '</div>';
      return;
    }
    conversations = convRes.data || [];

    var unreadRes = await sb.from('chat_messages').select('conversation_id').eq('sender_is_admin', false).eq('read_by_admin', false);
    unreadByConv = {};
    (unreadRes.data || []).forEach(function (m) {
      unreadByConv[m.conversation_id] = (unreadByConv[m.conversation_id] || 0) + 1;
    });

    var previews = {};
    var previewRes = await sb.from('chat_messages').select('conversation_id, body, created_at').order('created_at', { ascending: false }).limit(500);
    (previewRes.data || []).forEach(function (m) {
      if (!previews[m.conversation_id]) previews[m.conversation_id] = m.body;
    });
    conversations.forEach(function (c) { c._preview = previews[c.id] || ''; });

    renderList();
  }

  function renderList() {
    var visible = conversations.filter(function (c) {
      if (!searchTerm) return true;
      var hay = ((c.visitor_name || '') + ' ' + (c.visitor_email || '')).toLowerCase();
      return hay.indexOf(searchTerm) > -1;
    });

    if (!visible.length) {
      listEl.innerHTML = '<div class="orders-empty">No conversations yet.</div>';
      return;
    }

    listEl.innerHTML = visible.map(function (c) {
      var unread = unreadByConv[c.id] || 0;
      return (
        '<div class="chat-conv-item' + (c.id === activeConvId ? ' active' : '') + '" data-id="' + c.id + '">' +
          '<div class="conv-name">' + (unread ? '<span class="conv-unread-dot"></span>' : '') + escapeHtml(c.visitor_name || 'Website visitor') + '</div>' +
          '<div class="conv-preview">' + escapeHtml(c._preview || '—') + '</div>' +
          '<div class="conv-meta"><span>' + siteLabel(c.site) + '</span><span>' + timeAgo(c.last_message_at) + '</span></div>' +
        '</div>'
      );
    }).join('');

    listEl.querySelectorAll('.chat-conv-item').forEach(function (el) {
      el.addEventListener('click', function () { openConversation(el.getAttribute('data-id')); });
    });
  }

  async function openConversation(id) {
    activeConvId = id;
    renderList();
    var conv = conversations.find(function (c) { return c.id === id; });
    headerEl.textContent = (conv ? (conv.visitor_name || 'Website visitor') + ' — ' + siteLabel(conv.site) : 'Conversation') +
      (conv && conv.visitor_email ? ' (' + conv.visitor_email + ')' : '');
    replyForm.style.display = 'flex';

    var res = await sb.from('chat_messages').select('*').eq('conversation_id', id).order('created_at', { ascending: true });
    renderMessages(res.data || []);

    await sb.from('chat_messages').update({ read_by_admin: true }).eq('conversation_id', id).eq('sender_is_admin', false).eq('read_by_admin', false);
    delete unreadByConv[id];
    renderList();
  }

  function renderMessages(msgs) {
    messagesEl.innerHTML = msgs.map(function (m) {
      return '<div class="chat-bubble from-' + (m.sender_is_admin ? 'admin' : 'visitor') + '">' + escapeHtml(m.body) +
        '<div class="chat-bubble-time">' + new Date(m.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) + '</div></div>';
    }).join('');
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  replyForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var body = replyInput.value.trim();
    if (!body || !activeConvId) return;
    replyInput.value = '';
    await sb.from('chat_messages').insert({ conversation_id: activeConvId, sender_is_admin: true, body: body });
    await sb.from('chat_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', activeConvId);
  });

  document.getElementById('chat-search').addEventListener('input', function (e) {
    searchTerm = e.target.value.trim().toLowerCase();
    renderList();
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
    loadConversations();

    sb.channel('admin-live-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, function (payload) {
        var msg = payload.new;
        if (msg.conversation_id === activeConvId) {
          sb.from('chat_messages').select('*').eq('conversation_id', activeConvId).order('created_at', { ascending: true })
            .then(function (res) { renderMessages(res.data || []); });
          if (!msg.sender_is_admin) {
            sb.from('chat_messages').update({ read_by_admin: true }).eq('id', msg.id);
          }
        }
        loadConversations();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_conversations' }, loadConversations)
      .subscribe();
  });
})();
