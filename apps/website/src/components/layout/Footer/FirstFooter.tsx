import { Component, For } from "solid-js";
import { A } from "@solidjs/router";
import { useI18n } from "../../../i18n";

interface footerLink {
  title: string;
  href: string;
}

interface footerCategory {
  title: string;
  links: footerLink[];
}

const FirstFooter: Component = () => {
  const { t } = useI18n();

  const footerLinks: footerCategory[] = [
    {
      title: t("main.services", "Services"),
      links: [
        {
          title: t("main.dashboard", "Dashboard"),
          href: "/dashboard",
        },
        {
          title: t("main.servers_ranking", "Servers Ranking"),
          href: "/servers",
        },
      ],
    },
    {
      title: t("main.resources", "Resources"),
      links: [
        {
          title: t("main.documentation", "Documentation"),
          href: "/docs",
        },
        {
          title: t("main.premium", "Premium"),
          href: "/premium",
        },
        {
          title: t("main.support", "Support"),
          href: "/support",
        },
      ],
    },
    {
      title: "Legal",
      links: [
        {
          title: t("main.terms", "Terms of Service"),
          href: "/legal/terms",
        },
        {
          title: t("main.privacy", "Privacy Policy"),
          href: "/legal/privacy",
        },
      ],
    },
  ];

  return (
    <footer class="footer md:footer-horizontal p-10 bg-base-100 text-base-content justify-around max-w-(--breakpoint-2xl) mx-auto">
      <For each={footerLinks}>
        {({ title, links }) => (
          <nav>
            <h6 class="footer-title opacity-100">{title}</h6>
            <For each={links}>
              {({ title, href }) => (
                <A class="link link-hover text-base-content/50" href={href}>
                  {title}
                </A>
              )}
            </For>
          </nav>
        )}
      </For>
    </footer>
  );
};

export default FirstFooter;
