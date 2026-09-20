// Shared across every admin page: lights up a green dot on Live Chat,
// Contact Form, and Speaking Engagements nav items whenever there's
// something new, and keeps it live via Realtime.
(function () {
  function setBadge(key, on) {
    document.querySelectorAll('.nav-badge[data-badge-for="' + key + '"]').forEach(function (el) {
      el.classList.toggle('show', !!on);
    });
  }

  async function refreshChat() {
    var res = await sb.from('chat_messages').select('id', { count: 'exact', head: true }).eq('sender_is_admin', false).eq('read_by_admin', false);
    setBadge('live-chat', (res.count || 0) > 0);
  }

  async function refreshContact() {
    var res = await sb.from('contact_messages').select('id', { count: 'exact', head: true }).eq('status', 'new');
    setBadge('contact-messages', (res.count || 0) > 0);
  }

  async function refreshSpeaking() {
    var res = await sb.from('speaking_engagement_requests').select('id', { count: 'exact', head: true }).eq('status', 'new');
    setBadge('speaking-engagements', (res.count || 0) > 0);
  }

  function refreshAll() {
    refreshChat();
    refreshContact();
    refreshSpeaking();
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
    refreshAll();
    sb.channel('admin-nav-badges')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, refreshChat)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_messages' }, refreshContact)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'speaking_engagement_requests' }, refreshSpeaking)
      .subscribe();
  });
})();
