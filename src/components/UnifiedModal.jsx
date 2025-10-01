import React, { useState, useMemo, useEffect } from "react";
import {
  FaTimes,
  FaUsers,
  FaGraduationCap,
  FaClock,
  FaPlus,
  FaTrash,
  FaUserCheck,
  FaBook,
  FaSearch,
  FaCalendarAlt,
  FaExclamationTriangle,
  FaChevronLeft,
  FaChevronRight,
} from "react-icons/fa";
import { formatDisplayDate } from "../utils/dateUtils";
import { useDebounce } from "../hooks/useDebounce";

const SUBJECTS = [
  { value: "maths", label: "Maths" },
  { value: "coding", label: "Coding" },
  // { value: "gcse", label: "GCSE" },
  // { value: "dutch", label: "Dutch" },
];

const CLASS_TYPES = [
  { value: "1:1", label: "1:1" },
  { value: "1:2", label: "1:2" },
  { value: "batch", label: "Batch" },
];

const CLASS_COUNTS = [
  { value: "1", label: "1 " },
  { value: "2", label: "2 " },
  { value: "3", label: "3 " },
  { value: "4", label: "4 " },
  { value: "5", label: "5 " },
  { value: "8", label: "8 " },
  { value: "10", label: "10 " },
  { value: "12", label: "12 " },
  { value: "16", label: "16 " },
  { value: "20", label: "20 " },
];

const RECORDING_OPTIONS = [
  { value: "DNREC", label: "Do not Record" },
  { value: "MAKE UP", label: "Make Up Class" },
  { value: "MAKE UP - S", label: "Make Up - Substitute" },
  { value: "Reserved", label: "Reserve Slot" },
];

export const formatDate = (date) => {
  // Ensure date is a Date object
  const dateObj = date instanceof Date ? date : new Date(date);
  const day = dateObj.getDate().toString().padStart(2, "0");
  const month = (dateObj.getMonth() + 1).toString().padStart(2, "0");
  const year = dateObj.getFullYear();
  return `${day}-${month}-${year}`; // DD-MM-YYYY format
};

