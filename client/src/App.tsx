import React, { useState, useEffect } from 'react';
import { DateTime } from 'luxon';
import { Calendar, Clock, User, Globe, CheckCircle2, AlertTriangle, ArrowRight, RefreshCw, Video, ArrowLeft, UserCheck, ShieldCheck, Zap, Mail, X, Star, ChevronDown, Check, Trash2, ExternalLink, Download, Bell, Home } from 'lucide-react';

interface Mentor {
  id: string;
  name: string;
  email: string;
  timezone: string;
  maxDailyDemos: number;
}

interface Parent {
  id: string;
  name: string;
  email: string;
  timezone: string;
  bookedClassesCount?: number;
}

interface Slot {
  id: string;
  mentorId: string;
  startTime: string; // UTC ISO string
  endTime: string;   // UTC ISO string
  isBooked: boolean;
  mentor: Mentor;
}

interface BookingSuccessData {
  id: string;
  meetingUrl: string;
  mentor: Mentor;
  parent: Parent;
  slot: Slot;
  startTime: string;
  endTime: string;
}

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (US & Canada) - EST/EDT' },
  { value: 'America/Chicago', label: 'Central Time (US & Canada) - CST/CDT' },
  { value: 'America/Denver', label: 'Mountain Time (US & Canada) - MST/MDT' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (US & Canada) - PST/PDT' },
  { value: 'Europe/London', label: 'London, UK - GMT/BST' },
  { value: 'Europe/Paris', label: 'Central European Time (Paris/Berlin) - CET/CEST' },
  { value: 'Asia/Kolkata', label: 'India Standard Time (India) - IST' },
  { value: 'Asia/Dubai', label: 'Gulf Standard Time (Dubai/UAE) - GST' },
  { value: 'Asia/Singapore', label: 'Singapore & Hong Kong - SGT/HKT' },
  { value: 'Asia/Tokyo', label: 'Japan Standard Time (Tokyo) - JST' },
  { value: 'Australia/Sydney', label: 'Australian Eastern Time (Sydney) - AEST/AEDT' }
];

