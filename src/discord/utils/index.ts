import { getTranslate } from '../../utils/localizations.js';
import { Server } from '../../classes/v3/Server.js';
import prisma from '../../prisma.js';
import { JSDOM } from 'jsdom';
import * as d3 from 'd3';
import sharp from 'sharp';
import redis from '../../redis/index.js';
import fs from 'fs';
import path from 'path';

const trust_ranks: Record<number, string> = {
  0: 'dangerous',
  15: 'untrusted',
  30: 'semi-untrusted',
  40: 'neutral',
  60: 'semi-trusted',
  70: 'trusted',
  85: 'exemplary',
  100: 'legendary',
};

export async function getTrustRank(trust: number, lang: string) {
  let lastKey = 0;

  for (let key of Object.keys(trust_ranks).map(Number)) {
    if (trust <= key) {
      return await getTranslate(trust_ranks[lastKey], lang);
    }
    lastKey = key;
  }

  return await getTranslate('unknown_rank', lang);
}

export function dateToDiscordTimestamp(date: Date) {
  return '<t:' + Math.floor(date.getTime() / 1000) + ':R>';
}

export function secToTime(sec: number, precision: number = -1) {
  // convert seconds to ??w ??d ??h ??m ??s
  let time = '';
  const weeks = Math.floor(sec / 604800);
  const days = Math.floor(sec / 86400) % 7;
  const hours = Math.floor(sec / 3600) % 24;
  const minutes = Math.floor(sec / 60) % 60;
  const seconds = sec % 60;

  if (weeks > 0) {
    time += weeks + 'w ';
  }
  if (days > 0) {
    time += days + 'd ';
  }
  if (hours > 0) {
    time += hours + 'h ';
  }
  if (minutes > 0) {
    time += minutes + 'm ';
  }
  if (seconds > 0) {
    time += seconds + 's';
  }

  if (precision === -1) {
    return time;
  }

  const timeParts = time.trim().split(' ');
  return timeParts.slice(0, precision).join(' ');
}

