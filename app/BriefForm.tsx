"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useState } from "react";
import {
  briefSteps,
  funnelMetrics,
  knownFacts,
  materialItems,
  pilotMetrics,
  type BriefField,
} from "./brief-content";
import {
  DRAFT_KEY,
  buildSubmissionPayload,
  createInitialDraft,
  restoreDraft,
  serializeBrief,
  validateIntro,
  type BriefDraft,
} from "./brief-model";

const endpoint = process.env.NEXT_PUBLIC_FORMSPREE_ENDPOINT?.trim() ?? "";
const endpointReady = /^https:\/\/formspree\.io\/f\/[a-zA-Z0-9]+$/.test(
  endpoint,
);

type FieldProps = {
  field: BriefField;
  value: string;
  error?: boolean;
  onChange: (value: string) => void;
};

function TextField({ field, value, error, onChange }: FieldProps) {
  const describedBy = `${field.id}-prompt${error ? ` ${field.id}-error` : ""}`;

  return (
    <div
      className={`field ${field.kind === "short" || field.kind === "date" ? "field--compact" : ""}`}
    >
      <label htmlFor={field.id} className="field__label">
        {field.label}
        {field.required ? <span className="required">обязательно</span> : null}
      </label>
      <p id={`${field.id}-prompt`} className="field__prompt">
        {field.prompt}
      </p>
      {field.kind === "short" || field.kind === "date" ? (
        <input
          id={field.id}
          name={field.id}
          className="input"
          type={field.kind === "date" ? "date" : "text"}
          autoComplete={
            field.id === "company"
              ? "organization"
              : field.id === "contact_name"
                ? "name"
                : "off"
          }
          value={value}
          placeholder={field.placeholder}
          aria-describedby={describedBy}
          aria-invalid={error || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <textarea
          id={field.id}
          name={field.id}
          className="textarea"
          value={value}
          placeholder={field.placeholder}
          rows={5}
          aria-describedby={describedBy}
          aria-invalid={error || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {field.help ? <p className="field__help">{field.help}</p> : null}
      {error ? (
        <p id={`${field.id}-error`} className="field__error">
          Заполните это поле.
        </p>
      ) : null}
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="site-header">
      <a className="brand" href="#top" aria-label="К началу брифа">
        <span className="brand__mark" aria-hidden="true">
          AI
        </span>
        <span className="brand__text">
          <strong>Квалификатор</strong>
          <small>Бриф для пилота</small>
        </span>
      </a>
      <span className="confidentiality">
        <span className="confidentiality__dot" aria-hidden="true" />
        Конфиденциально
      </span>
    </header>
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
    <section className="subsection" aria-labelledby="funnel-metrics-title">
      <div className="subsection__heading">
        <div>
          <span className="subsection__number">1.3</span>
          <h3 id="funnel-metrics-title">Базовые показатели воронки</h3>
        </div>
        <p>За последние 2–4 недели</p>
      </div>
      <div className="metric-list">
        {funnelMetrics.map((metric) => {
          const noData = values[metric.id] === "нет данных";
          return (
            <div className="metric-row" key={metric.id}>
              <label htmlFor={metric.id} className="metric-row__label">
                {metric.label}
              </label>
              <div className="metric-row__controls">
                <input
                  id={metric.id}
                  className="input input--metric"
                  value={noData ? "" : values[metric.id]}
                  disabled={noData}
                  placeholder={metric.placeholder}
                  onChange={(event) => onChange(metric.id, event.target.value)}
                />
                <label className="mini-check">
                  <input
                    type="checkbox"
                    checked={noData}
                    onChange={(event) =>
                      onChange(metric.id, event.target.checked ? "нет данных" : "")
                    }
                  />
                  <span>нет данных</span>
                </label>
              </div>
            </div>
          );
        })}
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
    <section className="subsection" aria-labelledby="pilot-metrics-title">
      <div className="subsection__heading">
        <div>
          <span className="subsection__number">5.2</span>
          <h3 id="pilot-metrics-title">Критерии успешности</h3>
        </div>
        <p>Если метрика не считается, укажите «нет данных»</p>
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
    <section className="subsection" aria-labelledby="materials-title">
      <div className="subsection__heading">
        <div>
          <span className="subsection__number">Материалы</span>
          <h3 id="materials-title">Что ускорит подготовку предложения</h3>
        </div>
        <p>Большие файлы передадим отдельно через безопасный канал</p>
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
                    <option value="Приложено ссылкой">Приложено ссылкой</option>
                    <option value="Предоставим позже">Предоставим позже</option>
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

function Review({
  draft,
  onEdit,
}: {
  draft: BriefDraft;
  onEdit: (index: number) => void;
}) {
  return (
    <div className="review">
      <div className="review__intro">
        <span className="eyebrow">Проверка перед отправкой</span>
        <h2>Всё собрано в одном месте</h2>
        <p>
          Просмотрите ответы. Пустые поля допустимы — мы уточним их на следующем
          шаге.
        </p>
      </div>
      <div className="review__sections">
        {briefSteps.map((step, index) => {
          const answered = step.fields.filter(
            (field) => draft.answers[field.id]?.trim(),
          );
          return (
            <section className="review-card" key={step.id}>
              <div className="review-card__head">
                <div>
                  <span>{step.number}</span>
                  <h3>{step.title}</h3>
                </div>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onEdit(index)}
                >
                  Изменить
                </button>
              </div>
              {answered.length ? (
                <dl>
                  {answered.map((field) => (
                    <div key={field.id}>
                      <dt>{field.label}</dt>
                      <dd>{draft.answers[field.id]}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="review-card__empty">Ответов пока нет.</p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function BriefForm() {
  const [draft, setDraft] = useState<BriefDraft>(() => createInitialDraft());
  const [hydrated, setHydrated] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitState, setSubmitState] = useState<
    "idle" | "sending" | "success" | "error"
  >("idle");
  const [submitMessage, setSubmitMessage] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const restored = restoreDraft(window.localStorage.getItem(DRAFT_KEY));
      if (restored) {
        setDraft(restored);
        setLastSaved(restored.savedAt);
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
        DRAFT_KEY,
        JSON.stringify({ ...draft, savedAt }),
      );
      setLastSaved(savedAt);
    }, 450);

    return () => window.clearTimeout(timer);
  }, [draft, hydrated, submitState]);

  const stepIndex = draft.currentStep;
  const isReview = stepIndex === briefSteps.length;
  const activeStep = briefSteps[Math.min(stepIndex, briefSteps.length - 1)];
  const progress = Math.round(((stepIndex + 1) / (briefSteps.length + 1)) * 100);

  const setAnswer = (id: string, value: string) => {
    setDraft((current) => ({
      ...current,
      answers: { ...current.answers, [id]: value },
    }));
    setErrors((current) => current.filter((item) => item !== id));
  };

  const setFunnel = (id: string, value: string) => {
    setDraft((current) => ({
      ...current,
      funnel: { ...current.funnel, [id]: value },
    }));
  };

  const setPilot = (
    id: string,
    key: "current" | "target" | "priority",
    value: string,
  ) => {
    setDraft((current) => ({
      ...current,
      pilot: {
        ...current.pilot,
        [id]: { ...current.pilot[id], [key]: value },
      },
    }));
  };

  const setMaterial = (
    id: string,
    key: "status" | "link",
    value: string,
  ) => {
    setDraft((current) => ({
      ...current,
      materials: {
        ...current.materials,
        [id]: { ...current.materials[id], [key]: value },
      },
    }));
  };

  const moveTo = (nextStep: number) => {
    setErrors([]);
    setDraft((current) => ({ ...current, currentStep: nextStep }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const next = () => {
    if (stepIndex === 0) {
      const missing = validateIntro(draft);
      if (missing.length) {
        setErrors(missing);
        window.setTimeout(() => {
          document.getElementById(missing[0])?.focus();
        }, 0);
        return;
      }
    }
    moveTo(Math.min(stepIndex + 1, briefSteps.length));
  };

  const downloadCopy = () => {
    const safeCompany = (draft.answers.company || "company")
      .toLowerCase()
      .replace(/[^a-zа-яё0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48);
    const file = new Blob([serializeBrief(draft)], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ai-qualifier-brief-${safeCompany || "company"}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitMessage("");

    if (!endpointReady) {
      setSubmitState("error");
      setSubmitMessage(
        "Канал приёма ответов ещё подключается. Скачайте копию — черновик также сохранён на этом устройстве.",
      );
      return;
    }

    if (
      !draft.confirmations.noClientPersonalData ||
      !draft.confirmations.senderConsent
    ) {
      setSubmitState("error");
      setSubmitMessage("Подтвердите два пункта перед отправкой.");
      return;
    }

    setSubmitState("sending");
    try {
      const payload = buildSubmissionPayload(draft);
      const formData = new FormData();
      Object.entries(payload).forEach(([key, value]) => formData.append(key, value));
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: formData,
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("Слишком много попыток. Подождите несколько минут.");
        }
        if (response.status === 422) {
          throw new Error("Проверьте контактные данные и попробуйте ещё раз.");
        }
        throw new Error("Не удалось отправить бриф. Черновик не потерян.");
      }

      window.localStorage.removeItem(DRAFT_KEY);
      setSubmitState("success");
    } catch (error) {
      setSubmitState("error");
      setSubmitMessage(
        error instanceof Error
          ? error.message
          : "Не удалось отправить бриф. Черновик не потерян.",
      );
    }
  };

  const reset = () => {
    window.localStorage.removeItem(DRAFT_KEY);
    setDraft(createInitialDraft());
    setSubmitState("idle");
    setSubmitMessage("");
    setLastSaved(null);
  };

  if (submitState === "success") {
    return (
      <div id="top" className="page-shell page-shell--success">
        <SiteHeader />
        <main className="success-panel" aria-live="polite">
          <div className="success-panel__mark" aria-hidden="true">
            ✓
          </div>
          <span className="eyebrow">Бриф отправлен</span>
          <h1>Спасибо — ответы получены</h1>
          <p>
            Мы изучим материалы, уточним недостающие данные и подготовим вариант
            пилота с оценкой сроков и бюджета.
          </p>
          <div className="success-panel__actions">
            <button type="button" className="button button--secondary" onClick={downloadCopy}>
              Скачать свою копию
            </button>
            <button type="button" className="text-button" onClick={reset}>
              Заполнить новый бриф
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div id="top" className="page-shell">
      <SiteHeader />
      <main>
        <section className="hero" aria-labelledby="brief-title">
          <div className="hero__copy">
            <span className="eyebrow">Бриф для подготовки пилота</span>
            <h1 id="brief-title">
              AI-квалификатор
              <span>входящих лидов</span>
            </h1>
            <p>
              Помогите нам понять текущую воронку, сценарий звонка и технический
              контур. На основе ответов мы подготовим варианты пилота, сроки и
              бюджет.
            </p>
          </div>
          <div className="hero__meta" aria-label="Информация о заполнении">
            <div>
              <strong>15–20</strong>
              <span>минут на заполнение</span>
            </div>
            <div>
              <strong>6</strong>
              <span>коротких разделов</span>
            </div>
            <p>
              Можно отвечать тезисно и возвращаться позже. Если цифры нет,
              укажите диапазон или «нет данных».
            </p>
          </div>
        </section>

        <div className="privacy-strip">
          <span className="privacy-strip__icon" aria-hidden="true">
            !
          </span>
          <p>
            <strong>Не указывайте персональные данные клиентов.</strong> Ссылки
            допустимы, а записи звонков и другие чувствительные файлы мы запросим
            отдельно через безопасный канал.
          </p>
        </div>

        <section className="workspace" aria-label="Анкета">
          <aside className="stepper">
            <div className="stepper__progress">
              <div className="stepper__progress-copy">
                <span>Прогресс</span>
                <strong>{progress}%</strong>
              </div>
              <div className="progress-track" aria-hidden="true">
                <span style={{ width: `${progress}%` }} />
              </div>
            </div>
            <nav aria-label="Разделы брифа">
              <ol>
                {briefSteps.map((step, index) => (
                  <li key={step.id}>
                    <button
                      type="button"
                      className={index === stepIndex ? "is-active" : ""}
                      aria-current={index === stepIndex ? "step" : undefined}
                      onClick={() => moveTo(index)}
                    >
                      <span>{step.number}</span>
                      <span>
                        <strong>{step.title}</strong>
                        <small>{step.eyebrow}</small>
                      </span>
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    className={isReview ? "is-active" : ""}
                    aria-current={isReview ? "step" : undefined}
                    onClick={() => {
                      const missing = validateIntro(draft);
                      if (missing.length) {
                        moveTo(0);
                        setErrors(missing);
                      } else {
                        moveTo(briefSteps.length);
                      }
                    }}
                  >
                    <span>07</span>
                    <span>
                      <strong>Проверка</strong>
                      <small>Перед отправкой</small>
                    </span>
                  </button>
                </li>
              </ol>
            </nav>
            <div className="save-state" aria-live="polite">
              <span className="save-state__mark" aria-hidden="true">
                ✓
              </span>
              <span>
                <strong>Черновик сохраняется на этом устройстве</strong>
                <small>
                  {lastSaved
                    ? `Сохранено ${new Date(lastSaved).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
                    : "Начните заполнять — ответы не потеряются"}
                </small>
              </span>
            </div>
          </aside>

          <form className="brief-card" onSubmit={submit} noValidate>
            {!isReview ? (
              <>
                <header className="brief-card__header">
                  <div>
                    <span className="eyebrow">{activeStep.eyebrow}</span>
                    <span className="brief-card__number">{activeStep.number}</span>
                  </div>
                  <h2>{activeStep.title}</h2>
                  <p>{activeStep.description}</p>
                </header>

                <div className="brief-card__content">
                  {errors.length ? (
                    <div className="error-summary" role="alert">
                      Заполните обязательные поля, чтобы продолжить.
                    </div>
                  ) : null}

                  {stepIndex === 4 ? (
                    <div className="legal-note">
                      <strong>Важно</strong>
                      <p>
                        Ответы нужны для архитектурной оценки и не заменяют
                        заключение юриста или специалиста по информационной
                        безопасности вашей компании.
                      </p>
                    </div>
                  ) : null}

                  <div
                    className={`fields ${stepIndex === 0 ? "fields--intro" : ""}`}
                  >
                    {activeStep.fields.map((field) => (
                      <TextField
                        key={field.id}
                        field={field}
                        value={draft.answers[field.id]}
                        error={errors.includes(field.id)}
                        onChange={(value) => setAnswer(field.id, value)}
                      />
                    ))}
                  </div>

                  {stepIndex === 0 ? (
                    <section
                      className="known-card"
                      aria-labelledby="known-facts-title"
                    >
                      <div className="known-card__header">
                        <span className="eyebrow">Проверьте гипотезы</span>
                        <h3 id="known-facts-title">
                          Что уже известно из обсуждения
                        </h3>
                      </div>
                      <ul>
                        {knownFacts.map((fact) => (
                          <li key={fact}>
                            <span aria-hidden="true">✓</span>
                            {fact}
                          </li>
                        ))}
                      </ul>
                      <fieldset
                        id="known_status"
                        className={
                          errors.includes("known_status")
                            ? "choice-group has-error"
                            : "choice-group"
                        }
                      >
                        <legend>
                          Всё верно или нужны исправления?
                          <span className="required">обязательно</span>
                        </legend>
                        <label>
                          <input
                            type="radio"
                            name="known_status"
                            value="confirmed"
                            checked={draft.answers.known_status === "confirmed"}
                            onChange={(event) =>
                              setAnswer("known_status", event.target.value)
                            }
                          />
                          <span>
                            <strong>Подтверждаю</strong>
                            <small>Исходные данные можно использовать</small>
                          </span>
                        </label>
                        <label>
                          <input
                            type="radio"
                            name="known_status"
                            value="changes"
                            checked={draft.answers.known_status === "changes"}
                            onChange={(event) =>
                              setAnswer("known_status", event.target.value)
                            }
                          />
                          <span>
                            <strong>Нужны исправления</strong>
                            <small>Укажу изменения ниже</small>
                          </span>
                        </label>
                      </fieldset>
                      {draft.answers.known_status === "changes" ? (
                        <div className="field">
                          <label
                            className="field__label"
                            htmlFor="known_corrections"
                          >
                            Исправления и дополнения
                          </label>
                          <textarea
                            id="known_corrections"
                            className="textarea"
                            rows={4}
                            value={draft.answers.known_corrections}
                            aria-invalid={
                              errors.includes("known_corrections") || undefined
                            }
                            placeholder="Что нужно изменить в исходных данных?"
                            onChange={(event) =>
                              setAnswer("known_corrections", event.target.value)
                            }
                          />
                        </div>
                      ) : null}
                    </section>
                  ) : null}

                  {stepIndex === 1 ? (
                    <FunnelMetrics values={draft.funnel} onChange={setFunnel} />
                  ) : null}

                  {stepIndex === 5 ? (
                    <>
                      <PilotMetrics values={draft.pilot} onChange={setPilot} />
                      <Materials
                        values={draft.materials}
                        onChange={setMaterial}
                      />
                    </>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="brief-card__content brief-card__content--review">
                <Review draft={draft} onEdit={moveTo} />

                <div className="confirmation-box">
                  <h3>Перед отправкой</h3>
                  <label className="confirmation-check">
                    <input
                      type="checkbox"
                      checked={draft.confirmations.noClientPersonalData}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setDraft((current) => ({
                          ...current,
                          confirmations: {
                            ...current.confirmations,
                            noClientPersonalData: event.target.checked,
                          },
                        }))
                      }
                    />
                    <span>
                      В ответах и ссылках нет персональных данных клиентов,
                      паролей, ключей доступа и платёжной информации.
                    </span>
                  </label>
                  <label className="confirmation-check">
                    <input
                      type="checkbox"
                      checked={draft.confirmations.senderConsent}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setDraft((current) => ({
                          ...current,
                          confirmations: {
                            ...current.confirmations,
                            senderConsent: event.target.checked,
                          },
                        }))
                      }
                    />
                    <span>
                      Разрешаю использовать мои контактные данные только для
                      связи по этому проекту.
                    </span>
                  </label>
                </div>

                {!endpointReady ? (
                  <div className="channel-note">
                    <span aria-hidden="true">i</span>
                    <p>
                      <strong>Канал приёма ответов подключается.</strong> Пока
                      можно скачать готовый бриф. Черновик останется на этом
                      устройстве.
                    </p>
                  </div>
                ) : null}

                {submitMessage ? (
                  <div className="submit-message" role="alert">
                    {submitMessage}
                  </div>
                ) : null}
              </div>
            )}

            <footer className="brief-card__footer">
              <div>
                {stepIndex > 0 ? (
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => moveTo(stepIndex - 1)}
                  >
                    Назад
                  </button>
                ) : (
                  <span className="footer-hint">Обязательные поля отмечены</span>
                )}
              </div>
              <div className="brief-card__footer-actions">
                <button
                  type="button"
                  className="text-button text-button--download"
                  onClick={downloadCopy}
                >
                  Скачать копию
                </button>
                {!isReview ? (
                  <button type="button" className="button" onClick={next}>
                    {stepIndex === briefSteps.length - 1
                      ? "Проверить ответы"
                      : "Сохранить и продолжить"}
                    <span aria-hidden="true">→</span>
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="button"
                    disabled={!endpointReady || submitState === "sending"}
                  >
                    {submitState === "sending"
                      ? "Отправляем…"
                      : endpointReady
                        ? "Отправить бриф"
                        : "Отправка подключается"}
                  </button>
                )}
              </div>
            </footer>
          </form>
        </section>
      </main>
      <footer className="site-footer">
        <span>AI-квалификатор входящих лидов</span>
        <span>После ответов подготовим варианты пилота, сроки и бюджет</span>
      </footer>
    </div>
  );
}
