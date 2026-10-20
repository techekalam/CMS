/* =========================================================
   MAIN.JS – Global Interactivity for Capstone Management System
   Handles session persistence, dynamic progress tracker,
   profile sync, proposal submissions, group chat, and notifications.
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {
    initUserSession();
    initDashboardTracker();
    initProfileForm();
    initRegistrationForm();
    initProjectPage();
    initGroupPage();
    initSupervisorPage();
    initAssessmentsPage();
    initNotificationsPage();
});

// ── Shared Helper: Get Supabase Client ──
function _getMainSb() {
    if (window.CMS_SB && window.CMS_SB.client) return window.CMS_SB.client();
    if (typeof supabase !== 'undefined' && supabase.createClient) {
        return supabase.createClient('https://ygkwjlfhwtwkxtdvjzfc.supabase.co', 'sb_publishable_cnfuCpwVHpcWEkXye0KP-w_Vsy3NAqs');
    }
    return null;
}

function escHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

// ── Shared Helper: Get Student Group & Status ──
async function getStudentGroup(sb, email, studentId) {
    if (!sb) return null;
    let sId = studentId;
    let prof = null;
    if (email) {
        try {
            const { data } = await sb.from('profiles').select('id, student_id, name, programme').eq('email', email).maybeSingle();
            prof = data;
            if (prof && prof.student_id) sId = prof.student_id;
        } catch(e) {}
    }
    if (!sId && !prof) return null;

    let groupId = null;
    let stStatus = null;

    // 1. Try student_status table
    if (sId) {
        try {
            const { data } = await sb.from('student_status').select('*').eq('student_id', sId).maybeSingle();
            stStatus = data;
            if (stStatus && stStatus.group_id) groupId = stStatus.group_id;
        } catch(e) {}
    }

    // 2. Fallback to group_students table
    if (!groupId && sId) {
        try {
            const { data } = await sb.from('group_students').select('group_id').eq('student_id', sId).maybeSingle();
            if (data && data.group_id) groupId = data.group_id;
        } catch(e) {}
    }

    if (!groupId && prof && prof.name) {
        try {
            const { data } = await sb.from('group_students').select('group_id').ilike('name', prof.name).maybeSingle();
            if (data && data.group_id) groupId = data.group_id;
        } catch(e) {}
    }

    if (!groupId) return { group: null, studentStatus: stStatus, studentId: sId, profile: prof };

    // 3. Fetch full group record
    let grp = null;
    try {
        const { data } = await sb.from('groups').select('*').eq('id', groupId).maybeSingle();
        grp = data;
    } catch(e) {}

    return { group: grp, studentStatus: stStatus, studentId: sId, profile: prof };
}

// ── Shared Helper: Auto Assign Supervisor ──
async function autoAssignSupervisor(sb, groupId) {
    try {
        const { data: supervisors } = await sb
            .from('profiles')
            .select('id, name')
            .eq('role', 'supervisor')
            .eq('is_active', true);
        if (!supervisors || supervisors.length === 0) return null;

        const { data: assignments } = await sb
            .from('groups')
            .select('supervisor_id')
            .not('supervisor_id', 'is', null);

        const countMap = {};
        supervisors.forEach(s => countMap[s.id] = 0);
        (assignments || []).forEach(a => {
            if (countMap[a.supervisor_id] !== undefined) countMap[a.supervisor_id]++;
        });

        const picked = supervisors.reduce((min, s) =>
            (countMap[s.id] < countMap[min.id]) ? s : min
        , supervisors[0]);

        await sb.from('groups').update({
            supervisor_id: picked.id,
            supervisor_name: picked.name,
            updated_at: new Date().toISOString()
        }).eq('id', groupId);

        return picked;
    } catch (e) {
        console.warn('Auto-assign supervisor notice:', e);
        return null;
    }
}

/* ── 1. USER SESSION & HEADER IDENTITY ── */
async function initUserSession() {
    const userNameElements = document.querySelectorAll('.dash-user-name');
    const userIdElements   = document.querySelectorAll('.dash-user-id');

    let savedName = localStorage.getItem('cms_student_name') || 'Student Account';
    let savedId   = localStorage.getItem('cms_student_id')   || '';

    userNameElements.forEach(el => el.textContent = savedName);
    userIdElements.forEach(el => el.textContent = savedId);

    const email = (localStorage.getItem('cms_logged_user') || '').trim().toLowerCase();
    if (!email) return;

    try {
        const sb = _getMainSb();
        if (!sb) return;
        const { data: profile } = await sb.from('profiles').select('*').eq('email', email).maybeSingle();
        if (!profile) return;

        if (profile.name)       localStorage.setItem('cms_student_name',  profile.name);
        if (profile.student_id) localStorage.setItem('cms_student_id',    profile.student_id);
        if (profile.programme)  localStorage.setItem('cms_student_prog',  profile.programme);
        if (profile.phone)      localStorage.setItem('cms_student_phone', profile.phone);

        const displayName = profile.name || savedName;
        const displayId   = profile.student_id || savedId;

        userNameElements.forEach(el => el.textContent = displayName);
        userIdElements.forEach(el => el.textContent = displayId);
    } catch (err) {
        console.warn('[CMS] Could not fetch profile from Supabase:', err);
    }
}

