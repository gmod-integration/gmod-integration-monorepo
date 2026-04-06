# Install

In this section you'll find a step-by-step guide to set up your own instance of Gmod Integration. Whether you want to run it in production or development, we've got you covered. The production setup is still a work in progress, but the development setup is ready and will allow you to test your changes in a production-like environment.

## Requirements

Before you begin, make sure you have the following installed on your prod machine:

- Docker
- Git
- Curl
- A domain name
- Cloudflare account (for tunnels and pages)

## Fork 'gmod-integration-monorepo'

To get started, you need to fork the 'gmod-integration-monorepo' repository on GitHub. This will create a copy of the repository under your own GitHub account, allowing you to make changes and deploy your own instance of Gmod Integration.

## Get docker compose file

TODO

## Cloudflare Tunnels

To protect your environment, we can use Cloudflare Tunnels to securely expose our environment to the internet.

Expose the following ports using Cloudflare Tunnels:

| Protocol | Local Endpoint  | Public Endpoint     |
| -------- | --------------- | ------------------- |
| http     | localhost:53136 | api.your-domain.com |
| http     | localhost:53139 | ws.your-domain.com  |

## Cloudflare Pages (Frontend)

The docs & website are static sites, so we can use Cloudflare Pages to host them. This is a free service that allows us to deploy our static sites with ease.

To set up Cloudflare Pages, follow these steps:

1. Go to the Cloudflare dashboard and select your account.
2. Click on "Pages" in the left-hand menu.
3. Click on "Create a Project" and connect your GitHub repository fork of 'gmod-integration-monorepo'.
4. Select the branch you want to deploy (e.g., `main`).
5. Configure the build settings:
   - Build command: `bun install && bunx turbo run build --filter=@gmod/app-website`
   - Build output directory: `apps/website/dist`
6. Click "Save and Deploy" to start the deployment process.
7. Once the deployment is complete, you will receive a URL where your docs are hosted. You can also set up a custom domain if you have one.

## Login to Dashboard

Now everything is set up, you can log in to your dashboard using discord, make the bot join your discord server, and create a server for it to connect to, get the ID & Token, and add them in your environment variables to allow your Garry's Mod server to connect to your instance of Gmod Integration.

Just like a normal install of Gmod Integration [see documentation](/)

## Edit In Game Configuration

Now you have a self hosted instance of Gmod Integration, you need to change the FQDN to use by yours Garry's Mod server to connect to your instance instead of the public one.

Go in your console and type the following command, replacing `your-domain.com` with the domain you set up for your Cloudflare Pages:

```bash
gmod-integration config set apiFQDN "https://api.your-domain.com"
gmod-integration config set websocketFQDN "https://ws.your-domain.com"
```
