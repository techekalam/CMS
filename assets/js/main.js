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
    initNotificationsPage();
});

/* ── 1. USER SESSION & HEADER IDENTITY ── */
async function initUserSession() {
    const userNameElements = document.querySelectorAll('.dash-user-name');
    const userIdElements   = document.querySelectorAll('.dash-user-id');

    // Start with whatever we have in localStorage for instant render
    let savedName = localStorage.getItem('cms_student_name') || 'Student Account';
    let savedId   = localStorage.getItem('cms_student_id')   || '';

    userNameElements.forEach(el => el.textContent = savedName);
    userIdElements.forEach(el => el.textContent = savedId);

    // Then fetch the authoritative data from Supabase profiles
    const email = (localStorage.getItem('cms_logged_user') || '').trim().toLowerCase();
    if (!email) return;

    try {
        const sb = window.CMS_SB && window.CMS_SB.client();
        if (!sb) return;
        const profile = await window.CMS_SB.Auth.getProfile(email);
        if (!profile) return;

        // Update localStorage with real values from DB
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
function initDashboardTracker() {
    const milestoneTable = document.querySelector('.milestone-table');
    if (!milestoneTable) return;

    // Load saved milestone states
    let savedStates = JSON.parse(localStorage.getItem('cms_milestone_states') || '{}');
    const rows = milestoneTable.querySelectorAll('tbody tr');

    rows.forEach((row, index) => {
        const badge = row.querySelector('.ms-badge');
        if (!badge) return;

        row.style.cursor = 'pointer';
        row.title = 'Click to toggle milestone completion status';

        if (savedStates[index] === 'Completed') {
            badge.className = 'ms-badge ms-approved';
            badge.textContent = 'Completed';
            badge.style.background = '#dcfce7';
            badge.style.color = '#15803d';
        }

        row.addEventListener('click', () => {
            if (badge.textContent === 'Completed') {
                badge.className = 'ms-badge ms-pending';
                badge.textContent = 'Pending';
                badge.style.background = '#fef3c7';
                badge.style.color = '#b45309';
                savedStates[index] = 'Pending';
            } else {
                badge.className = 'ms-badge ms-approved';
                badge.textContent = 'Completed';
                badge.style.background = '#dcfce7';
                badge.style.color = '#15803d';
                savedStates[index] = 'Completed';
            }
            localStorage.setItem('cms_milestone_states', JSON.stringify(savedStates));
            updateDashboardProgress(savedStates);
        });
    });

    updateDashboardProgress(savedStates);
}

function updateDashboardProgress(states) {
    const trackerBar  = document.querySelector('.tracker-progress-fill') || document.querySelector('.progress-fill');
    const pctText     = document.querySelector('.tracker-pct-val') || document.querySelector('.big-percent');
    const pctBlue     = document.querySelector('.percent-blue');
    const badge       = document.querySelector('.tracker-status-badge');
    if (!trackerBar) return;

    let completedCount = 0;
    const total = 4;
    for (let i = 0; i < total; i++) {
        if (states[i] === 'Completed') completedCount++;
    }

    const pct = Math.round((completedCount / total) * 100);
    trackerBar.style.width = pct + '%';
    if (pctText) pctText.textContent = pct + '%';
    if (pctBlue) pctBlue.textContent = pct + '% Completed';

    if (badge) {
        if (pct === 0) {
            badge.textContent = 'Pending Start';
            badge.style.background = '#f1f5f9';
            badge.style.color = '#64748b';
        } else if (pct < 100) {
            badge.textContent = 'In Progress (' + pct + '%)';
            badge.style.background = '#e0f2fe';
            badge.style.color = '#0369a1';
        } else {
            badge.textContent = 'Completed (100%)';
            badge.style.background = '#dcfce7';
            badge.style.color = '#15803d';
        }
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
function initProjectPage() {
    if (!window.location.pathname.includes('project.html')) return;

    const savedProjStr = localStorage.getItem('cms_student_project');
    if (savedProjStr) {
        try {
            const proj = JSON.parse(savedProjStr);
            const titleEl  = document.getElementById('displayProjTitle');
            const statusEl = document.getElementById('displayProjStatus');
            const catEl    = document.getElementById('displayProjCat');

            if (titleEl)  titleEl.textContent  = proj.title;
            if (statusEl) {
                statusEl.textContent = proj.status || 'Approved';
                statusEl.style.background = '#dcfce7';
                statusEl.style.color = '#15803d';
            }
            if (catEl) catEl.textContent = proj.category;
        } catch (err) {}
    }

    const uploadForm = document.getElementById('docUploadForm') || document.querySelector('form[enctype="multipart/form-data"]');
    if (uploadForm) {
        uploadForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const fileInput = document.getElementById('file-upload');
            const typeInput = document.getElementById('artifact-type');

            if (!fileInput || !fileInput.files.length) {
                alert('Please select a file to upload.');
                return;
            }

            const fileName = fileInput.files[0].name;
            const docType  = typeInput ? typeInput.options[typeInput.selectedIndex].text : 'Deliverable';

            showToast(`Uploaded "${fileName}" as ${docType}.`);
            fileInput.value = '';
        });
    }
}

/* ── 6. GROUP PAGE & CHAT ── */
async function initGroupPage() {
    if (!window.location.pathname.includes('group.html')) return;

    // Groups are assigned automatically by the system when the student registers;
    // this page only displays the group the student was placed in.
    const sb = window.CMS_SB && window.CMS_SB.client();
    if (!sb) return;

    try {
        const email = (localStorage.getItem('cms_logged_user') || '').trim().toLowerCase();
        let studentId = localStorage.getItem('cms_student_id') || '';
        if (email) {
            const profile = await window.CMS_SB.Auth.getProfile(email);
            if (profile && profile.student_id) studentId = profile.student_id;
        }
        if (!studentId) return;

        const { data: status } = await sb.from('student_status')
            .select('group_id').eq('student_id', studentId).maybeSingle();
        if (!status || !status.group_id) return;

        const { data: group } = await sb.from('groups')
            .select('group_number, project_title, supervisor_name, group_students(student_id, name)')
            .eq('id', status.group_id).single();
        if (!group) return;

        const members = group.group_students || [];
        const ids = members.map(m => m.student_id);
        const emailById = {};
        if (ids.length) {
            const { data: profs } = await sb.from('profiles').select('student_id, email').in('student_id', ids);
            (profs || []).forEach(p => { emailById[p.student_id] = p.email; });
        }

        const pageBadge = document.getElementById('groupPageBadge');
        if (pageBadge) { pageBadge.textContent = 'Group ' + group.group_number; pageBadge.className = 'ms-badge ms-approved'; }
        const rosterBadge = document.getElementById('groupRosterBadge');
        if (rosterBadge) rosterBadge.textContent = group.group_number + ' · ' + members.length + ' member' + (members.length === 1 ? '' : 's');

        const body = document.getElementById('groupMembersBody');
        if (body && members.length) {
            body.innerHTML = '';
            members.forEach(m => {
                const tr = document.createElement('tr');
                [m.name, 'Member', emailById[m.student_id] || '—', 'Assigned'].forEach(text => {
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

/* ── 7. NOTIFICATIONS PAGE ── */
function initNotificationsPage() {
    if (!window.location.pathname.includes('notifications.html')) return;
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
