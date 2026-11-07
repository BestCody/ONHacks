export const EVENT_DETAILS = {
  dateLabel: 'NOVEMBER 15',
  venue: "Polish Combatants' Hall",
  // Judging runs 17:30-20:00 in Room 1 and Room 2 (see the hacker package schedule).
  defaultJudgingStart: '17:30',
  judgingWindowMinutes: 150,
  defaultJudgingRooms: 2,
  pitchMinutes: 5,
  changeoverMinutes: 1,
  badgeWidthInches: 4,
  badgeHeightInches: 6,
  badgeGutterInches: 0.125,
  mealLimitPerParticipant: 2,
  // A second scan of the same badge this soon is a repeat, not the next meal (lunch and dinner are hours apart).
  mealScanCooldownMinutes: 30,
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
