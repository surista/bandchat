/**
 * ICS (iCalendar) Parser
 *
 * Parses .ics calendar invites from Google Calendar, Outlook, etc.
 * Extracts event details to create BandChat gigs/rehearsals.
 */

/**
 * Parse an ICS string and extract VEVENT data
 * @param {string} icsContent - Raw .ics file content
 * @returns {Object} Parsed event data
 */
function parseICS(icsContent) {
  if (!icsContent || typeof icsContent !== 'string') {
    throw new Error('Invalid ICS content');
  }

  // Normalize line endings and unfold long lines (per RFC 5545)
  const normalized = icsContent
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, ''); // Unfold continuation lines

  // Check for VCALENDAR wrapper
  if (!normalized.includes('BEGIN:VCALENDAR')) {
    throw new Error('Invalid ICS format: missing VCALENDAR');
  }

  // Extract VEVENT block(s)
  const veventMatch = normalized.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/);
  if (!veventMatch) {
    throw new Error('No VEVENT found in ICS file');
  }

  const vevent = veventMatch[0];
  const lines = vevent.split('\n');

  const event = {
    title: null,
    date: null,
    endDate: null,
    venue: null,
    address: null,
    notes: null,
    uid: null,
  };

  for (const line of lines) {
    // Handle properties with parameters (e.g., DTSTART;TZID=America/New_York:20240315T190000)
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const keyPart = line.substring(0, colonIndex);
    const value = line.substring(colonIndex + 1).trim();

    // Extract base property name (before any parameters)
    const propName = keyPart.split(';')[0].toUpperCase();

    switch (propName) {
      case 'SUMMARY':
        event.title = unescapeICS(value);
        break;

      case 'DTSTART':
        event.date = parseICSDate(value, keyPart);
        break;

      case 'DTEND':
        event.endDate = parseICSDate(value, keyPart);
        break;

      case 'LOCATION':
        event.venue = unescapeICS(value);
        break;

      case 'DESCRIPTION':
        event.notes = unescapeICS(value);
        break;

      case 'GEO':
        // GEO is latitude;longitude - could be used for address lookup
        // For now, just store it
        event.geo = value;
        break;

      case 'UID':
        event.uid = value;
        break;
    }
  }

  // Validate required fields
  if (!event.date) {
    throw new Error('No start date found in ICS event');
  }

  // Default title if missing
  if (!event.title) {
    event.title = 'Imported Event';
  }

  return event;
}

/**
 * Parse ICS date/time formats
 * Handles: 20240315T190000, 20240315T190000Z, 20240315 (all-day)
 * @param {string} value - The date value
 * @param {string} keyPart - The full property key (may contain TZID)
 * @returns {Date} JavaScript Date object
 */
function parseICSDate(value, keyPart) {
  // Extract timezone if present (e.g., DTSTART;TZID=America/New_York)
  const tzMatch = keyPart.match(/TZID=([^;:]+)/i);
  const timezone = tzMatch ? tzMatch[1] : null;

  // Remove any trailing parameters
  const cleanValue = value.replace(/;.*$/, '').trim();

  // All-day event: YYYYMMDD
  if (/^\d{8}$/.test(cleanValue)) {
    const year = parseInt(cleanValue.substring(0, 4));
    const month = parseInt(cleanValue.substring(4, 6)) - 1;
    const day = parseInt(cleanValue.substring(6, 8));
    return new Date(year, month, day);
  }

  // Date-time: YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
  const match = cleanValue.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (match) {
    const [, year, month, day, hour, minute, second, isUTC] = match;

    if (isUTC) {
      return new Date(Date.UTC(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second)
      ));
    }

    // If timezone specified, we should convert, but for simplicity
    // we'll treat it as local time (most calendar apps handle this)
    return new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
      parseInt(second)
    );
  }

  throw new Error(`Unable to parse date: ${value}`);
}

/**
 * Unescape ICS text values
 * ICS escapes: \n → newline, \, → comma, \; → semicolon, \\ → backslash
 */
function unescapeICS(value) {
  if (!value) return value;

  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/**
 * Parse multiple events from an ICS file
 * @param {string} icsContent - Raw .ics file content
 * @returns {Object[]} Array of parsed events
 */
function parseICSMultiple(icsContent) {
  if (!icsContent || typeof icsContent !== 'string') {
    throw new Error('Invalid ICS content');
  }

  const normalized = icsContent
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '');

  if (!normalized.includes('BEGIN:VCALENDAR')) {
    throw new Error('Invalid ICS format: missing VCALENDAR');
  }

  const events = [];
  const veventMatches = normalized.matchAll(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g);

  for (const match of veventMatches) {
    try {
      // Wrap single event in VCALENDAR for parseICS
      const singleICS = `BEGIN:VCALENDAR\n${match[0]}\nEND:VCALENDAR`;
      events.push(parseICS(singleICS));
    } catch (err) {
      // Skip invalid events, continue parsing others
      console.warn('Skipping invalid VEVENT:', err.message);
    }
  }

  if (events.length === 0) {
    throw new Error('No valid events found in ICS file');
  }

  return events;
}

module.exports = {
  parseICS,
  parseICSMultiple,
};
