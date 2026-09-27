import { PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing existing data...');
  await prisma.booking.deleteMany();
  await prisma.slot.deleteMany();
  await prisma.parent.deleteMany();
  await prisma.mentor.deleteMany();

  console.log('Seeding Mentors...');
  const mentorNames = [
    'Ananya Sharma',
    'Rohan Verma',
    'Priya Patel',
    'Aarav Gupta',
    'Neha Reddy',
    'Vikram Malhotra',
    'Kavya Nair',
    'Siddharth Joshi',
    'Isha Choudhury',
    'Aditya Kumar'
  ];

  const mentors = [];
  for (let i = 0; i < mentorNames.length; i++) {
    const name = mentorNames[i];
    const email = `${name.toLowerCase().replace(/\s+/g, '.')}@codeyoung.com`;
    const mentor = await prisma.mentor.create({
      data: {
        name,
        email,
        timezone: 'Asia/Kolkata',
        maxDailyDemos: 2
      }
    });
    mentors.push(mentor);
  }

  console.log('Seeding Parents...');
  const parentsData = [
    { name: 'Sarah Jenkins', email: 'sarah.j@example.com', timezone: 'America/New_York' },
    { name: 'David Smith', email: 'david.smith@example.co.uk', timezone: 'Europe/London' },
    { name: 'Emily Davis', email: 'emily.davis@example.com', timezone: 'America/Los_Angeles' },
    { name: 'Michael Brown', email: 'mbrown@example.com', timezone: 'America/Chicago' },
    { name: 'Jennifer Wilson', email: 'jwilson@example.com', timezone: 'America/New_York' },
    { name: 'James Taylor', email: 'jtaylor@example.co.uk', timezone: 'Europe/London' },
    { name: 'Amanda Martinez', email: 'amartinez@example.com', timezone: 'America/Los_Angeles' },
    { name: 'Robert Anderson', email: 'randerson@example.com', timezone: 'America/Chicago' },
    { name: 'Jessica Thomas', email: 'jthomas@example.com', timezone: 'America/New_York' },
    { name: 'William Jackson', email: 'wjackson@example.co.uk', timezone: 'Europe/London' },
    { name: 'Patricia White', email: 'pwhite@example.com', timezone: 'America/Los_Angeles' },
    { name: 'Christopher Harris', email: 'charris@example.com', timezone: 'America/Chicago' },
    { name: 'Elizabeth Martin', email: 'emartin@example.com', timezone: 'America/New_York' },
    { name: 'Daniel Thompson', email: 'dthompson@example.co.uk', timezone: 'Europe/London' },
    { name: 'Barbara Garcia', email: 'bgarcia@example.com', timezone: 'America/Los_Angeles' },
    { name: 'Matthew Martinez', email: 'mmartinez@example.com', timezone: 'America/Chicago' },
    { name: 'Linda Robinson', email: 'lrobinson@example.com', timezone: 'America/New_York' },
    { name: 'Anthony Clark', email: 'aclark@example.co.uk', timezone: 'Europe/London' },
    { name: 'Karen Rodriguez', email: 'krodriguez@example.com', timezone: 'America/Los_Angeles' },
    { name: 'Mark Lewis', email: 'mlewis@example.com', timezone: 'America/Chicago' }
  ];

  for (const p of parentsData) {
    await prisma.parent.create({
      data: p
    });
  }

  console.log('Generating 1-hour availability slots for next 7 days in Asia/Kolkata...');
  // Working hours: 18:00 to 22:00 IST (6:00 PM to 10:00 PM IST)
  // Slots: 18:00-19:00, 19:00-20:00, 20:00-21:00, 21:00-22:00 IST
  const todayIST = DateTime.now().setZone('Asia/Kolkata').startOf('day');

  const slotDataBatch = [];

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const currentDayIST = todayIST.plus({ days: dayOffset });

    for (let hour = 18; hour < 22; hour++) {
      const slotStartIST = currentDayIST.set({ hour, minute: 0, second: 0, millisecond: 0 });
      const slotEndIST = slotStartIST.plus({ hours: 1 });

      // Convert strictly to UTC JS Date objects for Prisma storage
      const startTimeUTC = slotStartIST.toJSDate();
      const endTimeUTC = slotEndIST.toJSDate();

      for (const mentor of mentors) {
        slotDataBatch.push({
          mentorId: mentor.id,
          startTime: startTimeUTC,
          endTime: endTimeUTC,
          isBooked: false
        });
      }
    }
  }

  await prisma.slot.createMany({
    data: slotDataBatch
  });

  console.log(`Successfully seeded ${mentors.length} mentors, ${parentsData.length} parents, and ${slotDataBatch.length} slots.`);
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
