import React from "react";
import { usePermissions } from "../hooks/usePermissions";
import { useAuth } from "../contexts/AuthContext";

const PermissionDisplay = () => {
  const { user } = useAuth();
  const {
    canView,
    canAddTeacherAvailability,
    canDeleteTeacherAvailability,
    canAddBooking,
    canEditDeleteBooking,
    getMoreFilters,
    getAllPermissions,
    PERMISSIONS,
    accessPermissions,
  } = usePermissions();

  // Debug logging
  console.log("🔍 PermissionDisplay: accessPermissions:", accessPermissions);
  console.log("🔍 PermissionDisplay: PERMISSIONS:", PERMISSIONS);
  console.log("🔍 PermissionDisplay: canView function:", canView);
  console.log("🔍 PermissionDisplay: canAddBooking function:", canAddBooking);

  return (
    <div className="bg-white rounded-lg shadow-md p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">
        User Permissions
      </h2>

      {/* User Info */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-lg font-semibold mb-3 text-gray-700">
          User Information
        </h3>
        <div className="space-y-2 text-sm">
          <p>
            <strong>Username:</strong> {user?.name || "Unknown"}
          </p>
          <p>
            <strong>Role:</strong> {user?.role || "Unknown"}
          </p>
          <p>
            <strong>Email:</strong> {user?.email || "Unknown"}
          </p>
        </div>
      </div>

      {/* Permissions */}
      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <span className="font-medium text-gray-700">View Access:</span>
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium ${
              canView()
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {canView() ? "✅ Allowed" : "❌ Denied"}
          </span>
          <span className="text-xs text-gray-500 ml-2">
            Raw: {JSON.stringify(accessPermissions?.view)}
          </span>
        </div>

        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <span className="font-medium text-gray-700">
            Add Teacher Availability:
          </span>
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium ${
              canAddTeacherAvailability()
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {canAddTeacherAvailability() ? "✅ Allowed" : "❌ Denied"}
          </span>
        </div>

        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <span className="font-medium text-gray-700">
            Delete Teacher Availability:
          </span>
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium ${
              canDeleteTeacherAvailability()
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {canDeleteTeacherAvailability() ? "✅ Allowed" : "❌ Denied"}
          </span>
        </div>

        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <span className="font-medium text-gray-700">Add Booking:</span>
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium ${
              canAddBooking()
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {canAddBooking() ? "✅ Allowed" : "❌ Denied"}
          </span>
          <span className="text-xs text-gray-500 ml-2">
            Raw: {JSON.stringify(accessPermissions?.["add_booking"])}
          </span>
        </div>

        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <span className="font-medium text-gray-700">
            Edit/Delete Booking:
          </span>
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium ${
              canEditDeleteBooking()
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {canEditDeleteBooking() ? "✅ Allowed" : "❌ Denied"}
          </span>
        </div>

        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <span className="font-medium text-gray-700">More Filters:</span>
          <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
            {getMoreFilters() || "None"}
          </span>
        </div>
      </div>

      {/* Raw Permissions Data */}
      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-3 text-gray-700">
          Raw Permissions Data:
        </h3>
        <pre className="bg-gray-100 p-3 rounded text-sm overflow-x-auto">
          {JSON.stringify(getAllPermissions(), null, 2)}
        </pre>
      </div>

      {/* Usage Examples */}
      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-3 text-gray-700">
          Usage Examples:
        </h3>
        <div className="space-y-2 text-sm text-gray-600 bg-gray-50 p-4 rounded-lg">
          <p>
            <code className="bg-gray-200 px-2 py-1 rounded">
              const {canAddBooking} = usePermissions();
            </code>
          </p>
          <p>
            <code className="bg-gray-200 px-2 py-1 rounded">
              if (canAddBooking()) {"{ /* Show add booking button */ }"}
            </code>
          </p>
          <p>
            <code className="bg-gray-200 px-2 py-1 rounded">
              const filters = getMoreFilters();
            </code>
          </p>
        </div>
      </div>
    </div>
  );
};

export default PermissionDisplay;
