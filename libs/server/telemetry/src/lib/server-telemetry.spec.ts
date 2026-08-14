import { serverTelemetry } from './server-telemetry';

describe('serverTelemetry', () => {
  it('should work', () => {
    expect(serverTelemetry()).toEqual('server-telemetry');
  });
});