async function getServerData(serverID: string, duration = 24 * 60 * 60, interval = 60) {
  const data = await prisma.gm_server_status_history.findMany({
    where: {
      createdAt: {
        gte: new Date(Date.now() - duration * 1000),
      },
      serverID: serverID,
    },
    orderBy: {
      createdAt: 'asc',
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

export async function getServerChart(server: Server) {
  const key = `server:${server.getID()}:chart`;
  const cacheChart = await redis.get(key);
  const outputFilePath = path.resolve('./status_chart', `${server.getID()}.svg`);

  if (cacheChart && fs.existsSync(outputFilePath)) {
    console.log('Serving cached chart');
    return await sharp(await fs.promises.readFile(outputFilePath))
      .png()
      .toBuffer();
  }

  const data = await getServerData(server.getID(), 24 * 60 * 60, 480);

  const maxPlayers = await prisma.gm_server_status.findFirst({
    where: {
      id: server.getID(),
    },
    select: {
      maxPlayers: true,
    },
  });

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

  const now = new Date();
  // Define a flexible formatter for tick values
  const relativeTimeFormat = (domainValue: Date | d3.NumberValue): string => {
    const date = domainValue instanceof Date ? domainValue : new Date(+domainValue);
    const diffMs = date.getTime() - now.getTime();
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));

    return `${diffHours > 0 ? '+' : ''}${diffHours}h`;
  };

  // Append axes to the SVG
  svg
    .append('g')
    .attr('transform', `translate(0,${height - margin.bottom + 10})`)
    .attr('color', 'white')
    .call((g) => {
      g.call(
        d3
          .axisBottom(xScale)
          // Customize tick size and formatting
          // .tickSize(4)
          .tickFormat(relativeTimeFormat),
      );
    })
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

  const svgString = (body.select('svg').node() as Element)?.outerHTML;

  // Ensure the directory exists
  await fs.promises.mkdir(path.resolve('./status_chart'), { recursive: true });

  // Write to a temporary file
  const tempFilePath = `${outputFilePath}.tmp`;
  await fs.promises.writeFile(tempFilePath, svgString);

  // Atomically rename the temporary file to the final file
  await fs.promises.rename(tempFilePath, outputFilePath);
  console.log('File updated successfully:', outputFilePath);

  // Update Redis cache after writing the file
  await redis.set(key, true, 'EX', 60 * 4);

  // Return the PNG conversion
  return await sharp(Buffer.from(svgString)).png().toBuffer();
}

export type d3Data = {
  date: string;
  time: number;
  kills: number;
  deaths: number;
  kd: number;
  connections: number;
};

type chartPlayerD3 = Exclude<keyof d3Data, 'date'>;

export async function playerConnectionChart(
  server: Server,
  steamID64: string,
  lang: string,
  stat: string = 'time',
  duration: number = 7,
) {
  if (!steamID64 || !server) throw new Error('Missing parameters');

  const allowedStats: string[] = ['time', 'kills', 'deaths', 'kd', 'connections'];
  if (!allowedStats.includes(stat)) throw new Error('Invalid focus stat');

  const focusStat = stat as chartPlayerD3;

  const maxDuration = 30;
  if (duration > maxDuration) throw new Error('Duration too long');

  const last7days = await prisma.gm_server_stat_session.findMany({
    where: {
      serverID: server.getID(),
      steamID64: steamID64,
      createdAt: {
        gte: new Date(Date.now() - duration * 24 * 60 * 60 * 1000),
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  // Prepare a Record to accumulate daily stats
  let perDaySumRecord: Record<string, d3Data> = {};

  // Initialize a zero-entry for each day in the desired range
  for (let i = 0; i < duration; i++) {
    const dateStr = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toDateString();
    perDaySumRecord[dateStr] = {
      date: dateStr,
      time: 0,
      kills: 0,
      deaths: 0,
      kd: 0,
      connections: 0,
    };
  }

  // Sum up the time/kills/deaths in perDaySumRecord
  last7days.forEach((curr) => {
    const dateStr = curr.createdAt.toDateString();
    if (!perDaySumRecord[dateStr]) {
      perDaySumRecord[dateStr] = {
        date: dateStr,
        time: 0,
        kills: 0,
        deaths: 0,
        kd: 0,
        connections: 0,
      };
    }
    const record = perDaySumRecord[dateStr];
    record.time += curr.time;
    record.kills += curr.kills;
    record.deaths += curr.deaths;
    record.kd = record.deaths === 0 ? record.kills : record.kills / record.deaths;
  });

  // for every day, calculate the connections
  for (let i = 0; i < duration; i++) {
    const dateStr = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toDateString();
    const record = perDaySumRecord[dateStr];
    record.connections = last7days.filter((d) => d.createdAt.toDateString() === dateStr).length;
  }

  // Convert the record to an array for D3
  const perDaySumArray: d3Data[] = Object.values(perDaySumRecord).reverse();

  // Now everything below uses the array version in the D3 calls
  const width = 600;
  const height = 300;
  const margin = { top: 40, right: 30, bottom: 60, left: 50 };

  const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`);
  const body = d3.select(dom.window.document).select('body');

  // Create the SVG container
  const svg = body.append('svg').attr('width', width).attr('height', height);

  // (Optional) fetch the player's name
  const playerInfo = await prisma.gm_server_stat.findFirst({
    where: {
      server_id: server.getID(),
      steam_id: steamID64,
    },
  });

  // Add chart title
  svg
    .append('text')
    .attr('x', width / 2)
    .attr('y', margin.top / 2)
    .attr('text-anchor', 'middle')
    .attr('font-size', '20px')
    .attr('fill', 'white')
    .text(
      await getTranslate('last_days_of', lang, [
        duration.toString(),
        playerInfo ? playerInfo.name : steamID64,
        focusStat,
      ]),
    )
    .attr('font-family', 'Roboto');

  // Define scales
  const xScale = d3
    .scaleBand()
    .domain(perDaySumArray.map((d) => d.date))
    .range([margin.left, width - margin.right])
    .padding(0.1);

  const yMax = d3.max(perDaySumArray, (d) => d[focusStat]) || 0;
  const yScale = d3
    .scaleLinear()
    .domain([0, yMax])
    .nice()
    .range([height - margin.bottom, margin.top]);

  // Get the full domain from xScale
  const fullDomain = xScale.domain();

  // If duration > 8, keep only every other value
  const tickValues = duration > 8 ? fullDomain.filter((_, i) => i % 2 === 0) : fullDomain;

  svg
    .append('g')
    .attr('transform', `translate(0,${height - margin.bottom + 10})`)
    .attr('color', 'white')
    .call(
      d3
        .axisBottom(xScale)
        // Use our filtered tickValues here:
        .tickValues(tickValues)
        .tickFormat((d) => {
          const date = new Date(d as string);
          return duration < 8
            ? date.toLocaleDateString(lang, { weekday: 'short' })
            : date.toLocaleDateString(lang, {
                day: 'numeric',
                weekday: 'short',
              });
        }),
    )
    .selectAll('text')
    .style('font-size', '12px')
    .style('text-anchor', 'end')
    .attr('dx', '-0.8em')
    .attr('dy', '0.15em')
    .attr('transform', 'rotate(-45)');

  // Append the left axis
  svg
    .append('g')
    .attr('transform', `translate(${margin.left - 0},0)`)
    .attr('color', 'white')
    .call((g) =>
      g.call(
        d3
          .axisLeft(yScale)
          .ticks(yScale.ticks().length / 2)
          .tickFormat((d) => (focusStat === 'time' ? secToTime(d as number, 1) : d.toString())),
      ),
    )
    .selectAll('text')
    .style('font-size', '16px');

  // Define the line generator (matching the d3Data type)
  const lineGen = d3
    .line<d3Data>()
    .x((d) => {
      // xScale(d.date) might be undefined if the domain is missing that date,
      // so we use ! to tell TS it's definitely present
      const xVal = xScale(d.date);
      return xVal !== undefined ? xVal : 0;
    })
    .y((d) => yScale(d[focusStat]))
    .curve(d3.curveMonotoneX);

  // Add the line path
  svg
    .append('path')
    .datum(perDaySumArray)
    .attr('fill', 'none')
    .attr('stroke', 'steelblue')
    .attr('stroke-width', 4)
    .attr('d', lineGen(perDaySumArray));

  // Convert the finished SVG to PNG
  const svgString = (body.select('svg').node() as Element)?.outerHTML;
  return await sharp(Buffer.from(svgString)).png().toBuffer();
}
