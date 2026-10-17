/**
 * ==============================================================================
 * Capstone Management System (CMS) – Supabase Client & Service Layer
 * Cavendish University Uganda
 * Project: https://ygkwjlfhwtwkxtdvjzfc.supabase.co
 * ==============================================================================
 */

const SUPABASE_CONFIG = {
  url: 'https://ygkwjlfhwtwkxtdvjzfc.supabase.co',
  anonKey: 'sb_publishable_cnfuCpwVHpcWEkXye0KP-w_Vsy3NAqs',
};

// Initialize Supabase Client
let _supabaseClient = null;
try {
  if (typeof supabase !== 'undefined' && supabase.createClient) {
    _supabaseClient = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
  }
} catch (err) {
  console.warn('[CMS Supabase] Could not initialize client:', err);
}

/**
 * Returns the active Supabase client instance
 */
function getClient() {
  if (!_supabaseClient && typeof supabase !== 'undefined' && supabase.createClient) {
    _supabaseClient = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
  }
  return _supabaseClient;
}

// ==============================================================================
// 1. AUTHENTICATION & PROFILES SERVICE
// ==============================================================================
const AuthService = {
  async getProfile(email) {
    const sb = getClient();
    if (!sb) return null;
    const { data, error } = await sb
      .from('profiles')
      .select('*')
      .eq('email', (email || '').trim().toLowerCase())
      .single();
    if (error) return null;
    return data;
  },

  async updateProfile(id, updates) {
    const sb = getClient();
    if (!sb) return null;
    const { data, error } = await sb
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  getCurrentUser() {
    return {
      email: localStorage.getItem('cms_logged_user') || '',
      role: localStorage.getItem('cms_user_role') || 'guest',
      name: localStorage.getItem('cms_user_name') || 'Guest User',
    };
  },

  signOut() {
    localStorage.removeItem('cms_logged_user');
    localStorage.removeItem('cms_user_role');
    localStorage.removeItem('cms_user_name');
    localStorage.removeItem('cms_student_name');
    window.location.href = '../login.html';
  }
};

// ==============================================================================
// 2. INTAKES SERVICE
// ==============================================================================
const IntakesService = {
  async list() {
    const sb = getClient();
    if (!sb) return [];
    const { data, error } = await sb.from('intakes').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async upsert(intakeData) {
    const sb = getClient();
    if (!sb) return null;
    const { data, error } = await sb.from('intakes').upsert(intakeData).select();
    if (error) throw error;
    return data;
  },

  async delete(id) {
    const sb = getClient();
    if (!sb) return false;
    const { error } = await sb.from('intakes').delete().eq('id', id);
    if (error) throw error;
    return true;
  }
};

// ==============================================================================
// 3. GROUPS & STUDENTS SERVICE
// ==============================================================================
const GroupsService = {
  async listWithStudents() {
    const sb = getClient();
    if (!sb) return [];
    const { data, error } = await sb
      .from('groups')
      .select('id, group_number, project_title, supervisor_id, supervisor_name, mark, status, category, group_students(id, student_id, name, course)')
      .order('group_number');
    if (error) throw error;
    return data || [];
  },

  async assignSupervisor(groupId, supervisorName, supervisorId = null) {
    const sb = getClient();
    if (!sb) return null;
    const updateObj = { supervisor_name: supervisorName };
    if (supervisorId) updateObj.supervisor_id = supervisorId;
    const { data, error } = await sb.from('groups').update(updateObj).eq('id', groupId).select();
    if (error) throw error;
    return data;
  },

  async setMarkAndStatus(groupId, mark, status) {
    const sb = getClient();
    if (!sb) return null;
    const { data, error } = await sb
      .from('groups')
      .update({ mark, status, updated_at: new Date().toISOString() })
      .eq('id', groupId)
      .select();
    if (error) throw error;
    return data;
  }
};

// ==============================================================================
// 4. DEFENSES SERVICE
// ==============================================================================
const DefensesService = {
  async listPending() {
    const sb = getClient();
    if (!sb) return [];
    const { data, error } = await sb.from('defenses').select('*').eq('status', 'PENDING');
    if (error) throw error;
    return data || [];
  },

  async updateStatus(id, approve, studentId = null) {
    const sb = getClient();
    if (!sb) return null;
    const newStatus = approve ? 'APPROVED' : 'REJECTED';
    const { error: defError } = await sb.from('defenses').update({ status: newStatus }).eq('id', id);
    if (defError) throw defError;

    if (studentId) {
      await sb.from('student_status').upsert({
        student_id: studentId,
        defense_status: newStatus,
        updated_at: new Date().toISOString()
      });
    }
    return newStatus;
  }
};

// ==============================================================================
// 5. MARKS SERVICE
// ==============================================================================
const MarksService = {
  async listPending() {
    const sb = getClient();
    if (!sb) return [];
    const { data, error } = await sb.from('marks').select('*').eq('is_approved', false);
    if (error) throw error;
    return data || [];
  },

  async approveMark(id, approvedBy = null) {
    const sb = getClient();
    if (!sb) return null;
    const { data, error } = await sb
      .from('marks')
      .update({ is_approved: true, approved_at: new Date().toISOString(), approved_by: approvedBy })
      .eq('id', id)
      .select();
    if (error) throw error;
    return data;
  },

  async submitMark(markData) {
    const sb = getClient();
    if (!sb) return null;
    const { data, error } = await sb.from('marks').insert(markData).select();
    if (error) throw error;
    return data;
  }
};

// ==============================================================================
// 6. CERTIFICATES & DOWNLOAD AUDIT SERVICE
// ==============================================================================
const CertificateService = {
  generateSerial(studentId, course, date = new Date(), version = 1) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const vStr = String(version).padStart(2, '0');
    return `${studentId}/${course}/${month}/${date.getFullYear()}/v.${vStr}`;
  },

  async list() {
    const sb = getClient();
    if (!sb) return [];
    const { data, error } = await sb.from('certificates').select('*').order('issued_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async issueForStudent(certRecord) {
    const sb = getClient();
    if (!sb) return null;
    const { data, error } = await sb.from('certificates').upsert(certRecord).select();
    if (error) throw error;
    return data;
  },

  async recordDownload(studentId, serial, downloadedBy) {
    const sb = getClient();
    if (!sb) return null;
    const { data, error } = await sb.from('certificate_downloads').insert({
      student_id: studentId,
      serial: serial,
      downloaded_at: new Date().toISOString(),
      downloaded_by: downloadedBy || 'System User'
    }).select();
    if (error) throw error;
    return data;
  },

  async getDownloadHistory(serial) {
    const sb = getClient();
    if (!sb) return [];
    const { data, error } = await sb
      .from('certificate_downloads')
      .select('*')
      .eq('serial', serial)
      .order('downloaded_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }
};

// ==============================================================================
// 7. LEGACY BOARDS SERVICE
// ==============================================================================
const LegacyBoardsService = {
  async listWithRecords() {
    const sb = getClient();
    if (!sb) return [];
    const { data: boards, error: bErr } = await sb.from('legacy_boards').select('*').order('created_at', { ascending: false });
    if (bErr) throw bErr;
    const { data: records, error: rErr } = await sb.from('legacy_board_records').select('*');
    if (rErr) throw rErr;

    return (boards || []).map(b => ({
      ...b,
      entries: (records || []).filter(r => r.board_id === b.id)
    }));
  },

  async createBoard(boardData) {
    const sb = getClient();
    if (!sb) return null;
    const { data, error } = await sb.from('legacy_boards').insert(boardData).select();
    if (error) throw error;
    return data;
  },

  async upsertRecord(recordData) {
    const sb = getClient();
    if (!sb) return null;
    const { data, error } = await sb.from('legacy_board_records').upsert(recordData).select();
    if (error) throw error;
    return data;
  },

  async deleteRecord(recordId) {
    const sb = getClient();
    if (!sb) return false;
    const { error } = await sb.from('legacy_board_records').delete().eq('id', recordId);
    if (error) throw error;
    return true;
  }
};

// ==============================================================================
// 8. GROUP CHAT SERVICE
// ==============================================================================
const ChatService = {
  async getMessages(groupNumber) {
    const sb = getClient();
    if (!sb) return [];
    const { data, error } = await sb
      .from('messages')
      .select('*')
      .eq('group_number', groupNumber)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async sendMessage(groupNumber, senderId, senderName, text) {
    const sb = getClient();
    if (!sb) return null;
    const { data, error } = await sb.from('messages').insert({
      group_number: groupNumber,
      sender_id: senderId,
      sender_name: senderName,
      text: text,
      created_at: new Date().toISOString()
    }).select();
    if (error) throw error;
    return data;
  },

  subscribeToGroup(groupNumber, callback) {
    const sb = getClient();
    if (!sb) return null;
    return sb
      .channel(`chat_${groupNumber}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `group_number=eq.${groupNumber}` }, payload => {
        if (callback) callback(payload.new);
      })
      .subscribe();
  }
};

// Export to window for global portal scripts
if (typeof window !== 'undefined') {
  window.CMS_CONFIG = SUPABASE_CONFIG;
  window.CMS_SB = {
    client: getClient,
    Auth: AuthService,
    Intakes: IntakesService,
    Groups: GroupsService,
    Defenses: DefensesService,
    Marks: MarksService,
    Certificates: CertificateService,
    LegacyBoards: LegacyBoardsService,
    Chat: ChatService
  };
}

// Module export support
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SUPABASE_CONFIG,
    getClient,
    AuthService,
    IntakesService,
    GroupsService,
    DefensesService,
    MarksService,
    CertificateService,
    LegacyBoardsService,
    ChatService
  };
}
