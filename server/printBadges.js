import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import * as fontkit from 'fontkit';
import QRCode from 'qrcode';
import { EVENT_DETAILS } from '../src/eventDetails.js';
import { formatParticipantName } from '../src/participantName.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const point = 72;
const graphemes = new Intl.Segmenter('und', { granularity: 'grapheme' });
const fontFiles = [
  ['BadgeName', 'jetbrains-mono-700.ttf'],
  ['BadgeEastAsian', 'noto-sans-sc-static.ttf'],
  ['BadgeKorean', 'noto-sans-kr-static.ttf'],
  ['BadgeArabic', 'noto-naskh-arabic-static.ttf'],
  ['BadgeDevanagari', 'noto-sans-devanagari-static.ttf'],
  ['BadgeHebrew', 'noto-sans-hebrew-static.ttf'],
];

function badgeNameError(name, reason) {
  const error = new Error(`Cannot print a badge for ${name}: ${reason}.`);
  error.code = 'UNSUPPORTED_BADGE_NAME';
  return error;
}

function supports(font, value) {
  return [...value].every((character) => {
    const codePoint = character.codePointAt(0);
    return font.face.hasGlyphForCodePoint(codePoint) || /\p{Cf}/u.test(character);
  });
}

function nameRuns(name, fonts) {
  const wholeNameFont = fonts.find((font) => supports(font, name));
  if (wholeNameFont) return name.split(' ').map((word) => [{ text: word, font: wholeNameFont }]);

  const words = name.split(' ').map((word) => {
    const wholeWordFont = fonts.find((font) => supports(font, word));
    if (wholeWordFont) return [{ text: word, font: wholeWordFont }];

    const runs = [];
    for (const { segment } of graphemes.segment(word)) {
      const font = fonts.find((candidate) => supports(candidate, segment));
      if (!font) throw badgeNameError(name, 'its characters are not covered by the bundled badge fonts');
      const last = runs.at(-1);
      if (last?.font === font) last.text += segment;
      else runs.push({ text: segment, font });
    }
    return runs;
  });
  return words;
}

function measureRuns(pdf, runs, size) {
  return runs.reduce((width, run) => {
    pdf.font(run.font.name).fontSize(size);
    return width + pdf.widthOfString(run.text);
  }, 0);
}

function appendRuns(line, runs) {
  for (const run of runs) {
    const previous = line.at(-1);
    if (previous?.font === run.font) previous.text += run.text;
    else line.push({ ...run });
  }
}

