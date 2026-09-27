import React, { useState, useEffect } from 'react';
import { DateTime } from 'luxon';
import { Calendar, Clock, User, Globe, CheckCircle2, AlertTriangle, ArrowRight, RefreshCw, Video, ArrowLeft, UserCheck, ShieldCheck, Zap, Mail, X, Check } from 'lucide-react';

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
  { value: 'Europe/London', label: 'London, UK - GMT/BST' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (US & Canada) - PST/PDT' },
  { value: 'America/Chicago', label: 'Central Time (US & Canada) - CST/CDT' }
];

export default function App() {
  const [selectedTimezone, setSelectedTimezone] = useState<string>('America/New_York');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [selectedParentId, setSelectedParentId] = useState<string>('');
  
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

  useEffect(() => {
    fetchSlots();
    fetchParents();
  }, []);

  const fetchSlots = async () => {
    setLoadingSlots(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/slots');
      if (res.ok) {
        const data: Slot[] = await res.json();
        setSlots(data);
      } else {
        const errorData = await res.json().catch(() => ({}));
        setFetchError(errorData.error || `Server returned status ${res.status}`);
      }
    } catch (err: any) {
      console.error('Error fetching slots:', err);
      setFetchError('Could not connect to backend server.');
    } finally {
      setLoadingSlots(false);
    }
  };

  const fetchParents = async () => {
    try {
      const res = await fetch('/api/parents');
      if (res.ok) {
        const data: Parent[] = await res.json();
        setParents(data);
        if (data.length > 0) {
          setSelectedParentId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching parents:', err);
    }
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

  const mentorsList = Object.values(mentorsMap);
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

  const handleBookSlot = async (targetSlotId: string) => {
    if (!targetSlotId) return;

    const parentIdToUse = selectedParentId || (parents.length > 0 ? parents[0].id : 'dummy-parent-1');

    setSubmitting(true);
    setStatus('idle');
    setErrorMessage('');
    setSuggestedSlot(null);

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

      if (res.ok) {
        setBookingSuccessData(responseData);
        setStatus('success');
        fetchSlots();
      } else {
        if (responseData.suggestedSlot) {
          setSuggestedSlot(responseData.suggestedSlot);
          setStatus('fallback');
        } else {
          setStatus('error');
        }
        setErrorMessage(responseData.error || 'Failed to complete booking.');
      }
    } catch (err: any) {
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

  const resetBookingForm = () => {
    setStatus('idle');
    setBookingSuccessData(null);
    setSuggestedSlot(null);
    setErrorMessage('');
    setSelectedSlotId(null);
    setSelectedMentorId(null);
    setSelectedDateKey(null);
    fetchSlots();
  };

  return (
    <div className="app-container">
      {/* Header Banner */}
      <header className="header">
        <div className="brand">
          <div className="logo-badge">CY</div>
          <div>
            <h1>Codeyoung Trial Class Booking</h1>
            <p>Live 1-on-1 Coding Demo with India's Top Mentors</p>
          </div>
        </div>

        {/* Timezone Selector Bar */}
        <div className="timezone-selector">
          <Globe className="icon" size={18} />
          <label htmlFor="timezone-select">Display Timezone:</label>
          <select
            id="timezone-select"
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
      </header>

      {/* Quick Customer Experience Action Chips */}
      <div className="cx-actions-bar">
        <button className="cx-chip chip-zap" onClick={handleQuickEarliestSlot} disabled={slots.length === 0}>
          <Zap size={14} /> Book Earliest Available Class
        </button>

        <button className="cx-chip chip-request" onClick={() => setShowWaitlistModal(true)}>
          <Mail size={14} /> Can't Find Your Time? Request Custom Slot
        </button>
      </div>

      <main className="main-content">
        {/* SUCCESS STATE */}
        {status === 'success' && bookingSuccessData && (
          <div className="card success-card">
            <div className="success-header">
              <CheckCircle2 size={48} className="success-icon" />
              <h2>Demo Class Successfully Booked!</h2>
              <p>
                Confirmation email sent with live class link to parent (<strong>{bookingSuccessData.parent?.email}</strong>) and mentor (<strong>{bookingSuccessData.mentor?.email}</strong>).
              </p>
            </div>

            <div className="booking-details-box">
              <div className="detail-row">
                <span className="label">Mentor:</span>
                <span className="value">{bookingSuccessData.mentor?.name} ({bookingSuccessData.mentor?.email})</span>
              </div>
              <div className="detail-row">
                <span className="label">Parent:</span>
                <span className="value">{bookingSuccessData.parent?.name} ({bookingSuccessData.parent?.email})</span>
              </div>
              <div className="detail-row">
                <span className="label">Scheduled Time ({selectedTimezone}):</span>
                <span className="value highlight">
                  {formatTimeInZone(bookingSuccessData.startTime, selectedTimezone)}
                </span>
              </div>
              <div className="detail-row">
                <span className="label">Mentor Local Time (Asia/Kolkata):</span>
                <span className="value">
                  {formatTimeInZone(bookingSuccessData.startTime, 'Asia/Kolkata')}
                </span>
              </div>
              <div className="detail-row">
                <span className="label">Live Class Link (Dummy):</span>
                <span className="value link-box">
                  <a href={bookingSuccessData.meetingUrl} target="_blank" rel="noopener noreferrer">
                    <Video size={16} /> {bookingSuccessData.meetingUrl}
                  </a>
                </span>
              </div>
            </div>

            <button className="btn btn-primary" onClick={resetBookingForm}>
              <RefreshCw size={16} /> Book Another Trial Class
            </button>
          </div>
        )}

        {/* BOOKING FLOW */}
        {status !== 'success' && (
          <>
            {/* Parent Persona Selector Bar */}
            {parents.length > 0 && (
              <div className="parent-selection-card">
                <User size={18} className="icon" />
                <label htmlFor="parent-select">Booking Persona:</label>
                <select
                  id="parent-select"
                  value={selectedParentId}
                  onChange={(e) => setSelectedParentId(e.target.value)}
                >
                  {parents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.email} - {p.timezone})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Fallback Suggestion Banner */}
            {status === 'fallback' && suggestedSlot && (
              <div className="banner fallback-banner">
                <div className="banner-content">
                  <AlertTriangle className="icon" size={24} />
                  <div>
                    <h3>Mentor Unavailable for Selected Time</h3>
                    <p>{errorMessage || 'This mentor is fully booked for this date/time.'}</p>
                    <p className="suggestion-text">
                      Would you like to book <strong>{suggestedSlot.mentor?.name || 'an available mentor'}</strong> at{' '}
                      <span className="highlight">
                        {formatTimeInZone(suggestedSlot.startTime, selectedTimezone)}
                      </span>{' '}
                      instead?
                    </p>
                  </div>
                </div>
                <button
                  className="btn btn-fallback"
                  onClick={() => handleBookSlot(suggestedSlot.id)}
                  disabled={submitting}
                >
                  {submitting ? 'Booking Suggested Slot...' : 'Accept Suggested Slot & Book'}
                </button>
              </div>
            )}

            {status === 'error' && !suggestedSlot && (
              <div className="banner error-banner">
                <AlertTriangle className="icon" size={20} />
                <span>{errorMessage || 'Failed to book slot. Please try another slot.'}</span>
              </div>
            )}

            {/* PAGE VIEW 1: MENTORS GRID */}
            {!selectedMentorId && (
              <div className="step-section">
                <div className="section-title">
                  <UserCheck size={20} />
                  <h2>Select a Mentor</h2>
                  <span className="badge">{mentorsList.length} Mentors Available</span>
                </div>

                {loadingSlots ? (
                  <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Loading mentors and available slots...</p>
                  </div>
                ) : fetchError ? (
                  <div className="error-state">
                    <AlertTriangle size={32} className="error-icon" />
                    <p>{fetchError}</p>
                    <button className="btn btn-primary" onClick={fetchSlots}>
                      <RefreshCw size={16} /> Retry Connecting
                    </button>
                  </div>
                ) : mentorsList.length === 0 ? (
                  <div className="empty-state">
                    <p>No mentors found with available slots right now.</p>
                    <button className="btn btn-outline" onClick={fetchSlots} style={{ marginTop: '1rem' }}>
                      <RefreshCw size={16} /> Refresh Slots
                    </button>
                  </div>
                ) : (
                  <div className="mentors-grid">
                    {mentorsList.map(({ mentor, slots: mSlots }) => (
                      <div
                        key={mentor.id}
                        className="mentor-card"
                        onClick={() => {
                          setSelectedMentorId(mentor.id);
                          setSelectedDateKey(null);
                          setSelectedSlotId(null);
                        }}
                      >
                        <div className="mentor-header">
                          <div className="avatar">{mentor.name ? mentor.name[0] : 'M'}</div>
                          <div>
                            <h3 className="mentor-name">{mentor.name}</h3>
                            <span className="mentor-email">{mentor.email}</span>
                          </div>
                        </div>

                        <div className="mentor-stats">
                          <span className="slots-count">{mSlots.length} Slots Available</span>
                          <span className="tz-label">IST (Asia/Kolkata)</span>
                        </div>

                        <div className="card-action">
                          <span className="view-avail-btn">View Availability</span>
                          <ArrowRight size={16} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* PAGE VIEW 2: DEDICATED STRUCTURED MENTOR PAGE (Date Navigation -> Time Slots) */}
            {selectedMentorGroup && (
              <div className="mentor-availability-page">
                {/* Back Navigation Button */}
                <button
                  className="btn-back"
                  onClick={() => {
                    setSelectedMentorId(null);
                    setSelectedDateKey(null);
                    setSelectedSlotId(null);
                  }}
                >
                  <ArrowLeft size={16} /> Back to All Mentors
                </button>

                {/* Mentor Profile Overview Card */}
                <div className="mentor-profile-card">
                  <div className="mentor-profile-info">
                    <div className="profile-avatar">{selectedMentorGroup.mentor.name[0]}</div>
                    <div>
                      <h2>{selectedMentorGroup.mentor.name}</h2>
                      <p className="email">{selectedMentorGroup.mentor.email}</p>
                      <div className="mentor-tags">
                        <span className="tag tz-tag">
                          <Globe size={13} /> Base Timezone: Asia/Kolkata (IST)
                        </span>
                        <span className="tag limit-tag">
                          <ShieldCheck size={13} /> Max 2 Demo Classes / Day
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="availability-summary-box">
                    <span className="big-count">{selectedMentorGroup.slots.length}</span>
                    <span className="count-label">Available Slots</span>
                  </div>
                </div>

                {/* STRUCTURED STEP 1: Date Available Selector Tabs */}
                <div className="date-selector-container">
                  <div className="sub-title">
                    <Calendar size={18} />
                    <h3>Step 1: Choose Available Date ({selectedTimezone})</h3>
                  </div>

                  <div className="date-tabs-bar">
                    {dateKeysList.map((dKey) => {
                      const isSelected = selectedDateKey === dKey;
                      const dateObj = mentorDateMap[dKey];

                      return (
                        <button
                          key={dKey}
                          className={`date-tab ${isSelected ? 'active' : ''}`}
                          onClick={() => {
                            setSelectedDateKey(dKey);
                            setSelectedSlotId(null);
                          }}
                        >
                          <span className="tab-date">{dateObj.dateLabel}</span>
                          <span className="tab-badge">{dateObj.slots.length} Slots</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* STRUCTURED STEP 2: Time Slots for Selected Date */}
                {activeDateGroup && (
                  <div className="slots-sub-section">
                    <div className="sub-title">
                      <Clock size={18} />
                      <h3>
                        Step 2: Choose Time Slot for <span className="highlight-date">{activeDateGroup.dateLabel}</span>
                      </h3>
                    </div>

                    <div className="slots-grid">
                      {activeDateGroup.slots.map((slot) => {
                        const isSelected = selectedSlotId === slot.id;
                        const parentFormatted = formatTimeOnlyInZone(slot.startTime, selectedTimezone);
                        const mentorFormatted = formatTimeOnlyInZone(slot.startTime, 'Asia/Kolkata');

                        return (
                          <div
                            key={slot.id}
                            className={`slot-card ${isSelected ? 'selected' : ''}`}
                            onClick={() => setSelectedSlotId(slot.id)}
                          >
                            <div className="slot-time-header">
                              <Clock size={16} />
                              <span>{parentFormatted}</span>
                            </div>

                            <div className="slot-meta">
                              <span>Mentor IST Time: {mentorFormatted}</span>
                            </div>

                            <div className="slot-footer">
                              <button
                                className={`btn ${isSelected ? 'btn-selected' : 'btn-outline'}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedSlotId(slot.id);
                                  handleBookSlot(slot.id);
                                }}
                                disabled={submitting && isSelected}
                              >
                                {submitting && isSelected ? (
                                  'Booking...'
                                ) : (
                                  <>
                                    Book Trial Class <ArrowRight size={14} />
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>



        {/* CUSTOM SLOT REQUEST / WAITLIST MODAL */}
        {showWaitlistModal && (
          <div className="modal-backdrop">
            <div className="modal-card">
              <button className="modal-close" onClick={() => setShowWaitlistModal(false)}>
                <X size={18} />
              </button>

              {waitlistSubmitted ? (
                <div className="modal-success">
                  <CheckCircle2 size={40} className="success-icon" />
                  <h3>Custom Request Received!</h3>
                  <p>Our team will match you with a mentor and email you details shortly.</p>
                </div>
              ) : (
                <form onSubmit={handleCustomRequestSubmit} className="modal-form">
                  <div className="modal-header">
                    <Mail size={24} className="icon" />
                    <div>
                      <h3>Request Custom Demo Slot</h3>
                      <p>Can't find a matching time? Tell us your preference!</p>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Preferred Date:</label>
                    <input
                      type="date"
                      required
                      value={customRequestDate}
                      onChange={(e) => setCustomRequestDate(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label>Preferred Time ({selectedTimezone}):</label>
                    <input
                      type="time"
                      required
                      value={customRequestTime}
                      onChange={(e) => setCustomRequestTime(e.target.value)}
                    />
                  </div>

                  <button type="submit" className="btn btn-primary">
                    <Check size={16} /> Submit Custom Slot Request
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
  );
}
