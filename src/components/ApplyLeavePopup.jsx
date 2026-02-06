import React, { useState, useEffect } from "react";
import { FaCalendarAlt, FaTimes } from "react-icons/fa";
import { formatDate } from "../utils/dateUtils";

export default function ApplyLeavePopup({
  applyLeavePopup,
  setApplyLeavePopup,
  selectedTeacher,
  onApplyLeave,
  setSuccessMessage,
}) {
  const [reasonText, setReasonText] = useState("");

  useEffect(() => {
    if (applyLeavePopup.isOpen) {
      setReasonText(applyLeavePopup.reason || "");
    }
  }, [applyLeavePopup.isOpen, applyLeavePopup.reason]);

  if (!applyLeavePopup.isOpen) return null;

  const today = formatDate(new Date());

  const handleSubmit = async () => {
    setApplyLeavePopup((prev) => ({
      ...prev,
      errors: { startDate: "", endDate: "", reason: "" },
    }));

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

      const startDateFormatted = [
        applyLeavePopup.startDate,
        applyLeavePopup.startTime || "00:00",
      ];
      const endDateFormatted = [
        applyLeavePopup.endDate,
        applyLeavePopup.endTime || "23:00",
      ];

      await onApplyLeave(
        selectedTeacher.email,
        startDateFormatted,
        endDateFormatted,
        reasonText,
        selectedTeacher.uid || null
      );

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

    if (applyLeavePopup.errors.endDate) {
      setApplyLeavePopup((prev) => ({
        ...prev,
        errors: { ...prev.errors, endDate: "" },
      }));
    }
  };

  const minEndDate = applyLeavePopup.startDate || today;

  const timeOptions = Array.from({ length: 24 }, (_, i) => {
    const hour = String(i).padStart(2, "0");
    return (
      <option key={hour} value={`${hour}:00`}>
        {hour}:00
      </option>
    );
  });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 animate-in fade-in duration-200">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-xs sm:max-w-sm md:max-w-md overflow-hidden border border-gray-100 backdrop-blur-lg animate-in slide-in-from-bottom-4 duration-300">
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
          {selectedTeacher && (
            <div className="mb-4 p-2 bg-blue-50 rounded border border-blue-200">
              <p className="text-xs text-blue-800">
                <span className="font-semibold">Teacher:</span>{" "}
                {selectedTeacher.full_name}
              </p>
            </div>
          )}

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
                {timeOptions}
              </select>
            </div>
            {applyLeavePopup.errors.startDate && (
              <p className="text-xs text-red-500 mt-1">
                {applyLeavePopup.errors.startDate}
              </p>
            )}
          </div>

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
                {timeOptions}
              </select>
            </div>
            {applyLeavePopup.errors.endDate && (
              <p className="text-xs text-red-500 mt-1">
                {applyLeavePopup.errors.endDate}
              </p>
            )}
          </div>

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
}