function wrapName(pdf, words, size, maxWidth) {
  const lines = [];
  let line = [];
  const finishLine = () => {
    if (line.length) lines.push(line);
    line = [];
  };

  for (const word of words) {
    const withSpace = line.length
      ? [{ text: ' ', font: line.at(-1).font }, ...word] : word;
    const candidate = line.map((run) => ({ ...run }));
    appendRuns(candidate, withSpace);
    if (measureRuns(pdf, candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    finishLine();
    if (measureRuns(pdf, word, size) <= maxWidth) {
      appendRuns(line, word);
      continue;
    }
    for (const run of word) {
      for (const { segment } of graphemes.segment(run.text)) {
        const next = line.map((part) => ({ ...part }));
        appendRuns(next, [{ text: segment, font: run.font }]);
        if (line.length && measureRuns(pdf, next, size) > maxWidth) finishLine();
        appendRuns(line, [{ text: segment, font: run.font }]);
      }
    }
  }
  finishLine();
  return lines;
}

const nameHeight = 0.48 * point;
// Emoji and other pictographs aren't in the badge fonts, so they are dropped from a name
// rather than leaving that hacker without a badge.
const pictographs = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{So}️‍⃣]/gu;

function layoutName(pdf, name, fonts) {
  const words = nameRuns(name, fonts);
  for (let size = 26; size >= 7.5; size -= 0.5) {
    const layout = wrapName(pdf, words, size, 3.15 * point);
    if (layout.length * size * 1.15 <= nameHeight) return { layout, size };
  }
  throw badgeNameError(name, 'the name does not fit in the badge name area');
}

function fitName(pdf, rawName, fonts) {
  const displayName = formatParticipantName(rawName);
  try {
    return layoutName(pdf, displayName, fonts);
  } catch (error) {
    const simplified = displayName.replace(pictographs, '').replace(/\s+/g, ' ').trim();
    if (error.code !== 'UNSUPPORTED_BADGE_NAME' || !simplified || simplified === displayName) throw error;
    return layoutName(pdf, simplified, fonts);
  }
}

function drawName(pdf, { layout, size }, x, y) {
  const lineHeight = size * 1.15;
  const top = y + 3.05 * point + (nameHeight - layout.length * lineHeight) / 2;
  for (const [index, line] of layout.entries()) {
    let left = x + 2 * point - measureRuns(pdf, line, size) / 2;
    for (const run of line) {
      pdf.font(run.font.name).fontSize(size).fillColor('#000000');
      pdf.text(run.text, left, top + index * lineHeight, { lineBreak: false });
      left += pdf.widthOfString(run.text);
    }
  }
}

// Page sizes in inches, width x height. Two 4-inch badges plus the gutter (8.125 in) leave
// under 2 mm per side on portrait A4, which printers clip, so A4 is laid out sideways.
export const paperLayouts = {
  letter: { size: [8.5, 11], rows: 1 },
  tabloid: { size: [11, 17], rows: 2 },
  a4: { size: [297 / 25.4, 210 / 25.4], rows: 1 },
};

export async function createBadgePdf(badges, paper) {
  const layout = paperLayouts[paper];
  if (!layout) throw new Error(`Unknown paper size: ${paper}`);
  const { size: dimensions, rows } = layout;
  const perPage = 2 * rows;
  const width = EVENT_DETAILS.badgeWidthInches;
  const height = EVENT_DETAILS.badgeHeightInches;
  const gutter = EVENT_DETAILS.badgeGutterInches;
  const left = (dimensions[0] - (2 * width + gutter)) / 2;
  const top = (dimensions[1] - (rows * height + (rows - 1) * gutter)) / 2;
  const [template, ...fontBuffers] = await Promise.all([
    readFile(path.join(root, 'lanyard_design.png')),
    ...fontFiles.map(([, file]) => readFile(path.join(root, 'public/fonts', file))),
  ]);
  const pdf = new PDFDocument({ size: dimensions.map((value) => value * point), margin: 0, compress: true });
  const chunks = [];
  const output = new Promise((resolve, reject) => {
    pdf.on('data', (chunk) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
  });
  const fonts = fontFiles.map(([name], index) => {
    const buffer = fontBuffers[index];
    pdf.registerFont(name, buffer);
    return { name, face: fontkit.create(buffer) };
  });

  // Lay out every name first; a name the bundled fonts can't render is reported and skipped
  // so it doesn't stop everyone else's badge.
  const prepared = [];
  const skipped = [];
  for (const badge of badges) {
    try {
      prepared.push({ badge, name: fitName(pdf, badge.name, fonts) });
    } catch (error) {
      if (error.code !== 'UNSUPPORTED_BADGE_NAME') {
        pdf.destroy();
        throw error;
      }
      skipped.push({ badge, reason: error.message });
    }
  }
  if (!prepared.length) {
    pdf.destroy();
    return { pdf: null, printed: [], skipped };
  }

  try {
    for (const [index, { badge, name }] of prepared.entries()) {
      if (index && index % perPage === 0) pdf.addPage();
      const sheetIndex = index % perPage;
      const x = (left + (sheetIndex % 2) * (width + gutter)) * point;
      const y = (top + Math.floor(sheetIndex / 2) * (height + gutter)) * point;
      pdf.image(template, x, y, { width: width * point, height: height * point });

      pdf.fillColor('#FFFFFF').rect(x + 0.4 * point, y + 3.03 * point, 3.2 * point, 0.52 * point).fill();
      pdf.rect(x + 1.055 * point, y + 3.67 * point, 1.89 * point, 1.89 * point).fill();
      drawName(pdf, name, x, y);

      const qrData = await QRCode.toDataURL(badge.qrValue, {
        errorCorrectionLevel: 'M', margin: 4, width: 700,
      });
      pdf.image(Buffer.from(qrData.split(',')[1], 'base64'), x + 1.07 * point, y + 3.685 * point,
        { width: 1.86 * point, height: 1.86 * point });

      pdf.strokeColor('#78828C').lineWidth(0.004 * point);
      for (const edgeX of [x, x + width * point]) {
        pdf.moveTo(edgeX, y - 0.045 * point).lineTo(edgeX, y - 0.012 * point).stroke();
        pdf.moveTo(edgeX, y + height * point + 0.012 * point)
          .lineTo(edgeX, y + height * point + 0.045 * point).stroke();
      }
      for (const edgeY of [y, y + height * point]) {
        pdf.moveTo(x - 0.045 * point, edgeY).lineTo(x - 0.012 * point, edgeY).stroke();
        pdf.moveTo(x + width * point + 0.012 * point, edgeY)
          .lineTo(x + width * point + 0.045 * point, edgeY).stroke();
      }
    }
    pdf.end();
    return { pdf: await output, printed: prepared.map(({ badge }) => badge), skipped };
  } catch (error) {
    pdf.destroy();
    throw error;
  }
}
