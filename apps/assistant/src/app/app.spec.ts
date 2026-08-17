import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { App } from './app';

/**
 * A smoke test for this remote's standalone shell — proof `nx serve
 * assistant` renders something on its own, with no host. The panel's actual
 * behaviour is covered where it is composed into the Fleet route:
 * `apps/console/src/app/assistant.spec.ts`.
 */
describe('App', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('mounts the Assistant panel and opens a conversation', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/agent/ui').flush({
      version: 'v1.0',
      createSurface: {
        surfaceId: 'triage',
        components: [
          { id: 'root', component: 'Surface', children: ['t'] },
          { id: 't', component: 'Text', text: 'Hello.' },
        ],
      },
    });
    await fixture.whenStable();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.a2ui-text')
        ?.textContent,
    ).toContain('Hello.');

    http.verify();
  });
});
