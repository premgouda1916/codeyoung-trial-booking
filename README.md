# Codeyoung Trial Class Appointment Booking System

A full-stack, enterprise-grade trial class appointment booking platform designed for **Codeyoung**. This application enables parents across international time zones (predominantly US and UK) to discover available mentors in India, select convenient time slots, and schedule 1-on-1 demo classes with concurrency protection, dynamic timezone/DST conversions, capacity guardrails, and automated notifications.

---

## 🌟 Key Features & Assignment Requirements

| Requirement | Implementation Details |
| :--- | :--- |
| **10 Mentors Available** | Pre-seeded with 10 Indian mentors (`Asia/Kolkata` base timezone) working flexible slots. |
| **20 Parents daily allocation** | Pre-seeded with 20 parent personas distributed across US Eastern, Central, Pacific, and UK GMT/BST timezones. |
| **Timezone & DST Handling** | All slot timestamps are stored strictly in UTC (ISO 8601). Frontend dynamically renders localized dates/times using IANA timezone identifiers (`America/New_York`, `Europe/London`, `America/Los_Angeles`, `America/Chicago`, `Asia/Kolkata`). **Daylight Savings Time (DST)** offset shifts are automatically computed by Luxon. |
| **Max 2 Demo Classes / Day** | Mentors are strictly capped at **2 demo classes per local calendar day** (`Asia/Kolkata`). Slots are filtered dynamically via API and enforced at the database level during transaction execution. |
| **Dummy Meeting Link Email** | Upon successful booking, a unique live demo meeting URL (`https://meet.codeyoung-mock.com/demo-...`) is generated. Backend dispatches simulated email notifications to **both** parent and mentor. |
| **Concurrency Protection** | Prevents race conditions and double-booking using **Prisma Interactive Database Transactions** (`$transaction`). If two parents click "Book" simultaneously, only one succeeds; the second receives an explicit conflict notice with a suggested alternative slot. |
| **Graceful Error & Fallback State** | If a mentor is fully booked or a slot becomes unavailable, the system automatically suggests the next available slot across all mentors or allows parents to submit a **Custom Slot Request / Waitlist** form. |

---

## 🏗️ Architecture & Tech Stack

### Frontend (`/client`)
- **Framework**: React 18 with TypeScript, Vite
- **Styling**: Vanilla CSS (Responsive Design System, Glassmorphism, Micro-animations, Dark/Light themed accents)
- **Timezone Utilities**: `luxon` (IANA Timezone formatting & DST calculations)
- **Icons**: `lucide-react`

### Backend (`/server`)
- **Runtime**: Node.js, Express with TypeScript
- **Database & ORM**: PostgreSQL with Prisma ORM
- **Concurrency Control**: Prisma Interactive Transactions (`prisma.$transaction`) with atomic checks
- **Time Logic**: `luxon` for server-side calendar-day boundary calculations

---

## 📁 Repository Structure

```
codeyoung-trial-booking/
├── client/                     # React Frontend Application
│   ├── src/
│   │   ├── App.tsx             # Main Application Component (Mentor View, Slot Grid, Custom Requests)
│   │   ├── index.css           # Global Design System & Component Styles
│   │   └── main.tsx            # Vite Entry Point
│   ├── package.json
│   └── vite.config.ts
├── server/                     # Express Backend API
│   ├── prisma/
│   │   ├── schema.prisma       # Database Schema (Mentor, Parent, Slot, Booking)
│   │   └── seed.ts             # Seed script (10 Mentors, 20 Parents, 7-day Slots)
│   ├── src/
│   │   └── index.ts            # Express server, endpoints & concurrency logic
│   └── package.json
├── README.md                   # Project documentation & execution guide
└── TRANSCRIPT.md               # AI pairing session logs & transcript
```

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js**: v18.x or higher
- **npm**: v9.x or higher
- **PostgreSQL Database**: A running PostgreSQL instance (or Neon / Supabase cloud instance)

---

### Step 1: Backend Setup (`/server`)

1. Open a terminal and navigate to the `server` directory:
   ```bash
   cd server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure Environment Variables:
   Create a `.env` file inside `/server`:
   ```env
   PORT=5000
   DATABASE_URL="postgresql://username:password@localhost:5432/codeyoung_booking?schema=public"
   ```

4. Run Database Migrations & Prisma Client Generation:
   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   ```

5. Seed Initial Data (10 Mentors, 20 Parents, 7 Days of Slots):
   ```bash
   npx prisma db seed
   ```

6. Start the Backend Dev Server:
   ```bash
   npm run dev
   ```
   *Server will run at `http://localhost:5000`.*

---

### Step 2: Frontend Setup (`/client`)

1. Open a new terminal window and navigate to the `client` directory:
   ```bash
   cd client
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the Frontend Dev Server:
   ```bash
   npm run dev
   ```
   *Frontend application will be accessible at `http://localhost:5173`.*

---

## 📡 API Endpoints Reference

### `GET /api/health`
Checks server and database connection status.
- **Response**: `{ status: 'ok', mentorsCount: 10, slotsCount: 280 }`

### `GET /api/mentors`
Fetches all 10 mentors with booking counts.

### `GET /api/parents`
Fetches all 20 pre-seeded parents with their default timezones.

### `GET /api/slots?parentTimezone=America/New_York`
Retrieves all available slots. Filters out slots for mentors who have already reached their `maxDailyDemos` (2 per day) limit on their local IST day. Formats start/end timestamps into the specified parent timezone.

### `POST /api/bookings`
Executes concurrency-safe booking within an interactive database transaction.
- **Request Body**:
  ```json
  {
    "slotId": "uuid-slot-id",
    "parentId": "uuid-parent-id"
  }
  ```
- **Success Response (201 Created)**:
  ```json
  {
    "id": "uuid-booking-id",
    "meetingUrl": "https://meet.codeyoung-mock.com/demo-xyz123",
    "emailNotificationsSent": true,
    "notificationMessage": "Confirmation emails with live class link dispatched to parent and mentor.",
    "mentor": { ... },
    "parent": { ... },
    "slot": { ... }
  }
  ```
- **Conflict Response (409 Conflict)**:
  ```json
  {
    "error": "This slot has already been booked by another user.",
    "code": "SLOT_ALREADY_BOOKED",
    "suggestedSlot": { ... }
  }
  ```

---

## 🧪 Testing Edge Cases

1. **Timezone & DST Validation**: Toggle the timezone dropdown in the top header (e.g., switch between *Eastern Time*, *London GMT/BST*, and *Pacific Time*). Notice how slot dates and times convert accurately relative to the mentor's IST calendar day.
2. **Capacity Enforcement**: Book 2 slots for a single mentor on a specific day. Observe that remaining slots for that mentor on that date are automatically removed from availability.
3. **Double Booking / Race Condition Fallback**: Attempt to book an already claimed slot. The backend safely prevents duplicate bookings and returns an alternative suggested slot.
4. **Custom Request / Waitlist**: Click *"Can't Find Your Time? Request Custom Slot"* to open the modal and submit custom time preferences.

---

## 📬 Assignment Submission Info

- **Candidate Submission Email**: `campus.ka@talentiseglobal.com`
- **Deadline**: September 28th, 2026 (Latest by 6:00 PM)
- **Subject Line Format**: `Codeyoung Assignment Task - <Candidate Name> - Institute Name (ABBR)`
- **Required Files**:
  - `README.md` (Project instructions & run guide)
  - `TRANSCRIPT.md` (Full AI prompts and session history)