/* ── 2. DASHBOARD PROGRESS TRACKER & MILESTONES ── */
async function initDashboardTracker() {
    const trackerCard = document.querySelector('.tracker-card');
    if (!trackerCard && !document.querySelector('.milestone-table')) return;

    const sb = _getMainSb();
    const email = (localStorage.getItem('cms_logged_user') || '').trim().toLowerCase();
    let studentId = localStorage.getItem('cms_student_id') || '';

    let groupInfo = null;
    let marks = null;

    if (sb) {
        try {
            groupInfo = await getStudentGroup(sb, email, studentId);
            const sId = groupInfo?.studentId || studentId;
            if (sId) {
                const { data: mk } = await sb.from('marks').select('*').eq('student_id', sId).maybeSingle();
                marks = mk;
            }
        } catch(e) { console.warn(e); }
    }

    const grp = groupInfo?.group;
    const stStatus = groupInfo?.studentStatus;
    const scenarioPills = document.querySelectorAll('.scenario-row .scenario-pill');

    // 1. Update Scenario Pills
    if (scenarioPills && scenarioPills.length >= 3) {
        const pill1Val = scenarioPills[0].querySelector('.scenario-value');
        if (pill1Val) {
            pill1Val.textContent = grp ? grp.group_number : 'Assigned (Syncing)';
            pill1Val.style.color = '#2563eb';
            pill1Val.style.fontWeight = '700';
        }

        const pill2Val = scenarioPills[1].querySelector('.scenario-value');
        if (pill2Val) {
            if (grp && grp.supervisor_name) {
                pill2Val.textContent = grp.supervisor_name;
            } else if (grp) {
                pill2Val.textContent = 'Supervisor Assigned';
            } else {
                pill2Val.textContent = 'Pending';
            }
        }

        const pill3Val = scenarioPills[2].querySelector('.scenario-value');
        if (pill3Val) {
            if (marks) {
                pill3Val.textContent = `Completed (${marks.total}/100)`;
                pill3Val.style.color = '#15803d';
            } else if (stStatus && stStatus.defense_status === 'SCHEDULED') {
                pill3Val.textContent = `Defense: ${stStatus.defense_date || 'Scheduled'}`;
                pill3Val.style.color = '#d97706';
            } else if (stStatus && stStatus.defense_status === 'PENDING_COORDINATOR_REVIEW') {
                pill3Val.textContent = 'Pending Review';
            } else if (grp && grp.topic_status === 'APPROVED') {
                pill3Val.textContent = 'Proposal In Progress';
            } else {
                pill3Val.textContent = 'In Progress';
            }
        }
    }

    // 2. Compute dynamic milestone completion percentage
    let completedSteps = 1; // Roster placed upon student registration
    if (grp && grp.topic_status === 'APPROVED') completedSteps = 2;
    if (stStatus && (stStatus.defense_status === 'SCHEDULED' || stStatus.defense_status === 'PENDING_COORDINATOR_REVIEW')) completedSteps = 3;
    if (marks || (stStatus && stStatus.completion_percentage === 100)) completedSteps = 4;

    const calculatedPct = Math.round((completedSteps / 4) * 100);

    const trackerBar  = document.querySelector('.tracker-progress-fill') || document.querySelector('.progress-fill');
    const pctText     = document.querySelector('.tracker-pct-val') || document.querySelector('.big-percent');
    const pctBlue     = document.querySelector('.percent-blue');
    const badge       = document.querySelector('.tracker-status-badge');

    if (trackerBar) trackerBar.style.width = calculatedPct + '%';
    if (pctText) pctText.textContent = calculatedPct + '%';
    if (pctBlue) pctBlue.textContent = calculatedPct + '% Completed';

    if (badge) {
        if (calculatedPct === 100) {
            badge.textContent = 'Completed (100%)';
            badge.style.background = '#dcfce7';
            badge.style.color = '#15803d';
        } else {
            badge.textContent = `In Progress (${calculatedPct}%)`;
            badge.style.background = '#e0f2fe';
            badge.style.color = '#0369a1';
        }
    }

    // 3. Update Step items on tracker card
    const stepItems = document.querySelectorAll('.milestone-steps .step-item');
    if (stepItems && stepItems.length >= 4) {
        const s1 = stepItems[0].querySelector('.step-status');
        if (s1) { s1.className = 'step-status approved'; s1.textContent = grp ? `Active in ${grp.group_number}` : 'Completed'; }

        const s2 = stepItems[1].querySelector('.step-status');
        if (s2) {
            if (grp && grp.topic_status === 'APPROVED') {
                s2.className = 'step-status approved'; s2.textContent = 'Approved by Supervisor';
            } else if (grp && grp.topic_status === 'REUPLOAD_REQUESTED') {
                s2.className = 'step-status declined'; s2.textContent = 'Revision Requested';
            } else {
                s2.className = 'step-status pending'; s2.textContent = 'Submitted for Review';
            }
        }

        const s3 = stepItems[2].querySelector('.step-status');
        if (s3) {
            if (completedSteps >= 3) {
                s3.className = 'step-status approved'; s3.textContent = 'Deliverables Submitted';
            } else {
                s3.className = 'step-status pending'; s3.textContent = 'In Preparation';
            }
        }

        const s4 = stepItems[3].querySelector('.step-status');
        if (s4) {
            if (marks) {
                s4.className = 'step-status approved'; s4.textContent = `Graded (${marks.total}/100)`;
            } else if (stStatus && stStatus.defense_status === 'SCHEDULED') {
                s4.className = 'step-status pending'; s4.textContent = `Scheduled: ${stStatus.defense_date || ''}`;
            } else {
                s4.className = 'step-status pending'; s4.textContent = 'Awaiting Panel';
            }
        }
    }

    // 4. Update milestones table if on dashboard
    const milestoneTable = document.querySelector('.milestone-table');
    if (milestoneTable) {
        const rows = milestoneTable.querySelectorAll('tbody tr');
        rows.forEach((row, idx) => {
            const b = row.querySelector('.ms-badge');
            if (!b) return;
            if (idx < completedSteps) {
                b.className = 'ms-badge ms-approved';
                b.textContent = 'Completed';
                b.style.background = '#dcfce7';
                b.style.color = '#15803d';
            } else {
                b.className = 'ms-badge ms-pending';
                b.textContent = 'Pending';
                b.style.background = '#fef3c7';
                b.style.color = '#b45309';
            }
        });
    }
}

