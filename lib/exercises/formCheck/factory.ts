import type { FormCheck } from "./types";
import { SidePlankFormCheck } from "./sidePlank";
import { HipBridgeFormCheck } from "./hipBridge";
import { BirdDogFormCheck } from "./birdDog";
import { LungeFormCheck } from "./lunge";
import { TStretchFormCheck } from "./tStretch";

// Phase 8: side plank + hip bridge.
// Phase 9: bird-dog, lunge, T-stretch.
const REGISTRY: Record<string, () => FormCheck> = {
  side_plank_convex_thoracic_side_down: () => new SidePlankFormCheck(),
  hip_bridge_pelvic_press_down: () => new HipBridgeFormCheck(),
  bird_dog_asymmetric_hold: () => new BirdDogFormCheck(),
  lunge_pelvic_tilt_back_leg_tiptoe: () => new LungeFormCheck(),
  t_stretch_neutral_spine: () => new TStretchFormCheck(),
};

export function getFormCheck(exerciseId: string): FormCheck | null {
  const factory = REGISTRY[exerciseId];
  return factory ? factory() : null;
}

export function hasFormCheck(exerciseId: string): boolean {
  return exerciseId in REGISTRY;
}

export function listFormCheckExercises(): string[] {
  return Object.keys(REGISTRY);
}
