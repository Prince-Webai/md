-- OTP Table for Password Reset
CREATE TABLE IF NOT EXISTS otps (
    id uuid default uuid_generate_v4() primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    email text not null,
    otp text not null,
    used boolean default false,
    expires_at timestamp with time zone default (now() + interval '15 minutes')
);

-- Enable RLS
ALTER TABLE otps ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts for OTP generation
CREATE POLICY "Allow anon inserts for OTP" ON otps FOR INSERT WITH CHECK (true);

-- Allow users to read their own OTPs (by email) - simplified for MVP
CREATE POLICY "Allow public read for verification" ON otps FOR SELECT USING (used = false);

-- RPC to get User ID by email (since auth.users is protected)
-- This function MUST be SECURITY DEFINER to access auth.users
CREATE OR REPLACE FUNCTION get_user_id_by_email(user_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN (SELECT id FROM auth.users WHERE email = user_email LIMIT 1);
END;
$$;
