import { getTranslate } from '../../utils/localizations.js';
import { Server } from '../../classes/v3/Server.js';
import prisma from '../../prisma.js';
import { JSDOM } from 'jsdom';
import * as d3 from 'd3';
import sharp from 'sharp';

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

export function secToTime(sec: number) {
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

  return time;
}

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

export async function getServerChart(server: Server) {
  const data = await getServerData(server.getID());
  console.log(data);

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
  return await sharp(Buffer.from(svgString)).png().toBuffer();
}
