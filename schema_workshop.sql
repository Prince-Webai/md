-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Customers Table
create table customers (
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
create table jobs (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  job_number serial, -- Display Tag Number
  customer_id uuid references customers(id),
  machine_details text,
  problem_description text,
  status text check (status in ('Booked In', 'In Progress', 'Waiting for Parts', 'Ready to Continue', 'Ready for Collection', 'Completed', 'Closed')) default 'Booked In',
  mechanic_id text, -- Using text for simple MVP or can reference a users table
  date_scheduled timestamp with time zone,
  date_completed timestamp with time zone
);

-- Labour Logs
create table labour_logs (
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
create table job_parts (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  job_id uuid references jobs(id) on delete cascade,
  sku text,
  name text not null,
  quantity integer default 1,
  supplier text,
  po_number text,
  eta timestamp with time zone,
  status text check (status in ('Park Mode', 'Not Ordered', 'Ordered', 'In Transit', 'Arrived', 'Allocated', 'Used')) default 'Park Mode',
  pos_product_id text -- Extracted if linked to POS explicitly
);

-- Job Notes & Photos
create table job_notes (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  job_id uuid references jobs(id) on delete cascade,
  mechanic_id text,
  content text,
  photo_url text
);