export const getDayName = (date) => {
  let dateObj;

  if (date instanceof Date) {
    dateObj = date;
  } else if (typeof date === "string") {
    // Handle DD-MM-YYYY format
    if (date.includes("-") && date.split("-").length === 3) {
      const [day, month, year] = date.split("-");
      // Create date with MM-DD-YYYY format (month is 0-indexed)
      dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    } else {
      // Try default Date constructor for other formats
      dateObj = new Date(date);
    }
  } else {
    dateObj = new Date(date);
  }

  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return days[dateObj.getDay()];
};
const UnifiedModalComponent = function UnifiedModal({
  isOpen,
  onClose,
  date,
  time,
  timezone,
  availableStudents,
  availableTeachers,
  allTeachers,
  onAddTeacher,
  onBookStudent,
  teacherAvailability, // New prop for teacher availability data
  selectedTeacherId, // New prop for selected teacher ID
  listViewBookingDetails, // New prop for list view booking details to filter green dot availability
}) {
  const cleanedTimeRange = time.replace(/\s+/g, ""); // Remove all spaces
  const startTime = cleanedTimeRange.split("-")[0];
  // console.log(startTime); // "8:00"
  const [studentName, setStudentName] = useState("");
  const [selectedTeacher, setSelectedTeacher] = useState(availableTeachers);
  const [newTeacherId, setNewTeacherId] = useState("");
  const [bookingType, setBookingType] = useState("trial");

  // Search states
  const [teacherSearchTerm, setTeacherSearchTerm] = useState("");
  const [studentSearchTerm, setStudentSearchTerm] = useState("");

  // New paid booking options
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedClassType, setSelectedClassType] = useState("");
  const [selectedClassCount, setSelectedClassCount] = useState("");
  const [selectedRecording, setSelectedRecording] = useState([]);
  const [batchNumber, setBatchNumber] = useState("");

  // Enhanced booking form fields
  const [platformCredentials, setPlatformCredentials] = useState("");
  const [attendees, setAttendees] = useState("");
  const [selectedScheduleDate, setSelectedScheduleDate] = useState(
    new Date(date).toISOString().split("T")[0] // Keep YYYY-MM-DD for input
  );
  const [selectedScheduleTime, setSelectedScheduleTime] = useState(startTime);

  // New Schedule section states
  const [scheduleEntries, setScheduleEntries] = useState([]);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [attendeesError, setAttendeesError] = useState("");
  const [attendeesList, setAttendeesList] = useState([]);
  const [showDomainSuggestions, setShowDomainSuggestions] = useState(false);

  // Calendar picker state
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());

  // Booking loading state
  const [isBookingLoading, setIsBookingLoading] = useState(false);

  // Update calendar date when selected date changes or when calendar opens
  useEffect(() => {
    if (selectedScheduleDate) {
      const selectedDate = new Date(selectedScheduleDate);
      setCalendarDate(selectedDate);
    }
  }, [selectedScheduleDate]);

  // Update calendar date when calendar opens to show the correct month
  useEffect(() => {
    if (calendarOpen && selectedScheduleDate) {
      const selectedDate = new Date(selectedScheduleDate);
      setCalendarDate(selectedDate);
    }
  }, [calendarOpen, selectedScheduleDate]);

  // Close calendar when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (calendarOpen && !event.target.closest(".calendar-container")) {
        setCalendarOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [calendarOpen]);

  // Generate available dates based on teacher availability
  const generateAvailableDates = () => {
    // Priority 1: Use listViewBookingDetails data (green dots from list view)
    if (listViewBookingDetails && listViewBookingDetails.data) {
      const availableDates = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const parsedBookings = parseBookingDetails(listViewBookingDetails.data);

      // Get unique dates that have green dots
      const greenDotDates = new Set();

      parsedBookings.forEach((booking) => {
        const bookingDate =
          booking.date ||
          (booking.start_time
            ? new Date(booking.start_time).toISOString().split("T")[0]
            : null);

        if (bookingDate) {
          const dateObj = new Date(bookingDate);

          // Only include future dates
          if (dateObj >= today) {
            // Check if this booking has a green dot (availability or hours)
            if (isGreenDotBooking(booking)) {
              greenDotDates.add(bookingDate);
            }
          }
        }
      });

      if (greenDotDates.size > 0) {
        return Array.from(greenDotDates).sort();
      }
    }

    // Priority 2: Use teacherAvailability data
    if (teacherAvailability && selectedTeacherId) {
      const availableDates = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Process teacher availability data to get available dates
      if (Array.isArray(teacherAvailability)) {
        teacherAvailability.forEach((availability) => {
          if (availability.date && availability.available_slots > 0) {
            const [day, month, year] = availability.date.split("-");
            const availabilityDate = new Date(
              parseInt(year),
              parseInt(month) - 1,
              parseInt(day)
            );

            if (availabilityDate >= today) {
              availableDates.push(availabilityDate.toISOString().split("T")[0]);
            }
          }
        });
      } else if (typeof teacherAvailability === "object") {
        // Handle object format
        // Support two shapes:
        // 1) { 'DD-MM-YYYY': { available_slots: number, time_slots: [{ time, available }] } }
        // 2) { 'DD-MM-YYYY': { 'HH:MM': { availability: number, ... }, ... } }  // weeklyApiData shape
        Object.keys(teacherAvailability).forEach((dateKey) => {
          const dateData = teacherAvailability[dateKey];
          let hasAvailableSlots = false;

          if (dateData && typeof dateData === "object") {
            if (typeof dateData.available_slots === "number") {
              hasAvailableSlots = dateData.available_slots > 0;
            } else {
              // Assume times map shape; check any time with availability > 0
              const timeEntries = Object.values(dateData);
              hasAvailableSlots = timeEntries.some((slot) => {
                if (!slot || typeof slot !== "object") return false;
                // Support either boolean available or numeric availability
                if (typeof slot.available === "boolean") return slot.available;
                if (typeof slot.availability === "number")
                  return slot.availability > 0;
                return false;
              });
            }
          }

          if (hasAvailableSlots) {
            const [day, month, year] = dateKey.split("-");
            const availabilityDate = new Date(
              parseInt(year),
              parseInt(month) - 1,
              parseInt(day)
            );

            if (availabilityDate >= today) {
              availableDates.push(availabilityDate.toISOString().split("T")[0]);
            }
          }
        });
      }

      if (availableDates.length > 0) {
        return availableDates.sort();
      }
    }

    // Fallback to next 30 days if no availability data
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date.toISOString().split("T")[0]);
    }
    return dates;
  };

  // Generate available times based on teacher availability for selected date
  const generateAvailableTimes = (selectedDate) => {
    if (!selectedDate) {
      console.log("❌ No selected date, returning empty array");
      return []; // Return empty array instead of all time slots
    }

    // Priority 1: Use listViewBookingDetails data (green dots from list view)
    if (listViewBookingDetails && listViewBookingDetails.data) {
      console.log("✅ Using listViewBookingDetails data");
      const availableTimes = [];
      const parsedBookings = parseBookingDetails(listViewBookingDetails.data);
      console.log("📊 parsedBookings:", parsedBookings);

      // Get times for the selected date that have green dots
      parsedBookings.forEach((booking) => {
        const bookingDate =
          booking.date ||
          (booking.start_time
            ? new Date(booking.start_time).toISOString().split("T")[0]
            : null);
        const bookingTime =
          (booking.start_time ? booking.start_time.slice(11, 16) : null) ||
          booking.time;

        if (bookingDate === selectedDate && bookingTime) {
          // Check if this booking has a green dot (availability or hours)
          if (isGreenDotBooking(booking)) {
            console.log("Adding time to availableTimes:", bookingTime);
            availableTimes.push(bookingTime);
          }
        }
      });

      if (availableTimes.length > 0) {
        const result = [...new Set(availableTimes)].sort();

        return result;
      }
    }

    // Priority 2: Use teacherAvailability data
    if (teacherAvailability && selectedTeacherId) {
      // Convert selected date to DD-MM-YYYY format for matching
      const dateObj = new Date(selectedDate);
      const day = dateObj.getDate().toString().padStart(2, "0");
      const month = (dateObj.getMonth() + 1).toString().padStart(2, "0");
      const year = dateObj.getFullYear();
      const formattedDate = `${day}-${month}-${year}`;

      const availableTimes = [];

      // Process teacher availability data to get available times for the selected date
      if (Array.isArray(teacherAvailability)) {
        const dateAvailability = teacherAvailability.find(
          (av) => av.date === formattedDate
        );
        if (dateAvailability && dateAvailability.time_slots) {
          dateAvailability.time_slots.forEach((slot) => {
            if (slot.available) {
              availableTimes.push(slot.time);
            }
          });
        }
      } else if (typeof teacherAvailability === "object") {
        const dateAvailability = teacherAvailability[formattedDate];
        if (dateAvailability) {
          if (dateAvailability.time_slots) {
            // Shape 1: time_slots array with { time, available }
            dateAvailability.time_slots.forEach((slot) => {
              if (slot && slot.available) {
                availableTimes.push(slot.time);
              }
            });
          } else if (typeof dateAvailability === "object") {
            // Shape 2: times map with { availability: number }
            Object.entries(dateAvailability).forEach(([timeKey, slot]) => {
              if (!slot || typeof slot !== "object") return;
              if (typeof slot.available === "boolean" && slot.available) {
                availableTimes.push(timeKey);
              } else if (
                typeof slot.availability === "number" &&
                slot.availability > 0
              ) {
                availableTimes.push(timeKey);
              }
            });
          }
        }
      }

      if (availableTimes.length > 0) {
        return availableTimes.sort();
      }
    }

    // Return empty array if no available times found
    console.log("❌ No available times found, returning empty array");
    return [];
  };

  // Generate time slots for schedule (fallback)
  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 8; hour <= 20; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const timeStr = `${hour.toString().padStart(2, "0")}:${minute
          .toString()
          .padStart(2, "0")}`;
        slots.push(timeStr);
      }
    }
    return slots;
  };

  // Helper function to parse booking details and extract green dot information
  const parseBookingDetails = (data) => {
    if (!data) return [];

    const bookings = [];

    // Handle different data formats
    if (Array.isArray(data)) {
      // Direct array format
      bookings.push(...data);
    } else if (typeof data === "object") {
      // Object format with dates as keys
      Object.entries(data).forEach(([date, timeSlots]) => {
        if (typeof timeSlots === "object") {
          Object.entries(timeSlots).forEach(([time, slotData]) => {
            if (slotData && slotData.events && Array.isArray(slotData.events)) {
              slotData.events.forEach((event) => {
                bookings.push({
                  ...event,
                  date: date,
                  time: time,
                });
              });
            }
          });
        }
      });
    }

    // Sort bookings by date and time
    return bookings.sort((a, b) => {
      const dateA = new Date(a.start_time || a.date);
      const dateB = new Date(b.start_time || b.date);
      return dateA - dateB;
    });
  };

  // Helper function to check if a booking has a green dot (availability or hours)
  const isGreenDotBooking = (booking) => {
    if (!booking || !booking.summary) return false;

    const summary = booking.summary.toLowerCase();
    return summary.includes("availability") || summary.includes("hours");
  };

  // Get available dates and times
  const availableDates = useMemo(() => {
    console.log(
      "🔄 Regenerating available dates for teacher:",
      selectedTeacherId
    );
    const dates = generateAvailableDates();
    console.log("📅 Available dates:", dates);
    return dates;
  }, [selectedTeacherId, teacherAvailability, listViewBookingDetails]);

  const availableTimes = generateAvailableTimes(selectedScheduleDate);
  console.log("🎯 Final availableTimes:", availableTimes);

  // Update available times when selected date changes
  useEffect(() => {
    if (selectedScheduleDate) {
      const times = generateAvailableTimes(selectedScheduleDate);
      // If the currently selected time is not available for the new date, reset it
      if (selectedScheduleTime && !times.includes(selectedScheduleTime)) {
        setSelectedScheduleTime("");
      }
    }
  }, [
    selectedScheduleDate,
    teacherAvailability,
    selectedTeacherId,
    listViewBookingDetails,
  ]);

  // Handle recording options selection
  const handleRecordingOptionChange = (optionValue) => {
    setSelectedRecording((prev) => {
      if (prev.includes(optionValue)) {
        return prev.filter((item) => item !== optionValue);
      } else {
        return [...prev, optionValue];
      }
    });
  };

  const debouncedTeacherSearch = useDebounce(teacherSearchTerm, 300);
  const debouncedStudentSearch = useDebounce(studentSearchTerm, 300);

  // const allTeacherIds = availableTeachers.map((t) => String(t.id));
  // const unassignedTeachers = allTeachers.filter(
  //   (t) => !allTeacherIds.includes(String(t.id))
  // );

  // Filter teachers based on search
  // const filteredUnassignedTeachers = useMemo(() => {
  //   return unassignedTeachers.filter(
  //     (teacher) =>
  //       teacher.full_name
  //         .toLowerCase()
  //         .includes(debouncedTeacherSearch.toLowerCase()) ||
  //       teacher.uid.toLowerCase().includes(debouncedTeacherSearch.toLowerCase())
  //   );
  // }, [unassignedTeachers, debouncedTeacherSearch]);

  // Filter students based on search
  const filteredStudents = useMemo(() => {
    return availableStudents.filter((student) => {
      const searchLower = debouncedStudentSearch.toLowerCase();
      return (
        (student.deal_name &&
          student.deal_name.toLowerCase().includes(searchLower)) ||
        (student.jetlearner_id &&
          student.jetlearner_id.toLowerCase().includes(searchLower)) ||
        (student.name && student.name.toLowerCase().includes(searchLower))
      );
    });
  }, [availableStudents, debouncedStudentSearch]);

  const getTeacherNameById = (id) => {
    const teacher = allTeachers.find((t) => String(t.id) === String(id));
    return teacher ? teacher.full_name : "Unassigned";
  };

  // Common email domains for validation
  const COMMON_EMAIL_DOMAINS = [
    "gmail.com",
    "yahoo.com",
    "hotmail.com",
    "outlook.com",
  ];

  // Email validation function - accepts any valid email format
  const validateEmail = (email) => {
    if (!email.includes("@")) return false;

    const [localPart, domain] = email.split("@");
    if (!localPart || !domain) return false;

    // Basic email validation - check for valid format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Check if email has common domain for suggestion styling
  const hasCommonDomain = (email) => {
    if (!email.includes("@")) return false;

    const [localPart, domain] = email.split("@");
    if (!localPart || !domain) return false;

    // Return true if domain is in common domains list
    return COMMON_EMAIL_DOMAINS.includes(domain.toLowerCase());
  };

  // Get domain suggestions based on partial input
  const getDomainSuggestions = (email) => {
    if (!email.includes("@")) return [];

    const [localPart, domain] = email.split("@");
    if (!localPart || !domain) return [];

    const suggestions = COMMON_EMAIL_DOMAINS.filter((commonDomain) =>
      commonDomain.startsWith(domain.toLowerCase())
    );

    return suggestions.slice(0, 3); // Limit to 3 suggestions
  };

  // Validate attendees emails
  const validateAttendees = (emails) => {
    if (!emails.trim()) return { isValid: true, error: "" };

    const emailList = emails
      .split(/[,\n]/)
      .map((email) => email.trim())
      .filter((email) => email);

    for (const email of emailList) {
      if (!validateEmail(email)) {
        return {
          isValid: false,
          error: `Invalid email format: ${email}`,
        };
      }
    }

    return { isValid: true, error: "" };
  };

  // Handle attendees change with validation
  const handleAttendeesChange = (value) => {
    // Convert to lowercase automatically
    const lowercaseValue = value.toLowerCase();
    setAttendees(lowercaseValue);
    // Clear error when user starts typing
    if (attendeesError) {
      setAttendeesError("");
    }
    // Show domain suggestions if user is typing after @
    setShowDomainSuggestions(
      lowercaseValue.includes("@") && lowercaseValue.split("@")[1]?.length > 0
    );
  };

  // Handle adding email to attendees list
  const handleAddEmail = () => {
    const email = attendees.trim().toLowerCase();
    if (!email) return;

    // Basic email validation - allow any valid email format
    if (!validateEmail(email)) {
      setAttendeesError("Please enter a valid email format");
      return;
    }

    // Check if email already exists in the list
    if (
      attendeesList.some(
        (item) => item.email.toLowerCase() === email.toLowerCase()
      )
    ) {
      setAttendeesError("Email already exists in the list");
      return;
    }

    // Add email to the list (always store in lowercase)
    const newEmail = {
      id: Date.now(),
      email: email.toLowerCase(),
    };
    setAttendeesList([...attendeesList, newEmail]);
    setAttendees("");
    setAttendeesError("");
  };

  // Handle removing email from attendees list
  const handleRemoveEmail = (emailId) => {
    setAttendeesList(attendeesList.filter((item) => item.id !== emailId));
  };

  // Handle key press in attendees input
  const handleAttendeesKeyPress = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddEmail();
    }
  };

  // Handle domain suggestion selection
  const handleDomainSuggestion = (suggestion) => {
    const [localPart] = attendees.split("@");
    const newEmail = `${localPart}@${suggestion}`;
    setAttendees(newEmail);
    setShowDomainSuggestions(false);
  };

  // Handle input blur to hide suggestions
  const handleAttendeesBlur = () => {
    // Delay hiding suggestions to allow for clicks on suggestions
    setTimeout(() => {
      setShowDomainSuggestions(false);
    }, 150);
  };

  // Add schedule entry
  const addScheduleEntry = () => {
    if (!selectedScheduleDate || !selectedScheduleTime) {
      alert("Please select both date and time for the schedule entry.");
      return;
    }

    // Check maximum schedule entries
    if (scheduleEntries.length >= 3) {
      alert("Maximum 3 schedule entries can be added.");
      return;
    }

    // Validate past date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [year, month, day] = selectedScheduleDate.split("-");
    const scheduleDate = new Date(year, month - 1, day);

    if (scheduleDate < today) {
      alert("Cannot schedule for past dates. Please select a future date.");
      return;
    }

    const newEntry = {
      id: Date.now(),
      date: formatDate(selectedScheduleDate),
      time: selectedScheduleTime,
    };

    setScheduleEntries([...scheduleEntries, newEntry]);
    setSelectedScheduleDate("");
    setSelectedScheduleTime("");
  };

  // Remove schedule entry
  const removeScheduleEntry = (id) => {
    setScheduleEntries(scheduleEntries.filter((entry) => entry.id !== id));
  };

  // Add student to selection
  const addStudentToSelection = (student) => {
    const studentName = student.deal_name || student.name;
    const studentId = student.jetlearner_id || student.id;

    if (!selectedStudents.some((s) => s.id === studentId)) {
      // Check class type limits
      if (selectedClassType === "1:1" && selectedStudents.length >= 1) {
        alert("Maximum 1 learner can be selected for 1:1 class type.");
        return;
      }

      if (selectedClassType === "1:2" && selectedStudents.length >= 2) {
        alert("Maximum 2 learners can be selected for 1:2 class type.");
        return;
      }

      if (selectedStudents.length >= 10) {
        alert("Maximum 10 learners can be selected.");
        return;
      }

      setSelectedStudents([
        ...selectedStudents,
        {
          id: studentId,
          name: studentName,
          email: student.email || "",
        },
      ]);
    }
    setStudentSearchTerm("");
  };

  // Remove student from selection
  const removeStudentFromSelection = (studentId) => {
    const studentToRemove = selectedStudents.find((s) => s.id === studentId);
    setSelectedStudents(selectedStudents.filter((s) => s.id !== studentId));
  };

  const handleAddTeacher = () => {
    if (newTeacherId) {
      // Prevent duplicate add
      if (
        availableTeachers.some((t) => String(t.id) === String(newTeacherId))
      ) {
        setNewTeacherId("");
        setTeacherSearchTerm("");
        return;
      }
      onAddTeacher(newTeacherId);
      setNewTeacherId("");
      setTeacherSearchTerm("");
    }
  };

  // Validate past date booking
  const validatePastDate = (selectedDate) => {
    if (!selectedDate) return true;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [year, month, day] = selectedDate.split("-");
    const bookingDate = new Date(year, month - 1, day);

    if (bookingDate < today) {
      alert(
        "Booking cannot be done for past dates. Only Cancellation or Reschedule is Allowed."
      );
      return false;
    }
    return true;
  };

  const handleBookStudent = async () => {
    if (!studentName.trim() && selectedStudents.length === 0) {
      alert("Please select at least one student or enter a student name.");
      return;
    }

    // Set loading state
    setIsBookingLoading(true);

    // Validate attendees list
    // if (attendeesList.length === 0) {
    //   alert("Please add at least one attendee email.");
    //   setIsBookingLoading(false);
    //   return;
    // }

    // Validate schedule entries
    if (scheduleEntries.length === 0) {
      alert("Please add at least one schedule entry.");
      setIsBookingLoading(false);
      return;
    }

    // Validate class type limits
    if (selectedClassType === "1:1" && selectedStudents.length > 1) {
      alert("Maximum 1 learner can be selected for 1:1 class type.");
      setIsBookingLoading(false);
      return;
    }

    if (selectedClassType === "1:2" && selectedStudents.length > 2) {
      alert("Maximum 2 learners can be selected for 1:2 class type.");
      setIsBookingLoading(false);
      return;
    }

    // For paid bookings, validate additional fields
    if (bookingType === "paid") {
      if (!selectedSubject || !selectedClassType || !selectedClassCount) {
        alert("Please fill in all required fields for paid booking.");
        setIsBookingLoading(false);
        return;
      }

      // Validate batch number for batch class type
      if (selectedClassType === "batch" && !batchNumber.trim()) {
        alert("Please enter a batch Name for batch class type.");
        setIsBookingLoading(false);
        return;
      }
    }

    // Prepare schedule data from entries
    const schedule = scheduleEntries.map((entry) => [entry.date, entry.time]);

    // Book each selected student
    const studentsToBook =
      selectedStudents.length > 0
        ? selectedStudents
        : [{ id: Date.now().toString(), name: studentName.trim() }];

    try {
      studentsToBook.forEach((student) => {
        // Prepare API payload
        const bookingData = {
          bookingType,
          platformCredentials,
          attendees: attendeesList.map((item) => item.email).join(", "),
          schedule,
          ...(bookingType === "paid" && {
            subject: selectedSubject,
            classType: selectedClassType,
            classCount: selectedClassCount,
            recording: selectedRecording.join(", "),
            ...(selectedClassType === "batch" && {
              batchNumber: batchNumber.trim(),
            }),
          }),
          ...(bookingType === "trial" && {
            classType: "1:1",
            classCount: 1,
          }),
        };

        onBookStudent(student.name, selectedStudents, bookingData);
      });

      // Reset form
      setStudentName("");
      setSelectedTeacher("");
      setBookingType("trial");
      setSelectedSubject("");
      setSelectedClassType("");
      setSelectedClassCount("");
      setSelectedRecording([]);
      setBatchNumber("");
      setStudentSearchTerm("");
      setPlatformCredentials("");
      setAttendees("");
      setSelectedScheduleDate("");
      setSelectedScheduleTime("");
      setScheduleEntries([]);
      setSelectedStudents([]);
      setAttendeesError("");
      setAttendeesList([]);
    } catch (error) {
      console.error("Error booking student:", error);
      alert("An error occurred while booking. Please try again.");
    } finally {
      // Reset loading state
      setIsBookingLoading(false);
    }
  };

  const selectStudentFromSearch = (student) => {
    const studentName = student.deal_name || student.name;
    setStudentName(studentName);
    setStudentSearchTerm("");
  };

  if (!isOpen) return null;

  const displayDate = date ? formatDisplayDate(date) : "";
  const formatTimeInTimezone = (time, timezone) => {
    try {
      const [hours, minutes] = time.split(":");
      const date = new Date();
      date.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      return date.toLocaleTimeString("en-US", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } catch (error) {
      return time;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-3 md:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-2xl xl:max-w-4xl 2xl:max-w-5xl max-h-[85vh] sm:max-h-[80vh] md:max-h-[75vh] overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h2 className="text-base sm:text-lg md:text-xl font-bold">
                Schedule Management
              </h2>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mt-1 text-sm sm:text-base text-blue-100">
                <div className="flex items-center gap-1 sm:gap-2">
                  <FaClock size={14} className="flex-shrink-0" />
                  <span>
                    {displayDate} at {time}
                  </span>
                  <span className="text-sm">{timezone}</span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white hover:bg-white/20 p-1.5 sm:p-2 rounded-full transition-all duration-200 flex-shrink-0"
            >
              <FaTimes size={16} className="sm:w-5 sm:h-5" />
            </button>
          </div>

          <div className="overflow-y-auto max-h-[calc(85vh-90px)] sm:max-h-[calc(80vh-100px)] md:max-h-[calc(75vh-110px)] p-3 sm:p-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
              {/* Left Column - Booking Details */}
              <div className="space-y-3">
                {/* Book New Student */}
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-3 border border-green-200">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-2">
                    <div className="p-0.5 bg-green-100 rounded">
                      <FaBook size={14} className="text-green-600" />
                    </div>
                    Booking Details
                  </h3>

                  <div className="space-y-2">
                    {/* Booking Type */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-0.5">
                        Booking Type
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setBookingType("trial")}
                          className={`p-2 rounded border-2 transition-all duration-200 text-xs font-medium ${
                            bookingType === "trial"
                              ? "border-blue-500 bg-blue-50 text-blue-700"
                              : "border-gray-300 bg-white text-gray-700 hover:border-blue-300"
                          }`}
                        >
                          Trial
                        </button>
                        <button
                          type="button"
                          onClick={() => setBookingType("paid")}
                          className={`p-2 rounded border-2 transition-all duration-200 text-xs font-medium ${
                            bookingType === "paid"
                              ? "border-green-500 bg-green-50 text-green-700"
                              : "border-gray-300 bg-white text-gray-700 hover:border-green-300"
                          }`}
                        >
                          Paid
                        </button>
                      </div>
                    </div>

                    {/* Platform Credentials */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-0.5">
                        Credentials / Notes
                      </label>
                      <textarea
                        value={platformCredentials}
                        onChange={(e) => setPlatformCredentials(e.target.value)}
                        placeholder="Enter platform credentials, notes, or any additional information..."
                        rows={3}
                        className="w-full p-2 border border-gray-300 rounded text-xs text-black focus:ring-1 focus:ring-green-500 focus:border-transparent resize-none"
                      />
                    </div>

                    {/* Attendees with Email Validation */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-0.5">
                        Attendees (Email ID)
                      </label>
                      <div className="space-y-1.5">
                        <div className="relative">
                          <input
                            type="text"
                            value={attendees}
                            onChange={(e) =>
                              handleAttendeesChange(e.target.value)
                            }
                            onKeyPress={handleAttendeesKeyPress}
                            onBlur={handleAttendeesBlur}
                            placeholder="Enter email address and press Enter"
                            className={`w-full p-2 border rounded text-xs text-black focus:ring-1 focus:ring-green-500 focus:border-transparent ${
                              attendeesError
                                ? "border-red-300"
                                : hasCommonDomain(attendees) &&
                                  attendees.includes("@")
                                ? "border-green-300"
                                : "border-gray-300"
                            }`}
                            style={{
                              borderBottom:
                                hasCommonDomain(attendees) &&
                                attendees.includes("@")
                                  ? "2px solid #10b981"
                                  : undefined,
                            }}
                          />
                          <button
                            type="button"
                            onClick={handleAddEmail}
                            disabled={
                              !attendees.trim() || !validateEmail(attendees)
                            }
                            className="absolute right-2 top-1/2 -translate-y-1/2 bg-green-500 text-white p-1 rounded hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                          >
                            <FaPlus size={10} />
                          </button>
                        </div>

                        {/* Domain Suggestions */}
                        {showDomainSuggestions && attendees.includes("@") && (
                          <div className="bg-white border border-gray-200 rounded shadow-lg max-h-24 overflow-y-auto">
                            {getDomainSuggestions(attendees).map(
                              (suggestion, index) => (
                                <div
                                  key={index}
                                  onClick={() =>
                                    handleDomainSuggestion(suggestion)
                                  }
                                  className="p-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                                >
                                  <div className="flex items-center gap-2">
                                    <FaUserCheck
                                      size={10}
                                      className="text-green-600"
                                    />
                                    <span className="text-xs text-gray-700">
                                      {attendees.split("@")[0]}@{suggestion}
                                    </span>
                                  </div>
                                </div>
                              )
                            )}
                            {getDomainSuggestions(attendees).length === 0 && (
                              <div className="p-2 text-gray-500">
                                <span className="text-xs">
                                  No suggestions available
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {attendeesError && (
                          <div className="flex items-center gap-1 text-red-600">
                            <FaExclamationTriangle size={10} />
                            <span className="text-xs">{attendeesError}</span>
                          </div>
                        )}

                        {/* Attendees List */}
                        <div className="space-y-1.5 max-h-32 overflow-y-auto">
                          {attendeesList.map((emailItem) => (
                            <div
                              key={emailItem.id}
                              className="bg-white rounded p-2 border border-green-200 shadow-sm flex justify-between items-center"
                            >
                              <div className="flex items-center gap-1.5">
                                <FaUserCheck
                                  size={12}
                                  className="text-green-600"
                                />
                                <span className="text-xs font-medium text-gray-900 truncate">
                                  {emailItem.email}
                                </span>
                              </div>
                              <button
                                onClick={() => handleRemoveEmail(emailItem.id)}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50 p-0.5 rounded transition-all duration-200"
                              >
                                <FaTrash size={10} />
                              </button>
                            </div>
                          ))}
                          {attendeesList.length === 0 && (
                            <div className="text-center py-2 text-gray-500">
                              <FaUserCheck
                                size={16}
                                className="mx-auto mb-1 text-gray-300"
                              />
                              <p className="text-xs">No attendees added</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Paid Booking Options */}
                    {bookingType === "paid" && (
                      <div className="space-y-1.5 bg-green-50 p-2.5 rounded border border-green-200">
                        <h4 className="font-semibold text-green-800 text-xs">
                          Paid Booking Options
                        </h4>

                        <div className="grid grid-cols-2 gap-1.5">
                          <div>
                            <label className="block text-[10px] font-medium text-gray-700 mb-0.5">
                              Subject
                            </label>
                            <select
                              value={selectedSubject}
                              onChange={(e) =>
                                setSelectedSubject(e.target.value)
                              }
                              className="w-full p-1.5 border border-gray-300 rounded text-xs text-black focus:ring-1 focus:ring-green-500"
                            >
                              <option value="">Choose subject...</option>
                              {SUBJECTS.map((subject) => (
                                <option
                                  key={subject.value}
                                  value={subject.value}
                                >
                                  {subject.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] font-medium text-gray-700 mb-0.5">
                              Class Type
                            </label>
                            <select
                              value={selectedClassType}
                              onChange={(e) => {
                                const newClassType = e.target.value;
                                // If switching to 1:1 and already have more than 1 student, show warning
                                if (
                                  newClassType === "1:1" &&
                                  selectedStudents.length > 1
                                ) {
                                  alert(
                                    "Cannot switch to 1:1 class type. Please remove some learners first (maximum 1 allowed for 1:1)."
                                  );
                                  return;
                                }
                                // If switching to 1:2 and already have more than 2 students, show warning
                                if (
                                  newClassType === "1:2" &&
                                  selectedStudents.length > 2
                                ) {
                                  alert(
                                    "Cannot switch to 1:2 class type. Please remove some learners first (maximum 2 allowed for 1:2)."
                                  );
                                  return;
                                }

                                setSelectedClassType(newClassType);
                              }}
                              className="w-full p-1.5 border border-gray-300 rounded text-xs text-black focus:ring-1 focus:ring-green-500"
                            >
                              <option value="">Choose type...</option>
                              {CLASS_TYPES.map((type) => (
                                <option
                                  key={type.value}
                                  value={type.value}
                                  disabled={
                                    (type.value === "1:1" &&
                                      selectedStudents.length > 1) ||
                                    (type.value === "1:2" &&
                                      selectedStudents.length > 2)
                                  }
                                >
                                  {type.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] font-medium text-gray-700 mb-0.5">
                              Classes
                            </label>
                            <input
                              type="number"
                              value={selectedClassCount}
                              onChange={(e) =>
                                setSelectedClassCount(e.target.value)
                              }
                              placeholder="Enter number of classes"
                              className="w-full p-2 border border-gray-300 rounded text-xs text-black focus:ring-1 focus:ring-green-500 focus:border-transparent"
                            />
                          </div>

                          <div className="col-span-2">
                            <label className="block text-[10px] font-medium text-gray-700 mb-0.5">
                              Add More Details
                            </label>
                            <div className="space-y-1.5 border border-gray-300 rounded p-2 bg-white">
                              {RECORDING_OPTIONS.map((option) => (
                                <label
                                  key={option.value}
                                  className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded transition-colors"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedRecording.includes(
                                      option.value
                                    )}
                                    onChange={() =>
                                      handleRecordingOptionChange(option.value)
                                    }
                                    className="w-3 h-3 text-green-600 border-gray-300 rounded focus:ring-green-500 focus:ring-1"
                                  />
                                  <span className="text-xs text-gray-700">
                                    {option.label}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>

                          {/* Batch Number Input - Only show when class type is Batch */}
                          {selectedClassType === "batch" && (
                            <div className="col-span-2">
                              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">
                                Batch Name
                              </label>
                              <input
                                type="text"
                                value={batchNumber}
                                onChange={(e) => setBatchNumber(e.target.value)}
                                placeholder="Enter Batch Name"
                                className="w-full p-2 border border-gray-300 rounded text-xs text-black focus:ring-1 focus:ring-green-500 focus:border-transparent"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Teacher Selection */}
                    {/* <select
                    value={selectedTeacher}
                    onChange={(e) => setSelectedTeacher(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-green-500"
                  >
                    <option value="">Assign Teacher</option>
                    {availableTeachers.map(t => (
                      <option key={t.id} value={t.id}>{t.full_name}-{t.uid}</option>
                    ))}
                  </select> */}

                    <button
                      onClick={handleBookStudent}
                      disabled={
                        (!studentName.trim() &&
                          selectedStudents.length === 0) ||
                        isBookingLoading
                      }
                      className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white py-2 rounded hover:from-green-700 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-1.5 font-medium text-xs"
                    >
                      <FaBook size={14} />
                      {isBookingLoading ? "Booking..." : "Book Learners"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column - Schedule and Students */}
              <div className="space-y-3">
                {/* Schedule Section */}
                <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-3 border border-blue-200">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-2">
                    <div className="p-0.5 bg-blue-100 rounded">
                      <FaCalendarAlt size={14} className="text-blue-600" />
                    </div>
                    Schedule
                    {selectedTeacherId && !listViewBookingDetails && (
                      <span className="bg-green-100 text-green-800 text-xs font-medium px-1.5 py-0.5 rounded-full">
                        Teacher Filtered
                      </span>
                    )}
                    <span className="bg-blue-100 text-blue-800 text-xs font-medium px-1.5 py-0.5 rounded-full">
                      {scheduleEntries.length}/3
                    </span>
                  </h3>

                  <div className="space-y-2">
                    {/* Schedule Entry Form */}
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-0.5">
                          Date{" "}
                          {listViewBookingDetails
                            ? ""
                            : selectedTeacherId && "(Teacher Availability)"}
                        </label>
                        <div className="relative calendar-container">
                          <button
                            onClick={() => setCalendarOpen(!calendarOpen)}
                            className="w-full p-2 border border-gray-300 rounded text-xs text-black focus:ring-1 focus:ring-blue-500 focus:border-transparent bg-white flex items-center justify-between"
                          >
                            <span
                              className={
                                selectedScheduleDate
                                  ? "text-gray-900"
                                  : "text-gray-500"
                              }
                            >
                              {selectedScheduleDate
                                ? (() => {
                                    const dateObj = new Date(
                                      selectedScheduleDate
                                    );
                                    const day = dateObj
                                      .getDate()
                                      .toString()
                                      .padStart(2, "0");
                                    const month = (dateObj.getMonth() + 1)
                                      .toString()
                                      .padStart(2, "0");
                                    const year = dateObj.getFullYear();
                                    const formattedDate = `${day}-${month}-${year}`;
                                    return `${formattedDate} (${getDayName(
                                      formattedDate
                                    )})`;
                                  })()
                                : "Select date..."}
                            </span>
                            <FaCalendarAlt
                              size={12}
                              className="text-gray-400"
                            />
                          </button>

                          {calendarOpen && (
                            <div className="absolute top-full left-0 right-0 z-50 bg-white border border-gray-300 rounded-lg shadow-lg mt-1 p-3 min-w-[280px]">
                              <div className="flex items-center justify-between mb-3">
                                <button
                                  onClick={() => {
                                    const currentDate = new Date(calendarDate);
                                    currentDate.setMonth(
                                      currentDate.getMonth() - 1
                                    );
                                    setCalendarDate(currentDate);
                                  }}
                                  className="p-2 hover:bg-gray-100 rounded border border-gray-200 transition-colors duration-200 flex items-center justify-center"
                                  title="Previous month"
                                >
                                  <FaChevronLeft
                                    size={14}
                                    className="text-gray-600"
                                  />
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
                                    currentDate.setMonth(
                                      currentDate.getMonth() + 1
                                    );
                                    setCalendarDate(currentDate);
                                  }}
                                  className="p-2 hover:bg-gray-100 rounded border border-gray-200 transition-colors duration-200 flex items-center justify-center"
                                  title="Next month"
                                >
                                  <FaChevronRight
                                    size={14}
                                    className="text-gray-600"
                                  />
                                </button>
                              </div>

                              <div className="grid grid-cols-7 gap-1 mb-2">
                                {[
                                  "Sun",
                                  "Mon",
                                  "Tue",
                                  "Wed",
                                  "Thu",
                                  "Fri",
                                  "Sat",
                                ].map((day) => (
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
                                  const lastDay = new Date(year, month + 1, 0);
                                  const startDate = new Date(firstDay);
                                  startDate.setDate(
                                    startDate.getDate() - firstDay.getDay()
                                  );

                                  const days = [];
                                  for (let i = 0; i < 42; i++) {
                                    const date = new Date(startDate);
                                    date.setDate(startDate.getDate() + i);

                                    const isCurrentMonth =
                                      date.getMonth() === month;
                                    const isToday =
                                      date.toDateString() ===
                                      new Date().toDateString();
                                    const isSelected =
                                      selectedScheduleDate &&
                                      date.toDateString() ===
                                        new Date(
                                          selectedScheduleDate
                                        ).toDateString();
                                    const isAvailable = availableDates.some(
                                      (availableDate) =>
                                        new Date(
                                          availableDate
                                        ).toDateString() === date.toDateString()
                                    );

                                    const dayString = `${date.getFullYear()}-${String(
                                      date.getMonth() + 1
                                    ).padStart(2, "0")}-${String(
                                      date.getDate()
                                    ).padStart(2, "0")}`;

                                    days.push(
                                      <button
                                        key={i}
                                        onClick={() => {
                                          if (isAvailable) {
                                            setSelectedScheduleDate(dayString);
                                            setCalendarOpen(false);
                                          }
                                        }}
                                        disabled={!isAvailable}
                                        className={`
                                          w-8 h-8 text-xs rounded flex items-center justify-center transition-all duration-200
                                          ${
                                            !isCurrentMonth
                                              ? "text-gray-300"
                                              : ""
                                          }
                                          ${
                                            isToday
                                              ? "bg-blue-100 text-blue-700 font-semibold"
                                              : ""
                                          }
                                          ${
                                            isSelected
                                              ? "bg-blue-600 text-white font-semibold"
                                              : ""
                                          }
                                          ${
                                            isAvailable &&
                                            isCurrentMonth &&
                                            !isToday &&
                                            !isSelected
                                              ? "hover:bg-blue-50 text-gray-700 border-2 border-green-300 bg-green-50"
                                              : ""
                                          }
                                          ${
                                            !isAvailable && isCurrentMonth
                                              ? "text-gray-400 cursor-not-allowed"
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
                                    {selectedTeacherId
                                      ? `Teacher ${selectedTeacherId}`
                                      : "selected teacher"}
                                  </span>
                                </div>
                                {availableDates.length === 0 && (
                                  <div className="text-xs text-red-500 mt-1">
                                    No available dates for this teacher
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-0.5">
                          Time{" "}
                          {listViewBookingDetails
                            ? ""
                            : selectedTeacherId && "(Teacher Availability)"}
                        </label>
                        <select
                          value={selectedScheduleTime}
                          onChange={(e) =>
                            setSelectedScheduleTime(e.target.value)
                          }
                          className="w-full p-2 border border-gray-300 rounded text-xs text-black focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="">Select time...</option>
                          {availableTimes.length > 0 ? (
                            availableTimes.map((slot) => {
                              console.log(
                                "Time slot:",
                                slot,
                                "Type:",
                                typeof slot,
                                "Length:",
                                slot?.length
                              );
                              return (
                                <option key={slot} value={slot}>
                                  {slot}
                                </option>
                              );
                            })
                          ) : (
                            <option value="" disabled>
                              {listViewBookingDetails
                                ? "No green dots for selected date in list view"
                                : selectedTeacherId
                                ? `No available times for Teacher ${selectedTeacherId} on selected date`
                                : "No available times for selected date"}
                            </option>
                          )}
                        </select>
                      </div>
                    </div>

                    <button
                      onClick={addScheduleEntry}
                      disabled={
                        !selectedScheduleDate ||
                        !selectedScheduleTime ||
                        scheduleEntries.length >= 3
                      }
                      className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white py-2 rounded hover:from-blue-700 hover:to-cyan-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-1.5 font-medium text-xs"
                    >
                      <FaPlus size={12} />
                      Add Schedule Entry {scheduleEntries.length}/3
                    </button>

                    {/* Schedule Entries List */}
                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                      {scheduleEntries.map((entry) => (
                        <div
                          key={entry.id}
                          className="bg-white rounded p-2 border border-blue-200 shadow-sm flex justify-between items-center"
                        >
                          <div className="flex items-center gap-1.5">
                            <FaCalendarAlt
                              size={12}
                              className="text-blue-600"
                            />
                            <span className="text-xs font-medium text-gray-900">
                              {entry.date} ({getDayName(entry.date)}) at{" "}
                              {entry.time}
                            </span>
                          </div>
                          <button
                            onClick={() => removeScheduleEntry(entry.id)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 p-0.5 rounded transition-all duration-200"
                          >
                            <FaTrash size={10} />
                          </button>
                        </div>
                      ))}
                      {scheduleEntries.length === 0 && (
                        <div className="text-center py-2 text-gray-500">
                          <FaCalendarAlt
                            size={16}
                            className="mx-auto mb-1 text-gray-300"
                          />
                          <p className="text-xs">No schedule entries added</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Student Selection */}
                <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg p-3 border border-purple-200">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-2">
                    <div className="p-0.5 bg-purple-100 rounded">
                      <FaGraduationCap size={14} className="text-purple-600" />
                    </div>
                    Selected Learners
                    <span className="bg-purple-100 text-purple-800 text-xs font-medium px-1.5 py-0.5 rounded-full">
                      {selectedStudents.length}/
                      {selectedClassType === "1:1"
                        ? "1"
                        : selectedClassType === "1:2"
                        ? "2"
                        : "10"}
                    </span>
                  </h3>

                  <div className="space-y-2">
                    {/* Student Search */}
                    <div className="space-y-1.5">
                      <div className="relative">
                        <FaSearch
                          size={14}
                          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                        />
                        <input
                          type="text"
                          value={studentSearchTerm}
                          onChange={(e) => setStudentSearchTerm(e.target.value)}
                          placeholder="Search Learners..."
                          className="w-full pl-8 pr-2.5 py-2 border border-gray-300 rounded text-xs text-black focus:ring-1 focus:ring-purple-500 focus:border-transparent"
                        />
                      </div>

                      {studentSearchTerm.trim() &&
                        filteredStudents.length > 0 && (
                          <div className="max-h-28 overflow-y-auto border border-gray-200 rounded">
                            {filteredStudents.slice(0, 10).map((student) => {
                              const isLimitReached =
                                (selectedClassType === "1:1" &&
                                  selectedStudents.length >= 1) ||
                                (selectedClassType === "1:2" &&
                                  selectedStudents.length >= 2);
                              return (
                                <div
                                  key={student.id || student.jetlearner_id}
                                  onClick={() => addStudentToSelection(student)}
                                  className={`p-2 border-b border-gray-100 last:border-b-0 ${
                                    isLimitReached
                                      ? "bg-gray-100 cursor-not-allowed opacity-60"
                                      : "hover:bg-gray-50 cursor-pointer"
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <FaGraduationCap
                                      size={12}
                                      className="text-purple-600"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium text-gray-900 truncate">
                                        {student.deal_name || student.name}
                                      </p>
                                      <p className="text-[10px] text-gray-500 truncate">
                                        {student.jetlearner_id}
                                        {student.country &&
                                          `•${student.country}`}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                    </div>

                    {/* Manual Student Entry */}
                    {/* <div>
                    <label className="block text-xs font-medium text-gray-700 mb-0.5">Manual Entry</label>
                    <input
                      type="text"
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      placeholder="Enter learner name manually"
                      className="w-full p-2 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div> */}

                    {/* Selected Students List */}
                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                      {selectedStudents.map((student) => (
                        <div
                          key={student.id}
                          className="bg-white rounded p-2 border border-purple-200 shadow-sm flex justify-between items-center"
                        >
                          <div className="flex items-center gap-1.5">
                            <FaGraduationCap
                              size={12}
                              className="text-purple-600"
                            />
                            <span className="text-xs font-medium text-gray-900 truncate">
                              {student.name}({student.id})
                            </span>
                          </div>
                          <button
                            onClick={() =>
                              removeStudentFromSelection(student.id)
                            }
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 p-0.5 rounded transition-all duration-200"
                          >
                            <FaTrash size={10} />
                          </button>
                        </div>
                      ))}
                      {selectedStudents.length === 0 &&
                        studentName.trim() === "" && (
                          <div className="text-center py-2 text-gray-500">
                            <FaGraduationCap
                              size={16}
                              className="mx-auto mb-1 text-gray-300"
                            />
                            <p className="text-xs">No learners selected</p>
                          </div>
                        )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const UnifiedModal = React.memo(UnifiedModalComponent);
export default UnifiedModal;
