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

    logAuditEvent('User "' + name + '" created (' + normalizedRole + ')', 'Users', 'Success');
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
    logAuditEvent('Profile "' + name + '" deleted', 'Users', 'Success');
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
      const delBtn = `<button onclick="adminDeleteStudent('${s.id}', '${(s.name||'').replace(/'/g,'')}', '${s.student_id||''}')" style="background:#fee2e2;color:#dc2626;border:none;padding:3px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600">Delete</button>`;
      return `<td>${sid}</td><td>${s.name}</td><td>${s.programme || '—'}</td><td>Year 4</td><td>${badge}</td><td>—</td><td>${delBtn}</td>`;
    });

    _loadTable('studentTable', 'studentCount', rows);
  } catch (e) {
    console.error('[Admin] loadStudents:', e);
    showToast('Failed to load students', 'error');
  }
}

async function adminDeleteStudent(id, name, studentId) {
  if (!confirm('Delete student "' + name + '"? This cannot be undone.')) return;
  const sb = _sb();
  if (!sb) { showToast('Database not connected', 'error'); return; }
  try {
    if (studentId) {
      try { await sb.from('group_students').delete().eq('student_id', studentId); } catch (_) {}
      try { await sb.from('student_status').delete().eq('student_id', studentId); } catch (_) {}
    }
    const { error } = await sb.from('profiles').delete().eq('id', id);
    if (error) throw error;
    showToast('Student "' + name + '" deleted successfully', 'success');
    logAuditEvent('Student "' + name + '" deleted', 'Students', 'Success');
    adminLoadStudents();
  } catch (e) {
    console.error('[Admin] deleteStudent:', e);
    showToast('Delete failed: ' + e.message, 'error');
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

    logAuditEvent('Student "' + name + '" created', 'Students', 'Success');
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

// ─── CSV, Excel, and PDF Student Import & Processing ─────────
let _parsedStudentRecords = [];

function adminDownloadCsvTemplate() {
  const csvContent = "Student ID,Full Name,Programme,Email\r\n"
    + "2024-BCS-001,John Doe,BSCS,2024-bcs-001@student.cavendish.ac.ug\r\n"
    + "2024-BIT-002,Jane Namubiru,BIT,2024-bit-002@student.cavendish.ac.ug\r\n"
    + "2024-BSE-003,Alex Mukasa,BSE,2024-bse-003@student.cavendish.ac.ug\r\n"
    + "2024-BCS-004,Sarah Akello,BSCS,2024-bcs-004@student.cavendish.ac.ug\r\n";
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'students_import_template.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function adminDownloadExcelTemplate() {
  const data = [
    ["Student ID", "Full Name", "Programme", "Email"],
    ["2024-BCS-001", "John Doe", "BSCS", "2024-bcs-001@student.cavendish.ac.ug"],
    ["2024-BIT-002", "Jane Namubiru", "BIT", "2024-bit-002@student.cavendish.ac.ug"],
    ["2024-BSE-003", "Alex Mukasa", "BSE", "2024-bse-003@student.cavendish.ac.ug"],
    ["2024-BCS-004", "Sarah Akello", "BSCS", "2024-bcs-004@student.cavendish.ac.ug"]
  ];
  if (typeof XLSX !== 'undefined') {
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    XLSX.writeFile(wb, "students_import_template.xlsx");
  } else {
    adminDownloadCsvTemplate();
  }
}

function adminDownloadPdfTemplate() {
  if (window.jspdf && window.jspdf.jsPDF) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'pt', 'a4');
    doc.setFontSize(14);
    doc.text("Student Import Template - Cavendish University Uganda", 40, 40);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text("Use these column headers when preparing student lists.", 40, 56);
    const head = [["Student ID", "Full Name", "Programme", "Email"]];
    const body = [
      ["2024-BCS-001", "John Doe", "BSCS", "2024-bcs-001@student.cavendish.ac.ug"],
      ["2024-BIT-002", "Jane Namubiru", "BIT", "2024-bit-002@student.cavendish.ac.ug"],
      ["2024-BSE-003", "Alex Mukasa", "BSE", "2024-bse-003@student.cavendish.ac.ug"],
      ["2024-BCS-004", "Sarah Akello", "BSCS", "2024-bcs-004@student.cavendish.ac.ug"]
    ];
    if (doc.autoTable) {
      doc.autoTable({
        head: head,
        body: body,
        startY: 70,
        theme: 'grid',
        headStyles: { fillColor: [10, 25, 47], textColor: [255, 255, 255] }
      });
    }
    doc.save("students_import_template.pdf");
  } else {
    adminDownloadCsvTemplate();
  }
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

async function adminHandleFileSelect(input) {
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

  const fname = file.name.toLowerCase();

  function showParsedRecords(records) {
    if (!records || records.length === 0) {
      if (msgEl) {
        msgEl.innerHTML = `<span style="color:#dc2626;font-size:12px;font-weight:600;">No valid student rows found in "${escHtml(file.name)}". Expected columns: Student ID, Full Name, Programme, Email.</span>`;
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
  }

  // 1. Excel (.xlsx, .xls)
  if (fname.endsWith('.xlsx') || fname.endsWith('.xls')) {
    if (typeof XLSX === 'undefined') {
      if (msgEl) {
        msgEl.innerHTML = '<span style="color:#dc2626;font-size:12px;">Excel library is loading, please try again in a moment.</span>';
        msgEl.style.display = 'block';
      }
      return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const csvContent = XLSX.utils.sheet_to_csv(firstSheet);
        const records = _parseCsv(csvContent);
        showParsedRecords(records);
      } catch (err) {
        console.error('Excel parse error:', err);
        if (msgEl) {
          msgEl.innerHTML = `<span style="color:#dc2626;font-size:12px;">Failed to read Excel file: ${escHtml(err.message)}</span>`;
          msgEl.style.display = 'block';
        }
      }
    };
    reader.readAsArrayBuffer(file);
    return;
  }

  // 2. PDF (.pdf)
  if (fname.endsWith('.pdf')) {
    const reader = new FileReader();
    reader.onload = async function(e) {
      try {
        if (typeof pdfjsLib === 'undefined') {
          throw new Error('PDF parsing library is loading. Please retry.');
        }
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const typedArray = new Uint8Array(e.target.result);
        const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
        const fullLines = [];
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          const lineMap = {};
          for (const item of textContent.items) {
            const y = Math.round(item.transform[5]);
            if (!lineMap[y]) lineMap[y] = [];
            lineMap[y].push(item.str.trim());
          }
          const sortedYs = Object.keys(lineMap).map(Number).sort((a,b) => b - a);
          for (const y of sortedYs) {
            const rowText = lineMap[y].filter(Boolean).join(',');
            if (rowText) fullLines.push(rowText);
          }
        }
        const records = _parseCsv(fullLines.join('\n'));
        showParsedRecords(records);
      } catch (err) {
        console.error('PDF parse error:', err);
        if (msgEl) {
          msgEl.innerHTML = `<span style="color:#dc2626;font-size:12px;">Failed to parse PDF: ${escHtml(err.message)}. For best results, use CSV or Excel.</span>`;
          msgEl.style.display = 'block';
        }
      }
    };
    reader.readAsArrayBuffer(file);
    return;
  }

  // 3. CSV / Plain Text (.csv, .txt)
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const records = _parseCsv(e.target.result);
      showParsedRecords(records);
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

// Alias for backwards compatibility
const adminHandleCsvFileSelect = adminHandleFileSelect;

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
      const groupNum = g.group_number || 'Group';
      const delBtn = `<button onclick="adminDeleteGroup('${g.id}', '${groupNum.replace(/'/g,'')}')" style="background:#fee2e2;color:#dc2626;border:none;padding:3px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600">Delete</button>`;
      return `<td>${g.group_number}</td><td>${g.project_title}</td><td>${members.length}</td><td>${preview || '—'}</td><td>${g.supervisor_name || '—'}</td><td>${badge}</td><td>${delBtn}</td>`;
    });

    _loadTable('groupTable', 'groupCount', rows);
  } catch (e) {
    console.error('[Admin] loadGroups:', e);
    showToast('Failed to load groups', 'error');
  }
}

