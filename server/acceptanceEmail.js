import { EVENT_DETAILS } from '../src/eventDetails.js';
import { formatParticipantName } from '../src/participantName.js';

const siteUrl = 'https://onhacks.ca';
const instagramUrl = 'https://www.instagram.com/onhacks_/';
const contactEmail = 'hello@onhacks.ca';
const imageBase = `${siteUrl}/assets/email`;

const navy = '#0A1A2A';
const paper = '#F4F4F9';
const red = '#FF2E2E';
const font = 'Arial,Helvetica,sans-serif';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

export function firstNameFor(fullName) {
  return formatParticipantName(fullName).split(' ')[0] || '';
}

const link = (href, label) => `<a href="${href}" style="color:${navy};text-decoration:underline;">${label}</a>`;
const heading = (content) => `<h2 style="margin:32px 0 16px;font-family:${font};font-size:20px;line-height:1.3;font-weight:bold;color:${navy};">${content}</h2>`;

const stepRow = (number, content) => `<tr>
<td width="44" valign="top" style="padding:0 0 15px;">
<div style="width:30px;height:30px;line-height:30px;border-radius:50%;background:${navy};color:#ffffff;text-align:center;font-family:${font};font-size:14px;font-weight:bold;">${number}</div>
</td>
<td valign="top" style="padding:0 0 15px;font-family:${font};font-size:16px;line-height:1.6;color:${navy};">${content}</td>
</tr>`;

const bulletRow = (content) => `<tr>
<td width="20" valign="top" style="padding:9px 0 0;"><div style="width:8px;height:8px;background:${red};font-size:0;line-height:0;">&nbsp;</div></td>
<td valign="top" style="padding:0 0 11px;font-family:${font};font-size:16px;line-height:1.6;color:${navy};">${content}</td>
</tr>`;

