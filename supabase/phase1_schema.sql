-- ============================================================================
-- TENDERFLOW PRO — Phase 1: Complete SQL Foundation
-- ============================================================================
-- Multi-tenant schema with granular Row Level Security for 4 user levels:
--   1. Super Admin  → Global access across ALL companies
--   2. IT Admin     → Company-scoped user/audit management
--   3. Bid Manager  → Tender lifecycle owner within company
--   4. Dept User    → Task-level access only
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 0. ENUMS
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM (
  'super_admin',
  'it_admin',
  'bid_manager',
  'dept_user'
);

CREATE TYPE tender_status AS ENUM (
  'draft',
  'analyzing',       -- AI parser running
  'in_progress',
  'review',
  'approved',
  'submitted',       -- READ-ONLY snapshot after this
  'archived'
);

CREATE TYPE task_status AS ENUM (
  'unassigned',
  'assigned',
  'in_progress',
  'submitted',
  'revision_needed',
  'approved'
);

CREATE TYPE document_type AS ENUM (
  'rfq_source',       -- Original RFQ upload
  'cv',
  'company_id',       -- ID documents
  'section_draft',    -- Executive Summary, Pricing, etc.
  'supporting',
  'compiled_final'    -- The stitched output
);

CREATE TYPE audit_action AS ENUM (
  'insert',
  'update',
  'delete',
  'status_change',
  'login',
  'export',
  'ai_analysis',
  'approval'
);


-- ──────────────────────────────────────────────────────────────────────────────
-- 1. COMPANIES (Tenants)
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE companies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,                          -- URL-safe identifier
  logo_url      TEXT,
  domain        TEXT,                                          -- e.g. "acme.com" for email validation
  ai_enabled    BOOLEAN DEFAULT false,                         -- Super Admin toggle
  is_active     BOOLEAN DEFAULT true,                          -- Suspension flag
  max_users     INTEGER DEFAULT 25,
  settings      JSONB DEFAULT '{}'::jsonb,                     -- Branding, defaults
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_companies_slug ON companies(slug);
CREATE INDEX idx_companies_active ON companies(is_active);


-- ──────────────────────────────────────────────────────────────────────────────
-- 2. PROFILES (extends Supabase auth.users)
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id    UUID REFERENCES companies(id) ON DELETE SET NULL,  -- NULL = Super Admin
  role          user_role NOT NULL DEFAULT 'dept_user',
  full_name     TEXT NOT NULL,
  email         TEXT NOT NULL,
  department    TEXT,                                              -- e.g. "Engineering", "Finance"
  job_title     TEXT,
  phone         TEXT,
  avatar_url    TEXT,
  is_active     BOOLEAN DEFAULT true,
  last_seen_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_profiles_company ON profiles(company_id);
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_email ON profiles(email);


-- ──────────────────────────────────────────────────────────────────────────────
-- 3. TENDERS
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE tenders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by        UUID NOT NULL REFERENCES profiles(id),
  title             TEXT NOT NULL,
  reference_number  TEXT,                                        -- External RFQ ref
  issuing_authority TEXT,
  description       TEXT,
  status            tender_status DEFAULT 'draft',
  deadline          TIMESTAMPTZ,
  submitted_at      TIMESTAMPTZ,                                 -- Snapshot timestamp
  ai_analysis       JSONB,                                       -- Parsed requirements JSON
  metadata          JSONB DEFAULT '{}'::jsonb,                   -- Flexible extra data
  snapshot_data     JSONB,                                       -- Full read-only snapshot
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tenders_company ON tenders(company_id);
CREATE INDEX idx_tenders_status ON tenders(status);
CREATE INDEX idx_tenders_deadline ON tenders(deadline);
CREATE INDEX idx_tenders_created_by ON tenders(created_by);