/* ── 3. PROFILE FORM ── */
async function initProfileForm() {
    const profileForm = document.getElementById('profileForm');
    if (!profileForm) return;

    const nameInput  = document.getElementById('full-name');
    const idInput    = document.getElementById('student-id');
    const progSelect = document.getElementById('program');
    const phoneInput = document.getElementById('phone');

    // Make name and student ID read-only – these come from the DB and cannot be changed
    if (nameInput) {
        nameInput.readOnly = true;
        nameInput.style.background = '#f1f5f9';
        nameInput.style.color = '#64748b';
        nameInput.style.cursor = 'not-allowed';
        nameInput.title = 'Your name is set from your registration and cannot be changed here.';
    }
    if (idInput) {
        idInput.readOnly = true;
        idInput.style.background = '#f1f5f9';
        idInput.style.color = '#64748b';
        idInput.style.cursor = 'not-allowed';
        idInput.title = 'Your Student ID is set from your registration and cannot be changed here.';
    }

    // Pre-fill from localStorage immediately
    if (nameInput)  nameInput.value  = localStorage.getItem('cms_student_name')  || '';
    if (idInput)    idInput.value    = localStorage.getItem('cms_student_id')    || '';
    if (progSelect) progSelect.value = localStorage.getItem('cms_student_prog')  || '';
    if (phoneInput) phoneInput.value = localStorage.getItem('cms_student_phone') || '';

    // Then fetch the real data from Supabase
    const email = (localStorage.getItem('cms_logged_user') || '').trim().toLowerCase();
    if (email) {
        try {
            const sb = window.CMS_SB && window.CMS_SB.client();
            if (sb) {
                const profile = await window.CMS_SB.Auth.getProfile(email);
                if (profile) {
                    if (nameInput && profile.name)       nameInput.value  = profile.name;
                    if (idInput   && profile.student_id) idInput.value    = profile.student_id;
                    if (progSelect && profile.programme) {
                        // Match programme code (DB stores e.g. 'BSCS', form uses 'bcs')
                        const codeMap = { BSCS:'bcs', BSIT:'bit', BDSAI:'bdsai', NETSEC:'netsec' };
                        const mapped = codeMap[profile.programme] || profile.programme.toLowerCase();
                        progSelect.value = mapped;
                    }
                    if (phoneInput && profile.phone) phoneInput.value = profile.phone;
                }
            }
        } catch (err) {
            console.warn('[CMS] initProfileForm fetch error:', err);
        }
    }

    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newProg = progSelect ? progSelect.value        : '';
        const newPh   = phoneInput ? phoneInput.value.trim() : '';

        // Save phone and programme only (name & ID are read-only)
        if (newProg) localStorage.setItem('cms_student_prog',  newProg);
        if (newPh)   localStorage.setItem('cms_student_phone', newPh);

        // Also persist phone/programme to Supabase if we have the profile
        try {
            const sb = window.CMS_SB && window.CMS_SB.client();
            if (sb && email) {
                const profile = await window.CMS_SB.Auth.getProfile(email);
                if (profile && profile.id) {
                    const COURSE_CODES = { bcs:'BSCS', bit:'BSIT', bdsai:'BDSAI', netsec:'NETSEC' };
                    const updates = {};
                    if (newProg) updates.programme = COURSE_CODES[newProg] || newProg.toUpperCase();
                    if (newPh)   updates.phone     = newPh;
                    if (Object.keys(updates).length) {
                        await window.CMS_SB.Auth.updateProfile(profile.id, updates);
                    }
                }
            }
        } catch (err) {
            console.warn('[CMS] Could not save profile to Supabase:', err);
        }

        showToast('Profile updated successfully.');
    });
}

/* ── 4. REGISTRATION FORM (Project Proposal) ── */
function initRegistrationForm() {
    const regForm = document.getElementById('projectRegForm') || document.querySelector('main .tracker-card form');
    if (!regForm || !window.location.pathname.includes('registration.html')) return;

    regForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const titleEl  = document.getElementById('project-title');
        const domainEl = document.getElementById('domain');
        const descEl   = document.getElementById('description');

        if (!titleEl || !titleEl.value.trim()) {
            alert('Please provide a project title.');
            return;
        }

        const projectData = {
            title: titleEl.value.trim(),
            category: domainEl ? domainEl.options[domainEl.selectedIndex].text : 'Web Application',
            description: descEl ? descEl.value.trim() : '',
            status: 'Approved',
            submittedAt: new Date().toLocaleDateString()
        };

        localStorage.setItem('cms_student_project', JSON.stringify(projectData));
        showToast('Project proposal submitted successfully.');
        setTimeout(() => {
            window.location.href = 'project.html';
        }, 1000);
    });
}

