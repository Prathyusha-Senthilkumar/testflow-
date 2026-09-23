/** Wall-clock date + time in an IANA timezone, converted to one UTC instant. */

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function supportedTimeZones(): string[] {
  const detected = browserTimeZone();
  const listed =
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  const zones = listed.includes(detected) ? listed : [detected, ...listed];
  return zones.length > 0 ? zones : ["UTC"];
}

export function zonedWallTimeToUtc(
  date: string,
  time: string,
  timeZone: string
): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const clock = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time.trim());
  if (!match || !clock) {
    throw new Error("Choose a date and time.");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(clock[1]);
  const minute = Number(clock[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    throw new Error("Choose a valid date and time.");
  }

  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const first = utcGuess - timeZoneOffsetMs(new Date(utcGuess), timeZone);
  const secondOffset = timeZoneOffsetMs(new Date(first), timeZone);
  return new Date(utcGuess - secondOffset);
}

export function formatInTimeZone(instantIso: string, timeZone: string): string {
  const instant = new Date(instantIso);
  if (Number.isNaN(instant.getTime())) return instantIso;
  const zone = timeZone || "UTC";
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h12",
  }).format(instant);
  const label = zoneAbbreviation(instant, zone) ?? formatOffset(timeZoneOffsetMs(instant, zone));
  return `${clock} ${label} (${zone})`;
}

function zoneAbbreviation(instant: Date, timeZone: string): string | null {
  for (const locale of ["en-US", "en-GB", "en-IN"]) {
    const name = new Intl.DateTimeFormat(locale, {
      timeZone,
      timeZoneName: "short",
    })
      .formatToParts(instant)
      .find((part) => part.type === "timeZoneName")?.value;
    if (name && !/^GMT[+-]/.test(name) && !/^UTC[+-]/.test(name)) {
      return name;
    }
  }
  return null;
}

function formatOffset(offsetMs: number): string {
  const sign = offsetMs >= 0 ? "+" : "-";
  const total = Math.abs(Math.round(offsetMs / 60000));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes === 0 ? `GMT${sign}${hours}` : `GMT${sign}${hours}:${String(minutes).padStart(2, "0")}`;
}

function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const value: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") value[part.type] = part.value;
  }
  const hour = value.hour === "24" ? "0" : value.hour;
  const asUtc = Date.UTC(
    Number(value.year),
    Number(value.month) - 1,
    Number(value.day),
    Number(hour),
    Number(value.minute),
    Number(value.second)
  );
  return asUtc - instant.getTime();
}
