// API utility functions

export const rejectAvailability = async (
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
export const freezeSlot = async (teacherUid, slotDateTime, userId) => {
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
