// Coordinator Dashboard Logic
const SUPABASE_URL = 'https://ygkwjlfhwtwkxtdvjzfc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_cnfuCpwVHpcWEkXye0KP-w_Vsy3NAqs';
let sb = null;
try { sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); } catch(e) {}

const COORDINATOR_NAME = localStorage.getItem('cms_user_name') || '';
const COORDINATOR_ID   = localStorage.getItem('cms_logged_user') || '';
const coNameEl = document.getElementById('coName');
const coIdEl = document.getElementById('coId');
if (coNameEl) coNameEl.textContent = COORDINATOR_NAME;
if (coIdEl) coIdEl.textContent = COORDINATOR_ID;

let intakes = [];
// Lowest group mark (out of 100) that earns certificates once the group is COMPLETE.
const CERT_MIN_MARK = 0;
const COURSE_NAMES = {BSCS:'Bachelor of Science in Computer Science', BSSE:'Bachelor of Science in Software Engineering', BSIT:'Bachelor of Science in Information Technology'};
const STUDENT_ID = new URLSearchParams(location.search).get('student');

let groups = [];
let defenses = [];
let pendingMarksList = [];
let decisions = {defense:{}, marks:{}};
let legacyBoardsList = [];
let certList = [];

// ---- Notification helpers ----
const EDGE_FN_URL = `${SUPABASE_URL}/functions/v1/send-notification`;
const createNotification = async (email, title, message, type = 'info') => {
  if (!sb) return;
  try {
    // Save to DB for record-keeping
    await sb.from('notifications').insert({
      recipient_email: email, title, message, type, read: false,
      created_at: new Date().toISOString()
    });
    // Call Edge Function directly to send the email — no webhook needed
    await fetch(EDGE_FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ email, title, message })
    });
  } catch(e) {}
};
const getEmailByStudentId = async (studentId) => {
  if (!sb) return null;
  try {
    const { data, error } = await sb.from('profiles').select('email').eq('student_id', studentId).single();
    if (error) return null;
    return data?.email || null;
  } catch(e) { return null; }
};

function renderDefenses(){
  const defenseRowsEl = document.getElementById('defenseRows');
  if(!defenseRowsEl) return;
  defenseRowsEl.innerHTML = defenses.map(d => `
    <tr><td><b>${esc(d.student)}</b></td><td>${esc(d.group)}</td><td>${esc(d.supervisor)}</td><td>${esc(d.submitted)}</td>
      <td style="text-align:right"><div class="actions">
        <button class="btn-err" onclick="reviewDefense('${d.id}',false)">Reject</button>
        <button class="btn-ok" onclick="reviewDefense('${d.id}',true)">Approve</button></div></td></tr>
  `).join('') || `<tr><td colspan="5" style="color:var(--muted)">No defenses pending review.</td></tr>`;
  const cardDefensesEl = document.getElementById('cardDefenses');
  if(cardDefensesEl) cardDefensesEl.textContent = defenses.length;
  persistLocal();
}
async function reviewDefense(id, approve){
  const dd = defenses.find(d=>d.id===id); if(dd) decisions.defense[dd.student] = approve ? 'APPROVED' : 'REJECTED';
  defenses = defenses.filter(d=>d.id!==id);
  if(sb) await sb.from('student_status').update({defense_status: approve?'APPROVED':'REJECTED'}).eq('student_id', dd ? dd.studentId || id : id);
  // Notify student by email
  if(dd && dd.studentId){
    const email = await getEmailByStudentId(dd.studentId);
    if(email){
      await createNotification(email,
        approve ? 'Defense Approved ✅' : 'Defense Returned ❌',
        approve
          ? `Hi ${dd.student}, your oral defense submission has been approved by the coordinator. Congratulations!`
          : `Hi ${dd.student}, your oral defense submission has been sent back for revision. Please contact your supervisor for next steps.`,
        approve ? 'success' : 'warning'
      );
    }
  }
  banner('banner-defenses', approve?'Defense approved.':'Defense sent back to supervisor.', approve?'ok':'err');
  renderDefenses();
}

function renderMarks(){
  const markRowsEl = document.getElementById('markRows');
  if(!markRowsEl) return;
  markRowsEl.innerHTML = pendingMarksList.map(m => `
    <tr><td><b>${esc(m.student)}</b></td><td>${esc(m.group)}</td><td>${esc(m.supervisor)}</td><td>${m.total}/100</td>
      <td style="text-align:right"><button class="btn-ok" onclick="approveMark('${m.id}')">Approve</button></td></tr>
  `).join('') || `<tr><td colspan="5" style="color:var(--muted)">No marks awaiting approval.</td></tr>`;
  const cardMarksEl = document.getElementById('cardMarks');
  if(cardMarksEl) cardMarksEl.textContent = pendingMarksList.length;
  persistLocal();
}
async function approveMark(id){
  const mm = pendingMarksList.find(m=>m.id===id); if(mm) decisions.marks[mm.student] = true;
  pendingMarksList = pendingMarksList.filter(m=>m.id!==id);
  if(sb) await sb.from('marks').update({is_approved:true}).eq('id', id);
  // Notify student by email
  if(mm && mm.studentId){
    const email = await getEmailByStudentId(mm.studentId);
    if(email){
      await createNotification(email,
        'Marks Approved ✅',
        `Hi ${mm.student}, your marks (${mm.total}/100) have been approved by the coordinator. Your group completion is being processed.`,
        'success'
      );
    }
  }
  banner('banner-marks','Marks approved.', 'ok'); renderMarks();
}

