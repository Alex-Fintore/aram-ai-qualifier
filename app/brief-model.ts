import {
  briefSteps,
  funnelMetrics,
  materialItems,
  pilotMetrics,
  primaryQuestions,
} from "./brief-content";

export const PRIMARY_DRAFT_KEY = "aram-ai-qualifier-primary-brief-v2";
export const DRAFT_KEY = "aram-ai-qualifier-deep-brief-v2";

export type PilotMetricAnswer = {
  current: string;
  target: string;
  priority: string;
};

export type MaterialAnswer = {
  status: string;
  link: string;
};

export type BriefDraft = {
  version: 1;
  currentStep: number;
  answers: Record<string, string>;
  funnel: Record<string, string>;
  pilot: Record<string, PilotMetricAnswer>;
  materials: Record<string, MaterialAnswer>;
  confirmations: {
    noClientPersonalData: boolean;
    senderConsent: boolean;
  };
  savedAt: string | null;
};

export type PrimaryBriefDraft = {
  version: 2;
  answers: Record<string, string>;
  confirmations: {
    noClientPersonalData: boolean;
    senderConsent: boolean;
  };
  savedAt: string | null;
};

export function createInitialPrimaryDraft(): PrimaryBriefDraft {
  return {
    version: 2,
    answers: Object.fromEntries(
      primaryQuestions.map((question) => [question.id, ""]),
    ),
    confirmations: {
      noClientPersonalData: false,
      senderConsent: false,
    },
    savedAt: null,
  };
}

export function restorePrimaryDraft(
  raw: string | null,
): PrimaryBriefDraft | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PrimaryBriefDraft>;
    if (parsed.version !== 2 || !parsed.answers) return null;

    const initial = createInitialPrimaryDraft();
    return {
      ...initial,
      ...parsed,
      answers: { ...initial.answers, ...parsed.answers },
      confirmations: {
        ...initial.confirmations,
        ...parsed.confirmations,
      },
    };
  } catch {
    return null;
  }
}

export function validatePrimary(draft: PrimaryBriefDraft): string[] {
  return primaryQuestions
    .filter((question) => question.required)
    .map((question) => question.id)
    .filter((id) => !draft.answers[id]?.trim());
}

export function createInitialDraft(): BriefDraft {
  const answers = Object.fromEntries(
    briefSteps.flatMap((step) => step.fields.map((field) => [field.id, ""])),
  );

  answers.known_status = "";
  answers.known_corrections = "";

  return {
    version: 1,
    currentStep: 0,
    answers,
    funnel: Object.fromEntries(funnelMetrics.map((metric) => [metric.id, ""])),
    pilot: Object.fromEntries(
      pilotMetrics.map((metric) => [
        metric.id,
        { current: "", target: "", priority: "" },
      ]),
    ),
    materials: Object.fromEntries(
      materialItems.map((item) => [item.id, { status: "", link: "" }]),
    ),
    confirmations: {
      noClientPersonalData: false,
      senderConsent: false,
    },
    savedAt: null,
  };
}

export function restoreDraft(raw: string | null): BriefDraft | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<BriefDraft>;
    if (parsed.version !== 1 || !parsed.answers) return null;

    const initial = createInitialDraft();
    return {
      ...initial,
      ...parsed,
      currentStep: Math.min(Math.max(Number(parsed.currentStep) || 0, 0), 6),
      answers: { ...initial.answers, ...parsed.answers },
      funnel: { ...initial.funnel, ...parsed.funnel },
      pilot: { ...initial.pilot, ...parsed.pilot },
      materials: { ...initial.materials, ...parsed.materials },
      confirmations: {
        ...initial.confirmations,
        ...parsed.confirmations,
      },
    };
  } catch {
    return null;
  }
}

export function createDeepDraftFromPrimary(
  primary: PrimaryBriefDraft,
): BriefDraft {
  const draft = createInitialDraft();
  const targetCall = [
    primary.answers.qualifying_questions,
    primary.answers.target_action,
  ]
    .filter((value) => value?.trim())
    .join("\n\n");

  return {
    ...draft,
    answers: {
      ...draft.answers,
      company: primary.answers.company ?? "",
      contact_name: primary.answers.contact_name ?? "",
      contact_channel: primary.answers.contact_channel ?? "",
      known_status: "confirmed",
      company_context: primary.answers.company ?? "",
      lead_volume: primary.answers.lead_volume ?? "",
      current_call: primary.answers.current_call ?? "",
      qualification_rules: primary.answers.qualification_rules ?? "",
      target_call: targetCall,
      crm: primary.answers.systems ?? "",
      pilot_scope: primary.answers.pilot_goal ?? "",
    },
  };
}

