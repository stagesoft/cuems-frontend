import config from './app-config.json';

// The WebSocket backend (engine/editor) is served by the controller that also
// serves this UI (/var/www). The controller's IP can vary between clusters, so
// derive the host from window.location instead of hardcoding it — same approach
// as the OLA DMX console iframe. A non-empty `websocketBaseUrl` in
// app-config.json still wins, for dev pointing the UI at a remote controller.
function resolveWebsocketBaseUrl(): string {
  const override = config.websocketBaseUrl?.trim();
  if (override) {
    return override;
  }
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProtocol}//${window.location.hostname}`;
}

export const AppConfig = {
  ...config,
  websocketBaseUrl: resolveWebsocketBaseUrl(),
};
