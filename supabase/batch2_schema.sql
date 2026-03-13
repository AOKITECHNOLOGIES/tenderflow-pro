-- ============================================================================
-- TENDERFLOW PRO — Batch 2: Additional Tables
-- ============================================================================
-- Run this AFTER phase1_schema.sql is already in place.
-- Adds: notifications, email_config, subscriptions, company_branding
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. NOTIFICATIONS
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TYPE notification_type AS ENUM (
  'task_assigned',
  'task_submitted',
  'task_approved',
  'task_revision',
  'tender_created',
  'tender_submitted',
  'tender_deadline',
  'user_invited',
  'system_alert',
  'ai_complete'
);

CREATE TABLE notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID REFERENCES companies(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type          notification_type NOT NULL,
  title         TEXT NOT NULL,
  message       TEXT,
  link          TEXT,                                          -- Hash route e.g. "#/tasks/uuid"
  is_read       BOOLEAN DEFAULT false,
  metadata      JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE NOT is_read;
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users see only their own notifications
CREATE POLICY "user_own_notifications" ON notifications
  FOR ALL USING (user_id = auth.uid());

-- Super Admin sees all
CREATE POLICY "sa_notifications_all" ON notifications
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- System/triggers can insert for any user
CREATE POLICY "system_insert_notifications" ON notifications
  FOR INSERT WITH CHECK (true);


-- ──────────────────────────────────────────────────────────────────────────────
-- 2. EMAIL CONFIG (per company SMTP settings)
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE email_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID UNIQUE NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  smtp_host       TEXT,
  smtp_port       INTEGER DEFAULT 587,
  smtp_user       TEXT,
  smtp_pass_encrypted TEXT,                                    -- Encrypted at app layer
  from_name       TEXT,
  from_email      TEXT,
  reply_to        TEXT,
  is_enabled      BOOLEAN DEFAULT false,
  last_tested_at  TIMESTAMPTZ,
  test_status     TEXT,                                        -- 'success' or error message
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE email_config ENABLE ROW LEVEL SECURITY;

-- Super Admin: full access
CREATE POLICY "sa_email_config_all" ON email_config
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- IT Admin: read/update own company config
CREATE POLICY "itadmin_email_config" ON email_config
  FOR ALL USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'it_admin')
  );

CREATE TRIGGER trg_email_config_updated
  BEFORE UPDATE ON email_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ──────────────────────────────────────────────────────────────────────────────
-- 3. SUBSCRIPTIONS / BILLING TIERS
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TYPE subscription_tier AS ENUM (
  'free',
  'starter',
  'professional',
  'enterprise'
);

CREATE TYPE subscription_status AS ENUM (
  'active',
  'trial',
  'past_due',
  'cancelled',
  'suspended'
);

CREATE TABLE subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID UNIQUE NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tier            subscription_tier DEFAULT 'free',
  status          subscription_status DEFAULT 'trial',
  max_users       INTEGER DEFAULT 5,
  max_tenders     INTEGER DEFAULT 10,
  max_storage_mb  INTEGER DEFAULT 500,
  ai_credits      INTEGER DEFAULT 50,                          -- AI parse calls remaining
  ai_credits_used INTEGER DEFAULT 0,
  trial_ends_at   TIMESTAMPTZ DEFAULT (now() + interval '14 days'),
  current_period_start TIMESTAMPTZ DEFAULT now(),
  current_period_end   TIMESTAMPTZ DEFAULT (now() + interval '30 days'),
  payment_ref     TEXT,                                        -- External payment ID
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Super Admin: full access
CREATE POLICY "sa_subscriptions_all" ON subscriptions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- IT Admin: read own company subscription
CREATE POLICY "itadmin_subscriptions_read" ON subscriptions
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('it_admin', 'bid_manager'))
  );

