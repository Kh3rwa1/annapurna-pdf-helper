import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Camera,
  Check,
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
  GraduationCap,
  HeartHandshake,
  Home,
  Loader2,
  Plus,
  RefreshCw,
  ScanText,
  ShieldCheck,
  User,
  Users,
  Volume2,
  VolumeX,
  type LucideIcon
} from 'lucide-react';
import { FIELD_NAMES, createEmptyUserData, type FieldName, type UserData } from './data/fieldNames';
import { t, type LocaleKey } from './lib/i18n';
import { createFilledPdf } from './lib/pdfFill';
import { parseOcrText, runOcrForDocument } from './lib/ocr';
import { speakPrompt, stopSpeaking } from './lib/voice';
import type { AppStep, OcrDocument, OcrParseResult, OcrTargetPrefix } from './types';

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

const ocrTargetOptions: Array<{ value: OcrTargetPrefix; label: string }> = [
  { value: 'hof', label: 'HOF' },
  { value: 'member1', label: 'Member 1' },
  { value: 'member2', label: 'Member 2' },
  { value: 'member3', label: 'Member 3' },
  { value: 'member4', label: 'Member 4' },
  { value: 'member5', label: 'Member 5' }
];

type UiMode = 'agent' | 'assist';

type AssistOwner = 'hof' | `member${number}`;
type MemberFieldSuffix = (typeof memberFields)[number];
type AssistInputMode = 'text' | 'numeric' | 'tel';

type AssistChoice = {
  label: LocaleKey;
  value: string;
  icon: LucideIcon;
};

type AssistGenderChoice = {
  label: LocaleKey;
  value: 'm' | 'f' | 'other';
  icon: LucideIcon;
};

type AssistScreen =
  | { kind: 'photo'; question: LocaleKey }
  | {
      kind: 'text';
      question: LocaleKey;
      field: FieldName;
      multiline?: boolean;
      inputMode?: AssistInputMode;
    }
  | { kind: 'gender'; question: LocaleKey; owner: AssistOwner }
  | { kind: 'choice'; question: LocaleKey; field: FieldName; choices: AssistChoice[] }
  | { kind: 'add-member'; question: LocaleKey }
  | { kind: 'review'; question: LocaleKey }
  | { kind: 'preview'; question: LocaleKey }
  | { kind: 'download'; question: LocaleKey };

