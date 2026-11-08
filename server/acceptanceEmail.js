import { EVENT_DETAILS } from '../src/eventDetails.js';
import { formatParticipantName } from '../src/participantName.js';

const siteUrl = 'https://onhacks.ca';
const instagramUrl = 'https://www.instagram.com/onhacks_/';
const contactEmail = 'hello@onhacks.ca';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

export function firstNameFor(fullName) {
  return formatParticipantName(fullName).split(' ')[0] || '';
}

const link = (href, label) => `<a href="${href}" style="color:#FF2E2E;font-weight:bold;">${label}</a>`;

// The acceptance email is deterministic for a given name, so the dry-run preview matches
// exactly what is sent.
export function buildAcceptanceEmail(fullName) {
  const firstName = firstNameFor(fullName);
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  const deadline = EVENT_DETAILS.rsvpDeadlineLabel;
  const subject = "You're in! Welcome to ONHacks 2026";

  const text = [
    greeting,
    '',
    "Congratulations, you've been accepted to ONHacks 2026! We can't wait to see what you build.",
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
    'See you on the 15th!',
    'The ONHacks Team',
  ].join('\n');

  const paragraph = (content) => `<p style="margin:0 0 16px;">${content}</p>`;
  const heading = (content) => `<h2 style="margin:24px 0 12px;font-size:16px;color:#0A1A2A;">${content}</h2>`;
  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f4f6f8;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2933;">
<div style="background:#ffffff;border-radius:12px;padding:28px 24px;">
${paragraph(escapeHtml(greeting))}
${paragraph("Congratulations, you've been accepted to <strong>ONHacks 2026</strong>! We can't wait to see what you build.")}
${paragraph('<strong>When:</strong> Sunday, November 15, 2026. Registration opens at 9:00 AM, and the event ends at 9:00 PM.<br><strong>Where:</strong> Polish Combatants&#39; Hall, 206 Beverley St, Toronto, ON M5T 1Z3')}
${heading(`By ${escapeHtml(deadline)}`)}
<ol style="margin:0 0 16px;padding-left:22px;">
<li style="margin-bottom:10px;"><strong>Upload your signed waiver.</strong> Print the ${link(EVENT_DETAILS.waiverUrl, 'participant waiver')}. If you&#39;re under 18, have a parent or guardian sign it. Then sign in at ${link(siteUrl, 'onhacks.ca')} and upload the signed waiver.</li>
<li style="margin-bottom:10px;"><strong>Confirm your spot.</strong> Once your waiver is submitted, click <strong>RSVP</strong> on your dashboard. Spots that aren&#39;t confirmed by then may go to other hackers.</li>
<li style="margin-bottom:10px;"><strong>Join ONHacks on Devpost.</strong> You&#39;ll submit your project at ${link(EVENT_DETAILS.devpostUrl, 'onhacks.devpost.com')}. Use the same email you applied with, or your project won&#39;t reach the judges.</li>
<li style="margin-bottom:10px;"><strong>Read the ${link(EVENT_DETAILS.hackerPackageUrl, 'hacker package')}.</strong> It has the schedule, floor plan, prizes and what to bring.</li>
</ol>
${heading('On the day')}
<ul style="margin:0 0 16px;padding-left:22px;">
<li style="margin-bottom:10px;">Bring your laptop, chargers and an extension cable. Lunch and dinner are provided.</li>
<li style="margin-bottom:10px;">After you confirm your spot, your event pass with your meal QR code appears on your dashboard under <strong>Participant pass</strong>. It&#39;s also on your badge.</li>
<li style="margin-bottom:10px;">No team yet? No problem. Teams can have up to 4 people, and Team Finding starts at 10:20 AM.</li>
</ul>
${paragraph(`Questions? Reply to this email or reach us at ${link(`mailto:${contactEmail}`, contactEmail)}. You can also find us on Instagram at ${link(instagramUrl, '@onhacks_')}.`)}
<p style="margin:0;">See you on the 15th!<br>The ONHacks Team</p>
</div>
</div>
</body>
</html>`;

  return { subject, text, html, replyTo: contactEmail };
}
