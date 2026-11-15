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

// Where the name goes, in inches from the badge's top: above the QR code on a hacker's badge,
// or larger across the lower half of a badge without a QR code (judges, organizers).
const nameAreas = {
  withQr: { top: 3.05, height: 0.48, maxSize: 26 },
  noQr: { top: 3.2, height: 2.1, maxSize: 40 },
};
// Emoji and other pictographs aren't in the badge fonts, so they are dropped from a name
// rather than leaving that hacker without a badge.
const pictographs = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{So}️‍⃣]/gu;

function layoutName(pdf, name, fonts, maxWidthInches, area) {
  const words = nameRuns(name, fonts);
  const maxWidth = maxWidthInches * point;
  // First look for a size that keeps every word whole; only split a word if none fits.
  for (const keepWordsWhole of [true, false]) {
    for (let size = area.maxSize; size >= 7.5; size -= 0.5) {
      if (keepWordsWhole && words.some((word) => measureRuns(pdf, word, size) > maxWidth)) continue;
      const layout = wrapName(pdf, words, size, maxWidth);
      if (layout.length * size * 1.15 <= area.height * point) return { layout, size, area };
    }
  }
  throw badgeNameError(name, 'the name does not fit in the badge name area');
}

// maxWidthInches is the name area's width: 3.15 in on the standard 4 in wide badge.
function fitName(pdf, rawName, fonts, maxWidthInches = 3.15, area = nameAreas.withQr) {
  const displayName = formatParticipantName(rawName);
  try {
    return layoutName(pdf, displayName, fonts, maxWidthInches, area);
  } catch (error) {
    const simplified = displayName.replace(pictographs, '').replace(/\s+/g, ' ').trim();
    if (error.code !== 'UNSUPPORTED_BADGE_NAME' || !simplified || simplified === displayName) throw error;
    return layoutName(pdf, simplified, fonts, maxWidthInches, area);
  }
}

// badgeWidthInches is the width of the badge being drawn (4 in for the standard badge); the
// name is centred across it.
function drawName(pdf, { layout, size, area }, x, y, badgeWidthInches = 4) {
  const lineHeight = size * 1.15;
  const top = y + area.top * point + (area.height * point - layout.length * lineHeight) / 2;
  for (const [index, line] of layout.entries()) {
    let left = x + (badgeWidthInches / 2) * point - measureRuns(pdf, line, size) / 2;
    for (const run of line) {
      pdf.font(run.font.name).fontSize(size).fillColor('#000000');
      pdf.text(run.text, left, top + index * lineHeight, { lineBreak: false });
      left += pdf.widthOfString(run.text);
    }
  }
}

// Draws one line of text centred on centerX with its top at top.
function centerText(pdf, text, centerX, top, options = {}) {
  const width = pdf.widthOfString(text, options);
  pdf.text(text, centerX - width / 2, top, { lineBreak: false, ...options });
}

// The black-and-white badge for mono printers: white paper, a black frame, the pixel whale in
// greys, the wordmark, and a black band naming the role (PARTICIPANT, JUDGE, ORGANIZER). The
// frame and band span the badge's width (4 in normally; wider when the badge is fitted to a set
// width); everything else is centred. The name and QR code keep the colour badge's positions.
function drawMonoBadge(pdf, x, y, whale, badgeWidthInches = 4, role = 'PARTICIPANT') {
  const inch = point;
  const inset = 0.14 * inch;
  const inner = badgeWidthInches * inch - 2 * inset;
  const centerX = x + (badgeWidthInches / 2) * inch;
  pdf.save();
  pdf.lineWidth(1.6).strokeColor('#000000')
    .roundedRect(x + inset, y + inset, inner, 6 * inch - 2 * inset, 0.22 * inch).stroke();

  const whaleHeight = 1.32 * inch;
  const whaleWidth = whaleHeight * (435 / 516);
  pdf.image(whale, centerX - whaleWidth / 2, y + 0.36 * inch, { width: whaleWidth, height: whaleHeight });

  pdf.font('BadgeDisplay').fontSize(30).fillColor('#000000');
  centerText(pdf, 'ONHACKS', centerX, y + 1.72 * inch);
  pdf.font('BadgeName').fontSize(8.5);
  centerText(pdf, `${EVENT_DETAILS.dateLabel}, 2026 · TORONTO`, centerX, y + 2.24 * inch, { characterSpacing: 1.2 });

  const bandTop = y + 2.5 * inch;
  const bandHeight = 0.42 * inch;
  pdf.rect(x + inset, bandTop, inner, bandHeight).fill('#000000');
  pdf.font('BadgeDisplay').fontSize(17).fillColor('#FFFFFF');
  centerText(pdf, role, centerX, bandTop + (bandHeight - 17 * 1.2) / 2 + 1, { characterSpacing: 1.5 });

  pdf.font('BadgeName').fontSize(8).fillColor('#000000');
  centerText(pdf, 'onhacks.ca', centerX, y + 5.6 * inch);
  pdf.restore();
}

