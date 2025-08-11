import React, { useState, useMemo } from "react";
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
  { value: "record", label: "Record" },
  { value: "do-not-record", label: "Do not Record" },
  { value: "make-up-class", label: "Make Up Class" },
  { value: "makeup-substitute", label: "Make Up - Substitute" },
];

export const formatDate = (date) => {
  // Ensure date is a Date object
  const dateObj = date instanceof Date ? date : new Date(date);
  return dateObj.toISOString().split("T")[0]; // YYYY-MM-DD format
};
const UnifiedModalComponent = function UnifiedModal({
  isOpen,
  onClose,
  date,
  time,
  timezone,
  availableStudents,
  availableTeachers,
  bookedStudents,
  allTeachers,
  onAddTeacher,
  onRemoveTeacher,
  onBookStudent,
  onRemoveStudent,
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
  const [selectedRecording, setSelectedRecording] = useState("");
  const [batchNumber, setBatchNumber] = useState("");

  // Enhanced booking form fields
  const [platformCredentials, setPlatformCredentials] = useState("");
  const [attendees, setAttendees] = useState("");
  const [selectedScheduleDate, setSelectedScheduleDate] = useState(
    formatDate(date)
  );
  const [selectedScheduleTime, setSelectedScheduleTime] = useState(startTime);

  // New Schedule section states
  const [scheduleEntries, setScheduleEntries] = useState([]);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [attendeesError, setAttendeesError] = useState("");

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

  // Email validation function
  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
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
        return { isValid: false, error: `Invalid email format: ${email}` };
      }
    }

    return { isValid: true, error: "" };
  };

  // Handle attendees change with validation
  const handleAttendeesChange = (value) => {
    setAttendees(value);
    const validation = validateAttendees(value);
    setAttendeesError(validation.error);
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
      date: selectedScheduleDate,
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

    const [day, month, year] = selectedDate.split("-");
    const bookingDate = new Date(year, month - 1, day);

    if (bookingDate < today) {
      alert(
        "Booking cannot be done for past dates. Only Cancellation or Reschedule is Allowed."
      );
      return false;
    }
    return true;
  };

  const handleBookStudent = () => {
    if (!studentName.trim() && selectedStudents.length === 0) {
      alert("Please select at least one student or enter a student name.");
      return;
    }

    // Validate attendees emails
    const attendeesValidation = validateAttendees(attendees);
    if (!attendeesValidation.isValid) {
      alert(attendeesValidation.error);
      return;
    }

    // Validate schedule entries
    if (scheduleEntries.length === 0) {
      alert("Please add at least one schedule entry.");
      return;
    }

    // Validate class type limits
    if (selectedClassType === "1:2" && selectedStudents.length > 2) {
      alert("Maximum 2 learners can be selected for 1:2 class type.");
      return;
    }

    // For paid bookings, validate additional fields
    if (bookingType === "paid") {
      if (
        !selectedSubject ||
        !selectedClassType ||
        !selectedClassCount ||
        !selectedRecording
      ) {
        alert("Please fill in all required fields for paid booking.");
        return;
      }
      
      // Validate batch number for batch class type
      if (selectedClassType === "batch" && !batchNumber.trim()) {
        alert("Please enter a batch number for batch class type.");
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

    studentsToBook.forEach((student) => {
      // Prepare API payload
      const bookingData = {
        bookingType,
        platformCredentials,
        attendees: attendees.trim(),
        schedule,
        ...(bookingType === "paid" && {
          subject: selectedSubject,
          classType: selectedClassType,
          classCount: selectedClassCount,
          recording: selectedRecording,
          ...(selectedClassType === "batch" && { batchNumber: batchNumber.trim() }),
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
    setSelectedRecording("");
    setBatchNumber("");
    setStudentSearchTerm("");
    setPlatformCredentials("");
    setAttendees("");
    setSelectedScheduleDate("");
    setSelectedScheduleTime("");
    setScheduleEntries([]);
    setSelectedStudents([]);
    setAttendeesError("");
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

  // Generate time slots for schedule
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

  const timeSlots = generateTimeSlots();

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
              {/* Left Column - Teachers */}
              {/* <div className="space-y-3"> */}
              {/* Available Teachers */}
              {/* <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-3 border border-green-200"> */}
              {/* <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-2">
                  <div className="p-0.5 bg-green-100 rounded">
                    <FaUsers size={14} className="text-green-600" />
                  </div>
                  AvailableTeachers
                  <span className="bg-green-100 text-green-800 text-xs font-medium px-1.5 py-0.5 rounded-full">
                    {availableTeachers.length}
                  </span>
                </h3> */}

              {/* <div className="space-y-1.5 max-h-28 overflow-y-auto mb-2">
                  {availableTeachers.map(t => (
                    <div key={t.id} className="bg-white rounded p-2 border border-green-200 shadow-sm hover:shadow-md transition-all duration-200">
                      <div className="flex justify-between items-center gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center">
                            <FaUserCheck size={10} className="text-green-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-xs text-gray-900 truncate">{t.full_name}</p>
                            <p className="text-[10px] text-gray-600 flex items-center gap-0.5 truncate">
                              <FaBook size={8} />
                              {t.uid}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => onRemoveTeacher(t.id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 p-0.5 rounded transition-all duration-200"
                        >
                          <FaTrash size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div> */}

              {/* Add Teacher Section */}
              {/* <div className="space-y-1.5">
                  <div className="relative">
                    <FaSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={teacherSearchTerm}
                      onChange={(e) => setTeacherSearchTerm(e.target.value)}
                      placeholder="Search teachers to add..."
                      className="w-full pl-8 pr-2.5 py-2 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>

                  {teacherSearchTerm.trim() && (
                    <div className="max-h-28 overflow-y-auto border border-gray-200 rounded">
                      {filteredUnassignedTeachers.map(t => (
                        <div
                          key={t.id}
                          onClick={() => {
                            setNewTeacherId(String(t.id));
                            setTeacherSearchTerm('');
                            handleAddTeacher();
                          }}
                          className="p-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                        >
                          <div className="flex items-center gap-1.5">
                            <FaUserCheck size={12} className="text-green-600" />
                            <div>
                              <p className="text-xs font-medium text-gray-900">{t.full_name}</p>
                              <p className="text-[10px] text-gray-500">{t.uid}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                      {filteredUnassignedTeachers.length === 0 && (
                        <div className="p-2 text-xs text-gray-500 text-center">No teachers found</div>
                      )}
                    </div>
                  )}
                </div> */}
              {/* </div> */}

              {/* Booked Students */}
              {/* <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg p-3 border border-amber-200">
                <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-2">
                  <div className="p-0.5 bg-amber-100 rounded">
                    <FaClock size={14} className="text-amber-600" />
                  </div>
                  Booked Learner
                  <span className="bg-amber-100 text-amber-800 text-xs font-medium px-1.5 py-0.5 rounded-full">
                    {bookedStudents.length}
                  </span>
                </h3>

                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {bookedStudents.map(s => (
                    <div key={s.id} className="bg-white rounded p-2 border border-amber-200 shadow-sm hover:shadow-md transition-all duration-200">
                      <div className="flex justify-between items-center gap-1.5">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <div className="w-5 h-5 bg-amber-100 rounded-full flex items-center justify-center">
                            <FaGraduationCap size={10} className="text-amber-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-xs text-gray-900 truncate">{s.name}</p>
                            <p className="text-[10px] text-gray-500 flex items-center gap-0.5 truncate">
                              <FaUsers size={8} />
                              Teacher : {getTeacherNameById(s.teacherId)}
                            </p>
                            {s.bookingType && (
                              <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full font-medium ${s.bookingType === 'paid' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                                {s.bookingType === 'paid' ? 'Paid' : 'Trial'}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => onRemoveStudent(s.id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 p-0.5 rounded transition-all duration-200"
                        >
                          <FaTrash size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {bookedStudents.length === 0 && (
                    <div className="text-center py-3 text-gray-500">
                      <FaGraduationCap size={20} className="mx-auto mb-1 text-gray-300" />
                      <p className="text-xs">No Learner booked yet</p>
                    </div>
                  )}
                </div>
              </div> */}
              {/* </div> */}

              {/* Middle Column - Schedule and Students */}
              <div className="space-y-3">
                {/* Schedule Section */}
                <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-3 border border-blue-200">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-2">
                    <div className="p-0.5 bg-blue-100 rounded">
                      <FaCalendarAlt size={14} className="text-blue-600" />
                    </div>
                    Schedule
                    <span className="bg-blue-100 text-blue-800 text-xs font-medium px-1.5 py-0.5 rounded-full">
                      {scheduleEntries.length}/3
                    </span>
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
                           onChange={(e) =>
                             setSelectedScheduleDate(e.target.value)
                           }
                           min={new Date().toISOString().split("T")[0]}
                           className="w-full p-2 border border-gray-300 rounded text-xs text-black focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                         />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-0.5">
                          Time
                        </label>
                                                 <select
                           value={selectedScheduleTime}
                           onChange={(e) =>
                             setSelectedScheduleTime(e.target.value)
                           }
                           className="w-full p-2 border border-gray-300 rounded text-xs text-black focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                         >
                          <option value="">Select time...</option>
                          {timeSlots.map((slot) => (
                            <option key={slot} value={slot}>
                              {slot}
                            </option>
                          ))}
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
                              {entry.date} at {entry.time}
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
                      {selectedStudents.length}/{selectedClassType === "1:2" ? "2" : "10"}
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
                              const isLimitReached = selectedClassType === "1:2" && selectedStudents.length >= 2;
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
                                        {student.country && `•${student.country}`}
                                      </p>
                                    </div>
                                    {isLimitReached && (
                                      <FaExclamationTriangle size={10} className="text-amber-600" />
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                            {selectedClassType === "1:2" && selectedStudents.length >= 2 && (
                              <div className="p-2 bg-amber-50 border-t border-amber-200">
                                <p className="text-xs text-amber-800 text-center">
                                  Maximum 2 learners reached for 1:2 class type
                                </p>
                              </div>
                            )}
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
                              {student.name}
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
                    
                    {/* Class Type Limit Warning */}
                    {selectedClassType === "1:2" && selectedStudents.length >= 2 && (
                      <div className="bg-amber-50 border border-amber-200 rounded p-2">
                        <div className="flex items-center gap-1.5">
                          <FaExclamationTriangle size={12} className="text-amber-600" />
                          <span className="text-xs text-amber-800 font-medium">
                            Maximum 2 learners allowed for 1:2 class type
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column - Booking Details */}
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
                      <div className="relative">
                                                 <input
                           type="text"
                           value={attendees}
                           onChange={(e) =>
                             handleAttendeesChange(e.target.value)
                           }
                           placeholder="Enter email addresses separated by commas or enter"
                           className={`w-full p-2 border rounded text-xs text-black focus:ring-1 focus:ring-green-500 focus:border-transparent ${
                             attendeesError
                               ? "border-red-300"
                               : "border-gray-300"
                           }`}
                         />
                        {attendeesError && (
                          <div className="flex items-center gap-1 mt-1 text-red-600">
                            <FaExclamationTriangle size={10} />
                            <span className="text-xs">{attendeesError}</span>
                          </div>
                        )}
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
                                 // If switching to 1:2 and already have more than 2 students, show warning
                                 if (newClassType === "1:2" && selectedStudents.length > 2) {
                                   alert("Cannot switch to 1:2 class type. Please remove some learners first (maximum 2 allowed for 1:2).");
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
                                  disabled={type.value === "1:2" && selectedStudents.length > 2}
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

                          <div>
                            <label className="block text-[10px] font-medium text-gray-700 mb-0.5">
                              Add More Details
                            </label>
                                                         <select
                               value={selectedRecording}
                               onChange={(e) =>
                                 setSelectedRecording(e.target.value)
                               }
                               className="w-full p-1.5 border border-gray-300 rounded text-xs text-black focus:ring-1 focus:ring-green-500"
                             >
                              <option value="">Choose option...</option>
                              {RECORDING_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Batch Number Input - Only show when class type is Batch */}
                          {selectedClassType === "batch" && (
                            <div className="col-span-2">
                              <label className="block text-[10px] font-medium text-gray-700 mb-0.5">
                                Batch No.
                              </label>
                              <input
                                type="text"
                                value={batchNumber}
                                onChange={(e) => setBatchNumber(e.target.value)}
                                placeholder="Enter batch number"
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
                        !studentName.trim() && selectedStudents.length === 0
                      }
                      className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white py-2 rounded hover:from-green-700 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-1.5 font-medium text-xs"
                    >
                      <FaBook size={14} />
                      Book Learners
                    </button>
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
