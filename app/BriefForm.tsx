"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useState } from "react";
import {
  briefSteps,
  funnelMetrics,
  materialItems,
  pilotMetrics,
  primaryQuestions,
  type BriefField,
} from "./brief-content";
import {
  DRAFT_KEY,
  PRIMARY_DRAFT_KEY,
  buildDeepSubmissionPayload,
  buildSubmissionPayload,
  createDeepDraftFromPrimary,
  createInitialPrimaryDraft,
  restoreDraft,
  restorePrimaryDraft,
  validatePrimary,
  type BriefDraft,
  type PrimaryBriefDraft,
} from "./brief-model";

const endpoint = process.env.NEXT_PUBLIC_FORMSPREE_ENDPOINT?.trim() ?? "";
const endpointReady = /^https:\/\/formspree\.io\/f\/[a-zA-Z0-9]+$/.test(
  endpoint,
);

type SubmitState = "idle" | "sending" | "success" | "error";

async function postPayload(payload: Record<string, string>) {
  const formData = new FormData();
  Object.entries(payload).forEach(([key, value]) => formData.append(key, value));
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Accept: "application/json" },
    body: formData,
  });

  if (response.ok) return;
  if (response.status === 429) {
    throw new Error("Слишком много попыток. Подождите несколько минут.");
  }
  if (response.status === 422) {
    throw new Error("Проверьте контактные данные и попробуйте ещё раз.");
  }
  throw new Error("Не удалось отправить. Попробуйте ещё раз.");
}

function SiteHeader() {
  return (
    <header className="site-header">
      <a className="brand" href="#top" aria-label="К началу брифа">
        <span className="brand__mark" aria-hidden="true">
          AI
        </span>
        <span className="brand__text">
          <strong>AI-квалификатор</strong>
        </span>
      </a>
      <span className="confidentiality">
        <span className="confidentiality__dot" aria-hidden="true" />
        Конфиденциально
      </span>
    </header>
  );
}