-- ──────────────────────────────────────────────────────────────────────────────
-- 4. TASKS (generated from AI analysis or manually)
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE tasks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tender_id         UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  assigned_to       UUID REFERENCES profiles(id),
  assigned_by       UUID REFERENCES profiles(id),
  title             TEXT NOT NULL,
  section_type      TEXT,                                         -- "executive_summary", "pricing", etc.
  description       TEXT,
  status            task_status DEFAULT 'unassigned',
  priority          INTEGER DEFAULT 0,                            -- 0=normal, 1=high, 2=critical
  is_mandatory      BOOLEAN DEFAULT false,                        -- From RFQ parsing
  content           TEXT,                                          -- The actual written content
  content_version   INTEGER DEFAULT 1,
  due_date          TIMESTAMPTZ,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  review_notes      TEXT,
  metadata          JSONB DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tasks_company ON tasks(company_id);
CREATE INDEX idx_tasks_tender ON tasks(tender_id);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX idx_tasks_status ON tasks(status);


-- ──────────────────────────────────────────────────────────────────────────────
-- 5. DOCUMENTS (Secure Vault)
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tender_id       UUID REFERENCES tenders(id) ON DELETE SET NULL,
  task_id         UUID REFERENCES tasks(id) ON DELETE SET NULL,
  uploaded_by     UUID NOT NULL REFERENCES profiles(id),
  file_name       TEXT NOT NULL,
  file_type       TEXT,                                           -- MIME type
  file_size       BIGINT,                                         -- bytes
  storage_path    TEXT NOT NULL,                                   -- Supabase Storage key
  doc_type        document_type DEFAULT 'supporting',
  version         INTEGER DEFAULT 1,
  is_locked       BOOLEAN DEFAULT false,                          -- True after tender submission
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_documents_company ON documents(company_id);
CREATE INDEX idx_documents_tender ON documents(tender_id);
CREATE INDEX idx_documents_task ON documents(task_id);
CREATE INDEX idx_documents_type ON documents(doc_type);


