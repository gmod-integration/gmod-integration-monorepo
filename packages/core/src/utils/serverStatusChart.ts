import type { Server } from '@gmod/domain-server/Server.js'
import prisma from '@gmod/infra-prisma'
import { JSDOM } from 'jsdom'
import * as d3 from 'd3'
import sharp from 'sharp'
import redis from '@gmod/infra-redis'
import { createBucketIfNotExists, s3 } from '@gmod/infra-minio'
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import type { Readable } from 'node:stream'

const CHART_FONT_FAMILY = 'Roboto, "DejaVu Sans", "Noto Sans", sans-serif'

async function getServerData(serverID: string, duration = 24 * 60 * 60, interval = 60) {
  const now = Date.now()
  const data = await prisma.gm_server_status_history.findMany({
    where: {
      createdAt: {
        gte: new Date(now - duration * 1000),
      },
      serverID: serverID,
    },
    orderBy: {
      createdAt: 'asc',
    },
  })

  const result: { time: Date; value: number }[] = []
  for (let i = 0; i < duration / interval; i++) {
    result.push({
      time: new Date(now - (duration - i * interval) * 1000),
      value: 0,
    })
  }

  for (const d of data) {
    const index = Math.floor((d.createdAt.getTime() - result[0].time.getTime()) / (interval * 1000))
    if (index >= 0 && index < result.length) {
      if (result[index].value < d.players) {
        result[index].value = d.players
      }
    }
  }

  return result
}

export async function getServerChart(server: Server, options: { persist?: boolean } = {}) {
  const persist = options.persist !== false
  const key = `server:${server.getID()}:chart`
  const cacheChart = persist ? await redis.get(key) : null

  try {
    if (persist) await createBucketIfNotExists('gmi-servers-status')
    if (cacheChart) {
      const resul = await s3.send(
        new GetObjectCommand({
          Bucket: 'gmi-servers-status',
          Key: `${server.getID()}.png`,
        }),
      )
      const chunks: Buffer[] = []
      for await (const chunk of resul.Body as Readable) {
        chunks.push(chunk as Buffer)
      }
      return Buffer.concat(chunks)
    }
  } catch (err) {
    console.error('Error fetching server chart from MinIO:', err)
  }

  const data = await getServerData(server.getID(), 24 * 60 * 60, 480)
  const maxPlayers = await prisma.gm_server_status.findFirst({
    where: {
      id: server.getID(),
    },
    select: {
      maxPlayers: true,
    },
  })

  const width = 600
  const height = 300
  const margin = { top: 40, right: 30, bottom: 60, left: 50 }

  const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`)
  const body = d3.select(dom.window.document).select('body')
  const svg = body.append('svg').attr('width', width).attr('height', height).attr('font-family', CHART_FONT_FAMILY)

  const xScale = d3
    .scaleTime()
    .domain(d3.extent(data, (d) => d.time) as [Date, Date])
    .range([margin.left, width - margin.right])

  const yScale = d3
    .scaleLinear()
    .domain([0, maxPlayers?.maxPlayers || 0])
    .nice()
    .range([height - margin.bottom, margin.top])

  const line = d3
    .line<{ time: Date; value: number }>()
    .x((d) => xScale(d.time))
    .y((d) => yScale(d.value))
    .curve(d3.curveMonotoneX) // Smooth curve

  const now = new Date()
  const relativeTimeFormat = (domainValue: Date | d3.NumberValue): string => {
    const date = domainValue instanceof Date ? domainValue : new Date(+domainValue)
    const diffMs = date.getTime() - now.getTime()
    const diffHours = Math.round(diffMs / (1000 * 60 * 60))

    return `${diffHours > 0 ? '+' : ''}${diffHours}h`
  }

  svg
    .append('g')
    .attr('transform', `translate(0,${height - margin.bottom + 10})`)
    .attr('color', 'white')
    .call((g) => {
      g.call(d3.axisBottom(xScale).tickFormat(relativeTimeFormat))
    })
    .style('font-size', '16px')
    .style('font-family', CHART_FONT_FAMILY)

  svg
    .append('g')
    .attr('transform', `translate(${margin.left - 10},0)`)
    .attr('color', 'white')
    .call(d3.axisLeft(yScale))
    .selectAll('text')
    .style('font-size', '16px')
    .style('font-family', CHART_FONT_FAMILY)

  svg
    .append('path')
    .datum(data)
    .attr('fill', 'none')
    .attr('stroke', 'steelblue')
    .attr('stroke-width', 4)
    .attr('d', line)

  const svgString = (body.select('svg').node() as Element)?.outerHTML
  if (persist) await redis.set(key, 'true', 'EX', 60 * 4)
  const pngImg = await sharp(Buffer.from(svgString)).png().toBuffer()

  if (persist)
    await s3
      .send(
        new PutObjectCommand({
          Bucket: 'gmi-servers-status',
          Key: `${server.getID()}.png`,
          Body: pngImg,
          ContentType: 'image/png',
        }),
      )
      .catch((err) => {
        console.error('Error uploading server chart to MinIO:', err)
      })

  return pngImg
}
