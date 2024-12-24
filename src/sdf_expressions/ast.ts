import { Interval } from '../interval';
import { GLSLContext } from './glslgen';
import { Vector3 } from 'three';

export interface Node {
  evaluate(point: Vector3): number;
  toGLSL(context: GLSLContext): string;
  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval;
}
