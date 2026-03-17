import { Component, For, Show } from "solid-js";
import { useI18n } from "../i18n";

const Premium: Component = () => {
  const { t } = useI18n();

  type Feature = {
    name: string;
    free_value: boolean | string;
    premium_value: boolean | string;
    inDev?: boolean;
  };

  const features: Record<string, Feature> = {
    ["sync_chat"]: {
      ["name"]: t("premium.sync_chat", "Sync Chat"),
      ["free_value"]: true,
      ["premium_value"]: true,
    },
    ["sync_chat_customisation"]: {
      ["name"]: t("premium.sync_chat_customisation", "Sync Chat - Customisation"),
      ["free_value"]: false,
      ["premium_value"]: true,
    },
    ["server_status"]: {
      ["name"]: t("premium.server_status", "Server Status"),
      ["free_value"]: true,
      ["premium_value"]: true,
    },
    ["server_status_buttons_limit"]: {
      ["name"]: t("premium.server_status_buttons_limit", "Server Status - Buttons Limit"),
      ["free_value"]: "2 buttons",
      ["premium_value"]: "25 buttons",
    },
    ["sync_player_name"]: {
      ["name"]: t("premium.sync_player_name", "Sync Player Name"),
      ["free_value"]: true,
      ["premium_value"]: true,
    },
    ["sync_player_name_customisation"]: {
      ["name"]: t("premium.sync_player_name_customisation", "Sync Player Name - Customisation"),
      ["free_value"]: false,
      ["premium_value"]: true,
    },
    ["player_stats"]: {
      ["name"]: t("premium.player_stats", "Player Stats"),
      ["free_value"]: true,
      ["premium_value"]: true,
    },
    ["player_stats_custom"]: {
      ["name"]: t("premium.player_stats_custom", "Player Stats - Custom Stats"),
      ["free_value"]: false,
      ["premium_value"]: true,
    },
    ["screenshots"]: {
      ["name"]: t("premium.screenshots", "Player Screenshots"),
      ["free_value"]: true,
      ["premium_value"]: true,
    },
    ["ig_report_bug"]: {
      ["name"]: t("premium.ig_report_bug", "In-Game Report Bug"),
      ["free_value"]: true,
      ["premium_value"]: true,
    },
    ["team_vocal"]: {
      ["name"]: t("premium.team_vocal", "Team Vocal"),
      ["free_value"]: false,
      ["premium_value"]: true,
      ["inDev"]: true,
    },
    ["server_status_alert"]: {
      ["name"]: t("premium.server_status_alert", "Server Status - Alert"),
      ["free_value"]: "Default Message",
      ["premium_value"]: "Custom Message",
      ["inDev"]: true,
    },
    ["guild_link"]: {
      ["name"]: t("premium.guild_link", "Guild Links"),
      ["free_value"]: "2 links",
      ["premium_value"]: true,
    },
    ["logs_relay"]: {
      ["name"]: t("premium.logs_relay", "Server Logs Relay"),
      ["free_value"]: true,
      ["premium_value"]: true,
    },
    ["logs"]: {
      ["name"]: t("premium.logs", "WebPanel Logs"),
      ["free_value"]: t("premium.guild_hours", "{1} hours", 24),
      ["premium_value"]: t("premium.infinite", "infinite"),
    },
    ["players"]: {
      ["name"]: t("premium.players", "Players Database"),
      ["free_value"]: true,
      ["premium_value"]: true,
    },
    ["user_profiles"]: {
      ["name"]: t("premium.user_profiles", "User Profiles"),
      ["free_value"]: true,
      ["premium_value"]: true,
    },
    ["user_stats"]: {
      ["name"]: t("premium.user_stats", "Player Stats"),
      ["free_value"]: true,
      ["premium_value"]: true,
    },
    ["user_stats_custom_value"]: {
      ["name"]: t("premium.user_stats_custom_value", "Player Stats - Custom Value"),
      ["free_value"]: false,
      ["premium_value"]: true,
    },
    ["leaderboards"]: {
      ["name"]: t("premium.leaderboards", "Player Leaderboards"),
      ["free_value"]: true,
      ["premium_value"]: true,
    },
    ["servers"]: {
      ["name"]: t("premium.servers", "Servers"),
      ["free_value"]: t("premium.guild_server", "{1} server", 1),
      ["premium_value"]: t("premium.infinite", "infinite"),
    },
    ["sync_bans"]: {
      ["name"]: t("premium.sync_bans", "Sync Bans"),
      ["free_value"]: true,
      ["premium_value"]: true,
    },
    ["sync_roles"]: {
      ["name"]: t("premium.sync_roles", "Sync Role"),
      ["free_value"]: true,
      ["premium_value"]: true,
    },
    ["sync_roles_limit"]: {
      ["name"]: t("premium.sync_roles_limit", "Sync Role - Limit"),
      ["free_value"]: t("premium.guild_roles", "{1} roles", 4),
      ["premium_value"]: t("premium.infinite", "infinite"),
    },
    ["sync_kicks"]: {
      ["name"]: t("premium.sync_kicks", "Sync Kicks"),
      ["free_value"]: false,
      ["premium_value"]: true,
      ["inDev"]: true,
    },
    ["sync_warns"]: {
      ["name"]: t("premium.sync_warns", "Sync Warns"),
      ["free_value"]: true,
      ["premium_value"]: true,
    },
    ["sync_team"]: {
      ["name"]: t("premium.sync_team", "Sync Teams Roles"),
      ["free_value"]: false,
      ["premium_value"]: true,
    },
    ["guild_tickets"]: {
      ["name"]: t("premium.guild_tickets", "Guild Tickets"),
      ["free_value"]: true,
      ["premium_value"]: true,
      ["inDev"]: true,
    },
    ["guild_suggestions"]: {
      ["name"]: t("premium.guild_suggestions", "Guild Suggestions"),
      ["free_value"]: true,
      ["premium_value"]: true,
      ["inDev"]: true,
    },
    ["guild_verification"]: {
      ["name"]: t("premium.guild_verification", "Guild Verification"),
      ["free_value"]: t("premium.guild_verification_free_value", "Default Message"),
      ["premium_value"]: t("premium.guild_verification_premium_value", "Custom Message"),
    },
    ["guild_verification_role_limit"]: {
      ["name"]: t("premium.guild_verification_role_limit", "Guild Verification - Role Limit"),
      ["free_value"]: t("premium.guild_roles", "{1} roles", 2),
      ["premium_value"]: t("premium.infinite", "infinite"),
    },
    ["force_ply_link"]: {
      ["name"]: t("premium.force_ply_link", "Force Player Link"),
      ["free_value"]: true,
      ["premium_value"]: true,
    },
    ["maintenance_white_list"]: {
      ["name"]: t("premium.maintenance_white_list", "Maintenance"),
      ["free_value"]: true,
      ["premium_value"]: true,
    },
    ["rcon"]: {
      ["name"]: t("premium.rcon", "RCON Execution"),
      ["free_value"]: false,
      ["premium_value"]: true,
    },
    ["reward"]: {
      ["name"]: t("premium.reward", "Reward"),
      ["free_value"]: false,
      ["premium_value"]: true,
      ["inDev"]: true,
    },
  };

  type Offer = {
    name: string;
    sub_price: string;
    description: string;
    promote_features: string[];
    button: string;
    link: string;
    price: number;
    reduction?: {
      percent: number;
      date: string;
    };
    permanent: boolean;
  };

  const offers: Record<string, Offer> = {
    ["free"]: {
      ["name"]: t("premium.free", "Free"),
      ["sub_price"]: t("premium.free_price", "free, nada, nothing, niente"),
      ["description"]: t("premium.free_description", "Get access to all the basic features"),
      ["promote_features"]: [
        t("premium.all_free_features", "All Free Features"),
        t("premium.basic_support", "Basic Support"),
      ],
      ["button"]: t("premium.setup_server", "Setup Server"),
      ["link"]: "/dashboard/guilds",
      ["price"]: 0,
      ["permanent"]: false,
    },
    ["subscribe"]: {
      ["name"]: t("premium.subscribe", "Subscribe"),
      ["sub_price"]: t("premium.subscribe_price", "guilds / month"),
      ["description"]: t("premium.subscribe_description", "Get access to all features and customisation"),
      ["promote_features"]: [
        t("premium.all_premium_features", "All Premium Features"),
        t("premium.premium_discord_role", "Premium Discord Role"),
        t("premium.priority_support", "Priority Support"),
      ],
      ["button"]: t("premium.subscribe_on_discord", "Subscribe on Discord"),
      ["link"]: "https://discord.com/application-directory/1110121451501129758/premium",
      ["price"]: 7.99,
      ["permanent"]: false,
    },
    ["buy"]: {
      ["name"]: t("premium.one_time", "One Time"),
      ["sub_price"]: t("premium.one_time_price", "guilds / lifetime"),
      ["description"]: t("premium.one_time_description", "Get access to all features and customisation"),
      ["promote_features"]: [
        t("premium.all_premium_features", "All Premium Features"),
        t("premium.custom_bot", "Custom Bot"),
        t("premium.premium_discord_role", "Premium Discord Role"),
        t("premium.priority_support", "Priority Support"),
        t("premium.lifetime_access", "Lifetime Access"),
      ],
      ["button"]: t("premium.buy_on_gmod_store", "Buy on Gmod Store"),
      ["link"]: "https://www.gmodstore.com/market/view/gmod-integration",
      ["price"]: 69.99,
      ["reduction"]: {
        ["percent"]: 15,
        ["date"]: "2024-09-22T23:59:59",
      },
      ["permanent"]: true,
    },
  };

  for (const key in offers) {
    if (offers[key].reduction && new Date(offers[key].reduction.date) < new Date()) {
      delete offers[key].reduction;
    }
  }

  type Category = {
    name: string;
    features: Feature[];
  };

  const category: Record<string, Category> = {
    ["server"]: {
      ["name"]: t("premium.server", "Server"),
      ["features"]: [
        features["servers"],
        features["server_status"],
        features["server_status_buttons_limit"],
        features["server_status_alert"],
        features["logs"],
        features["logs_relay"],
        features["players"],
        features["reward"],
      ],
    },
    ["utility"]: {
      ["name"]: t("premium.utility", "Utility"),
      ["features"]: [
        features["guild_link"],
        features["screenshots"],
        features["guild_tickets"],
        features["guild_suggestions"],
        features["ig_report_bug"],
        features["team_vocal"],
        features["maintenance_white_list"],
        features["rcon"],
      ],
    },
    ["data"]: {
      ["name"]: t("premium.data_statistics", "Data & Statistics"),
      ["features"]: [
        features["user_profiles"],
        features["user_stats"],
        features["user_stats_custom_value"],
        features["leaderboards"],
      ],
    },
    ["security"]: {
      ["name"]: t("premium.security", "Security"),
      ["features"]: [
        features["guild_verification"],
        features["guild_verification_role_limit"],
        features["force_ply_link"],
        features["sync_bans"],
        features["sync_kicks"],
        features["sync_warns"],
      ],
    },
    ["synchronization"]: {
      ["name"]: t("premium.synchronization", "Synchronization"),
      ["features"]: [
        features["sync_chat"],
        features["sync_chat_customisation"],
        features["sync_player_name"],
        features["sync_player_name_customisation"],
        features["sync_roles"],
        features["sync_roles_limit"],
        features["sync_team"],
      ],
    },
  };

  const faq: { question: string; answer: string }[] = [
    {
      question: t("premium.faq_question_1", "What are the differences between the free and the premium version ?"),
      answer: t(
        "premium.faq_answer_1",
        "Gmod Integration Premium offers more features and customisation and is a way to support the project. You can see the full list of features in the plans comparison table above.",
      ),
    },
    {
      question: t("premium.faq_question_2", "What is a server and what is a guilds ?"),
      answer: t(
        "premium.faq_answer_2",
        "The terms server refers to a Garry's Mod server and guilds refers to a Discord guilds (aka discord server).",
      ),
    },
    {
      question: t(
        "premium.faq_question_3",
        "What will happen if I lose my premium subscription or if I don't renew it ?",
      ),
      answer: t(
        "premium.faq_answer_3",
        "You will lose access to the premium features and customisation. You won't lose your data but can't access it anymore.",
      ),
    },
    {
      question: t("premium.faq_question_4", "Can I get a refund or cancel my subscription ?"),
      answer: t(
        "premium.faq_answer_4",
        "We do not process payments ourselves. We use Discord and GmodStore for payment processing. As such, we redirect you to their respective refund policies for any inquiries regarding refunds or cancellations.",
      ),
    },
    {
      question: t("premium.faq_question_5", "Who can buy the premium version ?"),
      answer: t(
        "premium.faq_answer_5",
        "Anyone can buy the monthly version for your guilds directly on Discord. The lifetime version is only available on Gmod Store and can be bought only once per guilds and only by a guilds Administrator.",
      ),
    },
    {
      question: t("premium.faq_question_6", "How many premium can I buy ?"),
      answer: t(
        "premium.faq_answer_6",
        "You can buy only one lifetime version, but you can buy multiple monthly versions for different guilds.",
      ),
    },
    {
      question: t("premium.faq_question_7", "Can I transfer my premium version to another guilds ?"),
      answer: t(
        "premium.faq_answer_7",
        "Only the lifetime version is transferable to another guilds, you need to be Administrator of both guilds.",
      ),
    },
    {
      question: t("premium.faq_question_8", "Why so many features are in development ?"),
      answer: t(
        "premium.faq_answer_8",
        "Because I'm a solo developer the project is pretty new and big, so I need time to develop all the features. But I'm working hard to make them available as soon as possible.",
      ),
    },
  ];

  return (
    <>
      <div class="max-w-(--breakpoint-xl) mx-auto flex flex-col p-6 gap-16">
        <div class="flex flex-col items-center justify-center gap-6 mt-12">
          <h1 class="text-5xl font-bold">{t("premium.title", "Premium")}</h1>
          <p class="text-lg">
            {t("premium.subtitle", "Upgrade your community to the next level with customisation and more features")}
          </p>
        </div>

        <div class="flex flex-wrap justify-around gap-6 py-6">
          <For each={Object.keys(offers)}>
            {(key) => (
              <a
                class="shadowHover w-85 border border-base-200 rounded-lg p-6 gap-6 flex flex-col"
                href={offers[key].link}
              >
                <h2 class="text-2xl font-bold">{offers[key].name}</h2>
                <div class="gap-2 flex flex-col">
                  <h1 class="text-5xl font-bold">
                    <Show when={offers[key].reduction} fallback={<span>${offers[key].price}</span>}>
                      <span>
                        $
                        {(
                          offers[key].price -
                          (offers[key].price * ((offers[key].reduction && offers[key].reduction.percent) || 1)) / 100
                        ).toFixed(2)}
                      </span>
                      <br />
                      <span class="text-3xl line-through text-rose-500">${offers[key].price}</span>
                    </Show>
                  </h1>
                  <h3 class="text-base-content">{offers[key].sub_price}</h3>
                  <Show when={offers[key].reduction}>
                    <span class="text-amber-400">
                      {(offers[key].reduction && offers[key].reduction.percent) || 0}% off until{" "}
                      {new Date(
                        (offers[key].reduction && offers[key].reduction.date) || new Date(),
                      ).toLocaleDateString()}
                    </span>
                  </Show>
                </div>
                <ul class="flex flex-col gap-5">
                  <For each={offers[key].promote_features}>
                    {(feature) => (
                      <li class="flex gap-4 items-center">
                        <i class="fa-solid fa-check text-[24px] text-success font-bold"></i>
                        <p>{feature}</p>
                      </li>
                    )}
                  </For>
                </ul>
                <div />
                <div class="btn btn-base-200 w-full mt-auto">{offers[key].button}</div>
              </a>
            )}
          </For>
        </div>

        <div class="p-6">
          <h1 class="text-4xl font-bold text-center mb-12">{t("premium.plans_comparison", "Plans Comparison")}</h1>
          <div class="flex flex-col gap-12">
            <For each={Object.keys(category)}>
              {(key) => (
                <div class="w-full border-radius">
                  <table class="table border border-base-200 rounded-lg border-separate noBorderBottomTable">
                    <thead>
                      <tr class="text-lg">
                        <th class="w-1/3">{category[key].name}</th>
                        <th class="w-1/4 text-center">{t("premium.free", "Free")}</th>
                        <th class="w-1/4 text-center">{t("premium.premium", "Premium")}</th>
                      </tr>
                    </thead>
                    <tbody class="text-[1.1em]">
                      <For each={category[key].features}>
                        {(feature) => (
                          <tr>
                            <td class="text-left">
                              <Show when={feature.inDev}>
                                <div
                                  class="tooltip tooltip-warning z-10"
                                  data-tip={t(
                                    "premium.in_dev_tooltip",
                                    "This feature is still in development and not available.",
                                  )}
                                >
                                  {feature.name}
                                  <i class="fa-solid fa-triangle-exclamation text-warning text-lg ml-2"></i>
                                </div>
                              </Show>
                              <Show when={!feature.inDev}>{feature.name}</Show>
                            </td>
                            <td class="min-w-1/4 text-center">
                              {feature.free_value === true ? (
                                <i class="fa-solid fa-check text-success text-[1.4em]"></i>
                              ) : feature.free_value === false ? (
                                <i class="fa-solid fa-times text-error text-[1.4em]"></i>
                              ) : feature.free_value === t("premium.infinite", "infinite") ? (
                                <i class="fa-solid fa-infinity text-primary text-[1.4em]"></i>
                              ) : (
                                feature.free_value
                              )}
                            </td>
                            <td class="w-1/4 text-center">
                              {feature.premium_value === true ? (
                                <i class="fa-solid fa-check text-success text-[1.4em]"></i>
                              ) : feature.premium_value === false ? (
                                <i class="fa-solid fa-times text-error text-[1.4em]"></i>
                              ) : feature.premium_value === t("premium.infinite", "infinite") ? (
                                <i class="fa-solid fa-infinity text-primary text-[1.4em]"></i>
                              ) : (
                                feature.premium_value
                              )}
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              )}
            </For>
          </div>
        </div>

        <div class="p-6">
          <h1 class="text-4xl font-bold text-center mb-12">{t("premium.faq_title", "Frequently Asked Questions")}</h1>
          <div class="join join-vertical w-full">
            <For each={faq}>
              {({ question, answer }) => (
                <div class="collapse collapse-arrow join-item border border-base-200 max-w-5xl">
                  <input type="radio" name="my-accordion-4" />
                  <div class="collapse-title font-medium">{question}</div>
                  <div class="collapse-content text-base-content">
                    <p>{answer}</p>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </>
  );
};

export default Premium;
