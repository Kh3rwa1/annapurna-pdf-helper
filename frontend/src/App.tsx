import {
  ChangeEvent,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type ComponentType,
  type LabelHTMLAttributes,
  type ReactNode
} from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Baby,
  BookOpen,
  Briefcase,
  Camera,
  Check,
  CheckCircle2,
  CircleUserRound,
  Download,
  GraduationCap,
  HandHeart,
  Handshake,
  HeartHandshake,
  HeartPulse,
  Home,
  Loader2,
  Plus,
  RefreshCw,
  ScanText,
  Store,
  Tractor,
  Utensils,
  UserRound,
  UserRoundCheck,
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
import type { FlowProps, UiMode } from './flows/types';

const LazyAgentFlow = lazy(() => import('./flows/AgentFlow'));

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

const ocrTargetOptions: Array<{ value: OcrTargetPrefix; label: string }> = [
  { value: 'hof', label: 'HOF' },
  { value: 'member1', label: 'Member 1' },
  { value: 'member2', label: 'Member 2' },
  { value: 'member3', label: 'Member 3' },
  { value: 'member4', label: 'Member 4' },
  { value: 'member5', label: 'Member 5' }
];

type AssistOwner = 'hof' | `member${number}`;
type MemberFieldSuffix = (typeof memberFields)[number];
type AssistInputMode = 'text' | 'numeric' | 'tel';
type MotionModule = typeof import('framer-motion');
type MotionApi = Pick<MotionModule, 'motion' | 'AnimatePresence'>;

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
  | { kind: 'date'; question: LocaleKey; field: FieldName }
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
  { label: 'choice.male', value: 'm', icon: UserRound },
  { label: 'choice.female', value: 'f', icon: UserRoundCheck },
  { label: 'choice.otherGender', value: 'other', icon: CircleUserRound }
];

const relationChoices: AssistChoice[] = [
  { label: 'choice.spouse', value: 'Spouse', icon: HeartHandshake },
  { label: 'choice.child', value: 'Child', icon: Baby },
  { label: 'choice.parent', value: 'Parent', icon: Handshake },
  { label: 'choice.otherRelation', value: 'Other', icon: Users }
];

const employmentChoices: AssistChoice[] = [
  { label: 'choice.workDaily', value: 'Daily wage work', icon: Tractor },
  { label: 'choice.workSelf', value: 'Self-employed', icon: Store },
  { label: 'choice.workNone', value: 'Unemployed', icon: Home },
  { label: 'choice.workOther', value: 'Other', icon: Briefcase }
];

const educationChoices: AssistChoice[] = [
  { label: 'choice.eduNone', value: 'No schooling', icon: BookOpen },
  { label: 'choice.eduPrimary', value: 'Primary', icon: GraduationCap },
  { label: 'choice.eduSecondary', value: 'Secondary', icon: GraduationCap },
  { label: 'choice.eduHigher', value: 'Higher', icon: GraduationCap }
];

const schemeChoices: AssistChoice[] = [
  { label: 'choice.schemeFood', value: 'Food assistance', icon: Utensils },
  { label: 'choice.schemePension', value: 'Pension', icon: Home },
  { label: 'choice.schemeHealth', value: 'Health support', icon: HeartPulse },
  { label: 'choice.schemeOther', value: 'Other', icon: HandHeart }
];