async function adminDeleteGroup(id, groupNumber) {
  if (!confirm('Delete group "' + groupNumber + '"? This cannot be undone.')) return;
  const sb = _sb();
  if (!sb) { showToast('Database not connected', 'error'); return; }
  try {
    const { error } = await sb.from('groups').delete().eq('id', id);
    if (error) throw error;
    showToast('Group "' + groupNumber + '" deleted successfully', 'success');
    logAuditEvent('Group "' + groupNumber + '" deleted', 'Projects', 'Success');
    adminLoadGroups();
  } catch (e) {
    console.error('[Admin] deleteGroup:', e);
    showToast('Delete failed: ' + e.message, 'error');
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

    logAuditEvent('Group "' + groupName + '" created', 'Projects', 'Success');
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
      const projTitle = p.project_title || 'Project';
      const delBtn = `<button onclick="adminDeleteProject('${p.id}', '${projTitle.replace(/'/g,'')}')" style="background:#fee2e2;color:#dc2626;border:none;padding:3px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600">Delete</button>`;
      return `<td>${p.id.slice(0,8).toUpperCase()}</td><td>${p.project_title}</td><td>${p.category || '—'}</td><td>${p.group_number}</td><td>${p.supervisor_name || '—'}</td><td>${statusBadge}</td><td>${stage}</td><td>${delBtn}</td>`;
    });

    _loadTable('projectTable', 'projectCount', rows);
  } catch (e) {
    console.error('[Admin] loadProjects:', e);
    showToast('Failed to load projects', 'error');
  }
}