/* ── 5. MY PROJECT PAGE ── */
// Helper to open student deliverables safely (supports Base64 blobs & normal URLs)
function openStudentDoc(url, filename) {
    if (!url || url === '#') {
        alert('File URL is not available.');
        return;
    }
    if (url.startsWith('data:')) {
        try {
            const [meta, b64] = url.split(',');
            const mimeMatch = meta.match(/:(.*?);/);
            const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
            const binary = atob(b64);
            const u8arr = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) u8arr[i] = binary.charCodeAt(i);
            const blob = new Blob([u8arr], { type: mime });
            const blobUrl = URL.createObjectURL(blob);

            if (mime === 'application/pdf') {
                window.open(blobUrl, '_blank');
            } else {
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = filename || 'deliverable';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
        } catch (e) {
            console.error('Error opening blob doc:', e);
            alert('Could not open document.');
        }
    } else {
        window.open(url, '_blank');
    }
}

async function loadStudentDocuments(sb, studentId, groupId) {
    const container = document.getElementById('studentDocsContainer');
    if (!container || !sb) return;

    try {
        const email = (localStorage.getItem('cms_logged_user') || '').trim().toLowerCase();
        let sId = studentId || localStorage.getItem('cms_student_id') || '';

        // If sId is still not available, try to resolve via profiles
        if (!sId && email) {
            try {
                const { data: prof } = await sb.from('profiles').select('id, student_id').eq('email', email).maybeSingle();
                if (prof) {
                    sId = prof.student_id || prof.id;
                    if (prof.student_id) localStorage.setItem('cms_student_id', prof.student_id);
                }
            } catch (_) {}
        }

        const filters = [];
        if (sId) filters.push(`student_id.eq.${sId}`);
        if (groupId) filters.push(`group_id.eq.${groupId}`);
        if (email && email !== sId) filters.push(`student_id.eq.${email}`);

        // Fetch notifications to see if there are revision requests for documents
        window._cachedRevisionDocIds = new Set();
        try {
            const { data: revNotifs } = await sb.from('notifications')
                .select('title, message')
                .ilike('title', '%revision%')
                .order('created_at', { ascending: false })
                .limit(50);
            if (revNotifs) {
                revNotifs.forEach(n => {
                    const msg = (n.message || '');
                    // Extracts filename if format is: reviewed "filename":
                    const m = msg.match(/reviewed\s+"([^"]+)"/i);
                    if (m && m[1]) {
                        window._cachedRevisionDocIds.add(m[1]);
                        window._cachedRevisionDocIds.add(m[1].toLowerCase().trim());
                    }
                    if (msg) {
                        window._cachedRevisionDocIds.add(msg.toLowerCase());
                    }
                });
            }
        } catch(_) {}

        let query = sb
            .from('documents')
            .select('id, file_name, file_url, document_type, uploaded_at, reviewed_at, supervisor_comments, student_id, group_id');

        if (filters.length > 0) {
            query = query.or(filters.join(','));
        }

        const { data: docs, error } = await query.order('uploaded_at', { ascending: false });

        if (error) throw error;

        if (!docs || docs.length === 0) {
            container.innerHTML = '<p style="font-size:13px;color:#64748b;margin:0;">No documents uploaded yet. Use the form above to submit your proposal or design models.</p>';
            return;
        }

        // Store docs locally in memory for helper functions
        window._studentDocsMap = window._studentDocsMap || {};
        docs.forEach(d => { window._studentDocsMap[d.id] = d; });

        let localApprovals = {};
        try { localApprovals = JSON.parse(localStorage.getItem('cms_doc_approvals') || '{}'); } catch(_) {}

        container.innerHTML = `
            <div style="overflow-x:auto;">
                <table style="width:100%;font-size:13px;border-collapse:collapse;">
                    <thead>
                        <tr style="text-align:left;background:#f8fafc;border-bottom:2px solid #e2e8f0;color:#64748b;font-size:11px;text-transform:uppercase;">
                            <th style="padding:10px 12px;">File Name</th>
                            <th style="padding:10px 12px;">Type</th>
                            <th style="padding:10px 12px;">Uploaded</th>
                            <th style="padding:10px 12px;">Review Status</th>
                            <th style="padding:10px 12px;">Supervisor Feedback</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${docs.map(d => {
                            const dateStr = d.uploaded_at
                                ? new Date(d.uploaded_at).toLocaleDateString([], {month:'short', day:'numeric', year:'numeric'})
                                : '—';
                            const isReviewed = !!d.reviewed_at;

                            // Resolve status reliably across all devices and historical entries
                            let docStatus = d.status || null;
                            const commentText = (d.supervisor_comments || '').toLowerCase();
                            
                            if (!docStatus && isReviewed) {
                                if (d.id in localApprovals) {
                                    docStatus = localApprovals[d.id] ? 'approved' : 'rejected';
                                } else if (commentText.includes('[rejected]') || commentText.includes('reject') || commentText.includes('revis') || commentText.includes('changes requested')) {
                                    docStatus = 'rejected';
                                } else if (commentText.includes('[approved]') || commentText.includes('approv')) {
                                    docStatus = 'approved';
                                } else {
                                    // Check if there is an associated revision request in notifications
                                    const safeName = (d.file_name || '').trim().toLowerCase();
                                    let hasRev = false;
                                    if (window._cachedRevisionDocIds) {
                                        if (window._cachedRevisionDocIds.has(d.file_name) || window._cachedRevisionDocIds.has(safeName)) {
                                            hasRev = true;
                                        } else {
                                            for (let item of window._cachedRevisionDocIds) {
                                                if (item && safeName && item.includes(safeName)) {
                                                    hasRev = true;
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                    docStatus = hasRev ? 'rejected' : 'approved';
                                }
                            }

                            const statusBadge = !isReviewed
                                ? '<span style="background:#fef3c7;color:#b45309;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;">⏳ Pending Review</span>'
                                : docStatus === 'rejected'
                                    ? '<span style="background:#fee2e2;color:#dc2626;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;">❌ Rejected / Changes Requested</span>'
                                    : '<span style="background:#dcfce7;color:#15803d;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;">✅ Approved</span>';

                            const typeLabel = (d.document_type || 'DELIVERABLE').replace(/_/g, ' ');
                            const safeFileName = escHtml(d.file_name);

                            return `
                                <tr style="border-bottom:1px solid #e2e8f0;">
                                    <td style="padding:10px 12px;color:#1e293b;">
                                        <button type="button" onclick="openStudentDocById('${d.id}')" style="background:none;border:none;padding:0;color:#2563eb;text-decoration:none;font-weight:600;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;">
                                            📄 ${safeFileName}
                                        </button>
                                    </td>
                                    <td style="padding:10px 12px;color:#64748b;font-size:12px;">${typeLabel}</td>
                                    <td style="padding:10px 12px;color:#64748b;font-size:12px;">${dateStr}</td>
                                    <td style="padding:10px 12px;">${statusBadge}</td>
                                    <td style="padding:10px 12px;color:#475569;font-size:12px;">${d.supervisor_comments ? '💬 ' + escHtml(d.supervisor_comments) : '—'}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch(err) {
        console.error('loadStudentDocuments error:', err);
        container.innerHTML = '<p style="font-size:13px;color:#64748b;margin:0;">No documents uploaded yet.</p>';
    }
}

