(function () {
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.export-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var kind = btn.getAttribute('data-export');
        var status = document.getElementById('export-status');
        status.textContent = 'Preparing export…';
        NopauseBackend.downloadCsv('/v1/exports/' + kind + '.csv')
          .then(function () { status.textContent = 'Downloaded.'; })
          .catch(function (err) { status.textContent = 'Error: ' + err.message; });
      });
    });
  });
})();
