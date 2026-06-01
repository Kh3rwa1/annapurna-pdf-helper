import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { CHECKBOX_FIELDS, FIELD_NAMES, isFieldName, type UserData } from '../data/fieldNames';
import type { FieldMapEntry, FieldMapFile } from '../types';

const FORM_PATH = `${import.meta.env.BASE_URL}forms/annapurna-form.pdf`;
const FIELD_MAP_PATH = `${import.meta.env.BASE_URL}fieldMap.json`;

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
    page.drawText(isCheckbox ? 'X' : value, {
      x: entry.x,
      y: entry.y,
      size: entry.size,
      font,
      color: rgb(0, 0, 0),
      maxWidth: 260,
      lineHeight: entry.size + 2
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
  }

  if (FIELD_NAMES.length === 0) {
    throw new Error('Field-name contract is empty');
  }
}
