import { recognize } from 'tesseract.js';
import type { LoggerMessage } from 'tesseract.js';
import type { OcrDocument, OcrParseResult } from '../types';

const aadhaarPattern = /\b\d{4}\s?\d{4}\s?\d{4}\b/g;
const panPattern = /\b[A-Z]{5}\d{4}[A-Z]\b/g;
const dobPattern = /\b\d{2}[/-]\d{2}[/-]\d{4}\b/g;
const mobilePattern = /\b(?:\+91[-\s]?)?[6-9]\d{9}\b/g;
const epicPattern = /\b[A-Z]{3}\d{7}\b/g;

const ignoredNameTokens = [
  'government',
  'india',
  'aadhaar',
  'unique',
  'identification',
  'authority',
  'dob',
  'birth',
  'male',
  'female',
  'address',
  'pan',
  'income',
  'department',
  'election',
  'commission',
  'ration'
];

export async function runOcrForDocument(
  doc: OcrDocument,
  onProgress: (progress: number, status?: string) => void
): Promise<Pick<OcrDocument, 'text' | 'confidence'>> {
  const result = await recognize(doc.file, 'eng+ben', {
    workerPath: `${import.meta.env.BASE_URL}tesseract/worker.min.js`,
    corePath: `${import.meta.env.BASE_URL}tesseract-core`,
    langPath: `${import.meta.env.BASE_URL}tessdata/`,
    logger: (message: LoggerMessage) => {
      if (message.status === 'recognizing text') {
        onProgress(Math.round((message.progress || 0) * 100), message.status);
      }
    }
  });

  return {
    text: result.data.text,
    confidence: result.data.confidence
  };
}

export function parseOcrText(texts: string[]): OcrParseResult {
  const combined = texts.join('\n').replace(/[^\S\r\n]+/g, ' ');
  const upperCombined = combined.toUpperCase();
  const warnings: string[] = [];
  const values: OcrParseResult['values'] = {};

  const aadhaar = combined.match(aadhaarPattern)?.[0];
  if (aadhaar) values.hof_aadhaar = aadhaar.replace(/\s+/g, ' ');

  const pan = upperCombined.match(panPattern)?.[0];
  if (pan) values.hof_pan = pan;

  const dob = combined.match(dobPattern)?.[0];
  if (dob) values.hof_dob = dob;

  const mobile = combined.match(mobilePattern)?.[0];
  if (mobile) values.hof_mobile = mobile.replace(/^\+91[-\s]?/, '');

  const epic = upperCombined.match(epicPattern)?.[0];
  if (epic) values.hof_epic = epic;

  const name = inferLikelyName(combined);
  if (name) values.hof_name = name;

  const address = inferLikelyAddress(combined);
  if (address) values.hof_address = address;

  if (!aadhaar) warnings.push('No Aadhaar pattern found. Review and enter it manually if needed.');
  if (!dob) warnings.push('No DOB pattern found. Review the scan or enter it manually.');
  if (!name) warnings.push('Name could not be confidently inferred. Please fill it in review.');
  if (!address) warnings.push('Address could not be confidently inferred. Please fill it in review.');

  return { values, warnings };
}

function inferLikelyName(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const normalized = line.replace(/[^A-Za-z\s.'-]/g, '').replace(/\s+/g, ' ').trim();
    if (normalized.length < 4 || normalized.length > 60) continue;
    if (!/[A-Za-z]/.test(normalized)) continue;
    if (ignoredNameTokens.some((token) => normalized.toLowerCase().includes(token))) continue;
    const words = normalized.split(' ').filter(Boolean);
    if (words.length >= 2 && words.length <= 5) return titleCase(normalized);
  }

  return '';
}

function inferLikelyAddress(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const addressIndex = lines.findIndex((line) => /address|ঠিকানা/i.test(line));
  if (addressIndex >= 0) {
    return lines
      .slice(addressIndex, addressIndex + 5)
      .join(' ')
      .replace(/address[:\s-]*/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const pincodeLine = lines.findIndex((line) => /\b\d{6}\b/.test(line));
  if (pincodeLine >= 0) {
    return lines
      .slice(Math.max(0, pincodeLine - 3), pincodeLine + 1)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return '';
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase())
    .replace(/\bMc([a-z])/g, (_, char: string) => `Mc${char.toUpperCase()}`);
}
