import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', async (req: Request, res: Response) => {
  try {
    const slotsCount = await prisma.slot.count();
    const mentorsCount = await prisma.mentor.count();
    res.json({ status: 'ok', mentorsCount, slotsCount, timestamp: new Date().toISOString() });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// GET /api/mentors - Fetch list of mentors
app.get('/api/mentors', async (req: Request, res: Response) => {
  try {
    const mentors = await prisma.mentor.findMany({
      include: {
        _count: {
          select: { bookings: true, slots: true }
        }
      }
    });
    res.json(mentors);
  } catch (error) {
    console.error('Error fetching mentors:', error);
    res.status(500).json({ error: 'Failed to fetch mentors' });
  }
});

// GET /api/parents - Fetch list of parents
app.get('/api/parents', async (req: Request, res: Response) => {
  try {
    const parents = await prisma.parent.findMany();
    res.json(parents);
  } catch (error) {
    console.error('Error fetching parents:', error);
    res.status(500).json({ error: 'Failed to fetch parents' });
  }
});

// GET /api/slots - Fetch available slots with Mentor relation, enforcing maxDailyDemos capacity
app.get('/api/slots', async (req: Request, res: Response) => {
  try {
    const { parentTimezone } = req.query;

    // 1. Fetch unbooked slots
    const unbookedSlots = await prisma.slot.findMany({
      where: { isBooked: false },
      include: {
        mentor: true
      },
      orderBy: { startTime: 'asc' }
    });

    // 2. Fetch confirmed bookings to calculate daily booking counts per mentor on their local IST day
    const confirmedBookings = await prisma.booking.findMany({
      where: { status: 'CONFIRMED' },
      select: {
        mentorId: true,
        startTime: true
      }
    });

    // Map confirmed bookings count by `mentorId_yyyy-MM-dd` in mentor local timezone (Asia/Kolkata)
    const dailyBookingCountMap: Record<string, number> = {};
    for (const b of confirmedBookings) {
      const istDateStr = DateTime.fromJSDate(b.startTime, { zone: 'Asia/Kolkata' }).toFormat('yyyy-MM-dd');
      const key = `${b.mentorId}_${istDateStr}`;
      dailyBookingCountMap[key] = (dailyBookingCountMap[key] || 0) + 1;
    }

    // 3. Filter out open slots for any mentor on an IST day where they already reached maxDailyDemos (2)
    const availableSlots = unbookedSlots.filter(slot => {
      if (!slot.mentor) return true;
      const mentorZone = slot.mentor.timezone || 'Asia/Kolkata';
      const slotISTDateStr = DateTime.fromJSDate(slot.startTime, { zone: mentorZone }).toFormat('yyyy-MM-dd');
      const key = `${slot.mentorId}_${slotISTDateStr}`;
      const count = dailyBookingCountMap[key] || 0;
      return count < slot.mentor.maxDailyDemos;
    });

    const formattedSlots = availableSlots.map(slot => {
      let localStartTimeStr = null;
      let localEndTimeStr = null;

      if (parentTimezone && typeof parentTimezone === 'string') {
        const startLuxon = DateTime.fromJSDate(slot.startTime).setZone(parentTimezone);
        const endLuxon = DateTime.fromJSDate(slot.endTime).setZone(parentTimezone);
        localStartTimeStr = startLuxon.toFormat('EEE, MMM d @ h:mm a (z)');
        localEndTimeStr = endLuxon.toFormat('EEE, MMM d @ h:mm a (z)');
      }

      return {
        ...slot,
        parentLocalStartTime: localStartTimeStr,
        parentLocalEndTime: localEndTimeStr
      };
    });

    res.json(formattedSlots);
  } catch (error: any) {
    console.error('Error fetching slots:', error);
    res.status(500).json({ error: 'Failed to fetch available slots', details: error.message });
  }
});

// GET /api/bookings - Fetch all bookings
app.get('/api/bookings', async (req: Request, res: Response) => {
  try {
    const bookings = await prisma.booking.findMany({
      include: {
        mentor: true,
        parent: true,
        slot: true
      },
      orderBy: { startTime: 'asc' }
    });
    res.json(bookings);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// POST /api/bookings - Core Concurrency-Safe Booking Logic
app.post('/api/bookings', async (req: Request, res: Response) => {
  const { slotId, parentId } = req.body;

  if (!slotId || !parentId) {
    return res.status(400).json({ error: 'slotId and parentId are required.' });
  }

  try {
    // Execute interactive Prisma transaction for atomic concurrency & capacity safety
    const bookingResult = await prisma.$transaction(async (tx) => {
      // 1. Find Slot and associated Mentor
      const slot = await tx.slot.findUnique({
        where: { id: slotId },
        include: { mentor: true }
      });

      if (!slot) {
        throw new Error('SLOT_NOT_FOUND');
      }

      if (slot.isBooked) {
        throw new Error('SLOT_ALREADY_BOOKED');
      }

      const { mentor } = slot;

      // 2. Capacity Check: Calculate mentor's local calendar day using Luxon
      const mentorZone = mentor.timezone || 'Asia/Kolkata';
      const slotStartInMentorZone = DateTime.fromJSDate(slot.startTime, { zone: mentorZone });
      
      const startOfMentorDay = slotStartInMentorZone.startOf('day').toJSDate();
      const endOfMentorDay = slotStartInMentorZone.endOf('day').toJSDate();

      // Count existing bookings for this mentor on their local calendar day
      const existingBookingsCount = await tx.booking.count({
        where: {
          mentorId: mentor.id,
          startTime: {
            gte: startOfMentorDay,
            lte: endOfMentorDay
          },
          status: 'CONFIRMED'
        }
      });

      if (existingBookingsCount >= mentor.maxDailyDemos) {
        throw new Error('MENTOR_MAX_CAPACITY_EXCEEDED');
      }

      // 3. Mark Slot as booked
      await tx.slot.update({
        where: { id: slotId },
        data: { isBooked: true }
      });

      // 4. Create Booking record and mock meeting URL
      const meetingUrl = `https://meet.codeyoung-mock.com/demo-${Math.random().toString(36).substring(2, 9)}`;

      const newBooking = await tx.booking.create({
        data: {
          slotId: slot.id,
          parentId,
          mentorId: mentor.id,
          startTime: slot.startTime,
          endTime: slot.endTime,
          status: 'CONFIRMED'
        },
        include: {
          mentor: true,
          parent: true,
          slot: true
        }
      });

      // 5. Simulate emailing both mentor and parent with live class link (Requirement 3)
      console.log(`\n=================== [NOTIFICATION SERVICE] ===================`);
      console.log(`[EMAIL DISPATCH] To Parent (${newBooking.parent.email}):`);
      console.log(`  Subject: Your Codeyoung Trial Class is Confirmed!`);
      console.log(`  Body: Hi ${newBooking.parent.name}, your demo class with ${newBooking.mentor.name} is scheduled. Join link: ${meetingUrl}`);
      console.log(`[EMAIL DISPATCH] To Mentor (${newBooking.mentor.email}):`);
      console.log(`  Subject: New Trial Class Assigned - ${newBooking.parent.name}`);
      console.log(`  Body: Hi ${newBooking.mentor.name}, you have a trial class assigned with ${newBooking.parent.name}. Join link: ${meetingUrl}`);
      console.log(`===============================================================\n`);

      return {
        ...newBooking,
        meetingUrl,
        emailNotificationsSent: true,
        notificationMessage: `Confirmation emails with live class link dispatched to parent (${newBooking.parent.email}) and mentor (${newBooking.mentor.email}).`
      };
    });

    return res.status(201).json(bookingResult);

  } catch (error: any) {
    console.warn(`Booking failed for slotId ${slotId}: ${error.message}`);

    // Fallback Logic: Query DB for next available slot across any mentor
    let requestedSlotStartTime: Date | undefined;
    try {
      const failedSlot = await prisma.slot.findUnique({ where: { id: slotId } });
      if (failedSlot) {
        requestedSlotStartTime = failedSlot.startTime;
      }
    } catch (_) {}

    const suggestedSlot = await prisma.slot.findFirst({
      where: {
        isBooked: false,
        ...(requestedSlotStartTime ? { startTime: { gte: requestedSlotStartTime } } : {})
      },
      include: { mentor: true },
      orderBy: { startTime: 'asc' }
    });

    let message = 'Failed to process booking.';
    if (error.message === 'SLOT_ALREADY_BOOKED') {
      message = 'This slot has already been booked by another user.';
    } else if (error.message === 'MENTOR_MAX_CAPACITY_EXCEEDED') {
      message = 'This mentor has reached their maximum limit of 2 demo classes for this calendar day.';
    } else if (error.message === 'SLOT_NOT_FOUND') {
      message = 'The requested slot was not found.';
    }

    return res.status(409).json({
      error: message,
      code: error.message,
      suggestedSlot: suggestedSlot || null
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
