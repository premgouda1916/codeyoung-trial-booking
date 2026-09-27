import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function test() {
  try {
    console.log('Testing connection to database...');
    const mentorsCount = await prisma.mentor.count();
    console.log(`Success! Mentors count in DB: ${mentorsCount}`);
    const slotsCount = await prisma.slot.count();
    console.log(`Success! Slots count in DB: ${slotsCount}`);
  } catch (err) {
    console.error('Connection error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
