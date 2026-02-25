import { EN_MESSAGES } from "./messages/en";
import { JA_MESSAGES } from "./messages/ja";
import { KO_MESSAGES } from "./messages/ko";
import { PHRASE_TO_KEY } from "./messages/phraseMap";
import { ZH_MESSAGES } from "./messages/zh";
import type { AppLocale, Dictionary } from "./types";

export const MESSAGES: Record<AppLocale, Dictionary> = {
  ko: KO_MESSAGES,
  en: EN_MESSAGES,
  jp: JA_MESSAGES,
  zh: ZH_MESSAGES,
};

export { PHRASE_TO_KEY };
