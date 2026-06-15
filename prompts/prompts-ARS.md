## Metaprompting: cómo construí el prompt para el asistente

En lugar de pedirle directamente "escríbeme unos tests", preparé un **meta-prompt
estructurado** que le diera al asistente todo el contexto y las reglas del juego antes
de tocar código. Así es como lo monté:

### 1. Partí del contexto del módulo, no de cero
Condensé la teoría del Módulo 7 (TDD, "Fake It", buenas prácticas de testing, uso de IA
para tests, anti-patrón "Test Theater") dentro del propio prompt, para que el asistente
generara los tests alineados con la filosofía del curso y no con un criterio genérico.

### 2. Definí un "Definition of Done" explícito
Dejé por escrito exactamente qué se debía producir: solo dos artefactos
(`backend/src/tests/tests-ARS.test.ts` y `prompts/prompts-ARS.md`), con Jest,
usando solo tooling de IDE/agente. Acotar los entregables evita que el asistente se invente
ficheros o se desvíe.

### 3. Le di el objetivo de negocio y las pistas, no la solución
Expliqué el dominio (los candidatos llegan por formulario y por API, el dato del candidato
es el activo más valioso) e incluí la **Pista 1**: hay dos familias de tests —recepción de
datos del formulario y guardado en BD— y cada una necesita al menos un test. El "qué" lo
puse yo; el "cómo" lo dejé para la IA.

### 4. Forcé que leyera el repo real antes de proponer nada
Una instrucción clave fue: "primero lee el código real y mapea los tests a nombres de
funciones reales y criterios de aceptación". Esto evita tests inventados sobre una API que
no existe y obliga a anclar cada caso en `validateCandidateData` y `addCandidate`.

### 5. Incluí las buenas prácticas como requisitos concretos
No dije "hazlo bien"; especifiqué: nombres descriptivos `<unidad>_<escenario>_<resultado>`,
estructura AAA, `test.each` para parametrizar, matchers ricos (`toMatchObject`,
`toHaveBeenCalledWith`) y **mockear la BD en el borde** (Prisma), no los internos.

### 6. Añadí una checklist de verificación obligatoria
Terminé el prompt con un checklist que el asistente debía ejecutar y confirmar: que
`npm test` pasa, que existen ambas familias, que la BD está mockeada, y sobre todo el
**check anti-"Test Theater"**: romper a propósito la implementación (invertir una validación
/ cambiar un retorno) y comprobar que el test correspondiente FALLA, y luego restaurar.
Esto convierte el prompt en un contrato verificable en lugar de una petición abierta.

### 7. Mantuve el rol humano como dueño de la especificación
Dejé claro que la IA propone y yo reviso/ajusto: el spec (criterios de aceptación y las dos
familias de tests) es mío; la implementación puede ser de la IA, nunca al revés.



## Decisiones de diseño (preguntas que respondí al asistente) (Steering)

Durante la fase de planificación el asistente me planteó dos decisiones que afectaban
a la limpieza del PR. Estas son las opciones que elegí y por qué:

### 1. Cómo mockear la base de datos (Prisma) en los tests de guardado
Elegí **`jest.mock` sin añadir dependencias nuevas**.

Decidí esto para mantener el PR limpio: no quería añadir ninguna dependencia ni generar
cambios en el lockfile, en línea con la consigna de "solo lo imprescindible". Esta opción
usa `jest.mock('@prisma/client')` con un factory manual, y con `jest.requireActual` conservo
las clases reales de error de `Prisma` para que el `instanceof Prisma.PrismaClientInitializationError`
del código de producción siga funcionando. Descarté la alternativa de instalar
`jest-mock-extended` con `mockDeep<PrismaClient>()` (que replica el ejemplo de la doc de Prisma)
porque añadía una devDependency y cambios en `package-lock.json`.

### 2. Dónde colocar la configuración de Jest (no existía ninguna)
Elegí **crear un nuevo `backend/jest.config.js`**.

El repo no tenía configuración de Jest ni `ts-jest` conectado, así que era imprescindible
añadir una para que `jest` pudiera parsear los `.test.ts`. Preferí un fichero
`jest.config.js` mínimo (`preset: 'ts-jest'`, `testEnvironment: 'node'`) en lugar de meter
la configuración en una sección `jest` dentro de `package.json`, porque así queda autocontenido
y no modifico un fichero ya existente.


# Prompts — Homework 2: Jest unit-test suite for "insert candidate into the database"

Assistant used: Claude Code (Opus 4.8) inside the IDE. Author/reviewer: ARS.

The human owns the spec (the acceptance criteria and the two mandatory test families per
Pista 1); the assistant drafted the implementation, which the human reviewed. Below are the
real prompts/instructions used, in order, plus what each produced.

---

## 1. Task framing (the assignment given to the assistant)

