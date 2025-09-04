import React, { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [accessPermissions, setAccessPermissions] = useState(null);

  useEffect(() => {
    console.log("🔐 AuthContext: useEffect running - checking localStorage");

    // Check if user is already logged in (from localStorage)
    const savedUser = localStorage.getItem("user");
    const savedPermissions = localStorage.getItem("accessPermissions");

    console.log("🔐 AuthContext: savedUser from localStorage:", savedUser);
    console.log(
      "🔐 AuthContext: savedPermissions from localStorage:",
      savedPermissions
    );

    if (savedUser) {
      try {
        const userData = JSON.parse(savedUser);
        console.log("🔐 AuthContext: Parsed userData:", userData);
        setUser(userData);
        setIsAuthenticated(true);

        // Restore access permissions if available
        if (savedPermissions) {
          try {
            const permissions = JSON.parse(savedPermissions);
            console.log(
              "🔐 AuthContext: Loading permissions from localStorage:",
              permissions
            );
            setAccessPermissions(permissions);
          } catch (error) {
            console.error("Error parsing saved permissions:", error);
            localStorage.removeItem("accessPermissions");
          }
        }
      } catch (error) {
        console.error("Error parsing saved user data:", error);
        localStorage.removeItem("user");
        localStorage.removeItem("accessPermissions");
      }
    }
    setIsLoading(false);
  }, []);

  // Monitor accessPermissions state changes
  useEffect(() => {
    console.log(
      "🔐 AuthContext: accessPermissions state changed to:",
      accessPermissions
    );
  }, [accessPermissions]);

  const login = (userData, permissions) => {
    console.log("🔐 AuthContext: Login called with permissions:", permissions);
    console.log("🔐 AuthContext: Permissions type:", typeof permissions);
    console.log(
      "🔐 AuthContext: Permissions keys:",
      Object.keys(permissions || {})
    );

    // Store in localStorage first
    localStorage.setItem("user", JSON.stringify(userData));
    localStorage.setItem("accessPermissions", JSON.stringify(permissions));

    // Then update state
    setUser(userData);
    setAccessPermissions(permissions);
    setIsAuthenticated(true);

    console.log("🔐 AuthContext: Permissions stored in state:", permissions);
    console.log(
      "🔐 AuthContext: Permissions stored in localStorage:",
      localStorage.getItem("accessPermissions")
    );
  };

  const logout = async () => {
    try {
      // Get session_id from user data
      const userData = JSON.parse(localStorage.getItem("user") || "{}");
      const sessionId = userData.sessionId;

      if (sessionId) {
        // Make logout API call
        const formData = new FormData();
        formData.append("session_id", sessionId);

        const response = await fetch("https://live.jetlearn.com/sync/logout/", {
          method: "POST",
          body: formData,
        });

        if (response.ok) {
          console.log("Logout successful");
        } else {
          console.error("Logout API error:", response.status);
        }
      }
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      // Always clear local state regardless of API call result
      setUser(null);
      setAccessPermissions(null);
      setIsAuthenticated(false);
      localStorage.removeItem("user");
      localStorage.removeItem("accessPermissions");
    }
  };

  // Helper function to check specific permissions
  const hasPermission = (permissionKey) => {
    if (!accessPermissions) return false;

    // Debug logging
    console.log(`🔍 Checking permission: ${permissionKey}`);
    console.log(`🔍 Permission value:`, accessPermissions[permissionKey]);
    console.log(`🔍 Permission type:`, typeof accessPermissions[permissionKey]);

    // Check for truthy values (true, "true", 1, etc.)
    const permissionValue = accessPermissions[permissionKey];
    const hasAccess = Boolean(permissionValue);

    console.log(`🔍 Has access: ${hasAccess}`);

    return hasAccess;
  };

  // Helper function to get permission value
  const getPermission = (permissionKey) => {
    if (!accessPermissions) return null;
    return accessPermissions[permissionKey];
  };

  const value = {
    user,
    isAuthenticated,
    isLoading,
    accessPermissions,
    login,
    logout,
    hasPermission,
    getPermission,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
