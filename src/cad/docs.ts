export interface ParameterDoc {
  name: string;
  description: string;
  defaultValue?: string | number;
  type: 'number' | 'boolean' | 'string';
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
        type: 'number'
      }
    ]
  },
  {
    name: 'cube',
    description: 'Creates a cube centered at the origin',
    parameters: [
      {
        name: 'size',
        description: 'Length of cube sides',
        type: 'number'
      }
    ]
  },
  {
    name: 'cylinder',
    description: 'Creates a cylinder centered at the origin along the Y axis',
    parameters: [
      {
        name: 'radius',
        description: 'Radius of the cylinder',
        type: 'number'
      },
      {
        name: 'height',
        description: 'Height of the cylinder',
        type: 'number'
      }
    ]
  },
  {
    name: 'translate',
    description: 'Translates its child by the given vector',
    parameters: [
      {
        name: 'vec',
        description: 'Translation vector [x,y,z]',
        type: 'vector'
      }
    ]
  },
  {
    name: 'smooth_union',
    description: 'Smoothly blends its children together',
    parameters: [
      {
        name: 'radius',
        description: 'Blend radius',
        type: 'number'
      }
    ]
  }
];

export function getModuleDoc(name: string): ModuleDoc | undefined {
  return builtinDocs.find(doc => doc.name === name);
}
