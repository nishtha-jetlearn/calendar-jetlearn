import React, { useState, useMemo, useEffect, lazy, Suspense } from "react";
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
} from "react-icons/fa";
import UnifiedModal from "./components/UnifiedModal";
import TeacherDetails from "./components/TeacherDetails";
import StudentDetails from "./components/StudentDetails";
import EnhancedTeacherSearch from "./components/EnhancedTeacherSearch";
import EnhancedStudentSearch from "./components/EnhancedStudentSearch";
import EnhancedTimezoneSearch from "./components/EnhancedTimezoneSearch";
import LoginPage from "./pages/LoginPage";
import { useAuth } from "./contexts/AuthContext";
import {
  getWeekDates,
  formatDate,
  formatShortDate,
  getDayName,
  getCurrentWeekStart,
  formatDisplayDate,
  getCurrentMonthRange,
} from "./utils/dateUtils";

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

  const [monthRange, setMonthRange] = useState({
    startOfMonth: "",
    endOfMonth: "",
  });

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

  // State for students from API
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState(null);

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

  // Enhanced state for better API integration
  const [weeklyApiData, setWeeklyApiData] = useState({});
  const [apiDataLoading, setApiDataLoading] = useState(false);
  const [apiDataError, setApiDataError] = useState(null);

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
    console.log("🚀 Calendar Application Started");
    console.log("📱 Environment: Development");
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
      const startDate = formatDate(weekDates[0]); // week start
      const endDate = formatDate(weekDates[6]); // week end

      const formData = new URLSearchParams();
      formData.append("start_date", startDate);
      formData.append("end_date", endDate);
      formData.append("timezone", timezone);

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
        console.log("✅ TEACHERID ADDED:", teacherToUse.uid);
        console.log("✅ EMAIL ADDED:", teacherToUse.email);
        console.log("👤 Teacher Name:", teacherToUse.full_name);
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
        console.log("🔍 FILTERED API CALL (List View)");
        console.log("🚀 FILTERED PAYLOAD:", Object.fromEntries(formData));
        console.log("📋 View will update with filtered data");
      } else {
        // For week view, send type parameter
        formData.append("type", "Availability");
        console.log("📅 WEEK VIEW API CALL");
        console.log("🚀 WEEK VIEW PAYLOAD:", Object.fromEntries(formData));
        console.log(
          "📋 Fetching complete dataset for all teachers and students"
        );
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
      formData.append("timezone", selectedTimezone);

      // If teacher data is available, include it; otherwise send without teacher filter
      if (teacherToUse && teacherToUse.uid && teacherToUse.email) {
        formData.append("teacherid", teacherToUse.uid);
        formData.append("email", teacherToUse.email);
        formData.append("timezone", selectedTimezone);

        console.log(
          "🚀 Sending Bookings API Request for time slot (with teacher):",
          {
            start_date: dateStr,
            end_date: dateStr,
            type: "Bookings",
            teacherid: teacherToUse.uid,
            email: teacherToUse.email,
            time_slot: time,
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
      formData.append("timezone", selectedTimezone);

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
            time_slot: time,
          }
        );
      } else {
        console.log(
          "🚀 Sending Availability API Request for time slot (all teachers):",
          {
            start_date: dateStr,
            end_date: dateStr,
            type: "Availability",
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

      const output = selectedTimezone.replace(
        /(.*\)) (.+)/,
        (match, prefix, tz) => {
          return `${prefix} ${tz.replace(/ /g, "_")}`;
        }
      );
      console.log(output);
      const range = getCurrentMonthRange();
      setMonthRange(range);
      console.log("getCurrentMonthRange", getCurrentMonthRange());

      // const startDate = range.startOfMonth;
      const endDate = range.endOfMonth;
      const weekDates = getWeekDates(currentWeekStart);
      const startDate = formatDate(weekDates[0]);
      // const endDate = formatDate(weekDates[6]);

      const formData = new URLSearchParams();
      formData.append("start_date", startDate);
      formData.append("end_date", endDate);
      formData.append("timezone", selectedTimezone);

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
    const dateStr = formatDate(selectedSlot.date);
    console.log("selectedStudent" + selectedStudents);
    console.log("Booking Data " + JSON.stringify(bookingData, null, 2));
    // Find teacher and student details
    const teacher = selectedTeacher?.uid;
    const student = selectedStudents.map((item) => item.id);
    console.log(student);
    if (!teacher) {
      alert("Teacher not found");
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
      attendees: bookingData.attendees || "",
      schedule: formattedSchedule || [],
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
        const attendeeslist = bookingData.attendees.split(",");
        console.log(attendeeslist);
        const taglist = bookingData.recording.split(",");
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
            course: bookingData.subject,
            recording: taglist,
            batch_name: bookingData.batchNumber,
            tags: taglist,
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
        }
      } catch (error) {
        console.error("❌ Error sending booking to API:", error);
        alert("Failed to send booking to API. Please try again.");
      }
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

  const handleTeacherSelect = (teacher) => {
    console.log("🔍 Teacher selected from search:", teacher);
    console.log("📋 Teacher details:", {
      id: teacher.id,
      full_name: teacher.full_name,
      uid: teacher.uid,
      email: teacher.email,
    });

    setSelectedTeacher(teacher);

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
        setApiDataLoading(false);
      };

      immediateAPICall();
    } else {
      console.log("❌ No teacher UID available for refresh");
    }
  };

  const handleStudentSelect = (student) => {
    console.log("🔍 Student selected from search:", student);
    console.log("📋 Student details:", {
      jetlearner_id: student.jetlearner_id,
      deal_name: student.deal_name,
      country: student.country,
      age: student.age,
    });

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
    } else {
      console.log("❌ No student jetlearner_id available for refresh");
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

  // Function to clear teacher filter
  const clearTeacherFilter = () => {
    console.log("🗑️ Clearing teacher filter...");
    setSelectedTeacher(null);

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
        formData.append("timezone", selectedTimezone);
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
    console.log("🔍 Availability clicked:", { date: dateObj, time, teachers });
    const { teacherid } = getSlotCounts(dateObj, time);
    console.log("📋 Teacher ID from slot:", teacherid);

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

    // Always trigger API call for availability data, with or without teacher
    try {
      if (teacherid) {
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
    console.log("🔍 Booking clicked:", { date: dateObj, time, students });
    const { teacherid } = getSlotCounts(dateObj, time);
    console.log("📋 Teacher ID from slot:", teacherid);

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

  // Handle cancel availability
  const handleCancelAvailability = async (
    date,
    time,
    teacherId = null,
    reason = ""
  ) => {
    try {
      console.log("🚀 Canceling availability for:", {
        date,
        time,
        teacherId,
        reason,
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

      // Call API to cancel availability
      const response = await fetch("/api/cancel-availability/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: dateObj.toISOString().split("T")[0], // YYYY-MM-DD format
          time: time,
          teacherId: teacherId,
          timezone: selectedTimezone,
          reason: reason,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log("✅ Availability canceled successfully:", result);

      // Refresh the data after canceling
      await fetchListViewBookingDetails();

      // Show success message (you can implement a toast notification here)
      // alert("Availability canceled successfully!");
    } catch (error) {
      console.error("❌ Error canceling availability:", error);
      // alert("Failed to cancel availability. Please try again.");
    }
  };

  // Handle cancel booking
  const handleCancelBooking = async (date, time, bookingData, reason = "") => {
    try {
      console.log("🚀 Canceling booking for:", {
        date,
        time,
        bookingData,
        reason,
      });

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
    }
  };

  // Handle reschedule booking
  const handleRescheduleBooking = async (date, time, bookingData) => {
    try {
      console.log("🚀 Rescheduling booking for:", { date, time, bookingData });

      // Ensure date is a Date object
      const dateObj = date instanceof Date ? date : new Date(date);

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

  // Function to filter API data by specific time slot
  const filterDataByTime = (data, targetTime, maxCount = null) => {
    if (!data) return [];

    console.log("🔍 Filtering data for time:", targetTime);
    console.log("📊 Raw data:", data);
    console.log("📊 Max count limit:", maxCount);

    let filteredData = [];

    // Handle the new nested API response format: { "2025-07-23": { "17:00": { "events": [...] } } }
    const dates = Object.keys(data);
    console.log("📅 Available dates:", dates);

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

  // Function to extract specific fields from event data
  const extractEventFields = (event, type) => {
    if (type === "availability") {
      return {
        start_time: event.start_time,
        end_time: event.end_time,
        creator: event.creator,
        summary: event.summary,
      };
    } else if (type === "booking") {
      // Parse summary to extract fields
      const summary = event.summary || "";
      const parts = summary.split(" : ");

      let learnerName = "N/A";
      let jlid = "N/A";
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
        creator: event.creator,
        teacherid: event.calendar_id || "N/A",
        jlid: jlid,
        learner_name: learnerName,
        teacher_name: teacherName,
      };
    }

    return event;
  };

  // Function to parse booking details for list view
  const parseBookingDetails = (data) => {
    if (!data) return [];

    console.log("🔍 parseBookingDetails - Raw API data:", data);

    const bookings = [];

    // Handle different data formats
    if (Array.isArray(data)) {
      // Direct array format
      console.log("📋 Processing as array format");
      bookings.push(...data);
    } else if (typeof data === "object") {
      // Object format with dates as keys
      console.log("📋 Processing as object format");
      Object.entries(data).forEach(([date, timeSlots]) => {
        console.log(`📅 Processing date: ${date}`, timeSlots);
        if (typeof timeSlots === "object") {
          Object.entries(timeSlots).forEach(([time, slotData]) => {
            console.log(`⏰ Processing time: ${time}`, slotData);
            if (slotData && slotData.events && Array.isArray(slotData.events)) {
              slotData.events.forEach((event) => {
                console.log("📋 Adding event:", event);
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

    console.log("📊 Final parsed bookings:", bookings);

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
        default:
          return <FaCheckCircle size={20} />;
      }
    };

    return (
      <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right duration-300">
        <div className={`${getMessageColor()} text-white px-6 py-4 rounded-lg shadow-lg flex items-center gap-3 max-w-sm`}>
          {getIcon()}
          <div>
            <p className="font-semibold text-sm">{successMessage.message}</p>
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

    // Debug logging
    console.log("🔍 Popup Debug Info:", {
      time: detailsPopup.time,
      type: detailsPopup.type,
      gridAvailableCount,
      gridBookedCount,
      availabilityResponse: availabilityAPI.response,
      bookingResponse: bookingApiResponse.data,
      filteredAvailability: filteredAvailabilityData,
      filteredBooking: filteredBookingData,
      availableTimes: availabilityAPI.response
        ? Object.keys(availabilityAPI.response)
        : [],
      bookingTimes: bookingApiResponse.data
        ? Object.keys(bookingApiResponse.data)
        : [],
      pagination: popupPagination,
      currentData: currentData,
      totalPages: totalPages,
    });

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
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[400px]">
                                <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200">
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
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[400px]">
                                <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200">
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
        if (cancelPopup.type === "availability") {
          await handleCancelAvailability(
            cancelPopup.date,
            cancelPopup.time,
            cancelPopup.teacherDetails?.uid,
            cancelPopup.reason
          );
        } else if (cancelPopup.type === "booking") {
          await handleCancelBooking(
            cancelPopup.date,
            cancelPopup.time,
            cancelPopup.data,
            cancelPopup.reason
          );
        }

        // Close the popup
        setCancelPopup({
          isOpen: false,
          type: null,
          data: null,
          date: null,
          time: null,
          reason: "",
          studentDetails: null,
          teacherDetails: null,
        });
      } catch (error) {
        console.error("Error canceling:", error);
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
                disabled={!cancelPopup.reason.trim()}
                className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors duration-200 font-medium flex items-center justify-center gap-1 text-xs"
              >
                <FaTimes size={12} />
                <span>Confirm Cancellation</span>
              </button>
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
                    {formatDisplayDate(weekDates[0])} -{" "}
                    {formatDisplayDate(weekDates[6])}
                  </span>
                  <span className="sm:hidden">
                    {formatShortDate(weekDates[0])} -{" "}
                    {formatShortDate(weekDates[6])}
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
                <div className="flex flex-wrap gap-1">
                  {selectedTeacher && (
                    <span className="px-1 py-0.5 bg-blue-100 text-blue-800 text-xs rounded">
                      Teacher: {selectedTeacher.full_name}
                    </span>
                  )}
                  {selectedStudent && (
                    <span className="px-1 py-0.5 bg-green-100 text-green-800 text-xs rounded">
                      Student: {selectedStudent.deal_name}
                    </span>
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
                              Showing all bookings for Current Month
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
                                Summary
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

                              // Debug logging for pagination
                              console.log("🔍 List View Pagination Debug:", {
                                totalBookings: parsedBookings.length,
                                currentPage: pagination.currentPage,
                                itemsPerPage: pagination.itemsPerPage,
                                paginatedBookingsCount:
                                  paginatedBookings.length,
                                totalPages: getTotalPages(
                                  parsedBookings.length,
                                  pagination.itemsPerPage
                                ),
                              });

                              return paginatedBookings.map((booking, index) => {
                                const extractedData = extractEventFields(
                                  booking,
                                  "booking"
                                );
                                const bookingDate = new Date(
                                  booking.start_time || booking.date
                                );

                                // Format time range properly with timezone consideration
                                const formatTimeFromAPI = (dateTimeString) => {
                                  if (!dateTimeString) return "N/A";
                                  try {
                                    console.log(
                                      "dateTimeString" + dateTimeString
                                    );
                                    const formattedTime = dateTimeString.slice(
                                      11,
                                      16
                                    ); // "04:00"

                                    console.log("formattedTime", formattedTime); // "14:30"
                                    return formattedTime;
                                    // return date.toLocaleTimeString([], {
                                    //   hour: "2-digit",
                                    //   minute: "2-digit",
                                    //   hour12: false,
                                    // });
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

                                return (
                                  <tr
                                    key={index}
                                    className="hover:bg-gray-50 transition-colors"
                                  >
                                    <td className="px-6 py-4 whitespace-nowrap">
                                      <div className="flex items-center">
                                        <div
                                          className={`w-3 h-3 rounded-full mr-3 ${
                                            extractedData.summary &&
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
                                                  .includes("week off") ||
                                                  extractedData.summary
                                                    .toLowerCase()
                                                    .includes("off"))
                                              ? "bg-yellow-500"
                                              : extractedData.summary &&
                                                (extractedData.summary.trim() ===
                                                  "B&R" ||
                                                  extractedData.summary.trim() ===
                                                    "CBT/PL" ||
                                                  extractedData.summary.trim() ===
                                                    "CBT/UL" ||
                                                  extractedData.summary.trim() ===
                                                    "CBP/PL" ||
                                                  extractedData.summary.trim() ===
                                                    "CBP/UL" ||
                                                  extractedData.summary.trim() ===
                                                    "CBO" ||
                                                  extractedData.summary.trim() ===
                                                    "NO SHOW - LR" ||
                                                  extractedData.summary.trim() ===
                                                    "NO SHOW - TR" ||
                                                  extractedData.summary.trim() ===
                                                    "MAKE UP" ||
                                                  extractedData.summary.trim() ===
                                                    "MAKE UP - S" ||
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
                                                  ) ||
                                                  extractedData.summary.includes(
                                                    "MAKE UP"
                                                  ) ||
                                                  extractedData.summary.includes(
                                                    "MAKE UP - S"
                                                  ))
                                              ? "bg-black"
                                              : "bg-red-500"
                                          }`}
                                        ></div>
                                        <div className="flex-1">
                                          <div className="text-sm font-medium text-gray-900">
                                            {formatDisplayDate(bookingDate)}
                                          </div>
                                          <div className="text-sm text-gray-500">
                                            {getDayName(bookingDate)}
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

                                    <td className="px-6 py-4">
                                      <div className="flex items-center justify-between">
                                        <div className="text-sm text-gray-900 break-words">
                                          {extractedData.summary || "N/A"}
                                        </div>
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
                                          ) && (
                                            <div className="flex items-center gap-2 ml-3">
                                              <button
                                                onClick={() => {
                                                  // Open UnifiedModal for this time slot
                                                  let timeSlot = timeRange;

                                                  console.log(
                                                    "Opening UnifiedModal for:",
                                                    {
                                                      date: bookingDate,
                                                      time: timeSlot,
                                                      summary:
                                                        extractedData.summary,
                                                      start_time:
                                                        extractedData.start_time,
                                                    }
                                                  );

                                                  // Get slot data for this specific time
                                                  const slotData =
                                                    getSlotCounts(
                                                      bookingDate,
                                                      timeSlot
                                                    );

                                                  setSelectedSlot({
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
                                                  });
                                                  setModalOpen(true);
                                                }}
                                                className="flex items-center gap-1 px-1 sm:px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs rounded transition-all duration-200 hover:shadow-sm cursor-pointer"
                                                title="Click to manage teachers and students for this time slot"
                                              >
                                                <FaUsers
                                                  size={8}
                                                  className="sm:w-3 sm:h-3"
                                                />
                                                <span className="hidden sm:inline">
                                                  Manage
                                                </span>
                                              </button>
                                              {/* <button
                                                onClick={() => {
                                                  // Extract time from the booking data
                                                  let timeSlot = "00:00";

                                                  // Try to extract time from summary
                                                  if (extractedData.summary) {
                                                    const timeMatch =
                                                      extractedData.summary.match(
                                                        /(\d{1,2}:\d{2})/
                                                      );
                                                    if (timeMatch) {
                                                      timeSlot = timeMatch[1];
                                                    }
                                                  }

                                                  // If no time found in summary, try to extract from start_time
                                                  if (
                                                    timeSlot === "00:00" &&
                                                    extractedData.start_time
                                                  ) {
                                                    const timeFromStart =
                                                      extractedData.start_time.match(
                                                        /(\d{2}:\d{2})/
                                                      );
                                                    if (timeFromStart) {
                                                      timeSlot =
                                                        timeFromStart[1];
                                                    }
                                                  }

                                                  // If still no time found, use a default time
                                                  if (timeSlot === "00:00") {
                                                    console.warn(
                                                      "Could not extract time from data, using default 09:00"
                                                    );
                                                    timeSlot = "09:00";
                                                  }

                                                  // Open cancel popup for availability
                                                  // setCancelPopup({
                                                  //   isOpen: true,
                                                  //   type: "availability",
                                                  //   data: extractedData,
                                                  //   date: bookingDate,
                                                  //   time: timeSlot,
                                                  //   reason: "",
                                                  //   studentDetails: null,
                                                  //   teacherDetails:
                                                  //     getTeacherByTeacherId(
                                                  //       extractedData.teacherid
                                                  //     ) || selectedTeacher,
                                                  // });
                                                }}
                                                className="flex items-center gap-1 px-1 sm:px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-xs rounded transition-all duration-200 hover:shadow-sm cursor-pointer"
                                                title="Click to cancel availability for this time slot"
                                              >
                                                <FaTimes
                                                  size={8}
                                                  className="sm:w-3 sm:h-3"
                                                />
                                                <span className="hidden sm:inline">
                                                  Cancel Availability
                                                </span>
                                              </button> */}
                                            </div>
                                          )}
                                        {extractedData.summary &&
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
                                              .includes("week off") ||
                                            extractedData.summary
                                              .toLowerCase()
                                              .includes("off")
                                          ) && (
                                            <div className="flex items-center gap-2 ml-3">
                                              {/* Cancel/No show button - only show for non-black-dot statuses */}
                                              {!(
                                                extractedData.summary.trim() ===
                                                  "B&R" ||
                                                extractedData.summary.trim() ===
                                                  "CBT/PL" ||
                                                extractedData.summary.trim() ===
                                                  "CBT/UL" ||
                                                extractedData.summary.trim() ===
                                                  "CBP/PL" ||
                                                extractedData.summary.trim() ===
                                                  "CBP/UL" ||
                                                extractedData.summary.trim() ===
                                                  "CBO" ||
                                                extractedData.summary.trim() ===
                                                  "NO SHOW - LR" ||
                                                extractedData.summary.trim() ===
                                                  "NO SHOW - TR" ||
                                                extractedData.summary.trim() ===
                                                  "MAKE UP" ||
                                                extractedData.summary.trim() ===
                                                  "MAKE UP - S" ||
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
                                                ) ||
                                                extractedData.summary.includes(
                                                  "MAKE UP"
                                                ) ||
                                                extractedData.summary.includes(
                                                  "MAKE UP - S"
                                                )
                                              ) && (
                                                <button
                                                  onClick={() => {
                                                    // Extract time from the booking data
                                                    let timeSlot = "00:00";

                                                    // Try to extract time from summary
                                                    if (extractedData.summary) {
                                                      const timeMatch =
                                                        extractedData.summary.match(
                                                          /(\d{1,2}:\d{2})/
                                                        );
                                                      if (timeMatch) {
                                                        timeSlot = timeMatch[1];
                                                      }
                                                    }

                                                    // If no time found in summary, try to extract from start_time
                                                    if (
                                                      timeSlot === "00:00" &&
                                                      extractedData.start_time
                                                    ) {
                                                      const timeFromStart =
                                                        extractedData.start_time.match(
                                                          /(\d{2}:\d{2})/
                                                        );
                                                      if (timeFromStart) {
                                                        timeSlot =
                                                          timeFromStart[1];
                                                      }
                                                    }

                                                    // If still no time found, use a default time
                                                    if (timeSlot === "00:00") {
                                                      console.warn(
                                                        "Could not extract time from data, using default 09:00"
                                                      );
                                                      timeSlot = "09:00";
                                                    }

                                                    // Open cancel popup for booking
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
                                                        ) || selectedTeacher,
                                                    });
                                                  }}
                                                  className="flex items-center gap-1 px-1 sm:px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-xs rounded transition-all duration-200 hover:shadow-sm cursor-pointer"
                                                  title="Click to cancel this booking"
                                                >
                                                  <FaTimes
                                                    size={8}
                                                    className="sm:w-3 sm:h-3"
                                                  />
                                                  <span className="hidden sm:inline">
                                                    Cancel/No show
                                                  </span>
                                                </button>
                                              )}

                                              {/* Reschedule button - show for all statuses */}
                                              {/* <button
                                                onClick={() => {
                                                  // Extract time from the booking data
                                                  let timeSlot = "00:00";
                                                  // If no time found in summary, try to extract from start_time
                                                  if (
                                                    timeSlot === "00:00" &&
                                                    extractedData.start_time
                                                  ) {
                                                    const timeFromStart =
                                                      extractedData.start_time.match(
                                                        /(\d{2}:\d{2})/
                                                      );
                                                    if (timeFromStart) {
                                                      timeSlot =
                                                        timeFromStart[1];
                                                    }
                                                  }

                                                  // If still no time found, use a default time
                                                  if (timeSlot === "00:00") {
                                                    console.warn(
                                                      "Could not extract time from data, using default 09:00"
                                                    );
                                                    timeSlot = "09:00";
                                                  }

                                                  // Call the reschedule booking function
                                                  handleRescheduleBooking(
                                                    bookingDate,
                                                    timeSlot,
                                                    extractedData
                                                  );
                                                }}
                                                className="flex items-center gap-1 px-1 sm:px-2 py-1 bg-yellow-100 hover:bg-yellow-200 text-yellow-700 text-xs rounded transition-all duration-200 hover:shadow-sm cursor-pointer"
                                                title="Click to reschedule this booking"
                                              >
                                                <FaCalendarAlt
                                                  size={8}
                                                  className="sm:w-3 sm:h-3"
                                                />
                                                <span className="hidden sm:inline">
                                                  Reschedule
                                                </span>
                                              </button> */}
                                            </div>
                                          )}
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
                    <span className="hidden sm:inline">No Availability</span>
                    <span className="sm:hidden">None</span>
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <div className="grid grid-cols-[50px_repeat(7,minmax(60px,1fr))] sm:grid-cols-[60px_repeat(7,minmax(80px,1fr))] md:grid-cols-[80px_repeat(7,minmax(120px,1fr))] min-w-[500px] sm:min-w-[600px] md:min-w-[800px] h-full">
                  <div className="bg-gray-100 p-1 sm:p-2 lg:p-4 font-semibold text-gray-700 border-b border-r border-gray-300 text-center text-xs sm:text-sm">
                    Time
                  </div>
                  {weekDates.map((date) => (
                    <div
                      key={formatDate(date)}
                      className="bg-gray-100 p-1 sm:p-2 lg:p-4 font-semibold text-gray-700 text-center border-b border-r border-gray-300"
                    >
                      <div className="text-xs sm:text-sm">
                        {getDayName(date)}
                      </div>
                      <div className="text-xs text-gray-500 font-bold">
                        {formatShortDate(date)}
                      </div>
                    </div>
                  ))}
                  {getPaginatedTimeSlots().map((time) => (
                    <React.Fragment key={time}>
                      <div className="bg-gray-50 p-1 sm:p-2 lg:p-4 font-medium text-gray-600 text-center border-b border-r border-gray-300 text-xs sm:text-sm">
                        {time}
                      </div>
                      {weekDates.map((date) => {
                        const dateSchedule = getScheduleForDate(date);
                        const slot = dateSchedule[time];
                        const { available, booked, teacherid, apiData } =
                          getSlotCounts(date, time);
                        const cellColor = getCellColor(available, booked);
                        return (
                          <div
                            key={`${formatDate(date)}-${time}`}
                            className={`p-1 sm:p-2 lg:p-3 border-b border-r border-gray-300 text-xs ${cellColor}`}
                          >
                            <div
                              className={`font-medium text-gray-800 ${
                                available > 0
                                  ? "cursor-pointer hover:text-blue-600 hover:underline"
                                  : ""
                              }`}
                              onClick={() => {
                                console.log("🖱️ Availability div clicked:", {
                                  available,
                                  date,
                                  time,
                                });
                                if (available > 0) {
                                  handleAvailabilityClick(
                                    date,
                                    time,
                                    slot.teachers
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
                                booked > 0
                                  ? "cursor-pointer hover:text-green-600 hover:underline"
                                  : ""
                              }`}
                              onClick={() => {
                                console.log("🖱️ Booking div clicked:", {
                                  booked,
                                  date,
                                  time,
                                });
                                if (booked > 0) {
                                  handleBookingClick(date, time, slot.students);
                                }
                              }}
                            >
                              <span className="hidden sm:inline">Booked: </span>
                              <span className="sm:hidden">B: </span>
                              {booked}
                            </div>

                            {/* <div className="text-xs text-gray-600 mt-1 hidden sm:block">
                            {formatTimeInTimezone(date, time, selectedTimezone)}
                          </div> */}
                            {/* <div className="flex gap-1 mt-1 sm:mt-2 flex-wrap">
                            <button
                              onClick={() => handleSlotClick(date, time)}
                              className="flex items-center gap-1 px-1 sm:px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs rounded"
                            >
                              <FaUsers size={8} className="sm:w-3 sm:h-3" />
                              <span className="hidden sm:inline">Manage</span>
                            </button>
                          </div> */}
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
          />
        )}
      </Suspense>

      <DetailsPopup />
      <CancelPopup />
      <SuccessMessage />
    </div>
  );
}

export default App;