-- ──────────────────────────────────────────────────────────────────────────────
-- 6. SYSTEM AUDIT LOG
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE system_audit (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,
  user_id         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action          audit_action NOT NULL,
  table_name      TEXT,
  record_id       UUID,
  old_data        JSONB,
  new_data        JSONB,
  ip_address      INET,
  user_agent      TEXT,
  description     TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Audit logs are append-only: no UPDATE or DELETE
CREATE INDEX idx_audit_company ON system_audit(company_id);
CREATE INDEX idx_audit_user ON system_audit(user_id);
CREATE INDEX idx_audit_action ON system_audit(action);
CREATE INDEX idx_audit_table ON system_audit(table_name);
CREATE INDEX idx_audit_created ON system_audit(created_at DESC);


-- ──────────────────────────────────────────────────────────────────────────────
-- 7. LEADERBOARD MATERIALIZED VIEW
-- ──────────────────────────────────────────────────────────────────────────────

-- Departmental performance: completion speed vs. deadlines
CREATE OR REPLACE FUNCTION calculate_department_scores(p_company_id UUID)
RETURNS TABLE (
  department        TEXT,
  total_tasks       BIGINT,
  completed_tasks   BIGINT,
  on_time_tasks     BIGINT,
  avg_completion_hrs NUMERIC,
  completion_rate   NUMERIC,
  on_time_rate      NUMERIC,
  performance_score NUMERIC        -- Weighted composite 0-100
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.department,
    COUNT(t.id)                                                  AS total_tasks,
    COUNT(t.id) FILTER (WHERE t.status = 'approved')             AS completed_tasks,
    COUNT(t.id) FILTER (
      WHERE t.status = 'approved'
        AND t.completed_at <= t.due_date
    )                                                            AS on_time_tasks,
    ROUND(
      AVG(
        EXTRACT(EPOCH FROM (t.completed_at - t.started_at)) / 3600
      ) FILTER (WHERE t.completed_at IS NOT NULL),
      1
    )                                                            AS avg_completion_hrs,
    ROUND(
      (COUNT(t.id) FILTER (WHERE t.status = 'approved')::NUMERIC
       / NULLIF(COUNT(t.id), 0)) * 100,
      1
    )                                                            AS completion_rate,
    ROUND(
      (COUNT(t.id) FILTER (
        WHERE t.status = 'approved' AND t.completed_at <= t.due_date
      )::NUMERIC
       / NULLIF(COUNT(t.id) FILTER (WHERE t.status = 'approved'), 0)) * 100,
      1
    )                                                            AS on_time_rate,
    -- Composite: 50% completion rate + 35% on-time + 15% speed bonus
    ROUND(
      (
        (COUNT(t.id) FILTER (WHERE t.status = 'approved')::NUMERIC
         / NULLIF(COUNT(t.id), 0)) * 50
      ) + (
        (COUNT(t.id) FILTER (
          WHERE t.status = 'approved' AND t.completed_at <= t.due_date
        )::NUMERIC
         / NULLIF(COUNT(t.id) FILTER (WHERE t.status = 'approved'), 0)) * 35
      ) + (
        GREATEST(0, 15 - COALESCE(
          AVG(
            EXTRACT(EPOCH FROM (t.completed_at - t.started_at)) / 3600
          ) FILTER (WHERE t.completed_at IS NOT NULL) / 10,
          15
        ))
      ),
      1
    )                                                            AS performance_score
  FROM tasks t
  JOIN profiles p ON p.id = t.assigned_to
  WHERE t.company_id = p_company_id
    AND p.department IS NOT NULL
  GROUP BY p.department
  ORDER BY performance_score DESC NULLS LAST;
END;
$$;


-- ──────────────────────────────────────────────────────────────────────────────
-- 8. HELPER FUNCTIONS
-- ──────────────────────────────────────────────────────────────────────────────

-- Get current user's role from profiles
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS user_role LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- Get current user's company_id
CREATE OR REPLACE FUNCTION get_my_company_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid();
$$;

-- Check if current user is Super Admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  );
$$;

-- Check if current user has at least the given role level
-- Hierarchy: super_admin > it_admin > bid_manager > dept_user
CREATE OR REPLACE FUNCTION has_role_level(required_role user_role)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  my_role user_role;
  role_levels JSONB := '{"super_admin":4,"it_admin":3,"bid_manager":2,"dept_user":1}'::jsonb;
BEGIN
  SELECT role INTO my_role FROM profiles WHERE id = auth.uid();
  RETURN (role_levels->>my_role::text)::int >= (role_levels->>required_role::text)::int;
END;
$$;


-- ──────────────────────────────────────────────────────────────────────────────
-- 9. AUTO-UPDATE TIMESTAMPS TRIGGER
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_companies_updated   BEFORE UPDATE ON companies  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_profiles_updated    BEFORE UPDATE ON profiles   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tenders_updated     BEFORE UPDATE ON tenders    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tasks_updated       BEFORE UPDATE ON tasks      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_documents_updated   BEFORE UPDATE ON documents  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ──────────────────────────────────────────────────────────────────────────────
-- 10. AUDIT TRAIL TRIGGERS
-- ──────────────────────────────────────────────────────────────────────────────

-- Generic audit logger for INSERT/UPDATE
CREATE OR REPLACE FUNCTION log_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_action audit_action;
  v_company_id UUID;
  v_record_id UUID;
  v_old JSONB;
  v_new JSONB;
  v_desc TEXT;
BEGIN
  -- Determine action
  IF TG_OP = 'INSERT' THEN
    v_action := 'insert';
    v_new := to_jsonb(NEW);
    v_old := NULL;
    v_record_id := NEW.id;
    v_company_id := NEW.company_id;
    v_desc := TG_OP || ' on ' || TG_TABLE_NAME;
  ELSIF TG_OP = 'UPDATE' THEN
    v_new := to_jsonb(NEW);
    v_old := to_jsonb(OLD);
    v_record_id := NEW.id;
    v_company_id := NEW.company_id;

    -- Detect status changes specifically
    IF TG_TABLE_NAME = 'tasks' AND OLD.status IS DISTINCT FROM NEW.status THEN
      v_action := 'status_change';
      v_desc := 'Task status: ' || OLD.status || ' → ' || NEW.status;
    ELSIF TG_TABLE_NAME = 'tenders' AND OLD.status IS DISTINCT FROM NEW.status THEN
      v_action := 'status_change';
      v_desc := 'Tender status: ' || OLD.status || ' → ' || NEW.status;
    ELSE
      v_action := 'update';
      v_desc := TG_OP || ' on ' || TG_TABLE_NAME;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_old := to_jsonb(OLD);
    v_new := NULL;
    v_record_id := OLD.id;
    v_company_id := OLD.company_id;
    v_desc := TG_OP || ' on ' || TG_TABLE_NAME;
  END IF;

  INSERT INTO system_audit (
    company_id, user_id, action, table_name,
    record_id, old_data, new_data, description
  ) VALUES (
    v_company_id, auth.uid(), v_action, TG_TABLE_NAME,
    v_record_id, v_old, v_new, v_desc
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- Attach audit triggers to tasks and documents
CREATE TRIGGER trg_tasks_audit
  AFTER INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE TRIGGER trg_documents_audit
  AFTER INSERT OR UPDATE OR DELETE ON documents
  FOR EACH ROW EXECUTE FUNCTION log_audit();

-- Also audit tender status changes (critical for submission locking)
CREATE TRIGGER trg_tenders_audit
  AFTER INSERT OR UPDATE ON tenders
  FOR EACH ROW EXECUTE FUNCTION log_audit();


-- ──────────────────────────────────────────────────────────────────────────────
-- 11. SUBMISSION LOCK: Prevent edits once tender is "submitted"
-- ──────────────────────────────────────────────────────────────────────────────

-- Block task edits if parent tender is submitted
CREATE OR REPLACE FUNCTION enforce_tender_lock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_tender_status tender_status;
BEGIN
  SELECT status INTO v_tender_status
  FROM tenders WHERE id = NEW.tender_id;

  IF v_tender_status IN ('submitted', 'archived') THEN
    RAISE EXCEPTION 'Cannot modify: tender is in % state', v_tender_status;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tasks_lock_check
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION enforce_tender_lock();

-- Block document edits/inserts on locked tenders
CREATE OR REPLACE FUNCTION enforce_document_lock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_tender_status tender_status;
BEGIN
  IF NEW.tender_id IS NOT NULL THEN
    SELECT status INTO v_tender_status
    FROM tenders WHERE id = NEW.tender_id;

    IF v_tender_status IN ('submitted', 'archived') THEN
      RAISE EXCEPTION 'Cannot modify documents: tender is in % state', v_tender_status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_documents_lock_check
  BEFORE INSERT OR UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION enforce_document_lock();

-- Prevent reverting tender status from submitted back to earlier states
CREATE OR REPLACE FUNCTION enforce_tender_status_flow()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'submitted' AND NEW.status NOT IN ('submitted', 'archived') THEN
    RAISE EXCEPTION 'Cannot revert tender from submitted status';
  END IF;

  -- Auto-set submitted_at timestamp
  IF NEW.status = 'submitted' AND OLD.status != 'submitted' THEN
    NEW.submitted_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tender_status_flow
  BEFORE UPDATE ON tenders
  FOR EACH ROW EXECUTE FUNCTION enforce_tender_status_flow();


-- ──────────────────────────────────────────────────────────────────────────────
-- 12. AUTO-CREATE PROFILE ON SIGNUP
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'dept_user')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ══════════════════════════════════════════════════════════════════════════════
-- 13. ROW LEVEL SECURITY POLICIES
-- ══════════════════════════════════════════════════════════════════════════════

-- Enable RLS on all tables
ALTER TABLE companies    ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_audit ENABLE ROW LEVEL SECURITY;

-- ── COMPANIES ────────────────────────────────────────────────────────────────

-- Super Admin: full CRUD on all companies
CREATE POLICY "sa_companies_all" ON companies
  FOR ALL USING (is_super_admin());

-- All authenticated: read own company
CREATE POLICY "read_own_company" ON companies
  FOR SELECT USING (id = get_my_company_id());

-- ── PROFILES ─────────────────────────────────────────────────────────────────

-- Super Admin: see all profiles globally
CREATE POLICY "sa_profiles_all" ON profiles
  FOR ALL USING (is_super_admin());

-- IT Admin: full CRUD on profiles within their company
CREATE POLICY "itadmin_profiles_company" ON profiles
  FOR ALL USING (
    get_my_role() = 'it_admin'
    AND company_id = get_my_company_id()
  );

-- Bid Manager: read profiles in own company (for assignment)
CREATE POLICY "bm_profiles_read" ON profiles
  FOR SELECT USING (
    get_my_role() = 'bid_manager'
    AND company_id = get_my_company_id()
  );

-- Dept User: read own profile + colleagues in same company
CREATE POLICY "user_profiles_read" ON profiles
  FOR SELECT USING (
    company_id = get_my_company_id()
    OR id = auth.uid()
  );

-- Everyone can update their OWN profile (name, avatar, phone)
CREATE POLICY "self_profile_update" ON profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    -- Cannot change own role or company
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())
    AND company_id IS NOT DISTINCT FROM (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- ── TENDERS ──────────────────────────────────────────────────────────────────

-- Super Admin: full access
CREATE POLICY "sa_tenders_all" ON tenders
  FOR ALL USING (is_super_admin());

-- IT Admin: read all company tenders (audit capability)
CREATE POLICY "itadmin_tenders_read" ON tenders
  FOR SELECT USING (
    get_my_role() = 'it_admin'
    AND company_id = get_my_company_id()
  );

-- Bid Manager: full CRUD on company tenders
CREATE POLICY "bm_tenders_all" ON tenders
  FOR ALL USING (
    has_role_level('bid_manager')
    AND company_id = get_my_company_id()
  );

-- Dept User: read tenders they have tasks in
CREATE POLICY "user_tenders_read" ON tenders
  FOR SELECT USING (
    company_id = get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM tasks
      WHERE tasks.tender_id = tenders.id
        AND tasks.assigned_to = auth.uid()
    )
  );