function openStudentDocById(docId) {
    if (window._studentDocsMap && window._studentDocsMap[docId]) {
        const d = window._studentDocsMap[docId];
        openStudentDoc(d.file_url, d.file_name);
    }
}

async function initProjectPage() {
    if (!window.location.pathname.includes('project.html')) return;

    const sb = _getMainSb();
    const email = (localStorage.getItem('cms_logged_user') || '').trim().toLowerCase();
    let studentId = localStorage.getItem('cms_student_id') || '';

    const titleEl  = document.getElementById('displayProjTitle');
    const statusEl = document.getElementById('displayProjStatus');
    const catEl    = document.getElementById('displayProjCat');

    let currentGroupId = null;

    if (sb) {
        try {
            const groupInfo = await getStudentGroup(sb, email, studentId);
            if (groupInfo) {
                if (groupInfo.studentId) studentId = groupInfo.studentId;
                if (groupInfo.group) {
                    const grp = groupInfo.group;
                    currentGroupId = grp.id;

                    if (titleEl) titleEl.textContent = grp.project_title || `Capstone Project (${grp.group_number})`;
                    if (statusEl) {
                        const st = grp.topic_status || 'SUBMITTED';
                        statusEl.textContent = st === 'APPROVED' ? 'Approved' : (st === 'REUPLOAD_REQUESTED' ? 'Revision Requested' : 'Submitted / Under Review');
                        statusEl.style.background = st === 'APPROVED' ? '#dcfce7' : (st === 'REUPLOAD_REQUESTED' ? '#fee2e2' : '#fef3c7');
                        statusEl.style.color = st === 'APPROVED' ? '#15803d' : (st === 'REUPLOAD_REQUESTED' ? '#dc2626' : '#b45309');
                    }
                    if (catEl) catEl.textContent = grp.category || 'Software Development';
                }
            }
            // Load existing uploaded deliverables
            loadStudentDocuments(sb, studentId, currentGroupId);
        } catch(e) { console.warn('Project page fetch notice:', e); }
    }

    const uploadForm = document.getElementById('docUploadForm') || document.querySelector('form[enctype="multipart/form-data"]');
    if (uploadForm) {
        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fileInput = document.getElementById('file-upload');
            const typeInput = document.getElementById('artifact-type');
            const btn = document.getElementById('btnUploadDeliverable') || uploadForm.querySelector('button[type="submit"]');

            if (!fileInput || !fileInput.files.length) {
                alert('Please select a file to upload.');
                return;
            }

            const file = fileInput.files[0];
            const fileName = file.name;
            const rawType  = (typeInput ? typeInput.value : 'PROPOSAL').toUpperCase().replace(/-/g, '_');

            // Strictly validate against database constraint: ('PROPOSAL', 'SYSTEM_ARCHITECTURE', 'FINAL_DISSERTATION', 'DELIVERABLE')
            const validTypes = ['PROPOSAL', 'SYSTEM_ARCHITECTURE', 'FINAL_DISSERTATION', 'DELIVERABLE'];
            let mappedType = rawType;
            if (!validTypes.includes(mappedType)) {
                if (mappedType.includes('PROPOSAL')) mappedType = 'PROPOSAL';
                else if (mappedType.includes('DESIGN') || mappedType.includes('ARCH') || mappedType.includes('SRS')) mappedType = 'SYSTEM_ARCHITECTURE';
                else if (mappedType.includes('FINAL') || mappedType.includes('DISSERTATION') || mappedType.includes('REPORT')) mappedType = 'FINAL_DISSERTATION';
                else mappedType = 'DELIVERABLE';
            }

            if (btn) {
                btn.disabled = true;
                btn.textContent = 'Uploading...';
            }

            if (sb) {
                try {
                    const sId = studentId || (localStorage.getItem('cms_student_id')) || email;

                    // Read file as preview URL
                    const reader = new FileReader();
                    reader.onload = async function(ev) {
                        const fileUrl = (file.size < 1.5 * 1024 * 1024) ? ev.target.result : ('https://docs.google.com/viewer?url=' + encodeURIComponent(fileName));

                        const { error: insertErr } = await sb.from('documents').insert({
                            student_id: sId,
                            group_id: currentGroupId,
                            file_name: fileName,
                            file_url: fileUrl,
                            document_type: mappedType,
                            uploaded_at: new Date().toISOString()
                        });

                        if (btn) {
                            btn.disabled = false;
                            btn.textContent = 'Upload Deliverable';
                        }

                        if (insertErr) {
                            console.error('Doc upload error:', insertErr);
                            alert('Upload failed: ' + insertErr.message);
                            return;
                        }

                        showToast(`Uploaded "${fileName}" for supervisor review.`);
                        fileInput.value = '';
                        loadStudentDocuments(sb, sId, currentGroupId);
                    };
                    reader.readAsDataURL(file);
                } catch(err) {
                    console.error('Doc upload error:', err);
                    if (btn) {
                        btn.disabled = false;
                        btn.textContent = 'Upload Deliverable';
                    }
                    alert('Upload failed: ' + err.message);
                }
            } else {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Upload Deliverable';
                }
                showToast(`Uploaded "${fileName}".`);
                fileInput.value = '';
            }
        });
    }
}

