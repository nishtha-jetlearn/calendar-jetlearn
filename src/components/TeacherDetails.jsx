import React from 'react';
import { FaUserCheck, FaUsers, FaGraduationCap, FaChalkboardTeacher } from 'react-icons/fa';
import { formatShortDate, getDayName } from '../utils/dateUtils';

const TeacherDetails = (props) => {
  const { teacher, teacherStats } = props;

  if (!teacher) {
    return (
      <div className="bg-white rounded-xl shadow p-4 sm:p-6 border border-gray-200 text-center">
        <FaUserCheck size={32} className="mx-auto text-gray-300 mb-2" />
        <h3 className="text-gray-500">No Teacher Selected</h3>
        <p className="text-sm text-gray-400"></p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow p-4 sm:p-6 border border-gray-200 space-y-4">
      {/* Teacher Info */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
            <FaChalkboardTeacher size={20} className="text-green-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg text-blue-700">{teacher.full_name}</h3>
            <div className="space-y-1 mt-1">
              <p className="text-xs text-gray-600">
                <span className="font-bold">ID:</span> {teacher.uid}
              </p>
              {teacher.email && (
                <p className="text-xs text-gray-600">
                  <span className="font-bold">Email:</span> {teacher.email}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex gap-4 text-sm text-gray-600">
        <span className="flex items-center gap-1">
          {/* <FaUsers size={12} /> {teacherStats?.totalSlots || 0} slots */}
        </span>
        {/* <span className="flex items-center gap-1">
          <FaGraduationCap size={12} /> {teacherStats?.totalStudents || 0} Learners
        </span> */}
      </div>

      {teacherStats && Object.entries(teacherStats.scheduleByDate).map(([dateStr, dateSlots]) => {
        const date = new Date(dateStr);
        const dayName = getDayName(date);
        const shortDate = formatShortDate(date);

        return (
          dateSlots && dateSlots.length > 0 && (
            <div key={dateStr}>
              <div className="text-xs font-semibold text-gray-500 mb-1">
                {dayName} ({shortDate})
              </div>
              <ul className="space-y-1">
                {dateSlots.map(slot => (
                  slot.students.map(student => (
                    <li key={student.id} className="flex justify-between items-center px-2 py-1 bg-blue-50 border border-blue-100 rounded">
                      <span>{slot.time} - {student.name}</span>
                      <span className="text-xs text-blue-600 font-medium">
                        {student.bookingType === 'paid' ? 'Paid' : 'Trial'}
                      </span>
                    </li>
                  ))
                ))}
              </ul>
            </div>
          )
        );
      })}

      {(!teacherStats || teacherStats.totalSlots === 0) && (
        <p className="text-gray-400 text-center mt-4 text-sm"></p>
      )}
    </div>
  );
};

export default React.memo(TeacherDetails);

