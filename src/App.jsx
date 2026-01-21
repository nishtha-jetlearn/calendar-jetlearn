import React, {
  useState,
  useMemo,
  useEffect,
  useCallback,
  Suspense,
} from "react";
import {
  FaUsers,
  FaGraduationCap,
  FaBook,
  FaUserCheck,
  FaSearch,
  FaCalendarAlt,
  FaGlobe,
  FaClock,
  FaChevronLeft,
  FaChevronRight,
  FaChevronDown,
  FaTimes,
  FaCheckCircle,
  FaExclamationTriangle,
  FaPaperPlane,
  FaFilter,
  FaChalkboardTeacher,
  FaUserGraduate,
  FaList,
  FaCalendarWeek,
  FaBars,
  FaInfoCircle,
  FaSignOutAlt,
  FaTrash,
  FaPlus,
  FaEdit,
  FaCheck,
  FaSync,
  FaDownload,
  FaSave,
  FaFile,
  FaPaperclip,
} from "react-icons/fa";
import { MdManageAccounts } from "react-icons/md";
import UnifiedModal from "./components/UnifiedModal";
import TeacherDetails from "./components/TeacherDetails";
import StudentDetails from "./components/StudentDetails";
import EnhancedTeacherSearch from "./components/EnhancedTeacherSearch";
import EnhancedStudentSearch from "./components/EnhancedStudentSearch";
import EnhancedTimezoneSearch from "./components/EnhancedTimezoneSearch";
import LoginPage from "./pages/LoginPage";
import { useAuth } from "./contexts/AuthContext";
import { usePermissions } from "./hooks/usePermissions";
import PermissionDisplay from "./components/PermissionDisplay";
import {
  getWeekDates,
  formatDate,
  formatShortDate,
  getDayName,
  getCurrentWeekStart,
  formatDisplayDate,
  isLockedHoliday,
} from "./utils/dateUtils";

// Helper function to format datetime to UTC format for API
const formatDateTimeToUTC = (date, timeRange, selectedTimezone) => {
  try {
    // Extract start time from timeRange (e.g., "10:00 - 11:00" -> "10:00")
    const startTime = timeRange.split(" - ")[0];

    // Extract timezone offset from selectedTimezone (e.g., "(GMT+02:00) CET" -> +02:00)
    const match = selectedTimezone.match(/GMT([+-]\d{2}):(\d{2})/);
    if (!match) {
      console.error("Invalid timezone format:", selectedTimezone);
      return null;
    }

    const offsetHours = parseInt(match[1], 10); // +02 or -05
    const offsetMinutes = parseInt(match[2], 10); // 00 or 30

    // Parse the start time
    const [startHour, startMinute] = startTime.split(":").map(Number);

    // Create date components
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-based
    const day = date.getDate();

    // Create UTC date directly to avoid timezone interpretation issues
    // This creates a date in UTC with the given date and time
    const utcBaseDate = new Date(
      Date.UTC(year, month, day, startHour, startMinute, 0, 0)
    );

    // Now we need to adjust for the timezone offset
    // If the selected timezone is GMT+02:00 and the time is 16:00,
    // that means it's actually 14:00 UTC (16:00 - 2 hours)
    // So we subtract the offset to get the correct UTC time
    const totalOffsetMinutes = offsetHours * 60 + offsetMinutes;
    const utcDateTime = new Date(
      utcBaseDate.getTime() - totalOffsetMinutes * 60000
    );

    // Format to UTC string in the required format: "YYYY-MM-DD HH:MM"
    const utcYear = utcDateTime.getUTCFullYear();
    const utcMonth = String(utcDateTime.getUTCMonth() + 1).padStart(2, "0");
    const utcDay = String(utcDateTime.getUTCDate()).padStart(2, "0");
    const utcHours = String(utcDateTime.getUTCHours()).padStart(2, "0");
    const utcMinutes = String(utcDateTime.getUTCMinutes()).padStart(2, "0");

    const result = `${utcYear}-${utcMonth}-${utcDay} ${utcHours}:${utcMinutes}`;

    console.log("🌍 Final UTC result:", result);

    return result;
  } catch (error) {
    console.error("Error formatting datetime to UTC:", error);
    return null;
  }
};