function PrimaryQuestion({
  field,
  index,
  value,
  error,
  onChange,
}: {
  field: BriefField;
  index: number;
  value: string;
  error: boolean;
  onChange: (value: string) => void;
}) {
  const errorId = `${field.id}-error`;
  const isShort = field.kind === "short";

  return (
    <section
      className={`quick-question${isShort ? " quick-question--short" : ""}`}
      data-brief-question="primary"
    >
      <div className="quick-question__number" aria-hidden="true">
        {String(index + 1).padStart(2, "0")}
      </div>
      <div className="quick-question__body">
        <label className="quick-question__label" htmlFor={field.id}>
          {field.label}
          {field.required ? <span className="question-tag">обязательно</span> : null}
        </label>
        {isShort ? (
          <input
            id={field.id}
            name={field.id}
            className="input"
            value={value}
            placeholder={field.placeholder}
            autoComplete={
              field.id === "contact_name"
                ? "name"
                : field.id === "contact_channel"
                  ? "email"
                  : "off"
            }
            aria-describedby={error ? errorId : undefined}
            aria-invalid={error || undefined}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : (
          <textarea
            id={field.id}
            name={field.id}
            className="textarea textarea--quick"
            value={value}
            placeholder={field.placeholder}
            rows={2}
            aria-describedby={error ? errorId : undefined}
            aria-invalid={error || undefined}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
        {error ? (
          <p id={errorId} className="field__error">
            Добавьте короткий ответ.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function DeepTextField({
  field,
  value,
  onChange,
}: {
  field: BriefField;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field" data-brief-question="deep">
      <label htmlFor={`deep-${field.id}`} className="field__label">
        {field.label}
      </label>
      <p id={`deep-${field.id}-prompt`} className="field__prompt">
        {field.prompt}
      </p>
      <textarea
        id={`deep-${field.id}`}
        className="textarea"
        value={value}
        placeholder={field.placeholder}
        rows={4}
        aria-describedby={`deep-${field.id}-prompt`}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function FunnelMetrics({
  values,
  onChange,
}: {
  values: BriefDraft["funnel"];
  onChange: (id: string, value: string) => void;
}) {
  return (
    <section className="subsection" data-brief-question="deep">
      <div className="subsection__heading">
        <div>
          <span className="subsection__number">Показатели</span>
          <h3>Базовые показатели воронки</h3>
        </div>
        <p>Можно диапазоном или «нет данных»</p>
      </div>
      <div className="metric-list">
        {funnelMetrics.map((metric) => (
          <label className="metric-row" key={metric.id} htmlFor={`deep-${metric.id}`}>
            <span className="metric-row__label">{metric.label}</span>
            <input
              id={`deep-${metric.id}`}
              className="input input--metric"
              value={values[metric.id]}
              placeholder={metric.placeholder}
              onChange={(event) => onChange(metric.id, event.target.value)}
            />
          </label>
        ))}
      </div>
    </section>
  );
}

function PilotMetrics({
  values,
  onChange,
}: {
  values: BriefDraft["pilot"];
  onChange: (
    id: string,
    key: "current" | "target" | "priority",
    value: string,
  ) => void;
}) {
  return (
    <section className="subsection" data-brief-question="deep">
      <div className="subsection__heading">
        <div>
          <span className="subsection__number">Оценка пилота</span>
          <h3>Критерии успешности</h3>
        </div>
        <p>Заполняйте только те метрики, которые уже считаете</p>
      </div>
      <div className="pilot-table" role="group" aria-label="Критерии пилота">
        <div className="pilot-table__head" aria-hidden="true">
          <span>Метрика</span>
          <span>Сейчас</span>
          <span>Цель</span>
          <span>Приоритет</span>
        </div>
        {pilotMetrics.map((metric) => (
          <div className="pilot-table__row" key={metric.id}>
            <div className="pilot-table__label">{metric.label}</div>
            <label>
              <span className="mobile-label">Сейчас</span>
              <input
                className="input input--table"
                value={values[metric.id].current}
                placeholder="—"
                aria-label={`${metric.label}: текущий уровень`}
                onChange={(event) =>
                  onChange(metric.id, "current", event.target.value)
                }
              />
            </label>
            <label>
              <span className="mobile-label">Цель</span>
              <input
                className="input input--table"
                value={values[metric.id].target}
                placeholder="—"
                aria-label={`${metric.label}: цель пилота`}
                onChange={(event) =>
                  onChange(metric.id, "target", event.target.value)
                }
              />
            </label>
            <label>
              <span className="mobile-label">Приоритет</span>
              <select
                className="select select--table"
                value={values[metric.id].priority}
                aria-label={`${metric.label}: приоритет`}
                onChange={(event) =>
                  onChange(metric.id, "priority", event.target.value)
                }
              >
                <option value="">Не выбран</option>
                <option value="Высокий">Высокий</option>
                <option value="Средний">Средний</option>
                <option value="Низкий">Низкий</option>
              </select>
            </label>
          </div>
        ))}
      </div>
    </section>
  );
}

function Materials({
  values,
  onChange,
}: {
  values: BriefDraft["materials"];
  onChange: (id: string, key: "status" | "link", value: string) => void;
}) {
  return (
    <section className="subsection" data-brief-question="deep">
      <div className="subsection__heading">
        <div>
          <span className="subsection__number">Материалы</span>
          <h3>Что ускорит подготовку предложения</h3>
        </div>
        <p>Чувствительные файлы передадим отдельно</p>
      </div>
      <div className="materials-list">
        {materialItems.map((item, index) => (
          <div className="material-card" key={item.id}>
            <span className="material-card__index" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="material-card__body">
              <p>{item.label}</p>
              <div className="material-card__controls">
                <label>
                  <span>Статус</span>
                  <select
                    className="select"
                    value={values[item.id].status}
                    onChange={(event) =>
                      onChange(item.id, "status", event.target.value)
                    }
                  >
                    <option value="">Не выбран</option>
                    <option value="Предоставим позже">Предоставим позже</option>
                    <option value="Есть ссылка">Есть ссылка</option>
                    <option value="Отсутствует">Отсутствует</option>
                    <option value="Не применимо">Не применимо</option>
                  </select>
                </label>
                <label>
                  <span>Ссылка или комментарий</span>
                  <input
                    className="input"
                    value={values[item.id].link}
                    placeholder="https://… или короткий комментарий"
                    onChange={(event) =>
                      onChange(item.id, "link", event.target.value)
                    }
                  />
                </label>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function DeepDiveForm({ primary }: { primary: PrimaryBriefDraft }) {
  const [draft, setDraft] = useState<BriefDraft>(() =>
    createDeepDraftFromPrimary(primary),
  );
  const [hydrated, setHydrated] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitMessage, setSubmitMessage] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const restored = restoreDraft(window.localStorage.getItem(DRAFT_KEY));
      const belongsToCurrentBrief =
        restored?.answers.company?.trim() === primary.answers.company?.trim() &&
        restored?.answers.contact_channel?.trim() ===
          primary.answers.contact_channel?.trim();

      if (restored && belongsToCurrentBrief) {
        setDraft(restored);
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [primary.answers.company, primary.answers.contact_channel]);

  useEffect(() => {
    if (!hydrated || submitState === "success") return;
    const timer = window.setTimeout(() => {
      const savedAt = new Date().toISOString();
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, savedAt }));
    }, 450);
    return () => window.clearTimeout(timer);
  }, [draft, hydrated, submitState]);

  const setAnswer = (id: string, value: string) =>
    setDraft((current) => ({
      ...current,
      answers: { ...current.answers, [id]: value },
    }));

  const setFunnel = (id: string, value: string) =>
    setDraft((current) => ({
      ...current,
      funnel: { ...current.funnel, [id]: value },
    }));

  const setPilot = (
    id: string,
    key: "current" | "target" | "priority",
    value: string,
  ) =>
    setDraft((current) => ({
      ...current,
      pilot: {
        ...current.pilot,
        [id]: { ...current.pilot[id], [key]: value },
      },
    }));

  const setMaterial = (
    id: string,
    key: "status" | "link",
    value: string,
  ) =>
    setDraft((current) => ({
      ...current,
      materials: {
        ...current.materials,
        [id]: { ...current.materials[id], [key]: value },
      },
    }));

  const submitDeep = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitMessage("");

    if (!endpointReady) {
      setSubmitState("error");
      setSubmitMessage("Отправка временно недоступна. Попробуйте позже.");
      return;
    }

    setSubmitState("sending");
    try {
      await postPayload(buildDeepSubmissionPayload(draft));
      window.localStorage.removeItem(DRAFT_KEY);
      setSubmitState("success");
    } catch (error) {
      setSubmitState("error");
      setSubmitMessage(
        error instanceof Error ? error.message : "Не удалось отправить дополнение.",
      );
    }
  };

  if (submitState === "success") {
    return (
      <section className="deep-complete" aria-live="polite">
        <span className="success-panel__mark" aria-hidden="true">
          ✓
        </span>
        <div>
          <span className="eyebrow">Дополнение отправлено</span>
          <h2>Спасибо, теперь оценка будет точнее</h2>
          <p>Дополнительные сведения помогут точнее определить состав пилота, сроки и бюджет.</p>
        </div>
      </section>
    );
  }

  return (
    <section id="deep-brief" className="deep-brief" aria-labelledby="deep-title">
      <header className="deep-brief__header">
        <span className="eyebrow">По желанию</span>
        <h2 id="deep-title">Углублённый бриф</h2>
        <p>
          Первые ответы уже у нас. Заполняйте только те детали, которые известны сейчас —
          остальное обсудим на встрече.
        </p>
      </header>

      <div className="deep-privacy">
        Не добавляйте персональные данные клиентов, записи разговоров, пароли или ключи доступа.
      </div>

      <form className="deep-form" onSubmit={submitDeep}>
        {briefSteps.slice(1).map((step, index) => (
          <details className="deep-section" key={step.id} open={index === 0}>
            <summary>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <span>
                <strong>{step.title}</strong>
                <small>{step.description}</small>
              </span>
            </summary>
            <div className="deep-section__content">
              <div className="fields">
                {step.fields.map((field) => (
                  <DeepTextField
                    key={field.id}
                    field={field}
                    value={draft.answers[field.id]}
                    onChange={(value) => setAnswer(field.id, value)}
                  />
                ))}
              </div>
              {step.id === "business" ? (
                <FunnelMetrics values={draft.funnel} onChange={setFunnel} />
              ) : null}
              {step.id === "pilot" ? (
                <>
                  <PilotMetrics values={draft.pilot} onChange={setPilot} />
                  <Materials values={draft.materials} onChange={setMaterial} />
                </>
              ) : null}
            </div>
          </details>
        ))}

        {submitMessage ? (
          <div className="submit-message" role="alert">
            {submitMessage}
          </div>
        ) : null}

        <footer className="deep-form__footer">
          <button
            type="submit"
            className="button"
            disabled={!endpointReady || submitState === "sending"}
          >
            {submitState === "sending" ? "Отправляем…" : "Отправить дополнительные данные"}
          </button>
        </footer>
      </form>
    </section>
  );
}

export function BriefForm() {
  const [draft, setDraft] = useState<PrimaryBriefDraft>(() =>
    createInitialPrimaryDraft(),
  );
  const [hydrated, setHydrated] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitMessage, setSubmitMessage] = useState("");
  const [showDeep, setShowDeep] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const restored = restorePrimaryDraft(
        window.localStorage.getItem(PRIMARY_DRAFT_KEY),
      );
      if (restored) {
        setDraft(restored);
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated || submitState === "success") return;
    const timer = window.setTimeout(() => {
      const savedAt = new Date().toISOString();
      window.localStorage.setItem(
        PRIMARY_DRAFT_KEY,
        JSON.stringify({ ...draft, savedAt }),
      );
    }, 450);
    return () => window.clearTimeout(timer);
  }, [draft, hydrated, submitState]);

  const setAnswer = (id: string, value: string) => {
    setDraft((current) => ({
      ...current,
      answers: { ...current.answers, [id]: value },
    }));
    setErrors((current) => current.filter((item) => item !== id));
  };

  const submitPrimary = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitMessage("");

    const missing = validatePrimary(draft);
    if (missing.length) {
      setErrors(missing);
      window.setTimeout(() => document.getElementById(missing[0])?.focus(), 0);
      return;
    }

    if (
      !draft.confirmations.noClientPersonalData ||
      !draft.confirmations.senderConsent
    ) {
      setSubmitState("error");
      setSubmitMessage("Подтвердите согласие перед отправкой.");
      return;
    }

    if (!endpointReady) {
      setSubmitState("error");
      setSubmitMessage("Отправка временно недоступна. Попробуйте позже.");
      return;
    }

    setSubmitState("sending");
    try {
      await postPayload(buildSubmissionPayload(draft));
      window.localStorage.removeItem(PRIMARY_DRAFT_KEY);
      setSubmitState("success");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setSubmitState("error");
      setSubmitMessage(
        error instanceof Error ? error.message : "Не удалось отправить. Попробуйте ещё раз.",
      );
    }
  };

  if (submitState === "success") {
    return (
      <div id="top" className="page-shell page-shell--after-submit">
        <SiteHeader />
        <main className="after-submit">
          <section className="primary-success" aria-live="polite">
            <div className="success-panel__mark" aria-hidden="true">
              ✓
            </div>
            <div>
              <span className="eyebrow">Основные данные отправлены</span>
              <h1>Спасибо — этого достаточно для первичного разбора</h1>
              <p>
                Мы сможем предложить возможный сценарий решения, формат пилота и
                предварительный ориентир по срокам и стоимости.
              </p>
            </div>
          </section>

          {!showDeep ? (
            <section className="deep-offer" aria-labelledby="deep-offer-title">
              <div>
                <span className="eyebrow">Необязательно</span>
                <h2 id="deep-offer-title">Хотите получить более точную оценку?</h2>
                <p>
                  Можно сразу дополнить сведения об интеграциях, экономике,
                  безопасности и критериях пилота. Первые ответы уже получены —
                  ничего повторять не придётся.
                </p>
              </div>
              <div className="deep-offer__action">
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    setShowDeep(true);
                    window.setTimeout(
                      () => document.getElementById("deep-brief")?.scrollIntoView({ behavior: "smooth" }),
                      0,
                    );
                  }}
                >
                  Уточнить детали
                  <span aria-hidden="true">→</span>
                </button>
                <small>Или просто закройте страницу — основные данные уже у нас.</small>
              </div>
            </section>
          ) : (
            <DeepDiveForm primary={draft} />
          )}
        </main>
      </div>
    );
  }

  return (
    <div id="top" className="page-shell page-shell--quick">
      <SiteHeader />
      <main>
        <section className="quick-hero" aria-labelledby="brief-title">
          <div className="quick-hero__copy">
            <h1 id="brief-title">
              Короткий бриф
            </h1>
            <p>
              Коротко опишите текущий процесс и ожидаемый результат — этого
              достаточно для первичной оценки.
            </p>
          </div>
        </section>

        <form className="quick-form" onSubmit={submitPrimary} noValidate>
          {errors.length ? (
            <div className="error-summary" role="alert">
              Заполните отмеченные вопросы — можно ответить буквально одной фразой.
            </div>
          ) : null}

          <div className="quick-question-grid">
            {primaryQuestions.map((question, index) => (
              <PrimaryQuestion
                key={question.id}
                field={question}
                index={index}
                value={draft.answers[question.id]}
                error={errors.includes(question.id)}
                onChange={(value) => setAnswer(question.id, value)}
              />
            ))}
          </div>

          <section className="quick-confirmations" aria-label="Согласие перед отправкой">
            <label className="confirmation-check">
              <input
                type="checkbox"
                checked={
                  draft.confirmations.noClientPersonalData &&
                  draft.confirmations.senderConsent
                }
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setDraft((current) => ({
                    ...current,
                    confirmations: {
                      noClientPersonalData: event.target.checked,
                      senderConsent: event.target.checked,
                    },
                  }))
                }
              />
              <span>
                В ответах нет персональных данных клиентов, записей разговоров,
                паролей или ключей доступа; мои контакты можно использовать для
                подготовки оценки.
              </span>
            </label>
          </section>

          {!endpointReady ? (
            <div className="channel-note">
              <span aria-hidden="true">i</span>
              <p>
                Отправка временно недоступна. Попробуйте позже.
              </p>
            </div>
          ) : null}

          {submitMessage ? (
            <div className="submit-message" role="alert">
              {submitMessage}
            </div>
          ) : null}

          <footer className="quick-form__footer">
            <button
              type="submit"
              className="button button--submit-primary"
              disabled={!endpointReady || submitState === "sending"}
            >
              {submitState === "sending"
                ? "Отправляем…"
                : endpointReady
                  ? "Отправить на первичную оценку"
                  : "Отправка недоступна"}
            </button>
          </footer>
        </form>
      </main>
    </div>
  );
}