let openBoardId = null;
const boardCount = b => (b.entries||[]).length;
function renderLegacy(){
  const legacyRowsEl = document.getElementById('legacyRows');
  if(!legacyRowsEl) return;
  legacyRowsEl.innerHTML = legacyBoardsList.map(b => `
    <tr><td><b>${esc(b.title)}</b></td><td>${esc(b.year)}</td><td>${esc(b.cohort)}</td>
      <td><button class="btn-ghost" onclick="openBoard('${b.id}')">${boardCount(b)} record${boardCount(b)===1?'':'s'}</button></td>
      <td style="text-align:right"><button class="btn-primary" onclick="openBoard('${b.id}')">Open</button></td></tr>
  `).join('') || `<tr><td colspan="5" style="color:var(--muted)">No legacy boards yet.</td></tr>`;
  const cardLegacyEl = document.getElementById('cardLegacy');
  if(cardLegacyEl) cardLegacyEl.textContent = legacyBoardsList.length;
  persistLocal();
  if(openBoardId) refreshBoard();
}
function openBoard(id){ openBoardId = id; document.getElementById('boardSearch').value=''; banner('banner-legacy-board',''); renderBoard(); navigate('legacy-board'); }
function refreshBoard(){ if(document.getElementById('view-legacy-board').classList.contains('active')) renderBoard(); }
function renderBoard(){
  const b = legacyBoardsList.find(x=>x.id===openBoardId);
  if(!b){ openBoardId = null; navigate('legacy'); return; }
  document.getElementById('boardTitle').textContent = b.title;
  document.getElementById('boardMeta').textContent = `${b.year} · ${b.cohort} · ${boardCount(b)} record${boardCount(b)===1?'':'s'}`;
  const q = document.getElementById('boardSearch').value.toLowerCase();
  const list = (b.entries||[]).filter(r => !q || [r.name,r.studentId,r.course,r.group,r.project].some(v=>(v||'').toLowerCase().includes(q)))
    .sort((a,c)=>a.name.localeCompare(c.name));
  document.getElementById('boardRows').innerHTML = list.map(r => `
    <tr><td><b>${esc(r.name)}</b><div class="note" style="margin:2px 0 0">${esc(r.studentId||'No ID')}</div></td><td>${esc(r.course)}</td><td>${esc(r.group||'—')}</td><td>${esc(r.project||'—')}</td><td>${r.mark}/100</td>
      <td style="text-align:right"><div class="actions" style="justify-content:flex-end">
        <button class="btn-primary" onclick="openRecord('${r.id}')">Edit</button>
        <button class="btn-err" onclick="confirmDeleteRecord('${r.id}')">Delete</button></div></td></tr>
  `).join('') || `<tr><td colspan="6" style="color:var(--muted)">${(b.entries||[]).length ? 'No records match.' : 'No records yet. Click "+ Add Record".'}</td></tr>`;
}
const boardSearchEl = document.getElementById('boardSearch');
if(boardSearchEl) boardSearchEl.addEventListener('input', renderBoard);

function openRecord(recId){
  const b = legacyBoardsList.find(x=>x.id===openBoardId);
  const cur = recId ? b.entries.find(x=>x.id===recId) : null;
  showModal(`<h3>${cur?'Edit Record':'Add Record'}</h3>
    <div class="field"><label>Student Name</label><input id="rcName" value="${esc(cur?cur.name:'')}"></div>
    <div class="grid2">
      <div class="field"><label>Student ID</label><input id="rcId" value="${esc(cur?cur.studentId:'')}"></div>
      <div class="field"><label>Course</label><select id="rcCourse">${Object.keys(COURSE_NAMES).map(c=>`<option ${cur&&cur.course===c?'selected':''}>${c}</option>`).join('')}</select></div>
    </div>
    <div class="grid2">
      <div class="field"><label>Group</label><input id="rcGroup" value="${esc(cur?cur.group:'')}" placeholder="e.g. GRP-02"></div>
      <div class="field"><label>Mark (out of 100)</label><input type="number" id="rcMark" min="0" max="100" step="1" value="${cur?cur.mark:''}"></div>
    </div>
    <div class="field"><label>Project Title</label><input id="rcProject" value="${esc(cur?cur.project:'')}"></div>
    <div id="rcErr" style="color:var(--err);font-size:12px;min-height:16px"></div>
    <div class="modal-actions" style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="saveRecord(${recId ? `'${recId}'` : 'null'})">${cur ? 'Save Changes' : 'Add Record'}</button>
    </div>`);
}
async function saveRecord(recId){
  const b = legacyBoardsList.find(x=>x.id===openBoardId);
  const err = m => { document.getElementById('rcErr').textContent = m; };
  const rec = {id: recId || 'r'+Date.now()+Math.floor(Math.random()*1000),
    name:document.getElementById('rcName').value.trim(), studentId:document.getElementById('rcId').value.trim(),
    course:document.getElementById('rcCourse').value, group:document.getElementById('rcGroup').value.trim(),
    project:document.getElementById('rcProject').value.trim(), mark:Number(document.getElementById('rcMark').value)};
  const rawMark = document.getElementById('rcMark').value.trim();
  if(!rec.name) return err('Enter the student name.');
  if(rawMark==='' || isNaN(rec.mark) || rec.mark<0 || rec.mark>100) return err('Mark must be a number from 0 to 100.');
  if(rec.studentId && b.entries.some(x=>x.id!==rec.id && x.studentId.toLowerCase()===rec.studentId.toLowerCase())) return err('A record with this student ID already exists on this board.');
  if(recId) b.entries[b.entries.findIndex(x=>x.id===recId)] = rec; else b.entries.push(rec);
  if(LIVE_DB) { try{ await sb.from('legacy_board_records').upsert({id:rec.id, board_id:b.id, student_name:rec.name, student_id:rec.studentId, course:rec.course, group_number:rec.group, project_title:rec.project, mark:rec.mark}); }catch(e){} }
  closeModal(); banner('banner-legacy-board', recId?'Record updated.':'Record added.', 'ok'); renderLegacy(); renderBoard();
}
function confirmDeleteRecord(recId){
  const b = legacyBoardsList.find(x=>x.id===openBoardId), r = b.entries.find(x=>x.id===recId); if(!r) return;
  showModal(`<h3>Delete this record?</h3>
    <p class="note"><b>${esc(r.name)}</b><br>${esc(r.studentId||'No ID')} &middot; ${esc(r.course)} &middot; ${r.mark}/100</p>
    <div class="modal-actions" style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-err" onclick="deleteRecord('${recId}')">Delete Record</button>
    </div>`);
}
async function deleteRecord(recId){
  const b = legacyBoardsList.find(x=>x.id===openBoardId);
  b.entries = b.entries.filter(x=>x.id!==recId);
  if(LIVE_DB) { try{ await sb.from('legacy_board_records').delete().eq('id', recId); }catch(e){} }
  closeModal(); banner('banner-legacy-board','Record deleted.', 'ok'); renderLegacy(); renderBoard();
}
function openNewBoard(){
  showModal(`<h3>New Legacy Board</h3>
    <div class="field"><label>Board Title</label><input id="lbTitle" value="Official Capstone Assessment Board 2026/2027"></div>
    <div class="grid2">
      <div class="field"><label>Academic Year</label><input id="lbYear" value="2026/2027"></div>
      <div class="field"><label>Cohort</label><input id="lbCohort" value="BSc CS & IT / SE Cohort"></div>
    </div>
    <div class="modal-actions" style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="saveBoard()">Create Board</button>
    </div>`);
}
async function saveBoard(){
  const rec = {id:'lb'+Date.now(), title:document.getElementById('lbTitle').value.trim(),
    year:document.getElementById('lbYear').value.trim(), cohort:document.getElementById('lbCohort').value.trim(), entries:[]};
  if(!rec.title) return;
  legacyBoardsList.push(rec);
  if(LIVE_DB) { try{ await sb.from('legacy_boards').insert({id:rec.id, title:rec.title, year:rec.year, cohort:rec.cohort}); }catch(e){} }
  closeModal(); banner('banner-legacy','Legacy board created. Open it to add records.', 'ok'); renderLegacy();
}

