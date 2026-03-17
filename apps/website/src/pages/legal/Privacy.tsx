import { Component, For } from "solid-js";
import { linkifyEmails } from "../../utils/utils";

const privacy = [
  {
    title: "Introduction",
    content: `
            Gmod Integration is a service that allows you made an integration between Discord Guild's and Garry's Mod Server's.
            By using our services, you are agreeing to the terms and conditions of this Privacy Policy.
            We are committed to protecting your privacy and ensuring the security of your data.
            This Privacy Policy outlines the measures we take to safeguard your data and the manner in which we collect, use, and disclose your data.
            If you have any questions or concerns regarding this Privacy Policy, please contact us at contact@gmod-integration.com.
            `,
  },
  {
    title: "Data Collection",
    content: `
            Because of the nature of our services, we are unable to provide our offerings without collecting this data.
            However, we do not collect any data beyond what is strictly necessary for the functioning of our services.
            We do our best to be transparent about the data we collect and how we use it, but the following list is not exhaustive.
            We also provide you with the option to request a copy of your data or request its deletion from our servers.
            `,
    sub: [
      {
        title: "Data Collected from Discord",
        table: {
          headers: ["Type of Data", "Stored", "Example of Usage"],
          rows: [
            ["Discord User ID", "Yes", "All Features (Profile, Admin Panel...)"],
            ["Discord User Name's", "Yes", "Main Features (Profile, Sync Chat...)"],
            ["Discord User App Token", "Yes", "Discord API Interaction"],
            ["Discord User GuildsSelector", "Yes", "Admin Panel, Linking Roles..."],
            ["Discord User Email Address", "Yes", "Emergency Contact"],
            ["Discord Guild ID", "Yes", "Main Features (Admin Panel...)"],
            ["Discord Guild Name", "Yes", "Main Features (Admin Panel...)"],
            ["Discord Guild Icon", "No", "Main Features (Admin Panel...)"],
            ["Discord Guild Members", "Yes", "Main Features (Admin Panel...)"],
            ["Discord Guild User Message", "No", "Sync Chat"],
            ["Discord Guild Webhooks", "Yes", "Sync Chat"],
            ["Discord Guild User Join Date", "Yes", "Linking Roles"],
            ["Discord Guild Bans", "No", "Ban System"],
            ["Discord Guild Roles", "Yes", "Main Features (Admin Panel, Roles Sync...)"],
            ["Discord Guild Channels", "Yes", "Main Features (Admin Panel...)"],
            ["Discord Guild Users Roles", "No", "Admin Panel, Linking Roles..."],
            ["Discord Guild Users Permissions", "No", "Admin Panel, Linking Roles..."],
            ["Discord Guild Users Avatar", "No", "Main Features (Profile, Sync Chat...)"],
            ["Discord Guild Users Nickname", "No", "Main Features (Profile, Sync Chat...)"],
          ],
        },
      },
      {
        title: "Data Collected from Steam",
        table: {
          headers: ["Type of Data", "Stored", "Example of Usage"],
          rows: [
            ["Steam ID", "Yes", "Main Features (Profile, Sync Chat...)"],
            ["Steam Username", "Yes", "Main Features (Profile, Sync Chat...)"],
            ["Steam Avatar", "No", "Sync Chat"],
            ["Steam App Token", "No", "Steam API Interaction"],
          ],
        },
      },
      {
        title: "Data Collected from Garry's Mod Server",
        table: {
          headers: ["Type of Data", "Stored", "Example of Usage"],
          rows: [
            ["Server Name", "Yes", "Server Status"],
            ["Server IP & Port", "Yes", "Server Status"],
            ["Server Map", "Yes", "Server Status"],
            ["Server Game Mode", "Yes", "Server Status"],
            ["Player Steam ID's", "Yes", "Main Features (Admin Panel...)"],
            ["Player Name", "Yes", "Sync Chat, Sync Name"],
            ["Player IP", "Yes", "Trust Factor, Ban System"],
            ["Player Stats", "Yes", "Main Features (Stats, Profile...)"],
            ["Player Rank", "Yes", "Main Features (Stats, Logs, Profile...)"],
            ["Player Events", "Yes", "Main Features (Stats, Logs, Profile...)"],
            ["Player Position & Angle", "Yes", "Main Features (Logs, Profile...)"],
            ["Player Custom Data", "Yes", "Manage by Server Owner"],
          ],
        },
      },
      {
        title: "Log Data",
        content: `
                    We use log systems how can may collect every data how we can have access to. This data is used for
                    debugging and security purposes, we do not share this data with any one how's not in the Gmod Integration
                    Head Team, and data are automatically deleted after 14 days.
                    `,
      },
    ],
  },
  {
    title: "Data Storage and Security",
    content: `
            We store your data on secure servers located in France. We employ the highest standards of data security
            and ensure that your data is shielded from any unauthorized access or malicious entities. Server access
            is restricted to a select few individuals, all access to which is logged and monitored.
            `,
  },
  {
    title: "Data Usage and Application",
    content: `
            We use your data to provide you with our services and to improve your experience. We may also use your
            data to contact you regarding important updates or changes to our services. We will never sell, rent, or
            lease your data to any third-party entities.
            `,
  },
  {
    title: "Data Erasure",
    content: `
            You retain the right to request the deletion of your data from our servers at any point. This can be
            facilitated by establishing contact with us at contact@gmod-integration.com.
            Upon receiving such a request, we will promptly and permanently erase your data from our records,
            in accordance with applicable laws and regulations.
            `,
  },
  {
    title: "Data Portability",
    content: `
            You retain the right to request a copy of your data for your personal records. This can be facilitated by
            reaching out to us at contact@gmod-integration.com.
            We will provide you with a comprehensive copy of your data in an easily accessible format.
            `,
  },
  {
    title: "Amendments to the Privacy Policy",
    content: `
            We reserve the right to make changes to this Privacy Policy at any time, in accordance with evolving privacy standards and regulatory requirements.
            In the event of significant modifications, we will proactively notify you via our Discord Server.
            Your continued use of our services after such changes have been made will be construed as your acceptance of the revised Privacy Policy.
            `,
  },
];