// Page sizes in inches, width x height. Two 4-inch badges plus the gutter (8.125 in) leave
// under 2 mm per side on portrait A4, which printers clip, so A4 is laid out sideways.
export const paperLayouts = {
  letter: { size: [8.5, 11], rows: 1 },
  tabloid: { size: [11, 17], rows: 2 },
  a4: { size: [297 / 25.4, 210 / 25.4], rows: 1 },
};

// style 'color' (default) prints the full-colour lanyard design; 'mono' is for black-and-white
// printers.
export const badgeStyles = ['color', 'mono'];

// The smallest page margin most printers can print to (inches).
const printableMargin = 0.15;

// Draws cut marks in the page margins along every grid line, so each line is one straight cut
// across the page (badges in a fitted grid share their edges).
// originX and originY are also the page's side and top margins (the grid is centred), so a mark
// is shortened when its margin is thin, stopping 2 mm short of the paper edge.
function drawGridCutMarks(pdf, originX, originY, columns, rows, boxWidth, boxHeight) {
  const gap = 0.03;
  const markLength = (margin) => Math.max(0.05, Math.min(0.18, margin - gap - 0.08)) * point;
  const verticalMark = markLength(originY);
  const horizontalMark = markLength(originX);
  const left = originX * point;
  const top = originY * point;
  const right = (originX + columns * boxWidth) * point;
  const bottom = (originY + rows * boxHeight) * point;
  pdf.save().strokeColor('#000000').lineWidth(0.6);
  for (let column = 0; column <= columns; column += 1) {
    const lineX = (originX + column * boxWidth) * point;
    pdf.moveTo(lineX, top - gap * point - verticalMark).lineTo(lineX, top - gap * point).stroke();
    pdf.moveTo(lineX, bottom + gap * point).lineTo(lineX, bottom + gap * point + verticalMark).stroke();
  }
  for (let row = 0; row <= rows; row += 1) {
    const lineY = (originY + row * boxHeight) * point;
    pdf.moveTo(left - gap * point - horizontalMark, lineY).lineTo(left - gap * point, lineY).stroke();
    pdf.moveTo(right + gap * point, lineY).lineTo(right + gap * point + horizontalMark, lineY).stroke();
  }
  pdf.restore();
}