// API function to reject/delete availability
const rejectAvailability = async (
  teacherEmail,
  teacherId,
  eventId,
  updatedBy
) => {
  try {
    const requestBody = {
      teacher_email: teacherEmail,
      teacher_id: teacherId,
      event_id: eventId,
      updated_by: updatedBy,
    };
    
    console.log("🗑️ Rejecting availability with payload:", requestBody);
    
    const response = await fetch(
      "https://live.jetlearn.com/api/reject-availability/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error("Error rejecting availability:", error);
    return { success: false, error: error.message };
  }
};

// API function to freeze a slot
const freezeSlot = async (teacherUid, slotDateTime, userId, sessionId) => {
  try {
    const response = await fetch("https://live.jetlearn.com/api/freeze-slot/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        teacher_uid: teacherUid,
        slot_datetime: slotDateTime,
        user_id: userId,
      }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Check if the slot is held by another user
    if (
      data.status === "held" &&
      data.message !== "Slot successfully frozen" &&
      data.message !== "Slot already held by you"
    ) {
      return {
        success: false,
        held: true,
        message: data.message || "This slot is currently held by another user",
      };
    }

    return { success: true, data };
  } catch (error) {
    console.error("Error freezing slot:", error);
    return { success: false, error: error.message };
  }
};

// Helper function to check if a teacher is on leave for a specific date
const isTeacherOnLeave = (teacherEmail, date, teacherLeaves) => {
  if (!teacherLeaves?.success || !teacherLeaves?.leaves) {
    return false;
  }

  const dateStr = formatDate(date);
  const leaves = teacherLeaves.leaves[dateStr];

  // Check if leaves object exists (it's an object, not an array)
  const hasLeaves = leaves && typeof leaves === "object" && leaves.id;

  // Debug logging (can be removed in production)

  return hasLeaves;
};

// Helper function to check if a teacher has week off for a specific date
const isTeacherWeekOff = (teacherEmail, date, availabilitySummary) => {
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
const getTeacherEmailFromEvent = (eventData, selectedTeacher, teachers) => {
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

const TIME_SLOTS = Array.from(
  { length: 24 },
  (_, i) => `${String(i).padStart(2, "0")}:00`
);

// Utility function to safely log errors and filter extension errors
const safeErrorLog = (message, error) => {
  // Filter out extension-related errors
  const extensionKeywords = [
    "writing",
    "template",
    "permission error",
    "chrome-extension",
    "extension",
    "content.js",
    "content_script",
    "background.js",
    "popup.js",
    "httpError: false",
    "httpStatus: 200",
    "code: 403",
  ];

  const errorMessage = error?.message || error?.toString() || "";
  const errorCode = error?.code;
  const httpStatus = error?.httpStatus;

  // Check for specific extension error patterns
  const isExtensionError =
    extensionKeywords.some((keyword) =>
      errorMessage.toLowerCase().includes(keyword.toLowerCase())
    ) ||
    // Check for the specific error pattern: code: 403 with httpStatus: 200
    (errorCode === 403 && httpStatus === 200) ||
    // Check if error has extension-like properties
    (error?.httpError === false && error?.code === 403) ||
    // Check stack trace for extension files
    (error?.stack && error.stack.includes("content.js")) ||
    (error?.stack && error.stack.includes("extension")) ||
    // Check for permission error name pattern
    (error?.name === "i" && error?.code === 403);

  if (!isExtensionError) {
    console.error(`❌ ${message}:`, error);
    return true; // Error was logged
  } else {
    // Silently ignore extension errors
    console.log("🔇 Extension error filtered:", {
      code: error?.code,
      name: error?.name,
    });
    return false; // Error was filtered out
  }
};

function App() {
  const { isAuthenticated, isLoading, logout, user } = useAuth();
  const {
    canAddBooking,
    canEditDeleteBooking,
    canAddTeacherAvailability,
    canDeleteTeacherAvailability,
  } = usePermissions();

  // Helper function to check if user has access to add leaves (tp, trial, admin, or tech team only)
  const canAddLeaves = () => {
    if (!user) return false;
    const team =
      user.team ||
      user.role ||
      user.fullUser?.team ||
      user.fullUser?.role ||
      "";
    return (
      team === "tp" || team === "trial" || team === "admin" || team === "tech"
    );
  };

  // Show loading screen while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Check URL parameters on page load (runs regardless of authentication)

  // Add global error boundary for unhandled promises

  useEffect(() => {
    const handleUnhandledRejection = (event) => {
      // Check for specific extension error patterns
      const reason = event.reason;

      // Specific check for the content.js error pattern
      if (
        reason &&
        ((reason.name === "i" && reason.code === 403) ||
          (reason.httpError === false &&
            reason.httpStatus === 200 &&
            reason.code === 403) ||
          (typeof reason === "object" &&
            reason.code === 403 &&
            reason.httpStatus === 200))
      ) {
        console.log("🔇 Blocked extension error (content.js):", {
          name: reason.name,
          code: reason.code,
          httpStatus: reason.httpStatus,
          source: "Browser Extension",
        });
        event.preventDefault();
        return;
      }

      // Use the safe error logging utility for other errors
      const wasLogged = safeErrorLog(
        "Unhandled Promise Rejection",
        event.reason
      );

      // Prevent the error from appearing in console for extension-related errors
      if (!wasLogged) {
        event.preventDefault();
      }
    };

    const handleError = (event) => {
      // Check if error originates from content.js or extension
      if (
        event.filename &&
        (event.filename.includes("content.js") ||
          event.filename.includes("extension") ||
          event.filename.includes("chrome-extension"))
      ) {
        console.log("🔇 Blocked extension error (script):", {
          filename: event.filename,
          message: event.message,
          source: "Browser Extension",
        });
        event.preventDefault();
        return;
      }

      // Use the safe error logging utility
      const wasLogged = safeErrorLog("Global Error", event.error);

      // Prevent the error from appearing in console for extension-related errors
      if (!wasLogged) {
        event.preventDefault();
      }
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("error", handleError);

    return () => {
      window.removeEventListener(
        "unhandledrejection",
        handleUnhandledRejection
      );
      window.removeEventListener("error", handleError);
    };
  }, []);

  const [currentWeekStart, setCurrentWeekStart] = useState(
    getCurrentWeekStart()
  );

  const [schedule, setSchedule] = useState(() => {
    const initialSchedule = {};
    return initialSchedule;
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);

  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);

  // State for timezones
  const [timezones, setTimezones] = useState([]);
  const [selectedTimezone, setSelectedTimezone] = useState("(GMT+02:00) CET");

  // Utility function to format timezone for API calls (replace spaces with underscores)
  const formatTimezoneForAPI = (timezone) => {
    return timezone.replace(/(.*\)) (.+)/, (match, prefix, tz) => {
      return `${prefix} ${tz.replace(/ /g, "_")}`;
    });
  };

  // State for students from API
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState(null);

  // State for learner calendar stats
  const [learnerCalendarStats, setLearnerCalendarStats] = useState(null);
  const [learnerCalendarStatsLoading, setLearnerCalendarStatsLoading] =
    useState(false);
  const [learnerCalendarStatsError, setLearnerCalendarStatsError] =
    useState(null);

  // State for teachers from API
  const [teachers, setTeachers] = useState([]);
  const [teachersLoading, setTeachersLoading] = useState(true);
  const [teachersError, setTeachersError] = useState(null);

  // New state for details popup
  const [detailsPopup, setDetailsPopup] = useState({
    isOpen: false,
    type: null, // 'availability' or 'booking'
    data: null,
    date: null,
    time: null,
  });

  // New state for cancel popup
  const [cancelPopup, setCancelPopup] = useState({
    isOpen: false,
    type: null, // 'availability' or 'booking'
    data: null,
    date: null,
    time: null,
    reason: "",
    studentDetails: null,
    teacherDetails: null,
    classCount: 1, // Default class count
    isLoading: false,
  });

  // State for booking API response
  const [bookingApiResponse, setBookingApiResponse] = useState({
    isLoading: false,
    success: false,
    error: null,
    data: null,
  });

  // New state for availability API
  const [availabilityAPI, setAvailabilityAPI] = useState({
    isLoading: false,
    success: false,
    error: null,
    response: null,
  });

  // New state for list view booking details
  const [listViewBookingDetails, setListViewBookingDetails] = useState({
    isLoading: false,
    success: false,
    error: null,
    data: null,
  });

  // State for schedule management popup
  const [scheduleManagementPopup, setScheduleManagementPopup] = useState({
    isOpen: false,
    isLoading: false,
    selectedSchedule: null, // Store selected schedule from Edit/Reschedule popup
    teacherUid: null, // Store teacher UID for availability checking
    onScheduleUpdate: null, // Callback to update schedule in Edit/Reschedule popup
  });

  // State for attendees in schedule management popup
  const [attendeesList, setAttendeesList] = useState([]);
  const [attendees, setAttendees] = useState("");
  const [attendeesError, setAttendeesError] = useState("");
  const [showDomainSuggestions, setShowDomainSuggestions] = useState(false);

  // State for schedule entries in schedule management popup
  const [scheduleEntries, setScheduleEntries] = useState([]);
  const [selectedScheduleDate, setSelectedScheduleDate] = useState("");
  const [selectedScheduleTime, setSelectedScheduleTime] = useState("");
  const [platformCredentials, setPlatformCredentials] = useState("");
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfFileName, setPdfFileName] = useState("");

  // Debug: Log selectedScheduleDate changes
  useEffect(() => {}, [
    selectedScheduleDate,
    selectedScheduleTime,
    scheduleEntries,
  ]);

  // Enhanced state for better API integration
  const [weeklyApiData, setWeeklyApiData] = useState({});
  const [apiDataLoading, setApiDataLoading] = useState(false);
  const [apiDataError, setApiDataError] = useState(null);

  // State for storing new teacher's availability data separately (when teacher is changed in edit popup)
  const [newTeacherAvailabilityData, setNewTeacherAvailabilityData] = useState(
    {}
  );

  // State for availability saving
  const [isSavingAvailability, setIsSavingAvailability] = useState(false);

  // State for booking loading
  const [isBookingLoading, setIsBookingLoading] = useState(false);

  // State for general operations loading (delete, update, cancel)
  const [isOperationLoading, setIsOperationLoading] = useState(false);

  // State for teacher leaves
  const [teacherLeaves, setTeacherLeaves] = useState({
    isLoading: false,
    success: false,
    error: null,
    data: null,
    leaves: {}, // Will store dates as keys with leave details
  });

  // Add pagination state
  const [pagination, setPagination] = useState({
    currentPage: 1,
    itemsPerPage: 10,
    totalItems: 0,
  });

  // Add pagination for popup data
  const [popupPagination, setPopupPagination] = useState({
    currentPage: 1,
    itemsPerPage: 5,
    totalItems: 0,
  });

  // Add view state
  const [currentView, setCurrentView] = useState("week"); // 'list' or 'week'

  // Add pagination for main calendar view
  const [calendarPagination, setCalendarPagination] = useState({
    currentPage: 1,
    itemsPerPage: 12, // Show 12 time slots per page
    totalItems: TIME_SLOTS.length,
  });

  // Add mobile sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // New state for success messages
  const [successMessage, setSuccessMessage] = useState({
    show: false,
    message: "",
    type: "", // 'booking', 'cancel', 'no-show'
  });

  // New state to track individual toasters for each slot
  const [slotToasters, setSlotToasters] = useState({});

  // Date range filter state - initialize with current week's start and end dates
  const [dateRangeFilter, setDateRangeFilter] = useState({
    startDate: null,
    endDate: null,
    isActive: false,
  });

  // New state to track clicked slots (to prevent plus icon from showing again until deleted)
  const [clickedSlots, setClickedSlots] = useState(new Set());

  // Global repeat occurrence state for all toasters
  const [globalRepeatOccurrence, setGlobalRepeatOccurrence] = useState(1);

  // State for action menu dropdown
  const [actionMenuOpen, setActionMenuOpen] = useState(null);

  // State for booking details popup
  const [bookingDetailsPopup, setBookingDetailsPopup] = useState({
    isOpen: false,
    data: null,
    date: null,
    time: null,
  });

  // New state for Edit/Reschedule popup
  const [editReschedulePopup, setEditReschedulePopup] = useState({
    isOpen: false,
    data: null,
    date: null,
    time: null,
    isLoading: false,
  });

  // New state for confirmation popup
  const [confirmationPopup, setConfirmationPopup] = useState({
    isOpen: false,
    type: null, // 'delete-booking' or 'cancel-availability'
    title: "",
    message: "",
    data: null,
    date: null,
    time: null,
    eventId: null,
    onConfirm: null,
    upcomingEvents: false, // New field for upcoming events checkbox
  });

  // State for apply leave popup
  const [applyLeavePopup, setApplyLeavePopup] = useState({
    isOpen: false,
    startDate: "",
    startTime: "00:00",
    endDate: "",
    endTime: "23:00",
    reason: "",
    isLoading: false,
    errors: {
      startDate: "",
      endDate: "",
      reason: "",
    },
  });

  // Update popup pagination when details popup changes
  useEffect(() => {
    if (detailsPopup.isOpen) {
      setPopupPagination((prev) => ({
        ...prev,
        currentPage: 1, // Reset to first page when popup opens
      }));
    }
  }, [detailsPopup.isOpen, detailsPopup.type]);

  // Reset main pagination when list view data changes
  useEffect(() => {
    if (listViewBookingDetails.success && listViewBookingDetails.data) {
      setPagination((prev) => ({
        ...prev,
        currentPage: 1, // Reset to first page when new data is loaded
      }));
    }
  }, [listViewBookingDetails.data]);

  // Reset pagination when switching to list view
  useEffect(() => {
    if (currentView === "list") {
      setPagination((prev) => ({
        ...prev,
        currentPage: 1, // Reset to first page when switching to list view
      }));
    }
  }, [currentView]);

  // Initialize clean console and setup
  useEffect(() => {
    console.clear();
    console.log(
      "🔧 Error Filtering: Active (Extension errors will be filtered)"
    );
    console.log("---");

    // Override console.error to filter extension errors
    const originalConsoleError = console.error;
    console.error = (...args) => {
      const errorStr = args.join(" ").toLowerCase();

      // Check if this is an extension error
      if (
        errorStr.includes("content.js") ||
        (errorStr.includes("uncaught (in promise)") &&
          errorStr.includes("code: 403")) ||
        (errorStr.includes("httpstatus: 200") &&
          errorStr.includes("code: 403")) ||
        (errorStr.includes("name: 'i'") && errorStr.includes("code: 403")) ||
        errorStr.includes("permission error") ||
        errorStr.includes("chrome-extension")
      ) {
        console.log("🔇 Extension error blocked from console:", args[0]);
        return; // Don't log the error
      }

      // Log normal errors
      originalConsoleError.apply(console, args);
    };

    // Cleanup function to restore original console.error
    return () => {
      console.error = originalConsoleError;
    };
  }, []);

  // Check URL parameters on page load (after console.clear)
  useEffect(() => {
    console.log("📍 Current search params:", window.location.search);

    // Simple test to make sure console is working
    console.log("🧪 TEST: Console is working!");
  }, []);

  // Handle click outside to close action menu
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Check if click is outside the dropdown menu
      const dropdownMenus = document.querySelectorAll("[data-dropdown-menu]");
      const isClickInsideDropdown = Array.from(dropdownMenus).some((menu) =>
        menu.contains(event.target)
      );

      if (actionMenuOpen !== null && !isClickInsideDropdown) {
        setActionMenuOpen(null);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [actionMenuOpen]);

  // Fetch timezones from the API
  useEffect(() => {
    const fetchTimezones = async () => {
      try {
        const response = await fetch(
          "https://live.jetlearn.com/api/get_timezones/"
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        // console.log(data);

        if (data) {
          setTimezones(data);
          // Set a default selected timezone if it exists in the fetched list
          if (data.length > 0) {
            // Find UTC timezone in the list (could be "UTC" or "(GMT+00:00) UTC")
            const CETTimezone = data.find(
              (tz) =>
                tz === "CET" ||
                tz === "(GMT+02:00) CET" ||
                (tz.includes("CET") && tz.includes("GMT+"))
            );
            if (CETTimezone) {
              setSelectedTimezone(CETTimezone);
            } else {
              // Fallback to first timezone if UTC not found
              setSelectedTimezone(data[0]);
            }
          }
        }
      } catch (error) {
        console.error("❌ Failed to fetch timezones:", error);
      }
    };

    // Use setTimeout to prevent unhandled promise rejection
    fetchTimezones().catch((err) => {
      console.error("❌ Unhandled error in fetchTimezones:", err);
    });
  }, []); // Empty dependency array ensures this runs once on mount

  // Fetch teachers from the API
  useEffect(() => {
    const fetchTeachers = async () => {
      try {
        setTeachersLoading(true);
        setTeachersError(null);

        const response = await fetch(
          "https://live.jetlearn.com/athena/teachers/"
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // The API returns an array of teacher objects directly
        if (Array.isArray(data)) {
          setTeachers(data);
        } else {
          console.warn("API response is not an array:", data);
          setTeachers([]);
        }
      } catch (error) {
        console.error("❌ Failed to fetch teachers:", error);
        setTeachersError(error.message);
        // Fallback to empty array on error
        setTeachers([]);
      } finally {
        setTeachersLoading(false);
      }
    };

    // Use setTimeout to prevent unhandled promise rejection
    fetchTeachers().catch((err) => {
      console.error("❌ Unhandled error in fetchTeachers:", err);
    });
  }, []); // Empty dependency array ensures this runs once on mount

  // Fetch students from the API
  useEffect(() => {
    const fetchStudents = async () => {
      try {
        setStudentsLoading(true);
        setStudentsError(null);

        const response = await fetch(
          "https://live.jetlearn.com/hs/search-learner/"
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // The API returns an array of student objects directly
        if (Array.isArray(data)) {
          setStudents(data);
        } else {
          console.warn("API response is not an array:", data);
          setStudents([]);
        }
      } catch (error) {
        console.error("❌ Failed to fetch students:", error);
        setStudentsError(error.message);
        // Fallback to empty array on error
        setStudents([]);
      } finally {
        setStudentsLoading(false);
      }
    };

    // Use setTimeout to prevent unhandled promise rejection
    fetchStudents().catch((err) => {
      console.error("❌ Unhandled error in fetchStudents:", err);
    });
  }, []); // Empty dependency array ensures this runs once on mount

  // Enhanced function to get teacher details by teacherid
  const getTeacherByTeacherId = (teacherId) => {
    // Null/undefined check
    if (!teacherId) return null;

    return teachers.find(
      (teacher) =>
        teacher.uid === teacherId ||
        teacher.id.toString() === teacherId.toString()
    );
  };

  // Fetch weekly availability data from API
  const fetchWeeklyAvailabilityData = async (
    weekStartDate,
    teacherUid = null,
    jlid = null,
    timezone = null
  ) => {
    try {
      console.log("passed teacherUid param:", teacherUid);
      console.log("passed jlid param:", jlid);
      console.log("passed timezone param:", timezone);
      setApiDataError(null);
      const weekDates = getWeekDates(weekStartDate);

      // Use filtered dates if date range filter is active
      let startDate, endDate;
      if (dateRangeFilter.isActive && filteredWeekDates.length > 0) {
        startDate = formatDate(filteredWeekDates[0]);
        endDate = formatDate(filteredWeekDates[filteredWeekDates.length - 1]);
      } else {
        startDate = formatDate(weekDates[0]); // week start
        endDate = formatDate(weekDates[6]); // week end
      }

      const formData = new URLSearchParams();
      formData.append("start_date", startDate);
      formData.append("end_date", endDate);
      formData.append("timezone", formatTimezoneForAPI(timezone));

      // Get teacher to use - only if explicitly selected or passed as param
      let teacherToUse = null;
      let studentToUse = null;
      let hasFilters = false;

      if (teacherUid) {
        teacherToUse = teachers.find((t) => t.uid === teacherUid);
        console.log("Using teacherUid param:", teacherUid);
      }
      // else if (selectedTeacher && selectedTeacher.uid) {
      //   teacherToUse = selectedTeacher;
      //   console.log("Using selectedTeacher.uid:", selectedTeacher.uid);
      // }

      if (jlid) {
        studentToUse = students.find((s) => s.jetlearner_id === jlid);
        console.log("Using jlid param:", jlid);
      }
      //  else if (selectedStudent && selectedStudent.jetlearner_id) {
      //   studentToUse = selectedStudent;
      //   console.log(
      //     "Using selectedStudent.jetlearner_id:",
      //     selectedStudent.jetlearner_id
      //   );
      // }

      // Add teacherid and email when teacher is selected
      if (teacherToUse && teacherToUse.uid) {
        hasFilters = true;
        formData.append("teacherid", teacherToUse.uid);
        formData.append("email", teacherToUse.email);
        console.log(
          "🎯 Teacher filter applied - teacherid and email will appear in Network Tab payload"
        );
      }

      // Add jlid when student is selected
      if (studentToUse && studentToUse.jetlearner_id) {
        hasFilters = true;
        formData.append("jlid", studentToUse.jetlearner_id);
        console.log("✅ JLID ADDED:", studentToUse.jetlearner_id);
        console.log(
          "👤 Student Name:",
          studentToUse.deal_name || studentToUse.name
        );
        console.log(
          "🎯 Student filter applied - jlid will appear in Network Tab payload"
        );
      }

      // Only add type parameter if we have filters (for list view, don't send type)
      if (hasFilters) {
        // For list view, don't send type parameter
      } else {
        // For week view, send type parameter
        formData.append("type", "Availability");
      }

      const response = await fetch(
        "https://live.jetlearn.com/events/get-bookings-availability-summary/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: formData.toString(),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (hasFilters) {
        console.log("📊 Filtered API Response:", result);
        console.log("🔄 View updated with filtered data");
      } else {
        console.log("📊 Complete Dataset Response:", result);
        console.log("🔄 View updated with ALL data (no filters)");
      }

      // Add uid to response data for frontend use
      if (teacherToUse && teacherToUse.uid && result) {
        Object.keys(result).forEach((dateKey) => {
          Object.keys(result[dateKey]).forEach((timeKey) => {
            if (result[dateKey][timeKey]) {
              result[dateKey][timeKey].teacherid = teacherToUse.uid;
            }
          });
        });
      }

      return result;
    } catch (error) {
      console.error("❌ API Error:", error);
      setApiDataError(error.message);
      return null;
    }
  };

  // Fetch teacher leaves data from API
  const fetchTeacherLeaves = async (teacherEmail, startDate, endDate) => {
    try {
      console.log("🍃 Fetching teacher leaves:", {
        teacher_email: teacherEmail,
        start_date: startDate,
        end_date: endDate,
      });

      setTeacherLeaves((prev) => ({ ...prev, isLoading: true, error: null }));

      const formData = new URLSearchParams();
      formData.append("teacher_email", teacherEmail);
      formData.append("start_date", startDate);
      formData.append("end_date", endDate);

      const response = await fetch(
        "https://live.jetlearn.com/events/get-teacher-leaves/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: formData.toString(),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log("✅ Teacher leaves fetched successfully:", result);

      if (result.success) {
        setTeacherLeaves({
          isLoading: false,
          success: true,
          error: null,
          data: result,
          leaves: result.leaves || {},
        });
        return result;
      } else {
        throw new Error(result.message || "Failed to fetch teacher leaves");
      }
    } catch (error) {
      console.error("❌ Teacher leaves API Error:", error);
      setTeacherLeaves({
        isLoading: false,
        success: false,
        error: error.message,
        data: null,
        leaves: {},
      });
      return null;
    }
  };

  // Function to apply teacher leave
  const applyTeacherLeave = async (
    teacherEmail,
    startDate,
    endDate,
    reason,
    teacherUid = null
  ) => {
    try {
      // startDate and endDate are now arrays: ["YYYY-MM-DD", "HH:MM"]
      const requestBody = {
        teacher_email: teacherEmail,
        teacher_uid: teacherUid || "",
        start_date: startDate,
        end_date: endDate,
        reason: reason || "",
      };

      // Add updated_by if available (optional field)
      if (user?.email) {
        requestBody.updated_by = user.email;
      }

      console.log("🍃 Applying teacher leave:", requestBody);

      const response = await fetch(
        "https://live.jetlearn.com/api/apply-for-leave/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        }
      );

      const result = await response.json();

      // Check if status code is 201 and result status is "success"
      if (response.status === 201 && result.status === "success") {
        console.log("✅ Teacher leave applied successfully:", result);

        // Refresh teacher leaves data
        if (selectedTeacher?.email) {
          const weekDates = getWeekDates(currentWeekStart);
          const startDateStr = formatDate(weekDates[0]);
          const endDateObj = new Date(startDateStr);
          endDateObj.setMonth(endDateObj.getMonth() + 3);
          const endDateStr = formatDate(endDateObj);
          await fetchTeacherLeaves(
            selectedTeacher.email,
            startDateStr,
            endDateStr
          );
        }

        // Refresh booking details if in list view
        if (currentView === "list") {
          await fetchListViewBookingDetails();
        }

        // Refresh weekly data
        if (currentView === "week") {
          await refreshWeeklyDataForTeacher(selectedTeacher);
        }

        return result;
      } else {
        throw new Error(
          `HTTP error! status: ${response.status}, message: ${
            result.message || "Unknown error"
          }`
        );
      }
    } catch (error) {
      console.error("❌ Apply teacher leave API Error:", error);
      throw error;
    }
  };

  // Load weekly data when week changes (teacher/student handled separately)
  useEffect(() => {
    const loadWeekData = async () => {
      // Only load if teachers are available
      if (teachers.length === 0) {
        console.log("⏳ Waiting for teachers to load...");
        return;
      }

      setApiDataLoading(true);
      console.log("🔄 Loading weekly data for week change...");
      console.log("Current selectedTeacher:", selectedTeacher);
      console.log("Current selectedStudent:", selectedStudent);
      console.log("Available teachers count:", teachers.length);

      // Use selectedTeacher if available, otherwise no specific teacher
      const data = await fetchWeeklyAvailabilityData(
        currentWeekStart,
        selectedTeacher?.uid,
        selectedStudent?.jetlearner_id,
        selectedTimezone
      );
      if (data) {
        setWeeklyApiData(data);
      }

      // Also fetch teacher leaves if teacher is selected and in week view
      if (selectedTeacher?.email && currentView === "week") {
        console.log("🍃 Fetching teacher leaves for week change...");
        const weekDates = getWeekDates(currentWeekStart);
        const startDate = formatDate(weekDates[0]);
        const endDate = formatDate(weekDates[6]);
        await fetchTeacherLeaves(selectedTeacher.email, startDate, endDate);
      }

      setApiDataLoading(false);
    };

    loadWeekData();
  }, [currentWeekStart, teachers.length]); // Only week change and teachers loading

  // Fetch booking details for list view when filters change
  useEffect(() => {
    if (currentView === "list" && (selectedTeacher || selectedStudent)) {
      console.log("🔄 Fetching booking details for list view...");
      fetchListViewBookingDetails().catch((error) => {
        console.error("❌ Failed to fetch booking details:", error);
      });
    }
  }, [
    currentView,
    selectedTeacher,
    selectedStudent,
    currentWeekStart,
    selectedTimezone,
  ]);

  // Function to refresh weekly data with specific teacher
  const refreshWeeklyDataForTeacher = async (teacher) => {
    if (!teacher || !teacher.uid) return;

    setApiDataLoading(true);
    const data = await fetchWeeklyAvailabilityData(
      currentWeekStart,
      teacher.uid,
      selectedStudent?.jetlearner_id,
      selectedTimezone
    );
    if (data) {
      setWeeklyApiData(data);
    }
    setApiDataLoading(false);
  };

  // Get availability and booking counts from API or fallback to local
  // Helper function to get slot counts from new teacher's availability data
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

    // Check new teacher's availability data first
    if (
      newTeacherAvailabilityData[dateStr] &&
      newTeacherAvailabilityData[dateStr][time]
    ) {
      const apiSlot = newTeacherAvailabilityData[dateStr][time];
      // Only return if this slot belongs to the new teacher
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

  const getSlotCounts = (date, time) => {
    // Ensure date is a Date object
    const dateObj = date instanceof Date ? date : new Date(date);
    const dateStr = formatDate(dateObj);

    // Try API data first
    if (weeklyApiData[dateStr] && weeklyApiData[dateStr][time]) {
      const apiSlot = weeklyApiData[dateStr][time];
      const teacher = getTeacherByTeacherId(apiSlot.teacherid || apiSlot.uid); // Use uid as fallback

      return {
        available: apiSlot.availability || 0,
        booked: apiSlot.bookings || 0,
        teacherid: apiSlot.teacherid || apiSlot.uid || null, // Use uid as teacherid
        teacherDetails: teacher || null, // Full teacher object
        apiData: apiSlot, // full API data for future use
        isFromAPI: true,
        uid: apiSlot.uid || null, // Direct uid access
      };
    }

    // Fallback to local schedule
    const localSlot = getScheduleForDate(date)[time];

    // Add null check for localSlot
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
      teacherid: firstTeacher?.uid || null, // local teacherid (hidden)
      teacherDetails: firstTeacher || null,
      apiData: null,
      isFromAPI: false,
      uid: firstTeacher?.uid || null,
    };
  };

  const weekDates = getWeekDates(currentWeekStart);

  // Filter weekDates based on date range filter
  const getFilteredWeekDates = () => {
    // If filter is not active, show all week dates
    if (!dateRangeFilter.isActive) {
      return weekDates;
    }

    // If filter is active, filter based on selected date range
    if (dateRangeFilter.startDate && dateRangeFilter.endDate) {
      const startDate = new Date(dateRangeFilter.startDate);
      const endDate = new Date(dateRangeFilter.endDate);

      const filtered = weekDates.filter((date) => {
        const dateObj = new Date(date);
        return dateObj >= startDate && dateObj <= endDate;
      });

      // Ensure we always have at least one date to display
      return filtered.length > 0 ? filtered : weekDates;
    }

    // Fallback to showing all week dates
    return weekDates;
  };

  const filteredWeekDates = getFilteredWeekDates();

  // Helper function to fetch data for filtered date range
  const fetchFilteredData = useCallback(
    async (startDate, endDate) => {
      try {
        // Get teacher to use
        let teacherToUse = null;
        let studentToUse = null;
        let hasFilters = false;

        if (selectedTeacher && selectedTeacher.uid) {
          teacherToUse = selectedTeacher;
          hasFilters = true;
        }

        if (selectedStudent && selectedStudent.jetlearner_id) {
          studentToUse = selectedStudent;
          hasFilters = true;
        }

        // Call booking details API if filters are applied
        if (hasFilters) {
          const bookingFormData = new URLSearchParams();
          bookingFormData.append("start_date", startDate);
          bookingFormData.append("end_date", endDate);
          bookingFormData.append(
            "timezone",
            formatTimezoneForAPI(selectedTimezone)
          );

          if (teacherToUse) {
            bookingFormData.append("teacherid", teacherToUse.uid);
            bookingFormData.append("email", teacherToUse.email);
          }

          if (studentToUse) {
            bookingFormData.append("jlid", studentToUse.jetlearner_id);
          }

          const bookingResponse = await fetch(
            "https://live.jetlearn.com/events/get-bookings-details/",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: bookingFormData.toString(),
            }
          );

          if (bookingResponse.ok) {
            const bookingData = await bookingResponse.json();
            setListViewBookingDetails({
              isLoading: false,
              success: true,
              data: bookingData,
              error: null,
            });
            console.log("✅ Filtered booking details API called successfully");
          } else {
            console.error("❌ Error calling filtered booking details API");
          }
        }
      } catch (error) {
        console.error("❌ Error in fetchFilteredData:", error);
      }
    },
    [selectedTeacher, selectedStudent, selectedTimezone]
  );

  // Initialize date range filter with current week's start and end dates
  useEffect(() => {
    const weekDates = getWeekDates(currentWeekStart);
    setDateRangeFilter({
      startDate: formatDate(weekDates[0]),
      endDate: formatDate(weekDates[6]),
      isActive: false,
    });
  }, [currentWeekStart]);

  // Manual filter function to be called by search button
  const handleApplyDateFilter = () => {
    if (dateRangeFilter.startDate && dateRangeFilter.endDate) {
      const currentWeekStart = formatDate(weekDates[0]);
      const currentWeekEnd = formatDate(weekDates[6]);
      const isActive =
        dateRangeFilter.startDate !== currentWeekStart ||
        dateRangeFilter.endDate !== currentWeekEnd;

      setDateRangeFilter((prev) => ({
        ...prev,
        isActive: isActive,
      }));

      if (isActive) {
        fetchFilteredData(dateRangeFilter.startDate, dateRangeFilter.endDate);
      }
    }
  };

  // Function to send booking data to API
  const sendBookingToAPI = async (date, time, teacherUid = null) => {
    try {
      setBookingApiResponse({
        isLoading: true,
        success: false,
        error: null,
        data: null,
      });

      const dateStr = formatDate(date);

      // Get teacher to use - from selected teacher or passed parameter
      let teacherToUse = null;
      if (teacherUid) {
        teacherToUse = teachers.find((t) => t.uid === teacherUid);
      } else if (selectedTeacher && selectedTeacher.uid) {
        teacherToUse = selectedTeacher;
      }

      // Prepare form-urlencoded data for Bookings API - using date format as per original curl
      const formData = new URLSearchParams();
      formData.append("start_date", dateStr);
      formData.append("end_date", dateStr);
      formData.append("type", "Bookings");
      formData.append("timezone", formatTimezoneForAPI(selectedTimezone));

      // If teacher data is available, include it; otherwise send without teacher filter
      if (teacherToUse && teacherToUse.uid && teacherToUse.email) {
        formData.append("teacherid", teacherToUse.uid);
        formData.append("email", teacherToUse.email);
        formData.append("timezone", formatTimezoneForAPI(selectedTimezone));

        console.log(
          "🚀 Sending Bookings API Request for time slot (with teacher):",
          {
            start_date: dateStr,
            end_date: dateStr,
            type: "Bookings",
            teacherid: teacherToUse.uid,
            email: teacherToUse.email,
            timezone: formatTimezoneForAPI(selectedTimezone),
          }
        );
      } else {
        console.log(
          "🚀 Sending Bookings API Request for time slot (all teachers):",
          {
            start_date: dateStr,
            end_date: dateStr,
            type: "Bookings",
            teacherid: "all",
            time_slot: time,
          }
        );
      }

      const response = await fetch(
        "https://live.jetlearn.com/events/get-bookings-details/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: formData.toString(),
        }
      );

      if (!response.ok) {
        let errorMsg = `HTTP error! status: ${response.status}`;
        try {
          const errJson = await response.json();
          if (errJson && errJson.message) errorMsg += ` - ${errJson.message}`;
        } catch {}
        throw new Error(errorMsg);
      }

      const result = await response.json();
      console.log("📊 Bookings API Response for time slot:", result);

      setBookingApiResponse({
        isLoading: false,
        success: true,
        error: null,
        data: result,
      });
      return result;
    } catch (error) {
      console.error("❌ Bookings API Error:", error);
      setBookingApiResponse({
        isLoading: false,
        success: false,
        error: error.message,
        data: null,
      });
      throw error;
    }
  };

  // Function to send availability data to API
  const sendAvailabilityToAPI = async (date, time, teacherUid = null) => {
    try {
      setAvailabilityAPI({
        isLoading: true,
        success: false,
        error: null,
        response: null,
      });

      const dateStr = formatDate(date);

      // Get teacher to use - from selected teacher or passed parameter
      let teacherToUse = null;
      if (teacherUid) {
        teacherToUse = teachers.find((t) => t.uid === teacherUid);
      } else if (selectedTeacher && selectedTeacher.uid) {
        teacherToUse = selectedTeacher;
      }

      // Prepare form-urlencoded data for Availability API - using date format as per original curl
      const formData = new URLSearchParams();
      formData.append("start_date", dateStr);
      formData.append("end_date", dateStr);
      formData.append("type", "Availability");
      formData.append("timezone", formatTimezoneForAPI(selectedTimezone));

      // If teacher data is available, include it; otherwise send without teacher filter
      if (teacherToUse && teacherToUse.uid && teacherToUse.email) {
        formData.append("teacherid", teacherToUse.uid);
        formData.append("email", teacherToUse.email);

        console.log(
          "🚀 Sending Availability API Request for time slot (with teacher):",
          {
            start_date: dateStr,
            end_date: dateStr,
            type: "Availability",
            teacherid: teacherToUse.uid,
            email: teacherToUse.email,
            timezone: formatTimezoneForAPI(selectedTimezone),
          }
        );
      } else {
        // When fetching all teachers, include time_slot parameter
        if (time) {
          formData.append("time_slot", time);
        }
        console.log(
          "🚀 Sending Availability API Request for time slot (all teachers):",
          {
            start_date: dateStr,
            end_date: dateStr,
            type: "Availability",
            time_slot: time,
            timezone: formatTimezoneForAPI(selectedTimezone),
          }
        );
      }

      const response = await fetch(
        "https://live.jetlearn.com/events/get-bookings-details/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: formData.toString(),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log("📊 Availability API Response for time slot:", result);

      setAvailabilityAPI({
        isLoading: false,
        success: true,
        error: null,
        response: result,
      });
      return result;
    } catch (error) {
      console.error("❌ Availability API Error:", error);
      setAvailabilityAPI({
        isLoading: false,
        success: false,
        error: error.message,
        response: null,
      });
      throw error;
    }
  };

  // Function to fetch booking details for list view
  const fetchListViewBookingDetails = async () => {
    try {
      setListViewBookingDetails({
        isLoading: true,
        success: false,
        error: null,
        data: null,
      });

      const formattedTimezone = formatTimezoneForAPI(selectedTimezone);
      console.log("Formatted timezone for API:", formattedTimezone);
      // Calculate 3 months from start of current week
      const weekDates = getWeekDates(currentWeekStart);
      const startDate = formatDate(weekDates[0]); // Start of current week

      // Calculate end date (3 months from start date)
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(startDateObj);
      endDateObj.setMonth(endDateObj.getMonth() + 3);
      const endDate = formatDate(endDateObj);

      console.log("📅 List View Date Range:");
      console.log("  - Start Date (current week start):", startDate);
      console.log("  - End Date (3 months later):", endDate);

      const formData = new URLSearchParams();
      formData.append("start_date", startDate);
      formData.append("end_date", endDate);
      formData.append("timezone", formattedTimezone);

      // Add teacher filter if selected
      if (selectedTeacher && selectedTeacher.uid) {
        formData.append("teacherid", selectedTeacher.uid);
        formData.append("email", selectedTeacher.email);
        console.log(
          "🚀 Fetching booking details with teacher filter:",
          selectedTeacher.full_name
        );
      }

      // Add student filter if selected
      if (selectedStudent && selectedStudent.jetlearner_id) {
        formData.append("jlid", selectedStudent.jetlearner_id);
        console.log(
          "🚀 Fetching booking details with student filter:",
          selectedStudent.deal_name
        );
      }

      console.log(
        "📤 List View Booking Details API Payload:",
        Object.fromEntries(formData)
      );

      const response = await fetch(
        "https://live.jetlearn.com/events/get-bookings-details/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: formData.toString(),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log("📊 List View Booking Details Response:", result);

      setListViewBookingDetails({
        isLoading: false,
        success: true,
        error: null,
        data: result,
      });

      // Fetch teacher leaves if teacher is selected
      if (selectedTeacher && selectedTeacher.email) {
        console.log("🍃 Fetching teacher leaves for list view...");
        try {
          await fetchTeacherLeaves(selectedTeacher.email, startDate, endDate);
        } catch (leaveError) {
          console.error("❌ Failed to fetch teacher leaves:", leaveError);
          // Don't throw here, just log the error as leaves are not critical for list view
        }
      }

      return result;
    } catch (error) {
      console.error("❌ List View Booking Details API Error:", error);
      setListViewBookingDetails({
        isLoading: false,
        success: false,
        error: error.message,
        data: null,
      });
      throw error;
    }
  };

  // Send student session info to backend via PUT
  // const sendStudentSessionToAPI = async (student, teacher, type) => {
  //   try {
  //     const payload = {
  //       name: student.name,
  //       jetlearner_id: student.jetlearner_id,
  //       teacher_name: teacher.full_name,
  //       teacher_id: teacher.id,
  //       type: type,
  //       timezone: selectedTimezone,
  //     };

  //     const response = await fetch(
  //       "https://live.jetlearn.com/events/get-bookings-availability-summary/",
  //       {
  //         method: "PUT",
  //         headers: {
  //           "Content-Type": "application/json",
  //         },
  //         body: JSON.stringify(payload),
  //       }
  //     );

  //     if (!response.ok) {
  //       let errorMsg = `HTTP error! status: ${response.status}`;
  //       try {
  //         const errJson = await response.json();
  //         if (errJson && errJson.message) errorMsg += ` - ${errJson.message}`;
  //       } catch {}
  //       throw new Error(errorMsg);
  //     }

  //     const result = await response.json();
  //     return result;
  //   } catch (error) {
  //     throw error;
  //   }
  // };

  // Get all booked students from the schedule
  // const getAllBookedStudents = useMemo(() => {
  //   const bookedStudents = [];
  //   Object.keys(schedule).forEach((dateStr) => {
  //     const dateSchedule = schedule[dateStr];
  //     TIME_SLOTS.forEach((time) => {
  //       const slot = dateSchedule[time];
  //       if (slot && slot.students) {
  //         slot.students.forEach((student) => {
  //           const exists = bookedStudents.find(
  //             (s) => s.name.toLowerCase() === student.name.toLowerCase()
  //           );
  //           if (!exists) {
  //             bookedStudents.push({
  //               id: student.id,
  //               name: student.name,
  //               email: student.email || "",
  //               isBookedStudent: true,
  //             });
  //           }
  //         });
  //       }
  //     });
  //   });
  //   return bookedStudents;
  // }, [schedule]);

  // Combine API students with booked students
  const allAvailableStudents = useMemo(() => {
    return [...students];
  }, [students]);

  // Initialize schedule for current week dates if not exists
  const getScheduleForDate = (date) => {
    const dateStr = formatDate(date);
    if (!schedule[dateStr]) {
      const dateSchedule = {};
      TIME_SLOTS.forEach((time) => {
        dateSchedule[time] = { time, teachers: [], students: [] };
      });
      return dateSchedule;
    }
    return schedule[dateStr];
  };

  const getTeacherStats = (teacherId) => {
    let totalSlots = 0;
    let totalStudents = 0;
    const scheduleByDate = {};

    Object.keys(schedule).forEach((dateStr) => {
      const dateSchedule = schedule[dateStr];
      const dateSlots = [];

      TIME_SLOTS.forEach((time) => {
        const slot = dateSchedule[time];
        if (slot) {
          const isTeacherAvailable = slot.teachers.some(
            (t) => t.id === teacherId
          );
          const studentsForTeacher = slot.students.filter(
            (s) => s.teacherId === teacherId
          );

          if (isTeacherAvailable) {
            totalSlots++;
            totalStudents += studentsForTeacher.length;
            if (studentsForTeacher.length > 0) {
              dateSlots.push({
                time,
                studentCount: studentsForTeacher.length,
                students: studentsForTeacher,
              });
            }
          }
        }
      });

      if (dateSlots.length > 0) {
        scheduleByDate[dateStr] = dateSlots;
      }
    });

    return { totalSlots, totalStudents, scheduleByDate };
  };

  // Updated getCellColor to work with counts
  const getCellColor = (available, booked) => {
    if (available === 0 && booked === 0) return "bg-gray-200";
    if (available === 0 && booked > 0) return "bg-red-200";
    if (booked >= available) return "bg-red-200";
    if (available > 0 && booked < available) return "bg-green-200";
    return "bg-gray-200";
  };

  const formatTimeInTimezone = (datesel, time, timezone) => {
    try {
      // Ensure datesel is a Date object
      const dateObj = datesel instanceof Date ? datesel : new Date(datesel);

      // Get year, month, date
      const year = dateObj.getFullYear(); // 2025
      const month = dateObj.getMonth(); // 7 (note: January = 0, so add 1)
      const day = dateObj.getDate();
      const [hours, minutes] = time.split(":");
      // const date = new Date();
      // date.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      const date = new Date(
        Date.UTC(year, month, day, parseInt(hours), parseInt(minutes), 0)
      );
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

  // Function to convert datetime string to selected timezone and get date
  const convertDateTimeToTimezone = (datetimeString, targetTimezone) => {
    if (!datetimeString || !targetTimezone) return null;

    try {
      // Parse the datetime string (e.g., "2025-10-13T21:00:00+02:00")

      const dateObj = new Date(datetimeString);
      //console.log("dateObj", dateObj);
      // Extract timezone offset from targetTimezone (e.g., "(GMT+02:00) CET" -> +02:00)
      const match = targetTimezone.match(/GMT([+-]\d{2}):(\d{2})/);
      if (!match) return null;

      const targetOffsetHours = parseInt(match[1], 10);
      const targetOffsetMinutes =
        parseInt(match[2], 10) * (targetOffsetHours >= 0 ? 1 : -1);
      const targetOffsetMs =
        (targetOffsetHours * 60 + targetOffsetMinutes) * 60000;

      // Get browser's timezone offset
      const browserOffsetMs = dateObj.getTimezoneOffset() * 60000;

      // Adjust the date: add browser offset to get UTC, then add target offset
      // This creates a Date object that when displayed in UTC, shows the target timezone time
      const adjustedDate = new Date(
        dateObj.getTime() + browserOffsetMs + targetOffsetMs
      );
      return adjustedDate;
    } catch (error) {
      console.error("Error converting datetime to timezone:", error);
      return null;
    }
  };

  // Function to convert time range to IST
  const convertTimeRangeToIST = (timeRange, bookingDate, selectedTimezone) => {
    if (timeRange === "N/A") return "N/A";

    try {
      const [startTime, endTime] = timeRange.split(" - ");
      if (!startTime || !endTime) return timeRange;

      // Extract timezone offset from selectedTimezone (e.g., "(GMT+02:00) CET" -> +02:00)
      const match = selectedTimezone.match(/GMT([+-]\d{2}):(\d{2})/);
      if (!match) return timeRange;

      const offsetHours = parseInt(match[1], 10); // +02 or -05
      const offsetMinutes = parseInt(match[2], 10); // 00 or 30

      // Convert start time
      const [startHour, startMinute] = startTime.split(":").map(Number);
      const startDate = new Date(bookingDate);
      startDate.setHours(startHour, startMinute, 0, 0);

      // Adjust for the original timezone offset (subtract the offset to get UTC)
      const startUTC = new Date(
        startDate.getTime() - (offsetHours * 60 + offsetMinutes) * 60000
      );

      // Convert UTC to IST (IST is UTC+5:30)
      const startIST = new Date(startUTC.getTime() + (5 * 60 + 30) * 60000);

      // Convert end time
      const [endHour, endMinute] = endTime.split(":").map(Number);
      const endDate = new Date(bookingDate);
      endDate.setHours(endHour, endMinute, 0, 0);

      // Adjust for the original timezone offset
      const endUTC = new Date(
        endDate.getTime() - (offsetHours * 60 + offsetMinutes) * 60000
      );

      // Convert UTC to IST
      const endIST = new Date(endUTC.getTime() + (5 * 60 + 30) * 60000);

      // Format the times
      const formatTime = (date) => {
        const hours = date.getHours().toString().padStart(2, "0");
        const minutes = date.getMinutes().toString().padStart(2, "0");
        return `${hours}:${minutes}`;
      };

      // Format the date (YYYY-MM-DD format)
      const formatDate = (date) => {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, "0");
        const day = date.getDate().toString().padStart(2, "0");
        return `${day}-${month}-${year}`;
      };

      return `${formatDate(startIST)}, ${formatTime(startIST)} - ${formatTime(
        endIST
      )}`;
    } catch (error) {
      console.error("Error converting time range to IST:", error);
      return timeRange;
    }
  };

  // Enhanced slot click handler with teacherid
  // const handleSlotClick = (date, time) => {
  //   const slotData = getSlotCounts(date, time);
  //   setSelectedSlot({
  //     date,
  //     time,
  //     teacherid: slotData.teacherid,
  //     teacherDetails: slotData.teacherDetails,
  //     isFromAPI: slotData.isFromAPI,
  //   });
  //   setModalOpen(true);
  // };

  const handleAddTeacher = (teacherId) => {
    if (!selectedSlot) return;
    const teacher = teachers.find(
      (t) => t.id.toString() === teacherId.toString()
    );
    if (!teacher) return;

    const dateStr = formatDate(selectedSlot.date);
    setSchedule((prev) => {
      const newSchedule = { ...prev };
      if (!newSchedule[dateStr]) {
        newSchedule[dateStr] = {};
        TIME_SLOTS.forEach((time) => {
          newSchedule[dateStr][time] = { time, teachers: [], students: [] };
        });
      }

      const slot = newSchedule[dateStr][selectedSlot.time];
      // Prevent duplicate teacher (compare as string)
      if (slot.teachers.find((t) => t.id.toString() === teacherId.toString())) {
        return prev;
      }
      slot.teachers = [...slot.teachers, teacher];
      return newSchedule;
    });
  };

  const handleRemoveTeacher = (teacherId) => {
    if (!selectedSlot) return;
    const dateStr = formatDate(selectedSlot.date);
    setSchedule((prev) => {
      const newSchedule = { ...prev };
      if (newSchedule[dateStr] && newSchedule[dateStr][selectedSlot.time]) {
        const slot = newSchedule[dateStr][selectedSlot.time];
        slot.teachers = slot.teachers.filter((t) => t.id !== teacherId);
      }
      return newSchedule;
    });
  };

  const handleBookStudent = async (
    studentName,
    selectedStudents,
    bookingData
  ) => {
    if (!selectedSlot) return;

    // Set loading state
    setIsBookingLoading(true);

    const dateStr = formatDate(selectedSlot.date);
    console.log("selectedStudent", selectedStudents);
    console.log("Booking Data", JSON.stringify(bookingData, null, 2));
    console.log("bookingData.attendees:", bookingData.attendees);
    console.log("bookingData.recording:", bookingData.recording);
    // Find teacher and student details
    const teacher = selectedTeacher?.uid;
    const student = selectedStudents.map((item) => item.id);
    console.log(student);
    if (!teacher) {
      alert("Teacher not found");
      setIsBookingLoading(false);
      return;
    }

    // Extract offset hours and minutes from "(GMT+02:00)"
    const match = selectedTimezone.match(/GMT([+-]\d{2}):(\d{2})/);
    const offsetHours = parseInt(match[1], 10); // +02
    const offsetMinutes = parseInt(match[2], 10); // 00

    const formattedSchedule = bookingData.schedule.map(([date, time]) => {
      // Parse DD-MM-YYYY
      const [day, month, year] = date.split("-").map(Number);
      const [hour, minute] = time.split(":").map(Number);

      // Create a date as if it were in the given offset
      const localDate = new Date(
        Date.UTC(
          year,
          month - 1,
          day,
          hour - offsetHours,
          minute - offsetMinutes
        )
      );

      // Convert to UTC string
      const utcYear = localDate.getUTCFullYear();
      const utcMonth = String(localDate.getUTCMonth() + 1).padStart(2, "0");
      const utcDay = String(localDate.getUTCDate()).padStart(2, "0");
      const utcHour = String(localDate.getUTCHours()).padStart(2, "0");
      const utcMinute = String(localDate.getUTCMinutes()).padStart(2, "0");

      return [`${utcYear}-${utcMonth}-${utcDay}`, `${utcHour}:${utcMinute}`];
    });
    const newStudent = {
      id: Date.now().toString(),
      name: studentName,
      teacher,
      teacherName: teacher.full_name,
      booking_type: bookingData.bookingType || "trial",
      email: student?.email || "",
      jetlearner_id: student?.jetlearner_id || "",
      platformCredentials: bookingData.platformCredentials || "",
      attendees: bookingData.attendees.trim() || "",
      schedule: formattedSchedule || [],
      summary: bookingData.summary || "",
      ...(bookingData.bookingType === "paid" && {
        subject: bookingData.subject,
        classType: bookingData.classType,
        classCount: bookingData.classCount,
        recording: bookingData.recording,
        batch_name: bookingData.batchNumber,
        tags: bookingData.recording,
      }),
      ...(bookingData.bookingType === "trial" && {
        classType: "1:1",
        classCount: 1,
      }),
    };

    // Send booking to API if we have the required data
    if (
      student.length &&
      teacher &&
      bookingData.schedule &&
      bookingData.schedule.length > 0
    ) {
      try {
        const attendeeslist =
          bookingData.attendees && bookingData.attendees.trim()
            ? bookingData.attendees
                .trim()
                .split(",")
                .map((item) => item.trim())
            : [];
        console.log(attendeeslist);
        const taglist =
          bookingData.recording && bookingData.recording.trim()
            ? bookingData.recording.trim().split(",")
            : [];
        console.log("taglist", taglist);

        const apiPayload = {
          jl_uid: student,
          teacher_uid: teacher,
          platform_credentials: bookingData.platformCredentials || "",
          class_count:
            bookingData.bookingType === "trial"
              ? 1
              : parseInt(bookingData.classCount) || 1,
          schedule: formattedSchedule,
          attendees: attendeeslist,
          class_type:
            bookingData.bookingType === "trial"
              ? "1:1"
              : bookingData.classType || "1:1",
          booking_type: bookingData.bookingType === "trial" ? "Trial" : "Paid",

          ...(bookingData.bookingType === "paid" && {
            course: bookingData.subject || "",
            recording: taglist,
            batch_name: bookingData.batchNumber || "",
            tags: taglist,
            updated_by: user?.email,
          }),
          ...(bookingData.summary && {
            summary: bookingData.summary,
          }),
          ...(bookingData.eventId && {
            event_id: bookingData.eventId, // Include event_id for edit operations
          }),
          time_zone: formatTimezoneForAPI(selectedTimezone),
          ...(bookingData.pdf_attached &&
            String(bookingData.pdf_attached).trim() && {
              pdf_attached: bookingData.pdf_attached,
            }),
        };

        console.log("📤 Sending booking to API:", apiPayload);

        // TODO: Implement actual API call to https://live.jetlearn.com/api/book-class
        const response = await fetch(
          "https://live.jetlearn.com/api/book-class/",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(apiPayload),
          }
        );

        if (!response.ok) {
          throw new Error(`API call failed: ${response.status}`);
        }

        const result = await response.json();
        console.log("✅ Booking API response:", result);

        // Check if booking was successful
        if (result.status === "success") {
          // Show success message
          setSuccessMessage({
            show: true,
            message: "Booking Successfully Done !!",
            type: "booking",
          });

          // Close the modal after a short delay
          setTimeout(() => {
            setModalOpen(false);
            setSuccessMessage({
              show: false,
              message: "",
              type: "",
            });
          }, 2000);

          await fetchListViewBookingDetails();
        }
      } catch (error) {
        console.error("❌ Error sending booking to API:", error);
        alert("Failed to send booking to API. Please try again.");
      } finally {
        setIsBookingLoading(false);
      }
    } else {
      setIsBookingLoading(false);
    }
  };

  const handleRemoveStudent = (studentId) => {
    if (!selectedSlot) return;
    const dateStr = formatDate(selectedSlot.date);

    // Update local schedule
    setSchedule((prev) => {
      const newSchedule = { ...prev };
      if (newSchedule[dateStr] && newSchedule[dateStr][selectedSlot.time]) {
        const slot = newSchedule[dateStr][selectedSlot.time];
        slot.students = slot.students.filter((s) => s.id !== studentId);
      }
      return newSchedule;
    });
  };

  // Sync teacher events API call
  // const syncTeacherEvents = async (teacherEmail) => {
  //   if (!teacherEmail) {
  //     console.warn("⚠️ No teacher email provided for sync");
  //     return;
  //   }

  //   try {
  //     console.log("🔄 Syncing teacher events for:", teacherEmail);

  //     // URL encode the calendar_id (email)
  //     const encodedCalendarId = encodeURIComponent(teacherEmail);
  //     const url = `https://live.jetlearn.com/sync/sync-december-events/?calendar_id=${encodedCalendarId}`;

  //     const response = await fetch(url, {
  //       method: "GET",
  //       headers: {
  //         "Content-Type": "application/json",
  //       },
  //     });

  //     if (!response.ok) {
  //       throw new Error(`HTTP error! status: ${response.status}`);
  //     }

  //     const result = await response.json();
  //     console.log("✅ Teacher events synced successfully:", result);
  //     return result;
  //   } catch (error) {
  //     console.error("❌ Error syncing teacher events:", error);
  //     throw error;
  //   }
  // };

  const handleTeacherSelect = (teacher) => {
    setSelectedTeacher(teacher);

    // Sync teacher events when teacher is changed
    // if (teacher && teacher.email) {
    //   syncTeacherEvents(teacher.email).catch((error) => {
    //     console.error("Failed to sync teacher events:", error);
    //   });
    // }

    // Switch to List View when filter is applied
    setCurrentView("list");

    // Immediately trigger API call with selected teacher
    if (teacher && teacher.uid) {
      console.log("🚀 Triggering IMMEDIATE API call with selected teacher...");
      console.log("📤 TeacherID that will be sent in API:", teacher.uid);
      console.log("📤 Email that will be sent in API:", teacher.email);

      // Force immediate API call
      const immediateAPICall = async () => {
        setApiDataLoading(true);
        console.log("🔄 IMMEDIATE API CALL STARTING...");
        const data = await fetchWeeklyAvailabilityData(
          currentWeekStart,
          teacher.uid,
          selectedStudent?.jetlearner_id,
          selectedTimezone
        );
        if (data) {
          setWeeklyApiData(data);
          console.log("✅ API call completed with teacher data");
        }

        // Also fetch teacher leaves if in week view or switching to week view
        if (currentView === "week" && teacher.email) {
          console.log("🍃 Fetching teacher leaves for week view...");
          const weekDates = getWeekDates(currentWeekStart);
          const startDate = formatDate(weekDates[0]);
          const endDate = formatDate(weekDates[6]);
          await fetchTeacherLeaves(teacher.email, startDate, endDate);
        }

        setApiDataLoading(false);
      };

      immediateAPICall();
    } else {
      console.log("❌ No teacher UID available for refresh");
    }
  };

  // Function to fetch learner calendar stats
  const fetchLearnerCalendarStats = async (jetlearnerId) => {
    if (!jetlearnerId) {
      setLearnerCalendarStats(null);
      return;
    }

    try {
      setLearnerCalendarStatsLoading(true);
      setLearnerCalendarStatsError(null);
      console.log("📊 Fetching learner calendar stats for:", jetlearnerId);

      const response = await fetch(
        "https://live.jetlearn.com/sync/get-learner-calendar-stats/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            jetlearner_id: jetlearnerId,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setLearnerCalendarStats(data);
      console.log("✅ Learner calendar stats fetched successfully:", data);
    } catch (error) {
      console.error("❌ Error fetching learner calendar stats:", error);
      setLearnerCalendarStatsError(error.message);
      setLearnerCalendarStats(null);
    } finally {
      setLearnerCalendarStatsLoading(false);
    }
  };

  const handleStudentSelect = (student) => {
    setSelectedStudent(student);

    // Switch to List View when filter is applied
    setCurrentView("list");

    // Immediately trigger API call with selected student
    if (student && student.jetlearner_id) {
      console.log("🚀 Triggering IMMEDIATE API call with selected student...");
      console.log("📤 JLID that will be sent in API:", student.jetlearner_id);
      console.log("📤 Student name:", student.deal_name);

      // Force immediate API call
      const immediateAPICall = async () => {
        setApiDataLoading(true);
        console.log("🔄 IMMEDIATE API CALL STARTING for student...");
        const data = await fetchWeeklyAvailabilityData(
          currentWeekStart,
          selectedTeacher?.uid,
          student.jetlearner_id,
          selectedTimezone
        );
        if (data) {
          setWeeklyApiData(data);
          console.log("✅ API call completed with student filter");
        }
        setApiDataLoading(false);
      };

      immediateAPICall();

      // Fetch learner calendar stats
      fetchLearnerCalendarStats(student.jetlearner_id);
    } else {
      console.log("❌ No student jetlearner_id available for refresh");
      // Clear stats when no student is selected
      setLearnerCalendarStats(null);
    }
  };

  const handleTimezoneSelect = (timezone) => {
    setSelectedTimezone(timezone);
    console.log("🔄 Timezone changed to:", timezone);
    console.log("🔄 Current view:", currentView);
    console.log("🔄 Selected teacher:", selectedTeacher);
    console.log("🔄 Selected student:", selectedStudent);
    // Call appropriate API when timezone changes based on current view
    if (currentView === "list" && (selectedTeacher || selectedStudent)) {
      console.log("🔄 Timezone changed - calling Summary API for List view...");
      fetchListViewBookingDetails().catch((error) => {
        console.error(
          "❌ Error calling Summary API on timezone change:",
          error
        );
      });
    } else if (currentView === "week") {
      console.log(
        "🔄 Timezone changed - calling Availability API for Week view..."
      );
      setSelectedTimezone(timezone);
      fetchWeeklyAvailabilityData(
        currentWeekStart,
        selectedTeacher?.uid,
        selectedStudent?.jetlearner_id,
        timezone
      )
        .then((data) => {
          if (data) {
            setWeeklyApiData(data);
            console.log(
              "✅ Availability API called successfully on timezone change"
            );
          }
        })
        .catch((error) => {
          console.error(
            "❌ Error calling Availability API on timezone change:",
            error
          );
        });
    }
  };

  // Handle schedule management popup open
  const handleScheduleManagementOpen = (
    selectedSchedule = null,
    teacherUid = null,
    onScheduleUpdate = null
  ) => {
    setScheduleManagementPopup({
      isOpen: true,
      isLoading: false,
      selectedSchedule: selectedSchedule,
      teacherUid: teacherUid,
      onScheduleUpdate: onScheduleUpdate,
    });
    // If selectedSchedule is provided, set it as initial schedule entries
    if (selectedSchedule && Array.isArray(selectedSchedule)) {
      // Convert schedule format from [date, time] to {id, date, time}
      const formattedSchedule = selectedSchedule.map((entry, index) => {
        const [date, time] = Array.isArray(entry)
          ? entry
          : [entry.date || entry[0], entry.time || entry[1]];
        return {
          id: Date.now() + index,
          date: date,
          time: time,
        };
      });
      setScheduleEntries(formattedSchedule);
      // Set selectedScheduleDate and selectedScheduleTime from first entry
      if (formattedSchedule.length > 0) {
        setSelectedScheduleDate(formattedSchedule[0].date);
        setSelectedScheduleTime(formattedSchedule[0].time);
      }
    }
  };

  // Handle schedule management popup close
  const handleScheduleManagementClose = () => {
    // If there's a callback to update schedule (from Edit/Reschedule popup), call it
    if (
      scheduleManagementPopup.onScheduleUpdate &&
      scheduleEntries.length > 0
    ) {
      // Convert schedule entries back to [date, time] format
      const formattedSchedule = scheduleEntries.map((entry) => [
        entry.date,
        entry.time,
      ]);
      scheduleManagementPopup.onScheduleUpdate(formattedSchedule);
    }

    setScheduleManagementPopup({
      isOpen: false,
      isLoading: false,
      selectedSchedule: null,
      teacherUid: null,
      onScheduleUpdate: null,
    });
  };

  // Email validation function
  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Check if email has common domain
  const hasCommonDomain = (email) => {
    const commonDomains = [
      "gmail.com",
      "yahoo.com",
      "hotmail.com",
      "outlook.com",
      "jetlearn.com",
    ];
    const domain = email.split("@")[1];
    return commonDomains.includes(domain);
  };

  // Get domain suggestions
  const getDomainSuggestions = (email) => {
    const commonDomains = [
      "gmail.com",
      "yahoo.com",
      "hotmail.com",
      "outlook.com",
      "jetlearn.com",
    ];
    const localPart = email.split("@")[0];
    if (!localPart) return [];

    return commonDomains
      .filter(
        (domain) =>
          domain.includes(localPart.toLowerCase()) ||
          localPart.toLowerCase().includes(domain.split(".")[0])
      )
      .slice(0, 3);
  };

  // Handle attendees input change
  const handleAttendeesChange = (value) => {
    // Clean whitespace as user types - remove extra spaces
    const cleanedValue = value.replace(/\s+/g, " ").trim();
    setAttendees(cleanedValue);
    setAttendeesError("");

    if (cleanedValue.includes("@")) {
      setShowDomainSuggestions(true);
    } else {
      setShowDomainSuggestions(false);
    }
  };

  // Handle adding email to attendees list
  const handleAddEmail = () => {
    // Clean whitespace from the input - remove extra spaces and trim
    const email = attendees.trim().replace(/\s+/g, " ").trim();
    if (!email) return;

    if (!validateEmail(email)) {
      setAttendeesError("Please enter a valid email format");
      return;
    }

    if (
      attendeesList.some(
        (item) => item.email.toLowerCase() === email.toLowerCase()
      )
    ) {
      setAttendeesError("Email already exists in the list");
      return;
    }

    const newEmail = {
      id: Date.now(),
      email: email.toLowerCase(),
    };
    setAttendeesList([...attendeesList, newEmail]);
    setAttendees("");
    setAttendeesError("");
    setShowDomainSuggestions(false);
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
    setTimeout(() => {
      setShowDomainSuggestions(false);
    }, 150);
  };

  // Handle adding schedule entry
  const addScheduleEntry = () => {
    if (!selectedScheduleDate || !selectedScheduleTime) return;

    const newEntry = {
      id: Date.now(),
      date: selectedScheduleDate,
      time: selectedScheduleTime,
    };

    setScheduleEntries([...scheduleEntries, newEntry]);
    setSelectedScheduleDate("");
    setSelectedScheduleTime("");
  };

  // Handle removing schedule entry
  const removeScheduleEntry = (entryId) => {
    setScheduleEntries(scheduleEntries.filter((entry) => entry.id !== entryId));
  };

  // Handle booking student from schedule management popup
  const handleBookStudentFromPopup = async () => {
    if (!selectedStudent || scheduleEntries.length === 0) {
      alert("Please select a student and add at least one schedule entry");
      return;
    }

    try {
      setScheduleManagementPopup((prev) => ({ ...prev, isLoading: true }));

      // Format schedule entries for API
      const formattedSchedule = scheduleEntries.map((entry) => {
        // Parse YYYY-MM-DD format
        const [year, month, day] = entry.date.split("-").map(Number);
        const [hour, minute] = entry.time.split(":").map(Number);

        // Extract timezone offset
        const match = selectedTimezone.match(/GMT([+-]\d{2}):(\d{2})/);
        const offsetHours = parseInt(match[1], 10);
        const offsetMinutes = parseInt(match[2], 10);

        // Create a date as if it were in the given offset
        const localDate = new Date(
          Date.UTC(
            year,
            month - 1,
            day,
            hour - offsetHours,
            minute - offsetMinutes
          )
        );

        // Convert to UTC string
        const utcYear = localDate.getUTCFullYear();
        const utcMonth = String(localDate.getUTCMonth() + 1).padStart(2, "0");
        const utcDay = String(localDate.getUTCDate()).padStart(2, "0");
        const utcHour = String(localDate.getUTCHours()).padStart(2, "0");
        const utcMinute = String(localDate.getUTCMinutes()).padStart(2, "0");

        return [`${utcYear}-${utcMonth}-${utcDay}`, `${utcHour}:${utcMinute}`];
      });

      // Prepare attendees list
      const attendeeslist = attendeesList.map((item) => item.email);

      // Create API payload
      const apiPayload = {
        jl_uid: [selectedStudent.jetlearner_id],
        teacher_uid: "", // Empty as requested
        platform_credentials: platformCredentials || "",
        class_count: 1,
        schedule: formattedSchedule,
        attendees: attendeeslist,
        class_type: "1:1",
        booking_type: "Trial", // Set as trial as requested
        time_zone: formatTimezoneForAPI(selectedTimezone),
        ...(window.scheduleManagementPdfBase64 && {
          pdf_attached: window.scheduleManagementPdfBase64,
        }),
      };

      console.log("📤 Sending booking to API:", apiPayload);

      const response = await fetch(
        "https://live.jetlearn.com/api/book-class/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(apiPayload),
        }
      );

      if (!response.ok) {
        throw new Error(`API call failed: ${response.status}`);
      }

      const result = await response.json();
      console.log("✅ Booking successful:", result);

      // Show success message
      setSuccessMessage({
        show: true,
        message: `Successfully booked class for ${selectedStudent.deal_name}`,
        type: "booking",
      });

      // Close popup and reset form
      handleScheduleManagementClose();
      setScheduleEntries([]);
      setAttendeesList([]);
      setAttendees("");
      setPlatformCredentials("");
      setPdfFile(null);
      setPdfFileName("");
      window.scheduleManagementPdfBase64 = "";
      await fetchListViewBookingDetails();
    } catch (error) {
      console.error("❌ Error booking student:", error);
      alert("Failed to book class. Please try again.");
    } finally {
      setScheduleManagementPopup((prev) => ({ ...prev, isLoading: false }));
    }
  };

  // Function to clear teacher filter
  const clearTeacherFilter = () => {
    console.log("🗑️ Clearing teacher filter...");
    setSelectedTeacher(null);

    // Clear clicked slots when teacher filter is cleared
    setClickedSlots(new Set());

    // Switch to Week View when no filters are applied
    if (!selectedStudent) {
      setCurrentView("week");
    }

    // Trigger API call without teacher filter
    const refreshWithoutTeacher = async () => {
      setApiDataLoading(true);
      console.log("🔄 API call without teacher filter...");
      const data = await fetchWeeklyAvailabilityData(
        currentWeekStart,
        null,
        selectedStudent?.jetlearner_id,
        selectedTimezone
      );
      if (data) {
        setWeeklyApiData(data);
        console.log("✅ Teacher filter cleared - view updated");
      }
      setApiDataLoading(false);
    };

    refreshWithoutTeacher();
  };

  // Function to clear student filter
  const clearStudentFilter = () => {
    console.log("🗑️ Clearing student filter...");
    setSelectedStudent(null);
    setLearnerCalendarStats(null);

    // Switch to Week View when no filters are applied
    if (!selectedTeacher) {
      setCurrentView("week");
    }

    // Trigger API call without student filter
    const refreshWithoutStudent = async () => {
      setApiDataLoading(true);
      console.log("🔄 API call without student filter...");
      const data = await fetchWeeklyAvailabilityData(
        currentWeekStart,
        selectedTeacher?.uid,
        null,
        selectedTimezone
      );
      if (data) {
        setWeeklyApiData(data);
        console.log("✅ Student filter cleared - view updated");
      }
      setApiDataLoading(false);
    };

    refreshWithoutStudent();
  };

  // Function to clear all filters
  const clearAllFilters = () => {
    console.log("🗑️ Clearing all filters...");
    setSelectedTeacher(null);
    setSelectedStudent(null);
    setLearnerCalendarStats(null);

    // Clear clicked slots when filters are cleared
    setClickedSlots(new Set());

    // Switch to Week View when all filters are cleared
    setCurrentView("week");

    // Trigger API call to fetch ALL data without any filters
    const refreshWithoutFilters = async () => {
      setApiDataLoading(true);
      console.log("🔄 API call to fetch ALL data (no filters)...");
      console.log(
        "📋 This will fetch complete dataset for all teachers and students"
      );

      try {
        const weekDates = getWeekDates(currentWeekStart);
        const startDate = formatDate(weekDates[0]);
        const endDate = formatDate(weekDates[6]);

        const formData = new URLSearchParams();
        formData.append("timezone", formatTimezoneForAPI(selectedTimezone));
        formData.append("start_date", startDate);
        formData.append("end_date", endDate);

        console.log("🚀 FETCHING ALL DATA - No filter parameters");
        console.log("📊 Payload:", Object.fromEntries(formData));

        const response = await fetch(
          "https://live.jetlearn.com/events/get-bookings-availability-summary/",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: formData.toString(),
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log("📊 ALL DATA Response:", result);
        console.log("✅ All filters cleared - showing complete dataset");

        setWeeklyApiData(result);
      } catch (error) {
        console.error("❌ Error fetching all data:", error);
        setApiDataError(error.message);
      }

      setApiDataLoading(false);
    };

    refreshWithoutFilters();
  };

  // Test function to show data for a specific time
  const testSpecificTimeData = async () => {
    const testDate = new Date(); // Today's date
    const testTime = "17:00"; // 5 PM - matching the example data

    console.log("🧪 Testing specific time data for:", testDate, testTime);

    // Test availability data
    try {
      console.log("📊 Testing Availability API for 17:00...");
      await sendAvailabilityToAPI(testDate, testTime, selectedTeacher?.uid);
    } catch (error) {
      console.error("❌ Availability test failed:", error);
    }

    // Test booking data
    try {
      console.log("📊 Testing Bookings API for 17:00...");
      await sendBookingToAPI(testDate, testTime, selectedTeacher?.uid);
    } catch (error) {
      console.error("❌ Bookings test failed:", error);
    }

    // Open popup to show the data
    setDetailsPopup({
      isOpen: true,
      type: "booking", // Changed to booking to show the example data format
      data: [],
      date: testDate,
      time: testTime,
    });
  };

  const navigateWeek = (direction) => {
    const newWeekStart = new Date(currentWeekStart);
    newWeekStart.setDate(currentWeekStart.getDate() + direction * 7);
    setCurrentWeekStart(newWeekStart);
  };

  const goToCurrentWeek = () => {
    setCurrentWeekStart(getCurrentWeekStart());
  };

  // Handle availability click
  const handleAvailabilityClick = async (date, time, teachers) => {
    // Ensure date is a Date object
    const dateObj = date instanceof Date ? date : new Date(date);

    // Check if date is a locked holiday
    if (isLockedHoliday(dateObj)) {
      alert(
        "This date is locked due to holiday. No actions can be performed on this date."
      );
      return;
    }

    const { teacherid, available } = getSlotCounts(dateObj, time);

    // Always open popup if available count > 0
    setDetailsPopup({
      isOpen: true,
      type: "availability",
      data: teachers,
      date: dateObj,
      time,
    });
    console.log("✅ Popup opened for availability");

    // Reset availability API state when opening
    setAvailabilityAPI({
      isLoading: false,
      success: false,
      error: null,
      response: null,
    });

    // In week view, if availability count > 1, fetch ALL teachers for that time slot
    // Don't filter by a specific teacher when multiple teachers are available
    try {
      if (currentView === "week" && available > 1) {
        // Week view with multiple teachers - fetch all availability for this time slot
        console.log(
          "🚀 Week view: Fetching all availability (multiple teachers detected):",
          available
        );
        await sendAvailabilityToAPI(date, time, null);
      } else if (teacherid) {
        console.log("🚀 Calling availability API with teacherid:", teacherid);
        await sendAvailabilityToAPI(date, time, teacherid);
      } else if (selectedTeacher && selectedTeacher.uid) {
        console.log(
          "🚀 Calling availability API with selected teacher:",
          selectedTeacher.uid
        );
        await sendAvailabilityToAPI(date, time, selectedTeacher.uid);
      } else {
        console.log(
          "🚀 Calling availability API without specific teacher (all teachers)"
        );
        // Call API without teacher filter to get all availability data
        await sendAvailabilityToAPI(date, time, null);
      }
    } catch (error) {
      console.error("Failed to fetch availability data:", error);
    }
  };

  // Handle booking click
  const handleBookingClick = async (date, time, students) => {
    // Ensure date is a Date object
    const dateObj = date instanceof Date ? date : new Date(date);

    // Check if date is a locked holiday
    if (isLockedHoliday(dateObj)) {
      alert(
        "This date is locked due to holiday. No actions can be performed on this date."
      );
      return;
    }

    const { teacherid } = getSlotCounts(dateObj, time);

    // Always open popup if booked count > 0
    setDetailsPopup({
      isOpen: true,
      type: "booking",
      data: students,
      date: dateObj,
      time,
    });
    console.log("✅ Popup opened for booking");

    // Reset booking API state when opening
    setBookingApiResponse({
      isLoading: false,
      success: false,
      error: null,
      data: null,
    });

    // Always trigger API call for booking data, with or without teacher
    try {
      if (teacherid) {
        console.log("🚀 Calling booking API with teacherid:", teacherid);
        await sendBookingToAPI(date, time, teacherid);
      } else if (selectedTeacher && selectedTeacher.uid) {
        console.log(
          "🚀 Calling booking API with selected teacher:",
          selectedTeacher.uid
        );
        await sendBookingToAPI(date, time, selectedTeacher.uid);
      } else {
        console.log(
          "🚀 Calling booking API without specific teacher (all teachers)"
        );
        // Call API without teacher filter to get all booking data
        await sendBookingToAPI(date, time, null);
      }
    } catch (error) {
      console.error("Failed to fetch booking data:", error);
    }
  };

  // Handle delete class API call
  const handleDeleteClass = async (eventId, upcomingEvents = false) => {
    try {
      // Set loading state
      setIsOperationLoading(true);

      console.log("🚀 Calling delete-class API:", {
        eventId,
        upcomingEvents,
      });

      // Prepare payload for delete-class API
      const payload = {
        event_id: eventId,
        upcoming_events: upcomingEvents.toString(), // Convert boolean to string
        updated_by: user?.email,
      };

      console.log("📤 Sending delete-class API request:");
      console.log("🚀 URL: https://live.jetlearn.com/api/delete-class/");
      console.log("📊 Payload:", JSON.stringify(payload, null, 2));

      const response = await fetch(
        "https://live.jetlearn.com/api/delete-class/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      console.log("✅ Delete Class API Response:", response);

      const result = await response.json();
      console.log("✅ Delete Class API result:", result);

      // Check if deletion was successful
      if (result.status === "success") {
        // Show success message
        setSuccessMessage({
          show: true,
          message: "Booking Successfully Deleted !!",
          type: "cancel",
        });

        // Close success message after delay
        setTimeout(() => {
          setConfirmationPopup(false);
          setSuccessMessage({
            show: false,
            message: "",
            type: "",
          });
        }, 2000);

        await fetchListViewBookingDetails();
      } else {
        throw new Error(result.message || "Delete failed");
      }
    } catch (error) {
      console.error("❌ Error calling delete-class API:", error);
      throw error;
    } finally {
      setIsOperationLoading(false);
    }
  };

  // Handle cancel availability
  const handleCancelAvailability = async (
    date,
    time,
    teacherId = null,
    reason = "",
    eventId = null,
    upcomingEvents = false
  ) => {
    try {
      // Set loading state
      setIsOperationLoading(true);

      console.log("🚀 Canceling availability for:", {
        date,
        time,
        teacherId,
        reason,
        eventId,
        upcomingEvents,
      });

      // Ensure date is a Date object
      const dateObj = date instanceof Date ? date : new Date(date);

      // Get teacher ID if not provided
      if (!teacherId) {
        const slotData = getSlotCounts(dateObj, time);
        teacherId = slotData.teacherid || selectedTeacher?.uid;
      }

      if (!teacherId) {
        console.error("❌ No teacher ID available for canceling availability");
        return;
      }

      // If eventId is provided, use delete-class API
      if (eventId) {
        console.log("🎯 Using delete-class API for availability cancellation");
        const deleteResult = await handleDeleteClass(
          eventId,
          upcomingEvents || false
        );

        if (deleteResult.success) {
          // Refresh the data after canceling
          await fetchListViewBookingDetails();

          // Show success message
          setSuccessMessage({
            show: true,
            message: "Availability Successfully Cancelled !!",
            type: "cancel",
          });

          // Close success message after delay
          setTimeout(() => {
            setModalOpen(false);
            setSuccessMessage({
              show: false,
              message: "",
              type: "",
            });
          }, 2000);
        }
        return;
      }
    } catch (error) {
      console.error("❌ Error canceling availability:", error);
      alert("Failed to cancel availability. Please try again.");
    } finally {
      setIsOperationLoading(false);
    }
  };

  // Handle cancel booking
  const handleCancelBooking = async (
    date,
    time,
    bookingData,
    reason = "",
    eventId = null,
    classCount = 1
  ) => {
    try {
      // Set loading state
      setIsOperationLoading(true);

      console.log("🚀 Canceling booking for:", {
        date,
        time,
        bookingData,
        reason,
        classCount,
      });

      // Fallback to old API if no eventId (for backward compatibility)
      console.log("⚠️ No eventId provided, using fallback API");

      // Ensure date is a Date object
      const dateObj = date instanceof Date ? date : new Date(date);
      console.log(dateObj);
      const day = String(dateObj.getUTCDate()).padStart(2, "0");
      const month = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
      const year = dateObj.getUTCFullYear();
      const hours = String(dateObj.getUTCHours()).padStart(2, "0");
      const minutes = String(dateObj.getUTCMinutes()).padStart(2, "0");

      const formatted = `${day}-${month}-${year} ${hours}:${minutes}`;
      console.log(formatted); // "31-07-2025 09:15"
      const text = bookingData.summary;
      const jl_id = text.match(/\b(JL)[A-Za-z0-9]+\b/g);
      console.log(jl_id);
      const tl_id = text.match(/\b(TJL)[A-Za-z0-9]+\b/g);
      console.log(tl_id);
      // Call API to cancel booking
      const response = await fetch(
        "https://live.jetlearn.com/api/cancel-class/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            cancellation_datetime: formatted, // "31-07-2025 09:15"
            jl_uid: jl_id,
            //jluid: jl_id,
            tlid: tl_id[0],
            summary: bookingData.summary,
            cancellation_type: reason,
            updated_by: user?.email,
            eventId: eventId, // Include event_id in API call
            class_count: classCount, // Include class count parameter
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log("✅ Booking canceled successfully:", result);

      // Check if cancellation was successful
      if (result.status === "success") {
        // Determine message type based on reason
        const isNoShow = reason.includes("NO SHOW");
        const messageType = isNoShow ? "no-show" : "cancel";
        const messageText = isNoShow
          ? "No Show Successfully Recorded !!"
          : "Booking Successfully Cancelled !!";

        // Show success message
        setSuccessMessage({
          show: true,
          message: messageText,
          type: messageType,
        });

        // Close the cancel popup after a short delay
        setTimeout(() => {
          setCancelPopup({
            isOpen: false,
            type: null,
            data: null,
            date: null,
            time: null,
            reason: "",
            studentDetails: null,
            teacherDetails: null,
            classCount: 1,
            isLoading: false,
          });
          setSuccessMessage({
            show: false,
            message: "",
            type: "",
          });
        }, 2000);
      }

      // Refresh the data after canceling
      await fetchListViewBookingDetails();
    } catch (error) {
      console.error("❌ Error canceling booking:", error);
      // alert("Failed to cancel booking. Please try again.");
    } finally {
      setIsOperationLoading(false);
    }
  };

  // Handle reschedule booking
  const handleRescheduleBooking = async (date, time, bookingData) => {
    try {
      console.log("🚀 Rescheduling booking for:", { date, time, bookingData });

      // Ensure date is a Date object
      const dateObj = date instanceof Date ? date : new Date(date);

      // Check if date is a locked holiday
      if (isLockedHoliday(dateObj)) {
        alert(
          "This date is locked due to holiday. No booking can be rescheduled to this date."
        );
        return;
      }

      // For now, we'll just show a message that reschedule functionality is coming
      // You can implement the actual reschedule logic here
      // alert("Reschedule functionality is coming soon!");

      // TODO: Implement reschedule API call
      // const response = await fetch("/api/reschedule-booking", {
      //   method: "POST",
      //   headers: {
      //     "Content-Type": "application/json",
      //   },
      //   body: JSON.stringify({
      //     date: dateObj.toISOString().split('T')[0],
      //     time: time,
      //     bookingData: bookingData,
      //     timezone: selectedTimezone
      //   }),
      // });
    } catch (error) {
      console.error("❌ Error rescheduling booking:", error);
      // alert("Failed to reschedule booking. Please try again.");
    }
  };

  // Handle adding availability from gray blocks
  const handleAddAvailability = (date, time) => {
    if (!selectedTeacher) {
      alert("Please select a teacher first to add availability.");
      return;
    }

    // Check if date is a locked holiday
    const dateObj = date instanceof Date ? date : new Date(date);
    if (isLockedHoliday(dateObj)) {
      alert(
        "This date is locked due to holiday. No availability can be added on this date."
      );
      return;
    }

    // Create a unique key for this slot
    const slotKey = `${formatDate(date)}-${time}`;

    // Add to clicked slots to prevent plus icon from showing again
    setClickedSlots((prev) => new Set([...prev, slotKey]));

    // Create individual toaster for this slot
    setSlotToasters((prev) => ({
      ...prev,
      [slotKey]: {
        show: true,
        date: date,
        time: time,
        teacherId: selectedTeacher.uid,
      },
    }));
  };

  // Handle deleting availability
  const handleDeleteAvailability = async (slotKey) => {
    const toasterData = slotToasters[slotKey];
    if (
      !toasterData ||
      !toasterData.date ||
      !toasterData.time ||
      !toasterData.teacherId
    ) {
      alert("Missing required data for deleting availability.");
      return;
    }

    try {
      // Format date to YYYY-MM-DD format
      const dateObj =
        toasterData.date instanceof Date
          ? toasterData.date
          : new Date(toasterData.date);
      const formattedDate = dateObj.toISOString().split("T")[0]; // YYYY-MM-DD format

      // Remove from clicked slots to make plus icon clickable again
      setClickedSlots((prev) => {
        const newSet = new Set(prev);
        newSet.delete(slotKey);
        return newSet;
      });

      // Close toaster
      setSlotToasters((prev) => {
        const newToasters = { ...prev };
        delete newToasters[slotKey];
        return newToasters;
      });

      // Show success message
      setSuccessMessage({
        show: true,
        message: "Availability deleted successfully!",
        type: "availability",
      });

      // Refresh the weekly data
      await refreshWeeklyDataForTeacher(selectedTeacher);
    } catch (error) {
      console.error("❌ Error deleting availability:", error);
      alert("Failed to delete availability. Please try again.");
    }
  };

  // Handle saving all availability toasters at once
  const handleSaveAllAvailability = async () => {
    const toasterEntries = Object.entries(slotToasters);
    if (toasterEntries.length === 0) {
      alert("No availability to save.");
      return;
    }

    setIsSavingAvailability(true);
    try {
      // Prepare all schedules for the API
      const schedules = [];
      const teacherId = selectedTeacher?.uid;

      if (!teacherId) {
        alert("No teacher selected for adding availability.");
        return;
      }

      for (const [slotKey, toasterData] of toasterEntries) {
        if (!toasterData || !toasterData.date || !toasterData.time) {
          console.warn("Skipping invalid toaster data:", toasterData);
          continue;
        }

        // Format date to YYYY-MM-DD format
        const dateObj =
          toasterData.date instanceof Date
            ? toasterData.date
            : new Date(toasterData.date);
        const formattedDate = dateObj.toISOString().split("T")[0]; // YYYY-MM-DD format

        // Add only the original date - backend will handle repetition based on count
        schedules.push([formattedDate, toasterData.time]);
      }

      if (schedules.length === 0) {
        alert("No valid availability data to save.");
        return;
      }

      // Extract offset hours and minutes from "(GMT+02:00)"
      const match = selectedTimezone.match(/GMT([+-]\d{2}):(\d{2})/);
      const offsetHours = parseInt(match[1], 10); // +02
      const offsetMinutes = parseInt(match[2], 10); // 00

      console.log("offsetHours", offsetHours);
      console.log("offsetMinutes", offsetMinutes);
      console.log("match", match);
      console.log("schedules", schedules);

      const formattedSchedule = schedules.map(([date, time]) => {
        // Parse DD-MM-YYYY
        const [year, month, day] = date.split("-").map(Number);
        const [hour, minute] = time.split(":").map(Number);

        // Create a date as if it were in the given offset
        const localDate = new Date(
          Date.UTC(
            year,
            month - 1,
            day,
            hour - offsetHours,
            minute - offsetMinutes
          )
        );

        // Convert to UTC string
        const utcYear = localDate.getUTCFullYear();
        const utcMonth = String(localDate.getUTCMonth() + 1).padStart(2, "0");
        const utcDay = String(localDate.getUTCDate()).padStart(2, "0");
        const utcHour = String(localDate.getUTCHours()).padStart(2, "0");
        const utcMinute = String(localDate.getUTCMinutes()).padStart(2, "0");

        return [`${utcYear}-${utcMonth}-${utcDay}`, `${utcHour}:${utcMinute}`];
      });

      // Prepare payload for add-teacher-availability API
      const payload = {
        teacher_uid: teacherId,
        schedule: formattedSchedule,
        updated_by: user?.email,
        count: globalRepeatOccurrence,
      };

      console.log(
        "📤 Sending add-teacher-availability API request for all toasters:"
      );
      console.log("🚀 Payload:", payload);
      console.log("🔄 Repeat count:", globalRepeatOccurrence);
      console.log(
        "🌐 URL: https://live.jetlearn.com/api/add-teacher-availability/"
      );

      const response = await fetch(
        "https://live.jetlearn.com/api/add-teacher-availability/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        let errorMsg = `HTTP error! status: ${response.status}`;
        try {
          const errJson = await response.json();
          if (errJson && errJson.message) errorMsg += ` - ${errJson.message}`;
        } catch {}
        throw new Error(errorMsg);
      }

      const result = await response.json();
      console.log("✅ Add Teacher Availability API Response:", result);

      // Clear all toasters but keep clicked slots to hide plus icons permanently
      setSlotToasters({});
      // Don't clear clickedSlots - keep them to hide plus icons after saving
      // setClickedSlots(new Set());

      // Show success message
      const totalSlots = schedules.length * globalRepeatOccurrence;
      setSuccessMessage({
        show: true,
        message: `Successfully added ${totalSlots} availability slot${
          totalSlots !== 1 ? "s" : ""
        }!`,
        type: "availability",
      });

      // Refresh the weekly data
      await refreshWeeklyDataForTeacher(selectedTeacher);
    } catch (error) {
      console.error("❌ Error adding availability:", error);
      alert("Failed to add availability. Please try again.");
    } finally {
      setIsSavingAvailability(false);
    }
  };

  // Handle saving availability (kept for backward compatibility)
  const handleSaveAvailability = async (slotKey) => {
    const toasterData = slotToasters[slotKey];
    if (
      !toasterData ||
      !toasterData.date ||
      !toasterData.time ||
      !toasterData.teacherId
    ) {
      alert("Missing required data for adding availability.");
      return;
    }

    try {
      // Format date to YYYY-MM-DD format
      const dateObj =
        toasterData.date instanceof Date
          ? toasterData.date
          : new Date(toasterData.date);
      const formattedDate = dateObj.toISOString().split("T")[0]; // YYYY-MM-DD format

      // Prepare payload for add-teacher-availability API
      const payload = {
        teacher_uid: toasterData.teacherId,
        schedule: [[formattedDate, toasterData.time]],
        updated_by: user?.email,
      };

      console.log("📤 Sending add-teacher-availability API request:");
      console.log("🚀 Payload:", payload);
      console.log(
        "🌐 URL: https://live.jetlearn.com/api/add-teacher-availability/"
      );

      const response = await fetch(
        "https://live.jetlearn.com/api/add-teacher-availability/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        let errorMsg = `HTTP error! status: ${response.status}`;
        try {
          const errJson = await response.json();
          if (errJson && errJson.message) errorMsg += ` - ${errJson.message}`;
        } catch {}
        throw new Error(errorMsg);
      }

      const result = await response.json();
      console.log("✅ Add Teacher Availability API Response:", result);

      // Keep the slot in clickedSlots to hide the plus icon permanently after saving
      // This ensures the plus icon doesn't show again for this slot
      // setClickedSlots(prev => {
      //   const newSet = new Set(prev);
      //   newSet.delete(slotKey);
      //   return newSet;
      // });

      // Close toaster and show success message
      setSlotToasters((prev) => {
        const newToasters = { ...prev };
        delete newToasters[slotKey];
        return newToasters;
      });
      setSuccessMessage({
        show: true,
        message: "Availability added successfully!",
        type: "availability",
      });

      // Refresh the weekly data
      await refreshWeeklyDataForTeacher(selectedTeacher);
    } catch (error) {
      console.error("❌ Error adding availability:", error);
      alert("Failed to add availability. Please try again.");
    }
  };

  // Function to filter API data by specific time slot
  const filterDataByTime = (data, targetTime, maxCount = null) => {
    if (!data) return [];

    let filteredData = [];

    // Handle the new nested API response format: { "2025-07-23": { "17:00": { "events": [...] } } }
    const dates = Object.keys(data);

    for (const date of dates) {
      const dateData = data[date];
      console.log(`📅 Checking date ${date}:`, dateData);

      if (dateData && dateData[targetTime] && dateData[targetTime].events) {
        console.log("✅ Found exact time match:", targetTime, "in date:", date);
        console.log("📋 Events found:", dateData[targetTime].events);
        filteredData = dateData[targetTime].events;
        break;
      }
    }

    // Fallback: Handle the old format where time was directly accessible
    if (
      filteredData.length === 0 &&
      data[targetTime] &&
      data[targetTime].events
    ) {
      console.log("✅ Found exact time match (old format):", targetTime);
      console.log("📋 Events found:", data[targetTime].events);
      filteredData = data[targetTime].events;
    }

    // Handle array format (fallback)
    if (filteredData.length === 0 && Array.isArray(data)) {
      console.log("📋 Processing as array format");
      filteredData = data.filter((record) => {
        if (!record.start_time) return false;
        const startTime = record.start_time;
        const timeMatch = startTime.includes(`T${targetTime}:`);
        return timeMatch;
      });
    }

    // Apply count limit if specified
    if (maxCount !== null && filteredData.length > maxCount) {
      console.log(
        `📊 Limiting results from ${filteredData.length} to ${maxCount} to match grid count`
      );
      filteredData = filteredData.slice(0, maxCount);
    }

    console.log("📊 Final filtered data count:", filteredData.length);
    return filteredData;
  };

  // Function to process booking data for edit popup
  const processBookingDataForEdit = (extractedData, bookingDate, timeRange) => {
    const summary = extractedData.summary || "";
    const description = extractedData.description || "";
    // Extract recording keywords from summary
    const recordingKeywords = [];
    if (summary.includes("DNREC")) recordingKeywords.push("DNREC");
    if (summary.includes("MAKE UP")) recordingKeywords.push("MAKE UP");
    if (summary.includes("MAKE UP - S")) recordingKeywords.push("MAKE UP - S");
    if (summary.includes("Reserved")) recordingKeywords.push("Reserved");
    if (summary.includes("Migration")) recordingKeywords.push("Migration");
    if (summary.toLowerCase().includes("gmeet"))
      recordingKeywords.push("GMEET");

    // Extract learner IDs starting with JL from summary
    const jlMatches = summary.match(/\bJL[A-Za-z0-9]+\b/g) || [];
    const extractedLearners = jlMatches.map((jlId) => {
      // Find the learner in students array
      const existingLearner = students.find((s) => s.jetlearner_id === jlId);
      if (existingLearner) {
        return existingLearner;
      } else {
        // Create learner object if not found
        return {
          jetlearner_id: jlId,
          name: jlId,
          deal_name: jlId,
        };
      }
    });

    // Extract teacher ID starting with TL from summary
    const tlMatch = summary.match(/\bTL[A-Za-z0-9]+\b/);
    const teacherId = tlMatch ? tlMatch[0] : extractedData.teacherid || "";

    // Extract attendees from summary or existing data
    let extractedAttendees = "";
    if (extractedData.attendees) {
      // Handle attendees as array or string
      if (Array.isArray(extractedData.attendees)) {
        extractedAttendees = extractedData.attendees.join(", ");
        console.log(
          "📧 Extracted attendees from array:",
          extractedData.attendees
        );
      } else {
        extractedAttendees = extractedData.attendees;
        console.log(
          "📧 Extracted attendees from string:",
          extractedData.attendees
        );
      }
    } else {
      // Try to extract email addresses from summary
      const emailMatches = summary.match(
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
      );
      if (emailMatches) {
        extractedAttendees = emailMatches.join(", ");
        console.log("📧 Extracted attendees from summary:", emailMatches);
      }
    }
    console.log("📧 Final extracted attendees:", extractedAttendees);

    // Determine class type based on summary keywords
    let classType = "1:1"; // default
    if (summary.includes("1:2")) {
      classType = "1:2";
    } else if (summary.includes("batch") || summary.includes("Batch")) {
      classType = "batch";
    }

    // Determine booking type
    const bookingType = summary.includes("Trial") ? "Trial" : "Paid";

    // Extract course information from JL ID (last character)
    const courseInfo = [];
    jlMatches.forEach((jlId) => {
      const lastChar = jlId.slice(-1).toUpperCase();
      if (lastChar === "C") {
        courseInfo.push(`${jlId}: Coding`);
      } else if (lastChar === "M") {
        courseInfo.push(`${jlId}: Maths`);
      }
    });

    return {
      ...extractedData,
      // Pre-populate description from summary
      description: description,
      summary: summary,
      // Pre-populate class type based on keywords
      class_type: classType,
      // Pre-populate booking type
      booking_type: bookingType,
      // Pre-populate course information
      course_info: courseInfo,
      // Pre-populate student data (use extracted learners or fallback to original)
      student:
        extractedLearners.length > 0
          ? extractedLearners[0]
          : {
              jetlearner_id: extractedData.jlid,
              name: extractedData.learner_name,
              deal_name: extractedData.learner_name,
            },
      // Pre-populate all extracted learners
      students: extractedLearners,
      // Pre-populate schedule - extract only start time from timeRange
      schedule: [[formatDate(bookingDate), timeRange.split(" - ")[0]]],
      // Pre-populate recording keywords
      recording: recordingKeywords,
      // Pre-populate other fields
      attendees: extractedAttendees,
      class_count: "1",
      teacher_id: teacherId,
    };
  };

  // Helper function to validate and auto-correct email addresses
  const validateAndCorrectEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Basic email validation
    if (!emailRegex.test(email)) {
      return {
        isValid: false,
        correctedEmail: null,
        error: "Please enter a valid email address",
      };
    }

    // Domain auto-correction
    let correctedEmail = email;
    const [localPart, domain] = email.split("@");
    const domainLower = domain.toLowerCase();

    if (domainLower.includes("gmal") || domainLower.includes("gmai")) {
      correctedEmail = `${localPart}@gmail.com`;
    } else if (domainLower.includes("yah")) {
      correctedEmail = `${localPart}@yahoo.com`;
    } else if (
      domainLower.includes("hotmai") ||
      domainLower.includes("hotmal")
    ) {
      correctedEmail = `${localPart}@hotmail.com`;
    } else if (domainLower.includes("outloo")) {
      correctedEmail = `${localPart}@outlook.com`;
    }

    return {
      isValid: true,
      correctedEmail,
      needsCorrection: correctedEmail !== email,
      originalEmail: email,
    };
  };

  // Function to extract specific fields from event data
  const extractEventFields = (event, type) => {
    if (type === "availability") {
      return {
        start_time: event.start_time,
        end_time: event.end_time,
        creator: event.creator,
        summary: event.summary,
        description: event.description,
        event_id: event.event_id,
        class_type: event.class_type,
        timezone: event.timezone,
      };
    } else if (type === "booking") {
      // Parse summary to extract fields
      const summary = event.summary || "";
      const parts = summary.split(" : ");

      let learnerName = event.student_name || "N/A";
      let jlid = event.student_id || "N/A";
      let teacherName = "N/A";

      if (parts.length >= 2) {
        learnerName = parts[1] || "N/A";
        if (learnerName.includes("(") && learnerName.includes(")")) {
          const jlidMatch = learnerName.match(/\(([^)]+)\)/);
          if (jlidMatch) {
            jlid = jlidMatch[1];
            learnerName = learnerName.replace(/\([^)]+\)/, "").trim();
          }
        }
      }

      if (parts.length >= 3) {
        teacherName = parts[2] || "N/A";
        if (teacherName.includes("(") && teacherName.includes(")")) {
          const teacherMatch = teacherName.match(/\(([^)]+)\)/);
          if (teacherMatch) {
            teacherName = teacherMatch[1];
          }
        }
      }

      return {
        start_time: event.start_time,
        end_time: event.end_time,
        summary: event.summary,
        description: event.description,
        creator: event.creator,
        teacherid: event.calendar_id || "N/A",
        jlid: jlid,
        learner_name: learnerName,
        teacher_name: teacherName,
        event_id: event.event_id,
        class_type: event.class_type,
        timezone: event.timezone,
        attendees: event.attendees || [], // Preserve attendees array from original event
        updated_by: event.updated_by || "", // Add updated_by field
        jet_guide: event.jet_guide || "", // Add jet_guide field
      };
    }

    return event;
  };

  // Function to parse booking details for list view
  const parseBookingDetails = (data) => {
    if (!data) return [];

    const bookings = [];

    // Handle different data formats
    if (Array.isArray(data)) {
      // Direct array format

      bookings.push(...data);
    } else if (typeof data === "object") {
      // Object format with dates as keys
      // console.log("📋 Processing as object format");
      Object.entries(data).forEach(([date, timeSlots]) => {
        // console.log(`📅 Processing date: ${date}`, timeSlots);
        if (typeof timeSlots === "object") {
          Object.entries(timeSlots).forEach(([time, slotData]) => {
            //  console.log(`⏰ Processing time: ${time}`, slotData);
            if (slotData && slotData.events && Array.isArray(slotData.events)) {
              slotData.events.forEach((event) => {
                //console.log("📋 Adding event:", event);
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

    //console.log("📊 Final parsed bookings:", bookings);

    // Sort bookings by date and time
    return bookings.sort((a, b) => {
      const dateA = new Date(a.start_time || a.date);
      const dateB = new Date(b.start_time || b.date);
      return dateA - dateB;
    });
  };

  const selectedTimezoneLocaltime = formatTimeInTimezone(
    detailsPopup.date,
    detailsPopup.time,
    selectedTimezone
  );

  function addHoursToTimeRange(startTime, hoursToAdd) {
    const [startHour, startMinute] = startTime.split(":").map(Number);
    const endHour = (startHour + hoursToAdd) % 24;

    const format = (h, m) =>
      h.toString().padStart(2, "0") + ":" + m.toString().padStart(2, "0");

    const start = format(startHour, startMinute);
    const end = format(endHour, startMinute); // keeping same minutes

    return `${start} - ${end}`;
  }

  function formatDateDDMMMYYYY(date) {
    // Ensure date is a Date object
    const dateObj = date instanceof Date ? date : new Date(date);
    const day = dateObj.getDate().toString().padStart(2, "0");
    const month = dateObj.toLocaleString("en-US", { month: "short" }); // "Jul"
    const year = dateObj.getFullYear();

    return `${day}-${month}-${year}`;
  }

  // Pagination utility functions
  const getPaginatedData = (data, currentPage, itemsPerPage) => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return data.slice(startIndex, endIndex);
  };

  const getTotalPages = (totalItems, itemsPerPage) => {
    return Math.ceil(totalItems / itemsPerPage);
  };

  const handlePageChange = (newPage, type = "main") => {
    if (type === "popup") {
      setPopupPagination((prev) => ({
        ...prev,
        currentPage: newPage,
      }));
    } else {
      setPagination((prev) => ({
        ...prev,
        currentPage: newPage,
      }));
    }
  };

  // Pagination component
  const Pagination = ({
    currentPage,
    totalPages,
    onPageChange,
    size = "default",
  }) => {
    const sizeClasses = {
      small: "px-1 sm:px-2 py-1 text-xs",
      default: "px-2 sm:px-3 py-1 sm:py-2 text-xs sm:text-sm",
      large: "px-3 sm:px-4 py-2 sm:py-2 text-sm sm:text-base",
    };

    const buttonClass = `flex items-center justify-center ${sizeClasses[size]} font-medium rounded-md transition-colors duration-200`;

    const getVisiblePages = () => {
      const delta = 2;
      const range = [];
      const rangeWithDots = [];

      for (
        let i = Math.max(2, currentPage - delta);
        i <= Math.min(totalPages - 1, currentPage + delta);
        i++
      ) {
        range.push(i);
      }

      if (currentPage - delta > 2) {
        rangeWithDots.push(1, "...");
      } else {
        rangeWithDots.push(1);
      }

      rangeWithDots.push(...range);

      if (currentPage + delta < totalPages - 1) {
        rangeWithDots.push("...", totalPages);
      } else {
        rangeWithDots.push(totalPages);
      }

      return rangeWithDots;
    };

    if (totalPages <= 1) return null;

    return (
      <div className="flex items-center justify-center gap-1">
        {/* Previous button */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className={`${buttonClass} ${
            currentPage === 1
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "bg-white text-gray-700 hover:bg-gray-50 border border-gray-300"
          }`}
        >
          <FaChevronLeft size={10} className="sm:w-3 sm:h-3" />
        </button>

        {/* Page numbers */}
        {getVisiblePages().map((page, index) => (
          <button
            key={index}
            onClick={() =>
              typeof page === "number" ? onPageChange(page) : null
            }
            disabled={page === "..."}
            className={`${buttonClass} ${
              page === currentPage
                ? "bg-blue-600 text-white"
                : page === "..."
                ? "bg-transparent text-gray-500 cursor-default"
                : "bg-white text-gray-700 hover:bg-gray-50 border border-gray-300"
            }`}
          >
            {page}
          </button>
        ))}

        {/* Next button */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className={`${buttonClass} ${
            currentPage === totalPages
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "bg-white text-gray-700 hover:bg-gray-50 border border-gray-300"
          }`}
        >
          <FaChevronRight size={10} className="sm:w-3 sm:h-3" />
        </button>
      </div>
    );
  };

  // Success Message Component
  const SuccessMessage = () => {
    if (!successMessage.show) return null;

    // Auto-hide success message after 3 seconds
    React.useEffect(() => {
      if (successMessage.show) {
        const timer = setTimeout(() => {
          setSuccessMessage({
            show: false,
            message: "",
            type: "",
          });
        }, 3000);
        return () => clearTimeout(timer);
      }
    }, [successMessage.show]);

    const getMessageColor = () => {
      switch (successMessage.type) {
        case "booking":
          return "bg-green-500";
        case "cancel":
          return "bg-orange-500";
        case "no-show":
          return "bg-red-500";
        case "leave":
          return "bg-green-500";
        default:
          return "bg-blue-500";
      }
    };

    const getIcon = () => {
      switch (successMessage.type) {
        case "booking":
          return <FaCheckCircle size={20} />;
        case "cancel":
          return <FaTimes size={20} />;
        case "no-show":
          return <FaExclamationTriangle size={20} />;
        case "leave":
          return <FaCheckCircle size={20} />;
        default:
          return <FaCheckCircle size={20} />;
      }
    };

    return (
      <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right duration-300">
        <div
          className={`${getMessageColor()} text-white px-6 py-4 rounded-lg shadow-lg flex items-center gap-3 max-w-sm`}
        >
          {getIcon()}
          <div>
            <p className="font-semibold text-sm">{successMessage.message}</p>
          </div>
        </div>
      </div>
    );
  };

  // Booking Details Popup Component
  const BookingDetailsPopup = () => {
    if (!bookingDetailsPopup.isOpen) return null;

    const formatTime = (time) => {
      const [hours, minutes] = time.split(":");
      const startHour = parseInt(hours);
      const endHour = startHour + 1;
      return `${time} - ${String(endHour).padStart(2, "0")}:${minutes}`;
    };

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-3 md:p-4 animate-in fade-in duration-200">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl max-h-[85vh] sm:max-h-[80vh] md:max-h-[75vh] overflow-hidden border border-gray-100 backdrop-blur-lg animate-in slide-in-from-bottom-4 duration-300">
          {/* Header with gradient background */}
          <div className="flex items-center justify-between p-3 sm:p-4 bg-gradient-to-r from-yellow-50 to-orange-50 border-b border-gray-100">
            <div className="flex-1 min-w-0">
              <h2 className="text-base sm:text-lg md:text-xl font-bold truncate bg-gradient-to-r from-yellow-600 to-orange-600 bg-clip-text text-transparent">
                Booking Details
              </h2>
              <div className="mt-2 space-y-1">
                {selectedTimezone !== "UTC" && (
                  <p className="text-sm sm:text-base text-gray-700 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                    <span className="w-2 h-2 bg-orange-500 rounded-full flex-shrink-0"></span>
                    <span>Time Slot:</span>
                    <span className="font-semibold text-orange-500 bg-orange-50 px-2 py-1 rounded-lg text-sm sm:text-base break-words">
                      {formatDateDDMMMYYYY(bookingDetailsPopup.date)},{" "}
                      {formatTime(bookingDetailsPopup.time)} {selectedTimezone}
                    </span>
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() =>
                setBookingDetailsPopup({
                  isOpen: false,
                  data: null,
                  date: null,
                  time: null,
                })
              }
              className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all duration-200 ml-2 sm:ml-4 flex-shrink-0 p-1.5 sm:p-2 rounded-full hover:scale-110"
            >
              <FaTimes size={18} className="sm:w-5 sm:h-5" />
            </button>
          </div>

          <div className="p-3 sm:p-4 max-h-[calc(85vh-80px)] sm:max-h-[calc(80vh-90px)] md:max-h-[calc(75vh-100px)] overflow-y-auto">
            {bookingDetailsPopup.data && (
              <div className="space-y-4">
                {/* Summary Information */}
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-lg">
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-2">
                    <p className="text-sm sm:text-base text-white font-medium">
                      Booking Summary
                    </p>
                  </div>
                  <div className="p-3">
                    <div className="text-sm text-gray-900 font-medium break-words">
                      {bookingDetailsPopup.data.summary || "N/A"}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-2 justify-end">
                  <button
                    onClick={() => {
                      setBookingDetailsPopup({
                        isOpen: false,
                        data: null,
                        date: null,
                        time: null,
                      });
                    }}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors duration-200 font-medium text-sm"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      // Open Edit/Reschedule popup with current booking data
                      setEditReschedulePopup({
                        isOpen: true,
                        data: bookingDetailsPopup.data,
                        date: bookingDetailsPopup.date,
                        time: bookingDetailsPopup.time,
                        isLoading: false,
                      });
                      // Close the booking details popup
                      setBookingDetailsPopup({
                        isOpen: false,
                        data: null,
                        date: null,
                        time: null,
                      });
                    }}
                    className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 transition-colors duration-200 font-medium text-sm flex items-center gap-2"
                  >
                    <FaCalendarAlt size={14} />
                    Edit/Reschedule
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // CRITICAL: Store ref outside component to persist across component remounts
  // This ensures the teacher selection persists even if the component is recreated
  const editReschedulePopupTeacherRef = React.useRef(null);

  // Edit/Reschedule Popup Component with Schedule Management functionality
  const EditReschedulePopup = () => {
    if (!editReschedulePopup.isOpen) return null;

    // Teacher change functionality - must be declared before use
    const [showTeacherChange, setShowTeacherChange] = useState(false);
    const [newSelectedTeacher, setNewSelectedTeacher] = useState(null);
    const [teacherSearchTerm, setTeacherSearchTerm] = useState("");
    const [teacherSearchResults, setTeacherSearchResults] = useState([]);
    // Use the external ref to persist newSelectedTeacher across component remounts
    const newSelectedTeacherRef = editReschedulePopupTeacherRef;

    // State for the edit/reschedule form
    const [attendees, setAttendees] = useState("");
    const [attendeeInput, setAttendeeInput] = useState("");
    const [description, setDescription] = useState("");
    const [summary, setSummary] = useState("");

    // State for credentials edit mode
    const [isCredentialsEditing, setIsCredentialsEditing] = useState(false);
    const [tempDescription, setTempDescription] = useState("");

    // State for PDF file
    const [pdfFile, setPdfFile] = useState(null);
    const [pdfFileName, setPdfFileName] = useState("");
    const [pdfBase64, setPdfBase64] = useState("");

    // State for summary edit mode
    const [isSummaryEditing, setIsSummaryEditing] = useState(false);
    const [tempSummary, setTempSummary] = useState("");
    const [scheduleEntries, setScheduleEntries] = useState([]);
    const [upcomingEvents, setUpcomingEvents] = useState(false);
    const [selectedScheduleDate, setSelectedScheduleDate] = useState("");
    const [selectedScheduleTime, setSelectedScheduleTime] = useState("");
    const [selectedStudents, setSelectedStudents] = useState([]);
    const [studentSearchTerm, setStudentSearchTerm] = useState("");
    const [studentSearchResults, setStudentSearchResults] = useState([]);
    const [showStudentSearch, setShowStudentSearch] = useState(false);

    // Class details
    const [selectedClassType, setSelectedClassType] = useState("");
    const [selectedClassCount, setSelectedClassCount] = useState("");
    const [selectedRecording, setSelectedRecording] = useState([]);

    // Form initialization state
    const [isFormInitialized, setIsFormInitialized] = useState(false);

    // Handle teacher search
    const handleTeacherSearch = (searchTerm) => {
      setTeacherSearchTerm(searchTerm);
      if (searchTerm.trim() === "") {
        setTeacherSearchResults([]);
        return;
      }

      const filteredTeachers = teachers.filter(
        (teacher) =>
          teacher.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          teacher.uid.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setTeacherSearchResults(filteredTeachers.slice(0, 10));
    };

    // Handle teacher selection
    const handleTeacherSelect = async (teacher, event) => {
      // Prevent any default behavior that might cause page refresh
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }

      // CRITICAL: Set ref FIRST (synchronous) before state update
      // This ensures ref is always set even if state update triggers re-renders
      newSelectedTeacherRef.current = teacher;

      // Then set state (asynchronous)
      setNewSelectedTeacher(teacher);

      // Safety check: ensure ref persists after state update
      setTimeout(() => {
        if (newSelectedTeacherRef.current?.uid !== teacher.uid) {
          console.warn(
            "🔵 [WARNING] Ref was cleared after setState! Restoring:",
            {
              expectedUid: teacher.uid,
              actualRefUid: newSelectedTeacherRef.current?.uid,
            }
          );
          newSelectedTeacherRef.current = teacher;
        }
      }, 0);

      setShowTeacherChange(true);
      setTeacherSearchTerm("");
      setTeacherSearchResults([]);

      // Fetch teacher availability when teacher changes - fetch for a month starting from today
      if (teacher && teacher.uid) {
        try {
          // Calculate start date as today
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          // Calculate end date as one month from today
          const endDate = new Date(today);
          endDate.setMonth(endDate.getMonth() + 1);

          // Format dates for API (YYYY-MM-DD format)
          const startDateStr = formatDate(today);
          const endDateStr = formatDate(endDate);

          // Call API directly to fetch month of data
          const formData = new URLSearchParams();
          formData.append("start_date", startDateStr);
          formData.append("end_date", endDateStr);
          formData.append("timezone", formatTimezoneForAPI(selectedTimezone));
          formData.append("teacherid", teacher.uid);
          formData.append("email", teacher.email);

          const response = await fetch(
            "https://live.jetlearn.com/events/get-bookings-availability-summary/",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: formData.toString(),
            }
          );

          if (!response.ok) {
            throw new Error(`API call failed: ${response.status}`);
          }

          const result = await response.json();

          // API returns data in result.result (nested structure)
          // Handle both result.result, result.data, and direct result object
          const availabilityData = result.result || result.data || result;

          if (availabilityData && typeof availabilityData === "object") {
            // Dates are already in YYYY-MM-DD format, no conversion needed
            // Just add teacherid and uid to each time slot
            const convertedData = {};

            Object.keys(availabilityData).forEach((dateKey) => {
              // Date keys are already in YYYY-MM-DD format (e.g., "2025-12-11")
              const dateData = availabilityData[dateKey];

              if (dateData && typeof dateData === "object") {
                convertedData[dateKey] = {};
                Object.keys(dateData).forEach((timeKey) => {
                  const timeSlot = dateData[timeKey];
                  if (timeSlot && typeof timeSlot === "object") {
                    // Add uid and teacherid to each time slot for filtering
                    convertedData[dateKey][timeKey] = {
                      ...timeSlot,
                      teacherid: teacher.uid,
                      uid: teacher.uid,
                    };
                  }
                });
              }
            });

            // Store new teacher's availability data separately (don't merge with weeklyApiData)
            // This ensures we only show the new teacher's data, not mixed with old teacher's data
            setNewTeacherAvailabilityData(convertedData);

            // CRITICAL: Re-assert the teacher selection after setting availability data
            // This ensures the teacher persists even after re-renders triggered by setNewTeacherAvailabilityData

            // CRITICAL: Update ref first (synchronous) - this is the source of truth
            // Store teacher object in ref BEFORE any state updates that might trigger re-renders
            newSelectedTeacherRef.current = teacher;
            // Then update state using functional update to ensure it's set correctly
            setNewSelectedTeacher(() => {
              // Double-check ref is still set (defensive programming)
              if (!newSelectedTeacherRef.current) {
                newSelectedTeacherRef.current = teacher;
              }
              return teacher;
            });

            // CRITICAL: Use setTimeout to ensure ref persists after all state updates
            // This is a safety net in case something clears the ref during re-renders
            setTimeout(() => {
              if (newSelectedTeacherRef.current?.uid !== teacher.uid) {
                newSelectedTeacherRef.current = teacher;
                setNewSelectedTeacher(teacher);
              }
            }, 100);
          } else {
            console.warn(
              "⚠️ Availability data is not an object:",
              availabilityData
            );
          }
        } catch (error) {
          console.error("❌ Error fetching teacher availability:", error);
        }
      }
    };

    // Handle teacher change cancel
    const handleTeacherChangeCancel = () => {
      setShowTeacherChange(false);
      setNewSelectedTeacher(null);
      newSelectedTeacherRef.current = null;
      setTeacherSearchTerm("");
      setTeacherSearchResults([]);
      // Clear new teacher's availability data when cancelled
      setNewTeacherAvailabilityData({});
    };

    const formatTime = (time) => {
      const [hours, minutes] = time.split(":");
      const startHour = parseInt(hours);
      const endHour = startHour + 1;
      return `${time} - ${String(endHour).padStart(2, "0")}:${minutes}`;
    };

    // Function to fetch backend data for the booking (removed - using extracted data only)
    const fetchBackendBookingData = async () => {
      // This function is no longer needed as we use extracted data from the calendar event
      console.log(
        "ℹ️ Backend data fetching removed - using extracted data only"
      );
      setIsFormInitialized(true);
    };

    // Initialize form with pre-processed data
    React.useEffect(() => {
      // CRITICAL: Check if ref was cleared and restore from a backup if needed
      // This is a safety net in case something clears the ref unexpectedly
      const refBackup = newSelectedTeacherRef.current;

      if (editReschedulePopup.data) {
        const bookingData = editReschedulePopup.data;

        // CRITICAL: ALWAYS preserve newSelectedTeacher from ref if it was already set
        // This maintains the intermediate state when teacher is changed, even when popup data refreshes
        // If ref is null but state has a teacher, restore ref from state
        if (!newSelectedTeacherRef.current && newSelectedTeacher) {
          console.log(
            "🔵 [DEBUG] Ref was cleared but state has teacher - restoring ref from state:",
            {
              stateTeacherUid: newSelectedTeacher.uid,
              stateTeacherName: newSelectedTeacher.full_name,
            }
          );
          newSelectedTeacherRef.current = newSelectedTeacher;
        }

        const currentNewTeacher =
          newSelectedTeacherRef.current || newSelectedTeacher;

        // Set form fields directly from pre-processed data
        setSelectedClassType(bookingData.class_type || "");
        setSelectedClassCount(bookingData.class_count || "1");
        setAttendees(bookingData.attendees ? bookingData.attendees.trim() : "");
        // Check summary case-insensitively for Gmeet and ensure GMEET is in selectedRecording
        const summaryLower = (bookingData.summary || "").toLowerCase();
        const recordingFromData = bookingData.recording || [];
        const hasGmeet = summaryLower.includes("gmeet");
        const recordingWithGmeet =
          hasGmeet && !recordingFromData.includes("GMEET")
            ? [...recordingFromData, "GMEET"]
            : recordingFromData;
        setSelectedRecording(recordingWithGmeet);
        setDescription(bookingData.description || "");
        setSummary(bookingData.summary || "");
        // Reset PDF file when popup opens
        setPdfFile(null);
        setPdfFileName("");
        setPdfBase64("");

        // CRITICAL: Always restore newSelectedTeacher from ref if it was set
        // This ensures teacher change persists even when popup data refreshes
        // Priority: ref > current state (ref is source of truth for teacher change)

        if (newSelectedTeacherRef.current) {
          // Ref has the teacher - always use it (this is the source of truth)
          // Use functional update to ensure we set the correct value
          setNewSelectedTeacher(() => {
            return newSelectedTeacherRef.current;
          });
        } else if (currentNewTeacher) {
          // Fallback: use current state if ref is not set
          setNewSelectedTeacher(() => currentNewTeacher);
          newSelectedTeacherRef.current = currentNewTeacher;
        } else {
          // Only clear if ref is also null (popup just opened, no teacher change)
          // CRITICAL: Never clear if ref has a value, even if state is null
          if (!newSelectedTeacherRef.current) {
            setNewSelectedTeacher(null);
          } else {
            // Ref has value but state doesn't - restore from ref
            setNewSelectedTeacher(() => newSelectedTeacherRef.current);
          }
        }

        // Set schedule from pre-processed data - convert to {id, date, time} format like ScheduleManagementPopup
        if (bookingData.schedule && Array.isArray(bookingData.schedule)) {
          // Convert schedule format from [date, time] to {id, date, time}
          const formattedSchedule = bookingData.schedule.map((entry, index) => {
            const [date, time] = Array.isArray(entry)
              ? entry
              : [entry.date || entry[0], entry.time || entry[1]];
            return {
              id: Date.now() + index,
              date: date,
              time: time,
            };
          });
          setScheduleEntries(formattedSchedule);
          if (formattedSchedule.length > 0) {
            setSelectedScheduleDate(formattedSchedule[0].date);
            setSelectedScheduleTime(formattedSchedule[0].time);
          }
        }

        // Set students from pre-processed data
        if (bookingData.students && Array.isArray(bookingData.students)) {
          // Use all extracted students
          setSelectedStudents(bookingData.students);
        } else if (bookingData.student) {
          // Fallback to single student
          setSelectedStudents([bookingData.student]);
        } else if (bookingData.jlid && bookingData.learner_name) {
          // Fallback to extracted data if student object not available
          const student = {
            jetlearner_id: bookingData.jlid,
            name: bookingData.learner_name,
            deal_name: bookingData.learner_name,
          };
          setSelectedStudents([student]);
        }

        setIsFormInitialized(true);
      }
    }, [editReschedulePopup.data]);

    // Additional useEffect to ensure teacher persists when availability data is set
    React.useEffect(() => {
      console.log(
        "🔵 [DEBUG] useEffect [newTeacherAvailabilityData] TRIGGERED:",
        {
          hasAvailabilityData:
            Object.keys(newTeacherAvailabilityData || {}).length > 0,
          refTeacher: newSelectedTeacherRef.current?.uid,
          refTeacherName: newSelectedTeacherRef.current?.full_name,
          stateTeacher: newSelectedTeacher?.uid,
          stateTeacherName: newSelectedTeacher?.full_name,
          timestamp: new Date().toISOString(),
        }
      );

      // CRITICAL: Always restore from ref if it exists and doesn't match state
      // This ensures teacher persists even if state gets cleared
      if (newSelectedTeacherRef.current) {
        const refUid = newSelectedTeacherRef.current.uid;
        const stateUid = newSelectedTeacher?.uid;

        // If ref has teacher but state doesn't match, restore from ref
        if (refUid !== stateUid) {
          // Use functional update to ensure correct value is set
          setNewSelectedTeacher(() => {
            return newSelectedTeacherRef.current;
          });
        }
      }
    }, [newTeacherAvailabilityData, newSelectedTeacher]);

    // Handle student search
    const handleStudentSearch = (searchTerm) => {
      setStudentSearchTerm(searchTerm);
      if (searchTerm.trim().length > 0) {
        const filtered = allAvailableStudents.filter(
          (student) =>
            student.deal_name
              ?.toLowerCase()
              .includes(searchTerm.toLowerCase()) ||
            student.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            student.jetlearner_id
              ?.toLowerCase()
              .includes(searchTerm.toLowerCase())
        );
        setStudentSearchResults(filtered.slice(0, 5));
        setShowStudentSearch(true);
      } else {
        setStudentSearchResults([]);
        setShowStudentSearch(false);
      }
    };

    // Handle credentials edit mode
    const handleCredentialsEdit = () => {
      setTempDescription(description || "");
      setIsCredentialsEditing(true);
    };

    const handleCredentialsSave = () => {
      setDescription(tempDescription);
      setIsCredentialsEditing(false);
    };

    const handleCredentialsCancel = () => {
      setTempDescription("");
      setIsCredentialsEditing(false);
    };

    // Handle summary edit mode
    const handleSummaryEdit = () => {
      setTempSummary(summary || "");
      setIsSummaryEditing(true);
    };

    const handleSummarySave = () => {
      setSummary(tempSummary);
      setIsSummaryEditing(false);
    };

    const handleSummaryCancel = () => {
      setTempSummary("");
      setIsSummaryEditing(false);
    };

    // Add schedule entry
    const addScheduleEntry = () => {
      if (selectedScheduleDate && selectedScheduleTime) {
        // Check if entry already exists (handle both array and object formats)
        const entryExists = scheduleEntries.some((entry) => {
          if (Array.isArray(entry)) {
            return (
              entry[0] === selectedScheduleDate &&
              entry[1] === selectedScheduleTime
            );
          } else {
            return (
              entry.date === selectedScheduleDate &&
              entry.time === selectedScheduleTime
            );
          }
        });

        if (scheduleEntries.length < 3 && !entryExists) {
          // Create entry in object format with id
          const newEntry = {
            id: Date.now() + Math.random(), // Unique ID
            date: selectedScheduleDate,
            time: selectedScheduleTime,
          };
          setScheduleEntries([...scheduleEntries, newEntry]);
          setSelectedScheduleDate("");
          setSelectedScheduleTime("");
        }
      }
    };

    // Remove schedule entry by id
    const removeScheduleEntry = (entryId) => {
      setScheduleEntries(
        scheduleEntries.filter((entry) => {
          // Handle both array format (legacy) and object format
          if (Array.isArray(entry)) {
            // For array format, use index-based removal (fallback)
            return true; // Keep all arrays for now, or implement index-based logic if needed
          } else {
            return entry.id !== entryId;
          }
        })
      );
    };

    // Helper function to get hidden field values for API
    const getHiddenFieldValue = (fieldId) => {
      const element = document.getElementById(fieldId);
      return element ? element.value : "";
    };

    // Handle form submission
    const handleSubmit = async () => {
      if (selectedStudents.length === 0) {
        alert("Please select at least one student");
        return;
      }

      if (scheduleEntries.length === 0) {
        alert("Please add at least one schedule entry");
        return;
      }

      // Set loading state
      setEditReschedulePopup((prev) => ({ ...prev, isLoading: true }));
      setIsOperationLoading(true);

      // Extract JL IDs from selected students
      const jl_uid = selectedStudents.map((student) => student.jetlearner_id);

      // Extract teacher UID from the booking data or selected teacher
      let teacher_uid = null;

      // Use newSelectedTeacher if available (teacher change functionality)
      if (newSelectedTeacher?.uid) {
        teacher_uid = newSelectedTeacher.uid;
      }
      // Extract from summary if no new teacher selected
      else if (editReschedulePopup.data?.summary) {
        const tlMatch =
          editReschedulePopup.data.summary.match(/\bTJL[A-Za-z0-9]+\b/g);
        if (tlMatch && tlMatch.length > 0) {
          teacher_uid = tlMatch[0];
        }
      }
      // Fallback to selected teacher if not found
      else if (selectedTeacher?.uid) {
        teacher_uid = selectedTeacher.uid;
      }

      // Check if this is a Calibration class (summary contains "Calibration" keyword)
      // Get summary from form input, state, or existing data
      const summaryInput = document.getElementById("edit_summary");
      const summaryText = summaryInput?.value || summary || editReschedulePopup.data?.summary || "";
      const isCalibrationClass = summaryText.toLowerCase().includes("calibration");
      const hasTJLId = summaryText.match(/\bTJL[A-Za-z0-9]+\b/g);

      // Allow editing Calibration classes without teacher_uid if summary doesn't have TJL ID
      if (!teacher_uid && !(isCalibrationClass && !hasTJLId)) {
        alert("Teacher UID not found. Please ensure a teacher is selected.");
        setEditReschedulePopup((prev) => ({ ...prev, isLoading: false }));
        setIsOperationLoading(false);
        return;
      }

      // Get values from hidden fields as backup
      const hiddenEventId = getHiddenFieldValue("edit_event_id");
      const hiddenTeacherId = getHiddenFieldValue("edit_teacher_id");
      const hiddenStudentIds = getHiddenFieldValue("edit_student_ids");
      const hiddenClassType = getHiddenFieldValue("edit_class_type");
      const hiddenRecordingOptions = getHiddenFieldValue(
        "edit_recording_options"
      );
      const hiddenBookingType = getHiddenFieldValue("edit_booking_type");
      const hiddenCourseInfo = getHiddenFieldValue("edit_course_info");

      // Extract offset hours and minutes from "(GMT+02:00)"
      const match = selectedTimezone.match(/GMT([+-]\d{2}):(\d{2})/);
      const offsetHours = parseInt(match[1], 10); // +02
      const offsetMinutes = parseInt(match[2], 10); // 00

      // Prepare the API payload according to the curl example
      const apiPayload = {
        event_id: editReschedulePopup.data?.event_id || hiddenEventId || "",
        jl_uid: jl_uid,
        teacher_uid: teacher_uid || "",
        platform_credentials: description || "",
        summary: summary || "",
        schedule: scheduleEntries.map((entry) => {
          // Handle both array format [date, time] and object format {id, date, time}
          const date = Array.isArray(entry) ? entry[0] : entry.date;
          const time = Array.isArray(entry) ? entry[1] : entry.time;

          // Extract only start time if it's a range (e.g., "16:00 - 17:00" -> "16:00")
          const startTime = time.includes(" - ") ? time.split(" - ")[0] : time;

          // Parse the local date and time
          const [hours, minutes] = startTime.split(":").map(Number);
          const localDateTime = new Date(date + "T" + startTime + ":00");

          // Apply timezone offset to convert to UTC
          const utcDateTime = new Date(
            localDateTime.getTime() -
              (offsetHours * 60 + offsetMinutes) * 60 * 1000
          );

          // Format as YYYY-MM-DD and HH:MM for API
          const utcDate = utcDateTime.toISOString().split("T")[0];
          const utcTime = utcDateTime.toTimeString().slice(0, 5);

          return [utcDate, utcTime];
        }),
        class_type: selectedClassType || hiddenClassType || "1:1",
        booking_type: (() => {
          const summary = editReschedulePopup.data?.summary;
          const hasCalibration = summary
            ?.toLowerCase()
            ?.includes("calibration");
          return hasCalibration
            ? "Trial"
            : editReschedulePopup.data?.booking_type || "Paid";
        })(),
        tags:
          selectedRecording.length > 0
            ? selectedRecording
            : hiddenRecordingOptions
            ? JSON.parse(hiddenRecordingOptions)
            : [],
        attendees: attendees
          .split(",")
          .filter((email) => email.trim())
          .map((email) => email.trim()),
        updated_by: user?.email || "",
        upcoming_events: upcomingEvents ? "true" : "false",
        time_zone: formatTimezoneForAPI(selectedTimezone),
        ...(pdfBase64 && {
          pdf_attached: pdfBase64,
        }),
      };

      console.log("📤 Sending UPDATE/EDIT Class API request:");
      console.log("📊 Payload:", JSON.stringify(apiPayload, null, 2));
      console.log("  - platform_credentials:", apiPayload.platform_credentials);
      console.log("  - schedule (UTC):", apiPayload.schedule);
      console.log("  - timezone offset:", `${offsetHours}:${offsetMinutes}`);
      console.log("  - class_type:", apiPayload.class_type);
      console.log("  - booking_type:", apiPayload.booking_type);
      console.log("  - tags:", apiPayload.tags);
      console.log("  - attendees:", apiPayload.attendees);
      console.log("  - updated_by:", apiPayload.updated_by);
      console.log("  - upcoming_events:", apiPayload.upcoming_events);

      try {
        const response = await fetch(
          "https://live.jetlearn.com/api/update-class/",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(apiPayload),
          }
        );

        if (!response.ok) {
          let errorMsg = `HTTP error! status: ${response.status}`;
          try {
            const errJson = await response.json();
            if (errJson && errJson.message) errorMsg += ` - ${errJson.message}`;
          } catch {}
          throw new Error(errorMsg);
        }

        const result = await response.json();
        console.log("✅ UPDATE/EDIT Class API Response:", result);

        // Check if update was successful
        if (result.status === "success" || result.success) {
          // Show success message
          setSuccessMessage({
            show: true,
            message: "Booking Successfully Updated !!",
            type: "booking",
          });

          // Close the popup after a short delay
          setTimeout(() => {
            setEditReschedulePopup({
              isOpen: false,
              data: null,
              date: null,
              time: null,
              isLoading: false,
            });
            setSuccessMessage({
              show: false,
              message: "",
              type: "",
            });
            // Clear teacher change state
            setNewSelectedTeacher(null);
            newSelectedTeacherRef.current = null;
            setNewTeacherAvailabilityData({});
            setShowTeacherChange(false);
            setTeacherSearchTerm("");
            setTeacherSearchResults([]);
          }, 2000);

          // Refresh the data after successful update
          await fetchListViewBookingDetails();
        } else {
          throw new Error(result.message || "Update failed");
        }
      } catch (error) {
        console.error("❌ Error updating booking:", error);
        alert(`Failed to update booking: ${error.message}`);
      } finally {
        // Reset loading state
        setEditReschedulePopup((prev) => ({ ...prev, isLoading: false }));
        setIsOperationLoading(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-3 md:p-4 animate-in fade-in duration-200">
        <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-2xl xl:max-w-4xl 2xl:max-w-5xl max-h-[85vh] sm:max-h-[80vh] md:max-h-[75vh] overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div className="bg-gradient-to-r from-yellow-600 to-orange-600 text-white p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h2 className="text-base sm:text-lg md:text-xl font-bold">
                  Edit/Reschedule Booking
                </h2>
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mt-1 text-sm sm:text-base text-yellow-100">
                  <div className="flex items-center gap-1 sm:gap-2">
                    <FaClock size={14} className="flex-shrink-0" />
                    <span>
                      {formatDateDDMMMYYYY(editReschedulePopup.date)} at{" "}
                      {editReschedulePopup.time}
                    </span>
                    <span className="text-sm">{selectedTimezone}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  setEditReschedulePopup({
                    isOpen: false,
                    data: null,
                    date: null,
                    time: null,
                    isLoading: false,
                  });
                  // Reset form state
                  setDescription("");
                  setSummary("");
                  setAttendees("");
                  setAttendeeInput("");
                  setScheduleEntries([]);
                  setUpcomingEvents(false);
                  setSelectedStudents([]);
                  setSelectedClassType("");
                  setSelectedClassCount("");
                  setSelectedRecording([]);
                  setIsFormInitialized(false);
                  // Clear teacher change state
                  setNewSelectedTeacher(null);
                  newSelectedTeacherRef.current = null;
                  setNewTeacherAvailabilityData({});
                  setShowTeacherChange(false);
                  setTeacherSearchTerm("");
                  setTeacherSearchResults([]);
                }}
                className="text-white/80 hover:text-white hover:bg-white/20 p-1.5 sm:p-2 rounded-full transition-all duration-200 flex-shrink-0"
              >
                <FaTimes size={16} className="sm:w-5 sm:h-5" />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto max-h-[calc(85vh-90px)] sm:max-h-[calc(80vh-100px)] md:max-h-[calc(75vh-110px)] p-3 sm:p-4">
            {/* Hidden fields for API integration */}
            {(() => {
              // Extract TJ (Teacher/Job) code from summary
              const tlMatch =
                editReschedulePopup.data.summary?.match(/\bTJ[A-Za-z0-9]+\b/);
              const teacherUid = tlMatch ? tlMatch[0] : selectedTeacher?.uid;

              if (teacherUid) {
                // Find teacher in teachers array
                const teacher = teachers.find((t) => t.uid === teacherUid);
                if (teacher) {
                  // Render hidden fields with teacher data
                  return (
                    <>
                      <input
                        type="hidden"
                        value={editReschedulePopup.data.event_id}
                        id="edit_event_id"
                        name="event_id"
                      />
                      <input
                        type="hidden"
                        value={teacher.uid}
                        id="edit_teacher_id"
                        name="teacher_id"
                      />
                      <input
                        type="hidden"
                        value={JSON.stringify(
                          selectedStudents.map((s) => s.jetlearner_id)
                        )}
                        id="edit_student_ids"
                        name="student_ids"
                      />
                      <input
                        type="hidden"
                        value={selectedClassType}
                        id="edit_class_type"
                        name="class_type"
                      />
                      <input
                        type="hidden"
                        value={JSON.stringify(selectedRecording)}
                        id="edit_recording_options"
                        name="recording_options"
                      />
                      <input
                        type="hidden"
                        value={editReschedulePopup.data.booking_type || ""}
                        id="edit_booking_type"
                        name="booking_type"
                      />
                      <input
                        type="hidden"
                        value={JSON.stringify(
                          editReschedulePopup.data.course_info || []
                        )}
                        id="edit_course_info"
                        name="course_info"
                      />
                    </>
                  );
                }
              }
              return null;
            })()}

            {/* Compact Booking Information Display */}
            {editReschedulePopup.data?.event_id && (
              <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="grid grid-cols-2 gap-2 text-xs text-blue-800">
                  <div>
                    <strong>Event ID:</strong>{" "}
                    {editReschedulePopup.data.event_id || "N/A"}
                  </div>
                  <div>
                    <strong>Class Type:</strong>{" "}
                    {editReschedulePopup.data.class_type || "N/A"}
                  </div>
                  <div>
                    <strong>Booking Type:</strong>{" "}
                    {(() => {
                      const summary = editReschedulePopup.data.summary;
                      const hasCalibration = summary
                        ?.toLowerCase()
                        .includes("calibration");
                      return hasCalibration ? "Trial" : "Paid";
                    })()}
                  </div>
                  <div>
                    <strong>Course:</strong>{" "}
                    {editReschedulePopup.data.course_info &&
                    editReschedulePopup.data.course_info.length > 0
                      ? editReschedulePopup.data.course_info[0].includes(
                          "Coding"
                        )
                        ? "Coding"
                        : "Maths"
                      : "N/A"}
                  </div>
                  <div className="col-span-2">
                    <div className="flex items-center gap-2">
                      <strong>Teacher:</strong>{" "}
                      {(() => {
                        // Use newSelectedTeacher (from state or ref) if available, otherwise extract from data
                        const currentNewTeacher =
                          newSelectedTeacherRef.current || newSelectedTeacher;

                        if (currentNewTeacher) {
                          return `${currentNewTeacher.uid} (${
                            currentNewTeacher.full_name || " "
                          })`;
                        }

                        // Extract TJ (Teacher/Job) code from summary
                        const tlMatch =
                          editReschedulePopup.data.summary?.match(
                            /\bTJ[A-Za-z0-9]+\b/
                          );
                        const teacherUid = tlMatch
                          ? tlMatch[0]
                          : selectedTeacher?.uid;

                        if (teacherUid) {
                          const teacher = teachers.find(
                            (t) => t.uid === teacherUid
                          );
                          return teacher
                            ? `${teacher.uid} (${teacher.full_name || " "})`
                            : editReschedulePopup.data.teacher_id || "N/A";
                        }
                        return editReschedulePopup.data.teacher_id || "N/A";
                      })()}
                      <button
                        onClick={() => setShowTeacherChange(true)}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors duration-200"
                        title="Change Teacher"
                      >
                        <FaEdit size={10} />
                        Change
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Form Loading Indicator */}
            {!isFormInitialized && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-yellow-600 border-t-transparent"></div>
                  <span className="text-sm text-yellow-700">
                    Loading booking details...
                  </span>
                </div>
              </div>
            )}

            {/* Teacher Change Modal */}
            {showTeacherChange && (
              <div className="mb-4 p-4 bg-white border border-gray-200 rounded-lg shadow-lg">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <div className="p-0.5 bg-blue-100 rounded">
                      <FaEdit size={14} className="text-blue-600" />
                    </div>
                    Change Teacher
                  </h3>
                  <button
                    onClick={handleTeacherChangeCancel}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                    title="Cancel"
                  >
                    <FaTimes size={14} />
                  </button>
                </div>

                {/* Teacher Search Input */}
                <div className="relative mb-3">
                  <input
                    type="text"
                    value={teacherSearchTerm}
                    onChange={(e) => handleTeacherSearch(e.target.value)}
                    placeholder="Search teachers by name or ID..."
                    className="w-full p-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    autoFocus
                  />
                </div>

                {/* Teacher Search Results */}
                {teacherSearchResults.length > 0 && (
                  <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-md">
                    {teacherSearchResults.map((teacher) => (
                      <div
                        key={teacher.id}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleTeacherSelect(teacher, e);
                        }}
                        className="p-3 cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-medium text-blue-600">
                            {teacher.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1">
                            <div className="font-medium text-gray-900 text-sm">
                              {teacher.full_name}
                            </div>
                            <div className="text-xs text-gray-500">
                              ID: {teacher.uid}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {teacherSearchTerm && teacherSearchResults.length === 0 && (
                  <div className="p-3 text-center text-gray-500 text-sm">
                    No teachers found matching "{teacherSearchTerm}"
                  </div>
                )}
              </div>
            )}

            {/* Description - Full Width */}
            {/* Credentials/Notes and Summary - Side by Side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 mb-3">
              {/* Credentials / Notes */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-3 border border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900">
                    <div className="p-0.5 bg-blue-100 rounded">
                      <FaEdit size={14} className="text-blue-600" />
                    </div>
                    Credentials / Notes
                  </h3>
                  {!isCredentialsEditing && (
                    <button
                      onClick={handleCredentialsEdit}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors duration-200"
                      title="Edit credentials"
                    >
                      <FaEdit size={10} />
                      Edit
                    </button>
                  )}
                </div>

                {isCredentialsEditing ? (
                  <div className="space-y-2">
                    <textarea
                      value={tempDescription}
                      onChange={(e) => setTempDescription(e.target.value)}
                      placeholder="Enter booking description..."
                      className="w-full p-2 text-xs border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none hover:border-blue-400 transition-colors duration-200"
                      rows={4}
                      autoFocus
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={handleCredentialsCancel}
                        className="p-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors duration-200"
                        title="Cancel"
                      >
                        <FaTimes size={12} />
                      </button>
                      <button
                        onClick={handleCredentialsSave}
                        className="p-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors duration-200"
                        title="Save"
                      >
                        <FaCheck size={12} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="min-h-[80px] p-2 bg-white border border-gray-200 rounded-md text-xs text-gray-700 whitespace-pre-wrap">
                    {description || (
                      <span className="text-gray-400 italic">
                        No credentials or notes added yet. Click Edit to add
                        some.
                      </span>
                    )}
                  </div>
                )}

                {/* PDF File Upload */}
                <div className="mt-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Attach PDF File
                  </label>
                  <div className="space-y-2">
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          if (file.size > 10 * 1024 * 1024) {
                            alert("File size must be less than 10MB");
                            return;
                          }
                          setPdfFileName(file.name);
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            const base64String = reader.result.split(",")[1];
                            setPdfBase64(base64String);
                          };
                          reader.readAsDataURL(file);
                          setPdfFile(file);
                        }
                      }}
                      className="hidden"
                      id="pdf-upload-edit"
                    />
                    <label
                      htmlFor="pdf-upload-edit"
                      className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-md cursor-pointer hover:bg-gray-50 transition-colors text-xs"
                    >
                      <FaPaperclip size={12} className="text-gray-600" />
                      <span className="text-gray-700">
                        {pdfFileName || "Choose PDF file"}
                      </span>
                    </label>
                    {pdfFileName && (
                      <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-md p-2">
                        <div className="flex items-center gap-2">
                          <FaFile size={12} className="text-blue-600" />
                          <span className="text-xs text-gray-700 truncate">
                            {pdfFileName}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setPdfFile(null);
                            setPdfFileName("");
                            setPdfBase64("");
                            document.getElementById("pdf-upload-edit").value =
                              "";
                          }}
                          className="text-red-500 hover:text-red-700"
                        >
                          <FaTimes size={10} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-3 border border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900">
                    <div className="p-0.5 bg-blue-100 rounded">
                      <FaEdit size={14} className="text-blue-600" />
                    </div>
                    Summary
                  </h3>
                  {!isSummaryEditing && (
                    <button
                      onClick={handleSummaryEdit}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors duration-200"
                      title="Edit summary"
                    >
                      <FaEdit size={10} />
                      Edit
                    </button>
                  )}
                </div>

                {isSummaryEditing ? (
                  <div className="space-y-2">
                    <textarea
                      value={tempSummary}
                      onChange={(e) => setTempSummary(e.target.value)}
                      placeholder="Enter booking summary..."
                      className="w-full p-2 text-xs border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none hover:border-blue-400 transition-colors duration-200"
                      rows={4}
                      autoFocus
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={handleSummaryCancel}
                        className="p-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors duration-200"
                        title="Cancel"
                      >
                        <FaTimes size={12} />
                      </button>
                      <button
                        onClick={handleSummarySave}
                        className="p-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors duration-200"
                        title="Save"
                      >
                        <FaCheck size={12} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="min-h-[80px] p-2 bg-white border border-gray-200 rounded-md text-xs text-gray-700 whitespace-pre-wrap">
                    {summary || (
                      <span className="text-gray-400 italic">
                        No summary added yet. Click Edit to add one.
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Schedule and Learners - Side by Side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 mb-3">
              {/* Schedule Display with Inline Editing */}
              <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-lg p-3 border border-orange-200">
                <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-2">
                  <div className="p-0.5 bg-orange-100 rounded">
                    <FaCalendarAlt size={14} className="text-orange-600" />
                  </div>
                  Schedule
                </h3>

                <div className="space-y-2">
                  {/* Schedule Entry Form */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-0.5">
                        Date
                      </label>
                      <input
                        type="date"
                        value={selectedScheduleDate}
                        onChange={(e) => {
                          const selectedDate = e.target.value;
                          if (selectedDate) {
                            const dateObj = new Date(selectedDate);
                            if (isLockedHoliday(dateObj)) {
                              alert(
                                "This date is locked due to holiday. Please select another date."
                              );
                              return;
                            }
                          }
                          setSelectedScheduleDate(selectedDate);
                          setSelectedScheduleTime("");
                        }}
                        min={(() => {
                          const lastWeekDate = new Date();
                          lastWeekDate.setDate(lastWeekDate.getDate() - 7);
                          return lastWeekDate.toISOString().split("T")[0];
                        })()}
                        className="w-full p-2 border border-gray-300 rounded text-xs text-black focus:ring-1 focus:ring-orange-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-0.5">
                        Time
                      </label>
                      <select
                        value={selectedScheduleTime}
                        onChange={(e) => {
                          setSelectedScheduleTime(e.target.value);
                        }}
                        className="w-full p-2 border border-gray-300 rounded text-xs text-black focus:ring-1 focus:ring-orange-500 focus:border-transparent"
                      >
                        <option value="">Select time...</option>
                        {(() => {
                          // Get teacher UID - prioritize newSelectedTeacher from ref or state
                          const currentNewTeacher =
                            newSelectedTeacherRef.current || newSelectedTeacher;
                          const teacherUid =
                            currentNewTeacher?.uid ||
                            (() => {
                              const tlMatch =
                                editReschedulePopup.data?.summary?.match(
                                  /\bTJ[A-Za-z0-9]+\b/
                                );
                              return tlMatch
                                ? tlMatch[0]
                                : selectedTeacher?.uid;
                            })();

                          // Check if date is in the past
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          const selectedDate = selectedScheduleDate
                            ? new Date(selectedScheduleDate)
                            : null;
                          const isPastDate =
                            selectedDate && selectedDate < today;

                          // Generate all time slots
                          const allTimeSlots = Array.from(
                            { length: 48 },
                            (_, i) => {
                              const hour = Math.floor(i / 2);
                              const minute = (i % 2) * 30;
                              return `${String(hour).padStart(2, "0")}:${String(
                                minute
                              ).padStart(2, "0")}`;
                            }
                          );

                          // If no date selected or no teacher, show all slots (except past dates)
                          if (!selectedScheduleDate || !teacherUid) {
                            return allTimeSlots.map((timeString) => (
                              <option
                                key={timeString}
                                value={timeString}
                                disabled={isPastDate}
                                style={{
                                  color: isPastDate ? "#999" : "inherit",
                                }}
                              >
                                {timeString}
                              </option>
                            ));
                          }

                          // Use same approach as ScheduleManagementPopup - filter available slots
                          // Check new teacher's data first if teacher was changed
                          const dateStr = formatDate(
                            new Date(selectedScheduleDate)
                          );

                          const availableSlots = allTimeSlots.filter(
                            (timeString) => {
                              const dateObj = new Date(selectedScheduleDate);

                              // If new teacher is selected, ONLY use new teacher's availability data
                              const currentNewTeacher =
                                newSelectedTeacherRef.current ||
                                newSelectedTeacher;
                              let slotCounts = null;
                              if (currentNewTeacher?.uid) {
                                // Use new teacher's data exclusively
                                slotCounts = getNewTeacherSlotCounts(
                                  dateObj,
                                  timeString,
                                  currentNewTeacher.uid
                                );

                                // Only show slots where availability > bookings (slots remaining)
                                if (slotCounts) {
                                  const hasAvailableSlots =
                                    slotCounts.available > slotCounts.booked &&
                                    (slotCounts.teacherid ===
                                      currentNewTeacher.uid ||
                                      slotCounts.uid === currentNewTeacher.uid);
                                  // Slot is available for new teacher
                                  return hasAvailableSlots;
                                }
                                // If new teacher selected but no data for this slot, don't show it
                                return false;
                              }

                              // Fallback to regular getSlotCounts if no new teacher selected
                              slotCounts = getSlotCounts(dateObj, timeString);

                              // Only show slots where availability > bookings (slots remaining)
                              const isAvailable =
                                slotCounts.available > slotCounts.booked &&
                                (slotCounts.teacherid === teacherUid ||
                                  slotCounts.uid === teacherUid);
                              return isAvailable;
                            }
                          );

                          console.log(
                            "📋 Available slots found:",
                            availableSlots.length,
                            availableSlots
                          );

                          // Render only available slots
                          return availableSlots.map((timeString) => (
                            <option key={timeString} value={timeString}>
                              {timeString}
                            </option>
                          ));
                        })()}
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
                    className="w-full bg-gradient-to-r from-orange-600 to-red-600 text-white py-2 rounded hover:from-orange-700 hover:to-red-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-1.5 font-medium text-xs"
                  >
                    <FaPlus size={12} />
                    Add Schedule Entry {scheduleEntries.length}/3
                  </button>

                  {/* Schedule Entries List */}
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {scheduleEntries.length === 0 ? (
                      <div className="text-center py-2 text-gray-500">
                        <FaCalendarAlt
                          size={16}
                          className="mx-auto mb-1 text-gray-300"
                        />
                        <p className="text-xs">No schedule entries added</p>
                      </div>
                    ) : (
                      scheduleEntries.map((entry) => {
                        // Handle both array format [date, time] and object format {id, date, time}
                        const date = Array.isArray(entry)
                          ? entry[0]
                          : entry.date;
                        const time = Array.isArray(entry)
                          ? entry[1]
                          : entry.time;
                        const entryId = Array.isArray(entry)
                          ? scheduleEntries.indexOf(entry)
                          : entry.id;

                        // Extract only start time if it's a range
                        const startTime = time.includes(" - ")
                          ? time.split(" - ")[0]
                          : time;

                        // Format time as HH:MM
                        const formattedTime = startTime.includes(":")
                          ? startTime
                          : `${startTime.slice(0, 2)}:${startTime.slice(2, 4)}`;

                        // Check if start time is in early morning hours (00:00 to 05:59)
                        const [hours, minutes] = formattedTime
                          .split(":")
                          .map(Number);
                        const isEarlyMorning = hours >= 0 && hours <= 5;

                        let displayDate, displayDayName;
                        if (isEarlyMorning) {
                          const [year, month, day] = date
                            .split("-")
                            .map(Number);
                          const nextDay = new Date(year, month - 1, day + 1);
                          const nextYear = nextDay.getFullYear();
                          const nextMonth = (nextDay.getMonth() + 1)
                            .toString()
                            .padStart(2, "0");
                          const nextDayNum = nextDay
                            .getDate()
                            .toString()
                            .padStart(2, "0");

                          displayDate = `${nextDayNum}-${nextMonth}-${nextYear}`;
                          displayDayName = nextDay.toLocaleDateString("en-US", {
                            weekday: "long",
                          });
                        } else {
                          const [year, month, day] = date
                            .split("-")
                            .map(Number);
                          const formattedDay = day.toString().padStart(2, "0");
                          const formattedMonth = month
                            .toString()
                            .padStart(2, "0");

                          displayDate = `${formattedDay}-${formattedMonth}-${year}`;
                          displayDayName = getDayName(date);
                        }

                        // Check teacher availability
                        let availabilityStatus = null;
                        const teacherUid =
                          newSelectedTeacher?.uid ||
                          (() => {
                            const tlMatch =
                              editReschedulePopup.data?.summary?.match(
                                /\bTJ[A-Za-z0-9]+\b/
                              );
                            return tlMatch ? tlMatch[0] : selectedTeacher?.uid;
                          })();
                        if (teacherUid && date) {
                          const dateObj = new Date(date);
                          const slotCounts = getSlotCounts(dateObj, time);
                          const isAvailable =
                            slotCounts.available > 0 &&
                            (slotCounts.teacherid === teacherUid ||
                              slotCounts.uid === teacherUid);
                          availabilityStatus = isAvailable;
                        }

                        // Check if date is in the past
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const entryDate = date ? new Date(date) : null;
                        const isPastDate = entryDate && entryDate < today;

                        return (
                          <div
                            key={entryId}
                            className={`bg-white rounded p-2 border shadow-sm flex justify-between items-center ${
                              isPastDate
                                ? "border-red-300 bg-red-50"
                                : availabilityStatus === false
                                ? "border-orange-300 bg-orange-50"
                                : availabilityStatus === true
                                ? "border-green-300 bg-green-50"
                                : "border-gray-200"
                            }`}
                          >
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              <FaCalendarAlt
                                size={12}
                                className={
                                  isPastDate
                                    ? "text-red-600"
                                    : availabilityStatus === false
                                    ? "text-orange-600"
                                    : availabilityStatus === true
                                    ? "text-green-600"
                                    : "text-gray-600"
                                }
                              />
                              <span className="text-xs font-medium text-gray-900 truncate">
                                {displayDate} ({displayDayName}) at{" "}
                                {formattedTime}
                              </span>
                            </div>
                            <button
                              onClick={() => removeScheduleEntry(entryId)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 p-0.5 rounded transition-all duration-200 flex-shrink-0"
                              title="Remove schedule entry"
                            >
                              <FaTrash size={10} />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Learners List */}
              <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg p-3 border border-purple-200">
                <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-2">
                  <div className="p-0.5 bg-purple-100 rounded">
                    <FaGraduationCap size={14} className="text-purple-600" />
                  </div>
                  Learners List ({selectedStudents.length}/10)
                </h3>

                <div className="space-y-2">
                  {/* Student Search */}
                  <div className="relative">
                    <div className="flex items-center border border-gray-300 rounded-md focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
                      <FaSearch className="text-gray-400 ml-2" size={12} />
                      <input
                        type="text"
                        value={studentSearchTerm}
                        onChange={(e) => handleStudentSearch(e.target.value)}
                        placeholder="Search Learners..."
                        className="flex-1 p-2 text-xs border-none outline-none bg-transparent"
                      />
                    </div>

                    {/* Search Results Dropdown */}
                    {showStudentSearch && studentSearchResults.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-40 overflow-y-auto">
                        {studentSearchResults.map((student) => (
                          <button
                            key={student.jetlearner_id}
                            onClick={() => {
                              if (
                                !selectedStudents.find(
                                  (s) =>
                                    s.jetlearner_id === student.jetlearner_id
                                )
                              ) {
                                setSelectedStudents([
                                  ...selectedStudents,
                                  student,
                                ]);
                              }
                              setStudentSearchTerm("");
                              setShowStudentSearch(false);
                            }}
                            className="w-full text-left p-2 text-xs hover:bg-gray-100 border-b border-gray-100 last:border-b-0"
                          >
                            <div className="font-medium text-gray-900">
                              {student.deal_name || student.name}{" "}
                            </div>
                            <div className="text-gray-500">
                              ID: {student.jetlearner_id}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Selected Students List */}
                  {selectedStudents.length === 0 ? (
                    <div className="text-center py-4 text-gray-500">
                      <FaGraduationCap
                        size={20}
                        className="mx-auto mb-2 text-gray-300"
                      />
                      <p className="text-xs">No learners selected</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {selectedStudents.map((student) => (
                        <div
                          key={student.jetlearner_id}
                          className="flex items-center justify-between p-2 bg-white rounded-md border border-gray-200"
                        >
                          <span className="text-xs text-gray-700">
                            {student.deal_name || student.name}(
                            {student.jetlearner_id})
                          </span>
                          <button
                            onClick={() =>
                              setSelectedStudents(
                                selectedStudents.filter(
                                  (s) =>
                                    s.jetlearner_id !== student.jetlearner_id
                                )
                              )
                            }
                            className="text-red-500 hover:text-red-700 p-1"
                          >
                            <FaTimes size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Attendees and More Details - Side by Side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 mb-3">
              {/* Attendees */}
              <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg p-3 border border-purple-200">
                <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-2">
                  <div className="p-0.5 bg-purple-100 rounded">
                    <FaUsers size={14} className="text-purple-600" />
                  </div>
                  Attendees (
                  {attendees.split(",").filter((email) => email.trim()).length}
                  /10)
                </h3>

                <div className="space-y-2">
                  {/* Add Attendee Input */}
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={attendeeInput}
                      onChange={(e) => setAttendeeInput(e.target.value)}
                      placeholder="Enter email address"
                      className="flex-1 p-2 text-xs border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      onKeyPress={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const newEmail = attendeeInput.trim();

                          // Validate and auto-correct email
                          const validation = validateAndCorrectEmail(newEmail);

                          if (!validation.isValid) {
                            alert(validation.error);
                            return;
                          }

                          if (validation.needsCorrection) {
                            setAttendeeInput(validation.correctedEmail);
                            alert(
                              `Email corrected to: ${validation.correctedEmail}`
                            );
                            return;
                          }

                          if (
                            validation.correctedEmail &&
                            !attendees
                              .split(",")
                              .map((email) => email.trim())
                              .includes(validation.correctedEmail)
                          ) {
                            const currentAttendees = attendees
                              .split(",")
                              .filter((email) => email.trim());
                            if (currentAttendees.length < 10) {
                              const updatedAttendees = [
                                ...currentAttendees,
                                validation.correctedEmail,
                              ].join(", ");
                              setAttendees(updatedAttendees);
                              setAttendeeInput("");
                            }
                          }
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        const newEmail = attendeeInput.trim();

                        // Validate and auto-correct email
                        const validation = validateAndCorrectEmail(newEmail);

                        if (!validation.isValid) {
                          alert(validation.error);
                          return;
                        }

                        if (validation.needsCorrection) {
                          setAttendeeInput(validation.correctedEmail);
                          alert(
                            `Email corrected to: ${validation.correctedEmail}`
                          );
                          return;
                        }

                        if (
                          validation.correctedEmail &&
                          !attendees
                            .split(",")
                            .map((email) => email.trim())
                            .includes(validation.correctedEmail)
                        ) {
                          const currentAttendees = attendees
                            .split(",")
                            .filter((email) => email.trim());
                          if (currentAttendees.length < 10) {
                            const updatedAttendees = [
                              ...currentAttendees,
                              validation.correctedEmail,
                            ].join(", ");
                            setAttendees(updatedAttendees);
                            setAttendeeInput("");
                          }
                        }
                      }}
                      className="px-3 py-2 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 transition-colors duration-200 flex items-center gap-1"
                    >
                      <FaPlus size={10} />
                      Add
                    </button>
                  </div>

                  {/* Attendees List */}
                  {attendees.split(",").filter((email) => email.trim())
                    .length === 0 ? (
                    <div className="text-center py-4 text-gray-500">
                      <FaUsers
                        size={20}
                        className="mx-auto mb-2 text-gray-300"
                      />
                      <p className="text-xs">No attendees added</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {attendees
                        .split(",")
                        .filter((email) => email.trim())
                        .map((email, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-2 bg-white rounded-md border border-gray-200"
                          >
                            <span className="text-xs text-gray-700">
                              {email.trim()}
                            </span>
                            <button
                              onClick={() => {
                                const currentAttendees = attendees
                                  .split(",")
                                  .filter((email) => email.trim());
                                const updatedAttendees = currentAttendees
                                  .filter((_, i) => i !== index)
                                  .join(", ");
                                setAttendees(updatedAttendees);
                              }}
                              className="text-red-500 hover:text-red-700 p-1"
                            >
                              <FaTimes size={10} />
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              {/* More Details */}
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-3 border border-green-200">
                <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-2">
                  <div className="p-0.5 bg-green-100 rounded">
                    <FaBook size={14} className="text-green-600" />
                  </div>
                  More Details
                </h3>

                <div className="space-y-2">
                  {/* Recording Options */}
                  <div>
                    <div className="space-y-1">
                      {[
                        "DNREC",
                        "MAKE UP",
                        "MAKE UP - S",
                        "Reserved",
                        "Migration",
                        "GMEET",
                      ].map((option) => (
                        <label
                          key={option}
                          className="flex items-center gap-2 text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={selectedRecording.includes(option)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedRecording([
                                  ...selectedRecording,
                                  option,
                                ]);
                              } else {
                                setSelectedRecording(
                                  selectedRecording.filter(
                                    (item) => item !== option
                                  )
                                );
                              }
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          {option}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Upcoming Events Checkbox */}
            <div className="mb-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={upcomingEvents}
                  onChange={(e) => setUpcomingEvents(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-gray-700">
                  Do you want to do it for upcoming events as well?
                </span>
              </label>
            </div>

            {/* Update Button */}
            <button
              onClick={handleSubmit}
              disabled={editReschedulePopup.isLoading}
              className="w-full p-2 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors duration-200 flex items-center justify-center gap-2"
            >
              <FaEdit size={12} />
              {editReschedulePopup.isLoading ? "Updating..." : "Update Booking"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Confirmation Popup Component
  const ConfirmationPopup = () => {
    if (!confirmationPopup.isOpen) return null;

    const handleConfirm = () => {
      if (confirmationPopup.onConfirm) {
        // Pass the current upcomingEvents value to the onConfirm function
        confirmationPopup.onConfirm(confirmationPopup.upcomingEvents);
      }
    };

    const handleCancel = () => {
      setConfirmationPopup({
        isOpen: false,
        type: null,
        title: "",
        message: "",
        data: null,
        date: null,
        time: null,
        eventId: null,
        onConfirm: null,
        upcomingEvents: null,
      });
    };

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 animate-in fade-in duration-200">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-xs sm:max-w-sm md:max-w-md overflow-hidden border border-gray-100 backdrop-blur-lg animate-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div className="flex items-center justify-between p-3 bg-gradient-to-r from-red-50 to-red-100 border-b border-gray-200">
            <div className="flex-1 min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-red-800 flex items-center gap-2">
                <FaExclamationTriangle size={14} className="flex-shrink-0" />
                <span className="truncate">{confirmationPopup.title}</span>
              </h2>
            </div>
            <button
              onClick={handleCancel}
              className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all duration-200 ml-2 flex-shrink-0 p-1 rounded-full hover:scale-110"
            >
              <FaTimes size={14} />
            </button>
          </div>

          <div className="p-4">
            {/* Message */}
            <div className="mb-4">
              <p className="text-gray-700 text-sm leading-relaxed">
                {confirmationPopup.message}
              </p>
            </div>

            {/* Hidden event_id field */}
            {confirmationPopup.eventId && (
              <input
                type="hidden"
                value={confirmationPopup.eventId}
                id="event_id"
              />
            )}

            {/* Upcoming Events Checkbox */}
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  id="upcoming_events"
                  type="checkbox"
                  checked={confirmationPopup.upcomingEvents}
                  onChange={(e) => {
                    console.log("target", e.target.checked);
                    setConfirmationPopup((prev) => ({
                      ...prev,
                      upcomingEvents: e.target.checked,
                    }));
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-gray-700">
                  Do you want to do it for upcoming events as well?
                </span>
              </label>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-2 justify-end">
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors duration-200 font-medium text-sm"
              >
                No
              </button>
              <button
                onClick={handleConfirm}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors duration-200 font-medium text-sm flex items-center gap-2"
              >
                <FaCheck size={12} />
                Yes
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Enhanced Details Popup Component with pagination
  const DetailsPopup = () => {
    if (!detailsPopup.isOpen) return null;

    const formatTime = (time) => {
      const [hours, minutes] = time.split(":");
      const startHour = parseInt(hours);
      const endHour = startHour + 1;
      return `${time} - ${String(endHour).padStart(2, "0")}:${minutes}`;
    };

    // Get the grid count for this time slot to limit API data
    const { available: gridAvailableCount, booked: gridBookedCount } =
      getSlotCounts(detailsPopup.date, detailsPopup.time);

    // Filter data by the specific time slot, respecting grid counts
    const filteredAvailabilityData = availabilityAPI.response
      ? filterDataByTime(
          availabilityAPI.response,
          detailsPopup.time,
          gridAvailableCount
        )
      : [];

    const filteredBookingData = bookingApiResponse.data
      ? filterDataByTime(
          bookingApiResponse.data,
          detailsPopup.time,
          gridBookedCount
        )
      : [];

    // Get paginated data for current popup
    const currentData =
      detailsPopup.type === "availability"
        ? getPaginatedData(
            filteredAvailabilityData,
            popupPagination.currentPage,
            popupPagination.itemsPerPage
          )
        : getPaginatedData(
            filteredBookingData,
            popupPagination.currentPage,
            popupPagination.itemsPerPage
          );

    const totalPages =
      detailsPopup.type === "availability"
        ? getTotalPages(
            filteredAvailabilityData.length,
            popupPagination.itemsPerPage
          )
        : getTotalPages(
            filteredBookingData.length,
            popupPagination.itemsPerPage
          );

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-3 md:p-4 animate-in fade-in duration-200">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl max-h-[85vh] sm:max-h-[80vh] md:max-h-[75vh] overflow-hidden border border-gray-100 backdrop-blur-lg animate-in slide-in-from-bottom-4 duration-300">
          {/* Header with gradient background */}
          <div className="flex items-center justify-between p-3 sm:p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-100">
            <div className="flex-1 min-w-0">
              <h2 className="text-base sm:text-lg md:text-xl font-bold truncate bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                {detailsPopup.type === "availability"
                  ? "Teacher Availability Details"
                  : "Booking Details"}
              </h2>
              <div className="mt-2 space-y-1">
                {/* <p className="text-sm text-gray-700 flex items-center gap-2">
              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
              Time Slot:{" "}
              <span className="font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded-lg">
                {addHoursToTimeRange(detailsPopup.time, 1)} UTC
              </span>
            </p> */}
                {selectedTimezone !== "UTC" && (
                  <p className="text-sm sm:text-base text-gray-700 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                    <span className="w-2 h-2 bg-indigo-500 rounded-full flex-shrink-0"></span>
                    <span>Time Slot:</span>
                    <span className="font-semibold text-indigo-500 bg-indigo-50 px-2 py-1 rounded-lg text-sm sm:text-base break-words">
                      {formatDateDDMMMYYYY(detailsPopup.date)},{" "}
                      {addHoursToTimeRange(selectedTimezoneLocaltime, 1)}{" "}
                      {selectedTimezone}
                    </span>
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() =>
                setDetailsPopup({
                  isOpen: false,
                  type: null,
                  data: null,
                  date: null,
                  time: null,
                })
              }
              className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all duration-200 ml-2 sm:ml-4 flex-shrink-0 p-1.5 sm:p-2 rounded-full hover:scale-110"
            >
              <FaTimes size={18} className="sm:w-5 sm:h-5" />
            </button>
          </div>

          <div className="p-3 sm:p-4 max-h-[calc(85vh-80px)] sm:max-h-[calc(80vh-90px)] md:max-h-[calc(75vh-100px)] overflow-y-auto">
            {/* Session Information Card */}
            {/* <div className="mb-6 p-4 sm:p-5 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-3 text-sm sm:text-base flex items-center gap-2">
            <div className="w-3 h-3 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"></div>
            Session Information
          </h3>
          <div className="text-sm bg-white p-3 rounded-lg shadow-sm border border-gray-100">
            <span className="text-gray-600">Date: </span>
            <span className="font-bold text-gray-900 bg-yellow-50 px-2 py-1 rounded-md">
              {formatDateDDMMMYYYY(detailsPopup.date)}
            </span>
          </div>
        </div> */}

            {detailsPopup.type === "availability" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  {availabilityAPI.isLoading && (
                    <div className="flex items-center gap-3 text-blue-600 bg-blue-50 px-4 py-2 rounded-full">
                      <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-2 border-blue-600 border-t-transparent"></div>
                      <span className="text-sm sm:text-base font-medium">
                        Loading...
                      </span>
                    </div>
                  )}
                </div>

                {availabilityAPI.error && (
                  <div className="mb-3 p-3 bg-gradient-to-r from-red-50 to-red-100 border border-red-200 rounded-lg shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-red-200 rounded-full">
                        <FaExclamationTriangle
                          className="text-red-700"
                          size={16}
                        />
                      </div>
                      <h4 className="font-bold text-red-800 text-sm sm:text-base">
                        API Error
                      </h4>
                    </div>
                    <p className="text-red-700 text-sm bg-white p-3 rounded-lg border border-red-200">
                      {availabilityAPI.error}
                    </p>
                  </div>
                )}

                {availabilityAPI.success && availabilityAPI.response && (
                  <div className="space-y-3">
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-lg">
                      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-2">
                        <p className="text-sm sm:text-base text-white font-medium">
                          Showing:{" "}
                          <span className="font-bold">
                            {currentData.length}
                          </span>{" "}
                          of{" "}
                          <span className="font-bold">
                            {filteredAvailabilityData.length}
                          </span>{" "}
                          Available Teachers
                          {filteredAvailabilityData.length !==
                            gridAvailableCount &&
                            ` (limited to match grid count)`}
                        </p>
                      </div>

                      <div className="p-3">
                        {currentData.length > 0 ? (
                          <div className="space-y-3">
                            <div className="overflow-x-auto overflow-y-auto max-h-[400px]">
                              <table className="w-full min-w-[400px]">
                                <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200 sticky top-0 z-10">
                                  <tr>
                                    <th className="px-3 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                      Summary
                                    </th>
                                    <th className="px-3 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                      Teacher Email
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-100">
                                  {currentData.map((record, index) => {
                                    const extractedData = extractEventFields(
                                      record,
                                      "availability"
                                    );
                                    return (
                                      <tr
                                        key={index}
                                        className="hover:bg-gradient-to-r hover:from-blue-25 hover:to-indigo-25 transition-all duration-200 hover:shadow-sm"
                                      >
                                        <td className="px-3 py-2 text-sm text-gray-900 font-medium">
                                          {extractedData.summary || "N/A"}
                                        </td>
                                        <td className="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">
                                          {extractedData.creator || "N/A"}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>

                            {totalPages > 1 && (
                              <div className="mt-3 flex justify-center">
                                <div className="bg-gray-50 p-2 rounded-lg">
                                  <Pagination
                                    currentPage={popupPagination.currentPage}
                                    totalPages={totalPages}
                                    onPageChange={(page) =>
                                      handlePageChange(page, "popup")
                                    }
                                    size="small"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-8">
                            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                              <FaExclamationTriangle
                                className="text-gray-400"
                                size={20}
                              />
                            </div>
                            <p className="text-gray-500 text-sm font-medium">
                              No availability records found for{" "}
                              <span className="font-bold text-gray-700">
                                {detailsPopup.time}
                              </span>{" "}
                              time slot.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {availabilityAPI.isLoading && (
                  <div className="text-center py-8">
                    <div className="relative">
                      <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-200 border-t-blue-600 mx-auto mb-3"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse"></div>
                      </div>
                    </div>
                    <p className="text-gray-600 text-sm font-medium">
                      Fetching availability data for{" "}
                      <span className="font-bold text-blue-600">
                        {detailsPopup.time}
                      </span>
                      ...
                    </p>
                  </div>
                )}

                {!availabilityAPI.isLoading &&
                  !availabilityAPI.success &&
                  !availabilityAPI.error && (
                    <div className="text-center py-8 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border-2 border-dashed border-gray-300">
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <div className="w-6 h-6 bg-blue-500 rounded-full"></div>
                      </div>
                      <p className="text-gray-500 text-sm font-medium">
                        Click to load availability data for{" "}
                        <span className="font-bold text-blue-600">
                          {addHoursToTimeRange(detailsPopup.time, 1)}
                        </span>
                      </p>
                    </div>
                  )}
              </div>
            )}

            {detailsPopup.type === "booking" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  {bookingApiResponse.isLoading && (
                    <div className="flex items-center gap-3 text-green-600 bg-green-50 px-4 py-2 rounded-full">
                      <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-2 border-green-600 border-t-transparent"></div>
                      <span className="text-sm sm:text-base font-medium">
                        Loading...
                      </span>
                    </div>
                  )}
                </div>

                {bookingApiResponse.error && (
                  <div className="mb-3 p-3 bg-gradient-to-r from-red-50 to-red-100 border border-red-200 rounded-lg shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-red-200 rounded-full">
                        <FaExclamationTriangle
                          className="text-red-700"
                          size={16}
                        />
                      </div>
                      <h4 className="font-bold text-red-800 text-sm sm:text-base">
                        API Error
                      </h4>
                    </div>
                    <p className="text-red-700 text-sm bg-white p-3 rounded-lg border border-red-200">
                      {bookingApiResponse.error}
                    </p>
                  </div>
                )}

                {bookingApiResponse.success && bookingApiResponse.data && (
                  <div className="space-y-3">
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-lg">
                      <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-3 py-2">
                        <p className="text-sm sm:text-base text-white font-medium">
                          Showing:{" "}
                          <span className="font-bold">
                            {currentData.length}
                          </span>{" "}
                          of{" "}
                          <span className="font-bold">
                            {filteredBookingData.length}
                          </span>{" "}
                          booked Learners
                          {filteredBookingData.length !== gridBookedCount &&
                            ` (limited to match grid count)`}
                        </p>
                      </div>

                      <div className="p-3">
                        {currentData.length > 0 ? (
                          <div>
                            <div className="overflow-x-auto overflow-y-auto max-h-[400px]">
                              <table className="w-full min-w-[400px]">
                                <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200 sticky top-0 z-10">
                                  <tr>
                                    <th className="px-3 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                      Summary
                                    </th>
                                    <th className="px-3 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                                      Teacher Email
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-100">
                                  {currentData.map((record, index) => {
                                    const extractedData = extractEventFields(
                                      record,
                                      "booking"
                                    );
                                    return (
                                      <tr
                                        key={index}
                                        className="hover:bg-gradient-to-r hover:from-green-25 hover:to-emerald-25 transition-all duration-200 hover:shadow-sm"
                                      >
                                        <td className="px-3 py-2 text-sm text-gray-900 font-medium">
                                          {extractedData.summary || "N/A"}
                                        </td>
                                        <td className="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">
                                          {extractedData.creator || "N/A"}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>

                            {totalPages > 1 && (
                              <div className="mt-3 flex justify-center">
                                <div className="bg-gray-50 p-2 rounded-lg">
                                  <Pagination
                                    currentPage={popupPagination.currentPage}
                                    totalPages={totalPages}
                                    onPageChange={(page) =>
                                      handlePageChange(page, "popup")
                                    }
                                    size="small"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-8">
                            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                              <FaExclamationTriangle
                                className="text-gray-400"
                                size={20}
                              />
                            </div>
                            <p className="text-gray-500 text-sm font-medium">
                              No booking records found for{" "}
                              <span className="font-bold text-gray-700">
                                {addHoursToTimeRange(detailsPopup.time, 1)}
                              </span>{" "}
                              time slot.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {bookingApiResponse.isLoading && (
                  <div className="text-center py-8">
                    <div className="relative">
                      <div className="animate-spin rounded-full h-10 w-10 border-4 border-green-200 border-t-green-600 mx-auto mb-3"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-3 h-3 bg-green-600 rounded-full animate-pulse"></div>
                      </div>
                    </div>
                    <p className="text-gray-600 text-sm font-medium">
                      Fetching booking data for{" "}
                      <span className="font-bold text-green-600">
                        {addHoursToTimeRange(detailsPopup.time, 1)}
                      </span>
                      ...
                    </p>
                  </div>
                )}

                {!bookingApiResponse.isLoading &&
                  !bookingApiResponse.success &&
                  !bookingApiResponse.error && (
                    <div className="text-center py-8 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border-2 border-dashed border-gray-300">
                      <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <div className="w-6 h-6 bg-green-600 rounded-full"></div>
                      </div>
                      <p className="text-gray-500 text-sm font-medium">
                        Click to load booking data for{" "}
                        <span className="font-bold text-green-600">
                          {addHoursToTimeRange(detailsPopup.time, 1)}
                        </span>
                      </p>
                    </div>
                  )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Cancel Popup Component
  const CancelPopup = () => {
    // console.log(
    //   "CancelPopup render - isOpen:",
    //   cancelPopup.isOpen,
    //   "reason:",
    //   cancelPopup.reason
    // );
    if (!cancelPopup.isOpen) return null;

    const handleCancelConfirm = async () => {
      try {
        // Set loading state
        setCancelPopup((prev) => ({ ...prev, isLoading: true }));

        console.log("🚀 CancelPopup Confirm:", cancelPopup);
        if (cancelPopup.type === "availability") {
          await handleCancelAvailability(
            cancelPopup.date,
            cancelPopup.time,
            cancelPopup.teacherDetails?.uid,
            cancelPopup.reason,
            cancelPopup.data?.event_id || null,
            cancelPopup.upcomingEvents || false
          );
        } else if (cancelPopup.type === "booking") {
          await handleCancelBooking(
            cancelPopup.date,
            cancelPopup.time,
            cancelPopup.data,
            cancelPopup.reason,
            cancelPopup.data?.event_id || null,
            cancelPopup.classCount || 1
          );
        }

        // Close the cancel popup
        setCancelPopup({
          isOpen: false,
          type: null,
          data: null,
          date: null,
          time: null,
          reason: "",
          studentDetails: null,
          teacherDetails: null,
          classCount: 1,
          isLoading: false,
        });
      } catch (error) {
        console.error("Error canceling:", error);
        // Reset loading state on error
        setCancelPopup((prev) => ({ ...prev, isLoading: false }));
      }
    };

    const handleCancelClose = () => {
      setCancelPopup({
        isOpen: false,
        type: null,
        data: null,
        date: null,
        time: null,
        reason: "",
        studentDetails: null,
        teacherDetails: null,
        classCount: 1,
        isLoading: false,
      });
    };

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 animate-in fade-in duration-200">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-xs sm:max-w-sm md:max-w-md overflow-hidden border border-gray-100 backdrop-blur-lg animate-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div className="flex items-center justify-between p-3 bg-gradient-to-r from-red-50 to-red-100 border-b border-gray-200">
            <div className="flex-1 min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-red-800 flex items-center gap-2">
                <FaExclamationTriangle size={14} className="flex-shrink-0" />
                <span className="truncate">
                  Cancel{" "}
                  {cancelPopup.type === "availability"
                    ? "Availability"
                    : "Booking"}
                </span>
              </h2>
            </div>
            <button
              onClick={handleCancelClose}
              className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all duration-200 ml-2 flex-shrink-0 p-1 rounded-full hover:scale-110"
            >
              <FaTimes size={14} />
            </button>
          </div>

          <div className="p-3 max-h-[60vh] overflow-y-auto">
            {/* Session Information */}
            <div className="mb-3 p-2 bg-gradient-to-br from-gray-50 to-gray-100 rounded border border-gray-200 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-1 text-xs sm:text-sm flex items-center gap-1">
                <div className="w-1.5 h-1.5 bg-gradient-to-r from-red-500 to-red-600 rounded-full flex-shrink-0"></div>
                Session Information
              </h3>

              <div className="space-y-1">
                <div className="bg-white p-1.5 rounded border border-gray-100">
                  <div className="flex flex-col gap-1">
                    <span className="text-gray-600 text-xs font-medium">
                      Date & Time:
                    </span>
                    <span className="font-bold text-gray-900 bg-yellow-50 px-1.5 py-0.5 rounded text-xs break-words">
                      {formatDateDDMMMYYYY(cancelPopup.date)}{" "}
                      {addHoursToTimeRange(cancelPopup.time, 1)}{" "}
                      {selectedTimezone}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Summary Information */}
            {cancelPopup.data && cancelPopup.data.summary && (
              <div className="mb-3 p-2 bg-gradient-to-br from-green-50 to-green-100 rounded border border-green-200 shadow-sm">
                <h3 className="font-bold text-green-900 mb-1 text-xs sm:text-sm flex items-center gap-1">
                  <FaInfoCircle size={12} className="flex-shrink-0" />
                  Summary
                </h3>
                <div className="bg-white p-1.5 rounded border border-green-100">
                  <div className="text-xs text-green-800 font-medium break-words">
                    {cancelPopup.data.summary}
                  </div>
                </div>
              </div>
            )}

            {/* Reason Input */}
            <div className="mb-3 p-2 bg-gradient-to-br from-orange-50 to-orange-100 rounded border border-orange-200 shadow-sm">
              <h3 className="font-bold text-orange-900 mb-1 text-xs sm:text-sm flex items-center gap-1">
                <FaPaperPlane size={12} className="flex-shrink-0" />
                Cancellation Reason
              </h3>
              <div className="bg-white p-1.5 rounded border border-orange-100">
                <select
                  value={cancelPopup.reason}
                  onChange={(e) => {
                    const newReason = e.target.value;
                    console.log("Dropdown selection changed:", newReason);
                    setCancelPopup((prev) => {
                      console.log("Previous state:", prev);
                      const newState = {
                        ...prev,
                        reason: newReason,
                      };
                      console.log("New state:", newState);
                      return newState;
                    });
                  }}
                  onBlur={(e) => {
                    console.log("Dropdown lost focus");
                  }}
                  onFocus={(e) => {
                    console.log("Dropdown gained focus");
                  }}
                  className="w-full p-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-orange-500 focus:border-orange-500 bg-white text-xs"
                  required
                >
                  <option value="">Select a cancellation reason...</option>
                  <option value="B&R">Break and Return</option>
                  <option value="CBT/PL">
                    Cancelled by Teacher - Planned leave - Prior 48 hours
                  </option>
                  <option value="CBT/UL">
                    Cancelled by Teacher - Unplanned leave - within 48 hours
                  </option>
                  <option value="CBP/PL">
                    Cancelled by Parent - Planned leave - Prior 48 hours
                  </option>
                  <option value="CBP/UL">
                    Cancelled by Parent - Unplanned leave - within 48 hours
                  </option>
                  <option value="CBO">Cancelled by Ops</option>
                  <option value="NO SHOW - LR">
                    NO SHOW - LR No show by Learner
                  </option>
                  <option value="NO SHOW - TR">
                    NO SHOW - TR No show by Teacher
                  </option>
                </select>
              </div>
            </div>

            {/* Class Count Input */}
            <div className="mb-3 p-2 bg-gradient-to-br from-blue-50 to-indigo-50 rounded border border-blue-200 shadow-sm">
              <h3 className="font-bold text-blue-900 mb-1 text-xs sm:text-sm flex items-center gap-1">
                <FaCalendarAlt size={12} className="flex-shrink-0" />
                Class Information
              </h3>
              <div className="bg-white p-1.5 rounded border border-blue-100">
                <label className="flex items-center gap-2 text-xs">
                  <span className="text-gray-700 font-medium">
                    Class Count:
                  </span>
                  <input
                    type="number"
                    min="1"
                    value={cancelPopup.classCount || 1}
                    onChange={(e) => {
                      setCancelPopup((prev) => ({
                        ...prev,
                        classCount: parseInt(e.target.value) || 1,
                      }));
                    }}
                    className="w-16 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                  />
                </label>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-3 flex flex-col sm:flex-row gap-2 justify-end">
              <button
                onClick={handleCancelClose}
                className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors duration-200 font-medium text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleCancelConfirm}
                disabled={!cancelPopup.reason.trim() || cancelPopup.isLoading}
                className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors duration-200 font-medium flex items-center justify-center gap-1 text-xs"
              >
                <FaTimes size={12} />
                <span>
                  {cancelPopup.isLoading
                    ? "Cancelling..."
                    : "Confirm Cancellation"}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Apply Leave Popup Component
  const ApplyLeavePopup = () => {
    if (!applyLeavePopup.isOpen) return null;

    const today = formatDate(new Date());
    // Local state for reason to allow smooth typing
    const [reasonText, setReasonText] = useState("");

    // Reset reason text when popup opens
    React.useEffect(() => {
      if (applyLeavePopup.isOpen) {
        setReasonText(applyLeavePopup.reason || "");
      }
    }, [applyLeavePopup.isOpen]);

    const handleSubmit = async () => {
      // Reset errors
      setApplyLeavePopup((prev) => ({
        ...prev,
        errors: { startDate: "", endDate: "", reason: "" },
      }));

      // Validation
      let hasErrors = false;
      const newErrors = { startDate: "", endDate: "", reason: "" };

      if (!applyLeavePopup.startDate) {
        newErrors.startDate = "Start date is required";
        hasErrors = true;
      } else {
        const startDateStr = applyLeavePopup.startDate;
        const startTimeStr = applyLeavePopup.startTime || "00:00";
        const startDateTime = new Date(`${startDateStr}T${startTimeStr}`);
        const todayObj = new Date(today);
        todayObj.setHours(0, 0, 0, 0);

        if (startDateTime < todayObj) {
          newErrors.startDate = "Start date must be from today onwards";
          hasErrors = true;
        }
      }

      if (!applyLeavePopup.endDate) {
        newErrors.endDate = "End date is required";
        hasErrors = true;
      } else if (applyLeavePopup.startDate) {
        const startDateStr = applyLeavePopup.startDate;
        const startTimeStr = applyLeavePopup.startTime || "00:00";
        const endDateStr = applyLeavePopup.endDate;
        const endTimeStr = applyLeavePopup.endTime || "23:00";

        const startDateTime = new Date(`${startDateStr}T${startTimeStr}`);
        const endDateTime = new Date(`${endDateStr}T${endTimeStr}`);

        if (endDateTime < startDateTime) {
          newErrors.endDate =
            "End date/time must be greater than or equal to start date/time";
          hasErrors = true;
        }
      }

      if (!reasonText || reasonText.trim() === "") {
        newErrors.reason = "Reason is required";
        hasErrors = true;
      }

      if (hasErrors) {
        setApplyLeavePopup((prev) => ({ ...prev, errors: newErrors }));
        return;
      }

      try {
        setApplyLeavePopup((prev) => ({ ...prev, isLoading: true }));

        // Format dates as ["YYYY-MM-DD", "HH:MM"]
        const startDateFormatted = [
          applyLeavePopup.startDate,
          applyLeavePopup.startTime || "00:00",
        ];
        const endDateFormatted = [
          applyLeavePopup.endDate,
          applyLeavePopup.endTime || "23:00",
        ];

        await applyTeacherLeave(
          selectedTeacher.email,
          startDateFormatted,
          endDateFormatted,
          reasonText,
          selectedTeacher.uid || null
        );

        // Close popup immediately
        setApplyLeavePopup({
          isOpen: false,
          startDate: "",
          startTime: "00:00",
          endDate: "",
          endTime: "23:00",
          reason: "",
          isLoading: false,
          errors: { startDate: "", endDate: "", reason: "" },
        });
        setReasonText("");

        // Show success message as toaster (auto-hides after 3 seconds)
        setSuccessMessage({
          show: true,
          message: "Leave added successfully!",
          type: "leave",
        });
      } catch (error) {
        console.error("Error applying leave:", error);
        alert(`Failed to apply leave: ${error.message}`);
        setApplyLeavePopup((prev) => ({ ...prev, isLoading: false }));
      }
    };

    const handleClose = () => {
      setApplyLeavePopup({
        isOpen: false,
        startDate: "",
        startTime: "00:00",
        endDate: "",
        endTime: "23:00",
        reason: "",
        isLoading: false,
        errors: { startDate: "", endDate: "", reason: "" },
      });
      setReasonText("");
    };

    const handleStartDateChange = (e) => {
      const newStartDate = e.target.value;
      setApplyLeavePopup((prev) => ({ ...prev, startDate: newStartDate }));

      // If end date is before new start date, clear it
      if (applyLeavePopup.endDate && newStartDate) {
        const startTimeStr = applyLeavePopup.startTime || "00:00";
        const endTimeStr = applyLeavePopup.endTime || "23:00";
        const startDateTime = new Date(`${newStartDate}T${startTimeStr}`);
        const endDateTime = new Date(
          `${applyLeavePopup.endDate}T${endTimeStr}`
        );

        if (endDateTime < startDateTime) {
          setApplyLeavePopup((prev) => ({ ...prev, endDate: "" }));
        }
      }

      // Clear error
      if (applyLeavePopup.errors.startDate) {
        setApplyLeavePopup((prev) => ({
          ...prev,
          errors: { ...prev.errors, startDate: "" },
        }));
      }
    };

    const handleStartTimeChange = (e) => {
      const newStartTime = e.target.value;
      setApplyLeavePopup((prev) => ({ ...prev, startTime: newStartTime }));

      // Validate end date/time if both dates are set
      if (applyLeavePopup.startDate && applyLeavePopup.endDate) {
        const startTimeStr = newStartTime || "00:00";
        const endTimeStr = applyLeavePopup.endTime || "23:00";
        const startDateTime = new Date(
          `${applyLeavePopup.startDate}T${startTimeStr}`
        );
        const endDateTime = new Date(
          `${applyLeavePopup.endDate}T${endTimeStr}`
        );

        if (
          endDateTime < startDateTime &&
          applyLeavePopup.errors.endDate === ""
        ) {
          setApplyLeavePopup((prev) => ({
            ...prev,
            errors: {
              ...prev.errors,
              endDate:
                "End date/time must be greater than or equal to start date/time",
            },
          }));
        } else if (
          endDateTime >= startDateTime &&
          applyLeavePopup.errors.endDate
        ) {
          setApplyLeavePopup((prev) => ({
            ...prev,
            errors: { ...prev.errors, endDate: "" },
          }));
        }
      }

      // Clear error
      if (applyLeavePopup.errors.startDate) {
        setApplyLeavePopup((prev) => ({
          ...prev,
          errors: { ...prev.errors, startDate: "" },
        }));
      }
    };

    const handleEndDateChange = (e) => {
      const newEndDate = e.target.value;
      setApplyLeavePopup((prev) => ({ ...prev, endDate: newEndDate }));

      // Validate end date/time if both dates are set
      if (applyLeavePopup.startDate && newEndDate) {
        const startTimeStr = applyLeavePopup.startTime || "00:00";
        const endTimeStr = applyLeavePopup.endTime || "23:00";
        const startDateTime = new Date(
          `${applyLeavePopup.startDate}T${startTimeStr}`
        );
        const endDateTime = new Date(`${newEndDate}T${endTimeStr}`);

        if (endDateTime < startDateTime) {
          setApplyLeavePopup((prev) => ({
            ...prev,
            errors: {
              ...prev.errors,
              endDate:
                "End date/time must be greater than or equal to start date/time",
            },
          }));
        } else {
          setApplyLeavePopup((prev) => ({
            ...prev,
            errors: { ...prev.errors, endDate: "" },
          }));
        }
      } else if (applyLeavePopup.errors.endDate) {
        setApplyLeavePopup((prev) => ({
          ...prev,
          errors: { ...prev.errors, endDate: "" },
        }));
      }
    };

    const handleEndTimeChange = (e) => {
      const newEndTime = e.target.value;
      setApplyLeavePopup((prev) => ({ ...prev, endTime: newEndTime }));

      // Validate end date/time if both dates are set
      if (applyLeavePopup.startDate && applyLeavePopup.endDate) {
        const startTimeStr = applyLeavePopup.startTime || "00:00";
        const endTimeStr = newEndTime || "23:00";
        const startDateTime = new Date(
          `${applyLeavePopup.startDate}T${startTimeStr}`
        );
        const endDateTime = new Date(
          `${applyLeavePopup.endDate}T${endTimeStr}`
        );

        if (endDateTime < startDateTime) {
          setApplyLeavePopup((prev) => ({
            ...prev,
            errors: {
              ...prev.errors,
              endDate:
                "End date/time must be greater than or equal to start date/time",
            },
          }));
        } else {
          setApplyLeavePopup((prev) => ({
            ...prev,
            errors: { ...prev.errors, endDate: "" },
          }));
        }
      }

      // Clear error
      if (applyLeavePopup.errors.endDate) {
        setApplyLeavePopup((prev) => ({
          ...prev,
          errors: { ...prev.errors, endDate: "" },
        }));
      }
    };

    // Calculate min end date (should be >= start date)
    const minEndDate = applyLeavePopup.startDate || today;

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 animate-in fade-in duration-200">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-xs sm:max-w-sm md:max-w-md overflow-hidden border border-gray-100 backdrop-blur-lg animate-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div className="flex items-center justify-between p-3 bg-gradient-to-r from-orange-50 to-orange-100 border-b border-gray-200">
            <div className="flex-1 min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-orange-800 flex items-center gap-2">
                <FaCalendarAlt size={14} className="flex-shrink-0" />
                <span className="truncate">Add Leaves</span>
              </h2>
            </div>
            <button
              onClick={handleClose}
              disabled={applyLeavePopup.isLoading}
              className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all duration-200 ml-2 flex-shrink-0 p-1 rounded-full hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FaTimes size={14} />
            </button>
          </div>

          <div className="p-4">
            {/* Teacher Info */}
            {selectedTeacher && (
              <div className="mb-4 p-2 bg-blue-50 rounded border border-blue-200">
                <p className="text-xs text-blue-800">
                  <span className="font-semibold">Teacher:</span>{" "}
                  {selectedTeacher.full_name}
                </p>
              </div>
            )}

            {/* Start Date */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Start Date <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={applyLeavePopup.startDate}
                  onChange={handleStartDateChange}
                  min={today}
                  disabled={applyLeavePopup.isLoading}
                  className={`flex-1 px-3 py-2 text-xs border rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                    applyLeavePopup.errors.startDate
                      ? "border-red-500"
                      : "border-gray-300"
                  } disabled:bg-gray-100 disabled:cursor-not-allowed`}
                />
                <select
                  value={applyLeavePopup.startTime}
                  onChange={handleStartTimeChange}
                  disabled={applyLeavePopup.isLoading}
                  className={`px-3 py-2 text-xs border rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                    applyLeavePopup.errors.startDate
                      ? "border-red-500"
                      : "border-gray-300"
                  } disabled:bg-gray-100 disabled:cursor-not-allowed`}
                >
                  {Array.from({ length: 24 }, (_, i) => {
                    const hour = String(i).padStart(2, "0");
                    return (
                      <option key={hour} value={`${hour}:00`}>
                        {hour}:00
                      </option>
                    );
                  })}
                </select>
              </div>
              {applyLeavePopup.errors.startDate && (
                <p className="text-xs text-red-500 mt-1">
                  {applyLeavePopup.errors.startDate}
                </p>
              )}
            </div>

            {/* End Date */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                End Date <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={applyLeavePopup.endDate}
                  onChange={handleEndDateChange}
                  min={minEndDate}
                  disabled={
                    applyLeavePopup.isLoading || !applyLeavePopup.startDate
                  }
                  className={`flex-1 px-3 py-2 text-xs border rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                    applyLeavePopup.errors.endDate
                      ? "border-red-500"
                      : "border-gray-300"
                  } disabled:bg-gray-100 disabled:cursor-not-allowed`}
                />
                <select
                  value={applyLeavePopup.endTime}
                  onChange={handleEndTimeChange}
                  disabled={
                    applyLeavePopup.isLoading || !applyLeavePopup.startDate
                  }
                  className={`px-3 py-2 text-xs border rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                    applyLeavePopup.errors.endDate
                      ? "border-red-500"
                      : "border-gray-300"
                  } disabled:bg-gray-100 disabled:cursor-not-allowed`}
                >
                  {Array.from({ length: 24 }, (_, i) => {
                    const hour = String(i).padStart(2, "0");
                    return (
                      <option key={hour} value={`${hour}:00`}>
                        {hour}:00
                      </option>
                    );
                  })}
                </select>
              </div>
              {applyLeavePopup.errors.endDate && (
                <p className="text-xs text-red-500 mt-1">
                  {applyLeavePopup.errors.endDate}
                </p>
              )}
            </div>

            {/* Reason */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reasonText}
                onChange={(e) => {
                  setReasonText(e.target.value);
                  if (applyLeavePopup.errors.reason) {
                    setApplyLeavePopup((prev) => ({
                      ...prev,
                      errors: { ...prev.errors, reason: "" },
                    }));
                  }
                }}
                disabled={applyLeavePopup.isLoading}
                rows={4}
                placeholder="Enter reason for leave..."
                className={`w-full p-2 text-xs border rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none hover:border-orange-400 transition-colors duration-200 ${
                  applyLeavePopup.errors.reason
                    ? "border-red-500"
                    : "border-gray-300"
                } disabled:bg-gray-100 disabled:cursor-not-allowed`}
              />
              {applyLeavePopup.errors.reason && (
                <p className="text-xs text-red-500 mt-1">
                  {applyLeavePopup.errors.reason}
                </p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 justify-end">
              <button
                onClick={handleClose}
                disabled={applyLeavePopup.isLoading}
                className="px-4 py-2 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={applyLeavePopup.isLoading}
                className="px-4 py-2 text-xs font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {applyLeavePopup.isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div>
                    Adding...
                  </>
                ) : (
                  "Add Leaves"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Schedule Management Popup Component
  const ScheduleManagementPopup = () => {
    if (!scheduleManagementPopup.isOpen) return null;

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-3 md:p-4 animate-in fade-in duration-200">
        <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-2xl xl:max-w-4xl 2xl:max-w-5xl max-h-[85vh] sm:max-h-[80vh] md:max-h-[75vh] overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h2 className="text-base sm:text-lg md:text-xl font-bold">
                  Add Booking for Student
                </h2>
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mt-1 text-sm sm:text-base text-blue-100">
                  <div className="flex items-center gap-1 sm:gap-2">
                    <FaGraduationCap size={14} className="flex-shrink-0" />
                    <span>Student: {selectedStudent?.deal_name || "N/A"}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={handleScheduleManagementClose}
                className="text-white/80 hover:text-white hover:bg-white/20 p-1.5 sm:p-2 rounded-full transition-all duration-200 flex-shrink-0"
              >
                <FaTimes size={16} className="sm:w-5 sm:h-5" />
              </button>
            </div>
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
                      <div className="grid grid-cols-1 gap-1.5">
                        <button
                          type="button"
                          className="p-2 rounded border-2 border-blue-500 bg-blue-50 text-blue-700 transition-all duration-200 text-xs font-medium"
                        >
                          Trial
                        </button>
                        {/* <button
                          type="button"
                          className="p-2 rounded border-2 border-gray-300 bg-white text-gray-700 hover:border-green-300 transition-all duration-200 text-xs font-medium"
                        >
                          Paid
                        </button> */}
                      </div>
                    </div>

                    {/* Platform Credentials */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-0.5">
                        Credentials / Notes
                      </label>
                      <textarea
                        defaultValue={platformCredentials}
                        onBlur={(e) => setPlatformCredentials(e.target.value)}
                        placeholder="Enter platform credentials, notes, or any additional information..."
                        rows={3}
                        className="w-full p-2 border border-gray-300 rounded text-xs text-black focus:ring-1 focus:ring-green-500 focus:border-transparent resize-none"
                      />
                    </div>

                    {/* PDF File Upload */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-0.5">
                        Attach PDF File
                      </label>
                      <div className="space-y-1.5">
                        <input
                          type="file"
                          accept=".pdf"
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) {
                              if (file.size > 10 * 1024 * 1024) {
                                alert("File size must be less than 10MB");
                                return;
                              }
                              setPdfFileName(file.name);
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                const base64String =
                                  reader.result.split(",")[1];
                                // Store in a way that can be accessed in handleBookStudentFromPopup
                                window.scheduleManagementPdfBase64 =
                                  base64String;
                              };
                              reader.readAsDataURL(file);
                              setPdfFile(file);
                            }
                          }}
                          className="hidden"
                          id="pdf-upload-schedule"
                        />
                        <label
                          htmlFor="pdf-upload-schedule"
                          className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-md cursor-pointer hover:bg-gray-50 transition-colors text-xs"
                        >
                          <FaPaperclip size={12} className="text-gray-600" />
                          <span className="text-gray-700">
                            {pdfFileName || "Choose PDF file"}
                          </span>
                        </label>
                        {pdfFileName && (
                          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-md p-2">
                            <div className="flex items-center gap-2">
                              <FaFile size={12} className="text-green-600" />
                              <span className="text-xs text-gray-700 truncate">
                                {pdfFileName}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setPdfFile(null);
                                setPdfFileName("");
                                window.scheduleManagementPdfBase64 = "";
                                document.getElementById(
                                  "pdf-upload-schedule"
                                ).value = "";
                              }}
                              className="text-red-500 hover:text-red-700"
                            >
                              <FaTimes size={10} />
                            </button>
                          </div>
                        )}
                      </div>
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
                            defaultValue={attendees}
                            onBlur={(e) => {
                              handleAttendeesChange(e.target.value);
                              handleAttendeesBlur();
                            }}
                            onKeyPress={handleAttendeesKeyPress}
                            placeholder="Enter email address and press Enter"
                            className={`w-full p-2 border rounded text-xs text-black focus:ring-1 focus:ring-green-500 focus:border-transparent ${
                              attendeesError
                                ? "border-red-300"
                                : "border-gray-300"
                            }`}
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

                    <button
                      onClick={handleBookStudentFromPopup}
                      disabled={
                        scheduleManagementPopup.isLoading ||
                        !selectedStudent ||
                        scheduleEntries.length === 0
                      }
                      className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white py-2 rounded hover:from-green-700 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-1.5 font-medium text-xs"
                    >
                      <FaBook size={14} />
                      {scheduleManagementPopup.isLoading
                        ? "Booking..."
                        : "Book Student"}
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
                  </h3>

                  <div className="space-y-2">
                    {/* Schedule Entry Form */}
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-0.5">
                          Date
                        </label>
                        <input
                          type="date"
                          value={selectedScheduleDate}
                          onChange={(e) => {
                            const selectedDate = e.target.value;
                            if (selectedDate) {
                              const dateObj = new Date(selectedDate);
                              if (isLockedHoliday(dateObj)) {
                                alert(
                                  "This date is locked due to holiday. Please select another date."
                                );
                                return;
                              }
                            }
                            setSelectedScheduleDate(selectedDate);
                            // Reset time selection when date changes
                            setSelectedScheduleTime("");
                          }}
                          min={(() => {
                            const lastWeekDate = new Date();
                            lastWeekDate.setDate(lastWeekDate.getDate() - 7);
                            return lastWeekDate.toISOString().split("T")[0];
                          })()}
                          className="w-full p-2 border border-gray-300 rounded text-xs text-black focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-0.5">
                          Time
                        </label>
                        <select
                          value={selectedScheduleTime}
                          onChange={(e) => {
                            setSelectedScheduleTime(e.target.value);
                          }}
                          className="w-full p-2 border border-gray-300 rounded text-xs text-black focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="">Select time...</option>
                          {(() => {
                            // Check if date is in the past
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            const selectedDate = selectedScheduleDate
                              ? new Date(selectedScheduleDate)
                              : null;
                            const isPastDate =
                              selectedDate && selectedDate < today;

                            // Generate all time slots
                            const allTimeSlots = Array.from(
                              { length: 48 },
                              (_, i) => {
                                const hour = Math.floor(i / 2);
                                const minute = (i % 2) * 30;
                                return `${String(hour).padStart(
                                  2,
                                  "0"
                                )}:${String(minute).padStart(2, "0")}`;
                              }
                            );

                            // If no date selected or no teacher, show all slots (except past dates)
                            if (
                              !selectedScheduleDate ||
                              !scheduleManagementPopup.teacherUid
                            ) {
                              return allTimeSlots.map((timeString) => (
                                <option
                                  key={timeString}
                                  value={timeString}
                                  disabled={isPastDate}
                                  style={{
                                    color: isPastDate ? "#999" : "inherit",
                                  }}
                                >
                                  {timeString}
                                </option>
                              ));
                            }

                            // Filter to only show available slots
                            const availableSlots = allTimeSlots.filter(
                              (timeString) => {
                                const dateObj = new Date(selectedScheduleDate);
                                const slotCounts = getSlotCounts(
                                  dateObj,
                                  timeString
                                );
                                const teacherUid =
                                  scheduleManagementPopup.teacherUid;
                                return (
                                  slotCounts.available > 0 &&
                                  (slotCounts.teacherid === teacherUid ||
                                    slotCounts.uid === teacherUid)
                                );
                              }
                            );

                            // Render only available slots
                            return availableSlots.map((timeString) => (
                              <option key={timeString} value={timeString}>
                                {timeString}
                              </option>
                            ));
                          })()}
                        </select>
                        {selectedScheduleDate &&
                          scheduleManagementPopup.teacherUid && (
                            <div className="mt-1 text-[10px] text-gray-500">
                              {(() => {
                                const dateObj = new Date(selectedScheduleDate);
                                const today = new Date();
                                today.setHours(0, 0, 0, 0);
                                if (dateObj < today) {
                                  return "⚠️ Past dates are disabled";
                                }
                                return "Slots with teacher availability are enabled";
                              })()}
                            </div>
                          )}
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
                      {scheduleEntries.map((entry) => {
                        // Handle both array format [date, time] and object format {id, date, time}
                        const entryId = Array.isArray(entry)
                          ? scheduleEntries.indexOf(entry)
                          : entry.id;

                        // Check teacher availability for this entry
                        let availabilityStatus = null;
                        if (scheduleManagementPopup.teacherUid && entry.date) {
                          const dateObj = new Date(entry.date);
                          const slotCounts = getSlotCounts(dateObj, entry.time);
                          const teacherUid = scheduleManagementPopup.teacherUid;
                          const isAvailable =
                            slotCounts.available > 0 &&
                            (slotCounts.teacherid === teacherUid ||
                              slotCounts.uid === teacherUid);
                          availabilityStatus = isAvailable;
                        }

                        // Check if date is in the past
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const entryDate = entry.date
                          ? new Date(entry.date)
                          : null;
                        const isPastDate = entryDate && entryDate < today;

                        return (
                          <div
                            key={entryId}
                            className={`bg-white rounded p-2 border shadow-sm flex justify-between items-center ${
                              isPastDate
                                ? "border-red-300 bg-red-50"
                                : availabilityStatus === false
                                ? "border-orange-300 bg-orange-50"
                                : availabilityStatus === true
                                ? "border-green-300 bg-green-50"
                                : "border-blue-200"
                            }`}
                          >
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              <FaCalendarAlt
                                size={12}
                                className={
                                  isPastDate
                                    ? "text-red-600"
                                    : availabilityStatus === false
                                    ? "text-orange-600"
                                    : availabilityStatus === true
                                    ? "text-green-600"
                                    : "text-blue-600"
                                }
                              />
                              <span className="text-xs font-medium text-gray-900 truncate">
                                {entry.date} at {entry.time}
                              </span>
                              {isPastDate && (
                                <span className="text-[10px] text-red-600 font-medium ml-1">
                                  (Past Date)
                                </span>
                              )}
                              {!isPastDate &&
                                availabilityStatus === false &&
                                scheduleManagementPopup.teacherUid && (
                                  <span className="text-[10px] text-orange-600 font-medium ml-1">
                                    (Not Available)
                                  </span>
                                )}
                              {!isPastDate &&
                                availabilityStatus === true &&
                                scheduleManagementPopup.teacherUid && (
                                  <span className="text-[10px] text-green-600 font-medium ml-1">
                                    (Available)
                                  </span>
                                )}
                            </div>
                            <button
                              onClick={() => removeScheduleEntry(entryId)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 p-0.5 rounded transition-all duration-200 flex-shrink-0"
                            >
                              <FaTrash size={10} />
                            </button>
                          </div>
                        );
                      })}
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

                {/* Student Information */}
                <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg p-3 border border-purple-200">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-2">
                    <div className="p-0.5 bg-purple-100 rounded">
                      <FaGraduationCap size={14} className="text-purple-600" />
                    </div>
                    Student Information
                  </h3>

                  <div className="space-y-2">
                    <div className="bg-white rounded p-2 border border-purple-200 shadow-sm">
                      <div className="flex items-center gap-1.5">
                        <FaGraduationCap
                          size={12}
                          className="text-purple-600"
                        />
                        <span className="text-xs font-medium text-gray-900">
                          {selectedStudent?.deal_name || "N/A"}
                        </span>
                      </div>
                      {selectedStudent?.hubspot_learner_status && (
                        <div className="text-[10px] text-gray-500 mt-1">
                          Status: {selectedStudent.hubspot_learner_status}
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
    );
  };

  const currentSlot = selectedSlot
    ? getScheduleForDate(selectedSlot.date)[selectedSlot.time]
    : null;

  // Get paginated time slots for calendar
  const getPaginatedTimeSlots = () => {
    const startIndex =
      (calendarPagination.currentPage - 1) * calendarPagination.itemsPerPage;
    const endIndex = startIndex + calendarPagination.itemsPerPage;
    return TIME_SLOTS.slice(startIndex, endIndex);
  };

  const totalCalendarPages = getTotalPages(
    TIME_SLOTS.length,
    calendarPagination.itemsPerPage
  );

  // Handle calendar page change
  const handleCalendarPageChange = (newPage) => {
    setCalendarPagination((prev) => ({
      ...prev,
      currentPage: newPage,
    }));
  };

  return (
    <div className="min-h-screen bg-blue-600 flex flex-col lg:flex-row">
      {/* Mobile Header */}
      <div className="lg:hidden bg-blue-600 p-3 sm:p-4 border-b-2 border-black">
        <div className="flex items-center justify-between">
          <h1 className="text-base sm:text-lg font-bold text-white truncate">
            Jetlearn Calendar
          </h1>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-white p-1.5 sm:p-2 hover:bg-white/10 rounded transition-colors duration-200"
          >
            {sidebarOpen ? (
              <FaTimes size={18} className="sm:w-5 sm:h-5" />
            ) : (
              <FaBars size={18} className="sm:w-5 sm:h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Left Sidebar - Orange Panel */}
      <div
        className={`
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0
        fixed lg:relative
        top-0 left-0
        w-72 sm:w-80 h-full
        bg-blue-600 border-r-2 border-black 
        flex flex-col
        z-50
        transition-transform duration-300 ease-in-out
        overflow-y-auto
      `}
      >
        <div className="p-3 sm:p-4">
          <h1 className="text-lg sm:text-xl font-bold text-white mb-4 hidden lg:block">
            Jetlearn Calendar
          </h1>

          {/* Active Filters Display */}
          {(selectedTeacher || selectedStudent) && (
            <div className="mt-4 bg-white rounded-lg p-3 sm:p-4 m-4">
              <h3 className="text-sm sm:text-base font-semibold text-gray-900 flex items-center gap-2 mb-2">
                <FaFilter className="text-orange-600 flex-shrink-0" />
                <span className="truncate">Active Filters</span>
              </h3>
              <div className="space-y-2">
                {selectedTeacher && (
                  <div className="bg-orange-50 border border-orange-200 rounded px-2 sm:px-3 py-1 sm:py-1.5 flex items-center gap-2">
                    <FaChalkboardTeacher
                      className="text-orange-600 flex-shrink-0"
                      size={12}
                    />
                    <div className="text-xs sm:text-sm min-w-0 flex-1">
                      <span className="text-gray-600">Teacher:</span>
                      <span className="ml-1 font-medium text-orange-900 truncate">
                        {selectedTeacher.full_name}
                      </span>
                    </div>
                    <button
                      onClick={clearTeacherFilter}
                      className="text-orange-600 hover:text-orange-800 ml-auto flex-shrink-0 p-1"
                      disabled={apiDataLoading}
                    >
                      <FaTimes size={10} className="sm:w-3 sm:h-3" />
                    </button>
                  </div>
                )}

                {selectedStudent && (
                  <div className="bg-purple-50 border border-purple-200 rounded px-2 sm:px-3 py-1 sm:py-1.5 flex items-center gap-2">
                    <FaUserGraduate
                      className="text-purple-600 flex-shrink-0"
                      size={12}
                    />
                    <div className="text-xs sm:text-sm min-w-0 flex-1">
                      <span className="text-gray-600">Student:</span>
                      <span className="ml-1 font-medium text-purple-900 truncate">
                        {selectedStudent.deal_name}
                      </span>
                    </div>
                    <button
                      onClick={clearStudentFilter}
                      className="text-purple-600 hover:text-purple-800 ml-auto flex-shrink-0 p-1"
                      disabled={apiDataLoading}
                    >
                      <FaTimes size={10} className="sm:w-3 sm:h-3" />
                    </button>
                  </div>
                )}

                {(selectedTeacher || selectedStudent) && (
                  <button
                    onClick={clearAllFilters}
                    className="w-full text-xs sm:text-sm text-red-600 hover:text-red-800 font-medium flex items-center justify-center gap-1 py-1 sm:py-1.5"
                    disabled={apiDataLoading}
                  >
                    <FaTimes size={10} className="sm:w-3 sm:h-3" />
                    <span>Clear All Filters</span>
                  </button>
                )}

                {apiDataLoading && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded px-2 sm:px-3 py-1 sm:py-1.5 flex items-center gap-2">
                    <div className="animate-spin rounded-full h-3 w-3 sm:h-4 sm:w-4 border-b-2 border-yellow-600 flex-shrink-0"></div>
                    <span className="text-xs sm:text-sm text-yellow-800">
                      Updating view...
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Enhanced Timezone Search */}
          <div className="mb-4">
            <h2 className="text-sm sm:text-base font-semibold text-white mb-2 flex items-center gap-2">
              <FaGlobe size={14} className="flex-shrink-0" />
              <span className="truncate">Timezone Search</span>
            </h2>
            <EnhancedTimezoneSearch
              timezones={timezones}
              selectedTimezone={selectedTimezone}
              onTimezoneSelect={handleTimezoneSelect}
              loading={false}
              error={null}
            />
          </div>

          {/* Enhanced Teacher Search */}
          <div className="mb-4">
            <h2 className="text-sm sm:text-base font-semibold text-white mb-2 flex items-center gap-2">
              <FaSearch size={14} className="flex-shrink-0" />
              <span className="truncate">Teacher Search</span>
              {teachersLoading && (
                <span className="text-orange-200 text-xs sm:text-sm">
                  (Loading...)
                </span>
              )}
              {teachersError && (
                <span className="text-red-200 text-xs sm:text-sm">(Error)</span>
              )}
            </h2>
            <EnhancedTeacherSearch
              teachers={teachers}
              selectedTeacher={selectedTeacher}
              onTeacherSelect={handleTeacherSelect}
              loading={teachersLoading}
              error={teachersError}
            />
          </div>

          {/* Enhanced Student Search */}
          <div className="mb-4">
            <h2 className="text-sm sm:text-base font-semibold text-white mb-2 flex items-center gap-2">
              <FaGraduationCap size={14} className="flex-shrink-0" />
              <span className="truncate">Learner Search</span>
              {studentsLoading && (
                <span className="text-orange-200 text-xs sm:text-sm">
                  (Loading...)
                </span>
              )}
              {studentsError && (
                <span className="text-red-200 text-xs sm:text-sm">(Error)</span>
              )}
            </h2>
            <EnhancedStudentSearch
              students={allAvailableStudents}
              selectedStudent={selectedStudent}
              onStudentSelect={handleStudentSelect}
              loading={studentsLoading}
              error={studentsError}
            />
          </div>

          {/* Teacher and Student Details */}
          <div className="space-y-3">
            <div className="bg-white rounded border border-orange-300 p-2 sm:p-3 text-xs sm:text-sm leading-snug">
              <TeacherDetails
                teacher={selectedTeacher}
                teacherStats={
                  selectedTeacher ? getTeacherStats(selectedTeacher.id) : null
                }
              />
            </div>
            <div className="bg-white rounded border border-orange-300 p-2 sm:p-3 text-xs sm:text-sm leading-snug">
              <StudentDetails
                student={selectedStudent}
                schedule={schedule}
                allTeachers={teachers}
              />
            </div>
          </div>
        </div>

        {/* <div className="space-y-4 bg-white m-4 rounded-lg p-5">
            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 sm:w-4 sm:h-4 bg-green-200 rounded"></div>
                <span className="text-xs sm:text-sm text-gray-700">Available</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 sm:w-4 sm:h-4 bg-red-200 rounded"></div>
                <span className="text-xs sm:text-sm text-gray-700">Booked</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 sm:w-4 sm:h-4 bg-gray-200 rounded"></div>
                <span className="text-xs sm:text-sm text-gray-700">No Availability</span>
              </div>
            </div>

          </div> */}

        {/* Calendar Pagination */}
        {/* {totalCalendarPages > 1 && (
          <div className="bg-white border-t border-gray-200 p-3 mt-auto">
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-600">
                Showing time slots
              </div>
              <Pagination
                currentPage={calendarPagination.currentPage}
                totalPages={totalCalendarPages}
                onPageChange={handleCalendarPageChange}
                size="small"
              />
            </div>
          </div>
        )} */}
      </div>

      {/* Right Main Content - Pink Panel */}
      <div className="flex-1 bg-pink-200 border-l-2 border-black flex flex-col min-w-0">
        {/* Blue Header Bar with View Selection */}
        <div className="bg-blue-600 p-1 sm:p-2 border-b border-black">
          {/* First Row: Title and User Info */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-1">
                <FaCalendarAlt className="text-white text-xs sm:text-sm" />
                Calendar System
              </h2>
            </div>

            {/* User Info and Logout - Opposite to Calendar System */}
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-1 text-white text-xs">
                <FaUserCheck size={10} className="text-white" />
                <span className="text-white">Hi,</span>
                <span className="bg-blue-500 px-1 py-0.5 rounded text-xs">
                  {user?.name || user?.email || "User"}
                </span>
                <button
                  onClick={logout}
                  className="flex items-center gap-1 px-1 sm:px-2 py-0.5 sm:py-1 bg-red-500 hover:bg-red-400 text-white rounded text-xs transition-all duration-200"
                  title="Logout"
                >
                  <FaSignOutAlt size={10} />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            </div>
          </div>

          {/* Second Row: View Selection and Navigation Controls */}
          <div className="flex items-center justify-between gap-1">
            {/* View Selection Buttons - Left Side */}
            <div className="flex bg-blue-700 rounded p-0.5">
              <button
                onClick={() => {
                  if (selectedTeacher || selectedStudent) {
                    setCurrentView("list");
                  }
                }}
                disabled={!selectedTeacher && !selectedStudent}
                className={`px-1 sm:px-2 py-0.5 sm:py-1 rounded text-xs font-medium transition-all duration-200 flex items-center gap-1 ${
                  !selectedTeacher && !selectedStudent
                    ? "opacity-50 cursor-not-allowed text-gray-400"
                    : currentView === "list"
                    ? "bg-blue-500 text-white shadow-sm"
                    : "text-blue-100 hover:text-white"
                }`}
                title={
                  !selectedTeacher && !selectedStudent
                    ? "Select a Teacher or Student to enable List View"
                    : "Switch to List View"
                }
              >
                <FaList size={10} />
                <span className="hidden sm:inline">List View</span>
                <span className="sm:hidden">List</span>
              </button>
              <button
                onClick={() => {
                  setCurrentView("week");
                  // Call both Summary APIs when switching to Week view
                  console.log("🔄 Switching to Week view - calling APIs...");

                  // Call availability summary API
                  fetchWeeklyAvailabilityData(
                    currentWeekStart,
                    selectedTeacher?.uid,
                    selectedStudent?.jetlearner_id,
                    selectedTimezone
                  )
                    .then(async (data) => {
                      if (data) {
                        setWeeklyApiData(data);
                        console.log(
                          "✅ Availability summary API called successfully"
                        );
                      }

                      // Also fetch teacher leaves if teacher is selected
                      if (selectedTeacher?.email) {
                        console.log(
                          "🍃 Fetching teacher leaves for week view switch..."
                        );
                        const weekDates = getWeekDates(currentWeekStart);
                        const startDate = formatDate(weekDates[0]);
                        const endDate = formatDate(weekDates[6]);
                        await fetchTeacherLeaves(
                          selectedTeacher.email,
                          startDate,
                          endDate
                        );
                      }
                    })
                    .catch((error) => {
                      console.error(
                        "❌ Error calling availability summary API:",
                        error
                      );
                    });

                  // Call booking details API if filters are applied
                  if (selectedTeacher || selectedStudent) {
                    fetchListViewBookingDetails().catch((error) => {
                      console.error(
                        "❌ Error calling booking details API:",
                        error
                      );
                    });
                  }
                }}
                className={`px-1 sm:px-2 py-0.5 sm:py-1 rounded text-xs font-medium transition-all duration-200 flex items-center gap-1 ${
                  currentView === "week"
                    ? "bg-blue-500 text-white shadow-sm"
                    : "text-blue-100 hover:text-white"
                }`}
              >
                <FaCalendarWeek size={10} />
                <span className="hidden sm:inline">Week View</span>
                <span className="sm:hidden">Week</span>
              </button>
            </div>

            {/* Date Range Filter - Only show in List View */}
            {currentView === "list" && (
              <div className="flex items-center gap-2 px-2 py-1 bg-blue-600 rounded-lg">
                <FaFilter size={12} className="text-blue-100" />
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    value={
                      dateRangeFilter.startDate || formatDate(weekDates[0])
                    }
                    onChange={(e) => {
                      const newStartDate = e.target.value;
                      if (newStartDate) {
                        const dateObj = new Date(newStartDate);
                        if (isLockedHoliday(dateObj)) {
                          alert(
                            "This date is locked due to holiday. Please select another date."
                          );
                          return;
                        }
                      }
                      setDateRangeFilter((prev) => ({
                        ...prev,
                        startDate: newStartDate,
                      }));
                    }}
                    className="px-2 py-1 text-xs bg-white rounded border-0 focus:outline-none focus:ring-1 focus:ring-blue-300"
                    placeholder="Start Date"
                  />
                  <span className="text-blue-100 text-xs">to</span>
                  <input
                    type="date"
                    value={dateRangeFilter.endDate || formatDate(weekDates[6])}
                    onChange={(e) => {
                      const newEndDate = e.target.value;
                      if (newEndDate) {
                        const dateObj = new Date(newEndDate);
                        if (isLockedHoliday(dateObj)) {
                          alert(
                            "This date is locked due to holiday. Please select another date."
                          );
                          return;
                        }
                      }
                      setDateRangeFilter((prev) => ({
                        ...prev,
                        endDate: newEndDate,
                      }));
                    }}
                    className="px-2 py-1 text-xs bg-white rounded border-0 focus:outline-none focus:ring-1 focus:ring-blue-300"
                    placeholder="End Date"
                  />
                  <button
                    onClick={handleApplyDateFilter}
                    className="ml-1 px-2 py-1 text-xs bg-white hover:bg-blue-50 text-blue-600 rounded transition-colors font-medium"
                    title="Apply filter"
                  >
                    <FaSearch size={12} />
                  </button>
                  {dateRangeFilter.isActive && (
                    <button
                      onClick={() => {
                        const weekDates = getWeekDates(currentWeekStart);
                        setDateRangeFilter({
                          startDate: formatDate(weekDates[0]),
                          endDate: formatDate(weekDates[6]),
                          isActive: false,
                        });
                      }}
                      className="ml-1 p-1 text-blue-100 hover:text-white transition-colors"
                      title="Reset to current week"
                    >
                      <FaTimes size={10} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Navigation Controls - Right Side */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => navigateWeek(-1)}
                className="flex items-center gap-1 px-1 sm:px-2 py-0.5 sm:py-1 bg-blue-500 hover:bg-blue-400 text-white rounded text-xs transition-all duration-200"
              >
                <FaChevronLeft size={10} />
                <span className="hidden sm:inline">Previous</span>
              </button>

              <div className="flex items-center gap-1 text-white">
                <FaCalendarAlt size={10} />
                <span className="text-xs font-medium">
                  <span className="hidden sm:inline">
                    {dateRangeFilter.isActive && filteredWeekDates.length > 0
                      ? `${formatDisplayDate(
                          filteredWeekDates[0]
                        )} - ${formatDisplayDate(
                          filteredWeekDates[filteredWeekDates.length - 1]
                        )}`
                      : `${formatDisplayDate(
                          weekDates[0]
                        )} - ${formatDisplayDate(weekDates[6])}`}
                  </span>
                  <span className="sm:hidden">
                    {dateRangeFilter.isActive && filteredWeekDates.length > 0
                      ? `${formatShortDate(
                          filteredWeekDates[0]
                        )} - ${formatShortDate(
                          filteredWeekDates[filteredWeekDates.length - 1]
                        )}`
                      : `${formatShortDate(weekDates[0])} - ${formatShortDate(
                          weekDates[6]
                        )}`}
                  </span>
                </span>
              </div>

              <button
                onClick={() => navigateWeek(1)}
                className="flex items-center gap-1 px-1 sm:px-2 py-0.5 sm:py-1 bg-blue-500 hover:bg-blue-400 text-white rounded text-xs transition-all duration-200"
              >
                <span className="hidden sm:inline">Next</span>
                <FaChevronRight size={10} />
              </button>

              <button
                onClick={goToCurrentWeek}
                className="px-1 sm:px-2 py-0.5 sm:py-1 bg-blue-500 hover:bg-blue-400 text-white rounded text-xs transition-all duration-200"
              >
                Today
              </button>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 p-1 sm:p-2 overflow-auto bg-white">
          {currentView === "list" && (selectedTeacher || selectedStudent) ? (
            /* List View Content */
            <div className="bg-white rounded-lg shadow-lg p-2 sm:p-3">
              {/* <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">List View</h3> */}

              {/* Filter Status */}
              <div className="mb-3 p-2 bg-blue-50 rounded-lg border border-blue-200">
                {/* <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-blue-800">Active Filters:</h4>
                  <div className="flex gap-2">
                    {(selectedTeacher || selectedStudent) && (
                      <>
                        <button
                          onClick={() => fetchListViewBookingDetails()}
                          disabled={listViewBookingDetails.isLoading}
                          className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                          <FaSearch size={10} />
                          Refresh
                        </button>
                        <button
                          onClick={clearAllFilters}
                          className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                        >
                          Clear All Filters
                        </button>
                      </>
                    )}
                  </div>
                </div> */}
                <div className="flex flex-wrap gap-1 items-center justify-between w-full">
                  <div className="flex flex-wrap gap-1">
                    {selectedTeacher && (
                      <span className="px-1 py-0.5 bg-blue-100 text-blue-800 text-xs rounded">
                        Teacher: {selectedTeacher.full_name}
                      </span>
                    )}
                  </div>
                  {selectedTeacher && canAddLeaves() && (
                    <button
                      onClick={() =>
                        setApplyLeavePopup({
                          isOpen: true,
                          startDate: "",
                          endDate: "",
                          reason: "",
                          isLoading: false,
                          errors: { startDate: "", endDate: "", reason: "" },
                        })
                      }
                      className="px-3 py-1 text-xs bg-orange-100 text-orange-800 rounded hover:bg-orange-200 transition-colors flex items-center gap-1"
                    >
                      <FaCalendarAlt size={10} />
                      Add Leaves
                    </button>
                  )}
                  {selectedStudent && (
                    <div className="w-full bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl shadow-sm p-4">
                      {/* Header */}
                      <div className="flex items-center justify-between mb-4 pb-3 border-b border-green-200">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-green-100 rounded-lg">
                            <svg
                              className="w-5 h-5 text-green-600"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                              />
                            </svg>
                          </div>
                          <div>
                            <h3 className="font-semibold text-green-800 text-sm">
                              Learner Profile
                            </h3>
                            <p className="text-blue-700 text-base font-medium">
                              {selectedStudent.deal_name}
                              {selectedStudent.hubspot_learner_status && (
                                <span className="text-gray-600 ml-2 text-xs font-bold">
                                  Status - (
                                  {selectedStudent.hubspot_learner_status})
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        {/* Add Booking Button */}
                        <button
                          onClick={handleScheduleManagementOpen}
                          className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors duration-200 flex items-center gap-2 shadow-sm hover:shadow-md"
                        >
                          <FaPlus size={14} />
                          Add Booking
                        </button>
                      </div>

                      {/* Stats Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {/* Subscription Start */}
                        <div className="bg-white p-3 shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 bg-blue-100 rounded-md">
                              <svg
                                className="w-4 h-4 text-blue-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                />
                              </svg>
                            </div>
                            <span className="font-medium text-gray-700 text-xs">
                              Current Subscription Start Date
                            </span>
                          </div>
                          <div className="text-blue-600 font-semibold text-sm">
                            {selectedStudent.current_subscription_start_date
                              ? new Date(
                                  selectedStudent.current_subscription_start_date
                                )
                                  .toLocaleDateString("en-GB", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  })
                                  .replace(/ /g, "-")
                              : "N/A"}
                          </div>
                        </div>

                        {/* Subscription End */}
                        <div className="bg-white p-3 shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 bg-orange-100 rounded-md">
                              <svg
                                className="w-4 h-4 text-orange-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                            </div>
                            <span className="font-medium text-gray-700 text-xs">
                              Current Subscription End Date
                            </span>
                          </div>
                          <div className="text-orange-600 font-semibold text-sm">
                            {selectedStudent.current_subscription_end_date
                              ? new Date(
                                  selectedStudent.current_subscription_end_date
                                )
                                  .toLocaleDateString("en-GB", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  })
                                  .replace(/ /g, "-")
                              : "N/A"}
                          </div>
                        </div>

                        {/* Total Classes Offered */}
                        <div className="bg-white p-3 shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 bg-purple-100 rounded-md">
                              <svg
                                className="w-4 h-4 text-purple-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                                />
                              </svg>
                            </div>
                            <span className="font-medium text-gray-700 text-xs">
                              Current Subscription Total Classes
                            </span>
                          </div>
                          <div className="text-purple-600 font-semibold text-sm">
                            {selectedStudent.current_subscription_total_classes_offered ||
                              "N/A"}
                          </div>
                        </div>

                        {/* Classes Taken */}
                        <div className="bg-white p-3 shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 bg-green-100 rounded-md">
                              <svg
                                className="w-4 h-4 text-green-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                            </div>
                            <span className="font-medium text-gray-700 text-xs">
                              Current Subscription Classes Taken
                            </span>
                          </div>
                          <div className="text-green-600 font-semibold text-sm">
                            {selectedStudent.taken_classes_sub ||
                              selectedStudent.taken_classes_till_date ||
                              "N/A"}
                          </div>
                        </div>
                      </div>

                      {/* Calendar Statistics Section */}
                      {selectedStudent && (
                        <div className="mt-4 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl shadow-sm p-4">
                          <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                            <FaCalendarAlt
                              size={14}
                              className="text-blue-600"
                            />
                            Calendar Statistics
                          </h4>

                          {learnerCalendarStatsLoading && (
                            <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                              <span>Loading calendar stats...</span>
                            </div>
                          )}

                          {learnerCalendarStatsError && (
                            <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">
                              Error loading stats: {learnerCalendarStatsError}
                            </div>
                          )}

                          {!learnerCalendarStatsLoading &&
                            !learnerCalendarStatsError &&
                            learnerCalendarStats && (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                {/* Start Date on Calendar */}
                                {learnerCalendarStats.min_start_time && (
                                  <div className="bg-white p-3 shadow-sm hover:shadow-md transition-shadow rounded">
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="p-1.5 bg-blue-100 rounded-md">
                                        <svg
                                          className="w-4 h-4 text-blue-600"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                          />
                                        </svg>
                                      </div>
                                      <span className="font-medium text-gray-700 text-xs">
                                        Start Date on Calendar
                                      </span>
                                    </div>
                                    <div className="text-blue-600 font-semibold text-sm">
                                      {new Date(
                                        learnerCalendarStats.min_start_time
                                      ).toLocaleDateString("en-GB", {
                                        day: "2-digit",
                                        month: "short",
                                        year: "numeric",
                                      })}
                                    </div>
                                  </div>
                                )}

                                {/* End Date on Calendar */}
                                {learnerCalendarStats.max_start_time && (
                                  <div className="bg-white p-3 shadow-sm hover:shadow-md transition-shadow rounded">
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="p-1.5 bg-orange-100 rounded-md">
                                        <svg
                                          className="w-4 h-4 text-orange-600"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                          />
                                        </svg>
                                      </div>
                                      <span className="font-medium text-gray-700 text-xs">
                                        End Date on Calendar
                                      </span>
                                    </div>
                                    <div className="text-orange-600 font-semibold text-sm">
                                      {new Date(
                                        learnerCalendarStats.max_start_time
                                      ).toLocaleDateString("en-GB", {
                                        day: "2-digit",
                                        month: "short",
                                        year: "numeric",
                                      })}
                                    </div>
                                  </div>
                                )}

                                {/* Total Booked events */}
                                {learnerCalendarStats.total_classes_booked !==
                                  undefined &&
                                  learnerCalendarStats.total_classes_booked !==
                                    null && (
                                    <div className="bg-white p-3 shadow-sm hover:shadow-md transition-shadow rounded">
                                      <div className="flex items-center gap-2 mb-2">
                                        <div className="p-1.5 bg-purple-100 rounded-md">
                                          <svg
                                            className="w-4 h-4 text-purple-600"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              strokeWidth={2}
                                              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                                            />
                                          </svg>
                                        </div>
                                        <span className="font-medium text-gray-700 text-xs">
                                          Total Paid Events
                                        </span>
                                      </div>
                                      <div className="text-purple-600 font-semibold text-sm">
                                        {
                                          learnerCalendarStats.total_classes_booked
                                        }
                                      </div>
                                    </div>
                                  )}

                                {/* Total Classes aligned from Today */}
                                {learnerCalendarStats.total_classes_from_today !==
                                  undefined &&
                                  learnerCalendarStats.total_classes_from_today !==
                                    null && (
                                    <div className="bg-white p-3 shadow-sm hover:shadow-md transition-shadow rounded">
                                      <div className="flex items-center gap-2 mb-2">
                                        <div className="p-1.5 bg-green-100 rounded-md">
                                          <svg
                                            className="w-4 h-4 text-green-600"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              strokeWidth={2}
                                              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                            />
                                          </svg>
                                        </div>
                                        <span className="font-medium text-gray-700 text-xs">
                                          Total Classes Aligned From Today
                                        </span>
                                      </div>
                                      <div className="text-green-600 font-semibold text-sm">
                                        {
                                          learnerCalendarStats.total_classes_from_today
                                        }
                                      </div>
                                    </div>
                                  )}
                              </div>
                            )}

                          {!learnerCalendarStatsLoading &&
                            !learnerCalendarStatsError &&
                            !learnerCalendarStats && (
                              <div className="text-xs text-gray-400 py-2">
                                No calendar statistics available
                              </div>
                            )}
                        </div>
                      )}
                    </div>
                  )}
                  {!selectedTeacher && !selectedStudent && (
                    <span className="px-1 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                      No filters applied - showing all data
                    </span>
                  )}
                </div>
                {listViewBookingDetails.isLoading && (
                  <div className="mt-2 flex items-center gap-2 text-blue-600">
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
                    <span className="text-xs">Loading booking details...</span>
                  </div>
                )}
              </div>

              {/* List View Data */}
              <div className="space-y-2">
                {listViewBookingDetails.isLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading booking details...</p>
                  </div>
                ) : listViewBookingDetails.error ? (
                  <div className="text-center py-8 text-red-500">
                    <FaExclamationTriangle size={32} className="mx-auto mb-4" />
                    <p className="text-sm sm:text-base">
                      Error loading booking details
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      {listViewBookingDetails.error}
                    </p>
                  </div>
                ) : listViewBookingDetails.success &&
                  listViewBookingDetails.data ? (
                  <div className="space-y-4">
                    {/* Booking Details List */}
                    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-blue-50 px-2 py-2 border-b border-gray-200">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-semibold text-blue-800 flex items-center gap-2">
                              <FaCalendarAlt size={16} />
                              Details of the Availability and Bookings
                            </h4>
                            <p className="text-sm text-blue-600 mt-1">
                              Showing all bookings for Next 3 Month
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-blue-800">
                              Total Events :{" "}
                              {
                                parseBookingDetails(listViewBookingDetails.data)
                                  .length
                              }
                            </div>
                            <div className="text-xs font-bold text-blue-600">
                              {(() => {
                                const parsedBookings = parseBookingDetails(
                                  listViewBookingDetails.data
                                );
                                // Count availability and jetlearn bookings
                                const availabilityCount = parsedBookings.filter(
                                  (booking) =>
                                    booking.summary &&
                                    booking.summary
                                      .toLowerCase()
                                      .includes("availability hour")
                                ).length;

                                const bookingCount = parsedBookings.filter(
                                  (booking) =>
                                    booking.summary &&
                                    booking.summary
                                      .toLowerCase()
                                      .includes("jetlearn")
                                ).length;
                                return ` (Availability ${availabilityCount}, Bookinhgs ${bookingCount})`;
                              })()}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              Timezone: {selectedTimezone}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Table Header */}
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Date
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Time
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                IST Time
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Summary
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Teacher Name
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {(() => {
                              const parsedBookings = parseBookingDetails(
                                listViewBookingDetails.data
                              );

                              if (parsedBookings.length === 0) {
                                return (
                                  <tr>
                                    <td
                                      colSpan="6"
                                      className="px-6 py-8 text-center text-gray-500"
                                    >
                                      <FaCalendarAlt
                                        size={24}
                                        className="mx-auto mb-2 text-gray-300"
                                      />
                                      <p className="text-sm">
                                        No booking details found for the
                                        selected filters
                                      </p>
                                    </td>
                                  </tr>
                                );
                              }

                              // Apply pagination to the parsed bookings
                              const paginatedBookings = getPaginatedData(
                                parsedBookings,
                                pagination.currentPage,
                                pagination.itemsPerPage
                              );

                              return paginatedBookings.map((booking, index) => {
                                const extractedData = extractEventFields(
                                  booking,
                                  "booking"
                                );

                                // Extract date directly from start_time string before timezone conversion
                                // This ensures we check the actual calendar date, not a timezone-shifted date
                                // Extract date for locked holiday check - try multiple sources
                                let bookingDateForCheck = null;

                                // Try extractedData.start_time first
                                if (extractedData.start_time) {
                                  const dateStr = String(
                                    extractedData.start_time
                                  );
                                  // Extract YYYY-MM-DD from ISO datetime string (e.g., "2025-12-24T20:00:00+01:00")
                                  const dateMatch =
                                    dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
                                  if (dateMatch) {
                                    bookingDateForCheck = dateMatch[1]; // "2025-12-24"
                                  }
                                }

                                // Fallback to booking.start_time
                                if (
                                  !bookingDateForCheck &&
                                  booking.start_time
                                ) {
                                  const dateStr = String(booking.start_time);
                                  const dateMatch =
                                    dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
                                  if (dateMatch) {
                                    bookingDateForCheck = dateMatch[1];
                                  }
                                }

                                // Fallback to booking.date
                                if (!bookingDateForCheck && booking.date) {
                                  const dateStr = String(booking.date);
                                  const dateMatch =
                                    dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
                                  if (dateMatch) {
                                    bookingDateForCheck = dateMatch[1];
                                  }
                                }

                                // Final fallback: use formatDate on bookingDate
                                if (!bookingDateForCheck && bookingDate) {
                                  bookingDateForCheck = formatDate(bookingDate);
                                }

                                // Debug: Log when we detect a locked holiday
                                if (bookingDateForCheck) {
                                  const isLocked =
                                    isLockedHoliday(bookingDateForCheck);
                                  if (isLocked) {
                                    console.log("🔒 Locked holiday detected:", {
                                      date: bookingDateForCheck,
                                      start_time: extractedData.start_time,
                                      booking_start_time: booking.start_time,
                                      booking_date: booking.date,
                                      summary: extractedData.summary,
                                    });
                                  }
                                }

                                // Convert start_time to selected timezone to get correct date for display
                                const dateInTimezone =
                                  convertDateTimeToTimezone(
                                    extractedData.start_time,
                                    selectedTimezone
                                  );

                                const bookingDate =
                                  dateInTimezone ||
                                  new Date(booking.date || booking.start_time);

                                // Format time range properly with timezone consideration
                                const formatTimeFromAPI = (dateTimeString) => {
                                  if (!dateTimeString) return "N/A";
                                  try {
                                    console.log(
                                      "dateTimeString in formatTimeFromAPI",
                                      dateTimeString
                                    );
                                    const formattedTime = dateTimeString.slice(
                                      11,
                                      16
                                    ); // "04:00"
                                    console.log(
                                      "formattedTime in formatTimeFromAPI",
                                      formattedTime
                                    );
                                    return formattedTime;
                                  } catch (error) {
                                    console.error(
                                      "Error formatting time:",
                                      error
                                    );
                                    return "N/A";
                                  }
                                };

                                // Try multiple ways to get the time
                                let timeRange = "N/A";
                                // Priority 2: Calculate time range from start_time and end_time
                                const startTime = formatTimeFromAPI(
                                  extractedData.start_time
                                );
                                const endTime = formatTimeFromAPI(
                                  extractedData.end_time
                                );
                                timeRange = `${startTime} - ${endTime}`;

                                // Check if teacher is on leave for this date
                                const teacherEmail = getTeacherEmailFromEvent(
                                  extractedData,
                                  selectedTeacher,
                                  teachers
                                );
                                const teacherOnLeave =
                                  teacherEmail &&
                                  isTeacherOnLeave(
                                    teacherEmail,
                                    bookingDate,
                                    teacherLeaves
                                  );

                                // Debug logging (can be removed in production)

                                // Check if summary contains "Migration" or "Future slot"
                                const hasMigrationOrFutureSlot =
                                  extractedData.summary &&
                                  (extractedData.summary
                                    .toLowerCase()
                                    .includes("migration") ||
                                    extractedData.summary
                                      .toLowerCase()
                                      .includes("future slot"));

                                return (
                                  <tr
                                    key={index}
                                    className={`hover:bg-gray-50 transition-colors ${
                                      hasMigrationOrFutureSlot
                                        ? "bg-blue-100"
                                        : teacherOnLeave
                                        ? "bg-orange-50"
                                        : ""
                                    }`}
                                  >
                                    <td className="px-6 py-4 whitespace-nowrap">
                                      <div className="flex items-center">
                                        {/* Leave Tag - Show on all events when teacher is on leave */}
                                        {teacherOnLeave && (
                                          <div className="mr-2">
                                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200">
                                              <span className="w-2 h-2 bg-orange-500 rounded-full mr-1"></span>
                                              Leave
                                            </span>
                                          </div>
                                        )}
                                        <div
                                          className={`w-3 h-3 rounded-full mr-3 ${
                                            // Check for locked holiday first - override all other colors
                                            bookingDateForCheck &&
                                            isLockedHoliday(bookingDateForCheck)
                                              ? "bg-gray-700"
                                              : extractedData.summary &&
                                                (extractedData.summary
                                                  .toLowerCase()
                                                  .includes("availability") ||
                                                  extractedData.summary
                                                    .toLowerCase()
                                                    .includes("hours"))
                                              ? "bg-green-500"
                                              : extractedData.summary &&
                                                (extractedData.summary
                                                  .toLowerCase()
                                                  .includes("leave") ||
                                                  extractedData.summary
                                                    .toLowerCase()
                                                    .includes("training") ||
                                                  extractedData.summary
                                                    .toLowerCase()
                                                    .includes("week off") ||
                                                  extractedData.summary
                                                    .toLowerCase()
                                                    .includes("jloh") ||
                                                  extractedData.summary
                                                    .toLowerCase()
                                                    .includes(
                                                      "non available hour"
                                                    ) ||
                                                  extractedData.summary
                                                    .toLowerCase()
                                                    .includes("off"))
                                              ? "bg-yellow-500"
                                              : extractedData.summary &&
                                                (extractedData.summary.includes(
                                                  "B&R"
                                                ) ||
                                                  extractedData.summary.includes(
                                                    "CBT/PL"
                                                  ) ||
                                                  extractedData.summary.includes(
                                                    "CBT/UL"
                                                  ) ||
                                                  extractedData.summary.includes(
                                                    "CBP/PL"
                                                  ) ||
                                                  extractedData.summary.includes(
                                                    "CBP/UL"
                                                  ) ||
                                                  extractedData.summary.includes(
                                                    "CBO"
                                                  ) ||
                                                  extractedData.summary.includes(
                                                    "NO SHOW - LR"
                                                  ) ||
                                                  extractedData.summary.includes(
                                                    "NO SHOW - TR"
                                                  ))
                                              ? "bg-black"
                                              : "bg-red-500"
                                          }`}
                                        ></div>
                                        <div className="flex-1">
                                          <div className="text-sm font-medium text-gray-900">
                                            {formatDisplayDate(dateInTimezone)}
                                          </div>
                                          <div className="text-sm text-gray-500">
                                            {getDayName(dateInTimezone)}
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                      <div>
                                        <div className="text-sm text-gray-900">
                                          {timeRange !== "N/A" ? (
                                            timeRange
                                          ) : (
                                            <span className="text-red-500">
                                              {timeRange}
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                          {selectedTimezone}
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                      <div>
                                        <div className="text-sm text-gray-900">
                                          {timeRange !== "N/A" ? (
                                            convertTimeRangeToIST(
                                              timeRange,
                                              bookingDate,
                                              selectedTimezone
                                            )
                                          ) : (
                                            <span className="text-red-500">
                                              {timeRange}
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                          IST
                                        </div>
                                        <div className="text-xs text-gray-500">
                                          Bookeed Timezone :{" "}
                                          {extractedData.timezone}
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-6 py-4">
                                      <div className="flex items-center justify-between">
                                        <div className="text-sm text-gray-900 break-words">
                                          {extractedData.summary || "N/A"}
                                          {(extractedData.summary?.includes(
                                            "Reserved"
                                          ) ||
                                            extractedData.summary?.includes(
                                              "Future"
                                            )) &&
                                            extractedData.updated_by && (
                                              <div className="text-xs text-gray-600 mt-1">
                                                Updated by:{" "}
                                                {extractedData.updated_by}
                                              </div>
                                            )}
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-6 py-4">
                                      <div className="flex items-center justify-between">
                                        {(() => {
                                          // Extract TJ (Teacher/Job) code from summary
                                          const tlMatch =
                                            extractedData.summary?.match(
                                              /\bTJ[A-Za-z0-9]+\b/
                                            );
                                          console.log(
                                            "🔍 Teacher UID:",
                                            tlMatch
                                          );
                                          if (tlMatch) {
                                            const teacherUid = tlMatch[0];

                                            // Find teacher in teachers array
                                            const teacher = teachers.find(
                                              (t) => t.uid === teacherUid
                                            );
                                            if (teacher) {
                                              return (
                                                console.log(
                                                  "🔍 Teacher:",
                                                  teacher
                                                ),
                                                (
                                                  <div>
                                                    <div
                                                      className={`text-xs text-gray-500 ${
                                                        extractedData.jet_guide
                                                          ? "font-bold"
                                                          : ""
                                                      }`}
                                                    >
                                                      {extractedData.jet_guide
                                                        ? `Jet Guide -> ${extractedData.jet_guide}`
                                                        : teacher.full_name ||
                                                          selectedTeacher?.full_name}
                                                    </div>
                                                    {extractedData.jet_guide && (
                                                      <div className="text-xs text-gray-500 mt-1">
                                                        {teacher.full_name ||
                                                          selectedTeacher?.full_name}
                                                      </div>
                                                    )}
                                                    <div className="text-xs text-gray-500">
                                                      {teacher.email ||
                                                        selectedTeacher?.email}
                                                    </div>
                                                  </div>
                                                )
                                              );
                                            }
                                            return (
                                              <div>
                                                {extractedData.jet_guide && (
                                                  <div className="text-xs text-gray-500 font-bold">
                                                    Jet Guide {"->"}{" "}
                                                    {extractedData.jet_guide}
                                                  </div>
                                                )}
                                                <span className="text-gray-500">
                                                  {teacherUid}
                                                </span>
                                              </div>
                                            );
                                          }
                                          return (
                                            <span className="text-gray-400">
                                              <div>
                                                <div
                                                  className={`text-xs text-gray-500 ${
                                                    extractedData.jet_guide
                                                      ? "font-bold"
                                                      : ""
                                                  }`}
                                                >
                                                  {extractedData.jet_guide
                                                    ? `Jet Guide -> ${extractedData.jet_guide}`
                                                    : selectedTeacher?.full_name}
                                                </div>
                                                {extractedData.jet_guide && (
                                                  <div className="text-xs text-gray-500 mt-1">
                                                    {selectedTeacher?.full_name}
                                                  </div>
                                                )}
                                                <div className="text-xs text-gray-500">
                                                  {selectedTeacher?.email}
                                                </div>
                                              </div>
                                            </span>
                                          );
                                        })()}
                                      </div>
                                    </td>
                                    <td className="px-6 py-4">
                                      <div className="flex items-center justify-between">
                                        {/* Action Menu Dropdown */}
                                        <div className="relative ml-3">
                                          {/* Check if date is a locked holiday - Apply to ALL events on locked dates */}
                                          {(() => {
                                            const isLocked =
                                              bookingDateForCheck &&
                                              isLockedHoliday(
                                                bookingDateForCheck
                                              );

                                            // If locked, only show the locked holiday message and return early
                                            if (isLocked) {
                                              return (
                                                <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-500 text-xs rounded border border-gray-200">
                                                  <span className="w-2 h-2 bg-gray-700 rounded-full mr-1"></span>
                                                  (Locked - Holiday)
                                                </div>
                                              );
                                            }

                                            return (
                                              <>
                                                {/* Disabled Actions Message for Availability Hours on Leave */}
                                                {teacherOnLeave &&
                                                  extractedData.summary &&
                                                  (extractedData.summary
                                                    .toLowerCase()
                                                    .includes("availability") ||
                                                    extractedData.summary
                                                      .toLowerCase()
                                                      .includes("hours")) && (
                                                    <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-500 text-xs rounded border border-gray-200">
                                                      <span className="w-2 h-2 bg-orange-500 rounded-full mr-1"></span>
                                                      (Leave)
                                                    </div>
                                                  )}
                                                {/* Availability Actions (Green Dot) */}
                                                {extractedData.summary &&
                                                  (extractedData.summary
                                                    .toLowerCase()
                                                    .includes("availability") ||
                                                    extractedData.summary
                                                      .toLowerCase()
                                                      .includes("hours")) &&
                                                  !(
                                                    extractedData.summary
                                                      .toLowerCase()
                                                      .includes("week off") ||
                                                    extractedData.summary
                                                      .toLowerCase()
                                                      .includes("off")
                                                  ) &&
                                                  !teacherOnLeave &&
                                                  canAddBooking() && (
                                                    <div className="relative">
                                                      <button
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          // Toggle dropdown for this specific row
                                                          setActionMenuOpen(
                                                            actionMenuOpen ===
                                                              index
                                                              ? null
                                                              : index
                                                          );
                                                        }}
                                                        className="flex items-center gap-1 px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs rounded transition-all duration-200 hover:shadow-sm cursor-pointer"
                                                        title="Manage Actions"
                                                      >
                                                        <MdManageAccounts
                                                          size={8}
                                                          className="sm:w-3 sm:h-3"
                                                        />
                                                        <span className="hidden sm:inline">
                                                          Manage
                                                        </span>
                                                        <FaChevronDown
                                                          size={8}
                                                          className="sm:w-3 sm:h-3"
                                                        />
                                                      </button>

                                                      {actionMenuOpen ===
                                                        index && (
                                                        <div
                                                          className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50"
                                                          data-dropdown-menu
                                                        >
                                                          <div className="py-1">
                                                            <button
                                                              onClick={async () => {
                                                                try {
                                                                  // Check if date is a locked holiday
                                                                  // Use the bookingDateForCheck already defined above (extracted from start_time)
                                                                  if (
                                                                    bookingDateForCheck &&
                                                                    isLockedHoliday(
                                                                      bookingDateForCheck
                                                                    )
                                                                  ) {
                                                                    alert(
                                                                      "This date is locked due to holiday. No actions can be performed on this date."
                                                                    );
                                                                    setActionMenuOpen(
                                                                      null
                                                                    );
                                                                    return;
                                                                  }
                                                                  // First, execute the original functionality - Open UnifiedModal
                                                                  let timeSlot =
                                                                    timeRange;
                                                                  const slotData =
                                                                    getSlotCounts(
                                                                      bookingDate,
                                                                      timeSlot
                                                                    );
                                                                  setSelectedSlot(
                                                                    {
                                                                      date: bookingDate,
                                                                      time: timeSlot,
                                                                      teacherid:
                                                                        slotData.teacherid ||
                                                                        extractedData.teacherid ||
                                                                        null,
                                                                      teacherDetails:
                                                                        slotData.teacherDetails,
                                                                      isFromAPI:
                                                                        slotData.isFromAPI ||
                                                                        true,
                                                                    }
                                                                  );
                                                                  setModalOpen(
                                                                    true
                                                                  );

                                                                  // Then, execute the new functionality - Freeze slot API call
                                                                  // Get teacher UID from selected teacher
                                                                  const teacherUid =
                                                                    selectedTeacher?.uid;

                                                                  if (
                                                                    !teacherUid
                                                                  ) {
                                                                    console.warn(
                                                                      "Teacher UID not found for freeze slot API"
                                                                    );
                                                                    // Don't return here, still allow modal to open
                                                                  } else {
                                                                    // Format datetime to UTC
                                                                    const slotDateTime =
                                                                      formatDateTimeToUTC(
                                                                        bookingDate,
                                                                        timeRange,
                                                                        selectedTimezone
                                                                      );

                                                                    if (
                                                                      !slotDateTime
                                                                    ) {
                                                                      console.warn(
                                                                        "Error formatting slot datetime for freeze slot API"
                                                                      );
                                                                    } else {
                                                                      // Get user info from auth context
                                                                      const userId =
                                                                        user?.username ||
                                                                        user?.id;
                                                                      const sessionId =
                                                                        user?.sessionId;

                                                                      if (
                                                                        !userId ||
                                                                        !sessionId
                                                                      ) {
                                                                        console.warn(
                                                                          "User authentication information not found for freeze slot API"
                                                                        );
                                                                      } else {
                                                                        // Call freeze slot API in background
                                                                        try {
                                                                          const result =
                                                                            await freezeSlot(
                                                                              teacherUid,
                                                                              slotDateTime,
                                                                              userId,
                                                                              sessionId
                                                                            );

                                                                          if (
                                                                            result.success
                                                                          ) {
                                                                            console.log(
                                                                              "Slot frozen successfully:",
                                                                              result.data
                                                                            );
                                                                            // Optional: Show a subtle success notification
                                                                          } else if (
                                                                            result.held
                                                                          ) {
                                                                            // Slot is held by another user - close modal and show error
                                                                            console.warn(
                                                                              "Slot is held:",
                                                                              result.message
                                                                            );
                                                                            setModalOpen(
                                                                              false
                                                                            );
                                                                            alert(
                                                                              result.message
                                                                            );
                                                                          } else {
                                                                            console.error(
                                                                              "Failed to freeze slot:",
                                                                              result.error
                                                                            );
                                                                          }
                                                                        } catch (apiError) {
                                                                          console.error(
                                                                            "Error calling freeze slot API:",
                                                                            apiError
                                                                          );
                                                                        }
                                                                      }
                                                                    }
                                                                  }
                                                                } catch (error) {
                                                                  console.error(
                                                                    "Error in manage booking:",
                                                                    error
                                                                  );
                                                                } finally {
                                                                  setActionMenuOpen(
                                                                    null
                                                                  );
                                                                }
                                                              }}
                                                              className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 flex items-center gap-2"
                                                            >
                                                              <FaUsers
                                                                size={10}
                                                              />
                                                              Manage Booking
                                                            </button>
                                                            {/* Delete Availability Button */}
                                                            {canDeleteTeacherAvailability() && (
                                                              <button
                                                                onClick={async () => {
                                                                  try {
                                                                    // Check if date is a locked holiday
                                                                    if (
                                                                      bookingDateForCheck &&
                                                                      isLockedHoliday(
                                                                        bookingDateForCheck
                                                                      )
                                                                    ) {
                                                                      alert(
                                                                        "This date is locked due to holiday. No actions can be performed on this date."
                                                                      );
                                                                      setActionMenuOpen(
                                                                        null
                                                                      );
                                                                      return;
                                                                    }

                                                                    // Get teacher information
                                                                    const tlMatch =
                                                                      extractedData.summary?.match(
                                                                        /\bTJ[A-Za-z0-9]+\b/
                                                                      );
                                                                    const teacherUid =
                                                                      tlMatch
                                                                        ? tlMatch[0]
                                                                        : extractedData.teacherid ||
                                                                          selectedTeacher?.uid;

                                                                    // Find teacher in teachers array
                                                                    const teacher =
                                                                      teachers.find(
                                                                        (t) =>
                                                                          t.uid ===
                                                                          teacherUid
                                                                      ) ||
                                                                      selectedTeacher;

                                                                    if (
                                                                      !teacher ||
                                                                      !teacher.email
                                                                    ) {
                                                                      alert(
                                                                        "Teacher email not found. Cannot delete availability."
                                                                      );
                                                                      setActionMenuOpen(
                                                                        null
                                                                      );
                                                                      return;
                                                                    }

                                                                    if (
                                                                      !extractedData.event_id
                                                                    ) {
                                                                      alert(
                                                                        "Event ID not found. Cannot delete availability."
                                                                      );
                                                                      setActionMenuOpen(
                                                                        null
                                                                      );
                                                                      return;
                                                                    }

                                                                    // Confirm deletion
                                                                    const confirmed =
                                                                      window.confirm(
                                                                        `Are you sure you want to delete this availability for ${teacher.full_name}?`
                                                                      );

                                                                    if (!confirmed) {
                                                                      setActionMenuOpen(
                                                                        null
                                                                      );
                                                                      return;
                                                                    }

                                                                    // Call reject-availability API
                                                                    const updatedBy =
                                                                      user?.email ||
                                                                      user?.fullUser?.email ||
                                                                      user?.username ||
                                                                      "";
                                                                    const result =
                                                                      await rejectAvailability(
                                                                        teacher.email,
                                                                        teacherUid,
                                                                        extractedData.event_id,
                                                                        updatedBy
                                                                      );

                                                                    if (
                                                                      result.success
                                                                    ) {
                                                                      console.log(
                                                                        "✅ Availability rejected successfully:",
                                                                        result.data
                                                                      );
                                                                      // Show success message
                                                                      setSuccessMessage(
                                                                        {
                                                                          show: true,
                                                                          message:
                                                                            "Availability deleted successfully!",
                                                                          type: "availability",
                                                                        }
                                                                      );
                                                                      // Refresh booking details
                                                                      await fetchListViewBookingDetails();
                                                                    } else {
                                                                      alert(
                                                                        `Failed to delete availability: ${result.error}`
                                                                      );
                                                                    }
                                                                  } catch (error) {
                                                                    console.error(
                                                                      "Error deleting availability:",
                                                                      error
                                                                    );
                                                                    alert(
                                                                      "Failed to delete availability. Please try again."
                                                                    );
                                                                  } finally {
                                                                    setActionMenuOpen(
                                                                      null
                                                                    );
                                                                  }
                                                                }}
                                                                className="w-full text-left px-3 py-2 text-xs hover:bg-red-50 flex items-center gap-2 text-red-600"
                                                              >
                                                                <FaTrash
                                                                  size={10}
                                                                />
                                                                Delete
                                                                Availability
                                                              </button>
                                                            )}
                                                          </div>
                                                        </div>
                                                      )}
                                                    </div>
                                                  )}
                                              </>
                                            );
                                          })()}

                                          {/* Booking Actions (Red Dot) - Hide if locked holiday */}
                                          {(() => {
                                            const isLocked =
                                              bookingDateForCheck &&
                                              isLockedHoliday(
                                                bookingDateForCheck
                                              );

                                            if (isLocked) {
                                              return null;
                                            }

                                            if (
                                              extractedData.summary &&
                                              !(
                                                extractedData.summary
                                                  .toLowerCase()
                                                  .includes("availability") ||
                                                extractedData.summary
                                                  .toLowerCase()
                                                  .includes("hours")
                                              ) &&
                                              !(
                                                extractedData.summary
                                                  .toLowerCase()
                                                  .includes("leave") ||
                                                extractedData.summary
                                                  .toLowerCase()
                                                  .includes("training") ||
                                                extractedData.summary
                                                  .toLowerCase()
                                                  .includes("week off") ||
                                                extractedData.summary
                                                  .toLowerCase()
                                                  .includes("jloh") ||
                                                extractedData.summary
                                                  .toLowerCase()
                                                  .includes(
                                                    "non available hour"
                                                  ) ||
                                                extractedData.summary
                                                  .toLowerCase()
                                                  .includes("off")
                                              ) &&
                                              !(
                                                extractedData.summary.includes(
                                                  "B&R"
                                                ) ||
                                                extractedData.summary.includes(
                                                  "CBT/PL"
                                                ) ||
                                                extractedData.summary.includes(
                                                  "CBT/UL"
                                                ) ||
                                                extractedData.summary.includes(
                                                  "CBP/PL"
                                                ) ||
                                                extractedData.summary.includes(
                                                  "CBP/UL"
                                                ) ||
                                                extractedData.summary.includes(
                                                  "CBO"
                                                ) ||
                                                extractedData.summary.includes(
                                                  "NO SHOW - LR"
                                                ) ||
                                                extractedData.summary.includes(
                                                  "NO SHOW - TR"
                                                )
                                              ) &&
                                              canEditDeleteBooking()
                                            ) {
                                              return (
                                                <div className="relative">
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setActionMenuOpen(
                                                        actionMenuOpen === index
                                                          ? null
                                                          : index
                                                      );
                                                    }}
                                                    className="flex items-center gap-1 px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-xs rounded transition-all duration-200 hover:shadow-sm cursor-pointer"
                                                    title="Manage Actions"
                                                  >
                                                    <MdManageAccounts
                                                      size={8}
                                                      className="sm:w-3 sm:h-3"
                                                    />
                                                    <span className="hidden sm:inline">
                                                      Manage
                                                    </span>
                                                    <FaChevronDown
                                                      size={8}
                                                      className="sm:w-3 sm:h-3"
                                                    />
                                                  </button>

                                                  {actionMenuOpen === index && (
                                                    <div
                                                      className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50"
                                                      data-dropdown-menu
                                                    >
                                                      <div className="py-1">
                                                        <button
                                                          onClick={() => {
                                                            // Check if date is a locked holiday
                                                            if (
                                                              bookingDateForCheck &&
                                                              isLockedHoliday(
                                                                bookingDateForCheck
                                                              )
                                                            ) {
                                                              alert(
                                                                "This date is locked due to holiday. No actions can be performed on this date."
                                                              );
                                                              setActionMenuOpen(
                                                                null
                                                              );
                                                              return;
                                                            }

                                                            // Extract time from the booking data
                                                            let timeSlot =
                                                              "00:00";
                                                            if (
                                                              extractedData.summary
                                                            ) {
                                                              const timeMatch =
                                                                extractedData.summary.match(
                                                                  /(\d{1,2}:\d{2})/
                                                                );
                                                              if (timeMatch) {
                                                                timeSlot =
                                                                  timeMatch[1];
                                                              }
                                                            }
                                                            if (
                                                              timeSlot ===
                                                                "00:00" &&
                                                              extractedData.start_time
                                                            ) {
                                                              const timeFromStart =
                                                                extractedData.start_time.match(
                                                                  /(\d{2}:\d{2})/
                                                                );
                                                              if (
                                                                timeFromStart
                                                              ) {
                                                                timeSlot =
                                                                  timeFromStart[1];
                                                              }
                                                            }
                                                            if (
                                                              timeSlot ===
                                                              "00:00"
                                                            ) {
                                                              timeSlot =
                                                                "09:00";
                                                            }

                                                            setCancelPopup({
                                                              isOpen: true,
                                                              type: "booking",
                                                              data: extractedData,
                                                              date: bookingDate,
                                                              time: timeSlot,
                                                              reason: "",
                                                              studentDetails: {
                                                                learner_name:
                                                                  extractedData.learner_name,
                                                                jlid: extractedData.jlid,
                                                                name: extractedData.learner_name,
                                                                jetlearner_id:
                                                                  extractedData.jlid,
                                                              },
                                                              teacherDetails:
                                                                getTeacherByTeacherId(
                                                                  extractedData.teacherid
                                                                ) ||
                                                                selectedTeacher,
                                                              upcomingEvents: false,
                                                              classCount: 1,
                                                              isLoading: false,
                                                            });
                                                            setActionMenuOpen(
                                                              null
                                                            );
                                                          }}
                                                          className="w-full text-left px-3 py-2 text-xs hover:bg-red-50 text-red-600 flex items-center gap-2"
                                                        >
                                                          <FaTimes size={10} />
                                                          Cancel/No Show
                                                        </button>
                                                        <button
                                                          onClick={() => {
                                                            // Process booking data for edit popup
                                                            const processedData =
                                                              processBookingDataForEdit(
                                                                extractedData,
                                                                bookingDate,
                                                                timeRange
                                                              );

                                                            console.log(
                                                              "📝 Edit button clicked - Processed data:",
                                                              processedData
                                                            );

                                                            // Open Edit/Reschedule popup with processed data
                                                            setEditReschedulePopup(
                                                              {
                                                                isOpen: true,
                                                                data: processedData,
                                                                date: bookingDate,
                                                                time: timeRange,
                                                                isLoading: false,
                                                              }
                                                            );
                                                            setActionMenuOpen(
                                                              null
                                                            );
                                                          }}
                                                          className="w-full text-left px-3 py-2 text-xs hover:bg-yellow-50 text-yellow-600 flex items-center gap-2"
                                                        >
                                                          <FaCalendarAlt
                                                            size={10}
                                                          />
                                                          Edit/Reschedule
                                                          Booking
                                                        </button>
                                                        <button
                                                          onClick={() => {
                                                            // Show confirmation popup for delete booking
                                                            setConfirmationPopup(
                                                              {
                                                                isOpen: true,
                                                                type: "delete-booking",
                                                                title:
                                                                  "Confirm Delete",
                                                                message:
                                                                  "Are you sure you want to delete the booking?",
                                                                data: extractedData,
                                                                date: bookingDate,
                                                                time: timeRange,
                                                                eventId:
                                                                  extractedData.event_id ||
                                                                  null,
                                                                upcomingEvents: false,
                                                                onConfirm:
                                                                  async (
                                                                    upcomingEvents
                                                                  ) => {
                                                                    try {
                                                                      // Call delete-class API
                                                                      console.log(
                                                                        "🚀 Calling delete-class API for booking deletion"
                                                                      );
                                                                      console.log(
                                                                        "📊 Event ID:",
                                                                        extractedData.event_id
                                                                      );
                                                                      console.log(
                                                                        "📊 Upcoming events:",
                                                                        upcomingEvents
                                                                      );

                                                                      if (
                                                                        !extractedData.event_id
                                                                      ) {
                                                                        throw new Error(
                                                                          "No event_id available for deletion"
                                                                        );
                                                                      }

                                                                      const deleteResult =
                                                                        await handleDeleteClass(
                                                                          extractedData.event_id,
                                                                          upcomingEvents ||
                                                                            false
                                                                        );

                                                                      if (
                                                                        deleteResult ==
                                                                        "success"
                                                                      ) {
                                                                        // Close the action menu
                                                                        setActionMenuOpen(
                                                                          null
                                                                        );

                                                                        // Show success message
                                                                        setSuccessMessage(
                                                                          {
                                                                            show: true,
                                                                            message:
                                                                              "Booking Successfully Deleted !!",
                                                                            type: "delete",
                                                                          }
                                                                        );

                                                                        // Close success message after delay
                                                                        setTimeout(
                                                                          () => {
                                                                            setSuccessMessage(
                                                                              {
                                                                                show: false,
                                                                                message:
                                                                                  "",
                                                                                type: "",
                                                                              }
                                                                            );
                                                                          },
                                                                          2000
                                                                        );

                                                                        // Refresh the data after deletion
                                                                        await fetchListViewBookingDetails();
                                                                      }
                                                                    } catch (error) {
                                                                      console.error(
                                                                        "Error deleting booking:",
                                                                        error
                                                                      );
                                                                      alert(
                                                                        `Failed to delete booking: ${error.message}`
                                                                      );
                                                                    }
                                                                  },
                                                              }
                                                            );
                                                            setActionMenuOpen(
                                                              null
                                                            );
                                                          }}
                                                          className="w-full text-left px-3 py-2 text-xs hover:bg-red-50 text-red-600 flex items-center gap-2"
                                                        >
                                                          <FaTrash size={10} />
                                                          Delete Booking
                                                        </button>
                                                      </div>
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            }

                                            return null;
                                          })()}

                                          {/* Black Dot Actions - Hide if locked holiday */}
                                          {(() => {
                                            const isLocked =
                                              bookingDateForCheck &&
                                              isLockedHoliday(
                                                bookingDateForCheck
                                              );

                                            if (isLocked) {
                                              return null;
                                            }

                                            if (
                                              extractedData.summary &&
                                              (extractedData.summary.includes(
                                                "B&R"
                                              ) ||
                                                extractedData.summary.includes(
                                                  "CBT/PL"
                                                ) ||
                                                extractedData.summary.includes(
                                                  "CBT/UL"
                                                ) ||
                                                extractedData.summary.includes(
                                                  "CBP/PL"
                                                ) ||
                                                extractedData.summary.includes(
                                                  "CBP/UL"
                                                ) ||
                                                extractedData.summary.includes(
                                                  "CBO"
                                                ) ||
                                                extractedData.summary.includes(
                                                  "NO SHOW - LR"
                                                ) ||
                                                extractedData.summary.includes(
                                                  "NO SHOW - TR"
                                                )) &&
                                              canEditDeleteBooking()
                                            ) {
                                              return (
                                                <div className="relative">
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setActionMenuOpen(
                                                        actionMenuOpen === index
                                                          ? null
                                                          : index
                                                      );
                                                    }}
                                                    className="flex items-center gap-1 px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded transition-all duration-200 hover:shadow-sm cursor-pointer"
                                                    title="Manage Actions"
                                                  >
                                                    <MdManageAccounts
                                                      size={8}
                                                      className="sm:w-3 sm:h-3"
                                                    />
                                                    <span className="hidden sm:inline">
                                                      Manage
                                                    </span>
                                                    <FaChevronDown
                                                      size={8}
                                                      className="sm:w-3 sm:h-3"
                                                    />
                                                  </button>

                                                  {actionMenuOpen === index && (
                                                    <div
                                                      className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50"
                                                      data-dropdown-menu
                                                    >
                                                      <div className="py-1">
                                                        <button
                                                          onClick={() => {
                                                            // Show confirmation popup for delete events
                                                            setConfirmationPopup(
                                                              {
                                                                isOpen: true,
                                                                type: "delete-events",
                                                                title:
                                                                  "Confirm Delete",
                                                                message:
                                                                  "Are you sure you want to delete this event?",
                                                                data: extractedData,
                                                                date: bookingDate,
                                                                time: timeRange,
                                                                eventId:
                                                                  extractedData.event_id ||
                                                                  null,
                                                                upcomingEvents: false,
                                                                onConfirm:
                                                                  async (
                                                                    upcomingEvents
                                                                  ) => {
                                                                    try {
                                                                      // Call delete-class API for event deletion
                                                                      console.log(
                                                                        "🚀 Calling delete-class API for event deletion"
                                                                      );
                                                                      console.log(
                                                                        "📊 Event ID:",
                                                                        extractedData.event_id
                                                                      );
                                                                      console.log(
                                                                        "📊 Upcoming events:",
                                                                        upcomingEvents
                                                                      );

                                                                      if (
                                                                        !extractedData.event_id
                                                                      ) {
                                                                        throw new Error(
                                                                          "No event_id available for deletion"
                                                                        );
                                                                      }

                                                                      const deleteResult =
                                                                        await handleDeleteClass(
                                                                          extractedData.event_id,
                                                                          upcomingEvents ||
                                                                            false
                                                                        );

                                                                      if (
                                                                        deleteResult ==
                                                                        "success"
                                                                      ) {
                                                                        // Close the action menu
                                                                        setActionMenuOpen(
                                                                          null
                                                                        );

                                                                        // Show success message
                                                                        setSuccessMessage(
                                                                          {
                                                                            show: true,
                                                                            message:
                                                                              "Event Successfully Deleted !!",
                                                                            type: "delete",
                                                                          }
                                                                        );

                                                                        // Close success message after delay
                                                                        setTimeout(
                                                                          () => {
                                                                            setSuccessMessage(
                                                                              {
                                                                                show: false,
                                                                                message:
                                                                                  "",
                                                                                type: "",
                                                                              }
                                                                            );
                                                                          },
                                                                          2000
                                                                        );

                                                                        // Refresh the data after deletion
                                                                        await fetchListViewBookingDetails();
                                                                      }
                                                                    } catch (error) {
                                                                      console.error(
                                                                        "Error deleting event:",
                                                                        error
                                                                      );
                                                                      alert(
                                                                        `Failed to delete event: ${error.message}`
                                                                      );
                                                                    }
                                                                  },
                                                              }
                                                            );
                                                            setActionMenuOpen(
                                                              null
                                                            );
                                                          }}
                                                          className="w-full text-left px-3 py-2 text-xs hover:bg-red-50 text-red-600 flex items-center gap-2"
                                                        >
                                                          <FaTrash size={10} />
                                                          Delete Events
                                                        </button>
                                                        <button
                                                          onClick={() => {
                                                            // Process booking data for edit popup
                                                            const processedData =
                                                              processBookingDataForEdit(
                                                                extractedData,
                                                                bookingDate,
                                                                timeRange
                                                              );

                                                            console.log(
                                                              "📝 Edit button clicked - Processed data:",
                                                              processedData
                                                            );

                                                            // Open Edit/Reschedule popup with processed data
                                                            setEditReschedulePopup(
                                                              {
                                                                isOpen: true,
                                                                data: processedData,
                                                                date: bookingDate,
                                                                time: timeRange,
                                                                isLoading: false,
                                                              }
                                                            );
                                                            setActionMenuOpen(
                                                              null
                                                            );
                                                          }}
                                                          className="w-full text-left px-3 py-2 text-xs hover:bg-yellow-50 text-yellow-600 flex items-center gap-2"
                                                        >
                                                          <FaCalendarAlt
                                                            size={10}
                                                          />
                                                          Edit/Reschedule
                                                          Booking
                                                        </button>
                                                      </div>
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            }

                                            return null;
                                          })()}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              });
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* List View Pagination */}
                    {(() => {
                      const parsedBookings = parseBookingDetails(
                        listViewBookingDetails.data
                      );
                      const totalPages = getTotalPages(
                        parsedBookings.length,
                        pagination.itemsPerPage
                      );

                      if (totalPages > 1) {
                        return (
                          <div className="mt-4 p-4 bg-gray-50 border-t border-gray-200">
                            <div className="flex items-center justify-between">
                              <div className="text-sm text-gray-600">
                                Showing{" "}
                                {(pagination.currentPage - 1) *
                                  pagination.itemsPerPage +
                                  1}{" "}
                                -{" "}
                                {Math.min(
                                  pagination.currentPage *
                                    pagination.itemsPerPage,
                                  parsedBookings.length
                                )}{" "}
                                of {parsedBookings.length} bookings
                              </div>
                              <Pagination
                                currentPage={pagination.currentPage}
                                totalPages={totalPages}
                                onPageChange={(page) =>
                                  handlePageChange(page, "main")
                                }
                                size="small"
                              />
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <FaList
                      size={32}
                      className="sm:w-12 sm:h-12 mx-auto mb-4 text-gray-300"
                    />
                    <p className="text-sm sm:text-base">
                      {selectedTeacher || selectedStudent
                        ? "No booking details available for the selected filters"
                        : "Select a teacher or student to view booking details"}
                    </p>
                    {!selectedTeacher && !selectedStudent && (
                      <button
                        onClick={() => {
                          setCurrentView("week");
                          // Call availability summary API when switching to Week view
                          console.log(
                            "🔄 Switching to Week view - calling availability summary API..."
                          );
                          fetchWeeklyAvailabilityData(
                            currentWeekStart,
                            selectedTeacher?.uid,
                            selectedStudent?.jetlearner_id,
                            selectedTimezone
                          )
                            .then((data) => {
                              if (data) {
                                setWeeklyApiData(data);
                                console.log(
                                  "✅ Availability summary API called successfully"
                                );
                              }
                            })
                            .catch((error) => {
                              console.error(
                                "❌ Error calling availability summary API:",
                                error
                              );
                            });
                        }}
                        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                      >
                        Switch to Week View
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : currentView === "list" && !selectedTeacher && !selectedStudent ? (
            /* List View - No Selection */
            <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6">
              <div className="text-center py-8 text-gray-500">
                <FaList
                  size={32}
                  className="sm:w-12 sm:h-12 mx-auto mb-4 text-gray-300"
                />
                <p className="text-sm sm:text-base mb-4">
                  List View requires a Teacher or Student selection
                </p>
                <p className="text-xs text-gray-400 mb-4">
                  Please select a Teacher or Student from the filters above to
                  view filtered data
                </p>
                <button
                  onClick={() => {
                    setCurrentView("week");
                    // Call availability summary API when switching to Week view
                    console.log(
                      "🔄 Switching to Week view - calling availability summary API..."
                    );
                    fetchWeeklyAvailabilityData(
                      currentWeekStart,
                      selectedTeacher?.uid,
                      selectedStudent?.jetlearner_id,
                      selectedTimezone
                    )
                      .then((data) => {
                        if (data) {
                          setWeeklyApiData(data);
                          console.log(
                            "✅ Availability summary API called successfully"
                          );
                        }
                      })
                      .catch((error) => {
                        console.error(
                          "❌ Error calling availability summary API:",
                          error
                        );
                      });
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  Switch to Week View
                </button>
              </div>
            </div>
          ) : (
            /* Week View Content */

            <div className="bg-white rounded-lg shadow-lg overflow-hidden min-h-screen">
              {/* color of slots */}

              <div className="flex flex-wrap items-center gap-1 sm:gap-2 md:gap-4 m-2">
                <div className="flex items-center gap-1 sm:gap-2">
                  <div className="w-2 h-2 sm:w-3 sm:h-3 md:w-4 md:h-4 bg-green-200 rounded"></div>
                  <span className="text-xs sm:text-sm text-gray-700">
                    <span className="hidden sm:inline">Available</span>
                    <span className="sm:hidden">Avail</span>
                  </span>
                </div>
                <div className="flex items-center gap-1 sm:gap-2">
                  <div className="w-2 h-2 sm:w-3 sm:h-3 md:w-4 md:h-4 bg-red-200 rounded"></div>
                  <span className="text-xs sm:text-sm text-gray-700">
                    <span className="hidden sm:inline">Booked</span>
                    <span className="sm:hidden">Book</span>
                  </span>
                </div>
                <div className="flex items-center gap-1 sm:gap-2">
                  <div className="w-2 h-2 sm:w-3 sm:h-3 md:w-4 md:h-4 bg-gray-200 rounded"></div>
                  <span className="text-xs sm:text-sm text-gray-700">
                    <span className="hidden sm:inline">Free Slots</span>
                    <span className="sm:hidden">None</span>
                  </span>
                </div>
                {selectedTeacher && (
                  <div className="flex items-center gap-2 sm:gap-4">
                    <div className="flex items-center gap-1 sm:gap-2">
                      <div className="w-2 h-2 sm:w-3 sm:h-3 md:w-4 md:h-4 bg-orange-500 rounded"></div>
                      <span className="text-xs sm:text-sm text-gray-700">
                        <span className="hidden sm:inline">Teacher Leave</span>
                        <span className="sm:hidden">Leave</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-2">
                      <div className="w-2 h-2 sm:w-3 sm:h-3 md:w-4 md:h-4 bg-yellow-100 border border-yellow-300 rounded"></div>
                      <span className="text-xs sm:text-sm text-gray-700">
                        <span className="hidden sm:inline">Week Off</span>
                        <span className="sm:hidden">WO</span>
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                <div
                  className="grid h-full w-full"
                  style={{
                    gridTemplateColumns: `80px repeat(${Math.max(
                      1,
                      filteredWeekDates.length
                    )}, minmax(100px, 1fr))`,
                    minWidth: `${Math.max(
                      600,
                      Math.max(1, filteredWeekDates.length) * 100 + 80
                    )}px`,
                  }}
                >
                  <div className="bg-gray-100 p-1 sm:p-2 lg:p-4 font-semibold text-gray-700 border-b border-r border-gray-300 text-center text-xs sm:text-sm min-w-[80px]">
                    Time
                  </div>
                  {filteredWeekDates.map((date) => {
                    const dateStr = formatDate(date);
                    const isOnLeave =
                      teacherLeaves.leaves && teacherLeaves.leaves[dateStr];

                    // Check if teacher has week off for this date
                    const teacherEmail = selectedTeacher?.email;

                    const isWeekOff =
                      teacherEmail &&
                      isTeacherWeekOff(teacherEmail, date, weeklyApiData);

                    // Check if date is a locked holiday
                    const isLockedHolidayDate = isLockedHoliday(date);

                    return (
                      <div
                        key={dateStr}
                        className={`bg-gray-100 p-1 sm:p-2 lg:p-4 font-semibold text-gray-700 text-center border-b border-r border-gray-300 relative ${
                          isOnLeave ? "bg-orange-100 border-orange-300" : ""
                        } ${
                          isWeekOff ? "bg-yellow-100 border-yellow-300" : ""
                        } ${
                          isLockedHolidayDate
                            ? "bg-gray-200 border-gray-400"
                            : ""
                        }`}
                      >
                        <div className="text-xs sm:text-sm">
                          {getDayName(date)}
                        </div>
                        <div className="text-xs text-gray-500 font-bold">
                          {formatShortDate(date)}
                        </div>

                        {/* Locked holiday indicator */}
                        {isLockedHolidayDate && (
                          <div
                            className="absolute top-0 right-0 w-3 h-3 bg-gray-700 rounded-full border border-white"
                            title="Locked - Holiday"
                          >
                            <div className="absolute inset-0 flex items-center justify-center"></div>
                          </div>
                        )}

                        {/* Leave indicator */}
                        {isOnLeave && (
                          <div
                            className="absolute top-0 right-0 w-3 h-3 bg-orange-500 rounded-full border border-white"
                            title="Teacher on Leave"
                          >
                            <div className="absolute inset-0 flex items-center justify-center"></div>
                          </div>
                        )}

                        {/* Week off indicator */}
                        {isWeekOff && (
                          <div
                            className="absolute top-0 left-0 w-3 h-3 bg-yellow-500 rounded-full border border-white"
                            title="Teacher Week Off"
                          >
                            <div className="absolute inset-0 flex items-center justify-center"></div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {getPaginatedTimeSlots().map((time) => (
                    <React.Fragment key={time}>
                      <div className="bg-gray-50 p-1 sm:p-2 lg:p-4 font-medium text-gray-600 text-center border-b border-r border-gray-300 text-xs sm:text-sm min-w-[80px]">
                        {time}
                      </div>
                      {filteredWeekDates.map((date) => {
                        const dateSchedule = getScheduleForDate(date);
                        const slot = dateSchedule[time];
                        const { available, booked, teacherid, apiData } =
                          getSlotCounts(date, time);
                        const dateStr = formatDate(date);
                        const isOnLeave =
                          teacherLeaves.leaves && teacherLeaves.leaves[dateStr];

                        // Check if teacher has week off for this date
                        const teacherEmail = selectedTeacher?.email;

                        const isWeekOff =
                          teacherEmail &&
                          isTeacherWeekOff(teacherEmail, date, weeklyApiData);

                        // Check if date is a locked holiday
                        const isLockedHolidayDate = isLockedHoliday(date);

                        // Show week off/leave colors only when there are no availability or bookings
                        let cellColor = getCellColor(available, booked);

                        // Only apply week off/leave/locked holiday colors when there are no actual availability or bookings
                        if (
                          isLockedHolidayDate &&
                          selectedTeacher &&
                          available === 0 &&
                          booked === 0
                        ) {
                          cellColor = "bg-gray-200 hover:bg-gray-300";
                        } else if (
                          isOnLeave &&
                          selectedTeacher &&
                          available === 0 &&
                          booked === 0
                        ) {
                          cellColor = "bg-orange-100 hover:bg-orange-200";
                        } else if (
                          isWeekOff &&
                          selectedTeacher &&
                          available === 0 &&
                          booked === 0
                        ) {
                          cellColor = "bg-yellow-100 hover:bg-yellow-200";
                        }

                        return (
                          <div
                            key={`${formatDate(date)}-${time}`}
                            className={`p-1 sm:p-2 lg:p-3 border-b border-r border-gray-300 text-xs ${cellColor} relative`}
                          >
                            {/* Show + icon for gray blocks (no availability) when teacher is selected and slot hasn't been clicked */}
                            {/* Allow availability marking even during week off and leave periods */}
                            {(() => {
                              // Check if date is a locked holiday
                              const isLockedHolidayDate = isLockedHoliday(date);

                              const shouldShow =
                                available === 0 &&
                                booked === 0 &&
                                selectedTeacher &&
                                !clickedSlots.has(
                                  `${formatDate(date)}-${time}`
                                ) &&
                                !isLockedHolidayDate &&
                                canAddTeacherAvailability();

                              // Debug logging for TJL1309 on 24th
                              if (
                                selectedTeacher?.uid === "TJL1309" &&
                                formatDate(date) === "2025-01-24"
                              ) {
                                console.log(
                                  "🔍 Add Availability Debug for TJL1309 on 24th:",
                                  {
                                    time,
                                    available,
                                    booked,
                                    selectedTeacher: selectedTeacher?.uid,
                                    slotKey: `${formatDate(date)}-${time}`,
                                    clickedSlots: clickedSlots.has(
                                      `${formatDate(date)}-${time}`
                                    ),
                                    canAddTeacherAvailability:
                                      canAddTeacherAvailability(),
                                    shouldShow,
                                    isOnLeave,
                                    isWeekOff,
                                  }
                                );
                              }

                              return shouldShow;
                            })() && (
                              <button
                                onClick={() =>
                                  handleAddAvailability(date, time)
                                }
                                className={`absolute top-1 right-1 w-5 h-5 text-white rounded-full flex items-center justify-center transition-colors duration-200 shadow-sm z-10 ${
                                  isOnLeave
                                    ? "bg-orange-500 hover:bg-orange-600"
                                    : isWeekOff
                                    ? "bg-yellow-500 hover:bg-yellow-600"
                                    : "bg-blue-500 hover:bg-blue-600"
                                }`}
                                title={`Add availability for this time slot${
                                  isOnLeave
                                    ? " (Teacher on Leave)"
                                    : isWeekOff
                                    ? " (Teacher Week Off)"
                                    : ""
                                }`}
                              >
                                <FaPlus size={8} />
                              </button>
                            )}

                            <div
                              className={`font-medium text-gray-800 ${
                                available > 0 && !isLockedHolidayDate
                                  ? "cursor-pointer hover:text-blue-600 hover:underline"
                                  : isLockedHolidayDate
                                  ? "text-gray-400 cursor-not-allowed"
                                  : ""
                              }`}
                              onClick={() => {
                                if (available > 0 && !isLockedHolidayDate) {
                                  handleAvailabilityClick(
                                    date,
                                    time,
                                    slot.teachers
                                  );
                                } else if (isLockedHolidayDate) {
                                  alert(
                                    "This date is locked due to holiday. No actions can be performed."
                                  );
                                }
                              }}
                            >
                              <span className="hidden sm:inline">
                                Available:{" "}
                              </span>
                              <span className="sm:hidden">A: </span>
                              {available}
                            </div>

                            <div
                              className={`font-medium text-gray-800 ${
                                booked > 0 && !isLockedHolidayDate
                                  ? "cursor-pointer hover:text-green-600 hover:underline"
                                  : isLockedHolidayDate
                                  ? "text-gray-400 cursor-not-allowed"
                                  : ""
                              }`}
                              onClick={() => {
                                console.log("🖱️ Booking div clicked:", {
                                  booked,
                                  date,
                                  time,
                                });
                                if (booked > 0 && !isLockedHolidayDate) {
                                  handleBookingClick(date, time, slot.students);
                                } else if (isLockedHolidayDate) {
                                  alert(
                                    "This date is locked due to holiday. No actions can be performed."
                                  );
                                }
                              }}
                            >
                              <span className="hidden sm:inline">Booked: </span>
                              <span className="sm:hidden">B: </span>
                              {booked}
                            </div>

                            {/* Teacher Leave Indicator - only show when no availability or bookings */}
                            {isOnLeave &&
                              selectedTeacher &&
                              available === 0 &&
                              booked === 0 && (
                                <div className="absolute inset-0 flex items-center justify-center bg-orange-200 bg-opacity-75 pointer-events-none">
                                  <div className="text-orange-700 font-bold text-xs flex flex-col items-center">
                                    <span className="hidden sm:block">
                                      On Leave
                                    </span>
                                    <span className="sm:hidden">Leave</span>
                                  </div>
                                </div>
                              )}

                            {/* Teacher Week Off Indicator - only show when no availability or bookings */}
                            {isWeekOff &&
                              selectedTeacher &&
                              !isOnLeave &&
                              available === 0 &&
                              booked === 0 && (
                                <div className="absolute inset-0 flex items-center justify-center bg-yellow-200 bg-opacity-75 pointer-events-none">
                                  <div className="text-yellow-700 font-bold text-xs flex flex-col items-center">
                                    <span className="hidden sm:block">
                                      Week Off
                                    </span>
                                    <span className="sm:hidden">WO</span>
                                  </div>
                                </div>
                              )}
                          </div>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {currentView === "week" && totalCalendarPages > 1 && (
          <div className="bg-white border-t border-gray-200 p-3 mt-auto">
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-600">Showing time slots</div>
              <Pagination
                currentPage={calendarPagination.currentPage}
                totalPages={totalCalendarPages}
                onPageChange={handleCalendarPageChange}
                size="small"
              />
            </div>
          </div>
        )}
      </div>

      <Suspense fallback={<div>Loading...</div>}>
        {modalOpen && (
          <UnifiedModal
            isOpen={modalOpen}
            onClose={() => setModalOpen(false)}
            date={selectedSlot?.date}
            time={selectedSlot?.time}
            timezone={selectedTimezone}
            availableStudents={allAvailableStudents}
            availableTeachers={selectedTeacher.uid || []}
            bookedStudents={currentSlot?.students || []}
            allTeachers={teachers}
            onAddTeacher={handleAddTeacher}
            onRemoveTeacher={handleRemoveTeacher}
            onBookStudent={handleBookStudent}
            onRemoveStudent={handleRemoveStudent}
            teacherAvailability={weeklyApiData}
            selectedTeacherId={selectedTeacher?.uid}
            listViewBookingDetails={listViewBookingDetails}
            isBookingLoading={isBookingLoading}
          />
        )}
      </Suspense>

      <DetailsPopup />
      <CancelPopup />
      <BookingDetailsPopup />
      <EditReschedulePopup />
      <ConfirmationPopup />
      <ScheduleManagementPopup />
      <ApplyLeavePopup />
      <SuccessMessage />

      {/* Global Loading Overlay */}
      {(isBookingLoading || isOperationLoading) && (
        <div className="fixed  inset-0 bg-opacity-30 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg p-6 flex items-center gap-4 shadow-xl border border-gray-200">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-200 border-t-blue-600"></div>
            <div className="text-gray-700 font-medium">
              {isBookingLoading
                ? "Processing booking request..."
                : "Processing request..."}
            </div>
          </div>
        </div>
      )}

      {/* Combined Slot Toasters Container */}
      {Object.keys(slotToasters).length > 0 && (
        <div className="fixed top-4 right-4 z-50 bg-white border border-gray-300 rounded-lg shadow-lg max-w-md max-h-[80vh] overflow-y-auto">
          <div className="p-3 border-b border-gray-200 bg-gray-50 rounded-t-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <FaCalendarAlt className="w-4 h-4 text-blue-600" />
                Add Availability Toasters (
                {Object.keys(slotToasters).length * globalRepeatOccurrence})
              </h3>
              <button
                onClick={() => {
                  // Clear all toasters
                  setSlotToasters({});
                  // Clear all clicked slots
                  setClickedSlots(new Set());
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                title="Close all toasters"
              >
                <FaTimes className="w-4 h-4" />
              </button>
            </div>
          </div>
          {/* Global Repeat Occurrence Input */}
          <div className="p-3 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">
                Repeat Occurrence for All:
              </label>
              <input
                type="number"
                min="1"
                max="52"
                value={globalRepeatOccurrence}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 1;
                  setGlobalRepeatOccurrence(Math.max(1, Math.min(52, value)));
                }}
                className="w-20 px-3 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="p-2 space-y-2">
            {Object.entries(slotToasters).map(([slotKey, toasterData]) => (
              <div
                key={slotKey}
                className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow duration-200"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    <FaCalendarAlt className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-gray-900">
                        Add Availability for {selectedTeacher?.full_name}
                      </span>
                      <div className="flex items-center gap-4 text-xs text-gray-600">
                        <span>
                          Date:{" "}
                          {toasterData.date
                            ? formatDisplayDate(toasterData.date)
                            : "N/A"}
                        </span>
                        <span>Time: {toasterData.time || "N/A"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        // Remove from clicked slots to make plus icon clickable again
                        setClickedSlots((prev) => {
                          const newSet = new Set(prev);
                          newSet.delete(slotKey);
                          return newSet;
                        });

                        // Close this specific toaster
                        setSlotToasters((prev) => {
                          const newToasters = { ...prev };
                          delete newToasters[slotKey];
                          return newToasters;
                        });
                      }}
                      className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                      title="Remove this toaster"
                    >
                      <FaTimes className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* Single Save All Button */}
          <div className="p-3 border-t border-gray-200 bg-gray-50 rounded-b-lg">
            <button
              onClick={() => handleSaveAllAvailability()}
              disabled={isSavingAvailability}
              className={`w-full text-white text-sm font-medium px-4 py-2 rounded transition-colors duration-200 flex items-center justify-center gap-2 ${
                isSavingAvailability
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {isSavingAvailability ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Saving...
                </>
              ) : (
                <>
                  <FaSave className="w-4 h-4" />
                  Save All (
                  {Object.keys(slotToasters).length * globalRepeatOccurrence})
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
