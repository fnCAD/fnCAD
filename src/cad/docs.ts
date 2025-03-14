export interface ParameterDoc {
  name: string;
  description: string;
  defaultValue?: string | number;
  // number | vector is pretty common, so specialcased.
  // TODO fix this
  type: 'number' | 'boolean' | 'string' | 'vector' | 'number | vector';
}

export interface ModuleDoc {
  name: string;
  description: string;
  parameters: ParameterDoc[];
}

export const builtinDocs: ModuleDoc[] = [
  {
    name: 'sphere',
    description: 'Creates a sphere centered at the origin',
    parameters: [
      {
        name: 'radius',
        description: 'Radius of the sphere',
        type: 'number',
      },
    ],
  },
  {
    name: 'cube',
    description: 'Creates a cube centered at the origin',
    parameters: [
      {
        name: 'size',
        description: 'Length of cube sides (number) or [width,height,depth] vector',
        type: 'number | vector',
      },
    ],
  },
  {
    name: 'cylinder',
    description: 'Creates a cylinder centered at the origin along the Y axis',
    parameters: [
      {
        name: 'radius',
        description: 'Radius of the cylinder',
        type: 'number',
      },
      {
        name: 'height',
        description: 'Height of the cylinder',
        type: 'number',
      },
    ],
  },
  {
    name: 'cone',
    description: 'Creates a cone centered at the origin along the Y axis',
    parameters: [
      {
        name: 'radius',
        description: 'Base radius of the cone',
        type: 'number',
      },
      {
        name: 'height',
        description: 'Height of the cone',
        type: 'number',
      },
    ],
  },
  {
    name: 'translate',
    description: 'Translates its child by the given vector',
    parameters: [
      {
        name: 'vec',
        description: 'Translation vector [x,y,z]',
        type: 'vector',
      },
    ],
  },
  {
    name: 'smooth_union',
    description: 'Smoothly blends its children together',
    parameters: [
      {
        name: 'radius',
        description: 'Blend radius',
        type: 'number',
      },
    ],
  },
  {
    name: 'detailed',
    description: 'Sets minimum feature size for contained geometry',
    parameters: [
      {
        name: 'size',
        description: 'Minimum feature size',
        type: 'number',
        defaultValue: 0.1,
      },
    ],
  },
];

export function getModuleDoc(name: string): ModuleDoc | undefined {
  return builtinDocs.find((doc) => doc.name === name);
}