export function validateIntro(draft: BriefDraft): string[] {
  const required = ["company", "contact_name", "role", "contact_channel"];
  const missing = required.filter((id) => !draft.answers[id]?.trim());
  if (!draft.answers.known_status) missing.push("known_status");
  if (
    draft.answers.known_status === "changes" &&
    !draft.answers.known_corrections?.trim()
  ) {
    missing.push("known_corrections");
  }
  return missing;
}

function visible(value: string | undefined) {
  return value?.trim() || "—";
}

export function serializePrimaryBrief(
  draft: Pick<PrimaryBriefDraft, "answers">,
): string {
  const lines = [
    "# Короткий бриф для первичной оценки AI-квалификатора",
    "",
  ];

  for (const [index, question] of primaryQuestions.entries()) {
    lines.push(
      `## ${index + 1}. ${question.label}`,
      "",
      visible(draft.answers[question.id]),
      "",
    );
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function serializeBrief(draft: BriefDraft): string {
  const lines: string[] = [
    "# Бриф для подготовки пилота AI-квалификатора",
    "",
    `Компания: ${visible(draft.answers.company)}`,
    `Контакт: ${visible(draft.answers.contact_name)}`,
    `Роль: ${visible(draft.answers.role)}`,
    `Связь: ${visible(draft.answers.contact_channel)}`,
    `Дата: ${visible(draft.answers.date)}`,
    "",
    "## Проверка исходных данных",
    "",
    draft.answers.known_status === "confirmed"
      ? "Исходные данные подтверждены."
      : draft.answers.known_status === "changes"
        ? `Нужны исправления: ${visible(draft.answers.known_corrections)}`
        : "Не заполнено.",
  ];

  for (const step of briefSteps.slice(1)) {
    lines.push("", `## ${step.title}`, "");
    for (const field of step.fields) {
      lines.push(`### ${field.label}`, "", visible(draft.answers[field.id]), "");
    }

    if (step.id === "business") {
      lines.push("### Базовые показатели воронки", "");
      for (const metric of funnelMetrics) {
        lines.push(`- ${metric.label}: ${visible(draft.funnel[metric.id])}`);
      }
      lines.push("");
    }

    if (step.id === "pilot") {
      lines.push("### Критерии успеха", "");
      for (const metric of pilotMetrics) {
        const answer = draft.pilot[metric.id];
        lines.push(
          `- ${metric.label}: сейчас — ${visible(answer?.current)}; цель — ${visible(answer?.target)}; приоритет — ${visible(answer?.priority)}`,
        );
      }
      lines.push("", "### Готовность материалов", "");
      for (const item of materialItems) {
        const answer = draft.materials[item.id];
        lines.push(
          `- ${item.label}: ${visible(answer?.status)}${answer?.link?.trim() ? `; ${answer.link.trim()}` : ""}`,
        );
      }
    }
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function buildSubmissionPayload(
  draft: Pick<PrimaryBriefDraft, "answers"> | Pick<BriefDraft, "answers">,
) {
  const channel = draft.answers.contact_channel?.trim() || "";
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(channel) ? channel : "";

  return {
    _subject: `Первичный бриф AI-квалификатора — ${visible(draft.answers.company)}`,
    submission_type: "Короткий первичный бриф",
    company: visible(draft.answers.company),
    contact_name: visible(draft.answers.contact_name),
    contact_channel: channel,
    ...(email ? { _replyto: email } : {}),
    source: "GitHub Pages — AI-квалификатор",
    submitted_at: new Date().toISOString(),
    brief: serializePrimaryBrief(draft),
  };
}

export function buildDeepSubmissionPayload(draft: BriefDraft) {
  const channel = draft.answers.contact_channel?.trim() || "";
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(channel) ? channel : "";

  return {
    _subject: `Дополнение к брифу AI-квалификатора — ${visible(draft.answers.company)}`,
    submission_type: "Углублённый бриф",
    company: visible(draft.answers.company),
    contact_name: visible(draft.answers.contact_name),
    contact_channel: channel,
    ...(email ? { _replyto: email } : {}),
    source: "GitHub Pages — AI-квалификатор",
    submitted_at: new Date().toISOString(),
    brief: serializeBrief(draft),
  };
}