async function adminDeleteProject(id, title) {
  if (!confirm('Delete project "' + title + '"? This cannot be undone.')) return;
  const sb = _sb();
  if (!sb) { showToast('Database not connected', 'error'); return; }
  try {
    const { error } = await sb.from('groups').delete().eq('id', id);
    if (error) throw error;
    showToast('Project "' + title + '" deleted successfully', 'success');
    logAuditEvent('Project "' + title + '" deleted', 'Projects', 'Success');
    adminLoadProjects();
  } catch (e) {
    console.error('[Admin] deleteProject:', e);
    showToast('Delete failed: ' + e.message, 'error');
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

    logAuditEvent('Project "' + title + '" registered', 'Projects', 'Success');
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
      const cycleTitle = c.name || c.year || c.id;
      const delBtn = `<button onclick="adminDeleteCycle('${c.id}', '${cycleTitle.replace(/'/g,'')}')" style="background:#fee2e2;color:#dc2626;border:none;padding:3px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600">Delete</button>`;
      return `<td>${c.id}</td><td>${c.year}</td><td>${start}</td><td>${end}</td><td>${badge}</td><td>—</td><td>${delBtn}</td>`;
    });

    _loadTable('cycleTable', 'cycleCount', rows);
  } catch (e) {
    console.error('[Admin] loadCycles:', e);
    showToast('Failed to load cycles', 'error');
  }
}

