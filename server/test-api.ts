import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testApi() {
  const availableSlots = await prisma.slot.findMany({
    where: { isBooked: false },
    include: { mentor: true },
    orderBy: { startTime: 'asc' }
  });

  const mentorsMap = availableSlots.reduce<Record<string, string>>((acc, slot) => {
    if (slot.mentor) {
      acc[slot.mentor.id] = slot.mentor.name;
    }
    return acc;
  }, {});

  console.log('Available slots found:', availableSlots.length);
  console.log('Unique Mentors found:', Object.keys(mentorsMap).length);
  console.log('Mentors:', Object.values(mentorsMap));
}

testApi()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