/* ── 6. GROUP PAGE & CHAT ── */
async function initGroupPage() {
    if (!window.location.pathname.includes('group.html')) return;

    const sb = _getMainSb();
    if (!sb) return;

    try {
        const email = (localStorage.getItem('cms_logged_user') || '').trim().toLowerCase();
        let studentId = localStorage.getItem('cms_student_id') || '';

        const groupInfo = await getStudentGroup(sb, email, studentId);
        if (!groupInfo || !groupInfo.group) return;

        let group = groupInfo.group;

        // Auto assign supervisor if group has none
        if (!group.supervisor_id && !group.supervisor_name) {
            const picked = await autoAssignSupervisor(sb, group.id);
            if (picked) {
                group.supervisor_id = picked.id;
                group.supervisor_name = picked.name;
            }
        }

        const { data: members } = await sb.from('group_students')
            .select('student_id, name, course')
            .eq('group_id', group.id);

        const list = members || [];
        const pageBadge = document.getElementById('groupPageBadge');
        if (pageBadge) { pageBadge.textContent = 'Group ' + group.group_number; pageBadge.className = 'ms-badge ms-approved'; }
        const rosterBadge = document.getElementById('groupRosterBadge');
        if (rosterBadge) rosterBadge.textContent = group.group_number + ' · ' + list.length + ' member' + (list.length === 1 ? '' : 's');

        const body = document.getElementById('groupMembersBody');
        if (body && list.length) {
            body.innerHTML = '';
            list.forEach(m => {
                const tr = document.createElement('tr');
                [m.name, 'Member', m.student_id || '—', 'Active'].forEach(text => {
                    const td = document.createElement('td');
                    td.textContent = text;
                    tr.appendChild(td);
                });
                body.appendChild(tr);
            });
        }

        const topicEl = document.getElementById('groupTopic');
        if (topicEl && group.project_title) topicEl.textContent = group.project_title;
        const supEl = document.getElementById('groupSupervisor');
        if (supEl && group.supervisor_name) supEl.textContent = group.supervisor_name;
    } catch (err) {
        console.warn('[CMS] Could not load group:', err);
    }
}