const Privacy: Component = () => {
  return (
    <>
      <div class="flex flex-col p-8 max-w-300 mx-auto gap-12">
        <h1 class="text-4xl font-bold my-14 text-center">Privacy Policy</h1>

        <For each={privacy}>
          {({ title, content, sub }, index) => (
            <div>
              <h2 class="text-xl font-bold text-secondary mb-4">
                {index() + 1}. {title}
              </h2>
              <p class="text-base text-base-content" innerHTML={linkifyEmails(content)}></p>
              <For each={sub}>
                {({ title, table, content }, subIndex) => (
                  <div class="my-12 last:mb-0">
                    <h3 class="text-lg font-bold text-secondary mb-4">
                      {index() + 1}.{subIndex() + 1}. {title}
                    </h3>
                    {table ? (
                      <table class="table w-full border border-base-200 noBorderBottomTable rounded-lg border-separate">
                        <thead>
                          <tr>
                            <th class="table-header w-1/3">Type of Data</th>
                            <th class="table-header w-1/6">Stored</th>
                            <th class="table-header w-1/3">Example of Usage</th>
                          </tr>
                        </thead>
                        <tbody>
                          <For each={table.rows}>
                            {(row) => (
                              <tr class="table-row">
                                <For each={row}>{(cell) => <td class="table-cell text-base-content">{cell}</td>}</For>
                              </tr>
                            )}
                          </For>
                        </tbody>
                      </table>
                    ) : (
                      <p class="text-base text-base-content" innerHTML={linkifyEmails(content)}></p>
                    )}
                  </div>
                )}
              </For>
            </div>
          )}
        </For>
      </div>
    </>
  );
};

export default Privacy;