type FlowProps = {
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

const modeStorageKey = 'annapurna-ui-mode';

const assistTargetOptions: Array<{ value: OcrTargetPrefix; label: LocaleKey }> = [
  { value: 'hof', label: 'assist.target.you' },
  { value: 'member1', label: 'assist.target.member1' },
  { value: 'member2', label: 'assist.target.member2' },
  { value: 'member3', label: 'assist.target.member3' },
  { value: 'member4', label: 'assist.target.member4' },
  { value: 'member5', label: 'assist.target.member5' }
];

const assistGenderChoices: AssistGenderChoice[] = [
  { label: 'choice.male', value: 'm', icon: User },
  { label: 'choice.female', value: 'f', icon: HeartHandshake },
  { label: 'choice.otherGender', value: 'other', icon: Users }
];

const relationChoices: AssistChoice[] = [
  { label: 'choice.spouse', value: 'Spouse', icon: HeartHandshake },
  { label: 'choice.child', value: 'Child', icon: User },
  { label: 'choice.parent', value: 'Parent', icon: Home },
  { label: 'choice.otherRelation', value: 'Other', icon: Users }
];

const employmentChoices: AssistChoice[] = [
  { label: 'choice.workDaily', value: 'Daily wage work', icon: Briefcase },
  { label: 'choice.workSelf', value: 'Self-employed', icon: User },
  { label: 'choice.workNone', value: 'Unemployed', icon: Home },
  { label: 'choice.workOther', value: 'Other', icon: Users }
];

const educationChoices: AssistChoice[] = [
  { label: 'choice.eduNone', value: 'No schooling', icon: Home },
  { label: 'choice.eduPrimary', value: 'Primary', icon: GraduationCap },
  { label: 'choice.eduSecondary', value: 'Secondary', icon: GraduationCap },
  { label: 'choice.eduHigher', value: 'Higher', icon: GraduationCap }
];

const schemeChoices: AssistChoice[] = [
  { label: 'choice.schemeFood', value: 'Food assistance', icon: HeartHandshake },
  { label: 'choice.schemePension', value: 'Pension', icon: Home },
  { label: 'choice.schemeHealth', value: 'Health support', icon: CheckCircle2 },
  { label: 'choice.schemeOther', value: 'Other', icon: Users }
];

const hofAssistScreens: AssistScreen[] = [
  { kind: 'photo', question: 'assist.photo.title' },
  { kind: 'text', question: 'assist.name', field: 'hof_name' },
  { kind: 'text', question: 'assist.dob', field: 'hof_dob', inputMode: 'numeric' },
  { kind: 'gender', question: 'assist.gender', owner: 'hof' },
  { kind: 'text', question: 'assist.aadhaar', field: 'hof_aadhaar', inputMode: 'numeric' },
  { kind: 'text', question: 'assist.address', field: 'hof_address', multiline: true },
  {
    kind: 'choice',
    question: 'assist.employment',
    field: 'hof_employment_status',
    choices: employmentChoices
  },
  { kind: 'choice', question: 'assist.education', field: 'hof_education', choices: educationChoices },
  { kind: 'choice', question: 'assist.scheme', field: 'hof_scheme', choices: schemeChoices }
];

function getInitialMode(): UiMode {
  if (typeof window === 'undefined') return 'agent';
  return window.localStorage.getItem(modeStorageKey) === 'assist' ? 'assist' : 'agent';
}

export default function App() {
  const [mode, setMode] = useState<UiMode>(() => getInitialMode());
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

  useEffect(() => {
    window.localStorage.setItem(modeStorageKey, mode);
  }, [mode]);

  function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    setError('');
    setWarnings([]);
    setPreviewUrl('');
    setFilledPdfBytes(null);

    const nextDocs = files.map((file, index) => ({
      id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
      file,
      previewUrl: URL.createObjectURL(file),
      targetPrefix: ocrTargetOptions[Math.min(index, ocrTargetOptions.length - 1)].value,
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
  }

  function reviewExtractedFields(options: { moveToAgentReview?: boolean } = {}): boolean {
    const parseableDocs = documents.filter((doc) => doc.status === 'complete' && doc.text.trim());
    if (parseableDocs.length === 0) {
      setError('Run OCR successfully before reviewing extracted fields.');
      return false;
    }

    const parsedDocs = parseableDocs.map((doc) => ({
      doc,
      parsed: parseOcrText([doc.text], doc.targetPrefix)
    }));
    const parseWarnings = formatParseWarnings(parsedDocs);

    setUserData((current) => mergeParsedDocumentValues(current, parsedDocs));
    setWarnings((current) => [...current, ...parseWarnings]);
    setError('');
    if (options.moveToAgentReview ?? true) setStep('review');
    return true;
  }

  async function retryFailedOcr() {
    const retryDocs = failedDocs.length > 0 ? failedDocs : documents;
    await startOcr(retryDocs);
  }

  function updateField(field: FieldName, value: string) {
    setUserData((current) => ({ ...current, [field]: value }));
  }

  function updateDocumentTarget(documentId: string, targetPrefix: OcrTargetPrefix) {
    setDocuments((current) =>
      current.map((doc) => (doc.id === documentId ? { ...doc, targetPrefix } : doc))
    );
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

  async function generatePdf(): Promise<boolean> {
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
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the filled PDF.');
      return false;
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

  const flowProps: FlowProps = {
    step,
    setStep,
    documents,
    userData,
    warnings,
    error,
    isProcessing,
    isGenerating,
    previewUrl,
    canReview,
    mappedFieldCount,
    handleFileSelection,
    startOcr,
    retryFailedOcr,
    reviewExtractedFields,
    updateField,
    updateDocumentTarget,
    updateGender,
    generatePdf,
    downloadPdf
  };

  return (
    <>
      <ModeToggle mode={mode} onChange={setMode} />
      {mode === 'agent' ? <AgentFlow {...flowProps} /> : <AssistFlow {...flowProps} />}
    </>
  );
}

function ModeToggle({ mode, onChange }: { mode: UiMode; onChange: (mode: UiMode) => void }) {
  return (
    <div className="mode-toggle-wrap">
      <div className="mode-toggle" role="group" aria-label="Mode">
        <button
          type="button"
          className={mode === 'agent' ? 'mode-choice active' : 'mode-choice'}
          onClick={() => onChange('agent')}
        >
          {t('mode.agent', {}, mode === 'assist' ? 'bn' : 'en')}
        </button>
        <button
          type="button"
          className={mode === 'assist' ? 'mode-choice active' : 'mode-choice'}
          onClick={() => onChange('assist')}
        >
          {t('mode.assist', {}, mode === 'assist' ? 'bn' : 'en')}
        </button>
      </div>
    </div>
  );
}

function AgentFlow({
  step,
  setStep,
  documents,
  userData,
  warnings,
  error,
  isProcessing,
  isGenerating,
  previewUrl,
  canReview,
  mappedFieldCount,
  handleFileSelection,
  startOcr,
  retryFailedOcr,
  reviewExtractedFields,
  updateField,
  updateDocumentTarget,
  updateGender,
  generatePdf,
  downloadPdf
}: FlowProps) {
  const activeStepIndex = steps.indexOf(step);

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
            onTargetChange={updateDocumentTarget}
            onStartOcr={() => startOcr()}
          />
        )}

        {step === 'ocr' && (
          <OcrPanel
            documents={documents}
            isProcessing={isProcessing}
            canReview={canReview}
            onTargetChange={updateDocumentTarget}
            onRetry={retryFailedOcr}
            onReview={() => reviewExtractedFields()}
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
          <FillPanel isGenerating={isGenerating} onBack={() => setStep('review')} onGenerate={() => void generatePdf()} />
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

function AssistFlow({
  documents,
  userData,
  warnings,
  error,
  isProcessing,
  isGenerating,
  previewUrl,
  handleFileSelection,
  startOcr,
  retryFailedOcr,
  reviewExtractedFields,
  updateField,
  updateDocumentTarget,
  updateGender,
  generatePdf,
  downloadPdf
}: FlowProps) {
  const [screenIndex, setScreenIndex] = useState(0);
  const [memberCount, setMemberCount] = useState(0);
  const [muted, setMuted] = useState(false);
  const screens = useMemo(() => buildAssistScreens(memberCount), [memberCount]);
  const activeIndex = Math.min(screenIndex, screens.length - 1);
  const screen = screens[activeIndex];
  const question = t(screen.question);
  const hasCompletedDocuments = documents.some((doc) => doc.status === 'complete');

  useEffect(() => {
    if (screenIndex > screens.length - 1) setScreenIndex(screens.length - 1);
  }, [screenIndex, screens.length]);

  useEffect(() => {
    speakPrompt(question, muted);
    return () => stopSpeaking();
  }, [muted, question]);

  function goBack() {
    setScreenIndex((current) => Math.max(0, current - 1));
  }

  function goNext() {
    setScreenIndex((current) => Math.min(screens.length - 1, current + 1));
  }

  function handlePhotoNext() {
    if (hasCompletedDocuments) {
      reviewExtractedFields({ moveToAgentReview: false });
    }
    goNext();
  }

  function handleAddMember(addMember: boolean) {
    if (addMember && memberCount < 5) {
      setMemberCount((current) => Math.min(5, current + 1));
      return;
    }

    goNext();
  }

  async function handleReviewConfirm() {
    const generated = await generatePdf();
    if (generated) goNext();
  }

  function renderScreen() {
    switch (screen.kind) {
      case 'photo':
        return (
          <AssistPhotoStep
            documents={documents}
            isProcessing={isProcessing}
            onFileSelection={handleFileSelection}
            onTargetChange={updateDocumentTarget}
            onReadDocuments={() => void startOcr()}
            onRetry={() => void retryFailedOcr()}
          />
        );
      case 'text':
        return (
          <AssistTextStep
            screen={screen}
            value={userData[screen.field]}
            onUpdate={(value) => updateField(screen.field, value)}
          />
        );
      case 'gender':
        return (
          <AssistGenderStep
            owner={screen.owner}
            selected={selectedGender(screen.owner, userData)}
            onChange={(selected) => updateGender(screen.owner, selected)}
          />
        );
      case 'choice':
        return (
          <AssistChoiceStep
            choices={screen.choices}
            selectedValue={userData[screen.field]}
            onSelect={(value) => updateField(screen.field, value)}
          />
        );
      case 'add-member':
        return <AssistAddMemberStep onAnswer={handleAddMember} />;
      case 'review':
        return <AssistReviewStep userData={userData} memberCount={memberCount} />;
      case 'preview':
        return <AssistPreviewStep previewUrl={previewUrl} />;
      case 'download':
        return <AssistDownloadStep />;
    }
  }

  function renderActions() {
    if (screen.kind === 'add-member') {
      return (
        <div className="assist-nav">
          <button className="assist-back" type="button" onClick={goBack} disabled={activeIndex === 0}>
            <ArrowLeft size={22} />
            {t('assist.back')}
          </button>
        </div>
      );
    }

    if (screen.kind === 'review') {
      return (
        <div className="assist-nav">
          <button className="assist-back" type="button" onClick={goBack}>
            <ArrowLeft size={22} />
            {t('assist.review.edit')}
          </button>
          <button className="assist-next" type="button" onClick={() => void handleReviewConfirm()} disabled={isGenerating}>
            {isGenerating ? <Loader2 className="spin" size={22} /> : <Check size={22} />}
            {t('assist.review.confirm')}
          </button>
        </div>
      );
    }

    if (screen.kind === 'download') {
      return (
        <div className="assist-nav">
          <button className="assist-back" type="button" onClick={goBack}>
            <ArrowLeft size={22} />
            {t('assist.back')}
          </button>
          <button className="assist-next" type="button" onClick={downloadPdf}>
            <Download size={22} />
            {t('assist.download.button')}
          </button>
        </div>
      );
    }

    return (
      <div className="assist-nav">
        <button className="assist-back" type="button" onClick={goBack} disabled={activeIndex === 0}>
          <ArrowLeft size={22} />
          {t('assist.back')}
        </button>
        <button
          className="assist-next"
          type="button"
          onClick={screen.kind === 'photo' ? handlePhotoNext : goNext}
          disabled={isProcessing}
        >
          {screen.kind === 'photo' && isProcessing ? <Loader2 className="spin" size={22} /> : <ArrowRight size={22} />}
          {screen.kind === 'photo' && hasCompletedDocuments ? t('assist.photo.next') : t('assist.next')}
        </button>
      </div>
    );
  }

  return (
    <main className="assist-shell">
      <header className="assist-topbar">
        <div>
          <p className="assist-eyebrow">{t('app.title')}</p>
          <h1>{question}</h1>
        </div>
        <div className="assist-privacy">{t('privacy')}</div>
      </header>

      <section className="assist-progress" aria-label={t('assist.progress', { current: activeIndex + 1, total: screens.length })}>
        <span>{t('assist.progress', { current: activeIndex + 1, total: screens.length })}</span>
        <progress value={activeIndex + 1} max={screens.length} />
      </section>

      <section className="assist-card">
        <div className="assist-toolbar">
          <button className="assist-listen" type="button" onClick={() => speakPrompt(question, false)}>
            <Volume2 size={20} />
            {t('assist.listen')}
          </button>
          <button
            className="assist-listen"
            type="button"
            onClick={() => {
              setMuted((current) => !current);
              stopSpeaking();
            }}
          >
            {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            {muted ? t('assist.soundOn') : t('assist.mute')}
          </button>
        </div>

        {error && (
          <section className="notice error" role="alert">
            <AlertTriangle size={20} />
            <span>{t('assist.problem')}</span>
          </section>
        )}

        {warnings.length > 0 && (
          <section className="notice warning">
            <AlertTriangle size={20} />
            <span>{t('assist.warning')}</span>
          </section>
        )}

        {renderScreen()}
        {renderActions()}
      </section>
    </main>
  );
}

function AssistPhotoStep({
  documents,
  isProcessing,
  onFileSelection,
  onTargetChange,
  onReadDocuments,
  onRetry
}: {
  documents: OcrDocument[];
  isProcessing: boolean;
  onFileSelection: (event: ChangeEvent<HTMLInputElement>) => void;
  onTargetChange: (documentId: string, targetPrefix: OcrTargetPrefix) => void;
  onReadDocuments: () => void;
  onRetry: () => void;
}) {
  const hasFailedDocuments = documents.some((doc) => doc.status === 'error');

  return (
    <div className="assist-photo-step">
      <p>{t('assist.photo.help')}</p>
      <label className="assist-upload">
        <Camera size={26} />
        {t('assist.photo.add')}
        <input type="file" accept="image/*" capture="environment" multiple onChange={onFileSelection} />
      </label>
      <AssistDocumentList documents={documents} onTargetChange={onTargetChange} />
      <div className="assist-inline-actions">
        <button
          className="assist-big-button primary"
          type="button"
          disabled={documents.length === 0 || isProcessing}
          onClick={onReadDocuments}
        >
          {isProcessing ? <Loader2 className="spin" size={28} /> : <ScanText size={28} />}
          {isProcessing ? t('assist.photo.reading') : t('assist.photo.read')}
        </button>
        {hasFailedDocuments && (
          <button className="assist-big-button" type="button" onClick={onRetry} disabled={isProcessing}>
            <RefreshCw size={28} />
            {t('assist.photo.retry')}
          </button>
        )}
      </div>
    </div>
  );
}

function AssistDocumentList({
  documents,
  onTargetChange
}: {
  documents: OcrDocument[];
  onTargetChange: (documentId: string, targetPrefix: OcrTargetPrefix) => void;
}) {
  if (documents.length === 0) {
    return <div className="assist-empty">{t('assist.photo.empty')}</div>;
  }

  return (
    <section className="assist-document-list" aria-label={t('assist.whoseCard')}>
      {documents.map((doc) => (
        <article className="assist-document" key={doc.id}>
          <img src={doc.previewUrl} alt="" />
          <div>
            <strong>{t('assist.whoseCard')}</strong>
            <span>{assistStatusLabel(doc)}</span>
            {doc.status === 'processing' && <progress value={doc.progress} max="100" />}
            <div className="assist-target-grid">
              {assistTargetOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={doc.targetPrefix === option.value ? 'assist-target active' : 'assist-target'}
                  onClick={() => onTargetChange(doc.id, option.value)}
                >
                  {t(option.label)}
                </button>
              ))}
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}

function AssistTextStep({
  screen,
  value,
  onUpdate
}: {
  screen: Extract<AssistScreen, { kind: 'text' }>;
  value: string;
  onUpdate: (value: string) => void;
}) {
  return (
    <label className="assist-input-wrap">
      {screen.multiline ? (
        <textarea
          className="assist-input"
          value={value}
          rows={5}
          placeholder={t('assist.fill.empty')}
          onChange={(event) => onUpdate(event.target.value)}
        />
      ) : (
        <input
          className="assist-input"
          value={value}
          inputMode={screen.inputMode}
          placeholder={t('assist.fill.empty')}
          onChange={(event) => onUpdate(event.target.value)}
        />
      )}
    </label>
  );
}

function AssistGenderStep({
  owner,
  selected,
  onChange
}: {
  owner: AssistOwner;
  selected: 'm' | 'f' | 'other' | '';
  onChange: (selected: 'm' | 'f' | 'other') => void;
}) {
  return (
    <div className="assist-choice-grid">
      {assistGenderChoices.map((choice) => {
        const Icon = choice.icon;
        return (
          <button
            className={selected === choice.value ? 'assist-choice active' : 'assist-choice'}
            type="button"
            key={`${owner}-${choice.value}`}
            onClick={() => onChange(choice.value)}
          >
            <Icon size={34} />
            <span>{t(choice.label)}</span>
          </button>
        );
      })}
    </div>
  );
}

function AssistChoiceStep({
  choices,
  selectedValue,
  onSelect
}: {
  choices: AssistChoice[];
  selectedValue: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="assist-choice-grid">
      {choices.map((choice) => {
        const Icon = choice.icon;
        return (
          <button
            className={selectedValue === choice.value ? 'assist-choice active' : 'assist-choice'}
            type="button"
            key={choice.value}
            onClick={() => onSelect(choice.value)}
          >
            <Icon size={34} />
            <span>{t(choice.label)}</span>
          </button>
        );
      })}
    </div>
  );
}

function AssistAddMemberStep({ onAnswer }: { onAnswer: (addMember: boolean) => void }) {
  return (
    <div className="assist-choice-grid two">
      <button className="assist-choice" type="button" onClick={() => onAnswer(false)}>
        <Check size={34} />
        <span>{t('assist.no')}</span>
      </button>
      <button className="assist-choice active" type="button" onClick={() => onAnswer(true)}>
        <Plus size={34} />
        <span>{t('assist.yes')}</span>
      </button>
    </div>
  );
}

function AssistReviewStep({ userData, memberCount }: { userData: UserData; memberCount: number }) {
  return (
    <div className="assist-summary">
      <section>
        <h2>{t('assist.target.you')}</h2>
        <SummaryRow label={t('summary.name')} value={userData.hof_name} />
        <SummaryRow label={t('summary.dob')} value={userData.hof_dob} />
        <SummaryRow label={t('summary.aadhaar')} value={userData.hof_aadhaar} />
        <SummaryRow label={t('summary.address')} value={userData.hof_address} />
      </section>

      <section>
        <h2>{t('summary.members')}</h2>
        {memberCount === 0 ? (
          <p>{t('assist.noMembers')}</p>
        ) : (
          Array.from({ length: memberCount }, (_, index) => index + 1).map((memberNumber) => {
            const owner = `member${memberNumber}` as `member${number}`;
            return (
              <div className="assist-member-summary" key={owner}>
                <h3>{t(`assist.target.member${memberNumber}` as LocaleKey)}</h3>
                <SummaryRow label={t('summary.name')} value={userData[memberField(owner, 'name')]} />
                <SummaryRow label={t('summary.dob')} value={userData[memberField(owner, 'dob')]} />
                <SummaryRow label={t('summary.aadhaar')} value={userData[memberField(owner, 'aadhaar')]} />
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

function AssistPreviewStep({ previewUrl }: { previewUrl: string }) {
  return (
    <div className="assist-preview">
      <p>{t('assist.preview.help')}</p>
      {previewUrl ? (
        <iframe className="pdf-preview" title={t('assist.preview.title')} src={previewUrl} />
      ) : (
        <div className="assist-empty">{t('assist.preview.wait')}</div>
      )}
    </div>
  );
}

function AssistDownloadStep() {
  return (
    <div className="assist-download">
      <CheckCircle2 size={58} />
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-row">
      <span>{label}</span>
      <strong>{value.trim() || '-'}</strong>
    </div>
  );
}

function ScanPanel({
  documents,
  onFileSelection,
  onTargetChange,
  onStartOcr
}: {
  documents: OcrDocument[];
  onFileSelection: (event: ChangeEvent<HTMLInputElement>) => void;
  onTargetChange: (documentId: string, targetPrefix: OcrTargetPrefix) => void;
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
      <DocumentList documents={documents} onTargetChange={onTargetChange} />
    </div>
  );
}

function OcrPanel({
  documents,
  isProcessing,
  canReview,
  onTargetChange,
  onRetry,
  onReview
}: {
  documents: OcrDocument[];
  isProcessing: boolean;
  canReview: boolean;
  onTargetChange: (documentId: string, targetPrefix: OcrTargetPrefix) => void;
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
      <DocumentList
        documents={documents}
        detailed
        onTargetChange={onTargetChange}
        targetEditable={!isProcessing}
      />
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

function DocumentList({
  documents,
  detailed = false,
  onTargetChange,
  targetEditable = true
}: {
  documents: OcrDocument[];
  detailed?: boolean;
  onTargetChange?: (documentId: string, targetPrefix: OcrTargetPrefix) => void;
  targetEditable?: boolean;
}) {
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
            <label className="target-field">
              <span>Fill target</span>
              <select
                value={doc.targetPrefix}
                disabled={!onTargetChange || !targetEditable}
                onChange={(event) =>
                  onTargetChange?.(doc.id, event.target.value as OcrTargetPrefix)
                }
              >
                {ocrTargetOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
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

function buildAssistScreens(memberCount: number): AssistScreen[] {
  const screens: AssistScreen[] = [...hofAssistScreens];

  for (let memberNumber = 1; memberNumber <= memberCount; memberNumber += 1) {
    const owner = `member${memberNumber}` as `member${number}`;
    screens.push(
      { kind: 'text', question: 'assist.member.name', field: memberField(owner, 'name') },
      {
        kind: 'choice',
        question: 'assist.member.relation',
        field: memberField(owner, 'relation'),
        choices: relationChoices
      },
      { kind: 'gender', question: 'assist.member.gender', owner },
      {
        kind: 'text',
        question: 'assist.member.dob',
        field: memberField(owner, 'dob'),
        inputMode: 'numeric'
      },
      {
        kind: 'text',
        question: 'assist.member.aadhaar',
        field: memberField(owner, 'aadhaar'),
        inputMode: 'numeric'
      }
    );
  }

  if (memberCount < 5) {
    screens.push({
      kind: 'add-member',
      question: memberCount === 0 ? 'assist.member.add' : 'assist.member.more'
    });
  }

  screens.push(
    { kind: 'review', question: 'assist.review.title' },
    { kind: 'preview', question: 'assist.preview.title' },
    { kind: 'download', question: 'assist.download.title' }
  );

  return screens;
}

function memberField(owner: `member${number}`, suffix: MemberFieldSuffix): FieldName {
  return contractField(`${owner}_${suffix}`);
}

function contractField(field: string): FieldName {
  if ((FIELD_NAMES as readonly string[]).includes(field)) return field as FieldName;
  throw new Error(`Unknown field "${field}"`);
}

function selectedGender(owner: AssistOwner, userData: UserData): 'm' | 'f' | 'other' | '' {
  const fields =
    owner === 'hof'
      ? {
          m: 'gender_m',
          f: 'gender_f',
          other: 'gender_other'
        }
      : {
          m: `${owner}_gender_m`,
          f: `${owner}_gender_f`,
          other: `${owner}_gender_other`
        };

  if (userData[contractField(fields.m)] === 'X') return 'm';
  if (userData[contractField(fields.f)] === 'X') return 'f';
  if (userData[contractField(fields.other)] === 'X') return 'other';
  return '';
}

function assistStatusLabel(doc: OcrDocument): string {
  if (doc.status === 'processing') return t('assist.card.reading');
  if (doc.status === 'complete') return t('assist.card.done');
  if (doc.status === 'error') return t('assist.card.problem');
  return t('assist.card.ready');
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
    const fieldName = field as FieldName;
    if (typeof value === 'string' && value.trim() && !next[fieldName].trim()) {
      next[fieldName] = value;
    }
  }
  return next;
}

function mergeParsedDocumentValues(
  current: UserData,
  parsedDocs: Array<{ parsed: OcrParseResult }>
): UserData {
  return parsedDocs.reduce(
    (next, { parsed }) => mergeParsedValues(next, parsed.values),
    { ...current }
  );
}

function formatParseWarnings(
  parsedDocs: Array<{ doc: OcrDocument; parsed: OcrParseResult }>
): string[] {
  return parsedDocs.flatMap(({ doc, parsed }) =>
    parsed.warnings.map((warning) => `${targetLabel(doc.targetPrefix)} (${doc.file.name}): ${warning}`)
  );
}

function targetLabel(targetPrefix: OcrTargetPrefix): string {
  return ocrTargetOptions.find((option) => option.value === targetPrefix)?.label || targetPrefix;
}

function createPdfBlob(bytes: Uint8Array): Blob {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: 'application/pdf' });
}
