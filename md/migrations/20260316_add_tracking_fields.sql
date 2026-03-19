-- Migration: Add machine and order tracking fields to jobs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS whole_good_number TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS po_number TEXT;

-- Add comment for clarity
COMMENT ON COLUMN jobs.whole_good_number IS 'Permanent machine ID for tracking service history across owners';
COMMENT ON COLUMN jobs.po_number IS 'Customer Purchase Order / Invoice Order number';
