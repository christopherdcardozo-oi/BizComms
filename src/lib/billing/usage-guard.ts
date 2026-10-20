export interface UsageQuotaCheck {
  allowed: boolean;
  reason?: string;
  voiceMinutesUsed: number;
  voiceMinutesLimit: number;
  smsSentCount: number;
  smsLimit: number;
}

export class UsageGuard {
  static checkVoiceQuota(usedMinutes: number, limitMinutes: number): UsageQuotaCheck {
    const allowed = usedMinutes < limitMinutes;
    return {
      allowed,
      reason: allowed ? undefined : `Monthly AI Voice minutes quota exceeded (${usedMinutes}/${limitMinutes} min).`,
      voiceMinutesUsed: usedMinutes,
      voiceMinutesLimit: limitMinutes,
      smsSentCount: 0,
      smsLimit: 0,
    };
  }

  static checkSmsQuota(usedSms: number, limitSms: number): UsageQuotaCheck {
    const allowed = usedSms < limitSms;
    return {
      allowed,
      reason: allowed ? undefined : `Monthly SMS quota exceeded (${usedSms}/${limitSms} messages).`,
      voiceMinutesUsed: 0,
      voiceMinutesLimit: 0,
      smsSentCount: usedSms,
      smsLimit: limitSms,
    };
  }
}
