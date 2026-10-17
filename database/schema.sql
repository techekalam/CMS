-- ==============================================================================
-- CAPSTONE MANAGEMENT SYSTEM (CMS) - SUPABASE DATABASE SCHEMA
-- Cavendish University Uganda
-- Project URL: https://ygkwjlfhwtwkxtdvjzfc.supabase.co
-- ==============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 1. PROFILES (Users across Student, Supervisor, Coordinator, Admin)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('student', 'supervisor', 'coordinator', 'admin')),
    student_id TEXT,               -- e.g. '2023-BCS-001' (students only)
    staff_id TEXT,                 -- e.g. 'STAFF-FST-01' (staff only)
    programme TEXT,                -- e.g. 'Bachelor of Science in Computer Science'
    phone TEXT,
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for profile lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_student_id ON public.profiles(student_id);

-- ==============================================================================
-- 2. INTAKES & ACADEMIC YEARS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.intakes (
    id TEXT PRIMARY KEY DEFAULT ('i' || extract(epoch from now())::bigint),
    name TEXT NOT NULL,
    year TEXT NOT NULL,            -- e.g. '2026/2027'
    semester TEXT NOT NULL,        -- 'Semester 1' or 'Semester 2'
    start_date DATE,
    end_date DATE,
    status TEXT DEFAULT 'AUTO' CHECK (status IN ('AUTO', 'ACTIVE', 'UPCOMING', 'CLOSED')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_intakes_year_sem ON public.intakes(year, semester);

-- ==============================================================================
-- 3. GROUPS & CAPSTONE PROJECTS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.groups (
    id TEXT PRIMARY KEY DEFAULT ('g' || extract(epoch from now())::bigint),
    group_number TEXT UNIQUE NOT NULL,       -- e.g. 'GRP-01'
    project_title TEXT NOT NULL,
    category TEXT DEFAULT 'Software Development',
    description TEXT,
    intake_id TEXT REFERENCES public.intakes(id) ON DELETE SET NULL,
    supervisor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    supervisor_name TEXT,
    topic_status TEXT DEFAULT 'SUBMITTED' CHECK (topic_status IN ('SUBMITTED', 'APPROVED', 'REUPLOAD_REQUESTED', 'REJECTED')),
    topic_decline_reason TEXT,
    status TEXT DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETE')),
    mark NUMERIC(5, 2) CHECK (mark >= 0 AND mark <= 100),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_groups_group_number ON public.groups(group_number);
CREATE INDEX IF NOT EXISTS idx_groups_supervisor ON public.groups(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_groups_status ON public.groups(status);

-- ==============================================================================
-- 4. GROUP STUDENTS / MEMBERS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.group_students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id TEXT NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL,                -- e.g. '2023-BCS-001'
    name TEXT NOT NULL,
    course TEXT NOT NULL,                    -- BSCS, BSSE, BSIT, etc.
    registration_number TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(group_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_group_students_group ON public.group_students(group_id);
CREATE INDEX IF NOT EXISTS idx_group_students_student_id ON public.group_students(student_id);

-- Backward compatibility view for group_members
CREATE OR REPLACE VIEW public.group_members AS
SELECT 
    id,
    group_id,
    student_id,
    name,
    course AS programme,
    registration_number,
    created_at
FROM public.group_students;

-- ==============================================================================
-- 5. STUDENT STATUS & PROGRESS TRACKING
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.student_status (
    student_id TEXT PRIMARY KEY,
    group_id TEXT REFERENCES public.groups(id) ON DELETE SET NULL,
    defense_status TEXT DEFAULT 'NONE' CHECK (defense_status IN ('NONE', 'REQUESTED', 'SCHEDULED', 'PENDING_COORDINATOR_REVIEW', 'APPROVED', 'REJECTED')),
    defense_date DATE,
    defense_time TEXT,
    defense_meeting_url TEXT,
    attendance_list_url TEXT,
    discussion_date DATE,
    discussion_time TEXT,
    completion_percentage INT DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- 6. PENDING & REVIEWED DEFENSES
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.defenses (
    id TEXT PRIMARY KEY DEFAULT ('d' || extract(epoch from now())::bigint),
    student_id TEXT NOT NULL,
    student_name TEXT NOT NULL,
    group_number TEXT NOT NULL,
    supervisor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    supervisor_name TEXT NOT NULL,
    submitted_date DATE DEFAULT CURRENT_DATE,
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_defenses_student ON public.defenses(student_id);
CREATE INDEX IF NOT EXISTS idx_defenses_status ON public.defenses(status);

-- ==============================================================================
-- 7. MARKS & EVALUATION
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.marks (
    id TEXT PRIMARY KEY DEFAULT ('m' || extract(epoch from now())::bigint),
    student_id TEXT NOT NULL,
    student_name TEXT,
    group_id TEXT REFERENCES public.groups(id) ON DELETE SET NULL,
    group_number TEXT,
    supervisor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    supervisor_name TEXT,
    title_marks NUMERIC(5,2) DEFAULT 0 CHECK (title_marks >= 0 AND title_marks <= 5),
    problem_marks NUMERIC(5,2) DEFAULT 0 CHECK (problem_marks >= 0 AND problem_marks <= 10),
    objectives_marks NUMERIC(5,2) DEFAULT 0 CHECK (objectives_marks >= 0 AND objectives_marks <= 5),
    tools_marks NUMERIC(5,2) DEFAULT 0 CHECK (tools_marks >= 0 AND tools_marks <= 10),
    design_marks NUMERIC(5,2) DEFAULT 0 CHECK (design_marks >= 0 AND design_marks <= 70),
    total NUMERIC(5,2) GENERATED ALWAYS AS (title_marks + problem_marks + objectives_marks + tools_marks + design_marks) STORED,
    comments TEXT,
    is_approved BOOLEAN DEFAULT false,
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_marks_student ON public.marks(student_id);
CREATE INDEX IF NOT EXISTS idx_marks_approved ON public.marks(is_approved);

-- ==============================================================================
-- 8. PROJECT DOCUMENTS & ARTIFACTS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id TEXT NOT NULL,
    group_id TEXT REFERENCES public.groups(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    document_type TEXT NOT NULL CHECK (document_type IN ('PROPOSAL', 'SYSTEM_ARCHITECTURE', 'FINAL_DISSERTATION', 'DELIVERABLE')),
    supervisor_comments TEXT,
    reviewed_at TIMESTAMPTZ,
    uploaded_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_student ON public.documents(student_id);
CREATE INDEX IF NOT EXISTS idx_documents_group ON public.documents(group_id);

-- ==============================================================================
-- 9. CERTIFICATE REGISTRY
-- Serial format: {student_id}/{course}/{month}/{year}/v.01
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id TEXT NOT NULL,
    student_name TEXT NOT NULL,
    course TEXT NOT NULL,
    group_id TEXT REFERENCES public.groups(id) ON DELETE SET NULL,
    score NUMERIC(5, 2) NOT NULL,
    version INT DEFAULT 1 NOT NULL,
    serial TEXT UNIQUE NOT NULL,
    issued_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_certs_student_id ON public.certificates(student_id);
CREATE INDEX IF NOT EXISTS idx_certs_serial ON public.certificates(serial);

-- ==============================================================================
-- 10. CERTIFICATE DOWNLOAD AUDIT TRAIL
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.certificate_downloads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id TEXT NOT NULL,
    serial TEXT NOT NULL REFERENCES public.certificates(serial) ON DELETE CASCADE,
    downloaded_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    downloaded_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cert_downloads_student ON public.certificate_downloads(student_id);

-- ==============================================================================
-- 11. LEGACY ASSESSMENT BOARDS & HISTORICAL RECORDS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.legacy_boards (
    id TEXT PRIMARY KEY DEFAULT ('lb' || extract(epoch from now())::bigint),
    title TEXT NOT NULL,
    year TEXT NOT NULL,
    cohort TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.legacy_board_records (
    id TEXT PRIMARY KEY DEFAULT ('r' || extract(epoch from now())::bigint),
    board_id TEXT NOT NULL REFERENCES public.legacy_boards(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL,
    student_id TEXT,
    course TEXT NOT NULL,
    group_number TEXT,
    project_title TEXT,
    mark NUMERIC(5, 2) NOT NULL CHECK (mark >= 0 AND mark <= 100),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_legacy_records_board ON public.legacy_board_records(board_id);

-- ==============================================================================
-- 12. GROUP CHAT MESSAGES
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_number TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    sender_name TEXT,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_group ON public.messages(group_number, created_at);

-- ==============================================================================
-- 13. NOTIFICATIONS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_email TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_email);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificate_downloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_board_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Allow full read access for all authenticated & anon users
CREATE POLICY "Public Read Access" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON public.intakes FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON public.groups FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON public.group_students FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON public.student_status FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON public.defenses FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON public.marks FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON public.documents FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON public.certificates FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON public.certificate_downloads FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON public.legacy_boards FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON public.legacy_board_records FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON public.messages FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON public.notifications FOR SELECT USING (true);

-- Allow insert/update/delete for authenticated client sessions
CREATE POLICY "Public Insert Access" ON public.profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Access" ON public.profiles FOR UPDATE USING (true);

CREATE POLICY "Public Insert Access" ON public.intakes FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Access" ON public.intakes FOR UPDATE USING (true);
CREATE POLICY "Public Delete Access" ON public.intakes FOR DELETE USING (true);

CREATE POLICY "Public Insert Access" ON public.groups FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Access" ON public.groups FOR UPDATE USING (true);
CREATE POLICY "Public Delete Access" ON public.groups FOR DELETE USING (true);

CREATE POLICY "Public Insert Access" ON public.group_students FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Access" ON public.group_students FOR UPDATE USING (true);
CREATE POLICY "Public Delete Access" ON public.group_students FOR DELETE USING (true);

CREATE POLICY "Public Insert Access" ON public.student_status FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Access" ON public.student_status FOR UPDATE USING (true);

CREATE POLICY "Public Insert Access" ON public.defenses FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Access" ON public.defenses FOR UPDATE USING (true);

CREATE POLICY "Public Insert Access" ON public.marks FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Access" ON public.marks FOR UPDATE USING (true);

CREATE POLICY "Public Insert Access" ON public.documents FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Access" ON public.documents FOR UPDATE USING (true);

CREATE POLICY "Public Insert Access" ON public.certificates FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Access" ON public.certificates FOR UPDATE USING (true);

CREATE POLICY "Public Insert Access" ON public.certificate_downloads FOR INSERT WITH CHECK (true);

CREATE POLICY "Public Insert Access" ON public.legacy_boards FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Access" ON public.legacy_boards FOR UPDATE USING (true);
CREATE POLICY "Public Delete Access" ON public.legacy_boards FOR DELETE USING (true);

CREATE POLICY "Public Insert Access" ON public.legacy_board_records FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Access" ON public.legacy_board_records FOR UPDATE USING (true);
CREATE POLICY "Public Delete Access" ON public.legacy_board_records FOR DELETE USING (true);

CREATE POLICY "Public Insert Access" ON public.messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Insert Access" ON public.notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Access" ON public.notifications FOR UPDATE USING (true);

-- ==============================================================================
-- ENABLE REALTIME REPLICATION (For live chat & status updates)
-- ==============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.certificates;
ALTER PUBLICATION supabase_realtime ADD TABLE public.student_status;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- ==============================================================================
-- 14. AUTOMATIC GROUP ASSIGNMENT
-- Every student profile is placed into a group by the system the moment it is
-- created. Nobody assigns students to groups by hand.
--
-- Rules:
--   * A student joins the earliest group that is still IN_PROGRESS, has no
--     approved topic yet, and has fewer than p_max_size members (default 4).
--   * If no such group exists, a new one is created (GRP-01, GRP-02, ...).
--   * A student is never placed twice.
-- To change the group size, change the p_max_size default below.
--
-- This section is safe to run on an existing database (re-runnable).
-- ==============================================================================

-- A group is created before its project topic exists, so allow an empty title.
ALTER TABLE public.groups ALTER COLUMN project_title SET DEFAULT '';

CREATE OR REPLACE FUNCTION public.assign_student_to_group(
    p_student_id TEXT,
    p_name TEXT,
    p_course TEXT,
    p_max_size INT DEFAULT 4
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_group_id TEXT;
    v_next INT;
BEGIN
    IF p_student_id IS NULL OR btrim(p_student_id) = '' THEN
        RETURN NULL;
    END IF;

    -- One assignment at a time, so simultaneous registrations cannot overfill
    -- a group or create two groups with the same number.
    PERFORM pg_advisory_xact_lock(hashtext('cms_auto_group_assignment'));

    -- Already placed: return the existing group.
    SELECT group_id INTO v_group_id
    FROM public.group_students
    WHERE student_id = p_student_id
    LIMIT 1;
    IF v_group_id IS NOT NULL THEN
        RETURN v_group_id;
    END IF;

    -- Earliest open group with room.
    SELECT g.id INTO v_group_id
    FROM public.groups g
    WHERE g.status = 'IN_PROGRESS'
      AND g.topic_status <> 'APPROVED'
      AND (SELECT count(*) FROM public.group_students gs WHERE gs.group_id = g.id) < p_max_size
    ORDER BY g.created_at, g.group_number
    LIMIT 1;

    -- None open: start a new group.
    IF v_group_id IS NULL THEN
        SELECT coalesce(max(nullif(regexp_replace(group_number, '\D', '', 'g'), '')::int), 0) + 1
          INTO v_next
        FROM public.groups;

        v_group_id := 'g' || replace(gen_random_uuid()::text, '-', '');
        INSERT INTO public.groups (id, group_number)
        VALUES (v_group_id, 'GRP-' || lpad(v_next::text, 2, '0'));
    END IF;

    INSERT INTO public.group_students (group_id, student_id, name, course)
    VALUES (
        v_group_id,
        p_student_id,
        coalesce(nullif(btrim(p_name), ''), p_student_id),
        coalesce(nullif(btrim(p_course), ''), '—')
    )
    ON CONFLICT (group_id, student_id) DO NOTHING;

    INSERT INTO public.student_status (student_id, group_id)
    VALUES (p_student_id, v_group_id)
    ON CONFLICT (student_id) DO UPDATE
        SET group_id = EXCLUDED.group_id,
            updated_at = timezone('utc'::text, now());

    RETURN v_group_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_assign_group_on_student_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.role = 'student' AND NEW.student_id IS NOT NULL THEN
        PERFORM public.assign_student_to_group(NEW.student_id, NEW.name, NEW.programme);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_group_on_student_profile ON public.profiles;
CREATE TRIGGER assign_group_on_student_profile
    AFTER INSERT ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.trg_assign_group_on_student_profile();

-- Only the trigger should place students; block direct calls from the browser.
REVOKE EXECUTE ON FUNCTION public.assign_student_to_group(TEXT, TEXT, TEXT, INT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_assign_group_on_student_profile() FROM PUBLIC, anon, authenticated;

-- One-time backfill: place any students who registered before this section existed.
SELECT public.assign_student_to_group(p.student_id, p.name, p.programme)
FROM public.profiles p
WHERE p.role = 'student'
  AND p.student_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.group_students gs WHERE gs.student_id = p.student_id)
ORDER BY p.created_at;
