export interface IncomingCallParams {
  CallSid: string;
  From: string;
  To: string;
  CallStatus?: string;
  Direction?: string;
  ForwardedFrom?: string;
}

export interface DialForwardParams {
  forwardToNumber: string;
  whisperMessage?: string;
  ringTimeoutSeconds?: number;
  actionUrl: string;
}

export interface SipRouteParams {
  sipEndpoint: string;
  // Sent as X- headers on the SIP INVITE so the voice AI webhook can correlate back to the Twilio call.
  sipHeaders?: Record<string, string>;
  actionUrl?: string;
  ringTimeoutSeconds?: number;
}

export interface ITelephonyProvider {
  buildForwardTwiML(params: DialForwardParams): string;
  buildSipHandoffTwiML(params: SipRouteParams): string;
  buildFailOpenTwiML(forwardToNumber: string): string;
  buildHangupTwiML(sayMessage?: string): string;
  buildRejectTwiML(): string;
  verifyWebhookSignature(url: string, params: Record<string, string>, signature: string): boolean;
}
