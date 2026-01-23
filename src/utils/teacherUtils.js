// Teacher utility functions
import { formatDate } from "./dateUtils";

// Helper function to check if a teacher is on leave for a specific date
export const isTeacherOnLeave = (teacherEmail, date, teacherLeaves) => {
  if (!teacherLeaves?.success || !teacherLeaves?.leaves) {
    return false;
  }

  const dateStr = formatDate(date);
  const leaves = teacherLeaves.leaves[dateStr];

  // Check if leaves object exists (it's an object, not an array)
  const hasLeaves = leaves && typeof leaves === "object" && leaves.id;

  return hasLeaves;
};

// Helper function to check if a teacher has week off for a specific date
export const isTeacherWeekOff = (teacherEmail, date, availabilitySummary) => {
  // Check if availabilitySummary exists and is an object (direct API response)
  if (!availabilitySummary || typeof availabilitySummary !== "object") {
    return false;
  }

  const dateStr = formatDate(date);
  const dateData = availabilitySummary[dateStr];

  // Check if any time slot has week_off = 1 for this date
  let hasWeekOff = false;
  if (dateData && typeof dateData === "object") {
    // Check all time slots for this date
    hasWeekOff = Object.values(dateData).some((timeSlot) => {
      const isWeekOff =
        timeSlot && typeof timeSlot === "object" && timeSlot.week_off === 1;
      return isWeekOff;
    });
  }

  return hasWeekOff;
};

// Helper function to get teacher email from event data
export const getTeacherEmailFromEvent = (eventData, selectedTeacher, teachers) => {
  // First try to get teacher email from the event data
  if (eventData.teacher_email) {
    console.log(
      "🔍 Found teacher_email in event data:",
      eventData.teacher_email
    );
    return eventData.teacher_email;
  }

  // Try to get teacher email from attendees array (most reliable)
  if (eventData.attendees && Array.isArray(eventData.attendees)) {
    // Look for teacher email in attendees (usually contains .jetlearn@gmail.com)
    const teacherEmail = eventData.attendees.find(
      (email) =>
        email.includes("@jetlearn.com") || email.includes("@jet-learn.com")
    );
    if (teacherEmail) {
      return teacherEmail;
    }
  }

  // Try to extract teacher UID from summary and find the teacher
  const tlMatch = eventData.summary?.match(/\bTJ[A-Za-z0-9]+\b/);
  if (tlMatch) {
    const teacherUid = tlMatch[0];
    const teacher = teachers.find((t) => t.uid === teacherUid);
    if (teacher && teacher.email) {
      return teacher.email;
    }
  }

  // Try teacher_id field
  if (eventData.teacher_id) {
    const teacher = teachers.find((t) => t.uid === eventData.teacher_id);
    if (teacher && teacher.email) {
      return teacher.email;
    }
  }

  // Fallback to selected teacher
  const fallbackEmail = selectedTeacher?.email || null;
  return fallbackEmail;
};
