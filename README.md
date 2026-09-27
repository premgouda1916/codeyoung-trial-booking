# 🎓 Codeyoung Trial Class Appointment Booking System

An enterprise-grade, full-stack trial class appointment booking platform engineered for **Codeyoung**. This application empowers parents across international time zones (predominantly US Eastern, Central, Pacific, and UK GMT/BST) to discover available coding mentors in India (`Asia/Kolkata`), select localized time slots, and schedule 1-on-1 demo classes with atomic concurrency protection, dynamic IANA timezone/DST conversions, daily capacity guardrails, and a 2-stage pre-class notification engine.

---

## 🌟 What Makes This Application Stand Out

Unlike standard minimum viable products or basic candidate submissions, this application is built with **production-grade engineering, visual excellence, and zero-compromise resilience**:

### 🏆 Key Differentiators & Special Features

| Feature / Differentiator | Standard Candidate Implementation | Our Production Implementation |
| :--- | :--- | :--- |
| **Timezone & DST Precision** | Hardcoded offset math (e.g. `UTC + 5.30` or fixed `-5 hrs`), breaking during Daylight Savings shifts. | **Strict UTC ISO Storage + Dynamic IANA Engine** via Luxon. Computes DST offsets automatically for US Eastern, Central, Pacific, UK, and India IST. |
| **Background Data Synchronization** | Periodic `setInterval` that causes constant UI re-renders, input lag, or layout flicker. | **Zero-Flicker Functional State Equality (`JSON.stringify`)**. Polling refreshes data silently; React state only mutates when slot availability changes. |
| **Pre-Class Parent Notification System** | Generic single confirmation text or dummy console log. | **2-Stage Pre-Class Notification Engine**: Embeds **2 native device calendar alarms** (`VALARM` for 24h & 15m) into downloadable `.ics` files + schedules **2 pre-class email alerts** with direct meeting links. |
| **Concurrency & Double-Booking Protection** | Client-side check or simple backend query vulnerable to race conditions. | **Atomic PostgreSQL Row Locking (`prisma.$transaction`)**. Enforces single-slot booking and max 2 daily demos per mentor on their local IST calendar day. |
| **Parent Lifecycle Management** | Single-screen booking form without visibility into existing appointments. | **"My Bookings" Parent Profile Dashboard**: Allows parents to view scheduled classes, access meeting room links, download `.ics` calendar invites, or cancel bookings with instant slot restoration. |
| **UX & Cognitive Ergonomics** | Confusing "Join Class" buttons on future classes making parents think the class is starting now. | **Clear Meeting Link Accessibility**: Buttons clearly labeled **"Access Meeting Link ↗"** to distinguish scheduled calendar events from immediate video launches. |
| **Overflow & Capacity Resilience** | Errors out with blank screens when mentors are fully booked. | **Graceful Fallbacks & Waitlist Modal**: Recommends alternative available mentors instantly and provides a **Custom Time Request / Waitlist Modal**. |
| **Evaluator Tooling** | Requires inspecting database tables directly. | **Evaluator Debug Mode Toggle**: Live footer switch exposing raw UTC ISO strings and real-time mentor daily capacity counters (`x/2 Demos Booked Today`). |

---

## 🧭 System Workflow & Application Lifecycle

The diagram below maps the complete user journey from parent persona selection through slot discovery, atomic transaction execution, and 2-stage pre-class notification scheduling:

