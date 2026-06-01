import type { FieldName } from './data/fieldNames';

export type AppStep = 'scan' | 'ocr' | 'review' | 'fill' | 'preview' | 'download';

export type OcrDocument = {
  id: string;
  file: File;
  previewUrl: string;
  status: 'queued' | 'processing' | 'complete' | 'error';
  progress: number;
  text: string;
  confidence?: number;
  error?: string;
};

export type FieldMapEntry = {
  field: FieldName;
  page: number;
  x: number;
  y: number;
  size: number;
  type?: 'text' | 'checkbox';
};

export type FieldMapFile = {
  _comment?: string;
  fieldNameContract?: FieldName[];
  fields: FieldMapEntry[];
};

export type OcrParseResult = {
  values: Partial<Record<FieldName, string>>;
  warnings: string[];
};
