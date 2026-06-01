import { audioManifest } from './audioManifest';

let activeAudio: HTMLAudioElement | null = null;
let promptToken = 0;

export async function speakPrompt(key: string, text: string, muted: boolean): Promise<void> {
  promptToken += 1;
  const currentToken = promptToken;
  silenceActiveAudio();
  if (muted || typeof window === 'undefined') return;

  if (audioManifest.includes(key as (typeof audioManifest)[number])) {
    const playedAudio = await playRecordedPrompt(key, currentToken);
    if (playedAudio || currentToken !== promptToken) return;
  }

  speakWithBrowserVoice(text, currentToken);
}

export function stopSpeaking(): void {
  promptToken += 1;
  silenceActiveAudio();
}

function silenceActiveAudio(): void {
  activeAudio?.pause();
  activeAudio = null;
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
}

async function playRecordedPrompt(key: string, token: number): Promise<boolean> {
  const url = `${import.meta.env.BASE_URL}audio/bn/${key}.mp3`;
  try {
    const response = await fetch(url, { method: 'HEAD', cache: 'force-cache' });
    await response.body?.cancel();
    if (!response.ok || token !== promptToken) return false;

    const audio = new Audio(url);
    activeAudio = audio;
    await audio.play();
    return token === promptToken;
  } catch {
    return false;
  }
}

function speakWithBrowserVoice(text: string, token: number): void {
  if (!('speechSynthesis' in window) || token !== promptToken) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'bn-IN';
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}
