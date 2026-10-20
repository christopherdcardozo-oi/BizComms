import twilio from 'twilio';

// Messaging webhook response: a single reply, or an empty <Response/> to acknowledge silently.
export function buildMessagingTwiML(reply?: string): string {
  const response = new twilio.twiml.MessagingResponse();
  if (reply) response.message(reply);
  return response.toString();
}
