import type { IVoiceAiProvider, ProvisionedReceptionist, ReceptionistConfig } from './types';

export class MockVoiceAiProvider implements IVoiceAiProvider {
  upserts: Array<{ config: ReceptionistConfig; existing?: { assistantId: string | null; phoneNumberId: string | null } }> = [];

  async upsertReceptionist(
    config: ReceptionistConfig,
    existing?: { assistantId: string | null; phoneNumberId: string | null }
  ): Promise<ProvisionedReceptionist> {
    this.upserts.push({ config, existing });
    return {
      assistantId: existing?.assistantId ?? `vapi_ast_mock_${config.organizationId}`,
      phoneNumberId: existing?.phoneNumberId ?? `vapi_pn_mock_${config.organizationId}`,
    };
  }
}
