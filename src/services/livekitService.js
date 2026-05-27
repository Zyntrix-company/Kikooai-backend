import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

const DEFAULT_TOKEN_TTL_SECONDS = 60 * 60;
const DEFAULT_EMPTY_TIMEOUT_SECONDS = 10 * 60;
const DEFAULT_DEPARTURE_TIMEOUT_SECONDS = 2 * 60;

function missingLiveKitConfig() {
  return ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET']
    .filter((key) => !process.env[key]);
}

export function isLiveKitConfigured() {
  return missingLiveKitConfig().length === 0;
}

export function assertLiveKitConfigured() {
  const missing = missingLiveKitConfig();
  if (missing.length > 0) {
    const err = new Error(`LiveKit is not configured. Missing: ${missing.join(', ')}`);
    err.code = 'LIVEKIT_NOT_CONFIGURED';
    err.status = 503;
    throw err;
  }
}

export function getLiveKitUrl() {
  if (process.env.LIVEKIT_URL) return process.env.LIVEKIT_URL;
  if (process.env.NODE_ENV === 'test') return 'wss://test-livekit.local';
  assertLiveKitConfigured();
}

function getRoomClient() {
  assertLiveKitConfigured();
  return new RoomServiceClient(
    process.env.LIVEKIT_URL,
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET
  );
}

export async function ensureRoom(roomName, metadata = {}) {
  if (!isLiveKitConfigured()) {
    if (process.env.NODE_ENV === 'test') return { room_name: roomName, mocked: true };
    assertLiveKitConfigured();
  }

  const client = getRoomClient();
  try {
    await client.createRoom({
      name: roomName,
      emptyTimeout: DEFAULT_EMPTY_TIMEOUT_SECONDS,
      departureTimeout: DEFAULT_DEPARTURE_TIMEOUT_SECONDS,
      maxParticipants: 4,
      metadata: JSON.stringify(metadata),
    });
  } catch (err) {
    const message = String(err?.message || '');
    // LiveKit treats room creation as idempotent operationally; an existing room is usable.
    if (!message.toLowerCase().includes('already')) throw err;
  }

  return { room_name: roomName, mocked: false };
}

export async function createParticipantToken({
  roomName,
  identity,
  name,
  metadata = {},
  ttlSeconds = DEFAULT_TOKEN_TTL_SECONDS,
}) {
  if (!isLiveKitConfigured()) {
    if (process.env.NODE_ENV === 'test') {
      return {
        token: `test-livekit-token:${roomName}:${identity}`,
        expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      };
    }
    assertLiveKitConfigured();
  }

  const token = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    {
      identity,
      name,
      ttl: ttlSeconds,
      metadata: JSON.stringify(metadata),
    }
  );

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return {
    token: await token.toJwt(),
    expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
  };
}
