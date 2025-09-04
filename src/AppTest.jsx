import React from "react";
import { useAuth } from "./contexts/AuthContext";
import { usePermissions } from "./hooks/usePermissions";
import PermissionDisplay from "./components/PermissionDisplay";
import LoginPage from "./pages/LoginPage";

function AppTest() {
  // ALL HOOKS MUST BE AT THE TOP - NO CONDITIONAL CALLS
  const { isAuthenticated, isLoading, user } = useAuth();
  const { hasPermission, canAddBooking, canView } = usePermissions();

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

  // Main app content - user is authenticated
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-6 text-center">
          JetLearn Calendar - Permissions Test
        </h1>

        {/* Permission Display */}
        <div className="mb-8">
          <PermissionDisplay />
        </div>

        {/* Simple Permission Tests */}
        <div className="bg-white rounded-lg shadow p-6 max-w-2xl mx-auto">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">
            Permission Tests
          </h2>

          <div className="space-y-4">
            {/* View Permission Test */}
            <div className="p-4 border rounded-lg">
              <h3 className="font-medium mb-2">View Permission Test:</h3>
              {canView() ? (
                <div className="text-green-600">
                  ✅ User has view permission
                </div>
              ) : (
                <div className="text-red-600">
                  ❌ User does not have view permission
                </div>
              )}
            </div>

            {/* Add Booking Permission Test */}
            <div className="p-4 border rounded-lg">
              <h3 className="font-medium mb-2">Add Booking Permission Test:</h3>
              {canAddBooking() ? (
                <div className="text-green-600">✅ User can add bookings</div>
              ) : (
                <div className="text-red-600">❌ User cannot add bookings</div>
              )}
            </div>

            {/* Raw Permission Check */}
            <div className="p-4 border rounded-lg">
              <h3 className="font-medium mb-2">Raw Permission Check:</h3>
              <p>
                Can add teacher availability:{" "}
                {hasPermission("add_availability_teacher") ? "✅ Yes" : "❌ No"}
              </p>
              <p>
                Can delete teacher availability:{" "}
                {hasPermission("delete_teacher_availability")
                  ? "✅ Yes"
                  : "❌ No"}
              </p>
              <p>
                Can edit/delete booking:{" "}
                {hasPermission("edit_delete_booking") ? "✅ Yes" : "❌ No"}
              </p>
            </div>
          </div>
        </div>

        {/* User Info */}
        <div className="bg-white rounded-lg shadow p-6 max-w-2xl mx-auto mt-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">
            Current User Info
          </h2>
          <div className="space-y-2">
            <p>
              <strong>Username:</strong> {user?.username || "Unknown"}
            </p>
            <p>
              <strong>Role:</strong> {user?.role || "Unknown"}
            </p>
            <p>
              <strong>Email:</strong> {user?.email || "Unknown"}
            </p>
            <p>
              <strong>Session ID:</strong> {user?.sessionId || "Unknown"}
            </p>
          </div>

          {/* Logout Button */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <button
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
            >
              Logout & Clear All Data
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AppTest;
