"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  validateDeclarationFields,
  DeclarationValidationError,
  type DeclarationFields,
  type StudentView,
} from "@/lib/declarations";
import { useFormValidation } from "./use-form-validation";
import StaffDeclarationRequests from "./staff-declaration-requests";
import { downloadDeclaration } from "./declaration-download";

type Results = {
  students: StudentView[];
  total: number;
  page: number;
  pageSize: number;
  classes: string[];
};
const personalFields = [
  {
    name: "naturality",
    label: "Naturalidade (município/UF)",
    required: true,
    max: 120,
  },
  { name: "parentOne", label: "Filiação registrada", required: true, max: 180 },
  { name: "parentTwo", label: "Segunda filiação, quando aplicável", max: 180 },
  { name: "socialName", label: "Nome social, quando aplicável", max: 180 },
  {
    name: "courseName",
    label: "Nome oficial do curso técnico",
    required: true,
    max: 120,
  },
  { name: "schoolPeriod", label: "Período letivo", required: true, max: 60 },
  { name: "schedule", label: "Dias e horários, se necessário", max: 120 },
] as const;
const signatureFields = [
  {
    name: "secretaryName",
    label: "Nome de quem assina pela secretaria",
    max: 180,
  },
  {
    name: "secretaryRegistration",
    label: "Matrícula/autorização da secretaria",
    max: 60,
  },
  { name: "directorName", label: "Nome de quem assina pela gestão", max: 180 },
  {
    name: "directorRegistration",
    label: "Matrícula/autorização da gestão",
    max: 60,
  },
] as const;