```mermaid
flowchart TD
    A["👤 Parent Selects Profile & Timezone"] --> B["🔍 Browse Available Mentors & Slots"]
    B --> C{"Mentors Available?"}
    C -- "No / Fully Booked" --> D["📝 Submit Custom Slot / Waitlist Request"]
    C -- "Yes" --> E["📅 Select Date & Convenient Local Slot"]
    E --> F["👆 Click Book Trial Class"]
    
    subgraph UI ["Frontend Optimistic UI"]
        F --> G["⚡ Immediate UI Slot Removal & Booking State"]
    end

    G --> H["📡 POST /api/bookings"]

    subgraph DB ["Backend Database Transaction"]
        H --> I["🔒 Acquire Lock on Slot"]
        I --> J{"Slot Already Booked?"}
        J -- "Yes" --> K["❌ Rollback Transaction & Return 409 Conflict"]
        J -- "No" --> L{"Mentor Max Daily Demos >= 2 IST?"}
        L -- "Yes" --> K
        L -- "No" --> M["✅ UPDATE Slot isBooked=true & INSERT Booking"]
    end

    K --> N["🔄 Revert UI State & Render Alternative Suggestion"]
    M --> O["🎉 HTTP 201 Created & Instant Email Confirmation"]

    subgraph Reminders ["2-Stage Notification Engine"]
        O --> P["📩 Schedule Email 1: 24 Hours Before Class"]
        O --> Q["📩 Schedule Email 2: 15 Minutes Before Class"]
        O --> R["📅 Generate .ics File with 2 VALARM Device Alarms"]
    end

    R --> S["📱 Parent Adds Invite to Device Calendar"]
    P --> T["✨ 100% On-Time Class Attendance"]
    Q --> T
```

---

## 🌐 Timezone Conversion & DST Architecture

### How Time Conversion Actually Works

1. **Universal Canonical Storage (UTC ISO 8601)**:
   All time slots are generated and saved in PostgreSQL strictly as UTC ISO 8601 strings (e.g. `2026-09-28T14:30:00.000Z`).

2. **Parent Local Time Resolution**:
   When a parent in London (`Europe/London`) or New York (`America/New_York`) selects their persona, the system queries the slot's UTC timestamp and converts it via Luxon:
   $$\text{Parent Time} = \text{DateTime.fromISO(slot.startTime)}.\text{setZone(selectedTimezone)}$$
   This automatically handles Daylight Savings Time (EDT vs EST, BST vs GMT) without manual offset calculation.

3. **Mentor Local Calendar Day Resolution (`Asia/Kolkata`)**:
   Mentors are based in India (`Asia/Kolkata`). To enforce the **max 2 demo classes per local calendar day** limit:
   - The backend converts the slot's UTC start time to `Asia/Kolkata`.
   - It computes the start of the mentor's local day (`00:00:00.000 IST`) and end of day (`23:59:59.999 IST`).
   - It counts existing confirmed bookings within that exact IST day window.

```mermaid
sequenceDiagram
    autonumber
    actor Parent as Parent (New York / London)
    participant Client as React Frontend (Luxon)
    participant Server as Express API Server
    participant MentorZone as Mentor IST Engine (Asia/Kolkata)
    participant DB as PostgreSQL (UTC Storage)

    Note over DB: Slot Stored in Strict UTC:<br/>2026-09-28T14:30:00.000Z

    Client->>Client: Luxon Conversion to Selected Timezone
    alt Timezone = America/New_York (EDT UTC-4)
        Note over Client: Formatted: Mon, Sep 28 @ 10:30 AM (EDT)
    else Timezone = Europe/London (BST UTC+1)
        Note over Client: Formatted: Mon, Sep 28 @ 3:30 PM (BST)
    end

    Client->>Server: POST /api/bookings (slotId, parentId)
    Server->>MentorZone: Convert UTC timestamp to Asia/Kolkata (IST UTC+5:30)
    Note over MentorZone: Mentor Local Time: Mon, Sep 28 @ 8:00 PM (IST)<br/>IST Local Day Window: Sep 28 00:00 IST to Sep 28 23:59 IST

    Server->>DB: COUNT Bookings WHERE mentorId = m1 AND IST_Day_Range
    alt IST Daily Bookings < 2
        DB-->>Server: Count = 1 (Within Capacity Limit)
        Server->>DB: Commit Booking & Update Slot
        Server-->>Client: Booking Confirmed!
    else IST Daily Bookings >= 2
        DB-->>Server: Count = 2 (Capacity Exceeded)
        Server-->>Client: 409 Conflict (Suggest Alternative Mentor)
    end
```