-- ── TASKS ────────────────────────────────────────────────────────────────────

-- Super Admin: full access
CREATE POLICY "sa_tasks_all" ON tasks
  FOR ALL USING (is_super_admin());

-- IT Admin: read all company tasks
CREATE POLICY "itadmin_tasks_read" ON tasks
  FOR SELECT USING (
    get_my_role() = 'it_admin'
    AND company_id = get_my_company_id()
  );

-- Bid Manager: full CRUD on company tasks
CREATE POLICY "bm_tasks_all" ON tasks
  FOR ALL USING (
    has_role_level('bid_manager')
    AND company_id = get_my_company_id()
  );

-- Dept User: read & update ONLY tasks assigned to them
CREATE POLICY "user_tasks_read" ON tasks
  FOR SELECT USING (assigned_to = auth.uid());

CREATE POLICY "user_tasks_update" ON tasks
  FOR UPDATE USING (assigned_to = auth.uid())
  WITH CHECK (
    assigned_to = auth.uid()
    -- Dept users can only update content and status (not reassign)
    AND assigned_to = (SELECT assigned_to FROM tasks WHERE id = tasks.id)
  );

-- ── DOCUMENTS ────────────────────────────────────────────────────────────────

-- Super Admin: full access
CREATE POLICY "sa_documents_all" ON documents
  FOR ALL USING (is_super_admin());

