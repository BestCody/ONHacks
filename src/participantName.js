export function formatParticipantName(value) {
  if (typeof value !== 'string') return '';

  return value.trim().replace(/\s+/gu, ' ')
    .replace(/(^|[^\p{L}\p{N}])(\p{L})/gu,
      (_match, separator, letter) => separator + letter.toLocaleUpperCase());
}
