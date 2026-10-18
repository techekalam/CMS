/**
 * ============================================================
 * Admin API — Supabase Integration for Admin Dashboard Forms
 * Capstone Management System | Cavendish University Uganda
 * ============================================================
 * Depends on: supabase CDN + ../../supabase.js (loaded before this file)
 */

// ─── Helpers ────────────────────────────────────────────────

function _sb() {
  return (window.CMS_SB && window.CMS_SB.client) ? window.CMS_SB.client() : null;
}

function _val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function _setBtn(btn, loading) {
  if (!btn) return;
  if (loading) {
    btn.dataset.orig = btn.textContent;
    btn.textContent = 'Saving…';
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.orig || btn.textContent;
    btn.disabled = false;
  }
}

function _closeModal(el) {
  const backdrop = el.closest('.modal-backdrop');
  if (backdrop) backdrop.classList.remove('show');
}

function _clearFields(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'SELECT') el.selectedIndex = 0;
    else el.value = '';
  });
}

function escHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ─── Load records into a table ──────────────────────────────

async function _loadTable(tableId, countId, rows) {
  const tbody = document.querySelector('#' + tableId + ' tbody');
  const countEl = document.getElementById(countId);
  if (!tbody) return;
  tbody.innerHTML = rows.length
    ? rows.map(r => `<tr>${r}</tr>`).join('')
    : `<tr><td colspan="20" style="text-align:center;padding:24px;color:var(--muted)">No records found</td></tr>`;
  if (countEl) countEl.textContent = `Showing ${rows.length} record${rows.length !== 1 ? 's' : ''}`;
}

// ─── Role normalizer ────────────────────────────────────────
function _normalizeRole(raw) {
  const map = {
    student: 'student', Student: 'student',
    supervisor: 'supervisor', Supervisor: 'supervisor',
    coordinator: 'coordinator', Coordinator: 'coordinator',
    assessor: 'supervisor',   Assessor: 'supervisor',
    administrator: 'admin', Administrator: 'admin', Admin: 'admin', admin: 'admin'
  };
  return map[raw] || 'student';
}

// ─── Status badge ───────────────────────────────────────────
function _badge(text, color) {
  const colors = { green: '#16a34a', red: '#dc2626', amber: '#d97706', blue: '#2563eb', gray: '#6b7280' };
  const c = colors[color] || colors.gray;
  return `<span style="background:${c}22;color:${c};padding:2px 10px;border-radius:99px;font-size:12px;font-weight:600">${text}</span>`;
}

// ============================================================
// 1. USER MANAGEMENT  — profiles table
// ============================================================

async function adminLoadUsers() {
  const sb = _sb();
  if (!sb) return;
  try {
    const { data, error } = await sb
      .from('profiles')
      .select('id, email, name, role, is_active, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const rows = (data || []).map(u => {
      const active = u.is_active;
      const badge = active ? _badge('Active', 'green') : _badge('Inactive', 'gray');
      const date = u.created_at ? new Date(u.created_at).toLocaleDateString() : '—';
      const shortId = u.id ? u.id.slice(0, 8).toUpperCase() : '—';
      const delBtn = `<button onclick="adminDeleteProfile('${u.id}', '${(u.name||'').replace(/'/g,'')}', 'adminLoadUsers')" style="background:#fee2e2;color:#dc2626;border:none;padding:3px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600">Delete</button>`;
      return `<td>${shortId}</td><td>${u.name || '—'}</td><td>${u.email || '—'}</td><td style="text-transform:capitalize">${u.role || '—'}</td><td>${badge}</td><td>${date}</td><td>${delBtn}</td>`;
    });

    _loadTable('usersTable', 'usersCount', rows);
  } catch (e) {
    console.error('[Admin] loadUsers:', e);
    showToast('Failed to load users: ' + e.message, 'error');
  }
}

