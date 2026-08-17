import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { apiBaseInterceptor } from './api-base.interceptor';

describe('apiBaseInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiBaseInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    controller.verify();
  });

  it('preserves /api/ endpoints relative to base URI', () => {
    http.get('/api/fleet/summary').subscribe();
    const req = controller.expectOne('/api/fleet/summary');
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('leaves non-api requests untouched', () => {
    http.get('/healthz').subscribe();
    const req = controller.expectOne('/healthz');
    expect(req.request.method).toBe('GET');
    req.flush('healthy');
  });
});
