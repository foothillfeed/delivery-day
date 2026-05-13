import { useState, useRef, useEffect, useCallback } from "react";

const GREEN = "#2D5233";
const AMBER = "#d4853a";
const RED = "#c0392b";
const BLUE = "#2c5f8a";
const PURPLE = "#6b4c9a";

// Vendor config — add new vendors here
const VENDORS = {
  "Newco":    { repEmail: "nate.burger@newcodistributors.com", deadlineDay: "Wednesday",       color: GREEN },
  "VSI":      { repEmail: "orders@vsi.cc",                    deadlineDay: "Tuesday by 2pm",  color: "#7b3f9e" },
  "Phillips": { repEmail: "orders@phillipspet.com",           deadlineDay: "Thursday by 10am", color: "#c45c1a" },
  "Other":    { repEmail: "",                                 deadlineDay: null,               color: BLUE },
};

// Detect vendor from invoice content
function detectVendor(raw) {
  const u = raw.toUpperCase();
  if (u.includes("NEWCO") || u.includes("RANCHO CUCAMONGA")) return "Newco";
  if (u.includes("VETERINARY SERVICE") || u.includes("VSI") || u.includes("PALMYRITA")) return "VSI";
  if (u.includes("PHILLIPS PET") || u.includes("HECKTOWN") || u.includes("EASTON, PA")) return "Phillips";
  return "Other";
}