// Quick Supabase connectivity test
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

console.log('🔍 Checking Supabase Connection...\n');

// Check environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  console.log('SUPABASE_URL:', supabaseUrl ? '✅ Set' : '❌ Missing');
  console.log('SUPABASE_ANON_KEY:', supabaseKey ? '✅ Set' : '❌ Missing');
  process.exit(1);
}

console.log('📊 Supabase Configuration:');
console.log('URL:', supabaseUrl);
console.log('Key:', supabaseKey.substring(0, 20) + '...');
console.log('');

// Test Supabase connection
const supabase = createClient(supabaseUrl, supabaseKey);

async function testSupabase() {
  try {
    console.log('🔌 Testing Supabase API connection...');
    
    // Test basic connection with a simple query
    const { data, error } = await supabase
      .from('Users')
      .select('count(*)')
      .limit(1);
    
    if (error) {
      console.error('❌ Supabase API Error:', error.message);
      console.log('\n🔧 Possible Solutions:');
      console.log('1. Check if your Supabase project is active (not paused)');
      console.log('2. Verify your API keys are correct');
      console.log('3. Ensure the Users table exists');
      return;
    }
    
    console.log('✅ Supabase API connection successful!');
    console.log('📊 Query result:', data);
    
    // Test direct database connection
    console.log('\n🗄️ Testing direct database connection...');
    
    const { data: healthCheck, error: healthError } = await supabase.rpc('version');
    
    if (healthError) {
      console.log('⚠️ Database health check failed:', healthError.message);
    } else {
      console.log('✅ Database is responding');
    }
    
  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
    
    if (error.message.includes('fetch')) {
      console.log('\n🔧 Possible Solutions:');
      console.log('1. Your Supabase project might be paused - check the dashboard');
      console.log('2. Network connectivity issues');
      console.log('3. Invalid project URL or keys');
    }
  }
}

testSupabase();