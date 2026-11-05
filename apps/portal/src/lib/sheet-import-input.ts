import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import { normalizeSchoolRegistration } from './registration';
import {
  readSchoolClassMetadata,
  type SubsequentReference,
} from './school-class-input';

export class SheetImportError extends Error {
  constructor(
    message: string,
    public status = 422,
  ) {
    super(message);
  }
}
export const SHEET_FILE_LIMIT = 2 * 1024 * 1024;
export const SHEET_BODY_LIMIT = 3 * 1024 * 1024;
export const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export type SheetContext = {
  sheetName: string;
  scopeId: string;
  periodLabel: string;
  className: string;
  courseLabel: 'ADM' | 'DS' | 'ENF';
  stage: number;
  bindings: Record<string, string>;
  header?: {
    classCode: string;
    schoolYear: number;
    reference: SubsequentReference | null;
    useExisting: boolean;
  };
};
export type ImportRow = {
  sheet: number;
  line: number;
  schoolRegistration: string;
  fullName: string;
  birthDate: string;
  parentOne?: string;
  parentTwo?: string;
  context: SheetContext;
  enrollmentId?: string;
  key: string;
};
export type SheetInput = {
  mode: 'INTEGRADO' | 'SUBSEQUENTE';
  rows: ImportRow[];
  contexts: SheetContext[];
  inputHash: string;
};
const text = (value: unknown, max: number) => {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    /\p{Cc}/u.test(value) ||
    !value.trim()
  )
    throw new SheetImportError('Confira os dados informados para cada turma.');
  return value.trim().replace(/\s+/g, ' ');
};
function object(value: unknown, keys: string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !keys.includes(k))
  )
    throw new SheetImportError('Confira os campos da importação.');
  return value as Record<string, unknown>;
}
const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[ºª]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// Leitura isolada: a biblioteca não recebe caminho de arquivo nem acesso ao banco.
const decoder = `
const {parentPort,workerData}=require('node:worker_threads');
try {
 const XLSX=require(workerData.modulePath);
 const wb=XLSX.read(Buffer.from(workerData.file),{type:'buffer',cellFormula:true,cellHTML:false,bookVBA:true,cellNF:false,raw:true,WTF:true});
 if(wb.vbaraw||wb.SheetNames.length<1||wb.SheetNames.length>25)throw Error();
 let total=0;
 const sheets=wb.SheetNames.map((name,index)=>{
  const ws=wb.Sheets[name],ref=ws['!fullref']||ws['!ref'];
  if(!ref||ws['!type']||wb.Workbook?.Sheets?.[index]?.Hidden)throw Error();
  const range=XLSX.utils.decode_range(ref);
  if(range.e.c>8||range.e.r>5005||Object.keys(ws).length>50000)throw Error();
  for(const [key,cell] of Object.entries(ws))if(!key.startsWith('!')) {
   const position=XLSX.utils.decode_cell(key);
   if(position.r>range.e.r||position.c>range.e.c||position.r>5005||position.c>8||cell.f||cell.l||cell.t==='e')throw Error();
  }
  const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:'',blankrows:true,range:{s:{r:0,c:0},e:{r:range.e.r,c:8}}});
  total+=Math.max(0,rows.length-6);if(total>5000)throw Error();
  if(rows.some(row=>row.some(v=>String(v).length>512)))throw Error();
  return {name,rows};
 });
 parentPort.postMessage({sheets});
}catch{parentPort.postMessage({error:true});}
`;
let decoding = false;
export async function decodeXls(
  file: Buffer,
): Promise<Array<{ name: string; rows: string[][] }>> {
  if (
    file.length < 512 ||
    file.length > SHEET_FILE_LIMIT ||
    file.subarray(0, 8).toString('hex') !== 'd0cf11e0a1b11ae1'
  )
    throw new SheetImportError(
      'Selecione uma planilha .xls válida de até 2 MB.',
    );
  if (decoding)
    throw new SheetImportError(
      'Aguarde a leitura em andamento e tente novamente.',
      429,
    );
  decoding = true;
  return new Promise<Array<{ name: string; rows: string[][] }>>(
    (resolve, reject) => {
      const worker = new Worker(decoder, {
        eval: true,
        env: {},
        workerData: {
          file,
          modulePath: createRequire(import.meta.url).resolve('xlsx'),
        },
        resourceLimits: { maxOldGenerationSizeMb: 64, stackSizeMb: 4 },
      });
      let settled = false;
      const finish = (sheets?: Array<{ name: string; rows: string[][] }>) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        void worker.terminate();
        if (sheets) resolve(sheets);
        else
          reject(
            new SheetImportError(
              'Arquivo incompatível, protegido, corrompido ou acima dos limites.',
            ),
          );
      };
      const timer = setTimeout(() => finish(), 5000);
      worker.once('message', (value) => finish(value?.sheets));
      worker.once('error', () => finish());
      worker.once('exit', () => finish());
    },
  ).finally(() => {
    decoding = false;
  });
}
type DecodedSheet = { name: string; rows: string[][] };
function headerMetadata(
  s: DecodedSheet,
  mode: SheetInput['mode'],
  course: SheetContext['courseLabel'],
  stage: number,
) {
  try {
    const metadata = readSchoolClassMetadata(s.rows, mode, course, stage);
    // Identidade da lista: modalidade, curso, código e período; nunca nome/posição da aba.
    const hash = digest([
      'school-header-v1',
      mode,
      course,
      metadata.classCode,
      metadata.periodLabel,
    ]);
    const scopeId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    return { ...metadata, scopeId };
  } catch {
    throw new SheetImportError(
      'Confira turma, módulo ou série e período no cabeçalho da planilha.',
    );
  }
}
function sheetHeader(
  s: DecodedSheet,
  mode: 'INTEGRADO' | 'SUBSEQUENTE',
  index: number,
) {
  text(s.name, 100);
  const head = s.rows[5] || [];
  if (
    normalize(head[0] || '') !== 'matricula' ||
    normalize(head[1] || '') !== 'nome' ||
    normalize(head[2] || '') !== 'data de nascimento' ||
    normalize(head[8] || '') !== 'filiacao 1 e 2'
  )
    throw new SheetImportError(
      `Cabeçalhos inválidos na aba ${index + 1}, linha 6.`,
    );
  const title = normalize(s.rows.slice(0, 5).flat().join(' '));
  if (
    mode === 'INTEGRADO'
      ? !/ensino medio|integrado/.test(title) || /subsequente/.test(title)
      : !title.includes('subsequente')
  )
    throw new SheetImportError(`Modalidade divergente na aba ${index + 1}.`);
  const stage = /\b([1-4])\s*(ano|serie|modulo)\b/.exec(
    normalize((s.rows[3] || []).join(' ')),
  );
  const courses = {
    ADM: /administracao|\badm\b/,
    DS: /desenvolvimento de sistemas|\bds\b/,
    ENF: /enfermagem|\benf\b/,
  };
  const matches = (
    Object.keys(courses) as Array<SheetContext['courseLabel']>
  ).filter((key) => courses[key].test(title));
  if (
    !stage ||
    (stage[2] === 'modulo') !== (mode === 'SUBSEQUENTE') ||
    matches.length !== 1 ||
    (mode === 'INTEGRADO' && (matches[0] === 'ENF' || Number(stage[1]) > 3)) ||
    (matches[0] !== 'ENF' && Number(stage[1]) > 3)
  )
    throw new SheetImportError(
      `Curso ou série/módulo divergente na aba ${index + 1}.`,
    );
  return { courseLabel: matches[0], stage: Number(stage[1]) };
}
// Inspeção não aplica dados: expõe somente cabeçalhos da modalidade escolhida.
export async function inspectSchoolSheet(
  file: Buffer,
  mode: 'INTEGRADO' | 'SUBSEQUENTE',
  automatic = false,
) {
  return (await decodeXls(file)).map((s, index) => ({
    sheetName: s.name,
    ...sheetHeader(s, mode, index),
    ...(automatic
      ? (() => {
          const h = sheetHeader(s, mode, index);
          return headerMetadata(s, mode, h.courseLabel, h.stage);
        })()
      : {}),
    rows: s.rows.slice(6).filter((row) => row.some((cell) => cell.trim()))
      .length,
  }));
}

