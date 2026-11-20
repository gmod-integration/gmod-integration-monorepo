import type { LegalDocumentContent } from './LegalDocument.js'

export const termsContent: Record<'en' | 'fr', LegalDocumentContent> = {
  en: {
    title: 'Terms of Service',
    updatedLabel: 'Last updated',
    updatedDate: '20 November 2026',
    sections: [
      {
        title: 'Service and contact',
        paragraphs: [
          "These terms govern the Gmod Integration website, dashboard, API and bot services connecting Discord communities with Garry's Mod servers. Please read them before activating the integration. Feature availability depends on your configuration and, where applicable, your plan.",
          'Gmod Integration is the name of the service. Contact us using the address below for questions, complaints or assistance.',
        ],
        links: [{ label: 'gmod-integration@linv.dev', href: 'mailto:gmod-integration@linv.dev' }],
      },
      {
        title: 'Eligibility and account security',
        paragraphs: [
          'You must meet the minimum age requirements of the platforms you use and have the legal capacity or authorisation required to use the service and make purchases. You must be authorised to manage each community or game server you connect.',
          'Keep access tokens, bot credentials and server keys confidential. Use the account page to review and revoke sessions, and tell us promptly about suspected unauthorised access. Do not share another person’s credentials.',
        ],
        links: [{ label: 'Account and sessions', href: '/account' }],
      },
      {
        title: 'Acceptable use',
        paragraphs: [
          'Use the service lawfully and respect the rights of players, community members and third parties, as well as the applicable Discord, Steam and GmodStore rules. Do not use it for harassment, spam, unlawful surveillance, unauthorised data collection or disclosure, or prohibited profiling.',
          'Do not bypass permissions or service limits, interfere with other users, distribute malicious code or attempt unauthorised access. Report vulnerabilities privately to our contact address.',
        ],
      },
      {
        title: 'Community and server administrators',
        paragraphs: [
          'Administrators choose the enabled features, the information sent by their servers and the Discord channels or dashboard roles that can access it. Configure permissions carefully, limit collection to what is needed, and check who can receive messages, logs and screenshots.',
          'Inform your members and players before collecting or relaying their data, including people who have no Gmod Integration account. Explain your purposes, legal basis, recipients and retention, make the privacy policy available, and support requests concerning your community’s data.',
          'Your role as a controller and any processing performed on your instructions must be assessed for each activity. Where a controller–processor relationship exists, the agreement and safeguards required by data protection law must be in place; these terms do not replace that agreement.',
        ],
      },
      {
        title: 'Personal data',
        paragraphs: [
          'The privacy policy explains the data handled by the service, its sources and purposes, recipients, retention and the ways to exercise your rights. It is an information notice: reading it or continuing to use the service does not constitute consent to optional processing.',
          'You can request a data export from your account. Contact us for access, correction, deletion, objections or requests that the dashboard does not cover, including requests from players without an account.',
        ],
        links: [{ label: 'Privacy Policy', href: '/legal/privacy' }],
      },
      {
        title: 'Paid features, cancellation and refunds',
        paragraphs: [
          'Purchases and payments for paid features take place through Discord or GmodStore. This website does not sell or collect payments directly. Check the seller identified at checkout and on your invoice, the price, duration, renewal conditions, included features and cancellation procedure before ordering. The applicable sale conditions supplement these terms.',
          'Use the platform’s purchase and subscription controls to manage renewal or request help with billing. Contact us if a purchased Gmod Integration feature is unavailable or does not conform to what was agreed. A third-party payment flow does not remove the obligations of the actual seller or your mandatory consumer rights.',
          'Where consumer law applies, statutory guarantees for digital content and services and applicable refund or termination rights remain available. A statutory 14-day withdrawal period applies where provided by law. Merely starting access to an ongoing digital service does not automatically remove that right. Exceptions differ for fully performed services and immediately supplied digital content; they apply only when all legal conditions are met, including any required express consent and acknowledgement. Platform policies cannot override those rights.',
        ],
      },
      {
        title: 'Content, software and third-party platforms',
        paragraphs: [
          'You retain your rights in the content you submit. Only submit content and personal data you are entitled to process and transmit. The service processes and relays that content for the features you configure.',
          'Use of the hosted service does not transfer ownership of its software, branding or third-party materials. Software distributed separately remains subject to its own licence. Discord, Steam, Garry’s Mod and GmodStore names and marks belong to their respective owners; references to them do not imply affiliation or endorsement.',
          'These platforms operate under their own terms and privacy policies. Their changes or outages can affect the integration.',
        ],
      },
      {
        title: 'Availability, changes and maintenance',
        paragraphs: [
          'The service may be interrupted for maintenance, incidents or changes to external platforms. We cannot promise uninterrupted operation. Keep appropriate backups of your server configuration and content.',
          'We may evolve features for technical, security or legal reasons. Material changes affecting an ongoing paid service must respect the applicable contract and consumer rules, including information, notice and termination rights where required.',
        ],
      },
      {
        title: 'Suspension and ending use',
        paragraphs: [
          'Access may be restricted or suspended for a breach of these terms, a security risk, unlawful activity or a legal obligation. Measures should be proportionate to the issue. We will explain the reason and, where appropriate, allow time to remedy it, unless urgent action or a legal restriction prevents this.',
          'You may stop using the service, revoke sessions and remove the bot or integration. Removing the bot does not by itself cancel a third-party subscription or erase existing records; manage subscriptions through the purchase platform and contact us about deletion. Termination does not remove accrued rights or any mandatory refund rights.',
        ],
      },
      {
        title: 'Responsibility',
        paragraphs: [
          'Each party’s responsibility is determined under applicable law, taking account of its conduct, the damage and the causal connection. Administrators remain responsible for their configuration and the instructions they give the service.',
          'Nothing in these terms excludes liability that cannot lawfully be excluded, excuses our own failures contrary to mandatory law, or removes consumer guarantees, remedies or compensation rights. The service is not a substitute for your server’s security controls or backups.',
        ],
      },
      {
        title: 'Complaints, applicable law and disputes',
        paragraphs: [
          'Send a written complaint to our contact address with enough information for us to investigate. You retain the right to use the competent courts and, where the consumer mediation rules apply, to seek free mediation after first attempting to resolve the complaint directly.',
          'French law governs these terms, without depriving consumers of mandatory protections in their country of habitual residence where applicable. These terms do not impose exclusive French jurisdiction or prevent a consumer from bringing proceedings before a court available under mandatory rules, including a competent court where they live.',
        ],
      },
      {
        title: 'Updates to these terms',
        paragraphs: [
          'The date above identifies this version. We will give advance notice of material changes by an appropriate channel, such as the dashboard or a service notification, stating their effect and effective date; urgent legal or security changes may require shorter notice.',
          'Changes do not apply retroactively or remove existing statutory rights. Where agreement is legally required, we must obtain it. Where the law provides a right to reject a change or end an ongoing service without charge, that right remains available.',
        ],
      },
    ],
  },
  fr: {
    title: 'Conditions d’utilisation',
    updatedLabel: 'Dernière mise à jour',
    updatedDate: '20 novembre 2026',
    sections: [
      {
        title: 'Service et contact',
        paragraphs: [
          'Ces conditions encadrent le site, le tableau de bord, l’API et les services de bot Gmod Integration reliant des communautés Discord à des serveurs Garry’s Mod. Consultez-les avant d’activer l’intégration. Les fonctionnalités disponibles dépendent de votre configuration et, le cas échéant, de votre offre.',
          'Gmod Integration est le nom du service. Pour toute question, réclamation ou demande d’assistance, utilisez l’adresse ci-dessous.',
        ],
        links: [{ label: 'gmod-integration@linv.dev', href: 'mailto:gmod-integration@linv.dev' }],
      },
      {
        title: 'Conditions d’accès et sécurité du compte',
        paragraphs: [
          'Vous devez respecter l’âge minimum des plateformes utilisées et disposer de la capacité juridique ou de l’autorisation nécessaire pour utiliser le service et effectuer des achats. Vous devez être autorisé à gérer chaque communauté ou serveur de jeu connecté.',
          'Gardez confidentiels les jetons d’accès, identifiants de bot et clés de serveur. Consultez et révoquez vos sessions depuis votre compte et signalez-nous rapidement tout accès non autorisé suspecté. N’utilisez pas les identifiants d’une autre personne sans autorisation.',
        ],
        links: [{ label: 'Compte et sessions', href: '/account' }],
      },
      {
        title: 'Utilisation autorisée',
        paragraphs: [
          'Utilisez le service légalement, en respectant les droits des joueurs, des membres et des tiers, ainsi que les règles applicables de Discord, Steam et GmodStore. Le harcèlement, le spam, la surveillance illégale, la collecte ou la divulgation non autorisée de données et le profilage interdit sont proscrits.',
          'Ne contournez pas les permissions ou les limites du service, ne perturbez pas les autres utilisateurs, ne diffusez pas de code malveillant et ne tentez pas d’accès non autorisé. Signalez les vulnérabilités en privé à notre adresse de contact.',
        ],
      },
      {
        title: 'Administrateurs de communautés et de serveurs',
        paragraphs: [
          'Les administrateurs choisissent les fonctionnalités actives, les informations envoyées par leurs serveurs et les salons Discord ou rôles du tableau de bord qui y accèdent. Configurez les permissions avec soin, limitez la collecte aux besoins réels et vérifiez les destinataires des messages, journaux et captures d’écran.',
          'Informez vos membres et joueurs avant de collecter ou de relayer leurs données, y compris les personnes sans compte Gmod Integration. Expliquez vos finalités, votre base légale, les destinataires et la conservation, rendez accessible la politique de confidentialité et facilitez les demandes concernant les données de votre communauté.',
          'Votre rôle de responsable du traitement et les traitements effectués sur vos instructions doivent être examinés pour chaque activité. Lorsqu’une relation de sous-traitance existe, l’accord et les garanties exigés par le droit des données personnelles doivent être en place ; ces conditions ne remplacent pas cet accord.',
        ],
      },
      {
        title: 'Données personnelles',
        paragraphs: [
          'La politique de confidentialité décrit les données traitées, leurs sources et finalités, les destinataires, leur conservation et les moyens d’exercer vos droits. Il s’agit d’une notice d’information : sa lecture ou la poursuite de l’utilisation du service ne constitue pas un consentement aux traitements facultatifs.',
          'Vous pouvez demander un export depuis votre compte. Contactez-nous pour l’accès, la rectification, l’effacement, l’opposition ou les demandes que le tableau de bord ne couvre pas, notamment celles de joueurs sans compte.',
        ],
        links: [{ label: 'Politique de confidentialité', href: '/legal/privacy' }],
      },
      {
        title: 'Offres payantes, résiliation et remboursements',
        paragraphs: [
          'Les achats et paiements des fonctionnalités payantes s’effectuent via Discord ou GmodStore. Ce site ne vend ni n’encaisse directement. Avant de commander, vérifiez le vendeur indiqué au paiement et sur votre facture, le prix, la durée, les conditions de renouvellement, les fonctionnalités incluses et la procédure de résiliation. Les conditions de vente applicables complètent les présentes conditions.',
          'Utilisez les outils de la plateforme d’achat pour gérer le renouvellement ou demander une assistance de facturation. Contactez-nous si une fonctionnalité Gmod Integration achetée est indisponible ou non conforme à ce qui était convenu. Le recours à une plateforme de paiement ne supprime ni les obligations du vendeur réel ni vos droits impératifs de consommateur.',
          'Lorsque le droit de la consommation s’applique, les garanties légales relatives aux contenus et services numériques et les droits au remboursement ou à la résolution restent applicables. Le délai légal de rétractation de 14 jours s’applique dans les cas prévus par la loi. Le simple début d’accès à un service numérique continu ne supprime pas automatiquement ce droit. Les exceptions diffèrent pour les services pleinement exécutés et les contenus numériques fournis immédiatement ; elles exigent toutes les conditions légales, notamment le consentement exprès et la reconnaissance requis. Les politiques des plateformes ne peuvent écarter ces droits.',
        ],
      },
      {
        title: 'Contenus, logiciels et plateformes tierces',
        paragraphs: [
          'Vous conservez vos droits sur vos contenus. Ne transmettez que des contenus et données personnelles que vous êtes autorisé à traiter et communiquer. Le service les traite et les relaie pour les fonctionnalités que vous configurez.',
          'L’utilisation du service hébergé ne transfère aucun droit de propriété sur ses logiciels, sa marque ou les éléments de tiers. Les logiciels distribués séparément restent soumis à leur propre licence. Les noms et marques Discord, Steam, Garry’s Mod et GmodStore appartiennent à leurs titulaires ; leur mention n’implique aucune affiliation ni approbation.',
          'Ces plateformes appliquent leurs propres conditions et politiques de confidentialité. Leurs modifications ou interruptions peuvent affecter l’intégration.',
        ],
      },
      {
        title: 'Disponibilité, évolutions et maintenance',
        paragraphs: [
          'Le service peut être interrompu pour maintenance, incident ou modification de plateformes externes. Nous ne pouvons garantir un fonctionnement ininterrompu. Conservez des sauvegardes adaptées de la configuration et des contenus de vos serveurs.',
          'Nous pouvons faire évoluer les fonctionnalités pour des raisons techniques, de sécurité ou légales. Une modification substantielle d’un service payant en cours doit respecter le contrat et les règles de consommation applicables, notamment les obligations d’information, de préavis et les droits à résiliation lorsqu’ils sont prévus.',
        ],
      },
      {
        title: 'Suspension et fin d’utilisation',
        paragraphs: [
          'L’accès peut être limité ou suspendu en cas de violation de ces conditions, de risque de sécurité, d’activité illégale ou d’obligation légale. Les mesures doivent être proportionnées au problème. Nous en expliquons le motif et permettons, lorsque cela est approprié, d’y remédier, sauf urgence ou restriction légale.',
          'Vous pouvez cesser d’utiliser le service, révoquer vos sessions et retirer le bot ou l’intégration. Le retrait du bot ne résilie pas à lui seul un abonnement tiers et n’efface pas les données existantes : gérez vos abonnements sur la plateforme d’achat et contactez-nous pour l’effacement. La fin du service ne supprime pas les droits acquis ni les droits impératifs au remboursement.',
        ],
      },
      {
        title: 'Responsabilité',
        paragraphs: [
          'La responsabilité de chacun s’apprécie selon les règles applicables, compte tenu de son comportement, du dommage et du lien de causalité. Les administrateurs restent responsables de leur configuration et des instructions qu’ils donnent au service.',
          'Ces conditions n’excluent aucune responsabilité qui ne peut légalement être exclue, ne nous exonèrent pas de nos propres manquements en violation du droit impératif et ne suppriment aucune garantie, aucun recours ni droit à réparation des consommateurs. Le service ne remplace pas les mesures de sécurité et les sauvegardes de vos serveurs.',
        ],
      },
      {
        title: 'Réclamations, droit applicable et litiges',
        paragraphs: [
          'Adressez une réclamation écrite à notre adresse de contact, avec les informations nécessaires à son examen. Vous conservez le droit de saisir les juridictions compétentes et, lorsque les règles de médiation de la consommation s’appliquent, de recourir gratuitement à la médiation après une tentative préalable de règlement direct.',
          'Le droit français s’applique à ces conditions sans priver les consommateurs des protections impératives de leur pays de résidence habituelle lorsqu’elles sont applicables. Aucune compétence exclusive des juridictions françaises n’est imposée : le consommateur peut saisir les tribunaux prévus par les règles impératives, notamment une juridiction compétente de son lieu de résidence.',
        ],
      },
      {
        title: 'Mise à jour des conditions',
        paragraphs: [
          'La date en tête de page identifie cette version. Les modifications importantes font l’objet d’une information préalable par un moyen adapté, par exemple le tableau de bord ou une notification du service, précisant leur effet et leur date d’application ; une urgence légale ou de sécurité peut imposer un délai plus court.',
          'Les modifications ne sont pas rétroactives et ne suppriment pas les droits légaux acquis. Lorsqu’un accord est légalement requis, il doit être recueilli. Si la loi prévoit un droit de refuser une modification ou de résilier sans frais un service en cours, ce droit demeure applicable.',
        ],
      },
    ],
  },
}