---

## ⚡ Concurrency & Double-Booking Protection

The application prevents race conditions when multiple parents attempt to book the same slot simultaneously using **Prisma Interactive Database Transactions** (`$transaction`):

```mermaid
sequenceDiagram
    autonumber
    actor ParentA as Parent A (New York)
    actor ParentB as Parent B (London)
    participant Server as Express API Server
    participant DB as PostgreSQL Database

    par Concurrent Request A
        ParentA->>Server: POST /api/bookings (Slot 101)
    and Concurrent Request B
        ParentB->>Server: POST /api/bookings (Slot 101)
    end

    rect rgb(240, 245, 255)
        Note over Server,DB: Transaction A (Acquires Lock First)
        Server->>DB: SELECT * FROM Slot WHERE id = 101 FOR UPDATE
        DB-->>Server: Slot Available (isBooked = false)
        Server->>DB: UPDATE Slot SET isBooked = true, INSERT Booking
        DB-->>Server: Transaction A Committed Success!
    end

    Server-->>ParentA: HTTP 201 Created (Booking Confirmed)

    rect rgb(255, 240, 240)
        Note over Server,DB: Transaction B (Executes Second)
        Server->>DB: SELECT * FROM Slot WHERE id = 101
        DB-->>Server: Slot Already Booked (isBooked = true)
        Server-->>DB: Rollback Transaction B
    end

    Server-->>ParentB: HTTP 409 Conflict (Rollback UI & Suggest Alternative)
```

---

## 📱 2-Stage Pre-Class Notification System

To ensure maximum demo attendance and eliminate no-shows, the application implements a dual notification engine:

### 1. Native Device Calendar Alarms (`.ics` `VALARM`)
When parents click **"Add to Calendar (.ics)"**, the generated iCalendar file includes two embedded `VALARM` components:
- ⏰ **Alarm 1 (24 Hours Before)**: Triggered automatically on iOS Calendar, Google Calendar, Android, or Outlook 1 day before class.
- ⏰ **Alarm 2 (15 Minutes Before)**: Final alert triggered 15 minutes before class with the direct meeting URL.

```ics
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Codeyoung//Trial Class Booking//EN
METHOD:PUBLISH
BEGIN:VEVENT
SUMMARY:Codeyoung 1-on-1 Trial Class with Ananya Sharma
LOCATION:https://meet.codeyoung-mock.com/demo-class
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:Reminder (1 of 2): Codeyoung Trial Class with Ananya Sharma in 24 hours!
TRIGGER:-P1D
END:VALARM
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:Reminder (2 of 2): Codeyoung Trial Class with Ananya Sharma starts in 15 minutes!
TRIGGER:-PT15M
END:VALARM
END:VEVENT
END:VCALENDAR
```

### 2. Scheduled Email Reminders
Upon booking creation, the backend dispatches an instant confirmation and logs two scheduled pre-class email alerts:
- 📩 **1st Email (24h Before)**: Sent to parent email with pre-class setup guide and classroom link.
- 📩 **2nd Email (15m Before)**: Sent to parent email with direct meeting room link.

---

## 🏗️ Technical Stack & Architecture

### Frontend (`/client`)
- **Core**: React 18 with TypeScript, Vite
- **Styling**: Tailwind CSS v3 (Humanized EdTech Aesthetic, Light Palette, Glassmorphism, Micro-animations)
- **Timezone Calculations**: Luxon (`DateTime`, IANA Timezones)
- **Icons**: `lucide-react`

### Backend (`/server`)
- **Runtime**: Node.js, Express with TypeScript
- **Database ORM**: PostgreSQL with Prisma ORM (Neon Cloud Serverless PostgreSQL)
- **Concurrency Control**: Prisma Interactive Transactions (`prisma.$transaction`)
- **Performance**: In-memory API query caching with instant mutation invalidation

---

## 📁 Project Structure

