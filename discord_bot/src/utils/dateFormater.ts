export function dateFormater(label = "Created") {
  const d = new Date();

  // Format like: "Jan 28, 3:05pm EST"
  const formatted = d.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .replace(" AM", "am")
    .replace(" PM", "pm");

  return { text: `${label}: ${formatted} EST` };
}