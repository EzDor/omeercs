export interface ThemeConfig {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  background: {
    type: 'solid' | 'gradient' | 'image';
    value: string;
  };
  logoUrl?: string;
}

export interface CampaignAssetSlot {
  slotId: string;
  artifactId?: string;
  url?: string;
}

export interface CampaignConfig {
  theme: ThemeConfig;
  game: Record<string, unknown>;
  assets: CampaignAssetSlot[];
}