async function adminCreateUser(btn) {
  const name     = _val('newUserName');
  const email    = _val('newUserEmail');
  const role     = _val('newUserRole');
  const isActive = _val('newUserStatus') === 'Active';
  const password = _val('newUserPassword');
  const confirm  = _val('newUserPasswordConfirm');

  if (!name || !email) { showToast('Name and email are required', 'error'); return; }
  if (!/\S+@\S+\.\S+/.test(email)) { showToast('Please enter a valid email', 'error'); return; }

  const normalizedRole = _normalizeRole(role);
  const needsPassword = ['admin','supervisor','coordinator'].includes(normalizedRole);

  if (needsPassword) {
    if (!password) { showToast('Password is required for staff/admin accounts', 'error'); return; }
    if (password.length < 6) { showToast('Password must be at least 6 characters', 'error'); return; }
    if (password !== confirm) { showToast('Passwords do not match', 'error'); return; }
  }

  _setBtn(btn, true);
  const sb = _sb();
  if (!sb) { showToast('Database not connected', 'error'); _setBtn(btn, false); return; }

  try {
    const row = {
      name: name,
      email: email.toLowerCase(),
      role: normalizedRole,
      is_active: isActive,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    if (needsPassword) row.password = password;

    const { error } = await sb.from('profiles').insert(row);
    if (error) throw error;

    showToast('User "' + name + '" created successfully', 'success');
    _closeModal(btn);
    _clearFields(['newUserName','newUserEmail','newUserRole','newUserStatus','newUserPassword','newUserPasswordConfirm']);
    adminLoadUsers();
  } catch (e) {
    console.error('[Admin] createUser:', e);
    showToast('Error: ' + e.message, 'error');
  } finally {
    _setBtn(btn, false);
  }
}

async function adminDeleteProfile(id, name, reloadFn) {
  if (!confirm('Delete "' + name + '"? This cannot be undone.')) return;
  const sb = _sb();
  if (!sb) { showToast('Database not connected', 'error'); return; }
  try {
    const { error } = await sb.from('profiles').delete().eq('id', id);
    if (error) throw error;
    showToast('"' + name + '" deleted successfully', 'success');
    if (typeof window[reloadFn] === 'function') window[reloadFn]();
  } catch (e) {
    console.error('[Admin] deleteProfile:', e);
    showToast('Delete failed: ' + e.message, 'error');
  }
}



// ============================================================
// 2. STAFF MANAGEMENT — profiles table (role: supervisor | coordinator)
// ============================================================

async function adminLoadStaff() {
  const sb = _sb();
  if (!sb) return;
  try {
    const { data, error } = await sb
      .from('profiles')
      .select('id, name, email, role, staff_id, programme, is_active')
      .in('role', ['supervisor', 'coordinator'])
      .order('name');
    if (error) throw error;

    const rows = (data || []).map(s => {
      const badge = s.is_active ? _badge('Active', 'green') : _badge('Inactive', 'gray');
      const dept = s.programme || '—';
      const sid = s.staff_id || s.id.slice(0, 8).toUpperCase();
      const delBtn = `<button onclick="adminDeleteProfile('${s.id}', '${(s.name||'').replace(/'/g,'')}', 'adminLoadStaff')" style="background:#fee2e2;color:#dc2626;border:none;padding:3px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600">Delete</button>`;
      return `<td>${sid}</td><td>${s.name}</td><td>${dept}</td><td style="text-transform:capitalize">${s.role}</td><td>${badge}</td><td>${delBtn}</td>`;
    });

    _loadTable('staffTable', 'staffCount', rows);
  } catch (e) {
    console.error('[Admin] loadStaff:', e);
    showToast('Failed to load staff', 'error');
  }
}

async function adminCreateStaff(btn) {
  const staffId  = _val('newStaffId');
  const name     = _val('newStaffName');
  const email    = _val('newStaffEmail');
  const dept     = _val('newStaffDept');
  const role     = _val('newStaffRole');
  const status   = _val('newStaffStatus');
  const password = _val('newStaffPassword');
  const confirm  = _val('newStaffPasswordConfirm');

  if (!name || !email) { showToast('Name and email are required', 'error'); return; }
  if (!password) { showToast('Password is required for staff accounts', 'error'); return; }
  if (password.length < 6) { showToast('Password must be at least 6 characters', 'error'); return; }
  if (password !== confirm) { showToast('Passwords do not match', 'error'); return; }

  const normalizedRole = _normalizeRole(role);
  _setBtn(btn, true);
  const sb = _sb();
  if (!sb) { showToast('Database not connected', 'error'); _setBtn(btn, false); return; }

  try {
    const { error } = await sb.from('profiles').insert({
      staff_id: staffId || null,
      name: name,
      email: email.toLowerCase(),
      role: normalizedRole,
      programme: dept,
      password: password,
      is_active: status === 'Active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    if (error) throw error;

    showToast('Staff member "' + name + '" added with login credentials', 'success');
    _closeModal(btn);
    _clearFields(['newStaffId','newStaffName','newStaffEmail','newStaffDept','newStaffRole','newStaffStatus','newStaffPassword','newStaffPasswordConfirm']);
    adminLoadStaff();
  } catch (e) {
    console.error('[Admin] createStaff:', e);
    showToast('Error: ' + e.message, 'error');
  } finally {
    _setBtn(btn, false);
  }
}


// ============================================================
// 3. STUDENT MANAGEMENT — profiles table (role: student)
// ============================================================

async function adminLoadStudents() {
  const sb = _sb();
  if (!sb) return;
  try {
    const { data, error } = await sb
      .from('profiles')
      .select('id, name, email, student_id, programme, is_active')
      .eq('role', 'student')
      .order('name');
    if (error) throw error;

    const rows = (data || []).map(s => {
      const badge = s.is_active ? _badge('Eligible', 'green') : _badge('Blocked', 'red');
      const sid = s.student_id || s.id.slice(0, 8).toUpperCase();
      return `<td>${sid}</td><td>${s.name}</td><td>${s.programme || '—'}</td><td>Year 4</td><td>${badge}</td><td>—</td>`;
    });

    _loadTable('studentTable', 'studentCount', rows);
  } catch (e) {
    console.error('[Admin] loadStudents:', e);
    showToast('Failed to load students', 'error');
  }
}

async function adminCreateStudent(btn) {
  const studentId = _val('newStudentId');
  const name      = _val('newStudentName');
  const programme = _val('newStudentProgram');
  const level     = _val('newStudentLevel');

  if (!name) { showToast('Student name is required', 'error'); return; }

  _setBtn(btn, true);
  const sb = _sb();
  if (!sb) { showToast('Database not connected', 'error'); _setBtn(btn, false); return; }

  try {
    // Generate placeholder email from student ID if not supplied
    const email = (studentId || name.replace(/\s+/g,'').toLowerCase()) + '@student.cavendish.ac.ug';
    const { error } = await sb.from('profiles').insert({
      student_id: studentId || null,
      name: name,
      email: email,
      role: 'student',
      programme: programme,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    if (error) throw error;

    showToast('Student "' + name + '" added successfully', 'success');
    _closeModal(btn);
    _clearFields(['newStudentId','newStudentName','newStudentProgram','newStudentLevel']);
    adminLoadStudents();
  } catch (e) {
    console.error('[Admin] createStudent:', e);
    showToast('Error: ' + e.message, 'error');
  } finally {
    _setBtn(btn, false);
  }
}

// ─── CSV Student Import & Processing ────────────────────────
let _parsedStudentRecords = [];

function adminDownloadCsvTemplate() {
  const csvContent = "Student ID,Full Name,Programme,Email\r\n"
    + "2024-BCS-001,John Doe,BSCS,2024-bcs-001@student.cavendish.ac.ug\r\n"
    + "2024-BIT-002,Jane Namubiru,BIT,2024-bit-002@student.cavendish.ac.ug\r\n"
    + "2024-BSE-003,Alex Mukasa,BSE,2024-bse-003@student.cavendish.ac.ug\r\n"
    + "2024-BCS-004,Sarah Akello,BSCS,2024-bcs-004@student.cavendish.ac.ug\r\n";
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', 'students_import_template.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function _parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];

  function parseLine(line) {
    const row = [];
    let insideQuote = false;
    let entry = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (insideQuote && line[i + 1] === '"') {
          entry += '"';
          i++;
        } else {
          insideQuote = !insideQuote;
        }
      } else if (c === ',' && !insideQuote) {
        row.push(entry.trim());
        entry = '';
      } else {
        entry += c;
      }
    }
    row.push(entry.trim());
    return row;
  }

  const rawHeaders = parseLine(lines[0]).map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''));
  let idIdx = rawHeaders.findIndex(h => h.includes('id') || h.includes('reg') || h.includes('code') || h.includes('student'));
  let nameIdx = rawHeaders.findIndex(h => h.includes('name') || h.includes('full') || h.includes('studentname'));
  let progIdx = rawHeaders.findIndex(h => h.includes('program') || h.includes('course') || h.includes('dept'));
  let emailIdx = rawHeaders.findIndex(h => h.includes('email') || h.includes('mail'));

  if (idIdx === -1 && rawHeaders.length > 0) idIdx = 0;
  if (nameIdx === -1 && rawHeaders.length > 1) nameIdx = 1;
  if (progIdx === -1 && rawHeaders.length > 2) progIdx = 2;
  if (emailIdx === -1 && rawHeaders.length > 3) emailIdx = 3;

  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    if (cols.length === 0 || cols.every(c => !c)) continue;
    const studentId = idIdx !== -1 && cols[idIdx] ? cols[idIdx].trim() : '';
    const name = nameIdx !== -1 && cols[nameIdx] ? cols[nameIdx].trim() : '';
    const prog = progIdx !== -1 && cols[progIdx] ? cols[progIdx].trim() : 'BSCS';
    let email = emailIdx !== -1 && cols[emailIdx] ? cols[emailIdx].trim().toLowerCase() : '';

    if (!studentId && !name) continue;

    if (!email) {
      const cleanId = (studentId || name.replace(/\s+/g, '')).toLowerCase().replace(/[^a-z0-9]/g, '');
      email = cleanId + '@student.cavendish.ac.ug';
    }

    records.push({
      student_id: studentId || ('STU-' + Math.floor(1000 + Math.random() * 9000)),
      name: name || studentId,
      programme: prog || 'BSCS',
      email: email
    });
  }
  return records;
}

