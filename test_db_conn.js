const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://vkmrynaogtrexbodfmuf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrbXJ5bmFvZ3RyZXhib2RmbXVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MjE2NzgsImV4cCI6MjA4ODE5NzY3OH0.bdXPaMORcX10pqzLZxsNy24hZyIagDeRxZQi2ZrNQdk';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testConnection() {
    console.log('Testing authentication...');
    const { data: authData, error: authError } = await supabase.auth.signUp({
        email: 'admin@mdbruke.ie',
        password: '123456',
        options: {
            data: {
                name: 'Admin User',
                role: 'System Admin'
            }
        }
    });

    if (authError) {
        if (authError.message === 'User already registered') {
            console.log('User already registered, testing login...');
            const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
                email: 'admin@mdbruke.ie',
                password: '123456'
            });
            if (loginError) {
                console.error('Login Error:', loginError.message);
            } else {
                console.log('Login successful! User ID:', loginData.user.id);
                await testDb(loginData.session.access_token);
            }
        } else {
            console.error('Auth Error:', authError.message);
        }
        return;
    }

    if (authData.user) {
        console.log('Signup successful! User ID:', authData.user.id);
        if (authData.session) {
            await testDb(authData.session.access_token);
        } else {
            console.log('No session returned. Email confirmation might be required.');
        }
    }
}

async function testDb(token) {
    console.log('\nTesting Database (Creating a customer)...');
    const { data: customer, error: customerError } = await supabase
        .from('customers')
        .insert([{
            name: 'Test Customer NewDB ' + Date.now(),
            email: 'test@newdb.com',
            phone: '123456789'
        }])
        .select()
        .single();

    if (customerError) {
        console.error('DB Insert Error:', customerError.message);
        return;
    }

    console.log('Customer created successfully:', customer.id);

    console.log('\nTesting Database (Creating a job)...');
    const { data: job, error: jobError } = await supabase
        .from('jobs')
        .insert([{
            customer_id: customer.id,
            machine_details: 'Test Machine DB',
            problem_description: 'Testing new DB connection',
            status: 'In Progress'
        }])
        .select()
        .single();

    if (jobError) {
        console.error('Job Insert Error:', jobError.message);
        return;
    }

    console.log('Job created successfully:', job.id);
    console.log('All tests passed!');
}

testConnection();
