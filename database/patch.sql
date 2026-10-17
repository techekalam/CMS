-- Run this in Supabase SQL Editor
-- =============================================================
-- 1. Add password column to profiles (for staff/admin login)
-- =============================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS password TEXT;

-- =============================================================
-- 2. Allow anyone (anon/authenticated) to delete from profiles
--    (so admin delete works from the browser client)
-- =============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'Public Delete Access'
  ) THEN
    EXECUTE 'CREATE POLICY "Public Delete Access" ON public.profiles FOR DELETE USING (true)';
  END IF;
END $$;

-- =============================================================
-- 3. Allow anyone to insert into messages (for group chat)
-- =============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'messages' AND policyname = 'Public Insert Access'
  ) THEN
    EXECUTE 'CREATE POLICY "Public Insert Access" ON public.messages FOR INSERT WITH CHECK (true)';
  END IF;
END $$;

-- =============================================================
-- 5. Backfill: assign any existing unassigned students to groups
-- =============================================================
SELECT public.assign_student_to_group(p.student_id, p.name, p.programme)
FROM public.profiles p
WHERE p.role = 'student'
  AND p.student_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.group_students gs WHERE gs.student_id = p.student_id)
ORDER BY p.created_at;
