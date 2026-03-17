import { Component, createResource, For } from "solid-js";
import servers_status from "../assets/features/servers_status.png";
import profile from "../assets/features/profile.png";
import links from "../assets/features/links.png";
import verification from "../assets/features/verification.png";
import statistic from "../assets/features/statistic.png";
import logs from "../assets/features/logs.png";
import wallpaper from "../assets/wallpaper.png";
import players from "../assets/features/players.png";
import rcon from "../assets/features/rcon.png";
import chat from "../assets/features/chat.png";
import { useI18n } from "../i18n";
import { API_FQDN } from "../utils/api";

const fetchStats = async () => {
  const res = await fetch(`${API_FQDN}/stats`);
  return res.json();
};

const Home: Component = () => {
  const [stat] = createResource("mainStats", fetchStats);
  const { t } = useI18n();

  type Feature = {
    title: string;
    description: string;
    img: string;
  };

  const showFeatures: Feature[] = [
    {
      title: t("home.features.server_status.title", "Server Status"),
      description: t(
        "home.features.server_status.description",
        "Show the actual status of your server, if it's online or offline, how many players are on, the actual map and the game mode, since when the server is online ect... Server status is updated every 2 minutes, by default only one button (connect) is shown if the server is online, but you can add more buttons like 'Shop' or 'Workshop' in the dashboard.",
      ),
      img: servers_status,
    },
    {
      title: t("home.features.user_profile.title", "User Profile"),
      description: t(
        "home.features.user_profile.description",
        "Show the profile of a user, it shows their name, bot rank, trust factor, last verification date, discord id and steam id. You can easily interact with the user profile by clicking on the buttons, 'Steam Profile' ect...",
      ),
      img: profile,
    },
    {
      title: t("home.features.chat_bridge.title", "Chat Bridge"),
      description: t(
        "home.features.chat_bridge.description",
        "The bot can bridge the chat between your server and your discord guilds, so your users can talk to each other without being on the same platform. You can choose the channels that you want to bridge, the direction of the bridge (from discord to server, from server to discord or both) and apply custom rules like skipping commands, anonymizing /ano, skip message for specific users groups ect...",
      ),
      img: chat,
    },
    {
      title: t("home.features.discord_rcon.title", "Discord Rcon"),
      description: t(
        "home.features.discord_rcon.description",
        "Don't have access to your server console? No problem, you can use the bot to run commands on your server from your discord guilds. Only discord Admins with superadmin rank can use this feature.",
      ),
      img: rcon,
    },
    {
      title: t("home.features.custom_link.title", "Custom Link"),
      description: t(
        "home.features.custom_link.description",
        "You can create a custom link for your discord guilds, it's a good way to share community link, like your website, your steam group, your workshop ect... Use this links to simplify the access to your community resources.",
      ),
      img: links,
    },
    {
      title: t("home.features.user_verification.title", "User Verification"),
      description: t(
        "home.features.user_verification.description",
        "Actually the most important feature of the bot, it allows you to force your users to verify their Discord account with their Steam account, it's a good way to prevent trolls, bots and ban evaders from joining your server. Also, it allows us to sync your users with your server, so you can use other synchronized feature like user information (name, stats, rank, warn, ban ect...).",
      ),
      img: verification,
    },
    {
      title: t("home.features.statistics.title", "Statistics"),
      description: t(
        "home.features.statistics.description",
        "The bot can collect some statistics about your server, like the number of players, the number of bans, the number of warns ect... You can see the statistics in the dashboard, and you can also enable the statistics channel, so the bot will send a message in a channel when a user get banned ect...",
      ),
      img: statistic,
    },
    {
      title: t("home.features.logs.title", "Logs"),
      description: t(
        "home.features.logs.description",
        "The bot can log some actions of your users, like when they join or leave your server, when they get banned or kicked, when they get warned ect... You can see the logs in the dashboard, and you can also enable the logs channel, so the bot will send a message in a channel when a user get banned ect...",
      ),
      img: logs,
    },
    {
      title: t("home.features.player_database.title", "Player Database"),
      description: t(
        "home.features.player_database.description",
        "View all the players that have joined your server, you can see their name, steam id, discord id, join date, last join date, total time spent on your server, total warns, total bans ect... You can also search for a player by name, steam id or discord id.",
      ),
      img: players,
    },
  ];

  return (
    <>
      <div class="hero relative min-h-175 flex items-center justify-center overflow-hidden">
        <div
          class="absolute inset-0 bg-cover bg-center min-w-480 w-full max-w-640 h-175 object-cover object-bottom blur-[5px] opacity-60"
          style={`background-image: url(${wallpaper}); background-position: center; left: 50%; transform: translateX(-50%);`}
        ></div>

        <div class="relative z-10">
          <div class="hero-content text-center">
            <div>
              <h1 class="mb-5 text-6xl font-bold whitespace-nowrap">Gmod Integration</h1>
              <p class="mb-5 text-lg">
                {t("home.hero.title", "Improve your discord server with the most Advanced Garry's Mod bot")}
              </p>
              <a href="/dashboard/guilds" class="btn btn-wide">
                {t("home.hero.button", "Go to Dashboard")}
              </a>
            </div>
          </div>
        </div>
      </div>

      <hr class="border border-base-200 w-full" />

      <div class="flex flex-wrap items-center justify-center gap-16 w-full h-20">
        <h2 class="text-2xl font-bold text-center text-secondary">
          +{!stat.loading ? stat().guild.toLocaleString() : 0} {t("main.guilds", "Guilds")}
        </h2>
        <h2 class="text-2xl font-bold text-center text-secondary">
          +{!stat.loading ? stat().server.toLocaleString() : 0} {t("main.servers", "Servers")}
        </h2>
        <h2 class="text-2xl font-bold text-center text-secondary">
          +{!stat.loading ? stat().user.toLocaleString() : 0} {t("main.users", "Users")}
        </h2>
        <h2 class="text-2xl font-bold text-center text-secondary">
          +{!stat.loading ? stat().verifyUser.toLocaleString() : 0} {t("main.verified_users", "Verified Users")}
        </h2>
      </div>

      <hr class="border border-base-200 w-full" />

      <div class="container mx-auto">
        <For each={showFeatures}>
          {({ title, description, img }, index) => (
            <div
              class={`flex flex-row ${
                index() % 2 === 0 ? "md:flex-row-reverse" : "md:flex-row"
              } items-center justify-around gap-8 pt-32 pb-32`}
            >
              <img src={img} alt={title} class="rounded-lg max-w-150 max-h-150 border-2 border-base-200 shrink-0" />
              <div class="flex flex-col justify-center max-w-lg shrink-0">
                <h2 class="text-3xl font-bold mb-4 text-secondary">{title}</h2>
                <p class="mb-4">{description}</p>
              </div>
            </div>
          )}
        </For>
      </div>
    </>
  );
};

export default Home;
