import { Query } from '../../classes/db/Query.js';
import { GmodErrors, getErrorsByServer } from '@gmod/domain-gmod/GmodErrors.js';

export class InvalidErrorPayloadError extends Error {
  constructor() {
    super('Invalid error data');
    this.name = 'InvalidErrorPayloadError';
  }
}

export class InvalidQueryParametersError extends Error {
  constructor() {
    super('Invalid query parameters');
    this.name = 'InvalidQueryParametersError';
  }
}

export async function reportGmodErrorPayload(
  body: any,
  params: {
    serverID: string;
    steamID64: string;
  },
) {
  const { error, stack, id, name, realm, uptime, count } = body;
  const { serverID, steamID64 } = params;

  let parsedError: GmodErrors;
  try {
    parsedError = GmodErrors.from({
      error,
      stack: JSON.stringify(stack),
      workshopID: id,
      name,
      realm,
      uptime,
      count,
      serverID,
      steamID64,
    });
  } catch {
    throw new InvalidErrorPayloadError();
  }

  return await parsedError.save();
}

export async function reportGmodErrorPayloadSafe(
  body: any,
  params: {
    serverID: string;
    steamID64: string;
  },
) {
  try {
    return {
      status: 200,
      body: await reportGmodErrorPayload(body, params),
    };
  } catch (error) {
    if (error instanceof InvalidErrorPayloadError) {
      return {
        status: 400,
        body: { error: 'Invalid error data' },
      };
    }
    throw error;
  }
}

export async function getServerErrorsPayload(rawQuery: unknown, serverID: string) {
  let query: Query;
  try {
    query = Query.from(rawQuery);
  } catch {
    throw new InvalidQueryParametersError();
  }

  return (await getErrorsByServer(query, serverID)) || [];
}

export async function getServerErrorsPayloadSafe(rawQuery: unknown, serverID: string) {
  try {
    return {
      status: 200,
      body: await getServerErrorsPayload(rawQuery, serverID),
    };
  } catch (error) {
    if (error instanceof InvalidQueryParametersError) {
      return {
        status: 400,
        body: { error: 'Invalid query parameters' },
      };
    }
    throw error;
  }
}