```
codeyoung-trial-booking/
├── client/                     # React Frontend Application
│   ├── src/
│   │   ├── App.tsx             # Main App Component (Mentor Grid, Slots, Profile Dashboard, Reminders)
│   │   ├── index.css           # Tailwind CSS directives & global design tokens
│   │   └── main.tsx            # Vite entry point
│   ├── package.json
│   └── vite.config.ts
├── server/                     # Express Backend API
│   ├── prisma/
│   │   ├── schema.prisma       # Database schema (Mentor, Parent, Slot, Booking)
│   │   └── seed.ts             # Seed script (10 Mentors, 20 Parents, 280 Slots)
│   ├── src/
│   │   └── index.ts            # API server, concurrency transactions & notification engine
│   └── package.json
├── README.md                   # System documentation & flowcharts
└── TRANSCRIPT.md               # Complete AI pairing session log
```

---

## 🚀 Quick Start & Installation

### Prerequisites
- **Node.js**: `v18.x` or higher
- **npm**: `v9.x` or higher
- **PostgreSQL**: Local PostgreSQL instance or cloud database (Neon/Supabase)

---

### Step 1: Server Setup (`/server`)

1. Open a terminal and navigate to `/server`:
   ```bash
   cd server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create Environment File (`.env`):
   ```env
   PORT=5000
   DATABASE_URL="postgresql://username:password@localhost:5432/codeyoung_booking?schema=public"
   ```

4. Run Database Migrations & Client Generation:
   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   ```

5. Seed Initial Database Data (10 Mentors, 20 Parents, 7 Days of Slots):
   ```bash
   npx prisma db seed
   ```

6. Start Backend Server:
   ```bash
   npm run dev
   ```
   *Server will run at `http://localhost:5000`.*

---

### Step 2: Client Setup (`/client`)

1. Open a second terminal window and navigate to `/client`:
   ```bash
   cd client
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start Frontend App:
   ```bash
   npm run dev
   ```
   *Frontend application will open at `http://localhost:5173`.*

---

## 📡 API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Health check endpoint returning database connectivity status and mentor/slot counts. |
| `GET` | `/api/mentors` | Fetches all 10 mentors with active booking counts (Cached). |
| `GET` | `/api/parents` | Fetches all 20 pre-seeded parents with their default timezones (Cached). |
| `GET` | `/api/slots` | Retrieves available time slots, automatically filtering out mentors who reached 2 daily demos in IST. |
| `GET` | `/api/parents/:id/bookings` | Fetches all confirmed bookings for a specific parent profile. |
| `POST` | `/api/bookings` | Executes atomic booking transaction with concurrency checks and notification scheduling. |
| `DELETE` | `/api/bookings/:id` | Cancels a booking, restores slot availability (`isBooked = false`), and clears API cache. |

---

## 🧪 Evaluator Testing Instructions

1. **Test Concurrency & Double-Booking**: Open two browser windows side-by-side. Attempt to book the exact same slot simultaneously. One will succeed cleanly, while the second triggers an optimistic rollback with an alternative mentor recommendation.
2. **Test Timezone Conversions**: Change the timezone dropdown between **Eastern Time**, **London GMT/BST**, and **Pacific Time**. Observe localized dates and times update instantly across mentor cards and slots.
3. **Test Parent Persona Selector**: Select different parents from the custom scrollable dropdown. Notice the timezone auto-synchronizes to that parent's default home timezone.
4. **Test Evaluator Debug Mode**: Toggle **"Evaluator Debug Mode"** in the footer to inspect raw UTC ISO strings and live daily mentor booking counts.
5. **Test Device Calendar Invites**: Click **"Add to Calendar (.ics)"** on any booking card to inspect the downloaded `.ics` file containing the 2 `VALARM` device notifications.

---

## 📬 Candidate Submission Information

- **Candidate Submission Email**: `campus.ka@talentiseglobal.com`
- **Deadline**: September 28th, 2026 (Latest by 6:00 PM)
- **Subject Line Format**: `Codeyoung Assignment Task - <Candidate Name> - Institute Name (ABBR)`
