import { Component } from "solid-js";
import AdminPanel from "../../../../../components/AdminPanel";
import { useI18n } from "../../../../../i18n";
import { linkBadge } from "../../../../../components/layout/menu/DashboardMenu";

const ServerStatusCustom: Component = () => {
  const { t } = useI18n();

  return (
    <>
      <AdminPanel
        title={t("dashboard.server.status_player_custom.title", "Player Custom")}
        description={t(
          "dashboard.server.status_player_custom.description",
          "Add {custom} rules to the player list to show custom information like :emoji: ect.",
        )}
        premium={true}
        badge={linkBadge.NEW}
      >
      </AdminPanel>
    </>
  );
};

export default ServerStatusCustom;
