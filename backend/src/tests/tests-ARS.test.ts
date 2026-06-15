/**
 * Unit-test suite for the "insert candidate into the database" feature (Homework 2).
 *
 * Pista 1 — two mandatory test families, each covered below:
 *   A) Form-data reception: validation/parsing of the incoming candidate payload
 *      (`validateCandidateData`).
 *   B) DB save: persistence of the candidate (`addCandidate` -> `prisma.candidate.create`).
 *
 * The database (Prisma) is mocked at the module boundary so no real DB writes occur.
 */

// --- Boundary mock for Prisma -------------------------------------------------
// Every model module does `const prisma = new PrismaClient()` at import time.
// We replace `PrismaClient` with a jest.fn that always returns the SAME mock
// object, so all models share one mocked client we can assert on. We keep the
// real `Prisma` namespace (via requireActual) so the production code's
// `instanceof Prisma.PrismaClientInitializationError` check still behaves.
jest.mock('@prisma/client', () => {
    const candidate = { create: jest.fn() };
    const education = { create: jest.fn() };
    const workExperience = { create: jest.fn() };
    const resume = { create: jest.fn() };
    return {
        ...jest.requireActual('@prisma/client'),
        PrismaClient: jest.fn(() => ({ candidate, education, workExperience, resume })),
    };
});

import { PrismaClient } from '@prisma/client';
import { validateCandidateData } from '../application/validator';
import { addCandidate } from '../application/services/candidateService';

// Handle to the shared mocked client (same instance the models received).
const prismaMock = new (PrismaClient as unknown as jest.Mock)();

// A minimal valid candidate payload reused across tests.
const validCandidate = () => ({
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    phone: '612345678',
    address: '123 Analytical Engine St',
});

beforeEach(() => {
    jest.clearAllMocks();
});

// =============================================================================
// Family A — Form-data reception (validation / parsing)
// =============================================================================
describe('validateCandidateData (form-data reception)', () => {
    it('validateCandidateData_validPayload_doesNotThrow', () => {
        // Arrange
        const data = {
            ...validCandidate(),
            educations: [
                { institution: 'MIT', title: 'CS', startDate: '2015-09-01', endDate: '2019-06-01' },
            ],
            workExperiences: [
                { company: 'LTI', position: 'Engineer', startDate: '2020-01-01' },
            ],
            cv: { filePath: '/tmp/cv.pdf', fileType: 'application/pdf' },
        };

        // Act & Assert
        expect(() => validateCandidateData(data)).not.toThrow();
    });

    describe('invalid name', () => {
        test.each([
            ['missing firstName', { firstName: undefined }],
            ['too short firstName', { firstName: 'A' }],
            ['numeric firstName', { firstName: 'Ada123' }],
            ['missing lastName', { lastName: undefined }],
            ['numeric lastName', { lastName: 'Lovelace_99' }],
        ])('validateCandidateData_%s_throwsInvalidName', (_label, override) => {
            // Arrange
            const data = { ...validCandidate(), ...override };

            // Act & Assert
            expect(() => validateCandidateData(data)).toThrow('Invalid name');
        });
    });

    describe('invalid email', () => {
        test.each([
            ['no @ sign', 'ada.example.com'],
            ['no TLD', 'ada@example'],
            ['empty string', ''],
            ['missing local part', '@example.com'],
        ])('validateCandidateData_%s_throwsInvalidEmail', (_label, email) => {
            // Arrange
            const data = { ...validCandidate(), email };

            // Act & Assert
            expect(() => validateCandidateData(data)).toThrow('Invalid email');
        });
    });

    describe('phone (optional, must match Spanish mobile format when present)', () => {
        test.each([
            ['too short', '123'],
            ['wrong leading digit', '512345678'],
            ['contains letters', '6123abc78'],
        ])('validateCandidateData_invalidPhone_%s_throwsInvalidPhone', (_label, phone) => {
            const data = { ...validCandidate(), phone };
            expect(() => validateCandidateData(data)).toThrow('Invalid phone');
        });

        it('validateCandidateData_omittedPhone_doesNotThrow', () => {
            // Arrange — phone is optional
            const { phone, ...data } = validCandidate();

            // Act & Assert
            expect(() => validateCandidateData(data)).not.toThrow();
        });
    });

    it('validateCandidateData_addressOver100Chars_throwsInvalidAddress', () => {
        // Arrange
        const data = { ...validCandidate(), address: 'x'.repeat(101) };

        // Act & Assert
        expect(() => validateCandidateData(data)).toThrow('Invalid address');
    });

    it('validateCandidateData_invalidEducationDate_throwsInvalidDate', () => {
        // Arrange
        const data = {
            ...validCandidate(),
            educations: [{ institution: 'MIT', title: 'CS', startDate: '01-09-2015' }],
        };

        // Act & Assert
        expect(() => validateCandidateData(data)).toThrow('Invalid date');
    });

    it('validateCandidateData_cvMissingFilePath_throwsInvalidCVData', () => {
        // Arrange
        const data = { ...validCandidate(), cv: { fileType: 'application/pdf' } };

        // Act & Assert
        expect(() => validateCandidateData(data)).toThrow('Invalid CV data');
    });

    it('validateCandidateData_idPresent_skipsValidationForEditFlow', () => {
        // Arrange — when an id is supplied the payload is treated as an edit and
        // field validation is intentionally skipped, so even bad fields pass.
        const data = { id: 42, firstName: '', email: 'not-an-email' };

        // Act & Assert
        expect(() => validateCandidateData(data)).not.toThrow();
    });
});

