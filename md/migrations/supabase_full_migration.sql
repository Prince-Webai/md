-- =======================================================================
-- MD BURKE WORKSHOP MANAGEMENT SYSTEM
-- Full Migration Script — Run in Supabase SQL Editor
-- Generated: 2026-03-19
-- =======================================================================
-- This script is SAFE to re-run. All changes use IF NOT EXISTS / 
-- DO $$ EXCEPTION WHEN OTHERS clauses to avoid duplicate errors.
-- Run this entire script from top to bottom in the Supabase SQL Editor.
-- =======================================================================


-- -----------------------------------------------------------------------
-- SECTION 1: JOBS TABLE ADDITIONS
-- -----------------------------------------------------------------------

-- Permanent machine identifier (survives ownership transfers)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS whole_good_number TEXT;
COMMENT ON COLUMN jobs.whole_good_number IS 'Permanent machine ID for tracking service history across owners';

-- Customer Purchase/Invoice Order reference
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS po_number TEXT;
COMMENT ON COLUMN jobs.po_number IS 'Customer Purchase Order / Invoice Order number';

-- Standardised job service category (for analytics & completion report)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS service_category TEXT;
COMMENT ON COLUMN jobs.service_category IS 'Standardised preset service type e.g. Full Service, Minor Service, Repair';

-- Mechanic sign-off name on completion (auto-populated from assigned engineer)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS mechanic_sign_off_name TEXT;
COMMENT ON COLUMN jobs.mechanic_sign_off_name IS 'Name of mechanic who signed off and completed the job';

-- Recommendations on completion report
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS recommendations TEXT;
COMMENT ON COLUMN jobs.recommendations IS 'Mechanic recommendations noted at time of job completion';

-- Final diagnosis and repair summary fields
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS diagnosis_notes TEXT;
COMMENT ON COLUMN jobs.diagnosis_notes IS 'Mechanic diagnosis notes — what was found on inspection';

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS repair_summary TEXT;
COMMENT ON COLUMN jobs.repair_summary IS 'Summary of work actually carried out to fix the issue';

-- Timer-based labour tracking
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS timer_status TEXT DEFAULT 'stopped';
COMMENT ON COLUMN jobs.timer_status IS 'Current labour timer status: stopped | running | paused';

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS timer_started_at TIMESTAMPTZ;
COMMENT ON COLUMN jobs.timer_started_at IS 'Timestamp when the active timer session began';

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS actual_start_time TIMESTAMPTZ;
COMMENT ON COLUMN jobs.actual_start_time IS 'Timestamp when work first began on this job';

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS actual_end_time TIMESTAMPTZ;
COMMENT ON COLUMN jobs.actual_end_time IS 'Timestamp when work was marked complete';

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS total_hours_worked NUMERIC(8,2) DEFAULT 0;
COMMENT ON COLUMN jobs.total_hours_worked IS 'Total accumulated labour hours (raw, for billing round-up)';

-- Problem description (raw customer-reported fault text)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS problem_description TEXT;
COMMENT ON COLUMN jobs.problem_description IS 'Raw fault description as provided by the customer at intake';

-- Generated document URL references
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_sheet_pdf_url TEXT;
COMMENT ON COLUMN jobs.job_sheet_pdf_url IS 'URL to generated job worksheet PDF in storage';

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS completion_report_pdf_url TEXT;
COMMENT ON COLUMN jobs.completion_report_pdf_url IS 'URL to generated completion/service report PDF in storage';


-- -----------------------------------------------------------------------
-- SECTION 2: JOB_ITEMS TABLE — STATUS FOR PARK MODE
-- -----------------------------------------------------------------------

-- Allows parts to be 'parked' (reserved but not yet used) on a job
ALTER TABLE job_items ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Used';
COMMENT ON COLUMN job_items.status IS 'Part status: Park Mode (reserved) | Used | Returned';


-- -----------------------------------------------------------------------
-- SECTION 3: LABOUR LOGS TABLE
-- Tracks individual start/stop timer sessions per mechanic per job
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS labour_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id      UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    mechanic_id TEXT NOT NULL,
    start_time  TIMESTAMPTZ NOT NULL DEFAULT now(),
    end_time    TIMESTAMPTZ,
    duration_minutes NUMERIC(8,2),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE labour_logs IS 'Individual labour timer session records per mechanic per job';
COMMENT ON COLUMN labour_logs.mechanic_id IS 'Engineer name (text reference to engineers.name)';
COMMENT ON COLUMN labour_logs.duration_minutes IS 'Calculated duration of this session in minutes';

-- Index for quick job lookups
CREATE INDEX IF NOT EXISTS idx_labour_logs_job_id ON labour_logs(job_id);


