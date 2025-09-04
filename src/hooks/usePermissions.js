import { useAuth } from "../contexts/AuthContext";

export const usePermissions = () => {
  const { accessPermissions, hasPermission, getPermission } = useAuth();

  // Permission constants for easy reference
  const PERMISSIONS = {
    ADD_AVAILABILITY_TEACHER: "add_availability_teacher",
    DELETE_TEACHER_AVAILABILITY: "delete_teacher_availability",
    ADD_BOOKING: "add_booking",
    EDIT_DELETE_BOOKING: "edit_delete_booking",
    VIEW: "view",
    MORE_FILTERS: "more_filters",
  };

  // Check if user has view permission
  const canView = () => hasPermission(PERMISSIONS.VIEW);

  // Check if user can add teacher availability
  const canAddTeacherAvailability = () =>
    hasPermission(PERMISSIONS.ADD_AVAILABILITY_TEACHER);

  // Check if user can delete teacher availability
  const canDeleteTeacherAvailability = () =>
    hasPermission(PERMISSIONS.DELETE_TEACHER_AVAILABILITY);

  // Check if user can add bookings
  const canAddBooking = () => hasPermission(PERMISSIONS.ADD_BOOKING);

  // Check if user can edit/delete bookings
  const canEditDeleteBooking = () =>
    hasPermission(PERMISSIONS.EDIT_DELETE_BOOKING);

  // Get the more filters value
  const getMoreFilters = () => getPermission(PERMISSIONS.MORE_FILTERS);

  // Check if user has any permissions at all
  const hasAnyPermissions = () =>
    accessPermissions && Object.keys(accessPermissions).length > 0;

  // Get all permissions as an object
  const getAllPermissions = () => accessPermissions || {};

  return {
    // Permission constants
    PERMISSIONS,

    // Permission checking functions
    canView,
    canAddTeacherAvailability,
    canDeleteTeacherAvailability,
    canAddBooking,
    canEditDeleteBooking,

    // Utility functions
    hasAnyPermissions,
    getAllPermissions,
    getMoreFilters,

    // Raw permission checking
    hasPermission,
    getPermission,

    // Raw permissions data
    accessPermissions,
  };
};
