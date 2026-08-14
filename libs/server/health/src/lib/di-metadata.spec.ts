import 'reflect-metadata';
import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';

@Injectable()
class Dependency {
  readonly value = 'resolved';
}

@Injectable()
class Consumer {
  // Injected by type alone, with no @Inject token to fall back on. Nest reads
  // the type from the design:paramtypes metadata the compiler emits, so this
  // resolves only when the test transform implements emitDecoratorMetadata.
  constructor(readonly dependency: Dependency) {}
}

describe('Nest dependency injection under Vitest', () => {
  it('resolves a constructor dependency by type', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [Dependency, Consumer],
    }).compile();

    expect(moduleRef.get(Consumer).dependency.value).toBe('resolved');
  });

  it('emits design:paramtypes for a decorated class', () => {
    const paramTypes = Reflect.getMetadata('design:paramtypes', Consumer);

    expect(paramTypes).toEqual([Dependency]);
  });
});
