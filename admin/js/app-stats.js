// Fills the app figures on the AI, Assessments, Safety and Subscriptions
// pages from staff-only reporting functions in the app database. Each block
// only runs when its elements are on the page.
(function () {
  function el(id) { return document.getElementById(id); }
  function set(id, v) { var e = el(id); if (e) e.textContent = v == null ? '—' : v; }
  function pct(v) { return v == null ? '—' : v + '%'; }
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  function fail(ids) { ids.forEach(function (id) { set(id, '—'); set(id + '-sub', 'Unavailable'); }); }
  var SOURCE = { ai: 'AI coach', tracking: 'Symptom tracking', assessment: 'Assessments', appointments: 'Appointment requests' };

  function load() {
    if (el('ai-answers')) {
      NopauseBackend.rpc('admin_ai_stats', { p_days: 30 }).then(function (d) {
        set('ai-answers', d.answers);
        set('ai-answers-sub', d.questions + ' questions from ' + d.conversations + ' conversations');
        set('ai-review', d.unreviewed_answers);
        set('ai-noevidence', d.no_evidence);
        set('ai-unavailable', d.unavailable);
      }).catch(function () { fail(['ai-answers', 'ai-review', 'ai-noevidence', 'ai-unavailable']); });
    }

    if (el('as-started')) {
      NopauseBackend.rpc('admin_assessment_stats', { p_days: 30 }).then(function (d) {
        set('as-started', d.started);
        set('as-rate', pct(d.completion_rate));
        set('as-rate-sub', d.completed + ' submitted' + (d.flagged ? ' · ' + d.flagged + ' safety-flagged' : ''));
        set('as-drop', d.completion_rate == null ? '—' : (100 - d.completion_rate) + '%');
        set('as-time', d.avg_minutes == null ? '—' : (d.avg_minutes < 1 ? 'Under 1 min' : d.avg_minutes + ' min'));
      }).catch(function () { fail(['as-started', 'as-rate', 'as-drop', 'as-time']); });
    }

    if (el('sf-total')) {
      NopauseBackend.rpc('admin_safety_stats', { p_days: 30 }).then(function (d) {
        set('sf-total', d.total);
        set('sf-urgent', d.urgent_open);
        set('sf-reviewed', d.reviewed);
        set('sf-emergency', d.emergency_assessments);
        var src = d.by_source || {};
        el('sf-sources').innerHTML = Object.keys(SOURCE).map(function (k) {
          return '<div class="lc-kpi"><span>' + (src[k] || 0) + '</span><label>' + SOURCE[k] + '</label></div>';
        }).join('');
        el('sf-recent').innerHTML = (d.recent || []).length ? d.recent.map(function (r) {
          return '<div class="timeline-item"><div class="t-dot"></div><div class="t-body"><div class="t-title">Safety flag · ' + esc(SOURCE[r.source] || r.source) + '</div>' +
            '<div class="t-time">' + new Date(r.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + '</div></div></div>';
        }).join('') : '<div class="orders-empty">No safety flags yet.</div>';
      }).catch(function (err) {
        fail(['sf-total', 'sf-urgent', 'sf-reviewed', 'sf-emergency']);
        if (el('sf-recent')) el('sf-recent').innerHTML = '<div class="orders-empty">Unavailable: ' + esc(err.message) + '</div>';
      });
    }

    if (el('sub-churn')) {
      NopauseBackend.rpc('admin_subscription_stats').then(function (d) {
        set('sub-churn', d.churn_rate == null ? 'No data yet' : d.churn_rate + '%');
        set('sub-churn-sub', d.cancelled_30d + ' cancelled · ' + d.cancelling + ' cancelling at period end');
        set('sub-trial', d.trial_conversion == null ? 'No data yet' : d.trial_conversion + '%');
        set('sub-trial-sub', d.trials_ended_90d + ' trials ended in the last 90 days');
      }).catch(function () { fail(['sub-churn', 'sub-trial']); });
    }
  }

  var tries = 0;
  var iv = setInterval(function () {
    if (window.CURRENT_ADMIN) { clearInterval(iv); load(); }
    else if (++tries > 200) clearInterval(iv);
  }, 50);
})();