// =============================================================================
// Family B — DB save (persistence, Prisma mocked)
// =============================================================================
describe('addCandidate (database save)', () => {
    it('addCandidate_validCandidate_callsPrismaCreateAndReturnsSaved', async () => {
        // Arrange
        const data = validCandidate();
        const saved = { id: 1, ...data };
        (prismaMock.candidate.create as jest.Mock).mockResolvedValue(saved);

        // Act
        const result = await addCandidate(data);

        // Assert
        expect(prismaMock.candidate.create).toHaveBeenCalledTimes(1);
        expect(prismaMock.candidate.create).toHaveBeenCalledWith({
            data: {
                firstName: 'Ada',
                lastName: 'Lovelace',
                email: 'ada@example.com',
                phone: '612345678',
                address: '123 Analytical Engine St',
            },
        });
        expect(result).toMatchObject({ id: 1, email: 'ada@example.com' });
    });

    it('addCandidate_withEducationExperienceAndCv_persistsRelatedEntities', async () => {
        // Arrange
        const data = {
            ...validCandidate(),
            educations: [
                { institution: 'MIT', title: 'CS', startDate: '2015-09-01', endDate: '2019-06-01' },
            ],
            workExperiences: [
                { company: 'LTI', position: 'Engineer', startDate: '2020-01-01' },
            ],
            cv: { filePath: '/tmp/cv.pdf', fileType: 'application/pdf' },
        };
        (prismaMock.candidate.create as jest.Mock).mockResolvedValue({ id: 7 });
        (prismaMock.education.create as jest.Mock).mockResolvedValue({ id: 11 });
        (prismaMock.workExperience.create as jest.Mock).mockResolvedValue({ id: 21 });
        (prismaMock.resume.create as jest.Mock).mockResolvedValue({ id: 31 });

        // Act
        await addCandidate(data);

        // Assert — each related entity is persisted with the new candidate's id.
        expect(prismaMock.education.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ institution: 'MIT', candidateId: 7 }),
        });
        expect(prismaMock.workExperience.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ company: 'LTI', candidateId: 7 }),
        });
        expect(prismaMock.resume.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ filePath: '/tmp/cv.pdf', candidateId: 7 }),
        });
    });

    it('addCandidate_duplicateEmail_throwsEmailAlreadyExists', async () => {
        // Arrange — Prisma signals a unique-constraint violation with code P2002.
        (prismaMock.candidate.create as jest.Mock).mockRejectedValue({ code: 'P2002' });

        // Act & Assert
        await expect(addCandidate(validCandidate())).rejects.toThrow(
            'The email already exists in the database',
        );
    });

    it('addCandidate_invalidPayload_rejectsAndDoesNotTouchTheDatabase', async () => {
        // Arrange — invalid email must be rejected by the validation gate before
        // any persistence happens (proves the DB is never written on bad input).
        const data = { ...validCandidate(), email: 'not-an-email' };

        // Act & Assert
        await expect(addCandidate(data)).rejects.toThrow(/Invalid email/);
        expect(prismaMock.candidate.create).not.toHaveBeenCalled();
    });
});
