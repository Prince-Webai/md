-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Customers Table
create table if not exists customers (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  pos_customer_id text, -- ID returned from POS API
  name text not null,
  email text,
  phone text,
  company text,
  address_line1 text,
  address_city text,
  address_postcode text
);

-- Jobs Table
create table if not exists jobs (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  job_number serial, -- Display Tag Number
  customer_id uuid references customers(id),
  machine_details text,
  problem_description text,
  status text default 'Booked In',
  mechanic_id text, -- Using text for simple MVP or can reference a users table
  date_scheduled timestamp with time zone,
  date_completed timestamp with time zone,
  
  -- Tracking Fields added via app
  whole_good_number text,
  po_number text,
  total_hours_worked numeric,
  timer_status text default 'stopped',
  timer_started_at timestamp with time zone,
  actual_start_time timestamp with time zone,
  actual_end_time timestamp with time zone,
  service_type text,
  engineer_name text,
  diagnosis_notes text,
  repair_summary text,
  recommendations text,
  mechanic_sign_off_name text
);

-- Labour Logs
create table if not exists labour_logs (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  job_id uuid references jobs(id) on delete cascade,
  mechanic_id text not null,
  start_time timestamp with time zone not null,
  end_time timestamp with time zone,
  duration_minutes integer,
  notes text
);

-- Job Parts
create table if not exists job_parts (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  job_id uuid references jobs(id) on delete cascade,
  sku text,
  name text not null,
  quantity integer default 1,
  supplier text,
  po_number text,
  eta timestamp with time zone,
  status text default 'Park Mode',
  pos_product_id text -- Extracted if linked to POS explicitly
);

-- Job Notes & Photos
create table if not exists job_notes (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  job_id uuid references jobs(id) on delete cascade,
  mechanic_id text,
  content text,
  photo_url text
);

-- Safe Column Appender (For users upgrading an existing DB)
DO $$ 
BEGIN 
    -- Add columns to jobs if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jobs' AND column_name='whole_good_number') THEN
        ALTER TABLE jobs ADD COLUMN whole_good_number text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jobs' AND column_name='po_number') THEN
        ALTER TABLE jobs ADD COLUMN po_number text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jobs' AND column_name='total_hours_worked') THEN
        ALTER TABLE jobs ADD COLUMN total_hours_worked numeric;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jobs' AND column_name='timer_status') THEN
        ALTER TABLE jobs ADD COLUMN timer_status text default 'stopped';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jobs' AND column_name='timer_started_at') THEN
        ALTER TABLE jobs ADD COLUMN timer_started_at timestamp with time zone;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jobs' AND column_name='actual_start_time') THEN
        ALTER TABLE jobs ADD COLUMN actual_start_time timestamp with time zone;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jobs' AND column_name='actual_end_time') THEN
        ALTER TABLE jobs ADD COLUMN actual_end_time timestamp with time zone;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jobs' AND column_name='service_type') THEN
        ALTER TABLE jobs ADD COLUMN service_type text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jobs' AND column_name='engineer_name') THEN
        ALTER TABLE jobs ADD COLUMN engineer_name text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jobs' AND column_name='diagnosis_notes') THEN
        ALTER TABLE jobs ADD COLUMN diagnosis_notes text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jobs' AND column_name='repair_summary') THEN
        ALTER TABLE jobs ADD COLUMN repair_summary text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jobs' AND column_name='recommendations') THEN
        ALTER TABLE jobs ADD COLUMN recommendations text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jobs' AND column_name='mechanic_sign_off_name') THEN
        ALTER TABLE jobs ADD COLUMN mechanic_sign_off_name text;
    END IF;
END $$;
