import { useMemo } from "react";
import { formatDate } from "../utils/dateUtils";

/**
 * Hook to get slot counts for a specific date and time
 * @param {Object} weeklyApiData - Weekly API data from state
 * @param {Object} newTeacherAvailabilityData - New teacher availability data
 * @param {Array} teachers - Teachers array
 * @param {Object} schedule - Local schedule data
 * @returns {Object} Functions to get slot counts
 */
export const useSlotCounts = ({
  weeklyApiData,
  newTeacherAvailabilityData,
  teachers,
  schedule,
}) => {
  // Helper to get teacher by teacher ID
  const getTeacherByTeacherId = (teacherId) => {
    if (!teacherId || !teachers || teachers.length === 0) return null;
    return (
      teachers.find(
        (t) =>
          t.uid === teacherId ||
          t.teacher_id === teacherId ||
          t.id === teacherId
      ) || null
    );
  };

  // Helper to get schedule for a date
  const getScheduleForDate = (date) => {
    const dateStr = formatDate(date);
    if (!schedule[dateStr]) {
      const dateSchedule = {};
      // Generate empty slots for all time slots
      for (let i = 0; i < 48; i++) {
        const hour = Math.floor(i / 2);
        const minute = (i % 2) * 30;
        const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
        dateSchedule[time] = { time, teachers: [], students: [] };
      }
      return dateSchedule;
    }
    return schedule[dateStr];
  };

  // Get slot counts from new teacher's availability data
  const getNewTeacherSlotCounts = (date, time, newTeacherUid) => {
    if (
      !newTeacherUid ||
      !newTeacherAvailabilityData ||
      Object.keys(newTeacherAvailabilityData).length === 0
    ) {
      return null;
    }

    const dateObj = date instanceof Date ? date : new Date(date);
    const dateStr = formatDate(dateObj);

    if (
      newTeacherAvailabilityData[dateStr] &&
      newTeacherAvailabilityData[dateStr][time]
    ) {
      const apiSlot = newTeacherAvailabilityData[dateStr][time];
      if (
        apiSlot.teacherid === newTeacherUid ||
        apiSlot.uid === newTeacherUid
      ) {
        const teacher = getTeacherByTeacherId(apiSlot.teacherid || apiSlot.uid);
        return {
          available: apiSlot.availability || 0,
          booked: apiSlot.bookings || 0,
          teacherid: apiSlot.teacherid || apiSlot.uid || null,
          teacherDetails: teacher || null,
          apiData: apiSlot,
          isFromAPI: true,
          uid: apiSlot.uid || null,
        };
      }
    }
    return null;
  };

  // Get slot counts from API or local schedule
  const getSlotCounts = (date, time) => {
    const dateObj = date instanceof Date ? date : new Date(date);
    const dateStr = formatDate(dateObj);

    // Try API data first
    if (weeklyApiData[dateStr] && weeklyApiData[dateStr][time]) {
      const apiSlot = weeklyApiData[dateStr][time];
      const teacher = getTeacherByTeacherId(apiSlot.teacherid || apiSlot.uid);

      return {
        available: apiSlot.availability || 0,
        booked: apiSlot.bookings || 0,
        teacherid: apiSlot.teacherid || apiSlot.uid || null,
        teacherDetails: teacher || null,
        apiData: apiSlot,
        isFromAPI: true,
        uid: apiSlot.uid || null,
      };
    }

    // Fallback to local schedule
    const localSlot = getScheduleForDate(date)[time];

    if (!localSlot) {
      return {
        available: 0,
        booked: 0,
        teacherid: null,
        teacherDetails: null,
        apiData: null,
        isFromAPI: false,
        uid: null,
      };
    }

    const firstTeacher = localSlot.teachers?.[0];

    return {
      available: localSlot.teachers?.length || 0,
      booked: localSlot.students?.length || 0,
      teacherid: firstTeacher?.uid || null,
      teacherDetails: firstTeacher || null,
      apiData: null,
      isFromAPI: false,
      uid: firstTeacher?.uid || null,
    };
  };

  return useMemo(
    () => ({
      getSlotCounts,
      getNewTeacherSlotCounts,
      getTeacherByTeacherId,
    }),
    [weeklyApiData, newTeacherAvailabilityData, teachers, schedule]
  );
};
