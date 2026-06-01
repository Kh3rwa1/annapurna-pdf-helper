import type { ChangeEvent } from 'react';
import type { FieldName, UserData } from '../data/fieldNames';
import type { AppStep, OcrDocument, OcrTargetPrefix } from '../types';

export type UiMode = 'agent' | 'assist';

export type FlowProps = {
  step: AppStep;
  setStep: (step: AppStep) => void;
  documents: OcrDocument[];
  userData: UserData;
  warnings: string[];
  error: string;
  isProcessing: boolean;
  isGenerating: boolean;
  previewUrl: string;
  canReview: boolean;
  mappedFieldCount: number;
  handleFileSelection: (event: ChangeEvent<HTMLInputElement>) => void;
  startOcr: (targetDocs?: OcrDocument[]) => Promise<void>;
  retryFailedOcr: () => Promise<void>;
  reviewExtractedFields: (options?: { moveToAgentReview?: boolean }) => boolean;
  updateField: (field: FieldName, value: string) => void;
  updateDocumentTarget: (documentId: string, targetPrefix: OcrTargetPrefix) => void;
  updateGender: (owner: 'hof' | `member${number}`, selected: 'm' | 'f' | 'other') => void;
  generatePdf: () => Promise<boolean>;
  downloadPdf: () => void;
};