export const inspectIntegratedSheet = (file: Buffer) =>
  inspectSchoolSheet(file, 'INTEGRADO');

export async function parseSheetInput(
  file: Buffer,
  mode: unknown,
  rawContexts: unknown,
  automatic = false,
): Promise<SheetInput> {
  if (mode !== 'INTEGRADO' && mode !== 'SUBSEQUENTE')
    throw new SheetImportError('Escolha a modalidade.');
  if (
    !Array.isArray(rawContexts) ||
    rawContexts.length < 1 ||
    rawContexts.length > 25
  )
    throw new SheetImportError('Confira os dados de cada aba da planilha.');
  const contexts: Array<SheetContext & { sourceChoice?: unknown }> =
    rawContexts.map((value) => {
      const c = object(value, [
        'sheetName',
        'scopeId',
        'periodLabel',
        'className',
        'courseLabel',
        'stage',
        'bindings',
        'confirmed',
        ...(automatic ? ['sourceChoice'] : []),
      ]);
      if (automatic && !['header', 'existing'].includes(String(c.sourceChoice)))
        throw new SheetImportError('Confira a origem da turma.');
      if (
        c.confirmed !== true ||
        typeof c.scopeId !== 'string' ||
        !uuid.test(c.scopeId) ||
        typeof c.courseLabel !== 'string' ||
        !['ADM', 'DS', 'ENF'].includes(c.courseLabel) ||
        !Number.isInteger(c.stage) ||
        Number(c.stage) < 1 ||
        Number(c.stage) >
          (mode === 'SUBSEQUENTE' && c.courseLabel === 'ENF' ? 4 : 3) ||
        (mode === 'INTEGRADO' && c.courseLabel === 'ENF')
      )
        throw new SheetImportError(
          'Confira se a lista é do integrado ou do subsequente e confirme a turma, o curso e a série ou módulo.',
        );
      const bindings: Record<string, string> = {};
      if (c.bindings !== undefined) {
        if (
          !c.bindings ||
          typeof c.bindings !== 'object' ||
          Array.isArray(c.bindings) ||
          Object.keys(c.bindings).length > 5000
        )
          throw new SheetImportError('Confira as matrículas já cadastradas.');
        for (const [key, id] of Object.entries(c.bindings)) {
          if (
            normalizeSchoolRegistration(key) !== key ||
            typeof id !== 'string' ||
            (id !== 'new' && !uuid.test(id))
          )
            throw new SheetImportError('Confira as matrículas já cadastradas.');
          bindings[key] = id === 'new' ? id : id.toLowerCase();
        }
      }
      return {
        sheetName: text(c.sheetName, 100),
        scopeId: c.scopeId.toLowerCase(),
        periodLabel: text(c.periodLabel, 60),
        className: text(c.className, 100),
        courseLabel: c.courseLabel as SheetContext['courseLabel'],
        stage: Number(c.stage),
        bindings,
        ...(automatic ? { sourceChoice: c.sourceChoice } : {}),
      };
    });
  if (
    new Set(contexts.map((c) => c.scopeId)).size !== contexts.length ||
    new Set(contexts.map((c) => c.sheetName)).size !== contexts.length
  )
    throw new SheetImportError(
      'A mesma turma ou aba foi escolhida mais de uma vez. Confira as seleções.',
    );
  const sheets = await decodeXls(file);
  if (sheets.length !== contexts.length)
    throw new SheetImportError('Confira todas as abas, sem omitir turmas.');
  const rows: ImportRow[] = [],
    seen = new Set<string>();
  for (const [sheet, s] of sheets.entries()) {
    const context = contexts.find((c) => c.sheetName === s.name);
    if (!context)
      throw new SheetImportError(`Confira os dados da aba ${sheet + 1}.`);
    const header = sheetHeader(s, mode, sheet);
    if (
      header.stage !== context.stage ||
      header.courseLabel !== context.courseLabel
    )
      throw new SheetImportError(
        `Curso ou série/módulo divergente na aba ${sheet + 1}.`,
      );
    if (automatic) {
      const h = headerMetadata(s, mode, header.courseLabel, header.stage);
      if (
        context.className !== h.classCode ||
        context.periodLabel !== h.periodLabel ||
        (context.sourceChoice === 'header' && context.scopeId !== h.scopeId)
      )
        throw new SheetImportError(
          `Os dados da aba ${sheet + 1} mudaram. Leia o arquivo novamente.`,
        );
      Object.assign(context, {
        header: {
          classCode: h.classCode,
          schoolYear: h.schoolYear,
          reference: h.reference,
          useExisting: context.sourceChoice === 'existing',
        },
      });
    }
    for (let i = 6; i < s.rows.length; i++) {
      const cells = s.rows[i];
      if (cells.every((x) => !x.trim())) continue;
      const fail = (field = 'os dados', guidance = ''): never => {
        throw new SheetImportError(
          `Confira ${field} na aba ${sheet + 1}, linha ${i + 1}.${guidance ? ` ${guidance}` : ''}`,
        );
      };
      const registration = normalizeSchoolRegistration(cells[0]),
        birth = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(cells[2] || '');
      if (!registration)
        return fail(
          'a matrícula',
          'Use de 6 a 8 dígitos, sem letras ou símbolos.',
        );
      if (seen.has(registration))
        fail('a matrícula', 'Ela aparece mais de uma vez na planilha.');
      if (!birth)
        return fail('a data de nascimento', 'Use o formato dia/mês/ano.');
      const iso = `${birth[3]}-${birth[2]}-${birth[1]}`,
        date = new Date(`${iso}T00:00:00Z`);
      if (
        !Number.isFinite(date.valueOf()) ||
        date.toISOString().slice(0, 10) !== iso ||
        date > new Date()
      )
        fail(
          'a data de nascimento',
          'Informe uma data existente que não esteja no futuro.',
        );
      seen.add(registration);
      const parents = (cells[8] || '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      if (parents.length > 2)
        fail('a filiação', 'Informe até dois nomes separados por vírgula.');
      rows.push({
        sheet: sheet + 1,
        line: i + 1,
        schoolRegistration: registration,
        fullName: text(cells[1], 180),
        birthDate: iso,
        ...(parents[0] ? { parentOne: text(parents[0], 180) } : {}),
        ...(parents[1] ? { parentTwo: text(parents[1], 180) } : {}),
        context,
        enrollmentId: context.bindings[registration],
        key: `school:${context.scopeId}:${registration}`,
      });
    }
    if (
      Object.keys(context.bindings).some(
        (key) =>
          !rows.some(
            (row) => row.context === context && row.schoolRegistration === key,
          ),
      )
    )
      throw new SheetImportError(
        'Uma matrícula escolhida não corresponde aos alunos da planilha. Confira a seleção.',
      );
  }
  if (!rows.length)
    throw new SheetImportError(
      'Não encontramos alunos no formato esperado. Confira a planilha selecionada.',
    );
  return {
    mode,
    contexts,
    rows,
    inputHash: digest({ file: file.toString('base64'), mode, contexts }),
  };
}
