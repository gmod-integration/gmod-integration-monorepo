import { Component, createEffect, createResource, createSignal, For, Show } from "solid-js";
import AdminPanel from "../../../../components/AdminPanel";
import AdminModal from "../../../../components/AdminModal";
import { useI18n } from "../../../../i18n";
import { NeedWebsocket } from "../../../../components/popup/NeedWebsocket";
import { BuyPremiumBtn, premium, PremiumBadge } from "../../../../utils/premium";
import { PremiumOnly } from "../../../../components/PremiumOnly";
import { fetchAPI } from "../../../../utils/api";
import { TextValue } from "../../../../components/popup/TextValue";

const ServerPseudo: Component = () => {
  function getSelectorClassList(direction: string) {
    return !pseudoDirection.loading ? pseudoDirection().value === direction : false;
  }

  const { t } = useI18n();

  const [format, setFormat] = createSignal("");
  const [preview, setPreview] = createSignal("");

  createEffect(() => {
    const previewValue = format()
      .replace("{plyName}", "John Doe")
      .replace("{plySteamID64}", "76500000000000000")
      .replace("{rolePrefix}", "A")
      .replace("{roleName}", "Admin");
    setPreview(previewValue);
  });

  const [pseudoDirection, { mutate: mutatePseudoDirection }] = createResource("pseudoDirection", async () => {
    return fetchAPI("/users/:discordID/guilds/:guildID/servers/:serverID/settings/sync_pseudo_direction", "GET").then(
      async (res) => {
        if (!res.ok) throw new Error("An error occurred while fetching the pseudo direction.");
        return (await res.json()) || {};
      },
    );
  });

  function updateSyncPseudoDirection(direction: string) {
    fetchAPI("/users/:discordID/guilds/:guildID/servers/:serverID/settings/sync_pseudo_direction", "PUT", {
      value: direction,
    })
      .then((res) => {
        if (res.ok) {
          return res.json();
        } else {
          throw new Error("An error occurred while updating the pseudo direction.");
        }
      })
      .then((data) => {
        mutatePseudoDirection(data);
      });
  }

  const [pseudoFormat, { mutate: mutatePseudoFormat }] = createResource("pseudoFormat", async () => {
    return fetchAPI("/users/:discordID/guilds/:guildID/servers/:serverID/settings/pseudoFormat", "GET")
      .then(async (res) => {
        if (!res.ok) throw new Error("An error occurred while fetching the pseudo format.");
        return (await res.json()) || { value: "" };
      })
      .then((data) => {
        setFormat(data.value);
        return data;
      });
  });

  function updatePseudoFormat(format: string) {
    fetchAPI("/users/:discordID/guilds/:guildID/servers/:serverID/settings/pseudoFormat", "PUT", {
      value: format,
    })
      .then((res) => {
        if (res.ok) {
          return res.json();
        } else {
          throw new Error("An error occurred while updating the pseudo format.");
        }
      })
      .then((data) => {
        mutatePseudoFormat(data);
        // @ts-ignore
        edit_format.close();
      });
  }

  const [activeRole, setActiveRole] = createSignal({ id: 0, enabled: false, role: "", name: "", prefix: "" });

  const [pseudoRoles, { mutate: mutatePseudoRoles }] = createResource("pseudoRoles", async () => {
    return fetchAPI("/users/:discordID/guilds/:guildID/servers/:serverID/pseudo", "GET").then(async (res) => {
      if (!res.ok) throw new Error("An error occurred while fetching the pseudo roles.");
      return (await res.json()) || [];
    });
  });

  async function addRole() {
    fetchAPI(`/users/:discordID/guilds/:guildID/servers/:serverID/pseudo`, "POST", activeRole())
      .then((res) => {
        if (res.ok) {
          return res.json();
        } else {
          throw new Error("An error occurred while adding the role.");
        }
      })
      .then((data) => {
        mutatePseudoRoles((prev) => [...prev, data]);
      });
  }

  async function editRole() {
    fetchAPI(`/users/:discordID/guilds/:guildID/servers/:serverID/pseudo/${activeRole().id}`, "PUT", activeRole())
      .then((res) => {
        if (res.ok) {
          return res.json();
        } else {
          throw new Error("An error occurred while editing the role.");
        }
      })
      .then((data) => {
        mutatePseudoRoles((prev) => prev.map((r) => (r.id === data.id ? data : r)));
      });
  }

  async function deleteRole(id: number) {
    fetchAPI(`/users/:discordID/guilds/:guildID/servers/:serverID/pseudo/${id}`, "DELETE")
      .then((res) => {
        if (res.ok) {
          return res.json();
        } else {
          throw new Error("An error occurred while deleting the role.");
        }
      })
      .then((data) => {
        mutatePseudoRoles((prev) => prev.filter((r) => r.id !== data.id));
      });
  }

  return (
    <>
      <NeedWebsocket />
      <AdminModal title={t("dashboard.server.pseudo.editRole", "Edit Role")} id="edit_role_modal">
        <div class="fieldset">
          <label class="label">
            <span>{t("dashboard.server.pseudo.userGroup", "User Group")}</span>
          </label>
          <input
            type="text"
            class="input"
            disabled={pseudoRoles.loading}
            value={activeRole().role}
            onInput={(e) => {
              activeRole().role = e.currentTarget.value;
            }}
          />
        </div>
        <div class="fieldset">
          <label class="label">
            <span>{t("dashboard.server.pseudo.name", "Name")}</span>
          </label>
          <input
            type="text"
            disabled={pseudoRoles.loading}
            class="input"
            value={activeRole().name}
            onInput={(e) => {
              activeRole().name = e.currentTarget.value;
            }}
          />
        </div>
        <div class="fieldset">
          <label class="label">
            <span>{t("dashboard.server.pseudo.prefix", "Prefix")}</span>
          </label>
          <input
            type="text"
            disabled={pseudoRoles.loading}
            class="input"
            value={activeRole().prefix}
            onInput={(e) => {
              activeRole().prefix = e.currentTarget.value;
            }}
          />
        </div>
        <div class="fieldset">
          <label class="label">
            <span>{t("dashboard.server.pseudo.active", "Active")}</span>
          </label>
          <select
            class="select"
            disabled={pseudoRoles.loading}
            value={activeRole().enabled ? "true" : "false"}
            onChange={(e) => {
              activeRole().enabled = e.currentTarget.value === "true";
            }}
          >
            <option value="true">{t("dashboard.server.pseudo.yes", "Yes")}</option>
            <option value="false">{t("dashboard.server.pseudo.no", "No")}</option>
          </select>
        </div>
        <button
          class="btn btn-base-200 mt-2"
          disabled={pseudoRoles.loading}
          onClick={async () => {
            // @ts-ignore
            edit_role_modal.close();
            await editRole();
          }}
        >
          {t("dashboard.server.pseudo.save", "Save")}
        </button>
      </AdminModal>

      <AdminModal title={t("dashboard.server.pseudo.editFormat", "Edit Format")} id="edit_format">
        <Show when={!pseudoFormat.loading}>
          <div class="fieldset p-2">
            <h1 class="text-lg text-base-content/70 font-bold">
              {t("dashboard.server.pseudo.variables", "Variables")}
            </h1>
            <ul class="text-base-content/60 list-inside">
              <li>{`{plyName} - ${t("dashboard.server.pseudo.playerName", "Player Name")}`}</li>
              <li>{`{plySteamID64} - ${t("dashboard.server.pseudo.playerSteamID64", "Player SteamID64")}`}</li>
              <li>{`{rolePrefix} - ${t("dashboard.server.pseudo.rolePrefix", "Role Prefix")}`}</li>
              <li>{`{roleName} - ${t("dashboard.server.pseudo.roleName", "Role Name")}`}</li>
            </ul>
          </div>
          <div class="fieldset">
            <label class="label">
              <span>{t("dashboard.server.pseudo.format", "Format")}</span>
            </label>
            <input
              type="text"
              class="input"
              disabled={pseudoFormat.loading}
              value={pseudoFormat().value}
              onInput={(e) => {
                pseudoFormat().value = e.currentTarget.value;
                setFormat(e.currentTarget.value);
              }}
            />
          </div>
          <div class="fieldset">
            <label class="label">
              <span>{t("dashboard.server.pseudo.preview", "Preview")}</span>
            </label>
            <input type="text" class="input" value={preview()} readonly />
          </div>
          <button
            class="btn btn-base-200 mt-2"
            disabled={pseudoFormat.loading}
            onClick={async () => {
              // @ts-ignore
              edit_server.close();
              updatePseudoFormat(pseudoFormat().value);
            }}
          >
            {t("dashboard.server.pseudo.save", "Save")}
          </button>
        </Show>
      </AdminModal>

      <AdminPanel
        title={t("dashboard.server.pseudo.pseudo", "Pseudo")}
        description={t(
          "dashboard.server.pseudo.description",
          "Define the pseudo that are synchronized with your Discord server.",
        )}
        info={t("dashboard.server.pseudo.info", "Please note that Guild Owner will not have pseudo updates.")}
      >
        <div class="flex w-fit items-center">
          <PremiumBadge onlyIcon={true} />
          <span class="mr-2 text-nowrap">
            {t("dashboard.server.pseudo.pseudoSyncDirection", "Pseudo Synchronization Direction")} :{" "}
          </span>
          <select
            class="select w-full max-w-xs"
            disabled={pseudoDirection.loading}
            onChange={(e) => {
              updateSyncPseudoDirection(e.currentTarget.value);
            }}
          >
            <option value="discord-to-gmod" selected={getSelectorClassList("discord-to-gmod")} disabled={!premium()}>
              {t("dashboard.server.pseudo.fromDiscordToGmod", "From Discord to Gmod")} <PremiumOnly />
            </option>
            <option value="gmod-to-discord" selected={getSelectorClassList("gmod-to-discord")}>
              {t("dashboard.server.pseudo.fromGmodToDiscord", "From Gmod to Discord")}
            </option>
            <option value="both" selected={getSelectorClassList("both")} disabled={!premium()}>
              {t("dashboard.server.pseudo.bothWays", "Both Ways")} <PremiumOnly />
            </option>
            <option value="disable" selected={getSelectorClassList("disable")}>
              {t("dashboard.server.pseudo.disable", "Disable")}
            </option>
          </select>
        </div>

        <div class="flex w-fit items-center">
          <span class="mr-2">{t("dashboard.server.pseudo.format", "Format")}:</span>
          <input type="text" class="input" value={preview()} readonly />
        </div>

        <div class="flex w-fit items-center gap-4">
          <button
            class="btn btn-base-200"
            onClick={() => {
              // @ts-ignore
              edit_format.showModal();
            }}
          >
            {t("dashboard.server.pseudo.editFormat", "Edit Format")}
          </button>
        </div>
      </AdminPanel>

      <AdminPanel
        title={t("dashboard.server.pseudo.rolePrefix", "Role Prefix")}
        description={t("dashboard.server.pseudo.rolePrefixDescription", "Define prefixes for each user group.")}
        type="none"
      >
        <table class="table border-b border-base-300 rounded-none">
          <thead>
            <tr class="text-l">
              <th>{t("dashboard.server.pseudo.userGroup", "User Group")}</th>
              <th>{t("dashboard.server.pseudo.name", "Name")}</th>
              <th>{t("dashboard.server.pseudo.prefix", "Prefix")}</th>
              <th class="w-1/6 text-center">{t("dashboard.server.pseudo.active", "Active")}</th>
              <th class="w-1/6 text-center">{t("dashboard.server.pseudo.actions", "Actions")}</th>
            </tr>
          </thead>
          <tbody>
            <Show
              when={!pseudoRoles.loading}
              fallback={
                <div class="flex justify-center h-36">
                  <div class="loading loading-spinner loading-lg"></div>
                </div>
              }
            >
              <For each={pseudoRoles()}>
                {(role) => (
                  <tr>
                    <td>
                      <TextValue value={role.role} />
                    </td>
                    <td>
                      <TextValue value={role.name} />
                    </td>
                    <td>
                      <TextValue value={role.prefix} />
                    </td>
                    <td>
                      <div class="flex gap-2 justify-center">
                        {role.enabled ? (
                          <i class="fa-solid fa-check text-success"></i>
                        ) : (
                          <i class="fa-solid fa-times text-error"></i>
                        )}
                      </div>
                    </td>
                    <td>
                      <div class="flex gap-2 justify-center">
                        <div class="tooltip tooltip-info" data-tip={t("dashboard.server.pseudo.edit", "Edit")}>
                          <i
                            class="hover:cursor-pointer fa-solid fa-edit"
                            onClick={() => {
                              // @ts-ignore
                              edit_role_modal.showModal();
                              setActiveRole(role);
                            }}
                          ></i>
                        </div>
                        <div class="tooltip tooltip-error" data-tip={t("dashboard.server.pseudo.delete", "Delete")}>
                          <i
                            class="hover:cursor-pointer fa-solid fa-trash text-error"
                            onClick={() => deleteRole(role.id)}
                          ></i>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </Show>
          </tbody>
        </table>

        <div class="flex gap-4 p-4">
          <BuyPremiumBtn
            subCondition={pseudoRoles()?.length < 3}
            btnText={t("dashboard.server.pseudo.rolePrefixPremium", "Limited to 3 roles customization for free users.")}
            hidden={pseudoRoles.loading}
          >
            <button class="btn btn-base-200" onClick={addRole}>
              {t("dashboard.server.pseudo.addRole", "Add Role")}
            </button>
          </BuyPremiumBtn>
        </div>
      </AdminPanel>
    </>
  );
};

export default ServerPseudo;