// The acceptance email is deterministic for a given name, so the dry-run preview matches
// exactly what is sent. Gmail can't load the site's fonts, so the banner and the sand strip are
// images served from /assets/email; everything else is live text.
export function buildAcceptanceEmail(fullName) {
  const firstName = firstNameFor(fullName);
  const greeting = firstName ? `Dear ${firstName},` : 'Dear Hacker,';
  const deadline = EVENT_DETAILS.rsvpDeadlineLabel;
  const subject = "🎉 You're in! Welcome to ONHacks 2026";

  const text = [
    greeting,
    '',
    "After reviewing every application, the ONHacks team is honoured to invite you to ONHacks 2026. You've earned one of a limited number of seats, and we'd be delighted to have you with us.",
    '',
    'When: Sunday, November 15, 2026. Registration opens at 9:00 AM, and the event ends at 9:00 PM.',
    "Where: Polish Combatants' Hall, 206 Beverley St, Toronto, ON M5T 1Z3",
    '',
    `BY ${deadline.toUpperCase()}`,
    '',
    `1. Upload your signed waiver. Print the participant waiver (${EVENT_DETAILS.waiverUrl}). If you're under 18, have a parent or guardian sign it. Then sign in at ${siteUrl} and upload the signed waiver.`,
    "2. Confirm your spot. Once your waiver is submitted, click RSVP on your dashboard. Spots that aren't confirmed by then may go to other hackers.",
    `3. Join ONHacks on Devpost. You'll submit your project at ${EVENT_DETAILS.devpostUrl}. Use the same email you applied with, or your project won't reach the judges.`,
    `4. Read the hacker package (${EVENT_DETAILS.hackerPackageUrl}). It has the schedule, floor plan, prizes and what to bring.`,
    '',
    'ON THE DAY',
    '',
    '- Bring your laptop, chargers and an extension cable. Lunch and dinner are provided.',
    "- After you confirm your spot, your event pass with your meal QR code appears on your dashboard under Participant pass. It's also on your badge.",
    '- No team yet? No problem. Teams can have up to 4 people, and Team Finding starts at 10:20 AM.',
    '',
    `Questions? Reply to this email or reach us at ${contactEmail}. You can also find us on Instagram at @onhacks_ (${instagramUrl}).`,
    '',
    'With honour,',
    'The ONHacks 2026 Organizing Team',
  ].join('\n');

  const paragraph = (content, margin = '0 0 16px') => `<p style="margin:${margin};font-family:${font};font-size:16px;line-height:1.6;color:${navy};">${content}</p>`;
  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#CFE6F7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#CFE6F7" style="background:#CFE6F7;">
<tr><td align="center" style="padding:30px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${paper}" style="width:100%;max-width:600px;background:${paper};border-radius:18px;">
<tr><td style="padding:0;font-size:0;line-height:0;">
<img src="${imageBase}/acceptance-banner.jpg" width="600" alt="ONHacks 2026 Official Invitation. November 15, Polish Combatants' Hall." style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:18px 18px 0 0;">
</td></tr>
<tr><td style="padding:22px 34px 8px;">
${paragraph(escapeHtml(greeting))}
${paragraph(`After reviewing every application, the ONHacks team is honoured to invite you to <strong>ONHacks 2026</strong>. You&#39;ve earned one of a limited number of seats, and we&#39;d be delighted to have you with us.`, '0 0 22px')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="border-left:4px solid ${red};padding:4px 0 4px 16px;font-family:${font};font-size:16px;line-height:1.6;color:${navy};">
<strong>When:</strong> Sunday, November 15, 2026. Registration opens at 9:00 AM, and the event ends at 9:00 PM.<br><br>
<strong>Where:</strong> Polish Combatants&#39; Hall, 206 Beverley St, Toronto, ON M5T 1Z3
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding:28px 0 6px;">
<a href="${siteUrl}" style="display:inline-block;background:${red};color:#ffffff;font-family:${font};font-size:17px;font-weight:bold;text-decoration:none;padding:15px 34px;border-radius:999px;">Go to My Dashboard</a>
</td></tr>
</table>
${heading(`By ${escapeHtml(deadline)}`)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${stepRow(1, `<strong>Upload your signed waiver.</strong> Print the ${link(EVENT_DETAILS.waiverUrl, 'participant waiver')}. If you&#39;re under 18, have a parent or guardian sign it. Then sign in at ${link(siteUrl, 'onhacks.ca')} and upload the signed waiver.`)}
${stepRow(2, `<strong>Confirm your spot.</strong> Once your waiver is submitted, click <strong>RSVP</strong> on your dashboard. Spots that aren&#39;t confirmed by then may go to other hackers.`)}
${stepRow(3, `<strong>Join ONHacks on Devpost.</strong> You&#39;ll submit your project at ${link(EVENT_DETAILS.devpostUrl, 'onhacks.devpost.com')}. Use the same email you applied with, or your project won&#39;t reach the judges.`)}
${stepRow(4, `<strong>Read the hacker package.</strong> The ${link(EVENT_DETAILS.hackerPackageUrl, 'hacker package')} has the schedule, floor plan, prizes and what to bring.`)}
</table>
${heading('On the day')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${bulletRow('Bring your laptop, chargers and an extension cable. Lunch and dinner are provided.')}
${bulletRow('After you confirm your spot, your event pass with your meal QR code appears on your dashboard under <strong>Participant pass</strong>. It&#39;s also on your badge.')}
${bulletRow('No team yet? No problem. Teams can have up to 4 people, and Team Finding starts at 10:20 AM.')}
</table>
${paragraph(`Questions? Reply to this email or reach us at ${link(`mailto:${contactEmail}`, contactEmail)}. You can also find us on Instagram at ${link(instagramUrl, '@onhacks_')}.`, '24px 0 0')}
${paragraph('With honour,<br>The ONHacks 2026 Organizing Team', '30px 0 0')}
</td></tr>
<tr><td style="padding:0;font-size:0;line-height:0;">
<img src="${imageBase}/acceptance-footer.jpg" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:0 0 18px 18px;">
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, text, html, replyTo: contactEmail };
}
