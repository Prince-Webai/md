-- Migration: Add standardised job description for reporting/analytics
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS service_category TEXT;
COMMENT ON COLUMN jobs.service_category IS 'Standardised preset service type (e.g., Annual Service, Breakdown)';