-- IT Admin: read all company documents
CREATE POLICY "itadmin_documents_read" ON documents
  FOR SELECT USING (
    get_my_role() = 'it_admin'
    AND company_id = get_my_company_id()
  );

-- Bid Manager: full CRUD on company documents
CREATE POLICY "bm_documents_all" ON documents
  FOR ALL USING (
    has_role_level('bid_manager')
    AND company_id = get_my_company_id()
  );

-- Dept User: read docs for their tasks + upload to their tasks
CREATE POLICY "user_documents_read" ON documents
  FOR SELECT USING (
    company_id = get_my_company_id()
    AND (
      uploaded_by = auth.uid()
      OR task_id IN (SELECT id FROM tasks WHERE assigned_to = auth.uid())
    )
  );

CREATE POLICY "user_documents_insert" ON documents
  FOR INSERT WITH CHECK (
    uploaded_by = auth.uid()
    AND company_id = get_my_company_id()
    AND (
      task_id IS NULL
      OR task_id IN (SELECT id FROM tasks WHERE assigned_to = auth.uid())
    )
  );

-- ── SYSTEM AUDIT ─────────────────────────────────────────────────────────────

-- Super Admin: read ALL audit logs
CREATE POLICY "sa_audit_all" ON system_audit
  FOR SELECT USING (is_super_admin());

