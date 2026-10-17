
document.addEventListener('DOMContentLoaded',()=>{

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
});
