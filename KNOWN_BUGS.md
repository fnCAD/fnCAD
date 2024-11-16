# Known Issues

## Rendering

### Downward View Distortion
When looking downward at steep angles, the scene appears to distort unnaturally. This may be related to:
- Ray direction calculation in the shader
- Field of view handling
- Camera matrix transformation issues

The effect is most noticeable when:
- Looking down at steep angles towards the floor
- Orbiting the camera to high elevation angles
- Moving the camera to positions above the scene

This is currently under investigation but does not impact the core functionality of the SDF preview.

## Raymarching

### Step Limit at Close Range
When moving very close to surfaces (especially the floor plane), the raymarcher can run out of steps before finding a surface intersection. This manifests as:
- Red debug coloring indicating max steps reached
- Missing geometry at very close range

Potential solutions to investigate:
- Adaptive step sizing
- Increasing max step count for close-range viewing
- Starting with smaller initial steps when near surfaces
