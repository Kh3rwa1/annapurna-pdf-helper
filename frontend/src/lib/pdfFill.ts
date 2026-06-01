import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { PDFFont } from 'pdf-lib';
import { CHECKBOX_FIELDS, FIELD_NAMES, isFieldName, type UserData } from '../data/fieldNames';
import type { FieldMapEntry, FieldMapFile } from '../types';

const FORM_PATH = `${import.meta.env.BASE_URL}forms/annapurna-form.pdf`;
const FIELD_MAP_PATH = `${import.meta.env.BASE_URL}fieldMap.json`;
const DEFAULT_MAX_WIDTH = 260;
const DEFAULT_ADDRESS_MAX_WIDTH = 220;
const MIN_FONT_SIZE = 6;

export async function createFilledPdf(userData: UserData): Promise<Uint8Array> {
  const [pdfBytes, fieldMap] = await Promise.all([
    fetchArrayBuffer(FORM_PATH),
    fetchFieldMap()
  ]);

  const pdfDoc = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  for (const entry of fieldMap.fields) {
    const value = userData[entry.field]?.trim();
    if (!value) continue;

    const page = pages[entry.page - 1];
    if (!page) {
      throw new Error(`Field map references missing page ${entry.page} for ${entry.field}`);
    }

    const isCheckbox = entry.type === 'checkbox' || CHECKBOX_FIELDS.has(entry.field);
    if (isCheckbox) {
      page.drawText('X', {
        x: entry.x,
        y: entry.y,
        size: entry.size,
        font,
        color: rgb(0, 0, 0)
      });
      continue;
    }

    const maxWidth = entry.maxWidth ?? defaultMaxWidthForField(entry);
    const maxLines = Math.max(1, Math.floor(entry.maxLines ?? defaultMaxLinesForField(entry)));
    const fitted = fitTextToBox(value, font, entry.size, maxWidth, maxLines);

    page.drawText(fitted.text, {
      x: entry.x,
      y: entry.y,
      size: fitted.size,
      font,
      color: rgb(0, 0, 0),
      maxWidth,
      lineHeight: fitted.lineHeight
    });
  }

  return pdfDoc.save({ useObjectStreams: false });
}

async function fetchArrayBuffer(path: string): Promise<ArrayBuffer> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return response.arrayBuffer();
}

async function fetchFieldMap(): Promise<FieldMapFile> {
  const response = await fetch(FIELD_MAP_PATH);
  if (!response.ok) throw new Error('Could not load fieldMap.json');

  const raw = (await response.json()) as Partial<FieldMapFile> | FieldMapEntry[];
  const fieldMap: FieldMapFile = Array.isArray(raw)
    ? { fields: raw }
    : {
        _comment: raw._comment,
        fieldNameContract: raw.fieldNameContract,
        fields: raw.fields || []
      };

  validateFieldMap(fieldMap);
  return fieldMap;
}

function validateFieldMap(fieldMap: FieldMapFile): void {
  if (!Array.isArray(fieldMap.fields)) {
    throw new Error('fieldMap.json must contain a fields array');
  }

  if (fieldMap.fieldNameContract) {
    const expected = FIELD_NAMES.join('|');
    const actual = fieldMap.fieldNameContract.join('|');
    if (expected !== actual) {
      throw new Error('fieldMap.json fieldNameContract does not match the app field-name contract');
    }
  }

  for (const entry of fieldMap.fields) {
    if (!isFieldName(entry.field)) {
      throw new Error(`Unknown fieldMap field "${entry.field}". Update FIELD_NAMES.md and app data first.`);
    }

    for (const key of ['page', 'x', 'y', 'size'] as const) {
      if (typeof entry[key] !== 'number' || Number.isNaN(entry[key])) {
        throw new Error(`Field "${entry.field}" has an invalid ${key} coordinate`);
      }
    }

    for (const key of ['maxWidth', 'maxLines'] as const) {
      if (
        entry[key] !== undefined &&
        (typeof entry[key] !== 'number' || Number.isNaN(entry[key]) || entry[key] <= 0)
      ) {
        throw new Error(`Field "${entry.field}" has an invalid optional ${key} value`);
      }
    }
  }

  if (FIELD_NAMES.length === 0) {
    throw new Error('Field-name contract is empty');
  }
}

function defaultMaxWidthForField(entry: FieldMapEntry): number {
  return isAddressField(entry) ? DEFAULT_ADDRESS_MAX_WIDTH : DEFAULT_MAX_WIDTH;
}

function defaultMaxLinesForField(entry: FieldMapEntry): number {
  return isAddressField(entry) ? 2 : 1;
}

function isAddressField(entry: FieldMapEntry): boolean {
  return entry.field === 'hof_address' || entry.field.endsWith('_address');
}

function fitTextToBox(
  value: string,
  font: PDFFont,
  initialSize: number,
  maxWidth: number,
  maxLines: number
): { text: string; size: number; lineHeight: number } {
  let size = initialSize;

  while (size >= MIN_FONT_SIZE) {
    const lines = wrapText(value, font, size, maxWidth);
    if (lines.length <= maxLines && lines.every((line) => fitsWidth(line, font, size, maxWidth))) {
      return { text: lines.join('\n'), size, lineHeight: size + 2 };
    }
    size -= 0.5;
  }

  const lines = wrapText(value, font, MIN_FONT_SIZE, maxWidth);
  const visibleLines = lines.slice(0, maxLines);
  if (visibleLines.length === 0) {
    return { text: '', size: MIN_FONT_SIZE, lineHeight: MIN_FONT_SIZE + 2 };
  }

  if (lines.length > maxLines) {
    const lastIndex = visibleLines.length - 1;
    visibleLines[lastIndex] = truncateToWidth(visibleLines[lastIndex], font, MIN_FONT_SIZE, maxWidth);
  }

  return {
    text: visibleLines.map((line) => truncateToWidth(line, font, MIN_FONT_SIZE, maxWidth)).join('\n'),
    size: MIN_FONT_SIZE,
    lineHeight: MIN_FONT_SIZE + 2
  };
}

function wrapText(value: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = value.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (fitsWidth(candidate, font, size, maxWidth)) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) lines.push(currentLine);
    currentLine = fitsWidth(word, font, size, maxWidth)
      ? word
      : truncateToWidth(word, font, size, maxWidth);
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

function fitsWidth(value: string, font: PDFFont, size: number, maxWidth: number): boolean {
  return font.widthOfTextAtSize(value, size) <= maxWidth;
}

function truncateToWidth(value: string, font: PDFFont, size: number, maxWidth: number): string {
  const suffix = '...';
  const trimmed = value.trim();
  if (fitsWidth(trimmed, font, size, maxWidth)) return trimmed;
  if (!fitsWidth(suffix, font, size, maxWidth)) return '';

  let end = trimmed.length;
  while (end > 0) {
    const candidate = `${trimmed.slice(0, end).trimEnd()}${suffix}`;
    if (fitsWidth(candidate, font, size, maxWidth)) return candidate;
    end -= 1;
  }

  return suffix;
}
