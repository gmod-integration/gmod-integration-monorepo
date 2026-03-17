import { Component, createResource, createSignal, For, Show } from "solid-js";
import DashboardMiddleware from "../middleware/DashboardMiddleware";
import { useI18n } from "../i18n";
import { Errors } from "../components/layout/Errors";
import { fetchAPI } from "../utils/api";
import { notificationCount, updateNotificationCount } from "../utils/notificationStore";

const Notifications: Component = () => {
  const { t } = useI18n();

  const [userNotifications, { mutate: mutateUserNotifications, refetch: refetchNotifications }] = createResource("userNotifications", async () => {
    return await fetchAPI("/users/:discordID/notifications", "GET")
      .then(async (res) => {
        if (!res.ok) {
          return { notifications: [], unreadCount: 0 };
        } else {
          return res.json();
        }
      })
      .then((json) => {
        updateNotificationCount(json.unreadCount || 0);

        const notifications = json.notifications || json;
        return Array.isArray(notifications) ? notifications.sort((a: any, b: any) => {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }) : [];
      });
  });

  function setNotificationsAsRead(id: number) {
    fetchAPI(`/users/:discordID/notifications/${id}`, "PATCH").then(async (res) => {
      if (res.ok) {
        const json = await res.json();
        updateNotificationCount(json.unreadCount || 0);

        mutateUserNotifications((prevNotifications) =>
          (prevNotifications || []).map((notification) => {
            if (notification.id === id) {
              return { ...notification, read: true };
            }
            return notification;
          }),
        );
      } else {
        Errors("Failed to mark the notification as read");
      }
    });
  }

  function markAllAsRead() {
    fetchAPI(`/users/:discordID/notifications/mark-all-read`, "PATCH").then(async (res) => {
      if (res.ok) {
        const json = await res.json();

        updateNotificationCount(json.unreadCount || 0);
        mutateUserNotifications((prevNotifications) => {
          return (prevNotifications || []).map((notification) => ({
            ...notification,
            read: true,
          }));
        });
      } else {
        Errors("Failed to mark all notifications as read");
      }
    }).catch(error => {
      console.error("Error in markAllAsRead:", error);
      Errors("Failed to mark all notifications as read");
    });
  }

  return (
    <>
      <DashboardMiddleware />
      <div class="flex flex-col p-4 gap-4 max-w-(--breakpoint-xl) mx-auto w-full">
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-4">
            <h2 class="text-2xl py-4 font-bold">{t("notifications.title", "Notifications")}</h2>
            <Show when={notificationCount() > 0}>
              <span class="badge badge-warning">{notificationCount()}</span>
            </Show>
          </div>

          <div class="flex gap-2">
            <Show when={notificationCount() > 0}>
              <button
                class="btn btn-sm btn-base-200"
                onClick={markAllAsRead}
                title={t("notifications.mark_all_read", "Mark All as Read")}
              >
                <i class="fa-solid fa-check-double"></i>
                {t("notifications.mark_all_read", "Mark All Read")}
              </button>
            </Show>
          </div>
        </div>

        <Show when={!userNotifications.loading} fallback={<span class="loading loading-lg"></span>}>
          <Show
            when={userNotifications() && userNotifications()!.length > 0}
            fallback={
              <div class="text-center py-8">
                <i class="fa-solid fa-bell-slash text-4xl text-base-content/60 mb-4"></i>
                <p class="text-base-content/50">{t("notifications.no_notifications", "No notifications yet")}</p>
              </div>
            }
          >
            <table class="table w-full">
              <thead>
                <tr>
                  <th class="w-1/6">{t("notifications.date", "Date")}</th>
                  <th class="w-1/6">{t("notifications.type", "Type")}</th>
                  <th>{t("notifications.message", "Message")}</th>
                  <th class="w-1/6 text-center">{t("notifications.actions", "Actions")}</th>
                </tr>
              </thead>
              <tbody>
                <For each={userNotifications()}>
                  {(notification) => (
                    <tr class={notification.read ? "opacity-60" : ""}>
                      <td class="w-1/6">{new Date(notification.createdAt).toLocaleString()}</td>
                      <td class="w-1/6">
                        <span
                          class={`badge ${
                            notification.type === "error"
                              ? "badge-error"
                              : notification.type === "warning"
                                ? "badge-warning"
                                : notification.type === "success"
                                  ? "badge-success"
                                  : "badge-success"
                          }`}
                        >
                          {notification.type}
                        </span>
                      </td>
                      <td class={notification.read ? "text-base-content/50" : ""}>{notification.message}</td>
                      <td class="w-1/6 text-center">
                        <Show
                          when={!notification.read}
                          fallback={<i class="fa-solid cursor-pointer fa-eye-slash text-base-content/60"></i>}
                        >
                          <div class="tooltip tooltip-info" data-tip={t("notifications.mark_as_read", "Mark as Read")}>
                            <i
                              class="fa-solid fa-eye cursor-pointer hover:text-info"
                              onClick={() => setNotificationsAsRead(notification.id)}
                            ></i>
                          </div>
                        </Show>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </Show>
        </Show>
      </div>
    </>
  );
};

export default Notifications;
