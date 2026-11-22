/** Plain browser JavaScript, served locally; no build-time environment or credentials are embedded. */
export const docsBrowserSource = String.raw`(() => {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const controls = {
    refresh: byId('refresh-session'), session: byId('session-status'),
    connect: byId('ws-connect'), disconnect: byId('ws-disconnect'), send: byId('ws-send'),
    status: byId('ws-status'), feedback: byId('ws-feedback'), events: byId('ws-events'),
    message: byId('ws-message'), server: byId('server-id'), error: byId('docs-error'),
  };
  let config;
  let socket;
  let generation = 0;
  let connecting = false;
  let swaggerReady = false;
  const secrets = new Set();
  const timeout = () => AbortSignal.timeout(12000);

  function showError(message) {
    controls.error.textContent = message;
    controls.error.hidden = !message;
  }
  function redact(value) {
    if (typeof value === 'string') {
      let safe = value.replace(/([?&](?:ticket|token|access_token|refresh_token)=)[^&\s]+/gi, '$1[masqué]')
        .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [masqué]');
      for (const secret of secrets) safe = safe.split(secret).join('[masqué]');
      return safe;
    }
    if (Array.isArray(value)) return value.map(redact);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key, /token|ticket|secret|authorization|cookie|password|credential/i.test(key) ? '[masqué]' : redact(entry),
    ]));
    return value;
  }
  function log(direction, value) {
    const empty = controls.events.querySelector('.event-empty');
    if (empty) empty.remove();
    const item = document.createElement('li');
    item.className = 'event';
    const meta = document.createElement('span');
    meta.className = 'event-meta';
    meta.textContent = new Date().toLocaleTimeString('fr-FR') + ' · ' + direction;
    const body = document.createElement('pre');
    const safe = redact(value);
    body.textContent = (typeof safe === 'string' ? safe : JSON.stringify(safe, null, 2)).slice(0, 10000);
    item.append(meta, body);
    controls.events.prepend(item);
    while (controls.events.children.length > 100) controls.events.lastElementChild.remove();
  }
  function updateSocket(label, state) {
    controls.status.textContent = label;
    controls.status.dataset.state = state;
    controls.connect.disabled = !config || connecting || !!socket;
    controls.disconnect.disabled = !connecting && !socket;
    controls.send.disabled = !socket || socket.readyState !== WebSocket.OPEN;
  }
  function disconnect() {
    generation++;
    connecting = false;
    const previous = socket;
    socket = undefined;
    if (previous) previous.close(1000, 'Console déconnectée');
    secrets.clear();
    updateSocket('Déconnecté', 'closed');
  }
  async function readSession(options = {}) {
    if (!config) throw new Error('La configuration de cette instance est indisponible.');
    const response = await fetch(new URL('/v6/auth/session', config.apiUrl), {
      credentials: 'include', cache: 'no-store', signal: timeout(),
    });
    if (response.status === 401) {
      const denied = await response.json().catch(() => null);
      if (options.actorRecovery && denied?.error?.code === 'actor_session_available' &&
          typeof denied.csrfToken === 'string' && denied.csrfToken) {
        controls.session.textContent = 'Délégation expirée · retour au compte principal disponible';
        return { csrfToken: denied.csrfToken };
      }
      controls.session.textContent = 'Connectez-vous au dashboard, puis vérifiez la session ici.';
      controls.session.closest('.session-bar').dataset.authenticated = 'false';
      disconnect();
      throw new Error('Une session valide est nécessaire. Connectez-vous au dashboard.');
    }
    if (!response.ok) throw new Error('La vérification de session est temporairement indisponible.');
    const session = await response.json();
    if (!session || session.authenticated !== true || typeof session.csrfToken !== 'string' || !session.csrfToken)
      throw new Error('La réponse de session est invalide.');
    controls.session.textContent = 'Session connectée · mêmes permissions que le dashboard';
    controls.session.closest('.session-bar').dataset.authenticated = 'true';
    return session;
  }
  async function checkSession() {
    controls.refresh.disabled = true;
    try { await readSession(); showError(''); }
    catch (error) { showError(error.message); }
    finally { controls.refresh.disabled = false; }
  }
  function prepareHttpRequest(request) {
    return (async () => {
      const target = new URL(request.url, config.apiUrl);
      if (target.origin !== location.origin || target.username || target.password || !/^\/v6(?:\/|$)/.test(target.pathname))
        throw new Error('Les essais sont limités à l’API v6 de cette instance.');
      const headers = new Headers(request.headers || {});
      const method = (request.method || 'GET').toUpperCase();
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method) &&
          (!headers.has('Authorization') || target.pathname === '/v6/auth/impersonations/end') &&
          target.pathname !== '/v6/auth/legacy-session') {
        const session = await readSession({ actorRecovery: ['/v6/auth/impersonations/end', '/v6/auth/logout'].includes(target.pathname) });
        headers.set('X-CSRF-Token', session.csrfToken);
      }
      request.headers = Object.fromEntries(headers.entries());
      request.credentials = 'include';
      return request;
    })();
  }
  async function connect() {
    if (!config || connecting || socket) return;
    const current = ++generation;
    connecting = true;
    controls.feedback.textContent = '';
    updateSocket('Connexion…', 'connecting');
    try {
      const session = await readSession();
      if (current !== generation) return;
      const response = await fetch(new URL('/v6/auth/ws-ticket', config.apiUrl), {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken },
        body: '{}', signal: timeout(),
      });
      if (!response.ok) throw new Error('Le ticket de connexion est indisponible. Vérifiez votre session.');
      const result = await response.json();
      if (!result || typeof result.ticket !== 'string' || !result.ticket) throw new Error('Le ticket de connexion est invalide.');
      if (current !== generation) return;
      secrets.add(result.ticket);
      const target = new URL(config.wsUrl);
      target.searchParams.set('ticket', result.ticket);
      const ws = new WebSocket(target.href);
      socket = ws;
      ws.onopen = () => {
        if (current !== generation || socket !== ws) return;
        updateSocket('Connecté', 'open');
        log('Connexion', 'Connexion WebSocket ouverte.');
      };
      ws.onmessage = (event) => {
        if (current !== generation || socket !== ws) return;
        if (typeof event.data !== 'string') return log('Reçu', '[message binaire]');
        try { log('Reçu', JSON.parse(event.data)); }
        catch { log('Reçu', event.data); }
      };
      ws.onerror = () => {
        if (current === generation && socket === ws)
          controls.feedback.textContent = 'La connexion WebSocket a échoué. Vérifiez la passerelle et votre session.';
      };
      ws.onclose = (event) => {
        if (current !== generation || socket !== ws) return;
        socket = undefined;
        updateSocket('Déconnecté · ' + event.code, 'closed');
        log('Fermeture', { code: event.code, reason: event.reason });
        secrets.clear();
      };
    } catch (error) {
      if (current === generation) {
        controls.feedback.textContent = redact(error.message);
        updateSocket('Déconnecté', 'closed');
      }
    } finally {
      if (current === generation) {
        connecting = false;
        updateSocket(controls.status.textContent, controls.status.dataset.state);
      }
    }
  }
  function send() {
    controls.feedback.textContent = '';
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      controls.feedback.textContent = 'Connectez la console avant d’envoyer un message.';
      return;
    }
    try {
      if (controls.message.value.length > 65536) throw new Error('Le message dépasse 65 536 caractères.');
      const message = JSON.parse(controls.message.value);
      if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.action !== 'string')
        throw new Error('Utilisez un objet JSON avec une propriété action.');
      socket.send(JSON.stringify(message));
      log('Envoyé', message);
    } catch (error) { controls.feedback.textContent = 'Envoi impossible : ' + redact(error.message); }
  }
  function selectTab(kind, focus) {
    for (const name of ['http', 'ws']) {
      const selected = name === kind;
      const tab = byId('tab-' + name);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      byId('panel-' + name).hidden = !selected;
      if (selected && focus) tab.focus();
    }
  }
  function resolveSchema(value, specification, parents = new Set()) {
    if (Array.isArray(value)) return value.map((entry) => resolveSchema(entry, specification, parents));
    if (!value || typeof value !== 'object') return value;
    let source = value;
    let seen = parents;
    const reference = value.$ref;
    if (typeof reference === 'string' && reference.startsWith('#/')) {
      if (parents.has(reference)) return { $ref: reference };
      let target = specification;
      for (const encoded of reference.slice(2).split('/')) {
        const key = encoded.replace(/~1/g, '/').replace(/~0/g, '~');
        target = target && Object.prototype.hasOwnProperty.call(target, key) ? target[key] : undefined;
      }
      if (target && typeof target === 'object' && !Array.isArray(target)) {
        source = { ...target, ...value };
        delete source.$ref;
        seen = new Set(parents).add(reference);
      }
    }
    return Object.fromEntries(Object.entries(source).map(([key, entry]) => [key, resolveSchema(entry, specification, seen)]));
  }
  async function loadMessages() {
    const container = byId('asyncapi-messages');
    try {
      const response = await fetch('/v6/docs/asyncapi.json', { cache: 'no-store', signal: timeout() });
      if (!response.ok) throw new Error('AsyncAPI indisponible');
      const documentSpec = await response.json();
      const messages = Object.entries(documentSpec.components?.messages || {});
      container.replaceChildren();
      for (const [key, message] of messages) {
        const card = document.createElement('article'); card.className = 'message-card';
        const heading = document.createElement('h3'); heading.textContent = message.name || key;
        const scope = document.createElement('p'); scope.className = 'message-scope';
        scope.textContent = [message['x-client'] === 'addon' ? 'Addon GMod' : 'Dashboard',
          message['x-direction'] === 'client-to-server' ? 'Vers la passerelle' : 'Depuis la passerelle'].join(' · ');
        const description = document.createElement('p'); description.textContent = message.summary || message.description || '';
        const details = document.createElement('details');
        const summary = document.createElement('summary'); summary.textContent = 'Schéma et exemples';
        const body = document.createElement('pre'); body.textContent = JSON.stringify({
          payload: resolveSchema(message.payload, documentSpec), examples: message.examples || [],
        }, null, 2);
        details.append(summary, body); card.append(heading, scope, description, details); container.append(card);
      }
      if (!messages.length) container.textContent = 'Consultez le document AsyncAPI JSON pour le contrat complet.';
    } catch { container.textContent = 'Le contrat AsyncAPI est indisponible. Réessayez le chargement.'; }
  }
  async function loadConfiguration() {
    const retry = byId('reload-docs'); retry.hidden = true;
    try {
      const response = await fetch('/v6/docs/config.json', { cache: 'no-store', signal: timeout() });
      if (!response.ok) throw new Error('Configuration indisponible');
      const value = await response.json();
      const api = new URL(value.apiUrl);
      const ws = new URL(value.wsUrl);
      const website = new URL(value.websiteUrl);
      if (api.origin !== location.origin || api.username || api.password || api.search || api.hash ||
          !['ws:', 'wss:'].includes(ws.protocol) || ws.username || ws.password || ws.search || ws.hash ||
          (location.protocol === 'https:' && ws.protocol !== 'wss:') ||
          !['http:', 'https:'].includes(website.protocol) || website.username || website.password)
        throw new Error('Configuration de documentation invalide');
      config = value;
      const dashboard = byId('dashboard-link');
      dashboard.href = new URL('/dashboard/guilds', website).href;
      dashboard.setAttribute('aria-disabled', 'false');
      byId('ws-target').textContent = ws.origin + ws.pathname;
      if (!swaggerReady) {
        if (typeof window.SwaggerUIBundle !== 'function') throw new Error('Swagger UI indisponible');
        window.SwaggerUIBundle({
          url: '/v6/docs/openapi.json', dom_id: '#swagger-ui',
          deepLinking: false, validatorUrl: null, persistAuthorization: false,
          withCredentials: true, requestInterceptor: prepareHttpRequest,
          displayRequestDuration: true, tryItOutEnabled: false,
        });
        swaggerReady = true;
      }
      showError('');
      updateSocket(controls.status.textContent, controls.status.dataset.state);
      await loadMessages();
    } catch {
      config = undefined;
      showError('Impossible de charger la documentation de cette instance. Utilisez l’adresse publique configurée de l’API, puis réessayez.');
      retry.hidden = false;
      updateSocket('Déconnecté', 'closed');
    }
  }
  for (const kind of ['http', 'ws']) {
    const tab = byId('tab-' + kind);
    tab.addEventListener('click', () => selectTab(kind, false));
    tab.addEventListener('keydown', (event) => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        selectTab(event.key === 'Home' ? 'http' : event.key === 'End' ? 'ws' : kind === 'http' ? 'ws' : 'http', true);
      }
    });
  }
  controls.refresh.addEventListener('click', () => void checkSession());
  controls.connect.addEventListener('click', () => void connect());
  controls.disconnect.addEventListener('click', disconnect);
  controls.send.addEventListener('click', send);
  byId('ws-example').addEventListener('click', () => {
    controls.message.value = JSON.stringify({ action: 'server_status', data: { serverID: controls.server.value.trim() || 'SERVER_ID' } }, null, 2);
  });
  byId('ws-clear').addEventListener('click', () => {
    controls.events.replaceChildren(); controls.feedback.textContent = '';
  });
  byId('reload-docs').addEventListener('click', () => void loadConfiguration());
  window.addEventListener('beforeunload', disconnect);
  if (location.pathname.endsWith('/ws') || location.hash === '#websocket') selectTab('ws', false);
  void loadConfiguration();
})();`
