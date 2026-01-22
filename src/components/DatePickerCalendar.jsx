import React, { useState } from "react";
import { FaCalendarAlt, FaChevronLeft, FaChevronRight } from "react-icons/fa";
import { getDayName, isLockedHoliday } from "../utils/dateUtils";

const DatePickerCalendar = ({
  selectedDate,
  onDateSelect,
  availableDates = [],
  teacherUid = null,
  minDate = null, // Date object for minimum selectable date
  getSlotCounts = null,
  getNewTeacherSlotCounts = null,
  currentNewTeacher = null,
}) => {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());

  // Generate available dates based on teacher availability if not provided
  const generateAvailableDates = () => {
    if (availableDates.length > 0) {
      return availableDates;
    }

    const dates = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const effectiveMinDate = minDate || yesterday;

    if (!teacherUid) {
      // If no teacher, all dates from minDate onwards are available
      for (let i = -1; i < 60; i++) {
        const date = new Date();
        date.setDate(date.getDate() + i);
        date.setHours(0, 0, 0, 0);
        if (date >= effectiveMinDate && !isLockedHoliday(date)) {
          dates.push(date.toISOString().split("T")[0]);
        }
      }
      return dates;
    }

    // Check availability data
    const checkDateAvailability = (dateObj) => {
      const allTimeSlots = Array.from({ length: 48 }, (_, i) => {
        const hour = Math.floor(i / 2);
        const minute = (i % 2) * 30;
        return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      });

      // For previous dates (yesterday), always available
      if (dateObj < today && dateObj >= effectiveMinDate) {
        return true;
      }

      // Check if any slot has availability
      return allTimeSlots.some((timeString) => {
        let slotCounts = null;
        if (currentNewTeacher?.uid && getNewTeacherSlotCounts) {
          slotCounts = getNewTeacherSlotCounts(
            dateObj,
            timeString,
            currentNewTeacher.uid
          );
        } else if (getSlotCounts) {
          slotCounts = getSlotCounts(dateObj, timeString);
        }

        return (
          slotCounts &&
          slotCounts.available > slotCounts.booked &&
          (slotCounts.teacherid === teacherUid || slotCounts.uid === teacherUid)
        );
      });
    };

    // Check dates for next 60 days
    for (let i = -1; i < 60; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      date.setHours(0, 0, 0, 0);

      if (date >= effectiveMinDate && !isLockedHoliday(date)) {
        if (checkDateAvailability(date)) {
          dates.push(date.toISOString().split("T")[0]);
        }
      }
    }

    return dates;
  };

  const availableDatesList = generateAvailableDates();

  const handleDateSelect = (dateStr) => {
    onDateSelect(dateStr);
    setCalendarOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setCalendarOpen(!calendarOpen)}
        className="w-full p-2 border border-gray-300 rounded text-xs text-black bg-white flex items-center justify-between hover:border-orange-500 transition-colors duration-200"
      >
        <span className="text-gray-700">
          {selectedDate
            ? (() => {
                const dateObj = new Date(selectedDate);
                const day = dateObj.getDate().toString().padStart(2, "0");
                const month = (dateObj.getMonth() + 1).toString().padStart(2, "0");
                const year = dateObj.getFullYear();
                return `${day}-${month}-${year} (${getDayName(selectedDate)})`;
              })()
            : "Select date..."}
        </span>
        <FaCalendarAlt size={12} className="text-gray-400" />
      </button>

      {calendarOpen && (
        <div className="absolute top-full left-0 right-0 z-50 bg-white border border-gray-300 rounded-lg shadow-lg mt-1 p-3 min-w-[280px]">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => {
                const currentDate = new Date(calendarDate);
                currentDate.setMonth(currentDate.getMonth() - 1);
                setCalendarDate(currentDate);
              }}
              className="p-2 hover:bg-gray-100 rounded border border-gray-200 transition-colors duration-200 flex items-center justify-center"
              title="Previous month"
            >
              <FaChevronLeft size={14} className="text-gray-600" />
            </button>

            <div className="flex flex-col items-center">
              <h3 className="text-sm font-semibold text-gray-900">
                {calendarDate.toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </h3>
              <button
                onClick={() => setCalendarDate(new Date())}
                className="text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors duration-200"
                title="Go to today"
              >
                Today
              </button>
            </div>

            <button
              onClick={() => {
                const currentDate = new Date(calendarDate);
                currentDate.setMonth(currentDate.getMonth() + 1);
                setCalendarDate(currentDate);
              }}
              className="p-2 hover:bg-gray-100 rounded border border-gray-200 transition-colors duration-200 flex items-center justify-center"
              title="Next month"
            >
              <FaChevronRight size={14} className="text-gray-600" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div
                key={day}
                className="text-xs font-medium text-gray-500 text-center py-1"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {(() => {
              const year = calendarDate.getFullYear();
              const month = calendarDate.getMonth();
              const firstDay = new Date(year, month, 1);
              const startDate = new Date(firstDay);
              startDate.setDate(startDate.getDate() - firstDay.getDay());

              const days = [];
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const yesterday = new Date();
              yesterday.setDate(yesterday.getDate() - 1);
              yesterday.setHours(0, 0, 0, 0);
              const effectiveMinDate = minDate || yesterday;

              for (let i = 0; i < 42; i++) {
                const date = new Date(startDate);
                date.setDate(startDate.getDate() + i);

                const isCurrentMonth = date.getMonth() === month;
                const isToday = date.toDateString() === today.toDateString();
                const isSelected =
                  selectedDate &&
                  date.toDateString() === new Date(selectedDate).toDateString();
                const dateStr = date.toISOString().split("T")[0];
                const isAvailable = availableDatesList.includes(dateStr);
                const isLocked = isLockedHoliday(date);
                const isPastDate = date < effectiveMinDate;

                days.push(
                  <button
                    key={i}
                    onClick={() => {
                      if ((isAvailable || isPastDate) && !isLocked) {
                        handleDateSelect(dateStr);
                      }
                    }}
                    disabled={(!isAvailable && !isPastDate) || isLocked}
                    className={`
                      w-8 h-8 text-xs rounded flex items-center justify-center transition-all duration-200
                      ${!isCurrentMonth ? "text-gray-300" : ""}
                      ${isToday ? "bg-blue-100 text-blue-700 font-semibold" : ""}
                      ${isSelected ? "bg-blue-600 text-white font-semibold" : ""}
                      ${
                        isAvailable &&
                        !isLocked &&
                        isCurrentMonth &&
                        !isToday &&
                        !isSelected
                          ? "hover:bg-blue-50 text-gray-700 border-2 border-green-300 bg-green-50"
                          : ""
                      }
                      ${
                        isLocked && isCurrentMonth
                          ? "bg-gray-200 text-gray-500 cursor-not-allowed opacity-60"
                          : ""
                      }
                      ${
                        !isAvailable &&
                        !isLocked &&
                        !isPastDate &&
                        isCurrentMonth
                          ? "text-gray-400 cursor-not-allowed"
                          : ""
                      }
                      ${
                        isPastDate && isCurrentMonth && !isSelected
                          ? "text-gray-400"
                          : ""
                      }
                    `}
                  >
                    {date.getDate()}
                  </button>
                );
              }
              return days;
            })()}
          </div>

          <div className="mt-3 pt-2 border-t border-gray-200">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span>
                Available dates for{" "}
                {teacherUid ? `Teacher ${teacherUid}` : "selected teacher"}
              </span>
            </div>
            {availableDatesList.length === 0 && teacherUid && (
              <div className="text-xs text-red-500 mt-1">
                No available dates for this teacher
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DatePickerCalendar;