> Build a Jest unit-test suite for the **"insert candidate into the database"** feature of the
> LTI ATS. Deliverables: `backend/src/tests/tests-ARS.test.ts` and
> `prompts/prompts-ARS.md`. Constraints: use Jest (ts-jest already in repo), only IDE/agent
> tooling, apply the module's testing good practices, review/tweak whatever the assistant returns.
>
> Pista 1 — two mandatory test families, each with ≥1 test:
>   1. Reception of the form data (validation/parsing of the incoming candidate payload).
>   2. Saving into the database (persistence).
>
> BONUS — mock the DB (Prisma) for the save tests so no real data is touched
> (https://www.prisma.io/docs/orm/prisma-client/testing/unit-testing).

## 2. Exploration prompt (map tests to real code first)

> Read the actual repo and find the candidate-insertion code before writing anything. Report:
> (1) the validation / form-data reception layer — exact file, function names, signatures, and the
> full validation rules (regexes, required vs optional, length limits, error messages); (2) the
> persistence layer — service + Prisma model, how it calls `prisma.candidate.create`, how nested
> education/workExperience/resume are saved, and how it handles errors (e.g. P2002); (3) the
> controller/route; (4) the Prisma schema for Candidate and related models. Also report the
> existing Jest/ts-jest setup, installed test deps, any existing tests, and whether
> `backend/src/tests/` exists. Quote the real code.

**Findings that shaped the suite:**
- Reception layer: `validateCandidateData(data)` in `backend/src/application/validator.ts`
  throws `Error` with exact messages (`'Invalid name'`, `'Invalid email'`, `'Invalid phone'`,
  `'Invalid address'`, `'Invalid date'`, `'Invalid CV data'`); skips validation when `data.id`
  is present (edit flow).
- Save layer: `addCandidate(data)` in `backend/src/application/services/candidateService.ts`
  validates, then `new Candidate(data).save()` → `prisma.candidate.create`, and persists nested
  educations/workExperiences/cv; maps Prisma `P2002` to
  `'The email already exists in the database'`.
- Each model does `const prisma = new PrismaClient()` at import; no central client singleton.
- No Jest config and no test files existed; `ts-jest` was installed but not wired up.

## 3. Test-generation prompt (Lesson 4 framing: testing expert + user story + context)

> You are a testing expert in Node.js with Jest. User story: "As an HR/recruiter (or an automated
> API source), I want to insert a new candidate so the ATS stores their data." Acceptance criteria:
> incoming candidate data is validated (required first/last name, valid email, optional but
> well-formed phone, address length limit, valid nested education/experience/CV); a valid candidate
> is persisted via Prisma; a duplicate email is rejected with a clear message; invalid input never
> reaches the database.
>
> Write `backend/src/tests/tests-ARS.test.ts` covering BOTH families (reception + DB save),
> each with ≥1 test. Good practices: descriptive `describe`/`it` names in
> `<unit>_<scenario>_<expectedResult>` form; AAA structure, one behavior per test; `test.each` for
> parametrized validation cases; rich matchers (`toMatchObject`, `toHaveBeenCalledWith`,
> `rejects.toThrow`) over `toBe(true)`. Test the validator directly for exact messages, and test
> `addCandidate` for persistence. Add domain edge cases (missing required fields, malformed email,
> bad phone, address > 100 chars, invalid education date, CV missing filePath, edit-flow id skip).

## 4. Mocking-refinement prompt (mock at the boundary, no new dependency)

> Mock the database at the boundary, not the internals, and add no new dependency. Since each model
> does `new PrismaClient()` at import, use `jest.mock('@prisma/client', ...)` with a factory that
> returns the SAME mock client on every `new PrismaClient()` (so all models share it), and keep the
> real `Prisma` namespace via `jest.requireActual` so the production code's
> `instanceof Prisma.PrismaClientInitializationError` check still works. Assert persistence with
> `toHaveBeenCalledWith` and prove invalid input never calls `prisma.candidate.create`. Add a
> minimal `backend/jest.config.js` (`preset: 'ts-jest'`, `testEnvironment: 'node'`) because none
> existed.

## 5. Verification / anti-"Test Theater" prompt (break-the-code)

> Run `npm test` and make all tests pass. Then prove the tests aren't theater: temporarily invert a
> validation (`validateEmail` always passes) and change the P2002 message in the service, re-run,
> confirm the relevant tests FAIL, then restore the code and confirm green again. Report the result.

**Result of the break-the-code check (executed):**
- All 22 tests pass on the unmodified code.
- With `validateEmail` neutralized + P2002 message changed: **6 tests failed** — the 4 parametrized
  email-validation cases, `addCandidate_duplicateEmail_throwsEmailAlreadyExists`, and
  `addCandidate_invalidPayload_rejectsAndDoesNotTouchTheDatabase` (invalid email now slipped past
  the gate and hit the mocked DB). This confirms the tests detect real behavior changes.
- After restoring the production files: **22/22 pass**, and `git diff` on the production files is
  empty.

## Human review notes (ARS)
- Verified each assertion checks real behavior (not tautological); kept the negative
  `not.toHaveBeenCalled()` assertion to guarantee no DB writes on invalid input.
- `backend/jest.config.js` is a necessary third file (no working Jest config existed); flagged in
  the PR. `node_modules`/lockfile come from installing existing deps to run the suite, not from the
  tests themselves.