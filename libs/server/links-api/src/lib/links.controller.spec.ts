import type { LinkId } from '@linkops/shared/domain';
import type { LinkRepository } from '@linkops/server/links-data-access';
import type { TelemetryPort } from '@linkops/server/telemetry';
import { LinksController } from './links.controller';

/** A repository double whose every method is a no-op unless overridden. */
function fakeRepository(
  overrides: Partial<LinkRepository> = {},
): LinkRepository {
  return {
    findById: vi.fn(),
    findAll: vi.fn(() => []),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(() => true),
    count: vi.fn(() => 0),
    ...overrides,
  };
}

/** A telemetry double whose every method is a no-op unless overridden. */
function fakeTelemetry(overrides: Partial<TelemetryPort> = {}): TelemetryPort {
  return {
    latestSample: vi.fn(() => null),
    latestSamples: vi.fn(() => new Map()),
    history: vi.fn(() => []),
    summary: vi.fn(),
    dropLink: vi.fn(),
    ...overrides,
  };
}

describe('LinksController#remove', () => {
  it('calls the repository delete before dropLink, never the reverse', () => {
    const calls: string[] = [];
    const repository = fakeRepository({
      delete: vi.fn((_id: LinkId) => {
        calls.push('repository.delete');
        return true;
      }),
    });
    const telemetry = fakeTelemetry({
      dropLink: vi.fn((_id: LinkId) => {
        calls.push('telemetry.dropLink');
      }),
    });
    const controller = new LinksController(repository, telemetry);

    controller.remove('lnk_0001');

    expect(calls).toEqual(['repository.delete', 'telemetry.dropLink']);
  });

  it('does not call dropLink when the repository finds nothing to delete', () => {
    const telemetry = fakeTelemetry();
    const controller = new LinksController(
      fakeRepository({ delete: vi.fn(() => false) }),
      telemetry,
    );

    expect(() => controller.remove('lnk_9999')).toThrow('lnk_9999');
    expect(telemetry.dropLink).not.toHaveBeenCalled();
  });
});
