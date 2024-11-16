# Known Issues

## Rendering

### Curved Horizon Effect
When viewing the scene from certain angles, the horizon/background appears to curve unnaturally. This may be related to:
- Ray direction calculation in the shader
- Field of view handling
- Ray marching step size adjustments

The effect is most noticeable when:
- Looking towards the horizon
- Viewing large flat surfaces at shallow angles
- Moving the camera to extreme positions

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
