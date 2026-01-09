import React from "react";
import {
  FaGraduationCap,
  FaUsers,
  FaUserCheck,
  FaBookOpen,
} from "react-icons/fa";

const StudentDetails = (props) => {
  const { student, schedule, allTeachers } = props;

  if (!student) {
    return (
      <div className="bg-white rounded-xl shadow p-4 sm:p-6 border border-gray-200 text-center">
        <FaGraduationCap size={32} className="mx-auto text-gray-300 mb-2" />
        <h3 className="text-gray-500">No Learner Selected</h3>
        <p className="text-sm text-gray-400"></p>
      </div>
    );
  }

  // Get student's booking history
  const getStudentBookingHistory = () => {
    const bookings = [];
    Object.keys(schedule).forEach((dateStr) => {
      const dateSchedule = schedule[dateStr];
      Object.keys(dateSchedule).forEach((time) => {
        const slot = dateSchedule[time];
        if (slot && slot.students) {
          const studentBooking = slot.students.find(
            (s) =>
              s.name.toLowerCase() ===
              (student.deal_name || student.name || "").toLowerCase()
          );
          if (studentBooking) {
            const teacherData = allTeachers
              ? allTeachers.find(
                  (t) => t.id.toString() === studentBooking.teacherId.toString()
                )
              : null;
            const teacherName = teacherData?.full_name || "Unassigned";
            bookings.push({
              date: dateStr,
              time: time,
              teacher: teacherName,
              bookingType: studentBooking.bookingType || "trial",
            });
          }
        }
      });
    });
    return bookings;
  };

  const studentBookings = getStudentBookingHistory();

  return (
    <div className="bg-white rounded-xl shadow p-4 sm:p-6 border border-gray-200 space-y-4">
      {/* Student Info */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
            <FaGraduationCap size={20} className="text-green-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg text-blue-700">
              {student.deal_name || student.name}
            </h3>
            <div className="space-y-1 mt-1">
              {student.jetlearner_id && (
                <p className="text-xs text-gray-600">
                  <span className="font-bold">ID:</span> {student.jetlearner_id}
                </p>
              )}
              {student.email && (
                <p className="text-xs text-gray-600">
                  <span className="font-bold">Email:</span> {student.email}
                </p>
              )}
              {student.age && (
                <p className="text-xs text-gray-600">
                  <span className="font-bold">Age:</span> {student.age}
                </p>
              )}
              {student.country && (
                <p className="text-xs text-gray-600">
                  <span className="font-bold">Country:</span> {student.country}
                </p>
              )}
              <p className="text-xs text-gray-600">
                <span className="font-bold">Country Timezone :</span>{" "}
                {student.country_timezone}
              </p>
            </div>
            {student.isBookedStudent && (
              <span className="inline-block mt-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full font-medium">
                Previously Booked
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Student's Booking History */}
      {/* {studentBookings.length > 0 && (
        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-md font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <FaUsers size={16} className="text-green-600" />
            Booking History ({studentBookings.length})
          </h4>
          
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {studentBookings.map((booking, index) => {
              const date = new Date(booking.date);
              const dayName = getDayName(date);
              const shortDate = formatShortDate(date);
              
              return (
                <div key={index} className="p-2 bg-green-50 rounded border border-green-200">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {dayName} ({shortDate}) at {booking.time}
                      </p>
                      <p className="text-xs text-gray-600">Teacher: {booking.teacher}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      booking.bookingType === 'paid' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {booking.bookingType === 'paid' ? 'Paid' : 'Trial'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )} */}

      {studentBookings.length === 0 && (
        <div className="">
          {/* <FaGraduationCap size={32} className="mx-auto mb-2 text-gray-300" /> */}
          {/* <p className="text-sm">No booking history</p> */}
          {/* <p className="text-xs text-gray-400">This student hasn't been booked yet</p> */}
        </div>
      )}
    </div>
  );
};

export default React.memo(StudentDetails);
