import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  InteractionContextType,
  SlashCommandBuilder,
} from 'discord.js';
import { getServerList } from '../../../models/v3/serversModels.js';
import { JSDOM } from 'jsdom';
import * as d3 from 'd3';
import sharp from 'sharp';
import { getServerFromID } from '../../../classes/v3/Server.js';
import prisma from '../../../prisma';

async function getServerData(serverID: string, duration = 24 * 60 * 60, interval = 60) {
  const data = await prisma.gm_server_status_history.findMany({
    where: {
      createdAt: {
        gte: new Date(Date.now() - duration * 1000),
      },
      serverID: serverID,
    },
  });

  const result: { time: Date; value: number }[] = [];
  // create all interval
  for (let i = 0; i < duration / interval; i++) {
    result.push({
      time: new Date(Date.now() - (duration - i * interval) * 1000),
      value: 0,
    });
  }

  // fill the data
  for (const d of data) {
    const index = Math.floor((d.createdAt.getTime() - result[0].time.getTime()) / (interval * 1000));
    if (result[index].value < d.players) result[index].value = d.players;
  }

  return result;
}

export default {
  dev: true,
  data: new SlashCommandBuilder()
    .setName('chart')
    .setDescription('Get an Server leaderboard for specific category')
    .setContexts([InteractionContextType.Guild])
    .addStringOption((option) =>
      option.setName('server').setDescription('Server to get leaderboard from').setRequired(true).setAutocomplete(true),
    )
    .addUserOption((option) =>
      option.setName('user').setDescription("The user's stat you want to see").setRequired(false),
    )
    .addStringOption((option) =>
      option.setName('steam').setDescription("The steamID64 of the user's stat you want to see").setRequired(false),
    ),
  category: 'player',
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const lang = interaction.guild.preferredLocale;
    const serverID = interaction.options.getString('server');
    if (!serverID) return interaction.reply('No server provided');
    const server = await getServerFromID(serverID);
    if (!server) return interaction.reply('Server not found');
    // data are server_steam_stat
    const data = await getServerData(serverID);
    console.log(data);

    const maxPlayers = await prisma.gm_server_status.findFirst({
      where: {
        id: serverID,
      },
      select: {
        maxPlayers: true,
      },
    });

    const user = interaction.options.getUser('user');
    const steamID64 = interaction.options.getString('steam');

    try {
      const width = 600;
      const height = 300;
      const margin = { top: 40, right: 30, bottom: 60, left: 50 };

      const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`);
      const body = d3.select(dom.window.document).select('body');

      // Create the SVG container
      const svg = body.append('svg').attr('width', width).attr('height', height);

      // Define scales
      const xScale = d3
        .scaleTime()
        .domain(d3.extent(data, (d) => d.time) as [Date, Date])
        .nice()
        .range([margin.left, width - margin.right]);

      const yScale = d3
        .scaleLinear()
        .domain([0, maxPlayers?.maxPlayers || 0])
        .nice()
        .range([height - margin.bottom, margin.top]);

      const line = d3
        .line<{ time: Date; value: number }>()
        .x((d) => xScale(d.time))
        .y((d) => yScale(d.value))
        .curve(d3.curveMonotoneX); // Smooth curve

      // Append axes
      svg
        .append('g')
        .attr('transform', `translate(0,${height - margin.bottom + 10})`)
        .attr('color', 'white')
        .call(
          d3
            .axisBottom(xScale)
            // .tickSize(4)
            .tickFormat(d3.timeFormat('%H:%M') as any),
        )
        .selectAll('text')
        .style('font-size', '16px');

      svg
        .append('g')
        .attr('transform', `translate(${margin.left - 10},0)`)
        .attr('color', 'white')
        .call(
          d3.axisLeft(yScale),
          //.tickSize(4)
        )
        .selectAll('text')
        .style('font-size', '16px');

      // Add the line path
      svg
        .append('path')
        .datum(data)
        .attr('fill', 'none')
        .attr('stroke', 'steelblue')
        .attr('stroke-width', 4)
        .attr('d', line);

      // add title
      svg
        .append('text')
        .attr('x', width / 2)
        .attr('y', margin.top / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', 'white')
        .style('font-size', '20px')
        .style('font-family', 'Roboto')
        .text(`Players on ${server.getName()}`);

      // Convert the generated SVG to a string
      const svgString = (body.select('svg').node() as Element)?.outerHTML;

      // Save the SVG string to a file
      // const outputFilePath = path.resolve(__dirname, 'chart.svg');
      // fs.writeFileSync(outputFilePath, svgString);
      // console.log(`SVG chart saved to ${outputFilePath}`);

      // convert svg to png
      const buffer = await sharp(Buffer.from(svgString)).png().toBuffer();
      //
      // let discordUrl = '';
      // const dscClient = await getMainClient();
      // const channel = await dscClient.channels.fetch(serverConfig.screenshotChannel!);
      // try {
      //   if (channel && channel.isSendable()) {
      //     const message = await channel.send({
      //       files: [buffer],
      //       // content: `Server: ${server.getName()} - Player: ${player.name} - SteamID64: ${player.steamID64}`,
      //     });
      //     discordUrl = message.attachments.first()?.url || '';
      //   }
      // } catch (e) {
      //   // do nothing
      // }
      //
      // // Reply with a embed containing the SVG chart
      // const embed = new EmbedBuilder()
      //   .setImage(discordUrl)
      //   .setColor('#2b2d31')
      //   .setFooter({
      //     text: 'Chart',
      //   })
      //   .setTimestamp();
      // await interaction.reply({ embeds: [embed] });

      // directly reply with the image in a embed
      const embed = new EmbedBuilder()
        .setImage('attachment://chart.png')
        .setColor('#2b2d31')
        .setFooter({
          text: 'Chart',
        })
        .setTimestamp();
      await interaction.reply({ embeds: [embed], files: [{ attachment: buffer, name: 'chart.png' }] });
    } catch (error) {
      console.error(error);
      await interaction.reply('An error occurred while generating the chart');
    }
  },
  async autocomplete(interaction: AutocompleteInteraction) {
    if (!interaction.guild) return;
    const focusedOption = interaction.options.getFocused(true);
    let choices: Record<string, string> = {
      // [await getTranslate('global_stat', interaction.guild.preferredLocale)]: 'global',
    };
    const filtered = await getServerList(interaction, focusedOption, choices);
    return interaction.respond(filtered.map((choice) => ({ name: choice, value: choices[choice] })));
  },
};
