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

export interface FunctionDoc {
  name: string;
  description: string;
  parameters: ParameterDoc[];
  returns: string;
}

export const mathFunctionDocs: FunctionDoc[] = [
  {
    name: 'sin',
    description: 'Returns the sine of the given angle in degrees',
    parameters: [
      {
        name: 'value',
        description: 'Angle in degrees',
        type: 'number',
      },
    ],
    returns: 'number',
  },
  {
    name: 'cos',
    description: 'Returns the cosine of the given angle in degrees',
    parameters: [
      {
        name: 'value',
        description: 'Angle in degrees',
        type: 'number',
      },
    ],
    returns: 'number',
  },
  {
    name: 'tan',
    description: 'Returns the tangent of the given angle in degrees',
    parameters: [
      {
        name: 'value',
        description: 'Angle in degrees',
        type: 'number',
      },
    ],
    returns: 'number',
  },
  {
    name: 'asin',
    description: 'Returns the arcsine in degrees of the given value',
    parameters: [
      {
        name: 'value',
        description: 'Value between -1 and 1',
        type: 'number',
      },
    ],
    returns: 'number (degrees)',
  },
  {
    name: 'acos',
    description: 'Returns the arccosine in degrees of the given value',
    parameters: [
      {
        name: 'value',
        description: 'Value between -1 and 1',
        type: 'number',
      },
    ],
    returns: 'number (degrees)',
  },
  {
    name: 'atan',
    description: 'Returns the arctangent in degrees of the given value',
    parameters: [
      {
        name: 'value',
        description: 'Input value',
        type: 'number',
      },
    ],
    returns: 'number (degrees)',
  },
  {
    name: 'atan2',
    description: 'Returns the arctangent in degrees of y/x, using signs to determine quadrant',
    parameters: [
      {
        name: 'y',
        description: 'Y coordinate',
        type: 'number',
      },
      {
        name: 'x',
        description: 'X coordinate',
        type: 'number',
      },
    ],
    returns: 'number (degrees)',
  },
  {
    name: 'abs',
    description: 'Returns the absolute value of the input',
    parameters: [
      {
        name: 'value',
        description: 'Input value',
        type: 'number',
      },
    ],
    returns: 'number',
  },
  {
    name: 'floor',
    description: 'Returns the largest integer less than or equal to the input',
    parameters: [
      {
        name: 'value',
        description: 'Input value',
        type: 'number',
      },
    ],
    returns: 'number',
  },
  {
    name: 'ceil',
    description: 'Returns the smallest integer greater than or equal to the input',
    parameters: [
      {
        name: 'value',
        description: 'Input value',
        type: 'number',
      },
    ],
    returns: 'number',
  },
  {
    name: 'round',
    description: 'Returns the input rounded to the nearest integer',
    parameters: [
      {
        name: 'value',
        description: 'Input value',
        type: 'number',
      },
    ],
    returns: 'number',
  },
  {
    name: 'sqrt',
    description: 'Returns the square root of the input',
    parameters: [
      {
        name: 'value',
        description: 'Non-negative input value',
        type: 'number',
      },
    ],
    returns: 'number',
  },
  {
    name: 'pow',
    description: 'Returns base raised to the power of exponent',
    parameters: [
      {
        name: 'base',
        description: 'Base value',
        type: 'number',
      },
      {
        name: 'exponent',
        description: 'Exponent value',
        type: 'number',
      },
    ],
    returns: 'number',
  },
  {
    name: 'log',
    description: 'Returns the natural logarithm (base e) of the input',
    parameters: [
      {
        name: 'value',
        description: 'Positive input value',
        type: 'number',
      },
    ],
    returns: 'number',
  },
  {
    name: 'exp',
    description: 'Returns e raised to the power of the input',
    parameters: [
      {
        name: 'value',
        description: 'Input value',
        type: 'number',
      },
    ],
    returns: 'number',
  },
  {
    name: 'min',
    description: 'Returns the smallest of the given values',
    parameters: [
      {
        name: 'a',
        description: 'First value',
        type: 'number',
      },
      {
        name: 'b',
        description: 'Second value',
        type: 'number',
      },
    ],
    returns: 'number',
  },
  {
    name: 'max',
    description: 'Returns the largest of the given values',
    parameters: [
      {
        name: 'a',
        description: 'First value',
        type: 'number',
      },
      {
        name: 'b',
        description: 'Second value',
        type: 'number',
      },
    ],
    returns: 'number',
  },
];

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
    name: 'rotate',
    description: 'Rotates its children around the origin',
    parameters: [
      {
        name: 'angles',
        description: 'Rotation angles in degrees [x,y,z]',
        type: 'vector',
      },
    ],
  },
  {
    name: 'scale',
    description: 'Scales its children relative to the origin',
    parameters: [
      {
        name: 'factors',
        description: 'Scale factors [x,y,z] or single uniform scale',
        type: 'number | vector',
      },
    ],
  },
  {
    name: 'union',
    description: 'Combines all children (boolean OR operation)',
    parameters: [],
  },
  {
    name: 'difference',
    description: 'Subtracts all subsequent children from the first child',
    parameters: [],
  },
  {
    name: 'intersection',
    description: 'Keeps only the overlapping parts of all children (boolean AND)',
    parameters: [],
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
      {
        name: 'detail',
        description:
          'Detail level in the blend region (can be a percentage like 50% or ratio like 2x)',
        type: 'number | vector',
        defaultValue: '50%',
      },
    ],
  },
  {
    name: 'smooth_difference',
    description: 'Smoothly subtracts subsequent children from the first with blended edges',
    parameters: [
      {
        name: 'radius',
        description: 'Blend radius',
        type: 'number',
      },
      {
        name: 'detail',
        description:
          'Detail level in the blend region (can be a percentage like 50% or ratio like 2x)',
        type: 'number | vector',
        defaultValue: '50%',
      },
    ],
  },
  {
    name: 'smooth_intersection',
    description: 'Smoothly intersects all children with blended edges',
    parameters: [
      {
        name: 'radius',
        description: 'Blend radius',
        type: 'number',
      },
      {
        name: 'detail',
        description:
          'Detail level in the blend region (can be a percentage like 50% or ratio like 2x)',
        type: 'number | vector',
        defaultValue: '50%',
      },
    ],
  },
  {
    name: 'detail',
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

/**
 * Returns an array of all documented module names
 */
export function getAllModuleNames(): string[] {
  return builtinDocs.map((doc) => doc.name);
}

/**
 * Returns documentation for a math function
 */
export function getMathFunctionDoc(name: string): FunctionDoc | undefined {
  return mathFunctionDocs.find((doc) => doc.name === name);
}

/**
 * Returns an array of all documented math function names
 */
export function getAllMathFunctionNames(): string[] {
  return mathFunctionDocs.map((doc) => doc.name);
}
