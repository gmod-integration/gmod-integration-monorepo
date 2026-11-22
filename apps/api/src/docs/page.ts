/** Developer reference is served by the API so browser cookies stay on their own origin. */
export function createDocsPage(): string {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>API v6 · GMod Integration</title>
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="/v6/docs/assets/swagger-ui.css">
  <link rel="stylesheet" href="/v6/docs/assets/styles.css">
  <script defer src="/v6/docs/assets/swagger-ui-bundle.js"></script>
  <script defer src="/v6/docs/assets/browser.js"></script>
</head>
<body>
  <a class="skip-link" href="#reference">Aller à la documentation</a>
  <header class="docs-header">
    <div class="docs-container heading-row">
      <div>
        <p class="eyebrow">GMOD INTEGRATION · DÉVELOPPEURS</p>
        <h1>API v6 <span class="version-badge">Référence interactive</span></h1>
        <p class="header-description">Explorez les routes HTTP et les échanges WebSocket de votre instance.</p>
      </div>
      <a id="dashboard-link" class="button button-header" href="#" aria-disabled="true" target="_blank" rel="noopener noreferrer">Ouvrir le dashboard pour se connecter ↗</a>
    </div>
  </header>
  <main id="reference" class="docs-container">
    <section class="session-bar" aria-label="Session de test">
      <div class="session-copy"><span class="status-dot" aria-hidden="true"></span><span id="session-status" role="status">Session à vérifier</span></div>
      <button id="refresh-session" type="button" class="button">Vérifier la session</button>
    </section>
    <div id="docs-error" class="notice notice-error" role="alert" hidden></div>
    <button id="reload-docs" type="button" class="button" hidden>Réessayer le chargement</button>
    <nav class="tabs" role="tablist" aria-label="Type d’API">
      <button id="tab-http" type="button" role="tab" aria-controls="panel-http" aria-selected="true" tabindex="0">HTTP <span>OpenAPI</span></button>
      <button id="tab-ws" type="button" role="tab" aria-controls="panel-ws" aria-selected="false" tabindex="-1">WebSocket <span>AsyncAPI</span></button>
    </nav>
    <section id="panel-http" role="tabpanel" aria-labelledby="tab-http">
      <div class="section-heading"><div><h2>Routes HTTP</h2><p>Les essais utilisent votre instance et les mêmes permissions que le dashboard.</p></div><a class="text-link" href="/v6/docs/openapi.json" target="_blank" rel="noopener noreferrer">Ouvrir OpenAPI JSON ↗</a></div>
      <p class="notice">Connectez-vous au dashboard dans un autre onglet, puis vérifiez la session ici. Les requêtes de modification utilisent automatiquement son jeton CSRF. Le bouton « Execute » envoie une vraie requête à cette instance.</p>
      <div id="swagger-ui" aria-label="Documentation HTTP">Chargement de la référence HTTP…</div>
    </section>
    <section id="panel-ws" role="tabpanel" aria-labelledby="tab-ws" hidden>
      <div class="section-heading"><div><h2>WebSocket</h2><p>Consultez les messages et testez une connexion dashboard authentifiée.</p></div><a class="text-link" href="/v6/docs/asyncapi.json" target="_blank" rel="noopener noreferrer">Ouvrir AsyncAPI JSON ↗</a></div>
      <div class="console-grid">
        <section class="card" aria-labelledby="connection-heading">
          <h3 id="connection-heading">Connexion</h3>
          <p class="muted">Passerelle configurée</p><code id="ws-target" class="endpoint">Chargement…</code>
          <div class="connection-row"><span id="ws-status" role="status" data-state="closed">Déconnecté</span><div class="button-row"><button id="ws-connect" type="button" class="button button-primary" disabled>Connecter</button><button id="ws-disconnect" type="button" class="button" disabled>Déconnecter</button></div></div>
          <p class="help">Chaque connexion demande un ticket neuf. La console conserve les identifiants en mémoire uniquement.</p>
          <label for="server-id">Identifiant du serveur GMod</label><input id="server-id" autocomplete="off" placeholder="UUID du serveur" spellcheck="false">
          <div class="field-heading"><label for="ws-message">Message JSON à envoyer</label><button id="ws-example" type="button" class="text-button">Exemple server_status</button></div>
          <textarea id="ws-message" rows="9" maxlength="65536" spellcheck="false" aria-describedby="message-help">{
  "action": "server_status",
  "data": {
    "serverID": "SERVER_ID"
  }
}</textarea>
          <p id="message-help" class="help">La passerelle applique vos permissions sur chaque serveur. Aucun message n’est rejoué automatiquement.</p>
          <div class="button-row"><button id="ws-send" type="button" class="button button-primary" disabled>Envoyer le message</button></div>
        </section>
        <section class="card events-card" aria-labelledby="events-heading">
          <div class="field-heading"><h3 id="events-heading">Échanges en direct</h3><button id="ws-clear" type="button" class="text-button">Effacer</button></div>
          <p class="help">Les 100 derniers échanges de cet onglet. Les secrets sont masqués.</p>
          <ol id="ws-events" class="events" aria-label="Messages WebSocket"><li class="event-empty">Connectez la console pour observer les messages.</li></ol>
          <p id="ws-feedback" class="feedback" role="status"></p>
        </section>
      </div>
      <section class="message-reference" aria-labelledby="messages-heading"><div class="section-heading"><div><h2 id="messages-heading">Messages documentés</h2><p>Contrat AsyncAPI de la passerelle, avec schémas et exemples. La console ci-dessus teste les messages dashboard ; les messages addon sont utilisés par le serveur GMod.</p></div></div><div id="asyncapi-messages" class="message-list">Chargement du contrat AsyncAPI…</div></section>
    </section>
    <footer>GMod Integration · API v6 <span>HTTP et WebSocket partagent les mêmes règles de session et de permissions.</span></footer>
  </main>
</body>
</html>`
}
