import type { LegalDocumentContent } from './LegalDocument.js'

export const privacyContent: Record<'en' | 'fr', LegalDocumentContent> = {
  en: {
    title: 'Privacy Policy',
    updatedLabel: 'Last updated',
    updatedDate: '23 November 2026',
    updatedISO: '2026-11-23',
    sections: [
      {
        title: 'Scope and contact',
        paragraphs: [
          'Gmod Integration connects Discord communities with Garry’s Mod servers. This notice covers the hosted website, dashboard, API and bot, including data about members and players without a dashboard account. It explains processing; reading it or using the service does not constitute consent to optional processing.',
          'The operator of Gmod Integration is responsible for its account administration, shared player records, service security and support processing. Use the contact below for privacy questions and requests. Operators of self-hosted instances are responsible for their deployment and must provide their own information.',
          'Community administrators choose which features to enable and are responsible for their purposes, lawful basis and notices to members and players. For processing performed only on their documented instructions, Gmod Integration acts as a processor; an appropriate data processing agreement must govern that relationship. You can contact us even if you do not know which administrator to approach.',
        ],
        links: [{ label: 'gmod-integration@linv.dev', href: 'mailto:gmod-integration@linv.dev' }],
      },
      {
        title: 'Data and sources',
        paragraphs: [
          'Data comes from you, Discord, Steam, GmodStore, community administrators and connected game servers. Categories depend on the features enabled. A player can appear in game logs without signing into our website.',
          'Dashboard sign-in requires Discord identification and authorization. Steam linking and paid features are optional; without their associated identifiers we cannot provide them. This version does not retrieve your Discord email address to create your profile. We also receive information you choose to send to support.',
          'A shared player record can associate the same Steam identifier with connection and IP history from several connected servers, rather than keeping that history only within one community.',
        ],
        table: {
          caption: 'Data processed according to the features used',
          headers: ['Source or feature', 'Data', 'Use'],
          rows: [
            [
              'Discord and dashboard',
              'User IDs, names and stored avatars; guild IDs, names and stored icons; members, roles, channels, permissions and membership information; OAuth access/refresh tokens, webhooks and custom bot credentials where configured.',
              'Sign-in, permissions, configuration and synchronization.',
            ],
            [
              'Steam and game servers',
              'Steam IDs, names, stored avatars, IP addresses and IP history, rank/team, playtime, kills/deaths, session statistics, custom data and, where enabled, positions and angles; server address, name, map and status.',
              'Account linking, player records, statistics and server management.',
            ],
            [
              'Chat and moderation',
              'Relayed messages and recorded in-game chat, including team chat where logged; events, bans, warnings, reports and related identifiers.',
              'Chat synchronization, event history and community moderation.',
            ],
            [
              'Screenshots and diagnostics',
              'In-game screenshots, player identifiers, bug reports, error details, technical context and operational logs.',
              'Administrator-requested features, support, incident investigation and troubleshooting.',
            ],
            [
              'Web sessions',
              'Session identifiers and tokens, dates and expiry, IP address, country inferred from connection headers, browser and operating system.',
              'Authentication, session management and security.',
            ],
            [
              'Premium and support',
              'Purchase, buyer or license identifiers, linked Steam account or guild, entitlement and revocation status; support correspondence.',
              'Premium verification and assistance. Payments take place on Discord or GmodStore; our dashboard does not request payment card numbers.',
            ],
          ],
        },
      },
      {
        title: 'Purposes and legal bases',
        paragraphs: [
          'The lawful basis depends on the purpose and relationship with the person concerned. A contract with a community owner does not, by itself, make contract necessity the basis for processing every player’s data.',
        ],
        table: {
          caption: 'Purposes and grounds for processing',
          headers: ['Purpose', 'Legal basis or responsibility'],
          rows: [
            [
              'Provide the account and features you request, and manage premium entitlements',
              'Performance of our contract with you, where necessary for that contract (GDPR Article 6(1)(b)).',
            ],
            [
              'Operate shared player records, secure the hosted service, investigate misuse and provide technical support',
              'Legitimate interests in operating and protecting the service, subject to necessity and balancing your rights (Article 6(1)(f)). Cross-server history requires a separate necessity assessment; community instructions alone do not justify centralization. You can object.',
            ],
            [
              'Run community logging, statistics, chat and moderation',
              'The community controller must determine and communicate its lawful basis. Processing on its behalf requires documented instructions and an Article 28 agreement.',
            ],
            [
              'Meet a binding legal duty or lawful authority request',
              'Compliance with the specific legal obligation that applies (Article 6(1)(c)), not a general ground for unrelated collection.',
            ],
            [
              'Optional processing requiring permission',
              'Prior, specific consent (Article 6(1)(a)) where required, with the ability to withdraw. Consent is not inferred from visiting this notice.',
            ],
          ],
        },
      },
      {
        title: 'Recipients and visibility',
        paragraphs: [
          'Signed-in website users can view player profiles showing the Steam identifier, a name recorded on a public server, the available trust score and statistics from public servers. Private server statistics are visible to the player through their linked account and to authorized administrators through server management.',
          'Recipients include service personnel handling operations or support, authorized community administrators and infrastructure providers needed for delivery. Chat, logs, reports and screenshots can be sent to the Discord channels or game recipients selected by the community. Screenshot handling can include a configured service moderation channel.',
          'Discord, Valve/Steam and GmodStore are external recipients of data needed for the integrations or purchases you use. For example, chat synchronization sends the message and associated display information to Discord. The fact that this transmission is part of the requested feature does not make the recipient internal to Gmod Integration. These platforms apply their own privacy policies to their services; Discord acts as a controller for its own service.',
          'Cloudflare is an infrastructure provider for the website and network delivery. Technical providers act as processors where they process data on our behalf and instructions, under the applicable agreement. Other recipients may act as independent controllers; being an external provider does not by itself determine the legal role. Sentry processes server-side error and performance diagnostics when enabled; browser monitoring is disabled in this version.',
          'Avatar and screenshot URLs can be opened by anyone who possesses the link. Recipients may copy screenshots or relayed messages, and Discord or a community may retain independent copies. Avoid sensitive information in reports or screenshots and check the audience before enabling forwarding.',
        ],
        links: [{ label: 'Discord Privacy Policy', href: 'https://discord.com/privacy' }],
      },
      {
        title: 'Locations and international transfers',
        paragraphs: [
          'The databases and application files whose hosting is controlled by Gmod Integration are stored in the European Union. This describes our hosted copies; it does not cover every copy or processing operation of an external recipient. Cloudflare’s network processing and technical logs depend on the services and localization settings in use.',
          'Integrations require sending certain information to external recipients, including Discord. Discord states that it processes and stores data in the United States and other countries. Steam, GmodStore and technical providers may also involve processing outside the European Economic Area. Hosting our own data in the EU therefore does not mean that all data transmitted to these services remains there.',
          'Transfers subject to GDPR Chapter V require an applicable transfer mechanism and any necessary additional safeguards. Contact us for the destinations, recipients and safeguards applicable to your data and how to obtain a copy. A provider’s European endpoint alone does not establish where all subsequent processing or access takes place.',
        ],
      },
      {
        title: 'Retention',
        paragraphs: [
          'Retention must be limited to what the purpose requires, considering erasure requests and any specific legal obligation or necessary legal claim. These criteria do not establish a universal automatic deletion period. Any exception preventing erasure must be explained and limited in scope when responding to your request.',
        ],
        table: {
          caption: 'Retention criteria and access limits',
          headers: ['Category', 'Retention or access criterion'],
          rows: [
            [
              'Account, linked profiles, configuration and entitlements',
              'Needed while the account, link or service is in use; erasure and any continued need must be assessed when the relationship ends or a request is received. Unlinking does not itself erase all historical records.',
            ],
            [
              'Sessions and OAuth credentials',
              'Validity depends on authorization and provider expiry; credentials may be refreshed. Expiry or revocation ends access but does not itself delete the stored session record.',
            ],
            [
              'Game logs, IP history, moderation, statistics, screenshots and diagnostics',
              'Depends on community purposes and settings, incident handling and applicable obligations. A dashboard history or plan limit is an access limit, not proof that stored copies have been erased. There is no general automatic 14-day deletion period.',
            ],
            [
              'Data export archives',
              'The download link expires four days after the request is created. This deadline does not automatically erase the stored archive or request record; you can request their erasure.',
            ],
            [
              'Provider copies and backups',
              'Separate retention arrangements apply. Legally retained data and backups must remain limited to their purpose; erasure requests must address these copies and any restoration. Contact us for the arrangements applicable to your data.',
            ],
          ],
        },
      },
      {
        title: 'Browser storage and optional tracking',
        paragraphs: [
          'The website uses an HttpOnly cookie for your authenticated session. Local browser storage keeps a Discord profile cache, the selected guild or server, language and theme preferences, and any erasure recovery receipt. Historical browser access tokens are converted to a cookie session and removed after successful conversion. Cached values remain until updated or cleared.',
          'You can clear storage through browser settings or sign out. Clearing authentication requires signing in again; clearing preferences resets your choices.',
          'Google AdSense, browser session recording (Session Replay) and optional browser performance tracking are disabled in this version. Any future activation of non-essential tracking subject to consent must offer an informed choice before activation and an equally accessible way to refuse or withdraw it.',
        ],
      },
      {
        title: 'Security',
        paragraphs: [
          'The service uses authentication, session revocation and community permission checks for protected dashboard functions. Keep credentials and export links confidential. These controls do not make all assets private: the link-based access to avatars and screenshots described above still applies.',
          'No service can guarantee absolute security. Contact us if you suspect unauthorized access or disclosure. Where a personal data breach triggers legal notification duties, the affected controller must assess and fulfil them.',
        ],
      },
      {
        title: 'Your rights',
        paragraphs: [
          'Under GDPR conditions, you can request access, rectification, erasure and restriction, and object to processing based on legitimate interests. Portability applies to data you provided where processing is automated and based on consent or a contract. Where we rely on consent, you can withdraw it without affecting the lawfulness of earlier processing.',
          'Erasure has exceptions provided by law, including specific legal obligations, freedom of expression and information, and establishing, exercising or defending legal claims. Only data covered by an applicable exception may be retained. In France, you may also give instructions concerning your data after your death.',
          'You can complain to the CNIL or the competent supervisory authority, including in the EU country of your habitual residence or place of work. You do not have to contact us first.',
        ],
        links: [{ label: 'Make a complaint to the CNIL', href: 'https://www.cnil.fr/fr/adresser-une-plainte' }],
      },
      {
        title: 'How to make a request',
        paragraphs: [
          'Use Account → Manage Data for a downloadable export or to confirm an erasure request. The request revokes your sessions and provides a receipt for tracking the cleanup of personal records, stored captures and exports. Completion is reported only after the configured storage cleanup succeeds. A separate, minimized record of the request, active global security bans and an existing non-default reputation score are retained for their specific purposes. Community configuration and acquired community entitlements are not deleted with the personal account. Copies already shared to Discord, backups and other independently held copies require separate handling; contact us about these copies or for access, correction, restriction or an objection.',
          'No dashboard account is needed to contact us. Include the relevant Discord or Steam identifier and community if known. We may request proportionate identity verification where necessary, without routinely requiring an identity document.',
          'We must respond without undue delay and normally within one month of receipt. For complex or numerous requests, GDPR permits up to two additional months; we must explain that extension within the first month. Requests are normally free; any refusal or charge must meet GDPR conditions and be explained with the available remedies.',
          'For community-controlled processing, its administrator is also a contact. We must identify the relevant controller or assist it as appropriate, rather than treating the absence of a website account as a reason to deny your rights.',
        ],
        links: [
          { label: 'Account — Manage Data', href: '/account' },
          { label: 'gmod-integration@linv.dev', href: 'mailto:gmod-integration@linv.dev' },
        ],
      },
      {
        title: 'Automated features and young users',
        paragraphs: [
          'Role and nickname synchronization and other configured rules can affect your presentation or community access. Ask the administrator about rules, source data and consequences, and contact us about hosted-service processing. Under GDPR Article 22, you have the right not to be subject to a solely automated decision with legal or similarly significant effects, except where a statutory exception applies. Where applicable, safeguards include human intervention, expressing your view and contesting the decision.',
          'Access must respect connected-platform age requirements and parental authorization required by law. Administrators must take particular care with children’s data. Privacy rights also apply to players and members unable to create a dashboard account.',
        ],
      },
      {
        title: 'Changes to this notice',
        paragraphs: [
          'The update date identifies this version. Material changes must be brought to affected people’s attention through an appropriate notice before new processing begins. If a new purpose needs consent, it must be obtained separately; continued use does not replace consent or waive your rights.',
        ],
        links: [{ label: 'Terms of Service', href: '/legal/terms' }],
      },
    ],
  },
  fr: {
    title: 'Politique de confidentialité',
    updatedLabel: 'Dernière mise à jour',
    updatedDate: '23 novembre 2026',
    updatedISO: '2026-11-23',
    sections: [
      {
        title: 'Périmètre et contact',
        paragraphs: [
          'Gmod Integration relie des communautés Discord à des serveurs Garry’s Mod. Cette notice couvre le site, le tableau de bord, l’API et le bot hébergés, y compris les données de membres et joueurs sans compte sur le tableau de bord. Elle explique les traitements : sa lecture ou l’utilisation du service ne vaut pas consentement aux traitements facultatifs.',
          'L’exploitant de Gmod Integration est responsable des traitements de gestion des comptes, des fiches joueurs communes, de sécurité du service et d’assistance. Utilisez le contact ci-dessous pour vos questions et demandes. Les exploitants d’instances auto-hébergées sont responsables de leur déploiement et doivent fournir leur propre information.',
          'Les administrateurs choisissent les fonctions à activer et sont responsables de leurs finalités, de leur base légale et de l’information des membres et joueurs. Pour les traitements réalisés uniquement sur leurs instructions documentées, Gmod Integration agit comme sous-traitant ; un accord de sous-traitance adapté doit encadrer cette relation. Vous pouvez nous contacter même si vous ne savez pas à quel administrateur vous adresser.',
        ],
        links: [{ label: 'gmod-integration@linv.dev', href: 'mailto:gmod-integration@linv.dev' }],
      },
      {
        title: 'Données et sources',
        paragraphs: [
          'Les données proviennent de vous, de Discord, de Steam, de GmodStore, des administrateurs et des serveurs de jeu connectés. Les catégories dépendent des fonctions activées. Un joueur peut apparaître dans les journaux de jeu sans se connecter à notre site.',
          'La connexion au tableau de bord nécessite l’identification et l’autorisation Discord. La liaison Steam et les fonctions payantes sont facultatives ; sans les identifiants correspondants, elles ne peuvent pas être fournies. Cette version ne récupère pas votre adresse email Discord pour créer votre profil. Nous recevons aussi les informations que vous transmettez à l’assistance.',
          'Une fiche joueur commune peut associer un même identifiant Steam à un historique de connexion et d’adresses IP provenant de plusieurs serveurs connectés, au lieu de limiter cet historique à une seule communauté.',
        ],
        table: {
          caption: 'Données traitées selon les fonctions utilisées',
          headers: ['Source ou fonction', 'Données', 'Utilisation'],
          rows: [
            [
              'Discord et tableau de bord',
              'Identifiants, noms et avatars conservés ; identifiants, noms et icônes conservées des guildes ; membres, rôles, salons, permissions et appartenance ; jetons OAuth d’accès et de renouvellement, webhooks et identifiants de bots personnalisés si configurés.',
              'Connexion, permissions, configuration et synchronisation.',
            ],
            [
              'Steam et serveurs de jeu',
              'Identifiants Steam, noms, avatars conservés, adresses IP et historique des IP, rang/équipe, temps de jeu, éliminations/morts, statistiques de session, données personnalisées et, selon les fonctions, positions et angles ; adresse, nom, carte et statut du serveur.',
              'Liaison des comptes, fiches joueurs, statistiques et gestion du serveur.',
            ],
            [
              'Chat et modération',
              'Messages relayés et chat en jeu enregistré, y compris le chat d’équipe lorsqu’il est journalisé ; événements, bannissements, avertissements, signalements et identifiants associés.',
              'Synchronisation du chat, historique et modération.',
            ],
            [
              'Captures et diagnostic',
              'Captures du jeu, identifiants des joueurs, rapports de bugs, détails d’erreurs, contexte technique et journaux d’exploitation.',
              'Fonctions demandées par les administrateurs, assistance, analyse d’incidents et dépannage.',
            ],
            [
              'Sessions web',
              'Identifiants et jetons de session, dates et expiration, adresse IP, pays déduit des en-têtes de connexion, navigateur et système d’exploitation.',
              'Authentification, gestion des sessions et sécurité.',
            ],
            [
              'Premium et assistance',
              'Identifiants d’achat, d’acheteur ou de licence, compte Steam ou guilde liés, droits premium et révocation ; échanges avec l’assistance.',
              'Vérification des droits premium et assistance. Les paiements s’effectuent sur Discord ou GmodStore ; notre tableau de bord ne demande pas de numéro de carte bancaire.',
            ],
          ],
        },
      },
      {
        title: 'Finalités et bases légales',
        paragraphs: [
          'La base légale dépend de la finalité et de la relation avec la personne concernée. Un contrat avec le propriétaire d’une communauté ne suffit pas à justifier par l’exécution du contrat le traitement des données de tous ses joueurs.',
        ],
        table: {
          caption: 'Finalités et fondements des traitements',
          headers: ['Finalité', 'Base légale ou responsabilité'],
          rows: [
            [
              'Fournir le compte et les fonctions demandés, gérer les droits premium',
              'Exécution de notre contrat avec vous, pour les données nécessaires à ce contrat (article 6, paragraphe 1, b du RGPD).',
            ],
            [
              'Gérer les fiches joueurs communes, sécuriser le service, analyser les abus et assurer l’assistance technique',
              'Intérêts légitimes d’exploitation et de protection du service, sous réserve de nécessité et de mise en balance de vos droits (article 6, paragraphe 1, f). L’historique entre serveurs nécessite une analyse de nécessité distincte ; les instructions des communautés ne suffisent pas à justifier sa centralisation. Vous pouvez vous y opposer.',
            ],
            [
              'Exécuter les fonctions de journaux, statistiques, chat et modération',
              'Le responsable de la communauté doit déterminer et communiquer sa base légale. Les traitements pour son compte nécessitent des instructions documentées et un accord conforme à l’article 28.',
            ],
            [
              'Respecter une obligation légale ou une demande légalement contraignante',
              'Respect de l’obligation légale précise applicable (article 6, paragraphe 1, c), sans permettre une collecte générale sans rapport avec cette obligation.',
            ],
            [
              'Traitements facultatifs nécessitant une autorisation',
              'Consentement préalable et spécifique (article 6, paragraphe 1, a) lorsqu’il est requis, avec possibilité de retrait. La consultation de cette notice ne vaut pas consentement.',
            ],
          ],
        },
      },
      {
        title: 'Destinataires et visibilité',
        paragraphs: [
          'Les utilisateurs connectés au site peuvent consulter les profils de joueurs indiquant l’identifiant Steam, un pseudonyme enregistré sur un serveur public, le score de confiance disponible et les statistiques des serveurs publics. Les statistiques des serveurs privés sont visibles par le joueur depuis son compte lié et par les administrateurs autorisés dans la gestion du serveur.',
          'Les destinataires incluent les personnes chargées de l’exploitation ou de l’assistance, les administrateurs autorisés et les prestataires techniques nécessaires au service. Le chat, les journaux, les signalements et les captures peuvent être transmis aux salons Discord ou destinataires en jeu choisis par la communauté. Le traitement des captures peut inclure un salon de modération du service configuré à cet effet.',
          'Discord, Valve/Steam et GmodStore sont des destinataires externes des données nécessaires aux intégrations ou achats utilisés. Par exemple, la synchronisation du chat transmet à Discord le message et les informations d’affichage associées. Le fait que cet envoi fasse partie de la fonction demandée ne rend pas son destinataire interne à Gmod Integration. Ces plateformes appliquent leurs propres politiques à leurs services ; Discord agit comme responsable du traitement pour son propre service.',
          'Cloudflare est un prestataire d’infrastructure pour le site et sa diffusion réseau. Les prestataires techniques sont sous-traitants lorsqu’ils traitent les données pour notre compte et sur nos instructions, dans le cadre de l’accord applicable. D’autres destinataires peuvent être responsables de leurs propres traitements ; le statut de prestataire externe ne détermine pas à lui seul le rôle juridique. Sentry traite le diagnostic des erreurs et performances côté serveur lorsqu’il est activé ; la surveillance du navigateur est désactivée dans cette version.',
          'Toute personne disposant du lien peut ouvrir les URL d’avatars et de captures. Les destinataires peuvent copier une capture ou un message relayé ; Discord ou la communauté peuvent conserver leurs propres copies. Évitez les informations sensibles dans les rapports ou captures et vérifiez le public visé avant d’activer un transfert.',
        ],
        links: [{ label: 'Politique de confidentialité de Discord', href: 'https://discord.com/privacy' }],
      },
      {
        title: 'Localisation et transferts internationaux',
        paragraphs: [
          'Les bases de données et fichiers applicatifs dont Gmod Integration contrôle l’hébergement sont stockés dans l’Union européenne. Cela concerne nos copies hébergées, sans englober toutes les copies ou opérations de traitement d’un destinataire externe. Les traitements réseau et journaux techniques de Cloudflare dépendent des services et réglages de localisation utilisés.',
          'Les intégrations nécessitent la transmission de certaines informations à des destinataires externes, notamment Discord. Discord indique traiter et stocker des données aux États-Unis et dans d’autres pays. Steam, GmodStore et les prestataires techniques peuvent aussi impliquer des traitements hors de l’Espace économique européen. L’hébergement de nos propres données dans l’UE ne signifie donc pas que toutes les données transmises à ces services y restent.',
          'Tout transfert relevant du chapitre V du RGPD nécessite un mécanisme applicable et, si nécessaire, des garanties supplémentaires. Vous pouvez nous demander les destinations, destinataires et garanties applicables à vos données ainsi que les modalités d’obtention d’une copie. Un point d’entrée européen ne prouve pas à lui seul le lieu de tous les traitements ou accès ultérieurs.',
        ],
      },
      {
        title: 'Conservation',
        paragraphs: [
          'La conservation doit être limitée à la finalité, en tenant compte des demandes d’effacement, des obligations légales précises et des besoins nécessaires à un contentieux. Ces critères ne constituent pas une durée universelle de suppression automatique. Toute exception à l’effacement doit être expliquée et délimitée lors de la réponse à votre demande.',
        ],
        table: {
          caption: 'Critères de conservation et limites d’accès',
          headers: ['Catégorie', 'Critère de conservation ou d’accès'],
          rows: [
            [
              'Compte, profils liés, configuration et droits premium',
              'Nécessaires pendant l’utilisation du compte, de la liaison ou du service ; l’effacement et tout besoin de conservation doivent être évalués à la fin de la relation ou lors d’une demande. Délier un compte n’efface pas à lui seul tous les historiques.',
            ],
            [
              'Sessions et identifiants OAuth',
              'La validité dépend de l’autorisation et de l’expiration du fournisseur ; les identifiants peuvent être renouvelés. L’expiration ou la révocation met fin à l’accès sans supprimer à elle seule l’enregistrement de session.',
            ],
            [
              'Journaux de jeu, historique des IP, modération, statistiques, captures et diagnostic',
              'Selon les finalités et réglages de la communauté, les incidents et obligations applicables. Une limite d’historique du tableau de bord ou d’une offre est une limite d’accès, pas la preuve d’un effacement. Il n’existe pas de délai général de suppression automatique de 14 jours.',
            ],
            [
              'Archives d’export',
              'Le lien de téléchargement expire quatre jours après la création de la demande. Cette échéance ne supprime pas automatiquement l’archive ni la demande ; vous pouvez en demander l’effacement.',
            ],
            [
              'Copies des prestataires et sauvegardes',
              'Des modalités distinctes s’appliquent. Toute donnée conservée légalement ou sauvegardée doit rester limitée à sa finalité ; les demandes d’effacement doivent prendre en compte ces copies et leur éventuelle restauration. Contactez-nous pour les modalités applicables à vos données.',
            ],
          ],
        },
      },
      {
        title: 'Stockage dans le navigateur et traceurs facultatifs',
        paragraphs: [
          'Le site utilise un cookie HttpOnly pour votre session authentifiée. Le stockage local conserve une copie du profil Discord, la guilde ou le serveur sélectionnés, la langue, le thème et un éventuel reçu de suivi d’effacement. Les anciens jetons d’accès du navigateur sont convertis en session par cookie puis supprimés après une conversion réussie. Les données en cache restent présentes jusqu’à leur mise à jour ou effacement.',
          'Vous pouvez effacer ce stockage dans les réglages du navigateur ou vous déconnecter. L’effacement de l’authentification nécessite une nouvelle connexion ; l’effacement des préférences réinitialise vos choix.',
          'Google AdSense, l’enregistrement des sessions du navigateur (Session Replay) et le suivi facultatif des performances du navigateur sont désactivés dans cette version. Toute réactivation de traceurs non essentiels soumis au consentement doit proposer un choix éclairé avant activation et un moyen aussi accessible de refuser ou retirer ce choix.',
        ],
      },
      {
        title: 'Sécurité',
        paragraphs: [
          'Le service utilise l’authentification, la révocation des sessions et les contrôles de permissions pour les fonctions protégées du tableau de bord. Gardez les identifiants et liens d’export confidentiels. Ces contrôles ne rendent pas tous les fichiers privés : l’accès par lien aux avatars et captures décrit ci-dessus reste applicable.',
          'Aucun service ne peut garantir une sécurité absolue. Contactez-nous en cas d’accès non autorisé ou de divulgation suspectée. Lorsqu’une violation de données déclenche une obligation de notification, le responsable concerné doit l’évaluer et y donner suite.',
        ],
      },
      {
        title: 'Vos droits',
        paragraphs: [
          'Dans les conditions du RGPD, vous pouvez demander l’accès, la rectification, l’effacement et la limitation, ainsi que vous opposer à un traitement fondé sur l’intérêt légitime. La portabilité concerne les données fournies lorsque le traitement est automatisé et fondé sur le consentement ou un contrat. Un consentement peut être retiré sans remettre en cause la licéité des traitements antérieurs.',
          'L’effacement comporte des exceptions prévues par la loi, notamment une obligation légale précise, la liberté d’expression et d’information, ou la constatation, l’exercice et la défense de droits en justice. Seules les données couvertes par une exception applicable peuvent être conservées. En France, vous pouvez aussi définir des directives concernant vos données après votre décès.',
          'Vous pouvez adresser une réclamation à la CNIL ou à l’autorité compétente, notamment dans le pays de l’Union européenne de votre résidence habituelle ou de votre lieu de travail. Vous n’avez pas à nous contacter au préalable.',
        ],
        links: [{ label: 'Adresser une plainte à la CNIL', href: 'https://www.cnil.fr/fr/adresser-une-plainte' }],
      },
      {
        title: 'Exercer vos droits',
        paragraphs: [
          'La rubrique Compte → Gérer les données permet de demander un export ou de confirmer une demande d’effacement. La demande révoque vos sessions et fournit un reçu pour suivre le nettoyage des données personnelles, captures stockées et exports. La fin du traitement est annoncée uniquement après la réussite du nettoyage des stockages prévus. Une trace distincte et minimisée de la demande, les bans globaux de sécurité actifs et une valeur de réputation existante différente du score par défaut sont conservés pour leurs finalités précises. La configuration et les droits acquis des communautés ne sont pas supprimés avec le compte personnel. Les copies déjà partagées sur Discord, les sauvegardes et les autres copies détenues séparément nécessitent un traitement distinct ; contactez-nous à leur sujet ou pour un accès, une rectification, une limitation ou une opposition.',
          'Aucun compte sur le tableau de bord n’est nécessaire pour nous contacter. Précisez l’identifiant Discord ou Steam concerné et la communauté si connue. Des éléments proportionnés peuvent être demandés pour vérifier votre identité si nécessaire, sans demander systématiquement une pièce d’identité.',
          'Nous devons répondre dans les meilleurs délais et normalement sous un mois à compter de la réception. Pour une demande complexe ou de nombreuses demandes, le RGPD autorise jusqu’à deux mois supplémentaires ; nous devons expliquer cette prolongation pendant le premier mois. Les demandes sont normalement gratuites ; tout refus ou frais doit respecter les conditions du RGPD et être motivé avec les voies de recours.',
          'Pour les traitements contrôlés par une communauté, son administrateur est aussi un interlocuteur. Nous devons identifier le responsable concerné ou l’assister selon le cas, sans faire de l’absence de compte sur le site un motif de refus de vos droits.',
        ],
        links: [
          { label: 'Compte — Gérer les données', href: '/account' },
          { label: 'gmod-integration@linv.dev', href: 'mailto:gmod-integration@linv.dev' },
        ],
      },
      {
        title: 'Fonctions automatisées et jeunes utilisateurs',
        paragraphs: [
          'La synchronisation des rôles et pseudonymes et les autres règles configurées peuvent modifier votre présentation ou vos accès. Interrogez l’administrateur sur les règles, données sources et conséquences, et contactez-nous pour les traitements du service hébergé. L’article 22 du RGPD vous donne le droit de ne pas faire l’objet d’une décision exclusivement automatisée produisant des effets juridiques ou comparables, sauf exception légale. Lorsqu’elles s’appliquent, les garanties incluent une intervention humaine, la possibilité d’exprimer votre point de vue et de contester la décision.',
          'L’accès doit respecter les conditions d’âge des plateformes et les autorisations parentales requises par la loi. Les administrateurs doivent porter une attention particulière aux données des enfants. Les droits s’appliquent aussi aux joueurs et membres qui ne peuvent pas créer de compte sur le tableau de bord.',
        ],
      },
      {
        title: 'Modification de cette notice',
        paragraphs: [
          'La date de mise à jour identifie cette version. Toute modification importante doit être portée à la connaissance des personnes concernées par une information adaptée avant de nouveaux traitements. Si une nouvelle finalité nécessite un consentement, il doit être recueilli séparément ; la poursuite de l’utilisation ne remplace pas ce consentement et ne supprime pas vos droits.',
        ],
        links: [{ label: 'Conditions d’utilisation', href: '/legal/terms' }],
      },
    ],
  },
}