/* ── 7. MY SUPERVISOR PAGE (Real-Time DB Sync) ── */
async function initSupervisorPage() {
    if (!window.location.pathname.includes('supervisor.html')) return;

    const nameEl    = document.getElementById('supervisorName');
    const initEl    = document.getElementById('supervisorInitials');
    const titleEl   = document.getElementById('supervisorTitle');
    const deptEl    = document.getElementById('supervisorDept');
    const emailEl   = document.getElementById('supervisorEmail');
    const officeEl  = document.getElementById('supervisorOffice');
    const hoursEl   = document.getElementById('supervisorHours');
    const groupEl   = document.getElementById('supervisorGroup');

    const sb = _getMainSb();
    if (!sb) return;

    const email = (localStorage.getItem('cms_logged_user') || '').trim().toLowerCase();
    let studentId = localStorage.getItem('cms_student_id') || '';

    try {
        const groupInfo = await getStudentGroup(sb, email, studentId);
        if (!groupInfo || !groupInfo.group) {
            if (nameEl) nameEl.textContent = 'Group Assignment In Progress';
            if (titleEl) titleEl.textContent = 'Placed automatically upon intake';
            if (groupEl) groupEl.textContent = 'Pending placement';
            return;
        }

        let grp = groupInfo.group;

        // Auto-assign supervisor if none assigned yet
        if (!grp.supervisor_id && !grp.supervisor_name) {
            const picked = await autoAssignSupervisor(sb, grp.id);
            if (picked) {
                grp.supervisor_id = picked.id;
                grp.supervisor_name = picked.name;
            }
        }

        // Fetch supervisor profile from public.profiles
        let supProfile = null;
        if (grp.supervisor_id) {
            const { data: sp } = await sb.from('profiles').select('*').eq('id', grp.supervisor_id).maybeSingle();
            supProfile = sp;
        }
        if (!supProfile && grp.supervisor_name) {
            const { data: sp } = await sb.from('profiles').select('*').eq('role', 'supervisor').ilike('name', `%${grp.supervisor_name}%`).maybeSingle();
            supProfile = sp;
        }

        const supName = supProfile?.name || grp.supervisor_name || 'Academic Faculty Supervisor';
        const initials = supName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

        if (nameEl)   nameEl.textContent = supName;
        if (initEl)   initEl.textContent = initials || 'FS';
        if (titleEl)  titleEl.textContent = 'Faculty Academic Supervisor';
        if (deptEl)   deptEl.textContent = supProfile?.programme || 'Faculty of Science & Technology';
        if (emailEl)  emailEl.textContent = supProfile?.email || (supName.toLowerCase().replace(/[^a-z]/g, '.') + '@cavendish.ac.ug');
        if (officeEl) officeEl.textContent = 'Faculty Offices, Block B, Room 204';
        if (hoursEl)  hoursEl.textContent = 'Mon & Wed: 10:00 AM – 1:00 PM (or via Group Chat)';
        if (groupEl)  groupEl.textContent = grp.group_number + (grp.project_title ? ' — ' + grp.project_title : '');
    } catch (err) {
        console.error('[CMS] Error loading supervisor details:', err);
    }
}

/* ── 8. ASSESSMENTS PAGE ── */
async function initAssessmentsPage() {
    if (!window.location.pathname.includes('assessments.html')) return;

    const sb = _getMainSb();
    if (!sb) return;

    const email = (localStorage.getItem('cms_logged_user') || '').trim().toLowerCase();
    let studentId = localStorage.getItem('cms_student_id') || '';

    try {
        const groupInfo = await getStudentGroup(sb, email, studentId);
        const sId = groupInfo?.studentId || studentId;
        if (!sId) return;

        const { data: markData } = await sb.from('marks').select('*').eq('student_id', sId).maybeSingle();
        const pills = document.querySelectorAll('.scenario-row .scenario-pill');
        if (pills && pills.length >= 3) {
            const markVal = pills[0].querySelector('.scenario-value');
            const panelVal = pills[1].querySelector('.scenario-value');
            const clearanceVal = pills[2].querySelector('.scenario-value');

            if (markData) {
                if (markVal) {
                    markVal.textContent = markData.total + ' / 100';
                    markVal.style.color = '#15803d';
                    markVal.style.fontWeight = '700';
                }
                if (panelVal) {
                    panelVal.textContent = markData.supervisor_name || 'Academic Supervisor';
                }
                if (clearanceVal) {
                    clearanceVal.textContent = 'Assessment Cleared';
                    clearanceVal.style.color = '#15803d';
                }
            } else if (groupInfo?.group?.supervisor_name) {
                if (panelVal) panelVal.textContent = groupInfo.group.supervisor_name;
            }
        }
    } catch (e) {
        console.warn('[CMS] Assessments load notice:', e);
    }
}

/* ── 9. NOTIFICATIONS PAGE (Real-Time DB Sync) ── */
let _currentNotifications = [];

function renderNotificationsList(items) {
    const container = document.getElementById('notificationsContainer');
    const badge = document.getElementById('unreadCountBadge');
    if (!container) return;

    if (!items || items.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:36px;color:#64748b;font-size:13.5px;"><div style="font-size:28px;margin-bottom:8px;">🔔</div>No notifications yet. You will be alerted when supervisors post feedback or defense dates.</div>';
        if (badge) badge.textContent = '0 unread';
        return;
    }

    const unreadCount = items.filter(n => !n.read).length;
    if (badge) {
        badge.textContent = `${unreadCount} unread`;
        badge.style.background = unreadCount > 0 ? '#fee2e2' : '#e0f2fe';
        badge.style.color = unreadCount > 0 ? '#dc2626' : '#0369a1';
    }

    container.innerHTML = items.map((n, idx) => {
        const isUnread = !n.read;
        const timeStr = n.created_at ? new Date(n.created_at).toLocaleDateString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) : 'Recent';
        
        let icon = '🔔';
        let accentColor = '#2563eb';
        let bgTint = '#f8fafc';
        if (n.type === 'success' || (n.title && n.title.includes('Approved'))) {
            icon = '✅'; accentColor = '#16a34a'; bgTint = '#f0fdf4';
        } else if (n.type === 'warning' || (n.title && n.title.includes('Revision'))) {
            icon = '⚠️'; accentColor = '#d97706'; bgTint = '#fffbeb';
        } else if (n.type === 'defense') {
            icon = '📅'; accentColor = '#7c3aed'; bgTint = '#f5f3ff';
        }

        const notifId = n.id ? String(n.id) : `idx-${idx}`;
        return `
            <div onclick="markNotificationRead('${notifId}')" style="display:flex;align-items:flex-start;gap:14px;padding:16px;background:${isUnread ? bgTint : '#ffffff'};border:1px solid ${isUnread ? accentColor : '#e2e8f0'};border-left:4px solid ${accentColor};border-radius:10px;cursor:pointer;transition:transform 0.15s,box-shadow 0.15s;position:relative;">
                <div style="font-size:22px;flex-shrink:0;margin-top:2px;">${icon}</div>
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;">
                        <h4 style="margin:0;font-size:14.5px;font-weight:700;color:#1e293b;">${escHtml(n.title)}</h4>
                        <span style="font-size:11.5px;color:#94a3b8;white-space:nowrap;">${timeStr}</span>
                    </div>
                    <p style="margin:0;font-size:13px;color:#475569;line-height:1.5;">${escHtml(n.message)}</p>
                </div>
                ${isUnread ? '<span style="width:8px;height:8px;border-radius:50%;background:#ef4444;flex-shrink:0;margin-top:6px;" title="Unread"></span>' : ''}
            </div>
        `;
    }).join('');
}

