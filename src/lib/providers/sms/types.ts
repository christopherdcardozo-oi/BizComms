export interface SendSmsParams {
  to: string;
  from: string;
  body: string;
  // A2P 10DLC Messaging Service; when set it is used instead of `from` for carrier routing.
  messagingServiceSid?: string;
  statusCallback?: string;
}

export interface SendSmsResult {
  messageSid: string;
  status: 'queued' | 'sent' | 'failed';
  errorCode?: string;
  errorMessage?: string;
}

export interface ISmsProvider {
  sendSms(params: SendSmsParams): Promise<SendSmsResult>;
  verifyIncomingWebhookSignature(url: string, params: Record<string, string>, signature: string): boolean;
}