const hofAssistScreens: AssistScreen[] = [
  { kind: 'photo', question: 'assist.photo.title' },
  { kind: 'text', question: 'assist.name', field: 'hof_name' },
  { kind: 'date', question: 'assist.dob', field: 'hof_dob' },
  { kind: 'gender', question: 'assist.gender', owner: 'hof' },
  { kind: 'text', question: 'assist.aadhaar', field: 'hof_aadhaar', inputMode: 'numeric' },
  { kind: 'text', question: 'assist.mobile', field: 'hof_mobile', inputMode: 'tel' },
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
      {mode === 'agent' ? (
        <Suspense fallback={<div className="flow-loading">{t('mode.loadingAgent')}</div>}>
          <LazyAgentFlow {...flowProps} />
        </Suspense>
      ) : (
        <AssistFlow {...flowProps} />
      )}
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
  const [motionApi, setMotionApi] = useState<MotionApi | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const screens = useMemo(() => buildAssistScreens(memberCount), [memberCount]);
  const activeIndex = Math.min(screenIndex, screens.length - 1);
  const screen = screens[activeIndex];
  const question = t(screen.question);
  const hasCompletedDocuments = documents.some((doc) => doc.status === 'complete');

  useEffect(() => {
    if (screenIndex > screens.length - 1) setScreenIndex(screens.length - 1);
  }, [screenIndex, screens.length]);

  useEffect(() => {
    void speakPrompt(screen.question, question, muted);
    return () => stopSpeaking();
  }, [muted, question, screen.question]);

  useEffect(() => {
    let mounted = true;
    void import('framer-motion').then(({ motion, AnimatePresence }) => {
      if (mounted) setMotionApi({ motion, AnimatePresence });
    });
    return () => {
      mounted = false;
    };
  }, []);

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
            motionApi={motionApi}
            reducedMotion={reducedMotion}
            onFileSelection={handleFileSelection}
            onTargetChange={updateDocumentTarget}
            onReadDocuments={() => void startOcr()}
            onRetry={() => void retryFailedOcr()}
          />
        );
      case 'date':
        return (
          <AssistDateStep
            field={screen.field}
            value={userData[screen.field]}
            onUpdate={(value) => updateField(screen.field, value)}
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
            motionApi={motionApi}
            reducedMotion={reducedMotion}
            onChange={(selected) => updateGender(screen.owner, selected)}
          />
        );
      case 'choice':
        return (
          <AssistChoiceStep
            choices={screen.choices}
            selectedValue={userData[screen.field]}
            motionApi={motionApi}
            reducedMotion={reducedMotion}
            onSelect={(value) => updateField(screen.field, value)}
          />
        );
      case 'add-member':
        return <AssistAddMemberStep motionApi={motionApi} reducedMotion={reducedMotion} onAnswer={handleAddMember} />;
      case 'review':
        return <AssistReviewStep userData={userData} memberCount={memberCount} />;
      case 'preview':
        return <AssistPreviewStep previewUrl={previewUrl} />;
      case 'download':
        return <AssistDownloadStep motionApi={motionApi} reducedMotion={reducedMotion} />;
    }
  }

  function renderActions() {
    if (screen.kind === 'add-member') {
      return (
        <div className="assist-nav">
          <MotionButton
            motionApi={motionApi}
            reducedMotion={reducedMotion}
            className="assist-back"
            type="button"
            onClick={goBack}
            disabled={activeIndex === 0}
          >
            <ArrowLeft size={22} />
            {t('assist.back')}
          </MotionButton>
        </div>
      );
    }

    if (screen.kind === 'review') {
      return (
        <div className="assist-nav">
          <MotionButton motionApi={motionApi} reducedMotion={reducedMotion} className="assist-back" type="button" onClick={goBack}>
            <ArrowLeft size={22} />
            {t('assist.review.edit')}
          </MotionButton>
          <MotionButton
            motionApi={motionApi}
            reducedMotion={reducedMotion}
            className="assist-next"
            type="button"
            onClick={() => void handleReviewConfirm()}
            disabled={isGenerating}
          >
            {isGenerating ? <Loader2 className="spin" size={22} /> : <Check size={22} />}
            {t('assist.review.confirm')}
          </MotionButton>
        </div>
      );
    }

    if (screen.kind === 'download') {
      return (
        <div className="assist-nav">
          <MotionButton motionApi={motionApi} reducedMotion={reducedMotion} className="assist-back" type="button" onClick={goBack}>
            <ArrowLeft size={22} />
            {t('assist.back')}
          </MotionButton>
          <MotionButton motionApi={motionApi} reducedMotion={reducedMotion} className="assist-next" type="button" onClick={downloadPdf}>
            <Download size={22} />
            {t('assist.download.button')}
          </MotionButton>
        </div>
      );
    }

    return (
      <div className="assist-nav">
        <MotionButton
          motionApi={motionApi}
          reducedMotion={reducedMotion}
          className="assist-back"
          type="button"
          onClick={goBack}
          disabled={activeIndex === 0}
        >
          <ArrowLeft size={22} />
          {t('assist.back')}
        </MotionButton>
        <MotionButton
          motionApi={motionApi}
          reducedMotion={reducedMotion}
          className="assist-next"
          type="button"
          onClick={screen.kind === 'photo' ? handlePhotoNext : goNext}
          disabled={isProcessing}
        >
          {screen.kind === 'photo' && isProcessing ? <Loader2 className="spin" size={22} /> : <ArrowRight size={22} />}
          {screen.kind === 'photo' && hasCompletedDocuments ? t('assist.photo.next') : t('assist.next')}
        </MotionButton>
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

      <AssistProgress
        current={activeIndex + 1}
        total={screens.length}
        motionApi={motionApi}
        reducedMotion={reducedMotion}
      />

      <section className="assist-card">
        <div className="assist-toolbar">
          <MotionButton
            motionApi={motionApi}
            reducedMotion={reducedMotion}
            className="assist-listen"
            type="button"
            onClick={() => void speakPrompt(screen.question, question, muted)}
          >
            <Volume2 size={20} />
            {t('assist.listen')}
          </MotionButton>
          <MotionButton
            motionApi={motionApi}
            reducedMotion={reducedMotion}
            className="assist-listen"
            type="button"
            onClick={() => {
              setMuted((current) => !current);
              stopSpeaking();
            }}
          >
            {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            {muted ? t('assist.soundOn') : t('assist.mute')}
          </MotionButton>
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

        <MotionScreen motionApi={motionApi} reducedMotion={reducedMotion} screenKey={`${screen.kind}-${activeIndex}-${screen.question}`}>
          {renderScreen()}
          {renderActions()}
        </MotionScreen>
      </section>
    </main>
  );
}

function AssistPhotoStep({
  documents,
  isProcessing,
  motionApi,
  reducedMotion,
  onFileSelection,
  onTargetChange,
  onReadDocuments,
  onRetry
}: {
  documents: OcrDocument[];
  isProcessing: boolean;
  motionApi: MotionApi | null;
  reducedMotion: boolean;
  onFileSelection: (event: ChangeEvent<HTMLInputElement>) => void;
  onTargetChange: (documentId: string, targetPrefix: OcrTargetPrefix) => void;
  onReadDocuments: () => void;
  onRetry: () => void;
}) {
  const hasFailedDocuments = documents.some((doc) => doc.status === 'error');
  const isPreparing = isProcessing && documents.some((doc) => doc.status === 'processing' && doc.progress <= 1);

  return (
    <div className="assist-photo-step">
      <p>{t('assist.photo.help')}</p>
      <MotionLabel motionApi={motionApi} reducedMotion={reducedMotion} className="assist-upload">
        <Camera size={26} />
        {t('assist.photo.add')}
        <input type="file" accept="image/*" capture="environment" multiple onChange={onFileSelection} />
      </MotionLabel>
      <AssistDocumentList documents={documents} motionApi={motionApi} reducedMotion={reducedMotion} onTargetChange={onTargetChange} />
      <div className="assist-inline-actions">
        <MotionButton
          motionApi={motionApi}
          reducedMotion={reducedMotion}
          className="assist-big-button primary"
          type="button"
          disabled={documents.length === 0 || isProcessing}
          onClick={onReadDocuments}
        >
          {isProcessing ? <Loader2 className="spin" size={28} /> : <ScanText size={28} />}
          {isProcessing ? (isPreparing ? t('assist.photo.preparing') : t('assist.photo.reading')) : t('assist.photo.read')}
        </MotionButton>
        {hasFailedDocuments && (
          <MotionButton
            motionApi={motionApi}
            reducedMotion={reducedMotion}
            className="assist-big-button"
            type="button"
            onClick={onRetry}
            disabled={isProcessing}
          >
            <RefreshCw size={28} />
            {t('assist.photo.retry')}
          </MotionButton>
        )}
      </div>
    </div>
  );
}

function AssistDocumentList({
  documents,
  motionApi,
  reducedMotion,
  onTargetChange
}: {
  documents: OcrDocument[];
  motionApi: MotionApi | null;
  reducedMotion: boolean;
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
                <MotionButton
                  motionApi={motionApi}
                  reducedMotion={reducedMotion}
                  key={option.value}
                  type="button"
                  className={doc.targetPrefix === option.value ? 'assist-target active' : 'assist-target'}
                  onClick={() => onTargetChange(doc.id, option.value)}
                >
                  {t(option.label)}
                </MotionButton>
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
  const isNumberLike = screen.inputMode === 'numeric' || screen.inputMode === 'tel';

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
          pattern={isNumberLike ? '[0-9]*' : undefined}
          placeholder={t('assist.fill.empty')}
          onChange={(event) => onUpdate(event.target.value)}
        />
      )}
    </label>
  );
}