const LIVE_DB = !!sb && SUPABASE_URL !== 'YOUR_SUPABASE_URL';
const LOCAL_KEY = 'capstone-coordinator-state-v1';
function persistLocal(){
  refreshStudents();
  if(LIVE_DB) return;
  try{ localStorage.setItem(LOCAL_KEY, JSON.stringify({groups, certList, intakes, defenses, pendingMarksList, decisions, legacyBoardsList})); }catch(e){}
}
function loadLocal(){
  if(LIVE_DB) return;
  try{
    const s = JSON.parse(localStorage.getItem(LOCAL_KEY)||'null');
    if(s && s.groups && s.certList){ groups = s.groups; certList = s.certList; }
    if(s && s.intakes && s.intakes.length) intakes = s.intakes;
    if(s && s.defenses) defenses = s.defenses;
    if(s && s.pendingMarksList) pendingMarksList = s.pendingMarksList;
    if(s && s.decisions) decisions = s.decisions;
    if(s && s.legacyBoardsList && s.legacyBoardsList.length) legacyBoardsList = s.legacyBoardsList;
  }catch(e){}
}

let stuFilter = 'all';
function buildRoster(){
  const roster = [], byName = {};
  groups.forEach(g => (g.students||[]).forEach(s => { const r={name:s.name, id:s.id, course:s.course, group:g.number, g}; roster.push(r); byName[s.name]=r; }));
  const add = (name, group) => { if(!byName[name]){ const r={name, id:null, course:'—', group:group||'—', g:groups.find(x=>x.number===group)||null}; roster.push(r); byName[name]=r; } };
  defenses.forEach(d => add(d.student, d.group));
  pendingMarksList.forEach(m => add(m.student, m.group));
  Object.keys(decisions.defense).concat(Object.keys(decisions.marks)).forEach(n => add(n, null));
  return roster;
}
function studentState(r){
  const defPending = defenses.some(d=>d.student===r.name);
  const defDec = decisions.defense[r.name];
  const mkPending = pendingMarksList.some(m=>m.student===r.name);
  const cert = r.id ? certList.find(c=>c.studentId===r.id) : null;
  const groupOpen = r.g ? !(r.g.status==='COMPLETE' && r.g.mark!=null) : false;
  const w = {defense: defPending || defDec==='REJECTED', marks: mkPending, group: groupOpen};
  const completed = !!cert;
  return {defPending, defDec, mkPending, mkDone: !!decisions.marks[r.name], cert, w, completed,
    pending: !completed && (w.defense || w.marks || w.group)};
}
function setStuFilter(f){ stuFilter = f; renderStudents(); }
function refreshStudents(){ if(document.getElementById('stuRows')) renderStudents(); }
function renderStudents(){
  const stuSearchEl = document.getElementById('stuSearch');
  if(!stuSearchEl) return;
  const q = (stuSearchEl.value||'').toLowerCase();
  const rows = buildRoster().map(r => ({r, s: studentState(r)}));
  const counts = {
    all: rows.length, pending: rows.filter(x=>x.s.pending).length,
    defense: rows.filter(x=>!x.s.completed && x.s.w.defense).length,
    marks: rows.filter(x=>!x.s.completed && x.s.w.marks).length,
    group: rows.filter(x=>!x.s.completed && x.s.w.group).length,
    completed: rows.filter(x=>x.s.completed).length };
  const chips = [['all','All'],['pending','Pending'],['defense','Defense pending'],['marks','Marks pending'],['group','Group in progress'],['completed','Completed']];
  const stuChipsEl = document.getElementById('stuChips');
  if(stuChipsEl) {
    stuChipsEl.innerHTML = chips.map(([k,l]) =>
      `<button class="${stuFilter===k?'btn-primary':'btn-ghost'}" onclick="setStuFilter('${k}')">${l} (${counts[k]})</button>`).join('');
  }
  const shown = rows.filter(({r,s}) => {
    if(stuFilter==='pending' && !s.pending) return false;
    if(stuFilter==='completed' && !s.completed) return false;
    if(['defense','marks','group'].includes(stuFilter) && !(!s.completed && s.w[stuFilter])) return false;
    return !q || [r.name,r.id,r.course,r.group].some(v=>(v||'').toLowerCase().includes(q));
  });
  const stuRowsEl = document.getElementById('stuRows');
  if(stuRowsEl) {
    stuRowsEl.innerHTML = shown.map(({r,s}) => {
      const def = s.defPending ? badge('Pending review','warn') : s.defDec==='APPROVED' ? badge('Approved','ok') : s.defDec==='REJECTED' ? badge('Sent back','err') : '<span style="color:var(--muted)">—</span>';
      const mk = s.mkPending ? badge('Awaiting approval','warn') : s.mkDone ? badge('Approved','ok') : '<span style="color:var(--muted)">—</span>';
      const gr = !r.g ? '<span style="color:var(--muted)">—</span>' : (r.g.status==='COMPLETE' && r.g.mark!=null) ? badge('Complete '+r.g.mark+'/100','ok') : badge('In progress','warn');
      const ce = s.cert ? `<span class="mono">${esc(s.cert.serial)}</span>` : badge('Not issued','warn');
      const waiting = [s.w.defense && (s.defPending?'Defense review':'Defense resubmission'), s.w.marks && 'Marks approval', s.w.group && 'Group completion'].filter(Boolean);
      const overall = s.completed ? badge('Completed','ok') : s.pending ? badge('Pending','warn')+`<div class="note" style="margin:3px 0 0">Waiting on: ${waiting.join(', ')}</div>` : '<span style="color:var(--muted)">—</span>';
      return `<tr><td><b>${esc(r.name)}</b><div class="note" style="margin:2px 0 0">${r.id?esc(r.id)+' · ':''}${esc(r.course)}</div></td><td>${esc(r.group)}</td><td>${def}</td><td>${mk}</td><td>${gr}</td><td>${ce}</td><td>${overall}</td></tr>`;
    }).join('') || `<tr><td colspan="7" style="color:var(--muted)">No students match.</td></tr>`;
  }
  const cardStudentsEl = document.getElementById('cardStudents');
  if(cardStudentsEl) cardStudentsEl.textContent = counts.pending + ' pending';
}
const stuSearchEl = document.getElementById('stuSearch');
if(stuSearchEl) stuSearchEl.addEventListener('input', renderStudents);