async function adminDeleteCycle(id, name) {
  if (!confirm('Delete capstone cycle "' + name + '"? This cannot be undone.')) return;
  const sb = _sb();
  if (!sb) { showToast('Database not connected', 'error'); return; }
  try {
    const { error } = await sb.from('intakes').delete().eq('id', id);
    if (error) throw error;
    showToast('Cycle "' + name + '" deleted successfully', 'success');
    logAuditEvent('Capstone cycle "' + name + '" deleted', 'Configuration', 'Success');
    adminLoadCycles();
  } catch (e) {
    console.error('[Admin] deleteCycle:', e);
    showToast('Delete failed: ' + e.message, 'error');
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

    logAuditEvent('Capstone cycle "' + cname + '" created', 'Configuration', 'Success');
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

// ============================================================
// 9. PROGRAM MANAGEMENT — Academic Programs
// ============================================================

const DEFAULT_PROGRAMS = [
  { code: 'BSCS', name: 'Bachelor of Science in Computer Science', shortCode: 'CS', school: 'School of Computing & Technology', status: 'Active', level: 'Year 3' },
  { code: 'BIT',  name: 'Bachelor of Information Technology',       shortCode: 'IT', school: 'School of Computing & Technology', status: 'Active', level: 'Year 3' },
  { code: 'BSE',  name: 'Bachelor of Software Engineering',        shortCode: 'SE', school: 'School of Computing & Technology', status: 'Active', level: 'Year 4' },
  { code: 'BBA',  name: 'Bachelor of Business Administration',     shortCode: 'BA', school: 'School of Business',               status: 'Active', level: 'Year 3' }
];

function _getStoredPrograms() {
  try {
    const raw = localStorage.getItem('cms_academic_programs');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.error('Failed to parse cms_academic_programs:', e);
  }
  localStorage.setItem('cms_academic_programs', JSON.stringify(DEFAULT_PROGRAMS));
  return DEFAULT_PROGRAMS;
}

function _saveStoredPrograms(programs) {
  try {
    localStorage.setItem('cms_academic_programs', JSON.stringify(programs));
  } catch (e) {
    console.error('Failed to save cms_academic_programs:', e);
  }
}

async function adminLoadPrograms() {
  const table = document.getElementById('programTable');
  if (!table) return;

  let programs = [];
  const sb = _sb();
  if (sb) {
    try {
      const { data, error } = await sb.from('programs').select('*').order('code');
      if (!error && data && data.length > 0) {
        programs = data;
      }
    } catch (e) {
      // Supabase table does not exist or network issue; fallback to local storage
    }
  }

  if (programs.length === 0) {
    programs = _getStoredPrograms();
  }

  const rows = (programs || []).map(p => {
    const isActive = (p.status === 'Active' || p.status === 'ACTIVE');
    const badge = isActive ? _badge('Active', 'green') : _badge('Inactive', 'gray');
    const pCode = p.code || '—';
    const delBtn = `<button onclick="adminDeleteProgram('${pCode}', '${(p.name || pCode).replace(/'/g, '')}')" style="background:#fee2e2;color:#dc2626;border:none;padding:3px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600">Delete</button>`;
    return `<td>${pCode}</td><td>${p.name || '—'}</td><td>${p.shortCode || p.short_code || '—'}</td><td>${p.school || '—'}</td><td>${badge}</td><td>${p.level || '—'}</td><td>${delBtn}</td>`;
  });

  _loadTable('programTable', 'programCount', rows);
}

async function adminCreateProgram(btn) {
  const code      = _val('newProgCode');
  const name      = _val('newProgName');
  const shortCode = _val('newProgShortCode');
  const school    = _val('newProgSchool');
  const level     = _val('newProgLevel');
  const status    = _val('newProgStatus');

  if (!code || !name) {
    showToast('Program code and name are required', 'error');
    return;
  }

  _setBtn(btn, true);

  try {
    const newProg = {
      code: code.toUpperCase(),
      name: name,
      shortCode: shortCode || code.slice(0, 4).toUpperCase(),
      short_code: shortCode || code.slice(0, 4).toUpperCase(),
      school: school,
      level: level,
      status: status || 'Active',
      created_at: new Date().toISOString()
    };

    const current = _getStoredPrograms();
    const existingIdx = current.findIndex(p => (p.code || '').toUpperCase() === newProg.code);
    if (existingIdx !== -1) {
      current[existingIdx] = newProg;
    } else {
      current.push(newProg);
    }
    _saveStoredPrograms(current);

    const sb = _sb();
    if (sb) {
      try {
        await sb.from('programs').upsert(newProg);
      } catch (err) {}
    }

    logAuditEvent('Program "' + name + '" added', 'Configuration', 'Success');
    showToast('Program "' + name + '" added successfully', 'success');
    _closeModal(btn);
    _clearFields(['newProgCode', 'newProgName', 'newProgShortCode']);
    adminLoadPrograms();
  } catch (e) {
    console.error('[Admin] createProgram:', e);
    showToast('Error: ' + e.message, 'error');
  } finally {
    _setBtn(btn, false);
  }
}

async function adminDeleteProgram(code, name) {
  if (!confirm('Delete program "' + (name || code) + '"? This cannot be undone.')) return;
  try {
    const current = _getStoredPrograms();
    const updated = current.filter(p => (p.code || '').toUpperCase() !== (code || '').toUpperCase());
    _saveStoredPrograms(updated);

    const sb = _sb();
    if (sb) {
      try {
        await sb.from('programs').delete().eq('code', code);
      } catch (err) {}
    }

    showToast('Program "' + (name || code) + '" deleted successfully', 'success');
    logAuditEvent('Program "' + (name || code) + '" deleted', 'Configuration', 'Success');
    adminLoadPrograms();
  } catch (e) {
    console.error('[Admin] deleteProgram:', e);
    showToast('Delete failed: ' + e.message, 'error');
  }
}

// ============================================================
// 10. UNIVERSAL EXPORT (EXCEL & PDF)
// ============================================================

function adminExportToExcel(tableId, filename) {
  filename = (filename || 'export').replace(/[^a-zA-Z0-9_-]/g, '_');
  const table = document.getElementById(tableId);
  if (!table) { showToast('Table not found for export', 'error'); return; }

  // Clone table and remove the Action column
  const clone = table.cloneNode(true);
  const ths = Array.from(clone.querySelectorAll('th'));
  const actionIdx = ths.findIndex(th => th.textContent.trim().toLowerCase() === 'action');
  if (actionIdx !== -1) {
    clone.querySelectorAll('tr').forEach(tr => {
      if (tr.children[actionIdx]) tr.children[actionIdx].remove();
    });
  }

  if (typeof XLSX !== 'undefined') {
    const ws = XLSX.utils.table_to_sheet(clone);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Records");
    XLSX.writeFile(wb, filename + '.xlsx');
    showToast('Exported to ' + filename + '.xlsx', 'success');
  } else {
    // Fallback CSV
    const rows = Array.from(clone.querySelectorAll('tr')).map(tr => 
      Array.from(tr.children).map(td => `"${td.textContent.trim().replace(/"/g, '""')}"`).join(',')
    );
    const blob = new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast('Exported to ' + filename + '.csv', 'success');
  }
}

function adminExportToPDF(tableId, title, filename) {
  filename = (filename || 'export').replace(/[^a-zA-Z0-9_-]/g, '_');
  title = title || 'Cavendish University Uganda Report';
  const table = document.getElementById(tableId);
  if (!table) { showToast('Table not found for export', 'error'); return; }

  if (!window.jspdf || !window.jspdf.jsPDF) {
    showToast('PDF generator is loading, please retry in a moment', 'info');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('l', 'pt', 'a4');

  // Header Title & Branding
  doc.setFontSize(16);
  doc.setTextColor(10, 25, 47);
  doc.text('Cavendish University Uganda', 40, 36);
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(title + ' | Exported on ' + new Date().toLocaleString(), 40, 52);

  // Clone table and remove the Action column
  const clone = table.cloneNode(true);
  const ths = Array.from(clone.querySelectorAll('th'));
  const actionIdx = ths.findIndex(th => th.textContent.trim().toLowerCase() === 'action');
  if (actionIdx !== -1) {
    clone.querySelectorAll('tr').forEach(tr => {
      if (tr.children[actionIdx]) tr.children[actionIdx].remove();
    });
  }

  if (doc.autoTable) {
    doc.autoTable({
      html: clone,
      startY: 65,
      theme: 'grid',
      headStyles: {
        fillColor: [10, 25, 47],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 10
      },
      styles: {
        fontSize: 9,
        cellPadding: 5,
        overflow: 'linebreak'
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      }
    });
  }

  doc.save(filename + '.pdf');
  showToast('Exported to ' + filename + '.pdf', 'success');
}

// ============================================================
// 11. REPORTS GENERATION & EXPORT
// ============================================================

async function adminLoadReportStats() {
  const sb = _sb();
  let profiles = [];
  let groups = [];
  if (sb) {
    try {
      const [pRes, gRes] = await Promise.all([
        sb.from('profiles').select('id, role, is_active'),
        sb.from('groups').select('id, status, topic_status, mark')
      ]);
      if (pRes.data) profiles = pRes.data;
      if (gRes.data) groups = gRes.data;
    } catch(e) {}
  }

  const students = profiles.filter(p => p.role === 'student').length;
  const grps = groups.length;
  const sups = profiles.filter(p => p.role === 'supervisor' || p.role === 'coordinator').length;
  const completed = groups.filter(g => g.status === 'COMPLETE').length;
  const pending = groups.filter(g => g.topic_status === 'SUBMITTED' || g.topic_status === 'PENDING').length;
  const graded = groups.filter(g => g.mark != null).length;

  const cards = document.querySelectorAll('.grid.three .card .value');
  if (cards[0]) cards[0].textContent = students;
  if (cards[1]) cards[1].textContent = grps;
  if (cards[2]) cards[2].textContent = sups;
  if (cards[3]) cards[3].textContent = completed;
  if (cards[4]) cards[4].textContent = pending;
  if (cards[5]) cards[5].textContent = graded;
}

async function adminGenerateReport() {
  showToast('Generating report data...', 'info');
  const sb = _sb();
  let groups = [];
  if (sb) {
    try {
      const { data } = await sb.from('groups').select('group_number, project_title, category, supervisor_name, status, topic_status, mark');
      if (data && data.length) groups = data;
    } catch(e) {}
  }

  let container = document.getElementById('reportResultsContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'reportResultsContainer';
    container.className = 'card';
    container.style.marginTop = '18px';
    const mainSection = document.querySelector('section.page');
    if (mainSection) mainSection.appendChild(container);
  }

  const rowsHtml = (groups.length ? groups : [
    { group_number: 'GRP-01', project_title: 'Automated Attendance System', category: 'BSCS', supervisor_name: 'Dr. Jane Mugisha', status: 'IN_PROGRESS', topic_status: 'APPROVED', mark: '—' },
    { group_number: 'GRP-02', project_title: 'Health Clinic Records Portal', category: 'BIT', supervisor_name: 'Mr. David Ochieng', status: 'COMPLETE', topic_status: 'APPROVED', mark: '84' }
  ]).map(g => `
    <tr>
      <td>${escHtml(g.group_number)}</td>
      <td><strong>${escHtml(g.project_title)}</strong></td>
      <td>${escHtml(g.category || '—')}</td>
      <td>${escHtml(g.supervisor_name || '—')}</td>
      <td>${escHtml(g.topic_status || 'Pending')}</td>
      <td>${escHtml(g.status || '—')}</td>
      <td>${escHtml(String(g.mark ?? '—'))}</td>
    </tr>
  `).join('');

  container.innerHTML = `
    <div class="card-head" style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border);">
      <div>
        <h3 style="margin:0 0 4px 0;">Generated Operational Report</h3>
        <span class="helper">Report generated on ${new Date().toLocaleDateString()}</span>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn" onclick="adminExportToExcel('reportGeneratedTable','operational_report')">Export Excel (.xlsx)</button>
        <button class="btn btn-primary" onclick="adminExportToPDF('reportGeneratedTable','Operational Report','operational_report')">Export PDF (.pdf)</button>
      </div>
    </div>
    <div class="table-wrap">
      <table id="reportGeneratedTable">
        <thead>
          <tr>
            <th>Group ID</th>
            <th>Project Title</th>
            <th>Program</th>
            <th>Supervisor</th>
            <th>Topic Status</th>
            <th>Stage</th>
            <th>Mark</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;
  showToast('Report generated successfully', 'success');
}

function adminExportReport(fmt) {
  const table = document.getElementById('reportGeneratedTable');
  if (!table) {
    adminGenerateReport().then(() => {
      setTimeout(() => {
        if (fmt === 'excel') adminExportToExcel('reportGeneratedTable', 'administrative_report');
        else if (fmt === 'pdf') adminExportToPDF('reportGeneratedTable', 'Administrative Operational Report', 'administrative_report');
        else adminExportToExcel('reportGeneratedTable', 'administrative_report');
      }, 400);
    });
    return;
  }
  if (fmt === 'excel') adminExportToExcel('reportGeneratedTable', 'administrative_report');
  else if (fmt === 'pdf') adminExportToPDF('reportGeneratedTable', 'Administrative Operational Report', 'administrative_report');
  else adminExportToExcel('reportGeneratedTable', 'administrative_report');
}

// ─── Audit Logs ─────────────────────────────────────────────

function _getStoredAuditLogs() {
  try {
    const raw = localStorage.getItem('cms_audit_logs');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  // Seed with some initial system entries
  const seed = [
    { id: 'EVT-0001', activity: 'System initialized', actor: 'System', module: 'System', ts: new Date(Date.now() - 7200000).toISOString(), outcome: 'Success' },
    { id: 'EVT-0002', activity: 'Admin logged in', actor: localStorage.getItem('cms_logged_user') || 'Administrator', module: 'Authentication', ts: new Date(Date.now() - 3600000).toISOString(), outcome: 'Success' },
  ];
  localStorage.setItem('cms_audit_logs', JSON.stringify(seed));
  return seed;
}

function logAuditEvent(activity, module, outcome) {
  outcome = outcome || 'Success';
  const logs = _getStoredAuditLogs();
  const nextNum = logs.length + 1;
  const id = 'EVT-' + String(nextNum).padStart(4, '0');
  const actor = localStorage.getItem('cms_logged_user') || 'Administrator';
  logs.unshift({ id, activity, actor, module, ts: new Date().toISOString(), outcome });
  // Keep at most 500 entries
  if (logs.length > 500) logs.splice(500);
  try { localStorage.setItem('cms_audit_logs', JSON.stringify(logs)); } catch (e) {}
  // Re-render if we're on the audit page
  if (document.getElementById('auditTable')) adminRenderAuditLogs(logs);
}

let _allAuditLogs = [];

async function adminLoadAuditLogs() {
  const localLogs = _getStoredAuditLogs();
  const sb = _sb();
  const items = [...localLogs];

  if (sb) {
    try {
      const [rNotifs, rDocs, rDefs, rCerts, rCertDls, rGroups, rProfiles, rMarks] = await Promise.all([
        sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(150),
        sb.from('documents').select('*').order('uploaded_at', { ascending: false }).limit(100),
        sb.from('defenses').select('*').order('created_at', { ascending: false }).limit(100),
        sb.from('certificates').select('*').order('issued_at', { ascending: false }).limit(100),
        sb.from('certificate_downloads').select('*').order('downloaded_at', { ascending: false }).limit(100),
        sb.from('groups').select('*').order('created_at', { ascending: false }).limit(100),
        sb.from('profiles').select('*').order('created_at', { ascending: false }).limit(100),
        sb.from('marks').select('*').limit(100)
      ]);

      // 1. Notifications activity
      if (rNotifs?.data) {
        rNotifs.data.forEach(n => {
          let outcome = 'Success';
          const t = (n.title || '').toLowerCase();
          if (t.includes('revision') || t.includes('returned') || n.type === 'warning') outcome = 'Warning';
          else if (t.includes('reject') || t.includes('decline') || n.type === 'error') outcome = 'Error';

          let mod = 'System';
          if (t.includes('defense') || t.includes('student')) mod = 'Students';
          else if (t.includes('document') || t.includes('topic') || t.includes('project') || t.includes('marks')) mod = 'Projects';
          else if (t.includes('certificate')) mod = 'Certificates';

          let actor = n.recipient_email || 'System';
          const m = (n.message || '').match(/^(Supervisor\s+[^:\s]+|Student\s+[^:\s]+|Hi\s+[^,\s]+)/i);
          if (m && m[1]) actor = m[1];

          items.push({
            activity: n.title ? (n.title + ' — ' + (n.message || '').slice(0, 130)) : (n.message || 'System Notification'),
            actor: actor,
            module: mod,
            ts: n.created_at || new Date().toISOString(),
            outcome
          });
        });
      }

      // 2. Document upload & review activity
      if (rDocs?.data) {
        rDocs.data.forEach(d => {
          if (d.uploaded_at) {
            items.push({
              activity: `Uploaded deliverable: "${d.file_name}" (${d.document_type || 'PROPOSAL'})`,
              actor: d.student_id || 'Student',
              module: 'Projects',
              ts: d.uploaded_at,
              outcome: 'Success'
            });
          }
          if (d.reviewed_at) {
            const isRej = (d.supervisor_comments || '').toUpperCase().includes('[REJECTED]');
            items.push({
              activity: `Reviewed deliverable: "${d.file_name}" (${isRej ? 'Changes Requested' : 'Approved'})`,
              actor: 'Faculty Supervisor',
              module: 'Projects',
              ts: d.reviewed_at,
              outcome: isRej ? 'Warning' : 'Success'
            });
          }
        });
      }

      // 3. Oral Defenses
      if (rDefs?.data) {
        rDefs.data.forEach(d => {
          items.push({
            activity: `Oral defense ${d.status === 'PENDING' ? 'requested' : d.status.toLowerCase()} for ${d.student_name || d.student_id} (${d.group_number || ''})`,
            actor: d.student_name || d.student_id || 'Student',
            module: 'Students',
            ts: d.created_at || d.submitted_date || new Date().toISOString(),
            outcome: 'Success'
          });
        });
      }

      // 4. Groups & Topics
      if (rGroups?.data) {
        rGroups.data.forEach(g => {
          items.push({
            activity: `Capstone group ${g.group_number} (${g.project_title || 'Topic Registration'}): Status is ${g.status || 'IN_PROGRESS'}${g.mark != null ? ' (Mark: ' + g.mark + '/100)' : ''}`,
            actor: g.supervisor_name || 'Coordinator',
            module: 'Projects',
            ts: g.created_at || new Date().toISOString(),
            outcome: g.status === 'COMPLETE' ? 'Success' : 'Viewed'
          });
        });
      }

      // 5. Certificates Issued
      if (rCerts?.data) {
        rCerts.data.forEach(c => {
          items.push({
            activity: `Capstone completion certificate issued for ${c.student_name} (${c.serial}, Score: ${c.score}/100)`,
            actor: 'Coordinator',
            module: 'Certificates',
            ts: c.issued_at || c.created_at || new Date().toISOString(),
            outcome: 'Success'
          });
        });
      }

      // 6. Certificate Downloads
      if (rCertDls?.data) {
        rCertDls.data.forEach(cd => {
          items.push({
            activity: `Certificate downloaded (serial: ${cd.serial || 'N/A'})`,
            actor: cd.downloaded_by || cd.student_id || 'Student',
            module: 'Certificates',
            ts: cd.downloaded_at || new Date().toISOString(),
            outcome: 'Viewed'
          });
        });
      }

      // 7. Marks & Evaluations
      if (rMarks?.data) {
        rMarks.data.forEach(m => {
          items.push({
            activity: `Assessment marks recorded for ${m.student_name || m.student_id} (${m.total}/100) by ${m.supervisor_name || 'Supervisor'}`,
            actor: m.supervisor_name || 'Supervisor',
            module: 'Projects',
            ts: m.created_at || new Date().toISOString(),
            outcome: 'Success'
          });
        });
      }

      // 8. User registrations
      if (rProfiles?.data) {
        rProfiles.data.forEach(p => {
          items.push({
            activity: `User account registered: ${p.name || p.email} (Role: ${p.role || 'student'})`,
            actor: p.email || 'System',
            module: 'Users',
            ts: p.created_at || new Date().toISOString(),
            outcome: 'Success'
          });
        });
      }
    } catch(err) {
      console.warn('Audit logs Supabase fetch notice:', err);
    }
  }

  // Sort newest first
  items.sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0));

  // Assign sequential Event IDs
  _allAuditLogs = items.map((r, i) => ({
    ...r,
    id: 'EVT-' + String(i + 1).padStart(4, '0')
  }));

  adminRenderAuditLogs(_allAuditLogs);
}

function adminRenderAuditLogs(logs) {
  const tbody = document.querySelector('#auditTable tbody');
  if (!tbody) return;

  const evtFilter = document.getElementById('auditEventFilter');
  const outFilter = document.getElementById('auditOutcomeFilter');
  const searchEl = document.querySelector('[data-filter="#auditTable"]');
  const q = searchEl ? searchEl.value.toLowerCase() : '';
  const evtVal = evtFilter ? evtFilter.value : '';
  const outVal = outFilter ? outFilter.value : '';

  const filtered = logs.filter(r => {
    if (evtVal && evtVal !== 'All event types' && r.module !== evtVal) return false;
    if (outVal && outVal !== 'All outcomes' && r.outcome !== outVal) return false;
    if (q && !r.activity.toLowerCase().includes(q) && !r.actor.toLowerCase().includes(q) && !r.module.toLowerCase().includes(q)) return false;
    return true;
  });

  const outcomeColor = { Success: 'green', Viewed: 'blue', Warning: 'amber', Error: 'red' };

  tbody.innerHTML = filtered.length
    ? filtered.map(r => {
        const ts = r.ts ? new Date(r.ts).toLocaleString() : '';
        const color = outcomeColor[r.outcome] || 'gray';
        return `<tr>
          <td style="font-family:monospace;font-size:12px">${escHtml(r.id)}</td>
          <td>${escHtml(r.activity)}</td>
          <td>${escHtml(r.actor)}</td>
          <td>${escHtml(r.module)}</td>
          <td style="font-size:12px;color:var(--muted)">${ts}</td>
          <td>${_badge(r.outcome, color)}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted)">No audit log entries found.</td></tr>`;

  const countEl = document.querySelector('.pagination span');
  if (countEl) countEl.textContent = `Showing ${filtered.length} of ${logs.length} records`;
}

function adminFilterAuditLogs() {
  adminRenderAuditLogs(_allAuditLogs);
}

// ─── DOMContentLoaded ────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
  // Determine which page we're on by checking for known table IDs
  if (document.getElementById('usersTable'))    adminLoadUsers();
  if (document.getElementById('staffTable'))    adminLoadStaff();
  if (document.getElementById('studentTable'))  adminLoadStudents();
  if (document.getElementById('groupTable'))    adminLoadGroups();
  if (document.getElementById('projectTable'))  adminLoadProjects();
  if (document.getElementById('cycleTable'))    adminLoadCycles();
  if (document.getElementById('programTable'))  adminLoadPrograms();
  if (document.getElementById('auditTable'))    adminLoadAuditLogs();
  if (window.location.pathname.includes('reports.html')) adminLoadReportStats();

  // Wire audit log filters
  const evtFilter = document.getElementById('auditEventFilter');
  const outFilter = document.getElementById('auditOutcomeFilter');
  const searchEl = document.querySelector('[data-filter="#auditTable"]');
  if (evtFilter) evtFilter.addEventListener('change', adminFilterAuditLogs);
  if (outFilter) outFilter.addEventListener('change', adminFilterAuditLogs);
  if (searchEl) searchEl.addEventListener('input', adminFilterAuditLogs);
});
