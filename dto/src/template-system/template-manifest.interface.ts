export interface TemplateManifest {
  template_id: string;
  version: string;
  title: string;
  description: string;
  config_schema: Record<string, unknown>;
  asset_slots: AssetSlotDefinition[];
  scene_config: SceneConfig;
  entry_point: string;
}

export interface AssetSlotDefinition {
  slot_id: string;
  type: 'image' | 'audio' | 'model_3d' | 'texture' | 'environment_map';
  formats?: string[];
  required: boolean;
  default?: string;
  description?: string;
  max_size_bytes?: number;
}

export interface SceneConfig {
  camera: CameraConfig;
  lighting: LightingConfig;
  environment?: EnvironmentConfig;
  post_processing?: PostProcessingConfig;
}

export interface CameraConfig {
  type: 'perspective' | 'orthographic';
  fov: number;
  position: [number, number, number];
  look_at: [number, number, number];
}

export interface LightingConfig {
  ambient: {
    color: string;
    intensity: number;
  };
  directional?: DirectionalLightConfig[];
  point_lights?: PointLightConfig[];
  spot_lights?: SpotLightConfig[];
}

export interface DirectionalLightConfig {
  color: string;
  intensity: number;
  position: [number, number, number];
  cast_shadow?: boolean;
}

export interface PointLightConfig {
  color: string;
  intensity: number;
  position: [number, number, number];
  distance?: number;
  decay?: number;
}

export interface SpotLightConfig {
  color: string;
  intensity: number;
  position: [number, number, number];
  target?: [number, number, number];
  angle?: number;
  penumbra?: number;
  distance?: number;
  decay?: number;
  cast_shadow?: boolean;
}

export interface EnvironmentConfig {
  background_type?: 'color' | 'environment_map' | 'skybox';
  background_color?: string;
  environment_map_slot?: string;
}

export interface PostProcessingConfig {
  bloom?: {
    enabled: boolean;
    strength?: number;
    threshold?: number;
  };
  dof?: {
    enabled: boolean;
    focus?: number;
    aperture?: number;
    max_blur?: number;
  };
  fxaa?: {
    enabled: boolean;
  };
}
