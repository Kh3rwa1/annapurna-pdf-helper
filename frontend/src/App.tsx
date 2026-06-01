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
  CreditCard,
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
  IdCard,
  Landmark,
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

type MemberOwner = Exclude<OcrTargetPrefix, 'hof'>;
type AssistOwner = OcrTargetPrefix;
type MemberFieldSuffix = (typeof memberFields)[number];
type AssistInputMode = 'text' | 'numeric' | 'tel';
type MotionModule = typeof import('framer-motion');
type MotionApi = Pick<MotionModule, 'motion' | 'AnimatePresence'>;
type CardType = 'aadhaar' | 'pan' | 'epic' | 'ration' | 'bank';
type CardFieldSuffix =
  | 'name'
  | 'dob'
  | 'gender'
  | 'aadhaar'
  | 'address'
  | 'pan'
  | 'epic'
  | 'ration_card'
  | 'bank_name'
  | 'bank_account'
  | 'bank_ifsc';
type AssistFieldSuffix = MemberFieldSuffix | 'gender';
type AssistHistoryEntry = { screen: AssistScreen; queue: AssistScreen[] };

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

type AssistManual =
  | {
      kind: 'text';
      id: string;
      owner: AssistOwner;
      question: LocaleKey;
      label: LocaleKey;
      field: FieldName;
      multiline?: boolean;
      inputMode?: AssistInputMode;
    }
  | {
      kind: 'date';
      id: string;
      owner: AssistOwner;
      question: LocaleKey;
      label: LocaleKey;
      field: FieldName;
    }
  | { kind: 'gender'; id: string; owner: AssistOwner; question: LocaleKey; label: LocaleKey }
  | {
      kind: 'choice';
      id: string;
      owner: AssistOwner;
      question: LocaleKey;
      label: LocaleKey;
      field: FieldName;
      choices: AssistChoice[];
    };

type AssistScreen =
  | { kind: 'offer-card'; owner: AssistOwner; card: CardType; question: LocaleKey }
  | { kind: 'scan-card'; owner: AssistOwner; card: CardType; question: LocaleKey }
  | { kind: 'confirm-card'; owner: AssistOwner; card: CardType; question: LocaleKey }
  | { kind: 'manual'; manual: AssistManual; question: LocaleKey }
  | { kind: 'add-member'; question: LocaleKey }
  | { kind: 'review'; question: LocaleKey }
  | { kind: 'preview'; question: LocaleKey }
  | { kind: 'download'; question: LocaleKey };

type CardConfig = {
  type: CardType;
  scanQuestion: LocaleKey;
  offerQuestion?: LocaleKey;
  label: LocaleKey;
  help: LocaleKey;
  icon: LucideIcon;
  fields: CardFieldSuffix[];
  optional?: boolean;
};

const modeStorageKey = 'annapurna-ui-mode';

const cardOrder: CardType[] = ['aadhaar', 'pan', 'epic', 'ration', 'bank'];

