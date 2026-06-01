import { ChangeEvent, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
  Loader2,
  RefreshCw,
  ScanText,
  ShieldCheck
} from 'lucide-react';
import { FIELD_NAMES, createEmptyUserData, type FieldName, type UserData } from './data/fieldNames';
import { createFilledPdf } from './lib/pdfFill';
import { parseOcrText, runOcrForDocument } from './lib/ocr';
import type { AppStep, OcrDocument } from './types';

const steps: AppStep[] = ['scan', 'ocr', 'review', 'fill', 'preview', 'download'];

const stepLabels: Record<AppStep, string> = {
  scan: 'Scan',
  ocr: 'OCR',
  review: 'Review & Edit',
  fill: 'Fill',
  preview: 'Preview',
  download: 'Download'
};

const hofFieldGroups: Array<{ title: string; fields: FieldName[] }> = [
  {
    title: 'Head of Family',
    fields: [
      'hof_name',
      'hof_dob',
      'hof_relation',
      'hof_aadhaar',
      'hof_pan',
      'hof_ration_card',
      'hof_epic',
      'hof_address',
      'hof_mobile'
    ]
  },
  {
    title: 'HOF Bank, Work, Education & Scheme',
    fields: [
      'hof_bank_name',
      'hof_bank_account',
      'hof_bank_ifsc',
      'hof_employment_status',
      'hof_education',
      'hof_scheme'
    ]
  }
];

const memberFields = [
  'name',
  'dob',
  'relation',
  'aadhaar',
  'pan',
  'ration_card',
  'epic',
  'address',
  'mobile',
  'bank_name',
  'bank_account',
  'bank_ifsc',
  'employment_status',
  'education',
  'scheme'
] as const;

const genderOptions = [
  { key: 'm', label: 'Male' },
  { key: 'f', label: 'Female' },
  { key: 'other', label: 'Other' }
] as const;

