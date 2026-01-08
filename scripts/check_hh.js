const fs = require('fs');
const path = require('path');

function getDayNameFromDate(d) {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return days[d.getDay()];
}

function parseTimeToMinutes(t) {
  if (!t) return NaN;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return NaN;
  return h * 60 + m;
}

function getHHStatusForDate(happyHours, date) {
  if (!happyHours || happyHours.length === 0) return 'CLOSED';
  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const today = getDayNameFromDate(date);

  const todays = (happyHours || []).filter(hh => Array.isArray(hh.days) && hh.days.includes(today));
  if (!todays.length) return 'CLOSED';

  for (const hh of todays) {
    const start = parseTimeToMinutes(hh.startTime || '');
    const end = parseTimeToMinutes(hh.endTime || '');
    if (Number.isNaN(start) || Number.isNaN(end)) continue;

    const inRange = start <= end
      ? currentMinutes >= start && currentMinutes < end
      : currentMinutes >= start || currentMinutes < end; // crosses midnight

    if (inRange) {
      const minsToEnd = end > start ? end - currentMinutes : (24 * 60 - currentMinutes) + end;
      if (minsToEnd <= 30) return 'ENDING_SOON';
      return 'ACTIVE';
    }

    const minsToStart = start >= currentMinutes ? start - currentMinutes : (24 * 60 - currentMinutes) + start;
    if (minsToStart <= 30) return 'STARTING_SOON';
  }

  return 'CLOSED';
}

function main() {
  const dataPath = path.join(process.cwd(), 'public', 'data', 'venues.json');
  if (!fs.existsSync(dataPath)) {
    console.error('venues.json not found at', dataPath);
    process.exit(2);
  }

  const venues = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const truck = venues.find(v => v.name && v.name.toLowerCase().includes('truck yard'));
  if (!truck) {
    console.error('Truck Yard not found in venues.json');
    process.exit(1);
  }

  console.log('Truck Yard happyHours from venues.json:', JSON.stringify(truck.happyHours || [], null, 2));

  // Build a Monday 18:00 test date (use nearest upcoming Monday)
  const today = new Date();
  const diff = (1 - today.getDay() + 7) % 7; // days until Monday
  const testDate = new Date(today);
  testDate.setDate(today.getDate() + diff);
  testDate.setHours(18, 0, 0, 0);

  console.log('Testing for date:', testDate.toString());
  const status = getHHStatusForDate(truck.happyHours || [], testDate);
  console.log('Evaluated status for Monday 18:00 ->', status);
}

main();
