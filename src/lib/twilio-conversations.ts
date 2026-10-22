import "server-only";

import twilio from "twilio";

function getTwilioConversations() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const apiKeySid = process.env.TWILIO_API_KEY?.trim();
  const apiKeySecret = process.env.TWILIO_API_SECRET?.trim();
  const serviceSid = process.env.TWILIO_CONVERSATIONS_SERVICE_SID?.trim();
  if (!accountSid || !apiKeySid || !apiKeySecret || !serviceSid) throw new Error("Twilio Conversations is not configured.");
  return {
    serviceSid,
    service: twilio(apiKeySid, apiKeySecret, { accountSid }).conversations.v1.services(serviceSid),
  };
}

export function twilioConversationsReady() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID?.trim() && process.env.TWILIO_API_KEY?.trim() && process.env.TWILIO_API_SECRET?.trim() && process.env.TWILIO_CONVERSATIONS_SERVICE_SID?.trim());
}

export function createFundedVideoToken(userId: string, roomSid: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const apiKeySid = process.env.TWILIO_API_KEY?.trim();
  const apiKeySecret = process.env.TWILIO_API_SECRET?.trim();
  if (!accountSid || !apiKeySid || !apiKeySecret || process.env.TWILIO_VIDEO_API_KEY_REGION?.trim().toLowerCase() !== "us1") {
    throw new Error("Twilio Video is not configured with a US1 API key.");
  }
  const token = new twilio.jwt.AccessToken(accountSid, apiKeySid, apiKeySecret, { identity: userId, ttl: 1800 });
  token.addGrant(new twilio.jwt.AccessToken.VideoGrant({ room: roomSid }));
  return token.toJwt();
}

export async function ensureTwilioConversation(uniqueName: string, participantIds: string[]) {
  const { service } = getTwilioConversations();
  let conversation;
  try {
    conversation = await service.conversations.create({ uniqueName, friendlyName: "Private conversation", attributes: "{}" });
  } catch {
    // A repeated request or concurrent insert can reach the same provider
    // uniqueName. Fetching that exact name avoids creating a second room.
    conversation = await service.conversations(uniqueName).fetch();
  }

  const participants = service.conversations(conversation.sid).participants;
  const existing = await participants.list({ limit: 100 });
  const identities = new Set(existing.map((participant) => participant.identity).filter((identity): identity is string => Boolean(identity)));
  for (const identity of participantIds) {
    if (!identities.has(identity)) await participants.create({ identity });
  }
  return conversation.sid;
}

export async function sendTwilioConversationMessage(input: { conversationSid: string; senderId: string; body: string; requestId: string }) {
  const { service } = getTwilioConversations();
  const message = await service.conversations(input.conversationSid).messages.create({
    author: input.senderId,
    body: input.body,
    attributes: JSON.stringify({ clientRequestId: input.requestId }),
    xTwilioWebhookEnabled: "true",
  });
  return { sid: message.sid, createdAt: message.dateCreated };
}