export default function SecretaryDeclarations() {
  const [requestsRevision, setRequestsRevision] = useState(0);
  const [query, setQuery] = useState("");
  const [className, setClassName] = useState("");
  const [classes, setClasses] = useState<string[]>([]);
  const [composing, setComposing] = useState(false);
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [retry, setRetry] = useState(0);
  const [selectingClass, setSelectingClass] = useState(false);
  const [selected, setSelected] = useState<StudentView | null>(null);
  const [queue, setQueue] = useState<StudentView[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DeclarationFields>>({});
  const [invalidDrafts, setInvalidDrafts] = useState<string[]>([]);
  const [common, setCommon] = useState<
    Record<string, Partial<DeclarationFields>>
  >({});
  const [includeFrequency, setIncludeFrequency] = useState(true);
  const [batchDownloaded, setBatchDownloaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<{
    student?: StudentView | null;
    href?: string;
  } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pageCheckbox = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const priorFocus = useRef<HTMLElement | null>(null);
  const allowUnload = useRef(false);
  const immediateSearch = useRef(false);
  const validation = useFormValidation("declaration-form-error");
  const isReady = (id: string) =>
    !!drafts[id] &&
    !invalidDrafts.includes(id) &&
    !(dirty && selected?.id === id);
  const readyCount = queue.filter((student) => isReady(student.id)).length;
  const unsaved = dirty || (readyCount > 0 && !batchDownloaded);
  const pageRows = results?.students ?? [];
  const pageSelected = pageRows.filter((student) =>
    queue.some((item) => item.id === student.id),
  ).length;
  const savedDraft = selected ? drafts[selected.id] : undefined;
  const initial: Partial<DeclarationFields> = selected
    ? savedDraft &&
      selected.enrollments.some(
        (enrollment) => enrollment.id === savedDraft.enrollmentId,
      )
      ? savedDraft
      : (common[selected.enrollments[0]?.className] ?? {})
    : {};

  useEffect(() => {
    const controller = new AbortController();
    if (composing || query.trim().length === 1) {
      setLoading(false);
      setResults(null);
      setSearchError("");
      return () => controller.abort();
    }
    setLoading(true);
    setSearchError("");
    const delay = immediateSearch.current || !query ? 0 : 300;
    immediateSearch.current = false;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/secretaria/alunos", {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, className, page }),
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.error || "Não foi possível consultar os alunos.",
          );
        if (!controller.signal.aborted) {
          setResults(result);
          setClasses(result.classes);
          if (result.page !== page) setPage(result.page);
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setSearchError(
            error instanceof Error
              ? error.message
              : "Não foi possível consultar. Tente novamente.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, className, page, composing, retry]);
  useEffect(() => {
    if (pageCheckbox.current)
      pageCheckbox.current.indeterminate =
        pageSelected > 0 && pageSelected < pageRows.length;
  }, [pageSelected, pageRows.length]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (pending && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (!pending && dialog.open) {
      dialog.close();
      priorFocus.current?.focus();
    }
  }, [pending]);
  useEffect(() => {
    if (selected) headingRef.current?.focus();
  }, [selected]);
  useEffect(() => {
    if (!unsaved) return;
    const unload = (event: BeforeUnloadEvent) => {
      if (!allowUnload.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const navigation = (event: MouseEvent) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
        return;
      const anchor = (event.target as Element).closest("a[href]");
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.download ||
        anchor.target === "_blank"
      )
        return;
      const url = new URL(anchor.href);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.href === location.href ||
        (url.hash && url.pathname === location.pathname)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      priorFocus.current = anchor;
      setPending({ href: anchor.href });
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigation, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigation, true);
    };
  }, [unsaved]);

  function openStudent(student: StudentView | null) {
    if (
      student &&
      drafts[student.id] &&
      !student.enrollments.some(
        (enrollment) => enrollment.id === drafts[student.id].enrollmentId,
      )
    ) {
      // Ao abrir um pedido de outra matrícula, não reutiliza a conferência anterior.
      setDrafts((previous) => {
        const next = { ...previous };
        delete next[student.id];
        return next;
      });
      setQueue((previous) =>
        previous.map((item) => (item.id === student.id ? student : item)),
      );
      setBatchDownloaded(false);
    }
    setSelected(student);
    setIncludeFrequency(
      student ? (drafts[student.id]?.includeFrequency ?? true) : true,
    );
    setMessage("");
    validation.reset();
    if (!student) searchRef.current?.focus();
  }
  function selectStudent(student: StudentView | null) {
    if (dirty) {
      priorFocus.current = document.activeElement as HTMLElement;
      setPending({ student });
      return;
    }
    openStudent(student);
  }
  function addStudents(students: StudentView[]) {
    const next = [...queue];
    for (const student of students)
      if (!next.some((item) => item.id === student.id)) next.push(student);
    if (next.length > 100) {
      setMessage(
        "O lote aceita até 100 alunos. Baixe o lote atual antes de selecionar mais.",
      );
      return;
    }
    setQueue(next);
    setBatchDownloaded(false);
  }
  async function addClass() {
    if (!className || query || selectingClass) return;
    setSelectingClass(true);
    setMessage("");
    try {
      const response = await fetch("/api/secretaria/alunos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ className, allClass: true }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Não foi possível selecionar a turma.");
      addStudents(result.students);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Tente selecionar a turma novamente.",
      );
    } finally {
      setSelectingClass(false);
    }
  }
  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !selected || !validation.validate(event.currentTarget)) return;
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const download =
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
      "download";
    let values: DeclarationFields;
    try {
      values = validateDeclarationFields({
        ...data,
        includeFrequency: data.includeFrequency === "on",
        reviewed: data.reviewed === "on",
      });
    } catch (error) {
      if (error instanceof DeclarationValidationError)
        validation.reject(error.field ?? "reviewed", error.message, form);
      return;
    }
    if (
      !queue.some((student) => student.id === selected.id) &&
      queue.length === 100
    ) {
      setMessage(
        "O lote já tem 100 alunos. Remova uma seleção antes de adicionar este aluno.",
      );
      return;
    }
    addStudents([selected]);
    setDrafts((previous) => ({ ...previous, [selected.id]: values }));
    setInvalidDrafts((previous) => previous.filter((id) => id !== selected.id));
    setDirty(false);
    if (data.reuseCommon === "on") {
      const currentClass = selected.enrollments.find(
        (enrollment) => enrollment.id === values.enrollmentId,
      )?.className;
      if (currentClass)
        setCommon((previous) => ({
          ...previous,
          [currentClass]: {
            courseName: values.courseName,
            schoolPeriod: values.schoolPeriod,
            schedule: values.schedule,
            secretaryName: values.secretaryName,
            secretaryRegistration: values.secretaryRegistration,
            directorName: values.directorName,
            directorRegistration: values.directorRegistration,
            frequencyStart: values.frequencyStart,
            frequencyEnd: values.frequencyEnd,
          },
        }));
    }
    if (!download) {
      setMessage(
        "Conferência salva neste lote. Selecione o próximo aluno ou baixe o PDF quando todos estiverem prontos.",
      );
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/secretaria/declaracao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, studentId: selected.id }),
      });
      if (!response.ok) {
        const result = await response.json();
        if (result.field) {
          validation.reject(result.field, result.error, form);
          return;
        }
        throw new Error(result.error || "Não foi possível gerar o PDF.");
      }
      await downloadDeclaration(response);
      setRequestsRevision((value) => value + 1);
      setBatchDownloaded(queue.every((student) => student.id === selected.id));
      setMessage(
        "PDF pronto. Abra o arquivo e imprima em A4 para assinatura e carimbo dos dois responsáveis. Depois, libere a retirada na lista de solicitações. A minuta aguarda validação da escola/GRE.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível gerar o PDF. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function downloadBatch() {
    if (busy || dirty || !queue.length || readyCount !== queue.length) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/secretaria/declaracoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: queue.map((student) => ({
            ...drafts[student.id],
            studentId: student.id,
          })),
        }),
      });
      if (!response.ok) {
        const result = await response.json();
        if (Number.isInteger(result.itemIndex) && queue[result.itemIndex]) {
          openStudent(queue[result.itemIndex]);
          setInvalidDrafts((previous) => [
            ...previous,
            queue[result.itemIndex].id,
          ]);
        }
        throw new Error(result.error || "Não foi possível preparar o lote.");
      }
      await downloadDeclaration(response, "declaracoes-vinculo-minutas.pdf");
      setRequestsRevision((value) => value + 1);
      setBatchDownloaded(true);
      setMessage(
        `PDF pronto: ${queue.length} página(s), uma por aluno. Abra o arquivo e imprima todas as páginas em A4. As assinaturas e os carimbos são feitos em cada declaração. Depois, libere a retirada na lista de solicitações.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível preparar o lote. Seus dados foram preservados; tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="document-page secretary-page"
      aria-labelledby="secretary-title"
    >
      <span className="eyebrow">ATENDIMENTO ESCOLAR</span>
      <h1 id="secretary-title">Declarações de vínculo</h1>
      <p className="document-intro">
        Atenda as solicitações, confira os dados e prepare uma declaração ou um
        lote para impressão.
      </p>
      <div className="document-notice">
        <strong>Modelo em revisão pela escola</strong>
        <p>
          Integrado disponível como minuta. Filiação e naturalidade não vieram
          na importação. A frequência deve ser conferida no registro escolar;
          não usamos 100% automaticamente. O subsequente aguarda confirmação.
        </p>
      </div>
      <StaffDeclarationRequests
        revision={requestsRevision}
        disabled={busy}
        onPrepare={selectStudent}
      />
      <section className="declaration-batch" aria-labelledby="batch-title">
        <div className="batch-heading">
          <div>
            <h2 id="batch-title">Lote de impressão</h2>
            <p role="status">
              {queue.length}{" "}
              {queue.length === 1 ? "aluno selecionado" : "alunos selecionados"}{" "}
              · {readyCount}{" "}
              {readyCount === 1
                ? "conferência concluída"
                : "conferências concluídas"}
            </p>
          </div>
          <button
            className="ete-button"
            type="button"
            disabled={
              busy || dirty || !queue.length || readyCount !== queue.length
            }
            aria-busy={busy}
            onClick={downloadBatch}
          >
            {busy
              ? "Preparando PDF…"
              : `Baixar lote (${queue.length} página${queue.length === 1 ? "" : "s"})`}
          </button>
        </div>
        {!queue.length ? (
          <p>
            Selecione alunos na busca abaixo. Uma página A4 será preparada para
            cada aluno.
          </p>
        ) : (
          <>
            <p>
              Confira cada aluno antes de baixar. A seleção é mantida ao mudar
              de página ou turma. Até 100 declarações por PDF.
            </p>
            <ul className="batch-list">
              {queue.map((student) => (
                <li key={student.id}>
                  <button
                    className="batch-student ete-button ete-button--secondary"
                    type="button"
                    disabled={busy}
                    aria-pressed={selected?.id === student.id}
                    onClick={() => selectStudent(student)}
                  >
                    <span>{student.fullName}</span>
                    <small>
                      {isReady(student.id) ? "Conferida" : "Conferir dados"}
                    </small>
                  </button>
                  <button
                    className="batch-remove ete-button ete-button--secondary ete-button--icon"
                    type="button"
                    disabled={busy}
                    aria-label={`Remover ${student.fullName} do lote`}
                    onClick={() => {
                      setQueue((items) =>
                        items.filter((item) => item.id !== student.id),
                      );
                      setBatchDownloaded(false);
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="declaration-feedback" role="status" aria-live="polite">
          {message}
        </p>
      </section>
      <div className={`secretary-workspace ${selected ? "has-selection" : ""}`}>
        <section
          className="student-search"
          aria-labelledby="student-search-title"
        >
          <h2 id="student-search-title">Buscar alunos</h2>
          <div className="declaration-field">
            <label htmlFor="student-class">Turma</label>
            <select
              id="student-class"
              value={className}
              disabled={selectingClass || busy}
              onChange={(event) => {
                setClassName(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Todas as turmas</option>
              {classes.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              immediateSearch.current = true;
              setRetry((r) => r + 1);
            }}
          >
            <label htmlFor="student-query">
              Nome ou matrícula (também aceita turma)
            </label>
            <div className="search-input">
              <input
                ref={searchRef}
                id="student-query"
                type="search"
                value={query}
                autoComplete="off"
                maxLength={120}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                onCompositionStart={() => setComposing(true)}
                onCompositionEnd={() => setComposing(false)}
              />
              {query && (
                <button
                  className="search-clear ete-button ete-button--secondary ete-button--icon"
                  type="button"
                  aria-label="Limpar busca"
                  onClick={() => {
                    setQuery("");
                    setResults(null);
                    setPage(1);
                    searchRef.current?.focus();
                  }}
                >
                  ×
                </button>
              )}
            </div>
          </form>
          {className && !query && (
            <button
              className="ete-button ete-button--secondary class-select"
              type="button"
              disabled={selectingClass || busy || loading}
              aria-busy={selectingClass}
              onClick={addClass}
            >
              {selectingClass
                ? "Selecionando turma…"
                : `Selecionar toda a turma ${className}`}
            </button>
          )}
          <div className="search-status" role="status" aria-live="polite">
            {loading
              ? "Consultando alunos…"
              : searchError ||
                (query.trim().length === 1
                  ? "Digite pelo menos 2 caracteres para buscar pelo nome ou matrícula."
                  : query.trim().length >= 2 || className
                    ? `${results?.total ?? 0} aluno(s) encontrado(s)`
                    : "Escolha uma turma ou digite pelo menos 2 caracteres para buscar.")}
          </div>
          {searchError && (
            <button
              className="ete-button ete-button--secondary"
              type="button"
              onClick={() => setRetry((r) => r + 1)}
            >
              Tentar novamente
            </button>
          )}
          {!searchError && pageRows.length > 0 && (
            <label className="page-selection">
              <input
                ref={pageCheckbox}
                type="checkbox"
                checked={pageSelected === pageRows.length}
                disabled={busy || loading}
                onChange={(event) => {
                  if (event.target.checked) addStudents(pageRows);
                  else {
                    setQueue((items) =>
                      items.filter(
                        (item) => !pageRows.some((row) => row.id === item.id),
                      ),
                    );
                    setBatchDownloaded(false);
                  }
                }}
              />
              Selecionar alunos desta página ({pageRows.length})
            </label>
          )}
          <div className="student-results" aria-busy={loading}>
            {!loading &&
              (query.trim().length >= 2 || className) &&
              results?.total === 0 && (
                <p>
                  Nenhum aluno encontrado. Confira a matrícula ou tente outra
                  turma.
                </p>
              )}
            {!searchError &&
              pageRows.map((student) => (
                <div className="student-selection" key={student.id}>
                  <label className="student-check">
                    <input
                      type="checkbox"
                      checked={queue.some((item) => item.id === student.id)}
                      disabled={busy || loading}
                      aria-label={`Selecionar ${student.fullName} para o lote`}
                      onChange={(event) => {
                        if (event.target.checked) addStudents([student]);
                        else {
                          setQueue((items) =>
                            items.filter((item) => item.id !== student.id),
                          );
                          setBatchDownloaded(false);
                        }
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="student-result ete-button ete-button--secondary"
                    disabled={busy || loading}
                    aria-pressed={selected?.id === student.id}
                    onClick={() => selectStudent(student)}
                  >
                    <strong>{student.fullName || "Nome pendente"}</strong>
                    <span>
                      Matrícula {student.schoolRegistration} ·{" "}
                      {student.enrollments[0]?.className}
                    </span>
                    <span>
                      {isReady(student.id)
                        ? "Conferência pronta"
                        : "Conferir dados"}
                    </span>
                  </button>
                </div>
              ))}
          </div>
          {results && results.total > 20 && (
            <nav className="results-pagination" aria-label="Páginas dos alunos">
              <button
                className="ete-button ete-button--secondary"
                type="button"
                disabled={page === 1 || loading || busy}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </button>
              <span>
                {results.page} / {Math.ceil(results.total / 20)}
              </span>
              <button
                className="ete-button ete-button--secondary"
                type="button"
                disabled={page * 20 >= results.total || loading || busy}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </button>
            </nav>
          )}
        </section>
        <section className="declaration-editor" aria-labelledby="editor-title">
          {selected ? (
            <>
              <button
                type="button"
                className="ete-button ete-button--secondary editor-back"
                disabled={busy}
                onClick={() => selectStudent(null)}
              >
                Voltar à busca
              </button>
              <h2 ref={headingRef} tabIndex={-1} id="editor-title">
                {selected.fullName || "Aluno selecionado"}
              </h2>
              <p className="editor-identity">
                Matrícula {selected.schoolRegistration} · Nascimento{" "}
                {selected.birthDate.split("-").reverse().join("/")}
              </p>
              <p className="editor-hint">
                Dados usados apenas neste lote, sem alterar o cadastro. Campos
                com * são obrigatórios. Os dois espaços de assinatura e carimbo
                permanecem no PDF.
              </p>
              <form
                key={`${selected.id}:${selected.enrollments[0]?.id}`}
                className="declaration-form"
                noValidate
                onSubmit={prepare}
                onChange={() => {
                  setDirty(true);
                  setBatchDownloaded(false);
                  setMessage("");
                }}
              >
                <fieldset disabled={busy} className="declaration-fields">
                  <div className="declaration-field">
                    <label htmlFor="enrollment-id">Matrícula / turma</label>
                    <select
                      id="enrollment-id"
                      name="enrollmentId"
                      required
                      defaultValue={initial.enrollmentId}
                      {...validation.field("enrollmentId")}
                    >
                      {selected.enrollments.map((enrollment) => (
                        <option
                          key={enrollment.id}
                          value={enrollment.id}
                          disabled={enrollment.mode !== "INTEGRADO"}
                        >
                          {enrollment.className} ·{" "}
                          {enrollment.mode === "INTEGRADO"
                            ? "Integrado"
                            : "Subsequente — modelo pendente"}
                        </option>
                      ))}
                    </select>
                  </div>
                  {personalFields.map((field) => (
                    <div className="declaration-field" key={field.name}>
                      <label htmlFor={`declaration-${field.name}`}>
                        {field.label}
                        {"required" in field && field.required ? " *" : ""}
                      </label>
                      <input
                        id={`declaration-${field.name}`}
                        name={field.name}
                        type="text"
                        defaultValue={initial[field.name] ?? ""}
                        maxLength={field.max}
                        required={"required" in field && field.required}
                        {...validation.field(field.name)}
                      />
                    </div>
                  ))}
                  <fieldset className="frequency-fields">
                    <legend>Frequência</legend>
                    <label
                      className="declaration-reviewed"
                      htmlFor="include-frequency"
                    >
                      <input
                        id="include-frequency"
                        name="includeFrequency"
                        type="checkbox"
                        checked={includeFrequency}
                        onChange={(event) =>
                          setIncludeFrequency(event.target.checked)
                        }
                      />
                      Incluir frequência registrada
                    </label>
                    <p className="editor-hint">
                      Informe o percentual real deste aluno e o intervalo
                      consultado no registro escolar.
                    </p>
                    <div hidden={!includeFrequency}>
                      <div className="declaration-field">
                        <label htmlFor="frequency-percent">
                          Frequência (%) *
                        </label>
                        <input
                          id="frequency-percent"
                          name="frequencyPercent"
                          type="text"
                          inputMode="decimal"
                          maxLength={6}
                          defaultValue={initial.frequencyPercent ?? ""}
                          required
                          disabled={!includeFrequency}
                          {...validation.field("frequencyPercent")}
                        />
                      </div>
                      <div className="frequency-dates">
                        {(["frequencyStart", "frequencyEnd"] as const).map(
                          (name, index) => (
                            <div className="declaration-field" key={name}>
                              <label htmlFor={name}>
                                {index === 0
                                  ? "Início da apuração"
                                  : "Fim da apuração"}{" "}
                                *
                              </label>
                              <input
                                id={name}
                                name={name}
                                type="date"
                                required
                                disabled={!includeFrequency}
                                defaultValue={initial[name] ?? ""}
                                {...validation.field(name)}
                              />
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  </fieldset>
                  <details className="signature-options">
                    <summary>
                      Preencher nomes dos responsáveis (opcional)
                    </summary>
                    <p className="editor-hint">
                      Se deixar em branco, a identificação será feita com o
                      carimbo legível, com nome, função e matrícula/autorização.
                      As assinaturas são feitas no papel.
                    </p>
                    {signatureFields.map((field) => (
                      <div className="declaration-field" key={field.name}>
                        <label htmlFor={`declaration-${field.name}`}>
                          {field.label}
                        </label>
                        <input
                          id={`declaration-${field.name}`}
                          name={field.name}
                          type="text"
                          defaultValue={initial[field.name] ?? ""}
                          maxLength={field.max}
                          {...validation.field(field.name)}
                        />
                      </div>
                    ))}
                  </details>
                  <label
                    className="declaration-reviewed"
                    htmlFor="reuse-common"
                  >
                    <input
                      id="reuse-common"
                      name="reuseCommon"
                      type="checkbox"
                      defaultChecked
                    />
                    Reaproveitar curso, período, horários, intervalo de apuração
                    e responsáveis nos próximos alunos desta turma.
                  </label>
                  <label
                    className="declaration-reviewed"
                    htmlFor="declaration-reviewed"
                  >
                    <input
                      id="declaration-reviewed"
                      name="reviewed"
                      type="checkbox"
                      required
                      defaultChecked={initial.reviewed ?? false}
                      {...validation.field("reviewed")}
                    />
                    Conferi a matrícula, os dados pessoais e a frequência
                    informada nos registros escolares.
                  </label>
                </fieldset>
                {validation.error && (
                  <p
                    id="declaration-form-error"
                    role="alert"
                    className="field-error"
                  >
                    {validation.error}
                  </p>
                )}
                <div className="declaration-actions">
                  <button
                    className="ete-button"
                    type="submit"
                    name="intent"
                    value="save"
                    disabled={
                      busy ||
                      !selected.enrollments.some((e) => e.mode === "INTEGRADO")
                    }
                  >
                    Salvar conferência no lote
                  </button>
                  <button
                    className="ete-button ete-button--secondary"
                    type="submit"
                    name="intent"
                    value="download"
                    aria-busy={busy}
                    disabled={
                      busy ||
                      !selected.enrollments.some((e) => e.mode === "INTEGRADO")
                    }
                  >
                    {busy ? "Preparando PDF…" : "Baixar só esta declaração"}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="editor-placeholder">
              <span aria-hidden="true">↗</span>
              <h2 id="editor-title">Selecione um aluno para conferir</h2>
              <p>
                Os dados da matrícula aparecerão aqui. Complete as informações
                ausentes. Depois, baixe uma declaração ou junte as selecionadas
                em um PDF.
              </p>
            </div>
          )}
        </section>
      </div>
      <dialog
        ref={dialogRef}
        className="registration-dialog"
        aria-labelledby="discard-title"
        aria-describedby="discard-description"
        onCancel={() => setPending(null)}
      >
        <div className="dialog-inner">
          <h2 id="discard-title">Descartar os campos preenchidos?</h2>
          <p id="discard-description">
            {pending?.href
              ? "Os dados deste lote ficam apenas nesta tela. Ao sair, os campos e a seleção serão perdidos."
              : "A conferência deste aluno ainda não foi salva no lote. Ao trocar de aluno, os novos campos serão perdidos."}
          </p>
          <div className="discard-actions">
            <button
              ref={cancelRef}
              className="ete-button ete-button--secondary"
              type="button"
              onClick={() => setPending(null)}
            >
              Continuar preenchendo
            </button>
            <button
              className="ete-button ete-button--danger"
              type="button"
              onClick={() => {
                const action = pending;
                setPending(null);
                setDirty(false);
                if (action?.href) {
                  allowUnload.current = true;
                  window.location.assign(action.href);
                } else openStudent(action?.student ?? null);
              }}
            >
              Descartar e continuar
            </button>
          </div>
        </div>
      </dialog>
    </section>
  );
}