CREATE TRIGGER trg_subscriptions_updated
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Tier limits lookup function
CREATE OR REPLACE FUNCTION get_tier_limits(p_company_id UUID)
RETURNS TABLE (
  tier             subscription_tier,
  status           subscription_status,
  max_users        INTEGER,
  max_tenders      INTEGER,
  max_storage_mb   INTEGER,
  ai_credits_left  INTEGER,
  days_remaining   INTEGER,
  is_trial         BOOLEAN
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    s.tier,
    s.status,
    s.max_users,
    s.max_tenders,
    s.max_storage_mb,
    s.ai_credits - s.ai_credits_used,
    GREATEST(0, EXTRACT(DAY FROM s.current_period_end - now())::int),
    s.status = 'trial'
  FROM subscriptions s
  WHERE s.company_id = p_company_id;
$$;


-- ──────────────────────────────────────────────────────────────────────────────
-- 4. COMPANY BRANDING
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE company_branding (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID UNIQUE NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  logo_url        TEXT,
  logo_dark_url   TEXT,
  primary_color   TEXT DEFAULT '#0ea5e9',
  secondary_color TEXT DEFAULT '#0f172a',
  accent_color    TEXT DEFAULT '#38bdf8',
  tagline         TEXT,
  footer_text     TEXT,
  proposal_header TEXT,                                        -- Custom text on compiled proposals
  proposal_footer TEXT,
  cover_template  TEXT DEFAULT 'default',                      -- 'default', 'minimal', 'corporate'
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE company_branding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sa_branding_all" ON company_branding
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "itadmin_branding" ON company_branding
  FOR ALL USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'it_admin')
  );

-- Everyone in company can read branding (needed for compiled docs)
CREATE POLICY "company_branding_read" ON company_branding
  FOR SELECT USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE TRIGGER trg_branding_updated
  BEFORE UPDATE ON company_branding
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ──────────────────────────────────────────────────────────────────────────────
-- 5. AUTO-NOTIFICATION TRIGGERS
-- ──────────────────────────────────────────────────────────────────────────────

-- Notify user when assigned a task
CREATE OR REPLACE FUNCTION notify_task_assigned()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) THEN
    INSERT INTO notifications (company_id, user_id, type, title, message, link)
    VALUES (
      NEW.company_id,
      NEW.assigned_to,
      'task_assigned',
      'New task assigned to you',
      'Task: ' || NEW.title,
      '#/tasks/' || NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_task_assigned
  AFTER INSERT OR UPDATE OF assigned_to ON tasks
  FOR EACH ROW EXECUTE FUNCTION notify_task_assigned();

-- Notify bid manager when task is submitted for review
CREATE OR REPLACE FUNCTION notify_task_submitted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tender_creator UUID;
BEGIN
  IF NEW.status = 'submitted' AND OLD.status != 'submitted' THEN
    -- Notify the tender creator (bid manager)
    SELECT created_by INTO v_tender_creator
    FROM tenders WHERE id = NEW.tender_id;

    IF v_tender_creator IS NOT NULL AND v_tender_creator != auth.uid() THEN
      INSERT INTO notifications (company_id, user_id, type, title, message, link)
      VALUES (
        NEW.company_id,
        v_tender_creator,
        'task_submitted',
        'Task submitted for review',
        'Task: ' || NEW.title,
        '#/tasks/' || NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_task_submitted
  AFTER UPDATE OF status ON tasks
  FOR EACH ROW EXECUTE FUNCTION notify_task_submitted();

-- Notify user when task is approved or needs revision
CREATE OR REPLACE FUNCTION notify_task_reviewed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to != auth.uid() THEN
    IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
      INSERT INTO notifications (company_id, user_id, type, title, message, link)
      VALUES (
        NEW.company_id, NEW.assigned_to, 'task_approved',
        'Your task was approved!', 'Task: ' || NEW.title, '#/tasks/' || NEW.id
      );
    ELSIF NEW.status = 'revision_needed' AND OLD.status != 'revision_needed' THEN
      INSERT INTO notifications (company_id, user_id, type, title, message, link)
      VALUES (
        NEW.company_id, NEW.assigned_to, 'task_revision',
        'Revision requested on your task', 
        COALESCE('Notes: ' || NEW.review_notes, 'Task: ' || NEW.title),
        '#/tasks/' || NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_task_reviewed
  AFTER UPDATE OF status ON tasks
  FOR EACH ROW EXECUTE FUNCTION notify_task_reviewed();

-- Auto-create subscription on company creation
CREATE OR REPLACE FUNCTION auto_create_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO subscriptions (company_id, tier, status)
  VALUES (NEW.id, 'free', 'trial');
  
  INSERT INTO company_branding (company_id)
  VALUES (NEW.id);
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_subscription
  AFTER INSERT ON companies
  FOR EACH ROW EXECUTE FUNCTION auto_create_subscription();
