const DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)$/;
const DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const TIME = /^(\d\d):(\d\d):(\d\d(?:\.\d+)?)(z|([+-])(\d\d)(?::?(\d\d))?)?$/i;

function date(value) {
  const match = DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return month >= 1 && month <= 12 && day >= 1 && day <= (month === 2 && leap ? 29 : DAYS[month]);
}

function time(value) {
  const match = TIME.exec(value);
  if (!match || !match[4]) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3]);
  const zoneSign = match[5] === '-' ? -1 : 1;
  const zoneHour = Number(match[6] || 0);
  const zoneMinute = Number(match[7] || 0);
  if (zoneHour > 23 || zoneMinute > 59) return false;
  if (hour <= 23 && minute <= 59 && second < 60) return true;
  const utcMinute = minute - zoneMinute * zoneSign;
  const utcHour = hour - zoneHour * zoneSign - (utcMinute < 0 ? 1 : 0);
  return (utcHour === 23 || utcHour === -1)
    && (utcMinute === 59 || utcMinute === -1)
    && second < 61;
}

function dateTime(value) {
  const parts = value.split(/t|\s/i);
  return parts.length === 2 && date(parts[0]) && time(parts[1]);
}

module.exports = {
  fullFormats: {
    date: { validate: date },
    'date-time': { validate: dateTime },
  },
};
