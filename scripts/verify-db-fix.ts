
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
    console.log('Testing connection with updated configuration...');
    console.log('DATABASE_URL:', process.env.DATABASE_URL?.replace(/:[^:]*@/, ':***@'));
    console.log('DIRECT_URL:  ', process.env.DIRECT_URL?.replace(/:[^:]*@/, ':***@'));

    const prisma = new PrismaClient();
    try {
        await prisma.$connect();
        console.log('✅ Connected successfully!');

        // Test a basic query
        const count = await prisma.user.count();
        console.log(`✅ Query successful! User count: ${count}`);

        await prisma.$disconnect();
    } catch (error: any) {
        console.error('❌ Connection failed:', error.message);
        if (error.code) console.error('Code:', error.code);
        process.exit(1);
    }
}

testConnection();
