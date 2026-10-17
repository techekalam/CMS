function showToast(msg, type) {
  type = type || 'info';
  var c = document.querySelector('.toast-container');
  if (!c) { c = document.createElement('div'); c.className = 'toast-container'; document.body.appendChild(c); }
  var t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(function(){ t.remove(); }, 3000);
}

// ── Auth guard — bfcache-aware, no flicker ──────────────────
// Hide the page instantly before anything renders
document.documentElement.style.visibility = 'hidden';

function _cmsAdminCheck() {
  var role = localStorage.getItem('cms_user_role');
  var user = localStorage.getItem('cms_logged_user');
  if (!role || !user || role !== 'admin') {
    window.location.replace('../login.html');
  } else {
    // Auth passed — reveal the page
    document.documentElement.style.visibility = 'visible';
  }
}

// Run on normal load
_cmsAdminCheck();

// Run when page is restored from bfcache (back button)
window.addEventListener('pageshow', function(e) {
  if (e.persisted) {
    document.documentElement.style.visibility = 'hidden';
    _cmsAdminCheck();
  }
});

// Disable bfcache
window.addEventListener('unload', function() {});
window.addEventListener('pagehide', function() {});


// ── Logout ───────────────────────────────────────────────────
function cmsLogout() {
  ['cms_logged_user','cms_user_role','cms_user_name','cms_student_name','cms_student_id'].forEach(function(k) { localStorage.removeItem(k); });
  window.location.replace('../login.html');
}

document.addEventListener('DOMContentLoaded',()=>{

  // Wire all logout links to use cmsLogout() instead of plain href
  document.querySelectorAll('a[href*="login.html"]').forEach(link => {
    if (link.textContent.trim().toLowerCase().includes('logout')) {
      link.addEventListener('click', e => { e.preventDefault(); cmsLogout(); });
    }
  });

  document.querySelectorAll('[data-modal-open]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const id=btn.getAttribute('data-modal-open');
      const modal=document.getElementById(id);
      if(modal) modal.classList.add('show');
    });
  });
  document.querySelectorAll('[data-modal-close]').forEach(btn=>{
    btn.addEventListener('click',()=>btn.closest('.modal-backdrop')?.classList.remove('show'));
  });
  document.querySelectorAll('.modal-backdrop').forEach(m=>{
    m.addEventListener('click',e=>{ if(e.target===m) m.classList.remove('show'); });
  });

  document.querySelectorAll('[data-filter]').forEach(input=>{
    input.addEventListener('input',()=>{
      const table=document.querySelector(input.dataset.filter);
      if(!table) return;
      const q=input.value.toLowerCase();
      table.querySelectorAll('tbody tr').forEach(tr=>tr.style.display=tr.innerText.toLowerCase().includes(q)?'':'none');
    });
  });

  document.querySelectorAll('.tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
      tab.parentElement.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
    });
  });

  const adminName = localStorage.getItem('cms_student_name') || localStorage.getItem('cms_user_name');
  if (adminName) {
    const el = document.getElementById('adminUserName');
    if (el) el.textContent = adminName;
  }
});
