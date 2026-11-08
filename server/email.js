// All ONHacks email goes through Brevo's transactional API (sign-up verification, application
// receipts, and acceptance emails). The sender must be verified in Brevo (hello@onhacks.ca is).
const brevoUrl = 'https://api.brevo.com/v3/smtp/email';

export class EmailError extends Error {
  constructor(message, { status = 0, code = '', uncertain = false, retryAfter = null } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    // True when there was no clear answer from Brevo, so the email may or may not have gone out.
    this.uncertain = uncertain;
    this.retryAfter = retryAfter;
  }
}

export function parseSender(value) {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(value);
  if (match) return match[1] ? { name: match[1], email: match[2].trim() } : { email: match[2].trim() };
  return { email: value.trim() };
}

// Returns the Brevo settings from BREVO_API_KEY and EMAIL_FROM, or null when email isn't set up.
export function emailSettings(env = process.env) {
  const apiKey = env.BREVO_API_KEY?.trim() || '';
  const from = env.EMAIL_FROM?.trim() || '';
  return apiKey && from ? { apiKey, from, sender: parseSender(from) } : null;
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

// Brevo needs an HTML body, so plain-text emails get a simple paragraph version.
export const textToHtml = (text) => text.split(/\n{2,}/)
  .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`).join('');

export async function sendEmail(settings, { to, toName, subject, text, html, replyTo, tags }) {
  let response;
  try {
    response = await fetch(brevoUrl, {
      method: 'POST',
      headers: { 'api-key': settings.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: settings.sender,
        to: [{ email: to, ...(toName ? { name: toName.slice(0, 70) } : {}) }],
        subject,
        htmlContent: html || textToHtml(text),
        textContent: text,
        ...(replyTo ? { replyTo: { email: replyTo } } : {}),
        ...(tags?.length ? { tags } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new EmailError(`No response from Brevo (${error.message}).`, { uncertain: true });
  }
  const data = await response.json().catch(() => ({}));
  if (response.ok) return { messageId: data.messageId || null };
  const retryAfter = Number(response.headers.get('retry-after'));
  throw new EmailError(`Brevo returned HTTP ${response.status}: ${data.message || data.code || 'no details'}`, {
    status: response.status,
    code: data.code || '',
    uncertain: response.status >= 500,
    retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
  });
}