export default function App() {
  const [step, setStep] = useState<AppStep>('scan');
  const [documents, setDocuments] = useState<OcrDocument[]>([]);
  const [userData, setUserData] = useState<UserData>(() => createEmptyUserData());
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [filledPdfBytes, setFilledPdfBytes] = useState<Uint8Array | null>(null);

  const activeStepIndex = steps.indexOf(step);
  const completedDocs = documents.filter((doc) => doc.status === 'complete');
  const failedDocs = documents.filter((doc) => doc.status === 'error');
  const canReview = completedDocs.length > 0 && !isProcessing;
  const mappedFieldCount = useMemo(() => FIELD_NAMES.length, []);

  function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    setError('');
    setWarnings([]);
    setPreviewUrl('');
    setFilledPdfBytes(null);

    const nextDocs = files.map((file) => ({
      id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'queued' as const,
      progress: 0,
      text: ''
    }));

    setDocuments(nextDocs);
    setStep('scan');
  }

  async function startOcr(targetDocs = documents) {
    if (targetDocs.length === 0) {
      setError('Add at least one clear document image before OCR.');
      return;
    }

    setStep('ocr');
    setError('');
    setWarnings([]);
    setIsProcessing(true);

    const completed: OcrDocument[] = [];
    let sawError = false;

    for (const doc of targetDocs) {
      setDocuments((current) =>
        current.map((item) =>
          item.id === doc.id ? { ...item, status: 'processing', progress: 1, error: undefined } : item
        )
      );

      try {
        const result = await runOcrForDocument(doc, (progress) => {
          setDocuments((current) =>
            current.map((item) => (item.id === doc.id ? { ...item, progress } : item))
          );
        });

        const updated: OcrDocument = {
          ...doc,
          status: 'complete',
          progress: 100,
          text: result.text,
          confidence: result.confidence
        };

        if (typeof result.confidence === 'number' && result.confidence < 55) {
          setWarnings((current) => [
            ...current,
            `${doc.file.name}: OCR confidence is low. Retry with a sharper, better-lit scan if fields look wrong.`
          ]);
        }

        completed.push(updated);
        setDocuments((current) => current.map((item) => (item.id === doc.id ? updated : item)));
      } catch (caught) {
        sawError = true;
        const message = caught instanceof Error ? caught.message : 'OCR failed for this document.';
        setDocuments((current) =>
          current.map((item) =>
            item.id === doc.id
              ? {
                  ...item,
                  status: 'error',
                  progress: 0,
                  error: `${message}. Try a clearer scan and retry OCR.`
                }
              : item
          )
        );
      }
    }

    setIsProcessing(false);

    if (sawError) {
      setError('One or more scans could not be read. Retake blurry images or retry OCR.');
      return;
    }

    const parsed = parseOcrText(completed.map((doc) => doc.text));
    setUserData((current) => mergeParsedValues(current, parsed.values));
    setWarnings((current) => [...current, ...parsed.warnings]);
    setStep('review');
  }

  async function retryFailedOcr() {
    const retryDocs = failedDocs.length > 0 ? failedDocs : documents;
    await startOcr(retryDocs);
  }

  function updateField(field: FieldName, value: string) {
    setUserData((current) => ({ ...current, [field]: value }));
  }

  function updateGender(owner: 'hof' | `member${number}`, selected: 'm' | 'f' | 'other') {
    const keys =
      owner === 'hof'
        ? (['gender_m', 'gender_f', 'gender_other'] as FieldName[])
        : ([
            `${owner}_gender_m`,
            `${owner}_gender_f`,
            `${owner}_gender_other`
          ] as FieldName[]);

    setUserData((current) => ({
      ...current,
      [keys[0]]: selected === 'm' ? 'X' : '',
      [keys[1]]: selected === 'f' ? 'X' : '',
      [keys[2]]: selected === 'other' ? 'X' : ''
    }));
  }

  async function generatePdf() {
    setIsGenerating(true);
    setError('');

    try {
      // FUTURE PAYWALL GATE: require a short-lived paid JWT here before clean PDF generation.
      const bytes = await createFilledPdf(userData);
      const blob = createPdfBlob(bytes);
      const url = URL.createObjectURL(blob);

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFilledPdfBytes(bytes);
      setPreviewUrl(url);
      setStep('preview');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the filled PDF.');
    } finally {
      setIsGenerating(false);
    }
  }

  function downloadPdf() {
    if (!filledPdfBytes) return;
    const blob = createPdfBlob(filledPdfBytes);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'annapurna_filled.pdf';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Annapurna Yojana PDF Helper</p>
          <h1>Scan, review, fill, and download locally.</h1>
          <p className="subtitle">
            Unofficial helper tool. Review all fields and verify before submitting. Not affiliated
            with any government body.
          </p>
        </div>
        <div className="privacy-pill" aria-label="Privacy assurance">
          <ShieldCheck size={18} />
          <span>🔒 Your documents never leave your phone</span>
        </div>
      </header>

      <nav className="steps" aria-label="Application progress">
        {steps.map((item, index) => (
          <button
            type="button"
            key={item}
            className={index === activeStepIndex ? 'step active' : index < activeStepIndex ? 'step done' : 'step'}
            disabled={index > activeStepIndex}
            onClick={() => setStep(item)}
          >
            <span>{index + 1}</span>
            {stepLabels[item]}
          </button>
        ))}
      </nav>

      {error && (
        <section className="notice error" role="alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </section>
      )}

      {warnings.length > 0 && (
        <section className="notice warning">
          <AlertTriangle size={18} />
          <div>
            {warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        </section>
      )}

      <section className="workspace">
        {step === 'scan' && (
          <ScanPanel
            documents={documents}
            onFileSelection={handleFileSelection}
            onStartOcr={() => startOcr()}
          />
        )}

        {step === 'ocr' && (
          <OcrPanel
            documents={documents}
            isProcessing={isProcessing}
            canReview={canReview}
            onRetry={retryFailedOcr}
            onReview={() => setStep('review')}
          />
        )}

        {step === 'review' && (
          <ReviewPanel
            userData={userData}
            mappedFieldCount={mappedFieldCount}
            onUpdateField={updateField}
            onUpdateGender={updateGender}
            onConfirm={() => setStep('fill')}
          />
        )}

        {step === 'fill' && (
          <FillPanel isGenerating={isGenerating} onBack={() => setStep('review')} onGenerate={generatePdf} />
        )}

        {step === 'preview' && (
          <PreviewPanel previewUrl={previewUrl} onBack={() => setStep('review')} onNext={() => setStep('download')} />
        )}

        {step === 'download' && (
          <DownloadPanel onPreview={() => setStep('preview')} onDownload={downloadPdf} />
        )}
      </section>
    </main>
  );
}