function AssistDateStep({
  field,
  value,
  onUpdate
}: {
  field: FieldName;
  value: string;
  onUpdate: (value: string) => void;
}) {
  const parts = parseDateParts(value);

  function updatePart(part: 'day' | 'month' | 'year', nextValue: string) {
    const nextParts = { ...parts, [part]: nextValue };
    onUpdate(formatDateParts(nextParts));
  }

  return (
    <div className="assist-date-picker" aria-label={t('assist.dob')}>
      <DateSelect
        label={t('assist.date.day')}
        value={parts.day}
        options={Array.from({ length: 31 }, (_, index) => String(index + 1).padStart(2, '0'))}
        onChange={(value) => updatePart('day', value)}
      />
      <DateSelect
        label={t('assist.date.month')}
        value={parts.month}
        options={Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'))}
        onChange={(value) => updatePart('month', value)}
      />
      <DateSelect
        label={t('assist.date.year')}
        value={parts.year}
        options={Array.from({ length: 110 }, (_, index) => String(new Date().getFullYear() - index))}
        onChange={(value) => updatePart('year', value)}
      />
      <input type="hidden" name={field} value={value} readOnly />
    </div>
  );
}

function DateSelect({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="assist-date-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">--</option>
        {options.map((option) => (
          <option value={option} key={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function AssistGenderStep({
  owner,
  selected,
  motionApi,
  reducedMotion,
  onChange
}: {
  owner: AssistOwner;
  selected: 'm' | 'f' | 'other' | '';
  motionApi: MotionApi | null;
  reducedMotion: boolean;
  onChange: (selected: 'm' | 'f' | 'other') => void;
}) {
  return (
    <div className="assist-choice-grid">
      {assistGenderChoices.map((choice) => {
        const Icon = choice.icon;
        return (
          <MotionButton
            motionApi={motionApi}
            reducedMotion={reducedMotion}
            className={selected === choice.value ? 'assist-choice active' : 'assist-choice'}
            type="button"
            key={`${owner}-${choice.value}`}
            onClick={() => onChange(choice.value)}
          >
            <Icon className="assist-choice-icon" size={48} />
            <span>{t(choice.label)}</span>
          </MotionButton>
        );
      })}
    </div>
  );
}

function AssistChoiceStep({
  choices,
  selectedValue,
  motionApi,
  reducedMotion,
  onSelect
}: {
  choices: AssistChoice[];
  selectedValue: string;
  motionApi: MotionApi | null;
  reducedMotion: boolean;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="assist-choice-grid">
      {choices.map((choice) => {
        const Icon = choice.icon;
        return (
          <MotionButton
            motionApi={motionApi}
            reducedMotion={reducedMotion}
            className={selectedValue === choice.value ? 'assist-choice active' : 'assist-choice'}
            type="button"
            key={choice.value}
            onClick={() => onSelect(choice.value)}
          >
            <Icon className="assist-choice-icon" size={48} />
            <span>{t(choice.label)}</span>
          </MotionButton>
        );
      })}
    </div>
  );
}

function AssistAddMemberStep({
  motionApi,
  reducedMotion,
  onAnswer
}: {
  motionApi: MotionApi | null;
  reducedMotion: boolean;
  onAnswer: (addMember: boolean) => void;
}) {
  return (
    <div className="assist-choice-grid two">
      <MotionButton motionApi={motionApi} reducedMotion={reducedMotion} className="assist-choice" type="button" onClick={() => onAnswer(false)}>
        <Check className="assist-choice-icon" size={48} />
        <span>{t('assist.no')}</span>
      </MotionButton>
      <MotionButton motionApi={motionApi} reducedMotion={reducedMotion} className="assist-choice active" type="button" onClick={() => onAnswer(true)}>
        <Plus className="assist-choice-icon" size={48} />
        <span>{t('assist.yes')}</span>
      </MotionButton>
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

function AssistDownloadStep({
  motionApi,
  reducedMotion
}: {
  motionApi: MotionApi | null;
  reducedMotion: boolean;
}) {
  const CheckIcon = motionApi && !reducedMotion ? motionApi.motion.div : 'div';

  return (
    <div className="assist-download">
      <CheckIcon
        className="assist-download-check"
        {...(motionApi && !reducedMotion
          ? {
              initial: { scale: 0.72, opacity: 0 },
              animate: { scale: 1, opacity: 1 },
              transition: { duration: 0.22, ease: 'easeOut' }
            }
          : {})}
      >
        <CheckCircle2 size={72} />
      </CheckIcon>
      <ConfettiBurst motionApi={motionApi} reducedMotion={reducedMotion} />
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

function AssistProgress({
  current,
  total,
  motionApi,
  reducedMotion
}: {
  current: number;
  total: number;
  motionApi: MotionApi | null;
  reducedMotion: boolean;
}) {
  const percentage = `${Math.round((current / total) * 100)}%`;
  const label = t('assist.progress', { current, total });

  if (motionApi && !reducedMotion) {
    const MotionFill = motionApi.motion.div;
    return (
      <section className="assist-progress" aria-label={label}>
        <span>{label}</span>
        <div className="assist-progress-track" aria-hidden="true">
          <MotionFill
            className="assist-progress-fill"
            animate={{ width: percentage }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="assist-progress" aria-label={label}>
      <span>{label}</span>
      <div className="assist-progress-track" aria-hidden="true">
        <div className="assist-progress-fill" style={{ width: percentage }} />
      </div>
    </section>
  );
}

function MotionScreen({
  motionApi,
  reducedMotion,
  screenKey,
  children
}: {
  motionApi: MotionApi | null;
  reducedMotion: boolean;
  screenKey: string;
  children: ReactNode;
}) {
  if (!motionApi || reducedMotion) {
    return <div className="assist-screen">{children}</div>;
  }

  const { AnimatePresence, motion } = motionApi;
  const MotionDiv = motion.div;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <MotionDiv
        className="assist-screen"
        key={screenKey}
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -24 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
      >
        {children}
      </MotionDiv>
    </AnimatePresence>
  );
}

function MotionButton({
  motionApi,
  reducedMotion,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  motionApi: MotionApi | null;
  reducedMotion: boolean;
  children: ReactNode;
}) {
  if (!motionApi || reducedMotion) {
    return <button {...props}>{children}</button>;
  }

  const MotionButtonElement = motionApi.motion.button as ComponentType<
    ButtonHTMLAttributes<HTMLButtonElement> & {
      whileTap?: { scale: number };
      transition?: { duration: number };
    }
  >;
  return (
    <MotionButtonElement whileTap={{ scale: 0.96 }} transition={{ duration: 0.12 }} {...props}>
      {children}
    </MotionButtonElement>
  );
}

function MotionLabel({
  motionApi,
  reducedMotion,
  children,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement> & {
  motionApi: MotionApi | null;
  reducedMotion: boolean;
  children: ReactNode;
}) {
  if (!motionApi || reducedMotion) {
    return <label {...props}>{children}</label>;
  }

  const MotionLabelElement = motionApi.motion.label as ComponentType<
    LabelHTMLAttributes<HTMLLabelElement> & {
      whileTap?: { scale: number };
      transition?: { duration: number };
    }
  >;
  return (
    <MotionLabelElement whileTap={{ scale: 0.96 }} transition={{ duration: 0.12 }} {...props}>
      {children}
    </MotionLabelElement>
  );
}

function ConfettiBurst({
  motionApi,
  reducedMotion
}: {
  motionApi: MotionApi | null;
  reducedMotion: boolean;
}) {
  if (!motionApi || reducedMotion) return null;

  const MotionSpan = motionApi.motion.span;
  return (
    <div className="assist-confetti" aria-hidden="true">
      {Array.from({ length: 12 }, (_, index) => {
        const angle = (index / 12) * Math.PI * 2;
        const distance = 78 + (index % 3) * 12;
        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance;
        return (
          <MotionSpan
            className="assist-confetti-piece"
            key={index}
            initial={{ opacity: 0, scale: 0.4, x: 0, y: 0 }}
            animate={{ opacity: [0, 1, 0], scale: [0.4, 1, 0.8], x, y }}
            transition={{ duration: 0.28, ease: 'easeOut', delay: index * 0.008 }}
          />
        );
      })}
    </div>
  );
}

function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(query.matches);
    const handleChange = () => setReducedMotion(query.matches);
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  return reducedMotion;
}

function parseDateParts(value: string): { day: string; month: string; year: string } {
  const [day = '', month = '', year = ''] = value.split(/[/-]/);
  return {
    day: day.padStart(day ? 2 : 0, '0'),
    month: month.padStart(month ? 2 : 0, '0'),
    year
  };
}

function formatDateParts(parts: { day: string; month: string; year: string }): string {
  const { day, month, year } = parts;
  if (!day && !month && !year) return '';
  return [day, month, year].join('/');
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
        kind: 'date',
        question: 'assist.member.dob',
        field: memberField(owner, 'dob')
      },
      {
        kind: 'text',
        question: 'assist.member.aadhaar',
        field: memberField(owner, 'aadhaar'),
        inputMode: 'numeric'
      },
      {
        kind: 'text',
        question: 'assist.member.mobile',
        field: memberField(owner, 'mobile'),
        inputMode: 'tel'
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