-- IT Admin: read company audit logs
CREATE POLICY "itadmin_audit_read" ON system_audit
  FOR SELECT USING (
    get_my_role() = 'it_admin'
    AND company_id = get_my_company_id()
  );

-- Bid Manager: read audit logs for tenders they manage
CREATE POLICY "bm_audit_read" ON system_audit
  FOR SELECT USING (
    get_my_role() = 'bid_manager'
    AND company_id = get_my_company_id()
    AND table_name IN ('tasks', 'documents', 'tenders')
  );

-- INSERT: allow the trigger function to write (service role bypasses RLS,
-- but we also allow authenticated users via the trigger)
CREATE POLICY "audit_insert_system" ON system_audit
  FOR INSERT WITH CHECK (true);

-- No UPDATE or DELETE on audit logs for anyone (append-only)
-- (No policies = denied by default)


-- ══════════════════════════════════════════════════════════════════════════════
-- 14. STORAGE BUCKET CONFIGURATION (run via Supabase Dashboard or API)
-- ══════════════════════════════════════════════════════════════════════════════

-- Create the storage bucket (execute in Supabase SQL editor)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tender-documents',
  'tender-documents',
  false,                             -- Private bucket
  52428800,                          -- 50MB limit
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg',
    'text/plain'
  ]
);

-- Storage RLS: files siloed by company_id path prefix
-- Path convention: {company_id}/{tender_id}/{filename}

CREATE POLICY "storage_sa_all" ON storage.objects
  FOR ALL USING (
    bucket_id = 'tender-documents'
    AND is_super_admin()
  );

CREATE POLICY "storage_company_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'tender-documents'
    AND (storage.foldername(name))[1] = get_my_company_id()::text
  );

CREATE POLICY "storage_company_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'tender-documents'
    AND (storage.foldername(name))[1] = get_my_company_id()::text
    AND has_role_level('dept_user')
  );

CREATE POLICY "storage_bm_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'tender-documents'
    AND (storage.foldername(name))[1] = get_my_company_id()::text
    AND has_role_level('bid_manager')
  );


-- ══════════════════════════════════════════════════════════════════════════════
-- 15. SEED: Super Admin Bootstrap
-- ══════════════════════════════════════════════════════════════════════════════
-- After creating your Supabase auth user, run this to promote to super_admin:
--
--   UPDATE profiles
--   SET role = 'super_admin', company_id = NULL
--   WHERE email = 'your-email@domain.com';
--
-- ══════════════════════════════════════════════════════════════════════════════