function ScanPanel({
  documents,
  onFileSelection,
  onStartOcr
}: {
  documents: OcrDocument[];
  onFileSelection: (event: ChangeEvent<HTMLInputElement>) => void;
  onStartOcr: () => void;
}) {
  return (
    <div className="panel two-column">
      <section className="scan-input">
        <Camera size={34} />
        <h2>Scan documents</h2>
        <p>Use the rear camera or choose saved images for Aadhaar, PAN, ration card, or EPIC scans.</p>
        <label className="file-button">
          <Camera size={18} />
          Add scans
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={onFileSelection}
          />
        </label>
        <button className="primary-action" type="button" disabled={documents.length === 0} onClick={onStartOcr}>
          <ScanText size={18} />
          Start OCR
        </button>
      </section>
      <DocumentList documents={documents} />
    </div>
  );
}

function OcrPanel({
  documents,
  isProcessing,
  canReview,
  onRetry,
  onReview
}: {
  documents: OcrDocument[];
  isProcessing: boolean;
  canReview: boolean;
  onRetry: () => void;
  onReview: () => void;
}) {
  return (
    <div className="panel">
      <div className="section-heading">
        <div>
          <h2>OCR in progress</h2>
          <p>Text recognition runs entirely in this browser using English and Bengali models.</p>
        </div>
        {isProcessing && <Loader2 className="spin" size={28} />}
      </div>
      <DocumentList documents={documents} detailed />
      <div className="action-row">
        <button className="secondary-action" type="button" onClick={onRetry} disabled={isProcessing}>
          <RefreshCw size={18} />
          Retry blurry scans
        </button>
        <button className="primary-action" type="button" onClick={onReview} disabled={!canReview}>
          <FileCheck2 size={18} />
          Review extracted fields
        </button>
      </div>
    </div>
  );
}

function ReviewPanel({
  userData,
  mappedFieldCount,
  onUpdateField,
  onUpdateGender,
  onConfirm
}: {
  userData: UserData;
  mappedFieldCount: number;
  onUpdateField: (field: FieldName, value: string) => void;
  onUpdateGender: (owner: 'hof' | `member${number}`, selected: 'm' | 'f' | 'other') => void;
  onConfirm: () => void;
}) {
  return (
    <div className="panel">
      <div className="section-heading">
        <div>
          <h2>Review & edit</h2>
          <p>Nothing is written to the PDF until these fields are confirmed.</p>
        </div>
        <span className="field-count">{mappedFieldCount} contract fields</span>
      </div>

      <section className="form-section">
        <h3>HOF details</h3>
        <GenderControl
          owner="hof"
          values={{
            m: userData.gender_m,
            f: userData.gender_f,
            other: userData.gender_other
          }}
          onChange={onUpdateGender}
        />
        {hofFieldGroups.map((group) => (
          <div className="input-grid" key={group.title}>
            {group.fields.map((field) => (
              <FieldInput key={field} field={field} value={userData[field]} onChange={onUpdateField} />
            ))}
          </div>
        ))}
      </section>

      {Array.from({ length: 5 }, (_, index) => index + 1).map((memberNumber) => {
        const owner = `member${memberNumber}` as const;
        return (
          <details className="member-section" key={owner} open={memberNumber === 1}>
            <summary>Member {memberNumber}</summary>
            <GenderControl
              owner={owner}
              values={{
                m: userData[`${owner}_gender_m` as FieldName],
                f: userData[`${owner}_gender_f` as FieldName],
                other: userData[`${owner}_gender_other` as FieldName]
              }}
              onChange={onUpdateGender}
            />
            <div className="input-grid">
              {memberFields.map((field) => {
                const fullField = `${owner}_${field}` as FieldName;
                return (
                  <FieldInput key={fullField} field={fullField} value={userData[fullField]} onChange={onUpdateField} />
                );
              })}
            </div>
          </details>
        );
      })}

      <div className="action-row sticky-actions">
        <button className="primary-action" type="button" onClick={onConfirm}>
          <CheckCircle2 size={18} />
          Confirm reviewed data
        </button>
      </div>
    </div>
  );
}