// heightInches scales the badge design to that height, and widthInches sets the badge's cut
// width. The mono design stretches its frame and band to the width and centres the rest; the
// colour design (a fixed image) is centred with blank space either side. When either size is
// set, as many badges as fit go on each page in an edge-to-edge grid; otherwise the standard
// 4 x 6 layout for the paper size is used.
export async function createBadgePdf(badges, paper, {
  style = 'color', heightInches = EVENT_DETAILS.badgeHeightInches, widthInches,
} = {}) {
  const layout = paperLayouts[paper];
  if (!layout) throw new Error(`Unknown paper size: ${paper}`);
  if (!badgeStyles.includes(style)) throw new Error(`Unknown badge style: ${style}`);
  const mono = style === 'mono';
  const { size: dimensions, rows } = layout;
  const width = EVENT_DETAILS.badgeWidthInches;
  const height = EVENT_DETAILS.badgeHeightInches;
  const scale = heightInches / height;
  const boxWidth = widthInches ?? width * scale;
  const boxHeight = heightInches;
  if (boxWidth < width * scale * (mono ? 0.8 : 1)) throw new Error('The badge is too narrow for its design.');
  const fitted = scale !== 1 || boxWidth !== width;
  // The design's own width, in its unscaled inches: wider than 4 when the mono badge stretches.
  const designWidth = mono ? boxWidth / scale : width;
  const sideSpace = mono ? 0 : (boxWidth - width * scale) / 2;
  let columns = 2;
  let rowsPerPage = rows;
  let gutter = EVENT_DETAILS.badgeGutterInches;
  if (fitted) {
    columns = Math.floor((dimensions[0] - 2 * printableMargin) / boxWidth);
    rowsPerPage = Math.floor((dimensions[1] - 2 * printableMargin) / boxHeight);
    if (!columns || !rowsPerPage) throw new Error('The badge is larger than the printable area of the paper.');
    gutter = 0;
  }
  const perPage = columns * rowsPerPage;
  const left = (dimensions[0] - (columns * boxWidth + (columns - 1) * gutter)) / 2;
  const top = (dimensions[1] - (rowsPerPage * boxHeight + (rowsPerPage - 1) * gutter)) / 2;
  const [template, displayFont, ...fontBuffers] = await Promise.all([
    readFile(path.join(root, mono ? 'badge_whale_bw.png' : 'lanyard_design.png')),
    mono ? readFile(path.join(root, 'public/fonts/bungee.ttf')) : null,
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
  if (displayFont) pdf.registerFont('BadgeDisplay', displayFont);

  // Lay out every name first; a name the bundled fonts can't render is reported and skipped
  // so it doesn't stop everyone else's badge.
  const prepared = [];
  const skipped = [];
  for (const badge of badges) {
    try {
      // A mono badge without a QR code (judges, organizers) gives the name the QR code's space.
      const area = mono && !badge.qrValue ? nameAreas.noQr : nameAreas.withQr;
      prepared.push({ badge, name: fitName(pdf, badge.name, fonts, designWidth - 0.85, area) });
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
      if (index && index % perPage === 0) {
        if (fitted) drawGridCutMarks(pdf, left, top, columns, rowsPerPage, boxWidth, boxHeight);
        pdf.addPage();
      }
      const sheetIndex = index % perPage;
      const boxX = (left + (sheetIndex % columns) * (boxWidth + gutter)) * point;
      const boxY = (top + Math.floor(sheetIndex / columns) * (boxHeight + gutter)) * point;
      // The badge is drawn in its own unscaled inch coordinates (6 in tall), then scaled into its box.
      pdf.save();
      pdf.translate(boxX + sideSpace * point, boxY);
      pdf.scale(scale);
      const x = 0;
      const y = 0;
      if (mono) {
        drawMonoBadge(pdf, x, y, template, designWidth, badge.role);
      } else {
        pdf.image(template, x, y, { width: width * point, height: height * point });
        pdf.fillColor('#FFFFFF').rect(x + 0.4 * point, y + 3.03 * point, 3.2 * point, 0.52 * point).fill();
        pdf.rect(x + 1.055 * point, y + 3.67 * point, 1.89 * point, 1.89 * point).fill();
      }
      drawName(pdf, name, x, y, designWidth);

      if (badge.qrValue || !mono) {
        const qrData = await QRCode.toDataURL(badge.qrValue, {
          errorCorrectionLevel: 'M', margin: 4, width: 700,
        });
        pdf.image(Buffer.from(qrData.split(',')[1], 'base64'), x + (designWidth / 2 - 0.93) * point, y + 3.685 * point,
          { width: 1.86 * point, height: 1.86 * point });
      }
      pdf.restore();

      if (!fitted) {
        pdf.strokeColor('#78828C').lineWidth(0.004 * point);
        for (const edgeX of [boxX, boxX + width * point]) {
          pdf.moveTo(edgeX, boxY - 0.045 * point).lineTo(edgeX, boxY - 0.012 * point).stroke();
          pdf.moveTo(edgeX, boxY + height * point + 0.012 * point)
            .lineTo(edgeX, boxY + height * point + 0.045 * point).stroke();
        }
        for (const edgeY of [boxY, boxY + height * point]) {
          pdf.moveTo(boxX - 0.045 * point, edgeY).lineTo(boxX - 0.012 * point, edgeY).stroke();
          pdf.moveTo(boxX + width * point + 0.012 * point, edgeY)
            .lineTo(boxX + width * point + 0.045 * point, edgeY).stroke();
        }
      }
    }
    if (fitted) drawGridCutMarks(pdf, left, top, columns, rowsPerPage, boxWidth, boxHeight);
    pdf.end();
    return { pdf: await output, printed: prepared.map(({ badge }) => badge), skipped };
  } catch (error) {
    pdf.destroy();
    throw error;
  }
}
