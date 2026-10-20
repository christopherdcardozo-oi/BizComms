import twilio from 'twilio';
import { serverEnv } from '../../config/env';
import { DialForwardParams, ITelephonyProvider, SipRouteParams } from './types';

const { VoiceResponse } = twilio.twiml;

// TwiML is built with the SDK's VoiceResponse so every attribute and text node is XML-escaped.
export class TwilioTelephonyProvider implements ITelephonyProvider {
  buildForwardTwiML(params: DialForwardParams): string {
    const response = new VoiceResponse();
    const dial = response.dial({
      timeout: params.ringTimeoutSeconds ?? 15,
      action: params.actionUrl,
      method: 'POST',
    });
    dial.number(params.forwardToNumber);
    return response.toString();
  }

  buildSipHandoffTwiML(params: SipRouteParams): string {
    const response = new VoiceResponse();
    const dial = response.dial({
      ...(params.actionUrl ? { action: params.actionUrl, method: 'POST' as const } : {}),
      ...(params.ringTimeoutSeconds ? { timeout: params.ringTimeoutSeconds } : {}),
    });
    dial.sip(withSipHeaders(params.sipEndpoint, params.sipHeaders));
    return response.toString();
  }

  buildFailOpenTwiML(forwardToNumber: string): string {
    const response = new VoiceResponse();
    response.dial({ timeout: 30 }).number(forwardToNumber);
    return response.toString();
  }

  buildHangupTwiML(sayMessage?: string): string {
    const response = new VoiceResponse();
    if (sayMessage) response.say(sayMessage);
    response.hangup();
    return response.toString();
  }

  buildRejectTwiML(): string {
    const response = new VoiceResponse();
    response.reject();
    return response.toString();
  }

  verifyWebhookSignature(url: string, params: Record<string, string>, signature: string): boolean {
    const authToken = serverEnv.twilioAuthToken();
    if (!authToken || !signature) return false;
    return twilio.validateRequest(authToken, signature, url, params);
  }
}

// Twilio forwards `?X-Name=value` URI parameters on <Sip> as custom SIP headers (must be X- prefixed).
function withSipHeaders(sipUri: string, headers?: Record<string, string>): string {
  if (!headers || Object.keys(headers).length === 0) return sipUri;
  const query = Object.entries(headers)
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join('&');
  return `${sipUri}${sipUri.includes('?') ? '&' : '?'}${query}`;
}