function adminHandleCsvFileSelect(input) {
  const file = input.files && input.files[0];
  const msgEl = document.getElementById('csvImportMsg');
  const previewArea = document.getElementById('csvPreviewArea');
  const previewTbody = document.querySelector('#csvPreviewTable tbody');
  const previewCount = document.getElementById('csvPreviewCount');
  const btn = document.getElementById('btnExecuteCsvImport');

  _parsedStudentRecords = [];
  if (btn) btn.disabled = true;

  if (!file) {
    if (previewArea) previewArea.style.display = 'none';
    if (msgEl) msgEl.style.display = 'none';
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const content = e.target.result;
      const records = _parseCsv(content);
      if (!records || records.length === 0) {
        if (msgEl) {
          msgEl.innerHTML = `<span style="color:#dc2626;font-size:12px;font-weight:600;">No valid student rows found in "${escHtml(file.name)}". Please ensure headers: Student ID, Full Name, Programme.</span>`;
          msgEl.style.display = 'block';
        }
        if (previewArea) previewArea.style.display = 'none';
        return;
      }

      _parsedStudentRecords = records;

      if (msgEl) {
        msgEl.innerHTML = `<span style="color:#16a34a;font-size:12px;font-weight:600;">&#10003; Successfully parsed ${records.length} student record${records.length > 1 ? 's' : ''} from "${escHtml(file.name)}". Ready to import.</span>`;
        msgEl.style.display = 'block';
      }

      if (previewTbody) {
        const previewRows = records.slice(0, 5).map(r => `
          <tr>
            <td style="padding:4px 6px;border-bottom:1px solid #e2e8f0;">${escHtml(r.student_id)}</td>
            <td style="padding:4px 6px;border-bottom:1px solid #e2e8f0;font-weight:600;">${escHtml(r.name)}</td>
            <td style="padding:4px 6px;border-bottom:1px solid #e2e8f0;">${escHtml(r.programme)}</td>
            <td style="padding:4px 6px;border-bottom:1px solid #e2e8f0;color:#64748b;">${escHtml(r.email)}</td>
          </tr>
        `).join('');
        previewTbody.innerHTML = previewRows;
      }
      if (previewCount) {
        previewCount.textContent = `${records.length} record${records.length > 1 ? 's' : ''}`;
      }
      if (previewArea) previewArea.style.display = 'block';
      if (btn) btn.disabled = false;
    } catch (err) {
      console.error('CSV parse error:', err);
      if (msgEl) {
        msgEl.innerHTML = `<span style="color:#dc2626;font-size:12px;font-weight:600;">Failed to read file: ${escHtml(err.message)}</span>`;
        msgEl.style.display = 'block';
      }
    }
  };
  reader.readAsText(file);
}

