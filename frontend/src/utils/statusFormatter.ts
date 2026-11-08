export const formatStatus = (status: string = ""): string => {
    const normalized = status.toLowerCase().replace(/[-\s]/g, "_");
  
    if (normalized.includes("pending")) return "Pending";
    if (normalized.includes("in_progress") || normalized.includes("inprogress"))
      return "In Progress";
    if (normalized.includes("resolved")) return "Resolved";
    if (normalized.includes("closed")) return "Closed";
    if (normalized.includes("escalated")) return "Escalated";
    if (normalized.includes("completed")) return "Completed";
    if (normalized.includes("active")) return "Active";
    if (normalized.includes("accepted")) return "Accepted";
  
    // Additional fallback mappings for unknown BUT possible statuses:
    if (normalized.includes("open")) return "Open";
    if (normalized.includes("reopened")) return "Reopened";
    if (normalized.includes("failed")) return "Failed";
    if (normalized.includes("cancelled") || normalized.includes("canceled"))
      return "Cancelled";
  
    // Fallback for future unexpected values:
    return status
      .replace(/[_-]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };
  
/** One colour per status, used everywhere a status badge is shown. */
export const getStatusBadgeClass = (status: string = ""): string => {
  const normalized = status.toLowerCase().replace(/[-\s]/g, "_");

  switch (normalized) {
    case "pending":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "under_review":
      return "bg-sky-100 text-sky-800 border-sky-200";
    case "assigned":
    case "accepted":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "in_progress":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "resolved":
    case "closed":
    case "completed":
      return "bg-green-100 text-green-800 border-green-200";
    case "rejected":
    case "failed":
    case "escalated":
      return "bg-red-100 text-red-800 border-red-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
};

/** Whole days since a date (0 for today). */
export const daysSince = (date?: string | Date | null): number => {
  if (!date) return 0;
  const diff = Date.now() - new Date(date).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
};