window.markNotificationRead = async function(id) {
    const sb = _getMainSb();
    const notif = _currentNotifications.find(n => String(n.id) === String(id));
    if (notif) notif.read = true;
    renderNotificationsList(_currentNotifications);

    if (sb && id && !id.startsWith('ctx-') && !id.startsWith('idx-')) {
        try {
            await sb.from('notifications').update({ read: true }).eq('id', id);
        } catch(e) {}
    }
};

window.markAllNotificationsAsRead = async function() {
    _currentNotifications.forEach(n => { n.read = true; });
    renderNotificationsList(_currentNotifications);

    const sb = _getMainSb();
    const email = (localStorage.getItem('cms_logged_user') || '').trim().toLowerCase();
    if (sb && email) {
        try {
            await sb.from('notifications').update({ read: true }).eq('recipient_email', email);
            showToast('All notifications marked as read.');
        } catch(e) {}
    }
};

async function initNotificationsPage() {
    if (!window.location.pathname.includes('notifications.html')) return;

    const sb = _getMainSb();
    const email = (localStorage.getItem('cms_logged_user') || '').trim().toLowerCase();
    let studentId = localStorage.getItem('cms_student_id') || '';

    let dbNotifs = [];
    let groupInfo = null;

    if (sb) {
        try {
            let q = sb.from('notifications').select('*');
            if (email) {
                q = q.or(`recipient_email.eq.${email},recipient_email.eq.all`);
            }
            const { data, error } = await q.order('created_at', { ascending: false });
            if (!error && data) dbNotifs = data;

            groupInfo = await getStudentGroup(sb, email, studentId);
        } catch(e) {
            console.warn('Notifications fetch notice:', e);
        }
    }

    const combined = [...dbNotifs];

    if (groupInfo && groupInfo.group) {
        const grp = groupInfo.group;
        if (!combined.some(n => n.message && n.message.includes(grp.group_number))) {
            combined.push({
                id: 'ctx-grp',
                title: 'Assigned to Capstone Group',
                message: `You are placed in ${grp.group_number} (${grp.project_title || 'Software Development'}). Open My Group to collaborate with your team.`,
                type: 'info',
                read: false,
                created_at: grp.created_at || new Date().toISOString()
            });
        }

        if (grp.supervisor_name && !combined.some(n => n.message && n.message.includes(grp.supervisor_name))) {
            combined.push({
                id: 'ctx-sup',
                title: 'Faculty Supervisor Assigned',
                message: `${grp.supervisor_name} has been assigned as your academic capstone supervisor. Reach out via group chat or office hours.`,
                type: 'success',
                read: false,
                created_at: grp.updated_at || new Date().toISOString()
            });
        }

        if (grp.topic_status === 'APPROVED' && !combined.some(n => n.title && n.title.includes('Approved'))) {
            combined.push({
                id: 'ctx-topic',
                title: 'Capstone Topic Approved',
                message: `Your project topic "${grp.project_title}" has been approved by your supervisor.`,
                type: 'success',
                read: true,
                created_at: grp.updated_at || new Date().toISOString()
            });
        }
    }

    combined.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    _currentNotifications = combined;
    renderNotificationsList(_currentNotifications);

    // Supabase Realtime subscription on notifications table
    if (sb && email) {
        try {
            sb.channel('realtime-student-notifications')
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `recipient_email=eq.${email}`
                }, payload => {
                    _currentNotifications.unshift(payload.new);
                    renderNotificationsList(_currentNotifications);
                    showToast(`New Notification: ${payload.new.title}`);
                })
                .subscribe();
        } catch(e) {}
    }
}

/* ── UTILITY: TOAST NOTIFICATIONS (No Icons) ── */
function showToast(message) {
    let toast = document.getElementById('cmsToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'cmsToast';
        toast.style.position = 'fixed';
        toast.style.bottom = '24px';
        toast.style.right = '24px';
        toast.style.background = '#0a192f';
        toast.style.color = '#fff';
        toast.style.padding = '12px 20px';
        toast.style.borderRadius = '8px';
        toast.style.fontSize = '13.5px';
        toast.style.fontWeight = '600';
        toast.style.boxShadow = '0 10px 25px rgba(0,0,0,0.3)';
        toast.style.border = '1px solid rgba(255,255,255,0.15)';
        toast.style.zIndex = '9999';
        toast.style.transition = 'all 0.3s ease';
        toast.style.transform = 'translateY(100px)';
        toast.style.opacity = '0';
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    setTimeout(() => {
        toast.style.transform = 'translateY(0)';
        toast.style.opacity = '1';
    }, 50);

    setTimeout(() => {
        toast.style.transform = 'translateY(100px)';
        toast.style.opacity = '0';
    }, 3200);
}
