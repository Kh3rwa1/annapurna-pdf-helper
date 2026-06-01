import { recognize } from 'tesseract.js';
import type { LoggerMessage } from 'tesseract.js';
import { isFieldName, type FieldName } from '../data/fieldNames';
import type { OcrDocument, OcrParseResult, OcrTargetPrefix } from '../types';

const aadhaarPattern = /\b\d{4}\s?\d{4}\s?\d{4}\b/g;
const panPattern = /\b[A-Z]{5}\d{4}[A-Z]\b/g;
const dobPattern = /\b\d{2}[/-]\d{2}[/-]\d{4}\b/g;
const mobilePattern = /\b(?:\+91[-\s]?)?[6-9]\d{9}\b/g;
const epicPattern = /\b[A-Z]{3}\d{7}\b/g;
const dobLabels = [/DOB/i, /date\s+of\s+birth/i, /birth/i, /জন্ম/i];
const panLabels = [/PAN/i, /permanent\s+account\s+number/i, /income\s+tax/i];
const epicLabels = [/EPIC/i, /voter/i, /elector/i, /election\s+commission/i];
const ocrAssetPaths = [
  'tesseract/worker.min.js',
  'tesseract-core/tesseract-core-simd-lstm.wasm.js',
  'tessdata/eng.traineddata.gz',
  'tessdata/ben.traineddata.gz'
] as const;

let ocrAssetsReady: Promise<void> | null = null;

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
  await ensureOcrAssetsAvailable();

  try {
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
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Unknown OCR error';
    throw new Error(`OCR failed in this browser: ${message}`);
  }
}

export function parseOcrText(texts: string[], targetPrefix: OcrTargetPrefix): OcrParseResult {
  const combined = texts.join('\n').replace(/[^\S\r\n]+/g, ' ');
  const upperCombined = combined.toUpperCase();
  const warnings: string[] = [];
  const values: OcrParseResult['values'] = {};

  const writeValue = (suffix: OcrFieldSuffix, value: string) => {
    const field = getTargetField(targetPrefix, suffix);
    if (field) values[field] = value;
  };

  const aadhaar = firstMatch(combined, aadhaarPattern);
  if (aadhaar) writeValue('aadhaar', aadhaar.replace(/\s+/g, ' '));

  const pan = bestContextualMatch(upperCombined, panPattern, panLabels);
  if (pan) writeValue('pan', pan);

  const dob = bestContextualMatch(combined, dobPattern, dobLabels);
  if (dob) writeValue('dob', dob);

  const mobile = firstMatch(combined, mobilePattern);
  if (mobile) writeValue('mobile', mobile.replace(/^\+91[-\s]?/, ''));

  const epic = bestContextualMatch(upperCombined, epicPattern, epicLabels);
  if (epic) writeValue('epic', epic);

  const name = inferLikelyName(combined);
  if (name) writeValue('name', name);

  const address = inferLikelyAddress(combined);
  if (address) writeValue('address', address);

  if (!aadhaar) warnings.push('No Aadhaar pattern found. Review and enter it manually if needed.');
  if (!dob) warnings.push('No DOB pattern found. Review the scan or enter it manually.');
  if (!name) warnings.push('Name could not be confidently inferred. Please fill it in review.');
  if (!address) warnings.push('Address could not be confidently inferred. Please fill it in review.');

  return { values, warnings };
}

type OcrFieldSuffix = 'name' | 'aadhaar' | 'dob' | 'pan' | 'mobile' | 'epic' | 'address';

function getTargetField(targetPrefix: OcrTargetPrefix, suffix: OcrFieldSuffix): FieldName | null {
  const field = `${targetPrefix}_${suffix}`;
  return isFieldName(field) ? field : null;
}

function firstMatch(text: string, pattern: RegExp): string {
  return getMatches(text, pattern)[0]?.value || '';
}

function bestContextualMatch(text: string, pattern: RegExp, labels: RegExp[]): string {
  const matches = getMatches(text, pattern);
  if (matches.length <= 1) return matches[0]?.value || '';

  const scored = matches.map((match, index) => ({
    ...match,
    score: contextualScore(text, match.index, match.value.length, labels),
    index
  }));

  scored.sort((a, b) => a.score - b.score || a.index - b.index);
  return scored[0]?.value || '';
}

function getMatches(text: string, pattern: RegExp): Array<{ value: string; index: number }> {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  return Array.from(text.matchAll(matcher), (match) => ({
    value: match[0],
    index: match.index ?? 0
  }));
}

function contextualScore(text: string, index: number, length: number, labels: RegExp[]): number {
  const contextStart = Math.max(0, index - 90);
  const contextEnd = Math.min(text.length, index + length + 90);
  const context = text.slice(contextStart, contextEnd);

  if (labels.some((label) => label.test(context))) return 0;

  const labelIndexes = labels.flatMap((label) => getMatches(text, label).map((match) => match.index));
  if (labelIndexes.length === 0) return Number.MAX_SAFE_INTEGER;

  return Math.min(...labelIndexes.map((labelIndex) => Math.abs(labelIndex - index)));
}

async function ensureOcrAssetsAvailable(): Promise<void> {
  ocrAssetsReady ??= Promise.all(ocrAssetPaths.map(assertAssetAvailable)).then(() => undefined);
  return ocrAssetsReady;
}

async function assertAssetAvailable(path: string): Promise<void> {
  const url = `${import.meta.env.BASE_URL}${path}`;
  try {
    const response = await fetch(url, { cache: 'force-cache' });
    await response.body?.cancel();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (caught) {
    const detail = caught instanceof Error ? caught.message : 'asset request failed';
    throw new Error(
      `Offline OCR asset missing or unavailable at "${url}" (${detail}). Run "npm install" or "npm run copy:tessdata --workspace frontend" and reload.`
    );
  }
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