const cardConfigs: Record<CardType, CardConfig> = {
  aadhaar: {
    type: 'aadhaar',
    scanQuestion: 'assist.card.scan.aadhaar',
    label: 'assist.card.label.aadhaar',
    help: 'assist.card.help.aadhaar',
    icon: IdCard,
    fields: ['name', 'dob', 'gender', 'aadhaar', 'address']
  },
  pan: {
    type: 'pan',
    scanQuestion: 'assist.card.scan.pan',
    offerQuestion: 'assist.card.offer.pan',
    label: 'assist.card.label.pan',
    help: 'assist.card.help.pan',
    icon: CreditCard,
    fields: ['pan'],
    optional: true
  },
  epic: {
    type: 'epic',
    scanQuestion: 'assist.card.scan.epic',
    offerQuestion: 'assist.card.offer.epic',
    label: 'assist.card.label.epic',
    help: 'assist.card.help.epic',
    icon: UserRoundCheck,
    fields: ['epic'],
    optional: true
  },
  ration: {
    type: 'ration',
    scanQuestion: 'assist.card.scan.ration',
    offerQuestion: 'assist.card.offer.ration',
    label: 'assist.card.label.ration',
    help: 'assist.card.help.ration',
    icon: Utensils,
    fields: ['ration_card'],
    optional: true
  },
  bank: {
    type: 'bank',
    scanQuestion: 'assist.card.scan.bank',
    offerQuestion: 'assist.card.offer.bank',
    label: 'assist.card.label.bank',
    help: 'assist.card.help.bank',
    icon: Landmark,
    fields: ['bank_name', 'bank_account', 'bank_ifsc'],
    optional: true
  }
};

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
  const [currentScreen, setCurrentScreen] = useState<AssistScreen>(() => scanCardScreen('hof', 'aadhaar'));
  const [history, setHistory] = useState<AssistHistoryEntry[]>([]);
  const [queuedScreens, setQueuedScreens] = useState<AssistScreen[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [muted, setMuted] = useState(false);
  const [motionApi, setMotionApi] = useState<MotionApi | null>(null);
  const [uploadContext, setUploadContext] = useState<{ key: string; owner: AssistOwner } | null>(null);
  const [cardDocumentIds, setCardDocumentIds] = useState<Record<string, string[]>>({});
  const [readingCard, setReadingCard] = useState<{ key: string; owner: AssistOwner; card: CardType } | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const question = t(currentScreen.question);
  const activeCardKey = currentScreen.kind === 'scan-card' ? cardInstanceKey(currentScreen.owner, currentScreen.card) : '';
  const activeDocumentIds = activeCardKey ? cardDocumentIds[activeCardKey] || [] : [];
  const activeDocuments = documents.filter((doc) => activeDocumentIds.includes(doc.id));
  const progressCurrent = history.length + 1;
  const progressTotal = Math.max(progressCurrent + queuedScreens.length + estimateRemainingScreens(currentScreen), progressCurrent);

  useEffect(() => {
    void speakPrompt(currentScreen.question, question, muted);
    return () => stopSpeaking();
  }, [muted, question, currentScreen.question]);

  useEffect(() => {
    let mounted = true;
    void import('framer-motion').then(({ motion, AnimatePresence }) => {
      if (mounted) setMotionApi({ motion, AnimatePresence });
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!uploadContext || documents.length === 0) return;
    setCardDocumentIds((current) => ({
      ...current,
      [uploadContext.key]: documents.map((doc) => doc.id)
    }));
    for (const doc of documents) {
      if (doc.targetPrefix !== uploadContext.owner) updateDocumentTarget(doc.id, uploadContext.owner);
    }
  }, [documents, updateDocumentTarget, uploadContext]);

  useEffect(() => {
    if (!readingCard) return;
    const docIds = cardDocumentIds[readingCard.key] || [];
    const cardDocs = documents.filter((doc) => docIds.includes(doc.id));
    if (cardDocs.length === 0 || isProcessing) return;

    if (cardDocs.some((doc) => doc.status === 'complete')) {
      reviewExtractedFields({ moveToAgentReview: false });
      setReadingCard(null);
      setNextScreen(confirmCardScreen(readingCard.owner, readingCard.card));
      return;
    }

    if (cardDocs.every((doc) => doc.status === 'error')) {
      setReadingCard(null);
    }
  }, [cardDocumentIds, documents, isProcessing, readingCard, reviewExtractedFields]);

  function setNextScreen(nextScreen: AssistScreen, nextQueue: AssistScreen[] = []) {
    setHistory((current) => [...current, { screen: currentScreen, queue: queuedScreens }]);
    setCurrentScreen(nextScreen);
    setQueuedScreens(nextQueue);
  }

  function continueTo(nextScreens: AssistScreen[]) {
    if (nextScreens.length === 0) return;
    setNextScreen(nextScreens[0], nextScreens.slice(1));
  }

  function continueQueued() {
    if (queuedScreens.length > 0) {
      setNextScreen(queuedScreens[0], queuedScreens.slice(1));
    }
  }

  function goBack() {
    setHistory((current) => {
      const previous = current.at(-1);
      if (previous) {
        setCurrentScreen(previous.screen);
        setQueuedScreens(previous.queue);
      }
      return previous ? current.slice(0, -1) : current;
    });
  }

  function handleCardFileSelection(event: ChangeEvent<HTMLInputElement>) {
    if (currentScreen.kind !== 'scan-card') return;
    setUploadContext({ key: cardInstanceKey(currentScreen.owner, currentScreen.card), owner: currentScreen.owner });
    handleFileSelection(event);
  }

  async function readCurrentCard() {
    if (currentScreen.kind !== 'scan-card' || activeDocuments.length === 0) return;
    const owner = currentScreen.owner;
    const targetDocs = activeDocuments.map((doc) => ({ ...doc, targetPrefix: owner }));
    for (const doc of activeDocuments) {
      if (doc.targetPrefix !== owner) updateDocumentTarget(doc.id, owner);
    }
    setReadingCard({ key: cardInstanceKey(owner, currentScreen.card), owner, card: currentScreen.card });
    await startOcr(targetDocs);
  }

  function acceptCardValues() {
    if (currentScreen.kind !== 'confirm-card') return;
    const missing = manualScreensForCard(currentScreen.owner, currentScreen.card, userData);
    continueTo([
      ...missing,
      ...screensAfterCard(currentScreen.owner, currentScreen.card, userData, memberCount)
    ]);
  }

  function answerOptionalCard(hasCard: boolean) {
    if (currentScreen.kind !== 'offer-card') return;
    if (hasCard) {
      setNextScreen(scanCardScreen(currentScreen.owner, currentScreen.card));
      return;
    }
    continueTo(screensAfterCard(currentScreen.owner, currentScreen.card, userData, memberCount));
  }

  function completeManual() {
    continueQueued();
  }

  function handleAddMember(addMember: boolean) {
    if (addMember && memberCount < 5) {
      const nextMemberNumber = memberCount + 1;
      setMemberCount(nextMemberNumber);
      setNextScreen(scanCardScreen(`member${nextMemberNumber}` as MemberOwner, 'aadhaar'));
      return;
    }

    setNextScreen({ kind: 'review', question: 'assist.review.title' });
  }

  async function handleReviewConfirm() {
    const generated = await generatePdf();
    if (generated) {
      setNextScreen(
        { kind: 'preview', question: 'assist.preview.title' },
        [{ kind: 'download', question: 'assist.download.title' }]
      );
    }
  }

  function renderScreen() {
    switch (currentScreen.kind) {
      case 'offer-card':
        return (
          <AssistOfferCardStep
            card={currentScreen.card}
            motionApi={motionApi}
            reducedMotion={reducedMotion}
            onAnswer={answerOptionalCard}
          />
        );
      case 'scan-card':
        return (
          <AssistScanCardStep
            card={currentScreen.card}
            documents={activeDocuments}
            isProcessing={isProcessing}
            motionApi={motionApi}
            reducedMotion={reducedMotion}
            onFileSelection={handleCardFileSelection}
            onReadDocuments={() => void readCurrentCard()}
            onRetry={() => void retryFailedOcr()}
          />
        );
      case 'confirm-card':
        return (
          <AssistConfirmCardStep
            owner={currentScreen.owner}
            card={currentScreen.card}
            userData={userData}
            onUpdateField={updateField}
            onUpdateGender={updateGender}
          />
        );
      case 'manual':
        return renderManualScreen(currentScreen.manual);
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

  function renderManualScreen(manual: AssistManual) {
    switch (manual.kind) {
      case 'date':
        return (
          <AssistDateStep
            field={manual.field}
            value={userData[manual.field]}
            ariaLabel={t(manual.question)}
            onUpdate={(value) => updateField(manual.field, value)}
          />
        );
      case 'text':
        return (
          <AssistTextStep
            manual={manual}
            value={userData[manual.field]}
            onUpdate={(value) => updateField(manual.field, value)}
          />
        );
      case 'gender':
        return (
          <AssistGenderStep
            owner={manual.owner}
            selected={selectedGender(manual.owner, userData)}
            motionApi={motionApi}
            reducedMotion={reducedMotion}
            onChange={(selected) => updateGender(manual.owner, selected)}
          />
        );
      case 'choice':
        return (
          <AssistChoiceStep
            choices={manual.choices}
            selectedValue={userData[manual.field]}
            motionApi={motionApi}
            reducedMotion={reducedMotion}
            onSelect={(value) => updateField(manual.field, value)}
          />
        );
    }
  }

  function renderActions() {
    if (currentScreen.kind === 'offer-card') return null;

    if (currentScreen.kind === 'add-member') {
      return (
        <div className="assist-nav">
          <MotionButton
            motionApi={motionApi}
            reducedMotion={reducedMotion}
            className="assist-back"
            type="button"
            onClick={goBack}
            disabled={history.length === 0}
          >
            <ArrowLeft size={22} />
            {t('assist.back')}
          </MotionButton>
        </div>
      );
    }

    if (currentScreen.kind === 'confirm-card') {
      return (
        <div className="assist-nav">
          <MotionButton motionApi={motionApi} reducedMotion={reducedMotion} className="assist-back" type="button" onClick={goBack}>
            <ArrowLeft size={22} />
            {t('assist.review.edit')}
          </MotionButton>
          <MotionButton motionApi={motionApi} reducedMotion={reducedMotion} className="assist-next" type="button" onClick={acceptCardValues}>
            <Check size={22} />
            {t('assist.card.confirm.correct')}
          </MotionButton>
        </div>
      );
    }

    if (currentScreen.kind === 'manual') {
      return (
        <div className="assist-nav">
          <MotionButton motionApi={motionApi} reducedMotion={reducedMotion} className="assist-back" type="button" onClick={goBack}>
            <ArrowLeft size={22} />
            {t('assist.back')}
          </MotionButton>
          <MotionButton
            motionApi={motionApi}
            reducedMotion={reducedMotion}
            className="assist-next"
            type="button"
            onClick={completeManual}
            disabled={!isManualComplete(currentScreen.manual, userData)}
          >
            <ArrowRight size={22} />
            {t('assist.next')}
          </MotionButton>
        </div>
      );
    }

    if (currentScreen.kind === 'review') {
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

    if (currentScreen.kind === 'download') {
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
          disabled={history.length === 0}
        >
          <ArrowLeft size={22} />
          {t('assist.back')}
        </MotionButton>
        <MotionButton
          motionApi={motionApi}
          reducedMotion={reducedMotion}
          className="assist-next"
          type="button"
          onClick={currentScreen.kind === 'scan-card' ? () => void readCurrentCard() : continueQueued}
          disabled={currentScreen.kind === 'scan-card' ? activeDocuments.length === 0 || isProcessing : false}
        >
          {currentScreen.kind === 'scan-card' && isProcessing ? <Loader2 className="spin" size={22} /> : <ArrowRight size={22} />}
          {currentScreen.kind === 'scan-card' && isProcessing ? t('assist.photo.reading') : t('assist.next')}
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
        current={progressCurrent}
        total={progressTotal}
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
            onClick={() => void speakPrompt(currentScreen.question, question, muted)}
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

        <MotionScreen motionApi={motionApi} reducedMotion={reducedMotion} screenKey={`${currentScreen.kind}-${progressCurrent}-${currentScreen.question}`}>
          {renderScreen()}
          {renderActions()}
        </MotionScreen>
      </section>
    </main>
  );
}

function AssistOfferCardStep({
  card,
  motionApi,
  reducedMotion,
  onAnswer
}: {
  card: CardType;
  motionApi: MotionApi | null;
  reducedMotion: boolean;
  onAnswer: (hasCard: boolean) => void;
}) {
  return (
    <div className="assist-card-prompt">
      <CardIllustration card={card} />
      <p>{t(cardConfigs[card].help)}</p>
      <div className="assist-inline-actions">
        <MotionButton motionApi={motionApi} reducedMotion={reducedMotion} className="assist-big-button primary" type="button" onClick={() => onAnswer(true)}>
          <Camera size={28} />
          {t('assist.card.have')}
        </MotionButton>
        <MotionButton motionApi={motionApi} reducedMotion={reducedMotion} className="assist-big-button" type="button" onClick={() => onAnswer(false)}>
          <ArrowRight size={28} />
          {t('assist.card.skip')}
        </MotionButton>
      </div>
    </div>
  );
}

function AssistScanCardStep({
  card,
  documents,
  isProcessing,
  motionApi,
  reducedMotion,
  onFileSelection,
  onReadDocuments,
  onRetry
}: {
  card: CardType;
  documents: OcrDocument[];
  isProcessing: boolean;
  motionApi: MotionApi | null;
  reducedMotion: boolean;
  onFileSelection: (event: ChangeEvent<HTMLInputElement>) => void;
  onReadDocuments: () => void;
  onRetry: () => void;
}) {
  const hasFailedDocuments = documents.some((doc) => doc.status === 'error');
  const isPreparing = isProcessing && documents.some((doc) => doc.status === 'processing' && doc.progress <= 1);

  return (
    <div className="assist-photo-step">
      <CardIllustration card={card} />
      <p>{t(cardConfigs[card].help)}</p>
      <MotionLabel motionApi={motionApi} reducedMotion={reducedMotion} className="assist-upload">
        <Camera size={26} />
        {t('assist.photo.add')}
        <input type="file" accept="image/*" capture="environment" onChange={onFileSelection} />
      </MotionLabel>
      <AssistCurrentDocumentPreview documents={documents} />
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

function AssistCurrentDocumentPreview({ documents }: { documents: OcrDocument[] }) {
  if (documents.length === 0) {
    return <div className="assist-empty">{t('assist.photo.empty')}</div>;
  }

  return (
    <section className="assist-document-list" aria-label={t('assist.card.uploaded')}>
      {documents.map((doc) => (
        <article className="assist-document" key={doc.id}>
          <img src={doc.previewUrl} alt="" />
          <div>
            <strong>{t('assist.card.uploaded')}</strong>
            <span>{assistStatusLabel(doc)}</span>
            {doc.status === 'processing' && <progress value={doc.progress} max="100" />}
            {doc.error && <p className="inline-error">{t('assist.problem')}</p>}
          </div>
        </article>
      ))}
    </section>
  );
}

function AssistConfirmCardStep({
  owner,
  card,
  userData,
  onUpdateField,
  onUpdateGender
}: {
  owner: AssistOwner;
  card: CardType;
  userData: UserData;
  onUpdateField: (field: FieldName, value: string) => void;
  onUpdateGender: (owner: AssistOwner, selected: 'm' | 'f' | 'other') => void;
}) {
  const foundFields = cardFieldManuals(owner, card).filter((manual) => isManualComplete(manual, userData));

  return (
    <div className="assist-confirm">
      <CardIllustration card={card} />
      {foundFields.length === 0 ? (
        <div className="assist-empty">{t('assist.card.confirm.empty')}</div>
      ) : (
        <section className="assist-found-list" aria-label={t('assist.card.confirm.title')}>
          {foundFields.map((manual) => (
            <ConfirmEditableRow
              key={manual.id}
              manual={manual}
              userData={userData}
              onUpdateField={onUpdateField}
              onUpdateGender={onUpdateGender}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function ConfirmEditableRow({
  manual,
  userData,
  onUpdateField,
  onUpdateGender
}: {
  manual: AssistManual;
  userData: UserData;
  onUpdateField: (field: FieldName, value: string) => void;
  onUpdateGender: (owner: AssistOwner, selected: 'm' | 'f' | 'other') => void;
}) {
  if (manual.kind === 'gender') {
    return (
      <div className="assist-found-row tall">
        <span>{t(manual.label)}</span>
        <AssistGenderStep
          owner={manual.owner}
          selected={selectedGender(manual.owner, userData)}
          motionApi={null}
          reducedMotion
          onChange={(selected) => onUpdateGender(manual.owner, selected)}
        />
      </div>
    );
  }

  if (manual.kind === 'choice') {
    return (
      <div className="assist-found-row">
        <span>{t(manual.label)}</span>
        <strong>{userData[manual.field].trim() || '-'}</strong>
      </div>
    );
  }

  const isText = manual.kind === 'text';

  return (
    <label className="assist-found-row">
      <span>{t(manual.label)}</span>
      {isText && manual.multiline ? (
        <textarea value={userData[manual.field]} rows={3} onChange={(event) => onUpdateField(manual.field, event.target.value)} />
      ) : (
        <input
          value={userData[manual.field]}
          inputMode={isText ? manual.inputMode : undefined}
          pattern={isText && (manual.inputMode === 'numeric' || manual.inputMode === 'tel') ? '[0-9]*' : undefined}
          onChange={(event) => onUpdateField(manual.field, event.target.value)}
        />
      )}
    </label>
  );
}

function CardIllustration({ card }: { card: CardType }) {
  const config = cardConfigs[card];
  const Icon = config.icon;
  return (
    <div className={`assist-card-illustration card-${card}`} aria-label={t(config.label)}>
      <Icon size={64} />
      <strong>{t(config.label)}</strong>
    </div>
  );
}

function AssistTextStep({
  manual,
  value,
  onUpdate
}: {
  manual: Extract<AssistManual, { kind: 'text' }>;
  value: string;
  onUpdate: (value: string) => void;
}) {
  const isNumberLike = manual.inputMode === 'numeric' || manual.inputMode === 'tel';

  return (
    <label className="assist-input-wrap">
      {manual.multiline ? (
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
          inputMode={manual.inputMode}
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
  ariaLabel,
  onUpdate
}: {
  field: FieldName;
  value: string;
  ariaLabel?: string;
  onUpdate: (value: string) => void;
}) {
  const parts = parseDateParts(value);

  function updatePart(part: 'day' | 'month' | 'year', nextValue: string) {
    const nextParts = { ...parts, [part]: nextValue };
    onUpdate(formatDateParts(nextParts));
  }

  return (
    <div className="assist-date-picker" aria-label={ariaLabel || t('assist.dob')}>
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
            const owner = `member${memberNumber}` as MemberOwner;
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

function scanCardScreen(owner: AssistOwner, card: CardType): AssistScreen {
  return { kind: 'scan-card', owner, card, question: cardConfigs[card].scanQuestion };
}

function offerCardScreen(owner: AssistOwner, card: CardType): AssistScreen {
  const question = cardConfigs[card].offerQuestion || cardConfigs[card].scanQuestion;
  return { kind: 'offer-card', owner, card, question };
}

function confirmCardScreen(owner: AssistOwner, card: CardType): AssistScreen {
  return { kind: 'confirm-card', owner, card, question: 'assist.card.confirm.title' };
}

function cardInstanceKey(owner: AssistOwner, card: CardType): string {
  return `${owner}-${card}`;
}

function cardFieldManuals(owner: AssistOwner, card: CardType): AssistManual[] {
  return cardConfigs[card].fields.map((suffix) => manualForField(owner, suffix));
}

function manualScreensForCard(owner: AssistOwner, card: CardType, userData: UserData): AssistScreen[] {
  return cardFieldManuals(owner, card)
    .filter((manual) => !isManualComplete(manual, userData))
    .map((manual) => ({ kind: 'manual', manual, question: manual.question }));
}

function screensAfterCard(
  owner: AssistOwner,
  card: CardType,
  userData: UserData,
  memberCount: number
): AssistScreen[] {
  const nextCard = cardOrder[cardOrder.indexOf(card) + 1];
  if (nextCard) {
    return [cardConfigs[nextCard].optional ? offerCardScreen(owner, nextCard) : scanCardScreen(owner, nextCard)];
  }

  return [...humanManualScreens(owner, userData), nextPersonScreen(memberCount)];
}

function humanManualScreens(owner: AssistOwner, userData: UserData): AssistScreen[] {
  const suffixes: AssistFieldSuffix[] =
    owner === 'hof'
      ? ['employment_status', 'education', 'scheme']
      : ['relation', 'employment_status', 'education', 'scheme'];

  return suffixes
    .map((suffix) => manualForField(owner, suffix))
    .filter((manual) => !isManualComplete(manual, userData))
    .map((manual) => ({ kind: 'manual', manual, question: manual.question }));
}

function nextPersonScreen(memberCount: number): AssistScreen {
  if (memberCount >= 5) return { kind: 'review', question: 'assist.review.title' };
  return {
    kind: 'add-member',
    question: memberCount === 0 ? 'assist.member.add' : 'assist.member.more'
  };
}

function manualForField(owner: AssistOwner, suffix: AssistFieldSuffix): AssistManual {
  const id = `${owner}-${suffix}`;

  switch (suffix) {
    case 'name':
      return {
        kind: 'text',
        id,
        owner,
        question: owner === 'hof' ? 'assist.name' : 'assist.member.name',
        label: 'summary.name',
        field: ownerField(owner, suffix)
      };
    case 'dob':
      return {
        kind: 'date',
        id,
        owner,
        question: owner === 'hof' ? 'assist.dob' : 'assist.member.dob',
        label: 'summary.dob',
        field: ownerField(owner, suffix)
      };
    case 'gender':
      return {
        kind: 'gender',
        id,
        owner,
        question: owner === 'hof' ? 'assist.gender' : 'assist.member.gender',
        label: 'summary.gender'
      };
    case 'aadhaar':
      return {
        kind: 'text',
        id,
        owner,
        question: owner === 'hof' ? 'assist.aadhaar' : 'assist.member.aadhaar',
        label: 'summary.aadhaar',
        field: ownerField(owner, suffix),
        inputMode: 'numeric'
      };
    case 'address':
      return {
        kind: 'text',
        id,
        owner,
        question: owner === 'hof' ? 'assist.address' : 'assist.member.address',
        label: 'summary.address',
        field: ownerField(owner, suffix),
        multiline: true
      };
    case 'pan':
      return {
        kind: 'text',
        id,
        owner,
        question: 'assist.field.pan',
        label: 'summary.pan',
        field: ownerField(owner, suffix)
      };
    case 'epic':
      return {
        kind: 'text',
        id,
        owner,
        question: 'assist.field.epic',
        label: 'summary.epic',
        field: ownerField(owner, suffix)
      };
    case 'ration_card':
      return {
        kind: 'text',
        id,
        owner,
        question: 'assist.field.ration',
        label: 'summary.ration',
        field: ownerField(owner, suffix)
      };
    case 'bank_name':
      return {
        kind: 'text',
        id,
        owner,
        question: 'assist.field.bankName',
        label: 'summary.bankName',
        field: ownerField(owner, suffix)
      };
    case 'bank_account':
      return {
        kind: 'text',
        id,
        owner,
        question: 'assist.field.bankAccount',
        label: 'summary.bankAccount',
        field: ownerField(owner, suffix),
        inputMode: 'numeric'
      };
    case 'bank_ifsc':
      return {
        kind: 'text',
        id,
        owner,
        question: 'assist.field.bankIfsc',
        label: 'summary.bankIfsc',
        field: ownerField(owner, suffix)
      };
    case 'relation':
      return {
        kind: 'choice',
        id,
        owner,
        question: 'assist.member.relation',
        label: 'summary.relation',
        field: ownerField(owner, suffix),
        choices: relationChoices
      };
    case 'employment_status':
      return {
        kind: 'choice',
        id,
        owner,
        question: 'assist.employment',
        label: 'summary.employment',
        field: ownerField(owner, suffix),
        choices: employmentChoices
      };
    case 'education':
      return {
        kind: 'choice',
        id,
        owner,
        question: 'assist.education',
        label: 'summary.education',
        field: ownerField(owner, suffix),
        choices: educationChoices
      };
    case 'scheme':
      return {
        kind: 'choice',
        id,
        owner,
        question: 'assist.scheme',
        label: 'summary.scheme',
        field: ownerField(owner, suffix),
        choices: schemeChoices
      };
    case 'mobile':
      return {
        kind: 'text',
        id,
        owner,
        question: owner === 'hof' ? 'assist.mobile' : 'assist.member.mobile',
        label: 'summary.mobile',
        field: ownerField(owner, suffix),
        inputMode: 'tel'
      };
  }
}

function ownerField(owner: AssistOwner, suffix: MemberFieldSuffix): FieldName {
  return owner === 'hof' ? contractField(`hof_${suffix}`) : memberField(owner, suffix);
}

function isManualComplete(manual: AssistManual, userData: UserData): boolean {
  if (manual.kind === 'gender') return selectedGender(manual.owner, userData) !== '';
  return userData[manual.field].trim().length > 0;
}

function estimateRemainingScreens(screen: AssistScreen): number {
  if (screen.kind === 'offer-card') {
    const cardsAfter = Math.max(0, cardOrder.length - cardOrder.indexOf(screen.card) - 1);
    return 2 + cardsAfter * 2 + 5;
  }

  if (screen.kind === 'scan-card') {
    const cardsAfter = Math.max(0, cardOrder.length - cardOrder.indexOf(screen.card) - 1);
    return 1 + cardsAfter * 2 + 5;
  }

  if (screen.kind === 'confirm-card') {
    const cardsAfter = Math.max(0, cardOrder.length - cardOrder.indexOf(screen.card) - 1);
    return cardsAfter * 2 + 5;
  }

  if (screen.kind === 'add-member') return 3;
  if (screen.kind === 'review') return 2;
  if (screen.kind === 'preview') return 1;
  return 0;
}

function memberField(owner: MemberOwner, suffix: MemberFieldSuffix): FieldName {
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
