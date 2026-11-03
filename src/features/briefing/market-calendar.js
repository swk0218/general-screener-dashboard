// Reviewed NYSE schedule, not an observation or a claim that any engine has run.
// Emergency closures require a reviewed table update; expired coverage holds.
export const MARKET_CALENDAR = Object.freeze({
  source: 'https://www.nyse.com/markets/hours-calendars',
  checked_at: '2026-11-03T03:20:00Z',
  valid_until: '2026-11-10T03:20:00Z',
  start: '2026-01-01', end: '2026-12-31',
  holidays: ['2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25'],
  early: ['2026-11-27','2026-12-24']
});

const localParts = stamp => Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
  timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', hourCycle:'h23'
}).formatToParts(stamp).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));

export function latestCompletedSession(now = Date.now(), calendar = MARKET_CALENDAR) {
  if (!Number.isFinite(now) || !calendar || !Number.isFinite(Date.parse(calendar.valid_until))
    || now >= Date.parse(calendar.valid_until) || !/^\d{4}-\d{2}-\d{2}$/.test(calendar.start || '')
    || !/^\d{4}-\d{2}-\d{2}$/.test(calendar.end || '') || calendar.start > calendar.end
    || !Array.isArray(calendar.holidays) || !Array.isArray(calendar.early)) return null;
  const local=localParts(now), today=`${local.year}-${local.month}-${local.day}`;
  if(today<calendar.start || today>calendar.end) return null;
  for(let offset=0;offset<10;offset++) {
    const day=new Date(Date.parse(`${today}T12:00:00Z`)-offset*86400000);
    const session=day.toISOString().slice(0,10);
    if(session<calendar.start) return null;
    if([0,6].includes(day.getUTCDay()) || calendar.holidays.includes(session)) continue;
    const closeHour=calendar.early.includes(session)?13:16;
    if(offset===0 && Number(local.hour)<closeHour) continue;
    // Use the IANA timezone database, never a month-based DST guess.
    const candidate=Date.parse(`${session}T${String(closeHour+4).padStart(2,'0')}:00:00Z`);
    const difference=closeHour-Number(localParts(candidate).hour);
    const close=candidate+difference*3600000;
    return Object.freeze({session, close_utc:new Date(close).toISOString(), source:calendar.source,
      calendar_checked_at:calendar.checked_at, calendar_valid_until:calendar.valid_until});
  }
  return null;
}
