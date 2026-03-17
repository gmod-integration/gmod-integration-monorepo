import prisma from '@gmod/infra-prisma';
import { type ServerStatusChannelInput, ServerStatusChannelSchema } from '@gmod/schema/server/ServerStatusChannelSchema.js';
import { type Server } from './Server.js';

export class ServerStatusChannel {
  public readonly id: string;
  public readonly serverID: string;
  public readonly channelID: string;
  public readonly format: string;
  public readonly updatedAt: Date;
  public readonly createdAt: Date;

  constructor(data: ServerStatusChannelInput) {
    const parsed = ServerStatusChannelSchema.parse(data);
    this.id = parsed.id;
    this.serverID = parsed.serverID;
    this.channelID = parsed.channelID;
    this.format = parsed.format;
    this.updatedAt = parsed.updatedAt ? new Date(parsed.updatedAt) : new Date();
    this.createdAt = parsed.createdAt ? new Date(parsed.createdAt) : new Date();
  }

  public static from(data: unknown): ServerStatusChannel {
    return new ServerStatusChannel(data as ServerStatusChannelInput);
  }

  public static async get(server: Server): Promise<ServerStatusChannel | null> {
    const statusChannel = await prisma.gm_server_status_channel.findFirst({
      where: {
        serverID: server.id,
      },
    });
    return statusChannel ? ServerStatusChannel.from(statusChannel) : {
      id: '',
      serverID: server.id,
      channelID: '',
      format: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  public static async create(server: Server, channelID: string, format: string): Promise<ServerStatusChannel> {
    const newChannel = await prisma.gm_server_status_channel.create({
      data: {
        serverID: server.id,
        channelID,
        format,
      },
    });
    return ServerStatusChannel.from(newChannel);
  }

  public static async update(server: Server, channelID: string, format: string): Promise<ServerStatusChannel> {
    const updatedChannel = await prisma.gm_server_status_channel.updateMany({
      where: {
        serverID: server.id,
      },
      data: {
        channelID,
        format,
        updatedAt: new Date(),
      },
    });
    return ServerStatusChannel.from(updatedChannel);
  }

  public static async delete(server: Server): Promise<void> {
    await prisma.gm_server_status_channel.deleteMany({
      where: {
        serverID: server.id,
      },
    });
    return;
  }
}