-- -----------------------------------------------------------------------
-- SECTION 4: ENGINEERS TABLE
-- Stores mechanic/engineer profiles (separate from Supabase Auth users)
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS engineers (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    email      TEXT,
    phone      TEXT,
    role       TEXT DEFAULT 'Engineer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE engineers IS 'Workshop engineer/mechanic profiles used for job assignment';

-- Seed a default admin engineer if none exist
INSERT INTO engineers (name, email, role)
SELECT 'Admin User', 'admin@mdburke.ie', 'Admin'
WHERE NOT EXISTS (SELECT 1 FROM engineers LIMIT 1);


-- -----------------------------------------------------------------------
-- SECTION 5: TAG POOL TABLE
-- Pre-allocated job tag numbers pool
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tag_pool (
    tag_number  INTEGER PRIMARY KEY,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE tag_pool IS 'Pre-allocated pool of job tag numbers. is_active=false means assigned to an open job.';

-- Populate with 200 tags if empty
INSERT INTO tag_pool (tag_number)
SELECT generate_series(1, 200)
WHERE NOT EXISTS (SELECT 1 FROM tag_pool LIMIT 1);


-- -----------------------------------------------------------------------
-- SECTION 6: SETTINGS TABLE
-- Single-row company configuration
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS settings (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name     TEXT NOT NULL DEFAULT 'MD Burke Workshop',
    company_address  TEXT,
    company_phone    TEXT,
    company_email    TEXT,
    contact_name     TEXT,
    bank_name        TEXT,
    account_name     TEXT,
    iban             TEXT,
    bic              TEXT,
    vat_reg_number   TEXT,
    webhook_url      TEXT,
    company_logo_url TEXT,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE settings IS 'Single-row company settings used in reports, PDFs, and invoices';

-- Insert default row if not already present
INSERT INTO settings (company_name)
SELECT 'MD Burke Workshop'
WHERE NOT EXISTS (SELECT 1 FROM settings LIMIT 1);


-- -----------------------------------------------------------------------
-- SECTION 7: CUSTOMERS TABLE ADDITIONS
-- -----------------------------------------------------------------------

-- Split address into structured fields
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_line1 TEXT;
COMMENT ON COLUMN customers.address_line1 IS 'Primary address line (structured)';

ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_person TEXT;
COMMENT ON COLUMN customers.contact_person IS 'Primary contact person name for the customer account';

ALTER TABLE customers ADD COLUMN IF NOT EXISTS account_balance NUMERIC(10,2) DEFAULT 0;
COMMENT ON COLUMN customers.account_balance IS 'Running outstanding balance for this customer account';


-- -----------------------------------------------------------------------
-- SECTION 8: ROW LEVEL SECURITY (RLS) — BASIC POLICIES
-- Allows authenticated users to access data. Adjust as needed.
-- -----------------------------------------------------------------------

-- Jobs
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage jobs" ON jobs;
CREATE POLICY "Authenticated users can manage jobs"
    ON jobs FOR ALL
    USING (auth.role() = 'authenticated');

-- Job Items
ALTER TABLE job_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage job_items" ON job_items;
CREATE POLICY "Authenticated users can manage job_items"
    ON job_items FOR ALL
    USING (auth.role() = 'authenticated');

-- Labour Logs
ALTER TABLE labour_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage labour_logs" ON labour_logs;
CREATE POLICY "Authenticated users can manage labour_logs"
    ON labour_logs FOR ALL
    USING (auth.role() = 'authenticated');

-- Engineers
ALTER TABLE engineers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage engineers" ON engineers;
CREATE POLICY "Authenticated users can manage engineers"
    ON engineers FOR ALL
    USING (auth.role() = 'authenticated');

-- Customers
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage customers" ON customers;
CREATE POLICY "Authenticated users can manage customers"
    ON customers FOR ALL
    USING (auth.role() = 'authenticated');

-- Inventory
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage inventory" ON inventory;
CREATE POLICY "Authenticated users can manage inventory"
    ON inventory FOR ALL
    USING (auth.role() = 'authenticated');

-- Tag Pool
ALTER TABLE tag_pool ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage tag_pool" ON tag_pool;
CREATE POLICY "Authenticated users can manage tag_pool"
    ON tag_pool FOR ALL
    USING (auth.role() = 'authenticated');

-- Settings
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage settings" ON settings;
CREATE POLICY "Authenticated users can manage settings"
    ON settings FOR ALL
    USING (auth.role() = 'authenticated');


-- -----------------------------------------------------------------------
-- DONE
-- -----------------------------------------------------------------------
-- After running this script:
-- 1. Verify all tables exist in the Supabase 'Table Editor'
-- 2. Check the 'tag_pool' table has 200 rows (tag numbers 1-200)
-- 3. Check the 'settings' table has 1 row
-- 4. Check the 'engineers' table has at least 1 row
-- =======================================================================
