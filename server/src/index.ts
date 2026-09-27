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

// In-Memory API Cache to eliminate database network latency for GET requests
const cache = {
  mentors: { data: null as any, timestamp: 0 },
  parents: { data: null as any, timestamp: 0 },
  slots: { data: null as any, timestamp: 0 }
};

const CACHE_TTL = 5000; // 5 seconds cache TTL

function clearCache() {
  cache.mentors.data = null;
  cache.parents.data = null;
  cache.slots.data = null;
}

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

// GET /api/mentors - Fetch list of mentors (Fast Cached)
app.get('/api/mentors', async (req: Request, res: Response) => {
  try {
    const now = Date.now();
    if (cache.mentors.data && (now - cache.mentors.timestamp < CACHE_TTL)) {
      return res.json(cache.mentors.data);
    }

    const mentors = await prisma.mentor.findMany({
      include: {
        _count: {
          select: { bookings: true, slots: true }
        }
      }
    });

    cache.mentors.data = mentors;
    cache.mentors.timestamp = now;
    res.json(mentors);
  } catch (error) {
    console.error('Error fetching mentors:', error);
    res.status(500).json({ error: 'Failed to fetch mentors' });
  }
});

// GET /api/parents - Fetch list of parents (Fast Cached)
app.get('/api/parents', async (req: Request, res: Response) => {
  try {
    const now = Date.now();
    if (cache.parents.data && (now - cache.parents.timestamp < CACHE_TTL)) {
      return res.json(cache.parents.data);
    }

    const parents = await prisma.parent.findMany();

    cache.parents.data = parents;
    cache.parents.timestamp = now;
    res.json(parents);
  } catch (error) {
    console.error('Error fetching parents:', error);
    res.status(500).json({ error: 'Failed to fetch parents' });
  }
});

// GET /api/slots - Fetch available slots with parallel DB queries & fast caching
app.get('/api/slots', async (req: Request, res: Response) => {
  try {
    const { parentTimezone } = req.query;
    const now = Date.now();

    if (cache.slots.data && (now - cache.slots.timestamp < CACHE_TTL) && !parentTimezone) {
      return res.json(cache.slots.data);
    }

    // Parallel DB queries to eliminate round-trip latency
    const [unbookedSlots, confirmedBookings] = await Promise.all([
      prisma.slot.findMany({
        where: { isBooked: false },
        include: { mentor: true },
        orderBy: { startTime: 'asc' }
      }),
      prisma.booking.findMany({
        where: { status: 'CONFIRMED' },
        select: { mentorId: true, startTime: true }
      })
    ]);

    // Map confirmed bookings count by mentorId_yyyy-MM-dd in mentor local timezone (Asia/Kolkata)
    const dailyBookingCountMap: Record<string, number> = {};
    for (const b of confirmedBookings) {
      const istDateStr = DateTime.fromJSDate(b.startTime, { zone: 'Asia/Kolkata' }).toFormat('yyyy-MM-dd');
      const key = `${b.mentorId}_${istDateStr}`;
      dailyBookingCountMap[key] = (dailyBookingCountMap[key] || 0) + 1;
    }

    // Filter out open slots for any mentor on an IST day where maxDailyDemos is reached
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

    if (!parentTimezone) {
      cache.slots.data = formattedSlots;
      cache.slots.timestamp = now;
    }

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

      // Check if parent exists
      const parentRecord = await tx.parent.findUnique({
        where: { id: parentId }
      });
      if (!parentRecord) {
        throw new Error('PARENT_NOT_FOUND');
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

      // 5. Clear API cache upon state mutation
      clearCache();

      // 6. Log mock email notifications & 2 scheduled pre-class email reminders
      console.log(`\n=================== [NOTIFICATION SERVICE] ===================`);
      console.log(`[EMAIL DISPATCH] Instant Confirmation to Parent (${newBooking.parent.email}):`);
      console.log(`  Subject: Your Codeyoung Trial Class is Confirmed!`);
      console.log(`  Body: Hi ${newBooking.parent.name}, your demo class with ${newBooking.mentor.name} is scheduled. Class link: ${meetingUrl}`);
      console.log(`[SCHEDULED REMINDER #1 - 24 Hours Before] To Parent (${newBooking.parent.email}):`);
      console.log(`  Subject: Reminder: Codeyoung Trial Class in 24 Hours!`);
      console.log(`  Body: Hi ${newBooking.parent.name}, your class starts in 24 hours. Classroom link: ${meetingUrl}`);
      console.log(`[SCHEDULED REMINDER #2 - 15 Minutes Before] To Parent (${newBooking.parent.email}):`);
      console.log(`  Subject: Reminder: Codeyoung Trial Class Starts in 15 Minutes!`);
      console.log(`  Body: Hi ${newBooking.parent.name}, your live 1-on-1 demo with ${newBooking.mentor.name} is starting in 15 minutes. Join now: ${meetingUrl}`);
      console.log(`===============================================================\n`);

      return {
        ...newBooking,
        meetingUrl,
        emailNotificationsSent: true,
        remindersScheduled: [
          { type: 'EMAIL_24H', trigger: '24 Hours Before Class', recipient: newBooking.parent.email, meetingUrl },
          { type: 'EMAIL_15M', trigger: '15 Minutes Before Class', recipient: newBooking.parent.email, meetingUrl }
        ],
        notificationMessage: `Instant confirmation email dispatched & 2 pre-class email reminders (24h & 15m before class) scheduled for parent (${newBooking.parent.email}).`
      };
    }, { maxWait: 10000, timeout: 20000 });

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
    } else if (error.message === 'PARENT_NOT_FOUND') {
      message = 'The selected parent profile was not found. Please refresh or re-select a parent persona.';
    }

    return res.status(409).json({
      error: message,
      code: error.message,
      suggestedSlot: suggestedSlot || null
    });
  }
});

// GET /api/parents/:id/bookings - Fetch all bookings for a specific parent
app.get('/api/parents/:id/bookings', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const bookings = await prisma.booking.findMany({
      where: { parentId: id, status: 'CONFIRMED' },
      include: {
        mentor: true,
        slot: true,
        parent: true
      },
      orderBy: { startTime: 'asc' }
    });

    const formattedBookings = bookings.map(b => ({
      ...b,
      meetingUrl: `https://meet.codeyoung-mock.com/demo-${b.id.substring(0, 8)}`
    }));

    res.json(formattedBookings);
  } catch (error) {
    console.error('Error fetching parent bookings:', error);
    res.status(500).json({ error: 'Failed to fetch parent bookings' });
  }
});

// DELETE /api/bookings/:id - Cancel booking and free slot
app.delete('/api/bookings/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const booking = await prisma.booking.findUnique({
      where: { id }
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    await prisma.$transaction([
      prisma.slot.update({
        where: { id: booking.slotId },
        data: { isBooked: false }
      }),
      prisma.booking.delete({
        where: { id }
      })
    ]);

    clearCache();

    res.json({ success: true, message: 'Booking cancelled successfully and slot freed.' });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
