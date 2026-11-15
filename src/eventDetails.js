export const EVENT_DETAILS = {
  dateLabel: 'NOVEMBER 15',
  venue: "Polish Combatants' Hall",
  venueMapUrl: 'https://www.google.com/maps/search/?api=1&query=Polish%20Combatants%27%20Hall%2C%20206%20Beverley%20St%2C%20Toronto%2C%20ON%20M5T%201Z3',
  // Judging runs 17:40-20:00 (starting ten minutes after dinner ends so teams can get there) in
  // Room 2 and Room 3. A third room, if the organizers set one, is Room 1.
  defaultJudgingStart: '17:40',
  judgingWindowMinutes: 140,
  defaultJudgingRooms: 2,
  judgingRoomNumbers: [2, 3, 1],
  // Each judging slot is the pitch, Q&A and a changeover: 8 + 2 + 1 = 11 minutes.
  pitchMinutes: 8,
  qaMinutes: 2,
  changeoverMinutes: 1,
  badgeWidthInches: 4,
  badgeHeightInches: 6,
  badgeGutterInches: 0.125,
  mealLimitPerParticipant: 2,
  // A second scan of the same badge this soon is a repeat, not the next meal. Lunch (11:30-12:30)
  // and dinner (5:00-5:30) are at least 4.5 hours apart, so one lunch can't be counted twice.
  mealScanCooldownMinutes: 180,
  // New applications are refused after this moment (Toronto time); sign-up stays open.
  applicationsCloseAt: '2026-11-08T23:59:59-05:00',
  applicationsCloseLabel: 'November 8',
  // Accepted hackers upload a signed waiver, then RSVP, before this moment (Toronto time).
  rsvpDeadline: '2026-11-14T23:59:59-05:00',
  rsvpDeadlineLabel: 'Saturday, November 14',
  waiverUrl: 'https://drive.google.com/file/d/1u-RfcxmQHRoTQUvw69gJ3bwTyFsd5adb/view?usp=sharing',
  hackerPackageUrl: 'https://drive.google.com/file/d/1CN7kNhDQsJM5UZt4y3W7-F_RTLJb0JI9/view?usp=sharing',
  devpostUrl: 'https://onhacks.devpost.com/',
  waiverMaxFiles: 4,
  waiverMaxFileBytes: 5 * 1024 * 1024,
  waiverRetentionDays: 45,
};

export function applicationsClosed(now = Date.now()) {
  return now > Date.parse(EVENT_DETAILS.applicationsCloseAt);
}

export const APPLICATIONS_CLOSED_MESSAGE = `Applications for ONHacks 2026 closed on ${EVENT_DETAILS.applicationsCloseLabel}.`;