function FillPanel({
  isGenerating,
  onBack,
  onGenerate
}: {
  isGenerating: boolean;
  onBack: () => void;
  onGenerate: () => void;
}) {
  return (
    <div className="panel centered">
      <FileText size={40} />
      <h2>Fill the original PDF</h2>
      <p>The app will load the supplied form and overlay confirmed values at calibrated coordinates.</p>
      <div className="action-row">
        <button className="secondary-action" type="button" onClick={onBack} disabled={isGenerating}>
          Edit fields
        </button>
        <button className="primary-action" type="button" onClick={onGenerate} disabled={isGenerating}>
          {isGenerating ? <Loader2 className="spin" size={18} /> : <FileCheck2 size={18} />}
          Create filled PDF
        </button>
      </div>
    </div>
  );
}

function PreviewPanel({
  previewUrl,
  onBack,
  onNext
}: {
  previewUrl: string;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="panel preview-panel">
      <div className="section-heading">
        <div>
          <h2>Preview completed form</h2>
          <p>Scroll the embedded PDF and verify every page before downloading.</p>
        </div>
        <div className="action-row compact">
          <button className="secondary-action" type="button" onClick={onBack}>
            Edit fields
          </button>
          <button className="primary-action" type="button" onClick={onNext}>
            Continue
          </button>
        </div>
      </div>
      {previewUrl ? (
        <iframe className="pdf-preview" title="Filled Annapurna PDF preview" src={previewUrl} />
      ) : (
        <p className="empty-state">Generate the PDF first to see the preview.</p>
      )}
    </div>
  );
}

function DownloadPanel({ onPreview, onDownload }: { onPreview: () => void; onDownload: () => void }) {
  return (
    <div className="panel centered">
      <Download size={42} />
      <h2>Download verified PDF</h2>
      <p>The file name will be `annapurna_filled.pdf`.</p>
      <div className="action-row">
        <button className="secondary-action" type="button" onClick={onPreview}>
          Back to preview
        </button>
        <button className="primary-action" type="button" onClick={onDownload}>
          <Download size={18} />
          Download PDF
        </button>
      </div>
    </div>
  );
}

function DocumentList({ documents, detailed = false }: { documents: OcrDocument[]; detailed?: boolean }) {
  if (documents.length === 0) {
    return <div className="empty-state">No scans added yet.</div>;
  }

  return (
    <section className="document-list" aria-label="Selected scans">
      {documents.map((doc) => (
        <article className="document-item" key={doc.id}>
          <img src={doc.previewUrl} alt="" />
          <div>
            <strong>{doc.file.name}</strong>
            <span>{formatBytes(doc.file.size)}</span>
            {detailed && (
              <>
                <progress value={doc.progress} max="100" />
                <span className={`status status-${doc.status}`}>
                  {doc.status}
                  {typeof doc.confidence === 'number' ? ` · ${Math.round(doc.confidence)}% confidence` : ''}
                </span>
                {doc.error && <p className="inline-error">{doc.error}</p>}
              </>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}

function FieldInput({
  field,
  value,
  onChange
}: {
  field: FieldName;
  value: string;
  onChange: (field: FieldName, value: string) => void;
}) {
  const label = field.replace(/_/g, ' ');
  const isAddress = field.endsWith('_address') || field === 'hof_address';

  return (
    <label className={isAddress ? 'field address-field' : 'field'}>
      <span>{label}</span>
      {isAddress ? (
        <textarea value={value} onChange={(event) => onChange(field, event.target.value)} rows={3} />
      ) : (
        <input value={value} onChange={(event) => onChange(field, event.target.value)} />
      )}
    </label>
  );
}

function GenderControl({
  owner,
  values,
  onChange
}: {
  owner: 'hof' | `member${number}`;
  values: Record<'m' | 'f' | 'other', string>;
  onChange: (owner: 'hof' | `member${number}`, selected: 'm' | 'f' | 'other') => void;
}) {
  return (
    <fieldset className="gender-control">
      <legend>Gender checkboxes</legend>
      {genderOptions.map((option) => (
        <label key={option.key}>
          <input
            type="radio"
            name={`${owner}-gender`}
            checked={values[option.key] === 'X'}
            onChange={() => onChange(owner, option.key)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mergeParsedValues(
  current: UserData,
  values: Partial<Record<FieldName, string>>
): UserData {
  const next: UserData = { ...current };
  for (const [field, value] of Object.entries(values)) {
    if (typeof value === 'string') next[field as FieldName] = value;
  }
  return next;
}

function createPdfBlob(bytes: Uint8Array): Blob {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: 'application/pdf' });
}