function serialFor(studentId, course, date, version){
  const m = String(date.getMonth()+1).padStart(2,'0');
  return `${studentId}/${course}/${m}/${date.getFullYear()}/v.${String(version).padStart(2,'0')}`;
}
function certToRow(c){
  return {student_id:c.studentId, student_name:c.student, course:c.course, group_id:c.groupId, score:c.score,
    version:c.version, serial:c.serial, issued_at:c.issuedAt};
}
async function issueCertificatesForGroup(g){
  if(g.status!=='COMPLETE' || g.mark==null || g.mark<CERT_MIN_MARK) return 0;
  const now = new Date(), fresh = [];
  (g.students||[]).forEach(s=>{
    if(certList.some(c=>c.studentId===s.id)) return;
    fresh.push({id:'c'+(certList.length+fresh.length+1), studentId:s.id, student:s.name, course:s.course,
      group:g.number, groupId:g.id, title:g.title, score:g.mark, version:1,
      issuedAt:now.toISOString(), serial:serialFor(s.id, s.course, now, 1), downloads:[]});
  });
  certList.push(...fresh);
  if(sb && fresh.length) { try{ await sb.from('certificates').insert(fresh.map(certToRow)); }catch(e){} }
  // Notify each student their certificate is ready
  for(const cert of fresh){
    const email = await getEmailByStudentId(cert.studentId);
    if(email){
      await createNotification(email,
        'Certificate Ready 🎓',
        `Hi ${cert.student}, your Capstone Completion Certificate (${cert.serial}) has been issued. Log in to download it.`,
        'success'
      );
    }
  }
  return fresh.length;
}
async function syncAllCertificates(){
  let n = 0;
  for(const g of groups) n += await issueCertificatesForGroup(g);
  return n;
}
function renderCerts(){
  const certSearchEl = document.getElementById('certSearch');
  if(!certSearchEl) return;
  const q = (certSearchEl.value||'').toLowerCase();
  const list = certList.filter(c => !q || [c.serial,c.student,c.course,c.group].some(v=>(v||'').toLowerCase().includes(q)));
  const certRowsEl = document.getElementById('certRows');
  if(certRowsEl) {
    certRowsEl.innerHTML = list.map(c => {
      const downloads = c.downloads || [];
      const dlCell = downloads.length
        ? '<b>' + downloads.length + '</b><div class="note" style="margin:2px 0 0">Last: ' + fmtDateTime(downloads[downloads.length - 1].at) + '</div>'
        : badge('Not downloaded', 'warn');
      return `<tr><td class="mono">${esc(c.serial)}</td><td><b>${esc(c.student)}</b></td><td>${esc(c.course)}</td><td>${esc(c.group)}</td>
        <td>${c.score}/100</td><td>${new Date(c.issuedAt).toLocaleDateString('en-GB')}</td>
        <td>${dlCell}</td>
        <td style="text-align:right"><div class="actions" style="justify-content:flex-end">
          <button class="btn-primary" onclick="downloadCertificate('${c.id}')">Download</button>
          <button class="btn-ghost" onclick="showDownloads('${c.id}')">History</button>
          <button class="btn-ghost" onclick="reissueCert('${c.id}')">Reissue v.${String(c.version+1).padStart(2,'0')}</button></div></td></tr>`;
    }).join('') || `<tr><td colspan="8" style="color:var(--muted)">No certificates yet. They are issued automatically when a group is marked out of 100 and set to Complete.</td></tr>`;
  }
  const cardCertsEl = document.getElementById('cardCerts');
  if(cardCertsEl) cardCertsEl.textContent = certList.length;
  persistLocal();
}
const certSearchEl = document.getElementById('certSearch');
if(certSearchEl) certSearchEl.addEventListener('input', renderCerts);

async function reissueCert(id){
  const c = certList.find(x=>x.id===id); if(!c) return;
  const now = new Date();
  c.version += 1; c.issuedAt = now.toISOString(); c.serial = serialFor(c.studentId, c.course, now, c.version);
  if(sb) { try{ await sb.from('certificates').upsert(certToRow(c)); }catch(e){} }
  banner('banner-certs','Certificate reissued as '+c.serial, 'ok'); renderCerts();
}

