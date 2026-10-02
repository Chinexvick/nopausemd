// Minimal RFC 5545 calendar file for a single consultation. The same UID is
// reused for a booking's whole life, so a reschedule (higher SEQUENCE)
// updates the event already in the patient's calendar and a cancellation
// (METHOD:CANCEL) removes it.

function icsDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function icsEscape(value) {
  return String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// Lines longer than 75 octets must be folded with CRLF + a single space.
function foldLine(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts = [];
  let current = '';
  for (const ch of line) {
    if (Buffer.byteLength(current + ch, 'utf8') > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.join('\r\n ');
}

function buildConsultationIcs({ uid, startsAt, endsAt, summary, description, url, sequence, cancelled }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CliniPause//Consultations//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:' + (cancelled ? 'CANCEL' : 'PUBLISH'),
    'BEGIN:VEVENT',
    'UID:' + uid,
    'SEQUENCE:' + (sequence || 0),
    'DTSTAMP:' + icsDate(new Date()),
    'DTSTART:' + icsDate(startsAt),
    'DTEND:' + icsDate(endsAt),
    'SUMMARY:' + icsEscape(summary),
    'DESCRIPTION:' + icsEscape(description),
    url ? 'URL:' + url : null,
    'LOCATION:' + icsEscape(url ? 'Online video call — ' + url : 'Online video call'),
    'STATUS:' + (cancelled ? 'CANCELLED' : 'CONFIRMED'),
    'ORGANIZER;CN=CliniPause:mailto:info@clinipausemd.com',
    cancelled ? null : 'BEGIN:VALARM',
    cancelled ? null : 'TRIGGER:-PT20M',
    cancelled ? null : 'ACTION:DISPLAY',
    cancelled ? null : 'DESCRIPTION:' + icsEscape(summary + ' starts in 20 minutes'),
    cancelled ? null : 'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean);

  return lines.map(foldLine).join('\r\n') + '\r\n';
}

module.exports = { buildConsultationIcs };
