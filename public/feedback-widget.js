(function () {
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') return;
  var _user = null;

  function getUser(cb) {
    if (_user) return cb(_user);
    fetch('/api/current-user')
      .then(function (r) { return r.json(); })
      .then(function (u) { _user = u; cb(u); })
      .catch(function () { cb({ email: 'unknown', name: 'Unknown' }); });
  }

  function closeAll() {
    document.querySelectorAll('.fb-dialog').forEach(function (d) { d.remove(); });
  }

  function showDialog(btn, widgetName) {
    closeAll();
    var rect = btn.getBoundingClientRect();

    var dialog = document.createElement('div');
    dialog.className = 'fb-dialog';
    dialog.style.cssText = [
      'position:fixed',
      'z-index:9999',
      'background:#fff',
      'border:1px solid #e6e6e5',
      'border-radius:10px',
      'box-shadow:0 4px 20px rgba(60,60,59,0.15)',
      'padding:16px',
      'width:280px',
      'font-family:Lato,Helvetica Neue,Arial,sans-serif',
    ].join(';');

    // Position below icon, align right edge to icon right edge
    var top = rect.bottom + window.scrollY + 6;
    var left = Math.min(rect.right - 280, window.innerWidth - 296);
    dialog.style.top = top + 'px';
    dialog.style.left = Math.max(8, left) + 'px';

    dialog.innerHTML = [
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">',
        '<span style="font-size:11px;font-weight:700;color:#3c3c3b;letter-spacing:0.04em;text-transform:uppercase;">' + widgetName + '</span>',
        '<button class="fb-close" style="background:none;border:none;cursor:pointer;font-size:16px;color:#9d9d9d;padding:0;line-height:1;">✕</button>',
      '</div>',
      '<textarea class="fb-text" placeholder="What could be improved?" style="width:100%;box-sizing:border-box;border:1px solid #e6e6e5;border-radius:6px;padding:8px;font-size:12px;font-family:inherit;resize:vertical;min-height:72px;color:#3c3c3b;outline:none;"></textarea>',
      '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;">',
        '<button class="fb-cancel" style="padding:6px 14px;border-radius:6px;border:1px solid #e6e6e5;background:#fff;color:#6d6d6c;font-size:11px;font-weight:700;cursor:pointer;">Cancel</button>',
        '<button class="fb-send" style="padding:6px 14px;border-radius:6px;border:none;background:#288184;color:#fff;font-size:11px;font-weight:700;cursor:pointer;">Send</button>',
      '</div>',
    ].join('');

    document.body.appendChild(dialog);
    dialog.querySelector('.fb-text').focus();

    dialog.querySelector('.fb-close').onclick = closeAll;
    dialog.querySelector('.fb-cancel').onclick = closeAll;

    dialog.querySelector('.fb-send').onclick = function () {
      var comment = dialog.querySelector('.fb-text').value.trim();
      if (!comment) return;
      getUser(function (user) {
        fetch('/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            widget: widgetName,
            comment: comment,
            page: window.location.pathname,
            user: user.email,
          }),
        }).then(function () {
          closeAll();
          var toast = document.createElement('div');
          toast.textContent = 'Feedback sent — thanks!';
          toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#288184;color:#fff;padding:10px 18px;border-radius:8px;font-size:12px;font-family:Lato,sans-serif;z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,0.15);';
          document.body.appendChild(toast);
          setTimeout(function () { toast.remove(); }, 3000);
        }).catch(function () { closeAll(); });
      });
    };
  }

  function wireFeedback(el) {
    var widgetName = el.getAttribute('data-feedback');
    var btn = document.createElement('button');
    btn.title = 'Give feedback on this widget';
    btn.style.cssText = [
      'background:none',
      'border:none',
      'cursor:pointer',
      'padding:2px 4px',
      'opacity:0',
      'transition:opacity 0.15s',
      'flex-shrink:0',
      'margin-left:auto',
      'display:flex',
      'align-items:center',
    ].join(';');
    btn.innerHTML = '<img src="/assets/feedback-icon.svg" style="width:16px;height:16px;opacity:0.45;" />';

    el.style.position = el.style.position || 'relative';
    el.appendChild(btn);

    el.addEventListener('mouseenter', function () { btn.style.opacity = '1'; });
    el.addEventListener('mouseleave', function () { btn.style.opacity = '0'; });
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      showDialog(btn, widgetName);
    });
  }

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.fb-dialog')) closeAll();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeAll();
  });

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-feedback]').forEach(wireFeedback);
  });
})();