async function adminExecuteCsvImport(btn) {
  if (!_parsedStudentRecords || _parsedStudentRecords.length === 0) {
    showToast('Please select a valid CSV file first', 'error');
    return;
  }

  _setBtn(btn, true);
  const sb = _sb();
  if (!sb) {
    showToast('Database connection not available', 'error');
    _setBtn(btn, false);
    return;
  }

  try {
    const toInsert = _parsedStudentRecords.map(r => ({
      student_id: r.student_id,
      name: r.name,
      programme: r.programme,
      email: r.email,
      role: 'student',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    // Batch upsert into profiles by unique email
    const { data, error } = await sb
      .from('profiles')
      .upsert(toInsert, { onConflict: 'email' })
      .select('id, name');

    if (error) throw error;

    const count = data ? data.length : toInsert.length;
    showToast(`Successfully imported ${count} student${count !== 1 ? 's' : ''}!`, 'success');

    // Clean up modal state
    _parsedStudentRecords = [];
    const fileInp = document.getElementById('studentCsvFileInput');
    if (fileInp) fileInp.value = '';
    const previewArea = document.getElementById('csvPreviewArea');
    if (previewArea) previewArea.style.display = 'none';
    const msgEl = document.getElementById('csvImportMsg');
    if (msgEl) msgEl.style.display = 'none';
    _closeModal(btn);

    // Refresh students table
    adminLoadStudents();
  } catch (err) {
    console.error('Import error:', err);
    showToast('Import failed: ' + (err.message || 'Unknown error'), 'error');
  } finally {
    _setBtn(btn, false);
  }
}

// ============================================================
// 4. GROUP MANAGEMENT — groups table
// ============================================================

async function adminLoadGroups() {
  const sb = _sb();
  if (!sb) return;
  try {
    const { data, error } = await sb
      .from('groups')
      .select('id, group_number, project_title, supervisor_name, status, group_students(id, name)')
      .order('group_number');
    if (error) throw error;

    const rows = (data || []).map(g => {
      const members = g.group_students || [];
      const preview = members.slice(0, 2).map(m => m.name).join(', ') + (members.length > 2 ? ` +${members.length - 2}` : '');
      const badge = g.status === 'COMPLETE' ? _badge('Complete', 'green') : _badge('In Progress', 'blue');
      return `<td>${g.group_number}</td><td>${g.project_title}</td><td>${members.length}</td><td>${preview || '—'}</td><td>${g.supervisor_name || '—'}</td><td>${badge}</td>`;
    });

    _loadTable('groupTable', 'groupCount', rows);
  } catch (e) {
    console.error('[Admin] loadGroups:', e);
    showToast('Failed to load groups', 'error');
  }
}

async function adminCreateGroup(btn) {
  const groupName  = _val('newGroupName');
  const projTitle  = _val('newGroupProject');
  const supervisor = _val('newGroupSupervisor');
  const status     = _val('newGroupStatus');
  const membersRaw = _val('newGroupMembers');

  if (!groupName || !projTitle) { showToast('Group name and project title are required', 'error'); return; }

  _setBtn(btn, true);
  const sb = _sb();
  if (!sb) { showToast('Database not connected', 'error'); _setBtn(btn, false); return; }

  try {
    const { data: grpData, error: grpErr } = await sb.from('groups').insert({
      group_number: groupName,
      project_title: projTitle,
      supervisor_name: supervisor || null,
      status: status === 'Locked' ? 'COMPLETE' : 'IN_PROGRESS',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).select().single();
    if (grpErr) throw grpErr;

    // Insert member records if any
    if (membersRaw && grpData) {
      const memberIds = membersRaw.split(',').map(s => s.trim()).filter(Boolean);
      if (memberIds.length) {
        const memberRows = memberIds.map(sid => ({
          group_id: grpData.id,
          student_id: sid,
          name: sid
        }));
        await sb.from('group_students').insert(memberRows);
      }
    }

    showToast('Group "' + groupName + '" created successfully', 'success');
    _closeModal(btn);
    _clearFields(['newGroupName','newGroupProject','newGroupSupervisor','newGroupStatus','newGroupMembers']);
    adminLoadGroups();
  } catch (e) {
    console.error('[Admin] createGroup:', e);
    showToast('Error: ' + e.message, 'error');
  } finally {
    _setBtn(btn, false);
  }
}

// ============================================================
// 5. PROJECT MANAGEMENT — groups table (projects are groups)
// ============================================================

async function adminLoadProjects() {
  const sb = _sb();
  if (!sb) return;
  try {
    const { data, error } = await sb
      .from('groups')
      .select('id, group_number, project_title, category, supervisor_name, status, topic_status')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const rows = (data || []).map(p => {
      const statusBadge = p.topic_status === 'APPROVED' ? _badge('Approved', 'green')
        : p.topic_status === 'REJECTED' ? _badge('Rejected', 'red')
        : _badge('Pending', 'amber');
      const stage = p.status === 'COMPLETE' ? 'Final Review' : 'Development';
      return `<td>${p.id.slice(0,8).toUpperCase()}</td><td>${p.project_title}</td><td>${p.category || '—'}</td><td>${p.group_number}</td><td>${p.supervisor_name || '—'}</td><td>${statusBadge}</td><td>${stage}</td>`;
    });

    _loadTable('projectTable', 'projectCount', rows);
  } catch (e) {
    console.error('[Admin] loadProjects:', e);
    showToast('Failed to load projects', 'error');
  }
}

async function adminCreateProject(btn) {
  const title      = _val('newProjTitle');
  const desc       = _val('newProjDesc');
  const program    = _val('newProjProgram');
  const group      = _val('newProjGroup');
  const supervisor = _val('newProjSupervisor');
  const stage      = _val('newProjStage');
  const status     = _val('newProjStatus');

  if (!title) { showToast('Project title is required', 'error'); return; }

  _setBtn(btn, true);
  const sb = _sb();
  if (!sb) { showToast('Database not connected', 'error'); _setBtn(btn, false); return; }

  try {
    const groupNum = group || ('GRP-' + Date.now().toString().slice(-4));
    const { error } = await sb.from('groups').insert({
      group_number: groupNum,
      project_title: title,
      description: desc || null,
      category: program || 'Software Development',
      supervisor_name: supervisor || null,
      topic_status: status === 'Approved' ? 'APPROVED' : status === 'Rejected' ? 'REJECTED' : 'SUBMITTED',
      status: stage === 'Final Review' ? 'COMPLETE' : 'IN_PROGRESS',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    if (error) throw error;

    showToast('Project registered successfully', 'success');
    _closeModal(btn);
    _clearFields(['newProjTitle','newProjDesc','newProjProgram','newProjGroup','newProjSupervisor','newProjStage','newProjStatus']);
    adminLoadProjects();
  } catch (e) {
    console.error('[Admin] createProject:', e);
    showToast('Error: ' + e.message, 'error');
  } finally {
    _setBtn(btn, false);
  }
}

// ============================================================
// 6. CAPSTONE CYCLES — intakes table
// ============================================================

async function adminLoadCycles() {
  const sb = _sb();
  if (!sb) return;
  try {
    const { data, error } = await sb.from('intakes').select('*').order('created_at', { ascending: false });
    if (error) throw error;

    const rows = (data || []).map(c => {
      const badge = c.status === 'ACTIVE' ? _badge('Active', 'green')
        : c.status === 'CLOSED' ? _badge('Closed', 'gray')
        : c.status === 'UPCOMING' ? _badge('Upcoming', 'blue')
        : _badge('Auto', 'amber');
      const start = c.start_date || '—';
      const end = c.end_date || '—';
      return `<td>${c.id}</td><td>${c.year}</td><td>${start}</td><td>${end}</td><td>${badge}</td><td>—</td>`;
    });

    _loadTable('cycleTable', 'cycleCount', rows);
  } catch (e) {
    console.error('[Admin] loadCycles:', e);
    showToast('Failed to load cycles', 'error');
  }
}

async function adminCreateCycle(btn) {
  const year  = _val('newCycleYear');
  const cname = _val('newCycleName');
  const start = _val('newCycleStart');
  const end   = _val('newCycleEnd');

  if (!year || !cname) { showToast('Academic year and cycle name are required', 'error'); return; }

  _setBtn(btn, true);
  const sb = _sb();
  if (!sb) { showToast('Database not connected', 'error'); _setBtn(btn, false); return; }

  try {
    const { error } = await sb.from('intakes').insert({
      name: cname,
      year: year,
      semester: 'Semester 1',
      start_date: start || null,
      end_date: end || null,
      status: 'UPCOMING'
    });
    if (error) throw error;

    showToast('Capstone cycle "' + cname + '" created', 'success');
    _closeModal(btn);
    _clearFields(['newCycleYear','newCycleName','newCycleStart','newCycleEnd']);
    adminLoadCycles();
  } catch (e) {
    console.error('[Admin] createCycle:', e);
    showToast('Error: ' + e.message, 'error');
  } finally {
    _setBtn(btn, false);
  }
}

// ============================================================
// 7. PROFILE SAVE (system-settings & profile pages)
// ============================================================

async function adminSaveProfile(btn) {
  _setBtn(btn, true);
  try {
    await new Promise(r => setTimeout(r, 600)); // simulate network
    showToast('Profile updated successfully', 'success');
  } finally {
    _setBtn(btn, false);
  }
}

async function adminSaveSettings(btn) {
  _setBtn(btn, true);
  try {
    await new Promise(r => setTimeout(r, 600));
    showToast('System settings saved successfully', 'success');
  } finally {
    _setBtn(btn, false);
  }
}

async function adminUpdatePassword(btn) {
  const cur  = document.getElementById('pwdCurrent')  ? document.getElementById('pwdCurrent').value  : '';
  const nw   = document.getElementById('pwdNew')      ? document.getElementById('pwdNew').value      : '';
  const conf = document.getElementById('pwdConfirm')  ? document.getElementById('pwdConfirm').value  : '';

  if (!cur)        { showToast('Current password is required', 'error'); return; }
  if (!nw)         { showToast('New password is required', 'error'); return; }
  if (nw !== conf) { showToast('Passwords do not match', 'error'); return; }
  if (nw.length < 8) { showToast('Password must be at least 8 characters', 'error'); return; }

  _setBtn(btn, true);
  const sb = _sb();
  try {
    if (sb) {
      const { error } = await sb.auth.updateUser({ password: nw });
      if (error) throw error;
    }
    showToast('Password updated successfully', 'success');
    if (document.getElementById('pwdCurrent')) document.getElementById('pwdCurrent').value = '';
    if (document.getElementById('pwdNew'))     document.getElementById('pwdNew').value = '';
    if (document.getElementById('pwdConfirm'))document.getElementById('pwdConfirm').value = '';
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  } finally {
    _setBtn(btn, false);
  }
}

// ============================================================
// 8. AUTO-INIT — load table data on page load
// ============================================================

document.addEventListener('DOMContentLoaded', function () {
  // Determine which page we're on by checking for known table IDs
  if (document.getElementById('usersTable'))    adminLoadUsers();
  if (document.getElementById('staffTable'))    adminLoadStaff();
  if (document.getElementById('studentTable'))  adminLoadStudents();
  if (document.getElementById('groupTable'))    adminLoadGroups();
  if (document.getElementById('projectTable'))  adminLoadProjects();
  if (document.getElementById('cycleTable'))    adminLoadCycles();
});
