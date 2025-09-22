// Database Connection Test Script
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log('🔍 Testing Database Connection...\n');

// Check if DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set in environment variables');
  process.exit(1);
}

// Log connection details (safely)
const dbUrl = process.env.DATABASE_URL;
const urlParts = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);

if (urlParts) {
  console.log('📊 Connection Details:');
  console.log(`   User: ${urlParts[1]}`);
  console.log(`   Host: ${urlParts[3]}`);
  console.log(`   Port: ${urlParts[4]}`);
  console.log(`   Database: ${urlParts[5].split('?')[0]}`);
  console.log('');
} else {
  console.log('⚠️  Could not parse DATABASE_URL format');
}

// Test Prisma connection
const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function testConnection() {
  try {
    console.log('🔌 Testing Prisma connection...');
    
    // Test basic connection
    await prisma.$connect();
    console.log('✅ Prisma connected successfully');
    
    // Test a simple query
    console.log('🔍 Testing simple query...');
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✅ Query executed successfully:', result);
    
    // Test user table access
    console.log('👤 Testing user table access...');
    const userCount = await prisma.user.count();
    console.log(`✅ User table accessible. Current user count: ${userCount}`);
    
    console.log('\n🎉 All database tests passed!');
    
  } catch (error) {
    console.error('\n❌ Database connection failed:');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    
    if (error.code) {
      console.error('Error code:', error.code);
    }
    
    // Specific error handling
    if (error.message.includes("Can't reach database server")) {
      console.log('\n🔧 Possible Solutions:');
      console.log('1. Check if your Supabase project is active (not paused)');
      console.log('2. Verify your DATABASE_URL is correct');
      console.log('3. Check if your Supabase project has networking restrictions');
      console.log('4. Ensure your Supabase project is in the correct region');
    } else if (error.message.includes('password authentication failed')) {
      console.log('\n🔧 Possible Solutions:');
      console.log('1. Check your database password in Supabase dashboard');
      console.log('2. Reset your database password if needed');
      console.log('3. Update your DATABASE_URL with the correct password');
    }
    
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();