function fmtDateTime(iso){
  return new Date(iso).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
async function recordDownload(c){
  const entry = {at:new Date().toISOString(), by: STUDENT_ID ? 'Student' : COORDINATOR_NAME, serial:c.serial};
  (c.downloads = c.downloads || []).push(entry);
  if(sb) { try{ await sb.from('certificate_downloads').insert({student_id:c.studentId, serial:c.serial, downloaded_at:entry.at, downloaded_by:entry.by}); }catch(e){} }
  renderCerts(); if(STUDENT_ID) renderMyCerts();
}
function showDownloads(id){
  const c = certList.find(x=>x.id===id); if(!c) return;
  const log = (c.downloads||[]).slice().reverse();
  const tableHtml = log.length
    ? '<table><thead><tr><th>Date &amp; time</th><th>By</th><th>Serial</th></tr></thead><tbody>'
      + log.map(function(d){ return '<tr><td>'+fmtDateTime(d.at)+'</td><td>'+esc(d.by)+'</td><td class="mono">'+esc(d.serial)+'</td></tr>'; }).join('')
      + '</tbody></table>'
    : '<p class="note">This certificate has not been downloaded yet.</p>';
  showModal(
    '<h3>Download history</h3>'
    + '<p class="note"><b>' + esc(c.student) + '</b><br><span class="mono">' + esc(c.serial) + '</span></p>'
    + tableHtml
    + '<div class="modal-actions" style="display:flex;justify-content:flex-end;margin-top:14px">'
    + '<button class="btn-ghost" onclick="closeModal()">Close</button></div>'
  );
}

function downloadCertificate(id){
  const c = certList.find(x=>x.id===id); if(!c) return;
  const dateStr = new Date(c.issuedAt).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
  const courseName = COURSE_NAMES[c.course] || c.course;
  const J = window.jspdf && window.jspdf.jsPDF;
  if(!J){ recordDownload(c); printCertificate(c, courseName, dateStr); return; }
  const doc = new J({orientation:'landscape', unit:'mm', format:'a4'});
  const W = 297, H = 210;
  doc.setDrawColor(10,25,47); doc.setLineWidth(2); doc.rect(8,8,W-16,H-16);
  doc.setDrawColor(59,111,160); doc.setLineWidth(0.5); doc.rect(13,13,W-26,H-26);
  doc.setTextColor(10,25,47);
  doc.setFont('times','bold'); doc.setFontSize(34); doc.text('CERTIFICATE OF COMPLETION', W/2, 48, {align:'center'});
  doc.setFont('helvetica','normal'); doc.setFontSize(13); doc.setTextColor(107,118,134);
  doc.text('This is to certify that', W/2, 68, {align:'center'});
  doc.setTextColor(10,25,47); doc.setFont('times','bolditalic'); doc.setFontSize(32);
  doc.text(c.student, W/2, 86, {align:'center'});
  doc.setDrawColor(59,111,160); doc.line(80,90,W-80,90);
  doc.setFont('helvetica','normal'); doc.setFontSize(13); doc.setTextColor(107,118,134);
  doc.text('has successfully completed the Capstone Project as part of the', W/2, 104, {align:'center'});
  doc.setTextColor(10,25,47); doc.setFont('helvetica','bold'); doc.setFontSize(15);
  doc.text(courseName, W/2, 115, {align:'center'});
  doc.setFont('helvetica','normal'); doc.setFontSize(12); doc.setTextColor(107,118,134);
  doc.text('Project:', W/2, 129, {align:'center'});
  doc.setTextColor(10,25,47); doc.setFont('helvetica','italic'); doc.setFontSize(13);
  doc.text(doc.splitTextToSize(c.title||'', 200), W/2, 136, {align:'center'});
  doc.setFont('helvetica','normal'); doc.setFontSize(12);
  doc.text(`Group ${c.group}  |  Final mark: ${c.score}/100`, W/2, 152, {align:'center'});
  doc.setDrawColor(10,25,47); doc.line(40,177,110,177); doc.line(W-110,177,W-40,177);
  doc.setFontSize(10); doc.setTextColor(107,118,134);
  doc.text(COORDINATOR_NAME+' - Capstone Coordinator', 75, 183, {align:'center'});
  doc.text('Date of issue: '+dateStr, W-75, 183, {align:'center'});
  doc.setFont('courier','normal'); doc.setFontSize(10); doc.setTextColor(10,25,47);
  doc.text('Serial No: '+c.serial, W/2, 196, {align:'center'});
  recordDownload(c);
  doc.save('Certificate-'+c.serial.replace(/\//g,'-')+'.pdf');
}

function printCertificate(c, courseName, dateStr){
  const w = window.open('','_blank'); if(!w) return;
  w.document.title = 'Certificate ' + c.serial;
  const style = w.document.createElement('style');
  style.textContent = `
    @page { size: A4 landscape; margin: 0; }
    body { margin: 0; font-family: Georgia, serif; color: #0A192F; text-align: center; }
    .f { margin: 8mm; border: 3px double #0A192F; height: calc(100vh - 16mm); padding: 30px 40px; box-sizing: border-box; }
    h1 { font-size: 34px; letter-spacing: 2px; margin: 30px 0 20px; }
    .n { font-size: 34px; font-style: italic; font-weight: bold; border-bottom: 1px solid #3B6FA0; display: inline-block; padding: 0 40px; margin: 10px 0 20px; }
    p { margin: 8px 0; font-size: 15px; color: #555; }
    .s { font-family: Courier, monospace; color: #0A192F; margin-top: 40px; }
  `;
  w.document.head.appendChild(style);
  w.document.body.innerHTML = `
    <div class="f">
      <h1>CERTIFICATE OF COMPLETION</h1>
      <p>This is to certify that</p>
      <div class="n">${esc(c.student)}</div>
      <p>has successfully completed the Capstone Project as part of the</p>
      <p><b style="color:#0A192F;font-size:18px">${esc(courseName)}</b></p>
      <p><i>${esc(c.title || '')}</i></p>
      <p>Group ${esc(c.group)} | Final mark: ${c.score}/100</p>
      <p>Date of issue: ${dateStr}</p>
      <p class="s">Serial No: ${esc(c.serial)}</p>
    </div>
  `;
  w.document.close();
  setTimeout(() => { try { w.print(); } catch(e){} }, 300);
}

function renderMyCerts(){
  const myCertListEl = document.getElementById('myCertList');
  if(!myCertListEl) return;
  const mine = certList.filter(c => c.studentId === STUDENT_ID);
  myCertListEl.innerHTML = mine.map(c => {
    const downloads = c.downloads || [];
    const dlText = downloads.length ? ' &middot; Downloaded ' + downloads.length + 'x' : '';
    return `<div class="card cert-card"><div><h3>${COURSE_NAMES[c.course]||c.course}</h3>
      <div class="mono">${esc(c.serial)}</div>
      <p class="note" style="margin:6px 0 0">${esc(c.title||'')} &middot; Group ${esc(c.group)} &middot; ${c.score}/100 &middot; Issued ${new Date(c.issuedAt).toLocaleDateString('en-GB')}${dlText}</p></div>
      <button class="btn-primary" onclick="downloadCertificate('${c.id}')">Download Certificate</button></div>`;
  }).join('') || `<div class="card" style="color:var(--muted)">Your certificate will appear here once your group has been marked and completed.</div>`;
}

function navigate(view){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  const targetView = document.getElementById('view-'+view);
  if(targetView) targetView.classList.add('active');
  document.querySelectorAll('.side .item').forEach(i=>i.classList.toggle('active', i.dataset.view===(view==='legacy-board'?'legacy':view)));
  const sideEl = document.getElementById('side');
  if(sideEl) sideEl.classList.remove('open');
  const overlayEl = document.getElementById('overlay');
  if(overlayEl) overlayEl.classList.remove('show');
  window.scrollTo(0,0);
  // Load notifications when navigating to the notifications view
  if (view === 'notifications') loadNotifications();
}
function toggleSide(){
  const sideEl = document.getElementById('side');
  if(sideEl) sideEl.classList.toggle('open');
  const overlayEl = document.getElementById('overlay');
  if(overlayEl) overlayEl.classList.toggle('show');
}
function badge(t,k){ return `<span class="badge ${k}">${t}</span>`; }
function banner(id,text,kind){
  const el = document.getElementById(id);
  if(el) el.innerHTML = text? `<div class="msg ${kind}">${text}</div>` : '';
}
function closeModal(){
  const el = document.getElementById('modalBg');
  if(el) el.style.display='none';
}
function showModal(html){
  const bodyEl = document.getElementById('modalBody');
  const bgEl = document.getElementById('modalBg');
  if(bodyEl) bodyEl.innerHTML = html;
  if(bgEl) bgEl.style.display='flex';
}

const SEMESTERS = ['Semester 1','Semester 2'];
const esc = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const intakeBadge = s => badge(s.charAt(0)+s.slice(1).toLowerCase(), s==='ACTIVE'?'ok':s==='UPCOMING'?'warn':'err');
const todayStr = () => { const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
const effStatus = i => i.status!=='AUTO' ? i.status : (todayStr()<i.start ? 'UPCOMING' : todayStr()>i.end ? 'CLOSED' : 'ACTIVE');
const autoName = (year, sem) => `${year} ${sem} Capstone Intake`;
function defaultDates(year, sem){
  const [a,b] = year.split('/').map(Number);
  return sem === 'Semester 1' ? [`${a}-08-01`, `${a}-12-15`] : [`${b}-01-15`, `${b}-05-31`];
}
function yearOptions(sel){
  const y0 = new Date().getFullYear() - 2, years = [];
  for(let y=y0; y<=y0+7; y++) years.push(y+'/'+(y+1));
  if(sel && !years.includes(sel)) years.push(sel);
  return years.sort().map(v=>`<option ${v===sel?'selected':''}>${v}</option>`).join('');
}

function isDupIntake(i){
  return intakes.some(o => o.id!==i.id && ((o.year===i.year && o.semester===i.semester) || o.name.trim().toLowerCase()===i.name.trim().toLowerCase()));
}
function confirmDeleteIntake(id){
  const i = intakes.find(x=>x.id===id); if(!i) return;
  showModal(`<h3>Delete this intake?</h3>
    <p class="note"><b>${esc(i.name)}</b><br>${esc(i.year)} &middot; ${esc(i.semester||'')} &middot; ${esc(i.start)} to ${esc(i.end)}</p>
    <p class="note">This removes the intake from the list. Groups, marks and certificates are not affected.</p>
    <div class="modal-actions" style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-err" onclick="deleteIntake('${id}')">Delete Intake</button>
    </div>`);
}
async function deleteIntake(id){
  intakes = intakes.filter(x=>x.id!==id);
  if(LIVE_DB) { try{ await sb.from('intakes').delete().eq('id', id); }catch(e){} }
  closeModal(); banner('banner-intakes','Intake deleted.', 'ok'); renderIntakes();
}

function renderIntakes(){
  const list = intakes.slice().sort((a,b)=>(b.start||'').localeCompare(a.start||''));
  const intakeRowsEl = document.getElementById('intakeRows');
  if(!intakeRowsEl) return;
  intakeRowsEl.innerHTML = list.map(i => `
    <tr><td><b>${esc(i.name)}</b>${isDupIntake(i)?' '+badge('Duplicate','err'):''}</td><td>${esc(i.year)}</td><td>${esc(i.semester||'—')}</td><td>${esc(i.start)}</td><td>${esc(i.end)}</td><td>${intakeBadge(effStatus(i))}${i.status==='AUTO'?'<div class="note" style="margin:2px 0 0">auto from dates</div>':''}</td>
      <td style="text-align:right"><div class="actions" style="justify-content:flex-end"><button class="btn-primary" onclick="openIntake('${i.id}')">Edit</button><button class="btn-err" onclick="confirmDeleteIntake('${i.id}')">Delete</button></div></td></tr>
  `).join('') || `<tr><td colspan="7" style="color:var(--muted)">No intakes yet. Click "+ New Intake".</td></tr>`;
  const cardIntakesEl = document.getElementById('cardIntakes');
  if(cardIntakesEl) cardIntakesEl.textContent = intakes.length;
  persistLocal();
}
function openNewIntake(){ openIntake(null); }
function openIntake(id){
  const cur = id ? intakes.find(x=>x.id===id) : null;
  const year = cur ? cur.year : (()=>{ const y=new Date().getFullYear(); return y+'/'+(y+1); })();
  const sem = cur ? (cur.semester||'Semester 1') : 'Semester 1';
  const [ds,de] = defaultDates(year, sem);
  const name = cur ? cur.name : autoName(year, sem);
  window._niAuto = (name === autoName(year, sem));
  showModal(`<h3>${cur?'Edit Intake':'New Intake'}</h3>
    <div class="grid2">
      <div class="field"><label>Academic Year</label><select id="niYear" onchange="onIntakeTermChange()">${yearOptions(year)}</select></div>
      <div class="field"><label>Semester</label><select id="niSem" onchange="onIntakeTermChange()">${SEMESTERS.map(s=>`<option ${s===sem?'selected':''}>${s}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label>Intake Name</label><input id="niName" value="${esc(name)}" oninput="window._niAuto = (this.value===autoName(niYear.value,niSem.value))"></div>
    <div class="grid2">
      <div class="field"><label>Start Date</label><input type="date" id="niStart" value="${cur?cur.start:ds}"></div>
      <div class="field"><label>End Date</label><input type="date" id="niEnd" value="${cur?cur.end:de}"></div>
    </div>
    <div class="field"><label>Status</label><select id="niStatus">${[['AUTO','Automatic (from dates)'],['ACTIVE','Active'],['UPCOMING','Upcoming'],['CLOSED','Closed']].map(([v,l])=>`<option value="${v}" ${(cur?cur.status:'AUTO')===v?'selected':''}>${l}</option>`).join('')}</select></div>
    <p class="note">Changing the year or semester suggests new start and end dates. You can still adjust them.</p>
    <div id="niErr" style="color:var(--err);font-size:12px;min-height:16px"></div>
    <div class="modal-actions" style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="saveIntake(${id ? `'${id}'` : 'null'})">${cur ? 'Save Changes' : 'Create Intake'}</button>
    </div>`);
}
function onIntakeTermChange(){
  const y = document.getElementById('niYear').value, s = document.getElementById('niSem').value;
  const [ds,de] = defaultDates(y, s);
  document.getElementById('niStart').value = ds; document.getElementById('niEnd').value = de;
  if(window._niAuto) document.getElementById('niName').value = autoName(y, s);
}
async function saveIntake(id){
  const rec = {id: id || 'i'+Date.now(), name:document.getElementById('niName').value.trim(), year:document.getElementById('niYear').value,
    semester:document.getElementById('niSem').value, start:document.getElementById('niStart').value, end:document.getElementById('niEnd').value,
    status:document.getElementById('niStatus').value};
  const err = m => { document.getElementById('niErr').textContent = m; };
  if(!rec.name) return err('Enter an intake name.');
  if(!rec.start || !rec.end) return err('Set both a start and an end date.');
  if(rec.end <= rec.start) return err('The end date must be after the start date.');
  if(intakes.some(x=>x.id!==rec.id && x.year===rec.year && x.semester===rec.semester)) return err(`An intake for ${rec.year} ${rec.semester} already exists. Edit that one instead.`);
  if(id){ intakes[intakes.findIndex(x=>x.id===id)] = rec; } else intakes.push(rec);
  if(LIVE_DB) { try{ await sb.from('intakes').upsert(rec); }catch(e){} }
  closeModal(); banner('banner-intakes', id?'Intake updated.':'Intake created.', 'ok'); renderIntakes();
}

function renderGroups(){
  const groupSearchEl = document.getElementById('groupSearch');
  if(!groupSearchEl) return;
  const q = groupSearchEl.value.toLowerCase();
  const list = groups.filter(g => !q || g.number.toLowerCase().includes(q) || g.title.toLowerCase().includes(q) || (g.supervisor||'').toLowerCase().includes(q));
  const groupRowsEl = document.getElementById('groupRows');
  if(groupRowsEl) {
    groupRowsEl.innerHTML = list.map(g => `
      <tr><td><b>${esc(g.number)}</b></td><td>${esc(g.title)}</td><td>${(g.students||[]).length}</td>
        <td>${g.supervisor ? esc(g.supervisor) : badge('Unassigned','warn')}</td>
        <td>${g.mark==null ? '—' : g.mark+'/100'}</td>
        <td>${g.status==='COMPLETE' ? badge('Complete','ok') : badge('In Progress','warn')}</td>
        <td style="text-align:right"><div class="actions" style="justify-content:flex-end">
          <button class="btn-ok" onclick="openMark('${g.id}')">Mark &amp; Status</button></div></td></tr>
    `).join('') || `<tr><td colspan="7" style="color:var(--muted)">No groups match.</td></tr>`;
  }
  const cardGroupsEl = document.getElementById('cardGroups');
  if(cardGroupsEl) cardGroupsEl.textContent = groups.length;
  persistLocal();
}
const groupSearchEl = document.getElementById('groupSearch');
if(groupSearchEl) groupSearchEl.addEventListener('input', renderGroups);

function openAssign(id){
  showModal(`<h3>Assign Supervisor</h3>
    <div class="field"><label>Supervisor</label>
      <select id="asSup"></select></div>
    <div class="modal-actions" style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="saveAssign('${id}')">Save Assignment</button>
    </div>`);
}
async function saveAssign(id){
  const sup = document.getElementById('asSup').value;
  const g = groups.find(x=>x.id===id); g.supervisor = sup;
  if(sb) await sb.from('groups').update({supervisor_name:sup}).eq('id', id);
  closeModal(); banner('banner-groups','Supervisor assigned.', 'ok'); renderGroups();
}

function openMark(id){
  const g = groups.find(x=>x.id===id);
  showModal(`<h3>Group ${esc(g.number)}: Mark &amp; Status</h3>
    <p class="note">When a group is marked and set to Complete, a certificate is issued automatically to each of its ${(g.students||[]).length} students.</p>
    <div class="grid2">
      <div class="field"><label>Group Mark (out of 100)</label><input type="number" id="mkVal" min="0" max="100" step="1" value="${g.mark==null?'':g.mark}"></div>
      <div class="field"><label>Status</label><select id="mkStatus">
        <option value="IN_PROGRESS" ${g.status!=='COMPLETE'?'selected':''}>In Progress</option>
        <option value="COMPLETE" ${g.status==='COMPLETE'?'selected':''}>Complete</option></select></div>
    </div>
    <div id="mkErr" style="color:var(--err);font-size:12px;min-height:16px"></div>
    <div class="modal-actions" style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="saveMark('${id}')">Save</button>
    </div>`);
}
async function saveMark(id){
  const raw = document.getElementById('mkVal').value.trim();
  const status = document.getElementById('mkStatus').value;
  const val = raw === '' ? null : Number(raw);
  if(val !== null && (isNaN(val) || val < 0 || val > 100)){ document.getElementById('mkErr').textContent = 'Mark must be a number from 0 to 100.'; return; }
  if(status === 'COMPLETE' && val === null){ document.getElementById('mkErr').textContent = 'Enter a mark out of 100 before marking the group Complete.'; return; }
  const g = groups.find(x=>x.id===id); g.mark = val; g.status = status;
  if(sb) { try{ await sb.from('groups').update({mark:val, status}).eq('id', id); }catch(e){} }
  const n = await issueCertificatesForGroup(g);
  closeModal();
  banner('banner-groups', n ? `Group ${g.number} complete: ${n} certificate${n>1?'s':''} issued automatically.` : 'Group updated.', 'ok');
  renderGroups(); renderCerts();
}

async function loadData(){
  if(sb && SUPABASE_URL !== 'YOUR_SUPABASE_URL'){
    try{
      const { data } = await sb.from('groups').select('id, group_number, project_title, supervisor_id, mark, status, profiles(name), group_students(student_id, name, course)');
      if(data && data.length) groups = data.map(g=>({id:g.id, number:g.group_number, title:g.project_title, supervisor:g.profiles?.name||g.supervisor_name||null,
        mark:g.mark ?? null, status:g.status||'IN_PROGRESS',
        students:(g.group_students||[]).map(s=>({id:s.student_id, name:s.name, course:s.course}))}));
      const { data: lb } = await sb.from('legacy_boards').select('*');
      if(lb && lb.length){
        const { data: lr } = await sb.from('legacy_board_records').select('*');
        legacyBoardsList = lb.map(b=>({id:b.id, title:b.title, year:b.year, cohort:b.cohort,
          entries:(lr||[]).filter(r=>r.board_id===b.id).map(r=>({id:r.id, name:r.student_name, studentId:r.student_id||'', course:r.course, group:r.group_number||'', project:r.project_title||'', mark:r.mark}))}));
      }
      const { data: ik } = await sb.from('intakes').select('*');
      if(ik && ik.length) intakes = ik;
      const { data: certs } = await sb.from('certificates').select('*').order('issued_at');
      if(certs && certs.length){
        const latest = {};
        certs.forEach(r=>{ if(!latest[r.student_id] || r.version >= latest[r.student_id].version) latest[r.student_id] = r; });
        certList = Object.values(latest).map((r,i)=>({id:'c'+(i+1), studentId:r.student_id, student:r.student_name, course:r.course,
          group:(groups.find(g=>g.id===r.group_id)||{}).number||'', groupId:r.group_id, title:(groups.find(g=>g.id===r.group_id)||{}).title||'',
          score:r.score, version:r.version, issuedAt:r.issued_at, serial:r.serial}));
      }
      const { data: dl } = await sb.from('certificate_downloads').select('*').order('downloaded_at');
      (dl||[]).forEach(r=>{ const c = certList.find(x=>x.studentId===r.student_id);
        if(c) (c.downloads = c.downloads||[]).push({at:r.downloaded_at, by:r.downloaded_by, serial:r.serial}); });
    }catch(e){}
  }
  // Fetch pending defenses
  try {
    const { data: defData } = await sb.from('defenses').select('*');
    if (defData && defData.length) {
      defenses = defData.map(d => ({
        id: d.id,
        student: d.student_name,
        studentId: d.student_id,
        group: d.group_number,
        supervisor: d.supervisor_name,
        submitted: d.submitted_date,
        status: d.status
      }));
    }
  } catch(e) {}
  // Fetch pending marks
  try {
    const { data: marksData } = await sb.from('marks').select('*').eq('is_approved', false);
    if (marksData && marksData.length) {
      pendingMarksList = marksData.map(m => ({
        id: m.id,
        student: m.student_name,
        studentId: m.student_id,
        group: m.group_number,
        supervisor: m.supervisor_name,
        total: m.total
      }));
    }
  } catch(e) {}
  loadLocal();
  await syncAllCertificates();
  renderIntakes(); renderGroups(); renderDefenses(); renderMarks(); renderLegacy(); renderCerts();
  if(STUDENT_ID){ document.body.classList.add('student-mode'); renderMyCerts(); navigate('mycerts'); }
  else navigate('dashboard');
  // Load notifications badge in background
  loadNotifications();
}

// Initialize on DOM load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadData);
} else {
  loadData();
}

// ============================================================
// NOTIFICATIONS
// ============================================================

let _allNotifs = [];
let _notifFilter = 'all';
let _notifSub = null;

async function loadNotifications() {
  if (!sb) { renderNotifList([]); return; }
  try {
    // Load notifications addressed to this coordinator OR broadcast (no recipient / recipient matches coordinator email)
    const coordEmail = localStorage.getItem('cms_user_email') || '';
    let query = sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(100);
    const { data, error } = await query;
    if (error) throw error;
    // Filter: show notifications for this coordinator, or ones sent to any coordinator, or general system ones
    _allNotifs = (data || []).filter(n =>
      !n.recipient_email ||
      (coordEmail && n.recipient_email === coordEmail) ||
      n.recipient_email === 'coordinator'
    );
  } catch(e) {
    // Fallback: show all notifications if can't filter
    try {
      const { data } = await sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(100);
      _allNotifs = data || [];
    } catch(_) { _allNotifs = []; }
  }
  updateNotifBadge();
  renderNotifList(_allNotifs);
  subscribeNotifications();
}

function subscribeNotifications() {
  if (!sb || _notifSub) return;
  try {
    _notifSub = sb.channel('coordinator-notifs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
        const n = payload.new;
        const coordEmail = localStorage.getItem('cms_user_email') || '';
        if (!n.recipient_email || (coordEmail && n.recipient_email === coordEmail) || n.recipient_email === 'coordinator') {
          _allNotifs.unshift(n);
          updateNotifBadge();
          renderNotifList(_allNotifs);
          // Flash the bell
          const bell = document.getElementById('notifBell');
          if (bell) { bell.style.background = 'rgba(239,68,68,0.4)'; setTimeout(() => { bell.style.background = ''; }, 1200); }
        }
      })
      .subscribe();
  } catch(e) {}
}

function updateNotifBadge() {
  const unread = _allNotifs.filter(n => !n.read).length;
  const badge = document.getElementById('notifBadge');
  const sideBadge = document.getElementById('notifSideBadge');
  const cardNotifs = document.getElementById('cardNotifs');
  if (badge) { badge.textContent = unread > 99 ? '99+' : unread; badge.style.display = unread ? 'flex' : 'none'; }
  if (sideBadge) { sideBadge.textContent = unread > 99 ? '99+' : unread; sideBadge.style.display = unread ? 'inline' : 'none'; }
  if (cardNotifs) cardNotifs.textContent = unread;
}

function notifFilter(type) {
  _notifFilter = type;
  ['all','unread','success','warning','info'].forEach(t => {
    const el = document.getElementById('nf' + t.charAt(0).toUpperCase() + t.slice(1));
    if (el) { el.className = t === type ? 'btn-primary' : 'btn-ghost'; }
  });
  renderNotifList(_allNotifs);
}

function renderNotifList(notifs) {
  const el = document.getElementById('notifList');
  const countEl = document.getElementById('notifCount');
  if (!el) return;

  let list = notifs;
  if (_notifFilter === 'unread') list = notifs.filter(n => !n.read);
  else if (_notifFilter !== 'all') list = notifs.filter(n => n.type === _notifFilter);

  const unread = notifs.filter(n => !n.read).length;
  if (countEl) countEl.textContent = `${list.length} notification${list.length !== 1 ? 's' : ''} · ${unread} unread`;

  if (!list.length) {
    el.innerHTML = `<div class="notif-empty">🔔<br><br>No notifications${_notifFilter !== 'all' ? ' in this category' : ''}.<br><span style="font-size:12px">They'll appear here automatically.</span></div>`;
    return;
  }

  el.innerHTML = list.map(n => {
    const type = n.type || 'info';
    const ts = n.created_at ? fmtDateTime(new Date(n.created_at).toISOString()) : '';
    const unreadClass = n.read ? '' : ' unread';
    return `<div class="notif-item${unreadClass}" onclick="notifMarkRead('${n.id}', this)">
      <div class="notif-dot ${type}"></div>
      <div class="notif-body">
        <div class="notif-title">${escN(n.title || 'Notification')}</div>
        <div class="notif-msg">${escN(n.message || '')}</div>
      </div>
      <div class="notif-time">${ts}</div>
    </div>`;
  }).join('');
}

function escN(str) {
  if (!str) return '';
  const d = document.createElement('div'); d.textContent = str; return d.innerHTML;
}

async function notifMarkRead(id, el) {
  const n = _allNotifs.find(x => String(x.id) === String(id));
  if (n && !n.read) {
    n.read = true;
    if (el) el.classList.remove('unread');
    updateNotifBadge();
    if (sb) { try { await sb.from('notifications').update({ read: true }).eq('id', id); } catch(e) {} }
  }
}

async function notifMarkAllRead() {
  const unreadIds = _allNotifs.filter(n => !n.read).map(n => n.id);
  _allNotifs.forEach(n => { n.read = true; });
  updateNotifBadge();
  renderNotifList(_allNotifs);
  if (sb && unreadIds.length) {
    try { await sb.from('notifications').update({ read: true }).in('id', unreadIds); } catch(e) {}
  }
  banner('banner-notifications', 'All notifications marked as read.', 'ok');
}

async function notifClearAll() {
  if (!confirm('Clear all notifications? This cannot be undone.')) return;
  const ids = _allNotifs.map(n => n.id);
  _allNotifs = [];
  updateNotifBadge();
  renderNotifList([]);
  if (sb && ids.length) {
    try { await sb.from('notifications').delete().in('id', ids); } catch(e) {}
  }
  banner('banner-notifications', 'All notifications cleared.', 'ok');
}