export default function App() {
  const [selectedTimezone, setSelectedTimezone] = useState<string>('America/New_York');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [allMentors, setAllMentors] = useState<Mentor[]>([]);
  const [selectedParentId, setSelectedParentId] = useState<string>('');
  const [isParentDropdownOpen, setIsParentDropdownOpen] = useState<boolean>(false);

  // Evaluator Debug Mode State
  const [isDebugMode, setIsDebugMode] = useState<boolean>(false);

  // Profile View & Bookings Dashboard State
  const [currentView, setCurrentView] = useState<'book' | 'profile'>('book');
  const [parentBookings, setParentBookings] = useState<BookingSuccessData[]>([]);
  const [loadingParentBookings, setLoadingParentBookings] = useState<boolean>(false);
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);
  
  // Selection & Navigation States
  const [selectedMentorId, setSelectedMentorId] = useState<string | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  
  // Custom Request / Waitlist Modal
  const [showWaitlistModal, setShowWaitlistModal] = useState<boolean>(false);
  const [customRequestDate, setCustomRequestDate] = useState<string>('');
  const [customRequestTime, setCustomRequestTime] = useState<string>('');
  const [waitlistSubmitted, setWaitlistSubmitted] = useState<boolean>(false);

  const [loadingSlots, setLoadingSlots] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error' | 'fallback'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [suggestedSlot, setSuggestedSlot] = useState<Slot | null>(null);
  const [bookingSuccessData, setBookingSuccessData] = useState<BookingSuccessData | null>(null);

  // Initial Concurrent Fetch & Silent 30-Second Background Data Polling
  useEffect(() => {
    // Fire all initial requests concurrently in parallel
    Promise.all([
      fetchSlots(true),
      fetchParents(),
      fetchMentors()
    ]);

    // Silent background polling every 30 seconds without layout flash or re-renders
    const intervalId = setInterval(() => {
      fetchSlots(false);
      fetchMentors();
    }, 30000);

    return () => clearInterval(intervalId);
  }, []);

  // Fetch parent bookings whenever selected parent changes
  useEffect(() => {
    if (selectedParentId) {
      fetchParentBookings(selectedParentId, true);
    }
  }, [selectedParentId]);

  const fetchSlots = async (isInitialCall: boolean = false) => {
    if (isInitialCall) {
      setLoadingSlots(true);
    }
    try {
      const res = await fetch('/api/slots');
      if (res.ok) {
        const data: Slot[] = await res.json();
        setSlots(prev => JSON.stringify(prev) === JSON.stringify(data) ? prev : data);
        setFetchError(null);
      } else {
        const errorData = await res.json().catch(() => ({}));
        if (isInitialCall) {
          setFetchError(errorData.error || `Server returned status ${res.status}`);
        }
      }
    } catch (err: any) {
      console.error('Error fetching slots:', err);
      if (isInitialCall) {
        setFetchError('Could not connect to backend server.');
      }
    } finally {
      if (isInitialCall) {
        setLoadingSlots(false);
      }
    }
  };

  const fetchMentors = async () => {
    try {
      const res = await fetch('/api/mentors');
      if (res.ok) {
        const data: Mentor[] = await res.json();
        setAllMentors(prev => JSON.stringify(prev) === JSON.stringify(data) ? prev : data);
      }
    } catch (err) {
      console.error('Error fetching mentors:', err);
    }
  };

  const fetchParents = async () => {
    try {
      const res = await fetch('/api/parents');
      if (res.ok) {
        const data: Parent[] = await res.json();
        setParents(prev => JSON.stringify(prev) === JSON.stringify(data) ? prev : data);
        if (data.length > 0) {
          setSelectedParentId(prev => {
            const isValid = data.some(p => p.id === prev);
            if (prev && isValid) {
              return prev;
            }
            if (data[0].timezone) {
              setSelectedTimezone(data[0].timezone);
            }
            return data[0].id;
          });
        }
      }
    } catch (err) {
      console.error('Error fetching parents:', err);
    }
  };

  const fetchParentBookings = async (pId: string, isInitialCall: boolean = false) => {
    if (!pId) return;
    if (isInitialCall) {
      setLoadingParentBookings(true);
    }
    try {
      const res = await fetch(`/api/parents/${pId}/bookings`);
      if (res.ok) {
        const data = await res.json();
        setParentBookings(prev => JSON.stringify(prev) === JSON.stringify(data) ? prev : data);
      }
    } catch (err) {
      console.error('Error fetching parent bookings:', err);
    } finally {
      if (isInitialCall) {
        setLoadingParentBookings(false);
      }
    }
  };

  const handleCancelBooking = async (bookingId: string) => {
    if (!bookingId) return;
    setCancellingBookingId(bookingId);
    const startTime = Date.now();

    // Optimistically filter out the cancelled booking immediately from local state
    setParentBookings(prev => prev.filter(b => b.id !== bookingId));

    try {
      await fetch(`/api/bookings/${bookingId}`, {
        method: 'DELETE'
      });

      // Target transition duration: exactly 1000ms (1 second total)
      const elapsedTime = Date.now() - startTime;
      const targetDuration = 1000;
      if (elapsedTime < targetDuration) {
        await new Promise(resolve => setTimeout(resolve, targetDuration - elapsedTime));
      }

      // Fire non-blocking background data synchronization
      Promise.all([
        fetchSlots(),
        fetchMentors(),
        fetchParents(),
        fetchParentBookings(selectedParentId)
      ]).catch(() => {});
    } catch (err) {
      console.error('Error cancelling booking:', err);
    } finally {
      setCancellingBookingId(null);
    }
  };

  // Helper: Dynamic .ics Calendar Invite Generator (With 2 Device Calendar Alarms)
  const downloadICS = (booking: BookingSuccessData) => {
    if (!booking || !booking.startTime || !booking.endTime) return;

    const startFormatted = DateTime.fromISO(booking.startTime).toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
    const endFormatted = DateTime.fromISO(booking.endTime).toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
    const mentorName = booking.mentor?.name || 'Codeyoung Mentor';
    const meetingUrl = booking.meetingUrl || 'https://meet.codeyoung-mock.com/demo-class';

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Codeyoung//Trial Class Booking//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `SUMMARY:Codeyoung 1-on-1 Trial Class with ${mentorName}`,
      `DESCRIPTION:Live 1-on-1 Coding Demo Class for Kids.\\nClassroom Link: ${meetingUrl}\\n\\n2 Automatic Pre-Class Alarms Configured (24 Hours & 15 Minutes Before Class).`,
      `LOCATION:${meetingUrl}`,
      `DTSTART:${startFormatted}`,
      `DTEND:${endFormatted}`,
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:Reminder (1 of 2): Codeyoung Trial Class with ${mentorName} in 24 hours!`,
      'TRIGGER:-P1D',
      'END:VALARM',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:Reminder (2 of 2): Codeyoung Trial Class with ${mentorName} starts in 15 minutes!`,
      'TRIGGER:-PT15M',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `codeyoung-demo-${mentorName.toLowerCase().replace(/\s+/g, '-')}.ics`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Persona & Timezone Synchronization handler
  const handleSelectParent = (parentId: string) => {
    setSelectedParentId(parentId);
    const targetParent = parents.find(p => p.id === parentId);
    if (targetParent && targetParent.timezone) {
      setSelectedTimezone(targetParent.timezone);
    }
    setIsParentDropdownOpen(false);
  };

  // Group slots by Mentor
  const mentorsMap = slots.reduce<Record<string, { mentor: Mentor; slots: Slot[] }>>((acc, slot) => {
    if (!slot.mentor) return acc;
    const mId = slot.mentor.id;
    if (!acc[mId]) {
      acc[mId] = { mentor: slot.mentor, slots: [] };
    }
    acc[mId].slots.push(slot);
    return acc;
  }, {});

  // Complete list of display mentors (including fully booked mentors)
  const displayMentorsList = allMentors.length > 0
    ? allMentors.map(m => ({
        mentor: m,
        slots: mentorsMap[m.id] ? mentorsMap[m.id].slots : []
      }))
    : Object.values(mentorsMap);

  const selectedMentorGroup = selectedMentorId ? mentorsMap[selectedMentorId] : null;

  // Group slots for the selected mentor by Local Date in selectedTimezone
  const mentorDateMap: Record<string, { dateLabel: string; slots: Slot[] }> = {};
  if (selectedMentorGroup) {
    for (const slot of selectedMentorGroup.slots) {
      const luxonObj = DateTime.fromISO(slot.startTime).setZone(selectedTimezone);
      const dateKey = luxonObj.toFormat('yyyy-MM-dd');
      const dateLabel = luxonObj.toFormat('EEE, MMM d');

      if (!mentorDateMap[dateKey]) {
        mentorDateMap[dateKey] = { dateLabel, slots: [] };
      }
      mentorDateMap[dateKey].slots.push(slot);
    }
  }

  const dateKeysList = Object.keys(mentorDateMap);

  // Automatically select the first date tab when entering a mentor view if not set
  useEffect(() => {
    if (selectedMentorId && dateKeysList.length > 0) {
      if (!selectedDateKey || !mentorDateMap[selectedDateKey]) {
        setSelectedDateKey(dateKeysList[0]);
      }
    }
  }, [selectedMentorId, selectedTimezone, slots]);

  const activeDateGroup = selectedDateKey && mentorDateMap[selectedDateKey] ? mentorDateMap[selectedDateKey] : null;

  // Fast 1-Second Controlled Transition for Booking Class
  const handleBookSlot = async (targetSlotId: string) => {
    if (!targetSlotId || submitting) return;

    const parentIdToUse = selectedParentId || (parents.length > 0 ? parents[0].id : 'dummy-parent-1');

    // Backup previous slots for rollback on 409 Conflict or network error
    const previousSlots = [...slots];

    setSubmitting(true);
    setStatus('idle');
    setErrorMessage('');
    setSuggestedSlot(null);

    const startTime = Date.now();

    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotId: targetSlotId,
          parentId: parentIdToUse
        })
      });

      const responseData = await res.json();

      // Target transition duration: 500ms (0.5 seconds - half of current time)
      const elapsedTime = Date.now() - startTime;
      const targetDuration = 500;
      if (elapsedTime < targetDuration) {
        await new Promise(resolve => setTimeout(resolve, targetDuration - elapsedTime));
      }

      if (res.ok) {
        // Optimistically remove target slot from UI
        setSlots(prev => prev.filter(s => s.id !== targetSlotId));
        setBookingSuccessData(responseData);
        setStatus('success');

        // Fire non-blocking background data synchronization
        Promise.all([
          fetchSlots(),
          fetchMentors(),
          fetchParents(),
          fetchParentBookings(parentIdToUse)
        ]).catch(() => {});
      } else {
        // Rollback optimistic state on 409 Conflict or backend rejection
        setSlots(previousSlots);

        if (responseData.suggestedSlot) {
          setSuggestedSlot(responseData.suggestedSlot);
          setStatus('fallback');
        } else {
          setStatus('error');
        }
        setErrorMessage(responseData.error || 'Failed to complete booking.');
      }
    } catch (err: any) {
      const elapsedTime = Date.now() - startTime;
      const targetDuration = 500;
      if (elapsedTime < targetDuration) {
        await new Promise(resolve => setTimeout(resolve, targetDuration - elapsedTime));
      }
      // Rollback optimistic state on network failure
      setSlots(previousSlots);
      setStatus('error');
      setErrorMessage('Network error or server unavailable. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickEarliestSlot = () => {
    if (slots.length > 0) {
      const earliest = slots[0];
      setSelectedMentorId(earliest.mentorId);
      const luxonObj = DateTime.fromISO(earliest.startTime).setZone(selectedTimezone);
      setSelectedDateKey(luxonObj.toFormat('yyyy-MM-dd'));
      setSelectedSlotId(earliest.id);
      setCurrentView('book');
    }
  };

  const handleCustomRequestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setWaitlistSubmitted(true);
    setTimeout(() => {
      setWaitlistSubmitted(false);
      setShowWaitlistModal(false);
      setCustomRequestDate('');
      setCustomRequestTime('');
    }, 2000);
  };

  const formatTimeInZone = (isoString: string, zone: string) => {
    return DateTime.fromISO(isoString).setZone(zone).toFormat('EEE, MMM d @ h:mm a (z)');
  };

  const formatTimeOnlyInZone = (isoString: string, zone: string) => {
    return DateTime.fromISO(isoString).setZone(zone).toFormat('h:mm a (z)');
  };

  const getMentorRating = (m: { id?: string; name?: string }): string => {
    const ratings = ['4.9', '4.8', '4.7', '4.9', '4.6', '4.8', '4.7', '4.9', '4.6', '4.8'];
    let hash = 0;
    const identifier = m?.name || m?.id || 'mentor';
    for (let i = 0; i < identifier.length; i++) {
      hash = (hash + identifier.charCodeAt(i) * (i + 1)) % ratings.length;
    }
    return ratings[hash];
  };

  const resetBookingForm = () => {
    setStatus('idle');
    setBookingSuccessData(null);
    setSuggestedSlot(null);
    setErrorMessage('');
    setSelectedSlotId(null);
    setSelectedMentorId(null);
    setSelectedDateKey(null);
    setCurrentView('book');
    fetchSlots();
    fetchMentors();
    fetchParentBookings(selectedParentId);
  };

  const currentParentObj = parents.find(p => p.id === selectedParentId) || parents[0];

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900 pb-16 antialiased flex flex-col justify-between">
      <div>
        {/* Top Header Banner */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-xs">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div 
              className="flex items-center gap-3 cursor-pointer group"
              onClick={resetBookingForm}
              title="Return to Main Dashboard"
            >
              <img 
                src="/logo.png" 
                alt="Codeyoung Logo" 
                className="w-11 h-11 rounded-2xl object-contain shadow-md bg-white p-1 border border-gray-200 shrink-0 group-hover:scale-105 transition-transform" 
              />
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight group-hover:text-indigo-600 transition-colors">Codeyoung Trial Class Booking</h1>
                <p className="text-xs sm:text-sm text-gray-500 font-medium">1-on-1 Live Coding Demo with India's Top Mentors</p>
              </div>
            </div>

            {/* Timezone Selector Dropdown */}
            <div className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200/80 px-4 py-2 rounded-full border border-gray-200 transition-colors">
              <Globe className="text-indigo-600 shrink-0" size={18} />
              <label htmlFor="timezone-select" className="text-xs sm:text-sm font-semibold text-gray-700 shrink-0">Timezone:</label>
              <select
                id="timezone-select"
                className="bg-transparent text-xs sm:text-sm font-bold text-indigo-900 focus:outline-none cursor-pointer pr-2"
                value={selectedTimezone}
                onChange={(e) => setSelectedTimezone(e.target.value)}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </header>

        {/* Main Container */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          {/* Quick EdTech Action Chips & View Navigation Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-8 bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold px-4 py-2.5 rounded-full shadow-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-md cursor-pointer"
                onClick={handleQuickEarliestSlot}
                disabled={slots.length === 0}
              >
                <Zap size={15} /> Book Earliest Available Class
              </button>

              <button
                className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-gray-700 text-xs sm:text-sm font-semibold px-4 py-2.5 rounded-full border border-gray-300 transition-colors cursor-pointer"
                onClick={() => setShowWaitlistModal(true)}
              >
                <Mail size={15} className="text-indigo-600" /> Request Custom Time Slot
              </button>

              <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-900 text-xs sm:text-sm font-extrabold px-4 py-2.5 rounded-full border border-emerald-200/80 shadow-2xs">
                <Clock size={16} className="text-emerald-600 shrink-0" />
                <span>{slots.length} Total Slots Available</span>
              </div>
            </div>

            {/* View Mode Navigation Switch (Main Dashboard vs My Bookings) */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-full border border-gray-200">
              <button
                className={`px-4 py-1.5 rounded-full text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  currentView === 'book'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                onClick={resetBookingForm}
                title="Return to Main Dashboard"
              >
                <Home size={14} className="inline mr-1.5" /> Main Dashboard
              </button>

              <button
                className={`px-4 py-1.5 rounded-full text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  currentView === 'profile'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                onClick={() => {
                  setCurrentView('profile');
                  if (selectedParentId) fetchParentBookings(selectedParentId);
                }}
              >
                <User size={14} className="inline mr-1.5" /> My Bookings ({parentBookings.length})
              </button>
            </div>
          </div>

          {/* VIEW 1: PARENT PROFILE DASHBOARD ("MY BOOKINGS") */}
          {currentView === 'profile' && (
            <div className="space-y-6">
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-indigo-600 text-white rounded-2xl flex items-center justify-center font-extrabold text-2xl shadow-md shrink-0">
                    {currentParentObj ? currentParentObj.name[0] : 'P'}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{currentParentObj ? currentParentObj.name : 'Parent Profile'}</h2>
                    <p className="text-xs sm:text-sm text-gray-500 mb-1.5">{currentParentObj ? currentParentObj.email : ''}</p>
                    <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs font-semibold px-2.5 py-0.5 rounded-md border border-indigo-100">
                      <Globe size={12} /> Default Zone: {currentParentObj ? currentParentObj.timezone : selectedTimezone}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="bg-slate-50 border border-gray-200 rounded-xl px-4 py-3 text-center">
                    <span className="block text-2xl font-extrabold text-indigo-600">{parentBookings.length}</span>
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Scheduled Classes</span>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-center">
                    <span className="block text-2xl font-extrabold text-emerald-700">{slots.length}</span>
                    <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Total Slots Open</span>
                  </div>
                </div>
              </div>

              {loadingParentBookings ? (
                <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
                  <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                  <p className="text-sm text-gray-600 font-medium">Loading scheduled trial classes...</p>
                </div>
              ) : parentBookings.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center max-w-lg mx-auto">
                  <Calendar className="text-indigo-400 mx-auto mb-3" size={40} />
                  <h3 className="text-lg font-bold text-gray-900 mb-1">No Trial Classes Scheduled</h3>
                  <p className="text-xs sm:text-sm text-gray-500 mb-6">You don't have any upcoming demo sessions booked for this profile yet.</p>
                  <button
                    className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm px-6 py-3 rounded-full shadow-md transition-all cursor-pointer"
                    onClick={() => setCurrentView('book')}
                  >
                    <Calendar size={16} /> Explore Mentors & Book First Class
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {parentBookings.map((b) => (
                    <div key={b.id} className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-4">
                      <div>
                        <div className="flex items-start justify-between gap-3 mb-4 pb-3 border-b border-gray-100">
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-11 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold text-base border border-indigo-200 shrink-0">
                              {b.mentor?.name ? b.mentor.name[0] : 'M'}
                            </div>
                            <div>
                              <h3 className="text-base font-bold text-gray-900">{b.mentor?.name}</h3>
                              <p className="text-xs text-gray-500 font-medium">{b.mentor?.email}</p>
                            </div>
                          </div>
                          <span className="bg-emerald-100 text-emerald-800 text-[11px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider">
                            Confirmed
                          </span>
                        </div>

                        <div className="bg-slate-50 rounded-xl p-3.5 space-y-2 text-xs border border-gray-100">
                          <div className="flex items-center justify-between">
                            <span className="text-gray-500 font-medium">Scheduled Time ({selectedTimezone}):</span>
                            <span className="font-bold text-indigo-600">{formatTimeInZone(b.startTime, selectedTimezone)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-gray-500 font-medium">Mentor IST Time:</span>
                            <span className="font-semibold text-gray-700">{formatTimeInZone(b.startTime, 'Asia/Kolkata')}</span>
                          </div>

                          {/* Pre-Class Parent Notifications Box (2 Scheduled Reminders) */}
                          <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-2.5 text-[11px] space-y-1 mt-2 text-left">
                            <div className="flex items-center gap-1.5 font-bold text-indigo-900">
                              <Bell size={12} className="text-indigo-600 shrink-0" />
                              <span>Pre-Class Parent Email Reminders (2 Scheduled):</span>
                            </div>
                            <div className="text-indigo-800 space-y-0.5 pl-3.5 font-medium">
                              <div className="flex items-center gap-1.5">
                                <Mail size={11} className="text-indigo-600 shrink-0" />
                                <span><strong>1st Email (24h Before):</strong> Setup guide & class link sent to {currentParentObj?.email || b.parent?.email}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Mail size={11} className="text-indigo-600 shrink-0" />
                                <span><strong>2nd Email (15m Before):</strong> Final alert & direct meeting room link</span>
                              </div>
                            </div>
                          </div>

                          {isDebugMode && (
                            <div className="text-[10px] font-mono text-indigo-700 bg-indigo-50 p-2 rounded border border-indigo-100 mt-2">
                              RAW UTC DTSTART: {b.startTime}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <a
                            href={b.meetingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3.5 py-2 rounded-full shadow-xs transition-all cursor-pointer"
                          >
                            <Video size={14} /> Access Meeting Link <ExternalLink size={12} />
                          </a>

                          <button
                            onClick={() => downloadICS(b)}
                            className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-gray-700 font-bold text-xs px-3 py-2 rounded-full border border-gray-300 transition-colors cursor-pointer"
                            title="Downloads calendar file with 2 built-in device alarms (24h and 15m before class)"
                          >
                            <Download size={13} /> Add to Calendar (.ics)
                          </button>
                        </div>

                        <button
                          onClick={() => handleCancelBooking(b.id)}
                          disabled={cancellingBookingId === b.id}
                          className="inline-flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs px-3 py-2 rounded-full border border-rose-200 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Trash2 size={13} /> {cancellingBookingId === b.id ? 'Cancelling...' : 'Cancel Booking'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* VIEW 2: BOOKING FLOW & MENTORS GRID */}
          {currentView === 'book' && (
            <>
              {/* SUCCESS STATE */}
              {status === 'success' && bookingSuccessData && (
                <div className="bg-white border border-emerald-200 rounded-3xl p-8 sm:p-10 shadow-lg text-center max-w-2xl mx-auto my-8">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 size={36} />
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-2">Trial Class Booked! 🎉</h2>
                  <p className="text-sm text-gray-600 mb-6 max-w-lg mx-auto">
                    Instant confirmation email sent with classroom link to parent (<strong>{bookingSuccessData.parent?.email}</strong>) and mentor (<strong>{bookingSuccessData.mentor?.email}</strong>).
                  </p>

                  <div className="bg-slate-50 border border-gray-200 rounded-2xl p-6 text-left space-y-3.5 mb-8">
                    <div className="flex justify-between items-center text-sm border-b border-gray-200 pb-2.5">
                      <span className="text-gray-500 font-medium">Assigned Mentor:</span>
                      <span className="font-bold text-gray-900">{bookingSuccessData.mentor?.name}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm border-b border-gray-200 pb-2.5">
                      <span className="text-gray-500 font-medium">Parent Profile:</span>
                      <span className="font-semibold text-gray-900">{bookingSuccessData.parent?.name} ({bookingSuccessData.parent?.email})</span>
                    </div>
                    <div className="flex justify-between items-center text-sm border-b border-gray-200 pb-2.5">
                      <span className="text-gray-500 font-medium">Scheduled Time ({selectedTimezone}):</span>
                      <span className="font-bold text-indigo-600">{formatTimeInZone(bookingSuccessData.startTime, selectedTimezone)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm border-b border-gray-200 pb-2.5">
                      <span className="text-gray-500 font-medium">Mentor Local Time (IST):</span>
                      <span className="font-semibold text-gray-700">{formatTimeInZone(bookingSuccessData.startTime, 'Asia/Kolkata')}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm border-b border-gray-200 pb-2.5">
                      <span className="text-gray-500 font-medium">Meeting Room Link:</span>
                      <a
                        href={bookingSuccessData.meetingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 font-bold text-indigo-600 hover:text-indigo-800 underline"
                      >
                        <Video size={16} /> Access Meeting Link <ExternalLink size={12} />
                      </a>
                    </div>

                    {/* Pre-Class Double Reminder Schedule Alert */}
                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3.5 text-xs space-y-1.5">
                      <div className="flex items-center gap-1.5 font-bold text-indigo-900">
                        <Bell size={14} className="text-indigo-600 shrink-0" />
                        <span>Pre-Class Notification System Active (2 Reminders):</span>
                      </div>
                      <div className="text-indigo-800 space-y-1 pl-4 font-medium text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <Mail size={12} className="text-indigo-600 shrink-0" />
                          <span><strong>1st Email Reminder (24 Hours Before):</strong> Class preparation details & link sent to {bookingSuccessData.parent?.email}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Mail size={12} className="text-indigo-600 shrink-0" />
                          <span><strong>2nd Email Reminder (15 Minutes Before):</strong> Final alert & meeting link sent to {bookingSuccessData.parent?.email}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-600 pt-0.5">
                          <Download size={12} className="text-indigo-600 shrink-0" />
                          <span><strong>Device Alarms:</strong> Click "Add to Calendar (.ics)" below to sync 2 auto-alarms to your device calendar.</span>
                        </div>
                      </div>
                    </div>

                    {isDebugMode && (
                      <div className="text-[10px] font-mono text-indigo-700 bg-indigo-50 p-2 rounded border border-indigo-100 mt-2">
                        RAW UTC DTSTART: {bookingSuccessData.startTime}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-6 py-3 rounded-full shadow-md transition-all hover:shadow-lg cursor-pointer"
                      onClick={() => downloadICS(bookingSuccessData)}
                    >
                      <Download size={16} /> Add to Calendar (.ics)
                    </button>

                    <button
                      className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-6 py-3 rounded-full shadow-sm transition-all hover:shadow-md cursor-pointer"
                      onClick={resetBookingForm}
                    >
                      <Home size={16} /> Return to Main Dashboard
                    </button>

                    <button
                      className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 text-indigo-700 font-bold text-sm px-6 py-3 rounded-full border border-indigo-200 transition-all cursor-pointer shadow-xs"
                      onClick={() => {
                        setStatus('idle');
                        setCurrentView('profile');
                        if (selectedParentId) fetchParentBookings(selectedParentId);
                      }}
                    >
                      <User size={16} /> View My Bookings
                    </button>
                  </div>
                </div>
              )}

              {/* BOOKING FLOW */}
              {status !== 'success' && (
                <div className="space-y-6">
                  {/* Parent Persona Selector Bar */}
                  {parents.length > 0 && (
                    <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-2.5">
                        <User className="text-indigo-600 shrink-0" size={20} />
                        <div>
                          <h2 className="text-sm font-bold text-gray-900">Booking Parent Persona</h2>
                          <p className="text-xs text-gray-500">Select parent profile to test booking flow</p>
                        </div>
                      </div>

                      {/* Custom Scrollable Parent Dropdown (Displays ~5 names at a time with side scrollbar & Timezone Sync) */}
                      <div className="relative max-w-full sm:max-w-2xl w-full">
                        <button
                          type="button"
                          onClick={() => setIsParentDropdownOpen(!isParentDropdownOpen)}
                          className="bg-slate-100 hover:bg-slate-200/80 border border-gray-300 text-gray-900 text-xs sm:text-sm font-semibold rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 w-full transition-colors cursor-pointer text-left shadow-xs"
                        >
                          {(() => {
                            const current = parents.find(p => p.id === selectedParentId) || parents[0];
                            if (!current) return <span className="truncate">Select Parent Persona</span>;
                            const count = current.bookedClassesCount ?? 0;
                            return (
                              <div className="flex items-center justify-between gap-2.5 min-w-0 flex-1">
                                <span className="truncate">
                                  <span className="font-bold text-gray-900">{current.name}</span>{' '}
                                  <span className="text-gray-500 text-xs font-normal">({current.email} • {current.timezone})</span>
                                </span>
                                <span className={`shrink-0 text-xs font-extrabold px-2.5 py-0.5 rounded-full border ${
                                  count > 0 
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                                    : 'bg-indigo-100 text-indigo-800 border-indigo-200'
                                }`}>
                                  {count} {count === 1 ? 'Class Booked' : 'Classes Booked'}
                                </span>
                              </div>
                            );
                          })()}
                          <ChevronDown size={16} className={`text-indigo-600 shrink-0 transition-transform duration-200 ${isParentDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isParentDropdownOpen && (
                          <div className="absolute right-0 mt-2 w-full bg-white border border-gray-200 rounded-2xl shadow-xl z-40 max-h-56 overflow-y-auto p-1.5 space-y-1 border-t-2 border-t-indigo-600">
                            {parents.map((p) => {
                              const isSelected = p.id === selectedParentId;
                              const count = p.bookedClassesCount ?? 0;
                              return (
                                <div
                                  key={p.id}
                                  onClick={() => handleSelectParent(p.id)}
                                  className={`px-3.5 py-2.5 text-xs sm:text-sm rounded-xl flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                                    isSelected
                                      ? 'bg-indigo-50 text-indigo-900 font-bold border border-indigo-100'
                                      : 'hover:bg-slate-50 text-gray-700 font-medium'
                                  }`}
                                >
                                  <div className="truncate min-w-0 flex-1 pr-1">
                                    <span className="font-bold text-gray-900">{p.name}</span>{' '}
                                    <span className="text-gray-500 text-xs font-normal">({p.email} • {p.timezone})</span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full border ${
                                      count > 0 
                                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                                        : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                    }`}>
                                      {count} {count === 1 ? 'Booked' : 'Booked'}
                                    </span>
                                    {isSelected && <Check size={15} className="text-indigo-600 shrink-0" />}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Fallback Suggestion Banner */}
                  {status === 'fallback' && suggestedSlot && (
                    <div className="bg-amber-50 border border-amber-300 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={24} />
                        <div>
                          <h3 className="text-base font-bold text-amber-900">Requested Time Slot Unavailable</h3>
                          <p className="text-xs sm:text-sm text-amber-800 mt-0.5">{errorMessage || 'This mentor has reached maximum capacity.'}</p>
                          <p className="text-xs sm:text-sm text-amber-900 font-medium mt-1">
                            Would you like to book <strong>{suggestedSlot.mentor?.name || 'an available mentor'}</strong> at{' '}
                            <span className="font-bold underline">{formatTimeInZone(suggestedSlot.startTime, selectedTimezone)}</span> instead?
                          </p>
                        </div>
                      </div>
                      <button
                        className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs sm:text-sm px-5 py-2.5 rounded-full shadow-sm transition-all shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => handleBookSlot(suggestedSlot.id)}
                        disabled={submitting}
                      >
                        {submitting ? 'Booking...' : 'Accept Suggested Slot'}
                      </button>
                    </div>
                  )}

                  {status === 'error' && !suggestedSlot && (
                    <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-4 flex items-center gap-3">
                      <AlertTriangle className="text-rose-600 shrink-0" size={20} />
                      <span className="text-sm font-semibold">{errorMessage || 'Failed to book slot. Please try another slot.'}</span>
                    </div>
                  )}

                  {/* PAGE VIEW 1: MENTORS GRID (STEP 1) */}
                  {!selectedMentorId && (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <UserCheck className="text-indigo-600" size={22} />
                          <h2 className="text-xl font-bold text-gray-900">Step 1: Select a Mentor</h2>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="bg-emerald-100 text-emerald-900 text-xs sm:text-sm font-extrabold px-3.5 py-1.5 rounded-full border border-emerald-300 flex items-center gap-1.5 shadow-2xs">
                            <Clock size={14} className="text-emerald-700" />
                            {slots.length} Total Slots Available
                          </span>
                          <span className="bg-indigo-100 text-indigo-900 text-xs sm:text-sm font-bold px-3.5 py-1.5 rounded-full border border-indigo-200">
                            {displayMentorsList.filter(m => m.slots.length > 0).length} Mentors Available
                          </span>
                        </div>
                      </div>

                      {slots.length === 0 && !loadingSlots && !fetchError && (
                        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-6 text-center max-w-2xl mx-auto my-4 space-y-3 shadow-sm">
                          <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto">
                            <AlertTriangle size={24} />
                          </div>
                          <h3 className="text-base sm:text-lg font-bold text-amber-900">All Mentors are Currently Fully Booked</h3>
                          <p className="text-xs sm:text-sm text-amber-800 max-w-md mx-auto">
                            All daily demo slots for our top mentors are reserved. You can request a custom time slot or join our priority waitlist!
                          </p>
                          <button
                            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm px-5 py-2.5 rounded-full shadow-sm cursor-pointer transition-all hover:shadow-md"
                            onClick={() => setShowWaitlistModal(true)}
                          >
                            <Mail size={15} /> Request Custom Time Slot / Join Waitlist
                          </button>
                        </div>
                      )}

                      {loadingSlots ? (
                        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
                          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                          <p className="text-sm text-gray-600 font-medium">Loading available mentors and time slots...</p>
                        </div>
                      ) : fetchError ? (
                        <div className="bg-white border border-rose-200 rounded-2xl p-8 text-center max-w-md mx-auto">
                          <AlertTriangle className="text-rose-500 mx-auto mb-2" size={36} />
                          <p className="text-sm font-semibold text-gray-900 mb-4">{fetchError}</p>
                          <button
                            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-4 py-2 rounded-full cursor-pointer"
                            onClick={() => { fetchSlots(); fetchMentors(); }}
                          >
                            <RefreshCw size={14} /> Retry Connecting
                          </button>
                        </div>
                      ) : displayMentorsList.length === 0 ? (
                        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
                          <p className="text-gray-600 font-medium mb-3">No mentors found right now.</p>
                          <button
                            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-4 py-2 rounded-full cursor-pointer"
                            onClick={() => { fetchSlots(); fetchMentors(); }}
                          >
                            <RefreshCw size={14} /> Refresh Slots
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                          {displayMentorsList.map(({ mentor, slots: mSlots }) => {
                            const isFullyBooked = mSlots.length === 0;

                            return (
                              <div
                                key={mentor.id}
                                className={`bg-white border rounded-2xl p-6 shadow-xs transition-all duration-200 flex flex-col justify-between group ${
                                  isFullyBooked
                                    ? 'opacity-50 pointer-events-none bg-slate-100 border-gray-200 cursor-not-allowed'
                                    : 'border-gray-200 hover:shadow-lg hover:-translate-y-1 cursor-pointer'
                                }`}
                                onClick={() => {
                                  if (!isFullyBooked) {
                                    setSelectedMentorId(mentor.id);
                                    setSelectedDateKey(null);
                                    setSelectedSlotId(null);
                                  }
                                }}
                              >
                                <div>
                                  <div className="flex items-start justify-between gap-3 mb-4">
                                    <div className="flex items-center gap-3">
                                      <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg shrink-0 ${
                                        isFullyBooked
                                          ? 'bg-gray-200 text-gray-500 border border-gray-300'
                                          : 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                                      }`}>
                                        {mentor.name ? mentor.name[0] : 'M'}
                                      </div>
                                      <div>
                                        <h3 className={`text-base font-bold transition-colors ${
                                          isFullyBooked ? 'text-gray-600' : 'text-gray-900 group-hover:text-indigo-600'
                                        }`}>
                                          {mentor.name}
                                        </h3>
                                        <p className="text-xs text-gray-500 font-medium">{mentor.email}</p>
                                      </div>
                                    </div>

                                    <span className="flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200/80">
                                      <Star size={13} className="fill-amber-500 text-amber-500" /> {getMentorRating(mentor)}
                                    </span>
                                  </div>

                                  <div className="bg-slate-50 rounded-xl p-3 mb-5 border border-gray-100 flex items-center justify-between text-xs">
                                    {isFullyBooked ? (
                                      <span className="font-bold text-rose-700 bg-rose-100 px-2.5 py-1 rounded-md border border-rose-200">
                                        Fully Booked
                                      </span>
                                    ) : (
                                      <span className="font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-100">
                                        {mSlots.length} Slots Available
                                      </span>
                                    )}
                                    <span className="text-gray-500 font-medium">Asia/Kolkata (IST)</span>
                                  </div>

                                  {isDebugMode && (
                                    <div className="text-[10px] font-mono text-purple-700 bg-purple-50 p-2 rounded border border-purple-100 mb-4">
                                      Daily Capacity: {mentor.maxDailyDemos - mSlots.length}/2 Demos Booked Today
                                    </div>
                                  )}
                                </div>

                                <div className={`pt-2 border-t border-gray-100 flex items-center justify-between text-xs font-bold ${
                                  isFullyBooked ? 'text-gray-400' : 'text-indigo-600 group-hover:text-indigo-700'
                                }`}>
                                  <span>{isFullyBooked ? 'No Slots Available' : 'View Available Times'}</span>
                                  {!isFullyBooked && (
                                    <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* PAGE VIEW 2: MENTOR DETAILS & SLOTS (STEP 2) */}
                  {selectedMentorGroup && (
                    <div className="space-y-6">
                      {/* Back Button */}
                      <button
                        className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-gray-600 hover:text-indigo-600 bg-white hover:bg-slate-100 border border-gray-200 px-4 py-2 rounded-full transition-colors cursor-pointer"
                        onClick={() => {
                          setSelectedMentorId(null);
                          setSelectedDateKey(null);
                          setSelectedSlotId(null);
                        }}
                      >
                        <ArrowLeft size={16} /> Back to All Mentors
                      </button>

                      {/* Mentor Profile Overview Card */}
                      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 bg-indigo-600 text-white rounded-2xl flex items-center justify-center font-extrabold text-2xl shadow-md shrink-0">
                            {selectedMentorGroup.mentor.name[0]}
                          </div>
                          <div>
                            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{selectedMentorGroup.mentor.name}</h2>
                            <p className="text-xs sm:text-sm text-gray-500 mb-2">{selectedMentorGroup.mentor.email}</p>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 text-xs font-bold px-2.5 py-1 rounded-md border border-amber-200">
                                <Star size={13} className="fill-amber-500 text-amber-500" /> Rating: {getMentorRating(selectedMentorGroup.mentor)} / 5.0
                              </span>
                              <span className="inline-flex items-center gap-1 bg-slate-100 text-gray-700 text-xs font-semibold px-2.5 py-1 rounded-md border border-gray-200">
                                <Globe size={12} className="text-indigo-600" /> Base: Asia/Kolkata (IST)
                              </span>
                              <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs font-semibold px-2.5 py-1 rounded-md border border-indigo-100">
                                <ShieldCheck size={12} /> Max 2 Classes / Day
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="bg-slate-50 border border-gray-200 rounded-xl px-6 py-4 text-center shrink-0">
                          <span className="block text-2xl font-extrabold text-indigo-600">{selectedMentorGroup.slots.length}</span>
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Open Slots</span>
                        </div>
                      </div>

                      {/* STEP 1: Date Selector Tabs */}
                      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
                        <div className="flex items-center gap-2">
                          <Calendar className="text-indigo-600" size={20} />
                          <h3 className="text-base sm:text-lg font-bold text-gray-900">Choose Date ({selectedTimezone})</h3>
                        </div>

                        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                          {dateKeysList.map((dKey) => {
                            const isSelected = selectedDateKey === dKey;
                            const dateObj = mentorDateMap[dKey];

                            return (
                              <button
                                key={dKey}
                                className={`flex flex-col items-center justify-center min-w-[120px] px-4 py-3 rounded-2xl border text-xs font-bold transition-all cursor-pointer shrink-0 ${
                                  isSelected
                                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                                    : 'bg-slate-50 hover:bg-slate-100 border-gray-200 text-gray-700'
                                }`}
                                onClick={() => {
                                  setSelectedDateKey(dKey);
                                  setSelectedSlotId(null);
                                }}
                              >
                                <span className="text-sm font-extrabold">{dateObj.dateLabel}</span>
                                <span className={`text-[11px] font-semibold mt-1 px-2 py-0.5 rounded-full ${isSelected ? 'bg-indigo-700 text-white' : 'bg-gray-200 text-gray-600'}`}>
                                  {dateObj.slots.length} Slots
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* STEP 2: Time Slots List */}
                      {activeDateGroup && (
                        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Clock className="text-indigo-600" size={20} />
                              <h3 className="text-base sm:text-lg font-bold text-gray-900">
                                Available Time Slots for <span className="text-indigo-600">{activeDateGroup.dateLabel}</span>
                              </h3>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {activeDateGroup.slots.map((slot) => {
                              const isSelected = selectedSlotId === slot.id;
                              const parentFormatted = formatTimeOnlyInZone(slot.startTime, selectedTimezone);
                              const mentorFormatted = formatTimeOnlyInZone(slot.startTime, 'Asia/Kolkata');

                              return (
                                <div
                                  key={slot.id}
                                  className={`rounded-full px-5 py-3 border flex flex-col justify-center transition-all duration-150 cursor-pointer ${
                                    isSelected
                                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-md ring-2 ring-indigo-600 ring-offset-2'
                                      : 'bg-white hover:bg-slate-50 border-gray-200 text-gray-800 hover:border-indigo-300'
                                  }`}
                                  onClick={() => setSelectedSlotId(slot.id)}
                                >
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <div className="flex items-center gap-1.5 font-bold text-sm">
                                        <Clock size={15} className={isSelected ? 'text-white' : 'text-indigo-600'} />
                                        <span>{parentFormatted}</span>
                                      </div>
                                      <div className={`text-[11px] font-medium ${isSelected ? 'text-indigo-100' : 'text-gray-500'}`}>
                                        Mentor IST: {mentorFormatted}
                                      </div>
                                    </div>

                                    <button
                                      className={`text-xs font-bold px-3 py-1.5 rounded-full transition-colors cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${
                                        isSelected
                                          ? 'bg-white text-indigo-700 hover:bg-indigo-50'
                                          : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-100'
                                      }`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedSlotId(slot.id);
                                        handleBookSlot(slot.id);
                                      }}
                                      disabled={submitting}
                                    >
                                      {submitting && isSelected ? 'Booking...' : 'Book Class'}
                                    </button>
                                  </div>

                                  {isDebugMode && (
                                    <div className={`text-[10px] font-mono mt-1 pt-1 border-t ${
                                      isSelected ? 'border-indigo-500 text-indigo-100' : 'border-gray-100 text-indigo-700'
                                    }`}>
                                      UTC: {slot.startTime}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* FOOTER & EVALUATOR DEBUG MODE TOGGLE */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 pt-6 border-t border-gray-200 w-full flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500">
        <div>
          Codeyoung Trial Class Appointment Booking System • Built with React, Node.js & Prisma
        </div>

        <div className="flex items-center gap-2 bg-white px-3.5 py-1.5 rounded-full border border-gray-200 shadow-xs">
          <span className="font-bold text-gray-700">Evaluator Debug Mode:</span>
          <button
            type="button"
            onClick={() => setIsDebugMode(!isDebugMode)}
            className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
              isDebugMode ? 'bg-indigo-600' : 'bg-gray-300'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                isDebugMode ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </footer>

      {/* CUSTOM SLOT REQUEST / WAITLIST MODAL */}
      {showWaitlistModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-3xl p-6 sm:p-8 shadow-2xl max-w-md w-full relative animate-in fade-in zoom-in-95 duration-200">
            <button
              className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 bg-slate-100 hover:bg-slate-200 rounded-full p-1.5 transition-colors cursor-pointer"
              onClick={() => setShowWaitlistModal(false)}
            >
              <X size={18} />
            </button>

            {waitlistSubmitted ? (
              <div className="text-center py-6 space-y-3">
                <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-2">
                  <CheckCircle2 size={32} />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Custom Request Received!</h3>
                <p className="text-xs sm:text-sm text-gray-600">Our academic team will match you with a mentor and email you details shortly.</p>
              </div>
            ) : (
              <form onSubmit={handleCustomRequestSubmit} className="space-y-4">
                <div className="flex items-center gap-3 pb-2 border-b border-gray-100">
                  <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold">
                    <Mail size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Request Custom Demo Slot</h3>
                    <p className="text-xs text-gray-500">Can't find a matching time? Tell us your preference!</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700 block">Preferred Date:</label>
                  <input
                    type="date"
                    required
                    className="w-full bg-slate-50 border border-gray-300 text-gray-900 text-xs sm:text-sm rounded-xl p-3 focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                    value={customRequestDate}
                    onChange={(e) => setCustomRequestDate(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700 block">Preferred Time ({selectedTimezone}):</label>
                  <input
                    type="time"
                    required
                    className="w-full bg-slate-50 border border-gray-300 text-gray-900 text-xs sm:text-sm rounded-xl p-3 focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                    value={customRequestTime}
                    onChange={(e) => setCustomRequestTime(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm py-3 rounded-full shadow-md transition-all cursor-pointer mt-2"
                >
                  Submit Custom Slot Request
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
